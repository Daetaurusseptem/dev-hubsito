use std::{
    fs,
    net::TcpListener,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const FIRST_API_PORT: u16 = 4173;
const LAST_API_PORT: u16 = 4199;

struct HubRuntime {
    port: u16,
    _child: Mutex<Option<CommandChild>>,
    shutdown_requested: AtomicBool,
    allow_exit: AtomicBool,
}

#[tauri::command]
fn get_api_port(runtime: State<'_, HubRuntime>) -> u16 {
    runtime.port
}

#[tauri::command]
fn complete_shutdown(app: AppHandle, runtime: State<'_, HubRuntime>) {
    runtime.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn request_shutdown(app: &AppHandle) {
    let runtime = app.state::<HubRuntime>();
    if runtime.shutdown_requested.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit("shutdown-requested", ());
    let fallback_app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(12));
        let runtime = fallback_app.state::<HubRuntime>();
        if !runtime.allow_exit.swap(true, Ordering::SeqCst) {
            fallback_app.exit(0);
        }
    });
}

fn available_port() -> Option<u16> {
    (FIRST_API_PORT..=LAST_API_PORT).find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_api_port, complete_shutdown])
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;

            let port = available_port().ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::AddrNotAvailable,
                    "No hay un puerto disponible para DevHubsito",
                )
            })?;
            let public_dir = app.path().resource_dir()?.join("public");
            let mut command = app
                .shell()
                .sidecar("devhubsito-server")?
                .env("DEVHUBSITO_DESKTOP", "1")
                .env("DEVHUBSITO_SERVER_VERSION", env!("CARGO_PKG_VERSION"))
                .env("DEV_HUB_PORT", port.to_string())
                .env("DEVHUBSITO_DATA_DIR", data_dir.as_os_str())
                .env("DEVHUBSITO_PUBLIC_DIR", public_dir.as_os_str());

            if let Ok(home) = app.path().home_dir() {
                command = command.env("DEV_HUB_ALLOWED_ROOTS", home.as_os_str());
                let bun: PathBuf = home.join(".bun").join("bin").join("bun.exe");
                if bun.exists() {
                    command = command.env("BUN_BIN", bun.as_os_str());
                }
            }
            let (_events, spawned_child) = command.spawn()?;

            app.manage(HubRuntime {
                port,
                _child: Mutex::new(Some(spawned_child)),
                shutdown_requested: AtomicBool::new(false),
                allow_exit: AtomicBool::new(false),
            });

            if let Some(window) = app.get_webview_window("main") {
                if std::env::args().any(|arg| arg == "--autostart") {
                    window.hide()?;
                } else {
                    window.show()?;
                    window.set_focus()?;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("DevHubsito could not start")
        .run(|app, event| match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                let runtime = app.state::<HubRuntime>();
                if !runtime.allow_exit.load(Ordering::SeqCst) {
                    api.prevent_close();
                    request_shutdown(app);
                }
            }
            tauri::RunEvent::ExitRequested { api, .. } => {
                let runtime = app.state::<HubRuntime>();
                if !runtime.allow_exit.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_shutdown(app);
                }
            }
            tauri::RunEvent::Exit => {
                let runtime = app.state::<HubRuntime>();
                if let Ok(mut child) = runtime._child.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                };
            }
            _ => {}
        });
}
