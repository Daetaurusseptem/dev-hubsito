use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const FIRST_API_PORT: u16 = 4173;
const LAST_API_PORT: u16 = 4199;

struct HubRuntime {
    port: u16,
    _child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn get_api_port(runtime: State<'_, HubRuntime>) -> u16 {
    runtime.port
}

fn server_matches(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(280)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
    if stream
        .write_all(b"GET /api/bootstrap HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.contains("\"desktopMode\":true")
        && response.contains(concat!("\"serverVersion\":\"", env!("CARGO_PKG_VERSION"), "\""))
}

fn available_port() -> Option<u16> {
    (FIRST_API_PORT..=LAST_API_PORT).find(|port| {
        !server_matches(*port) && TcpListener::bind(("127.0.0.1", *port)).is_ok()
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_api_port])
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

            let existing_port = (FIRST_API_PORT..=LAST_API_PORT).find(|port| server_matches(*port));
            let mut child = None;
            let port = if let Some(port) = existing_port {
                port
            } else {
                let port = available_port().ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::AddrNotAvailable, "No hay un puerto disponible para DevHubsito")
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
                child = Some(spawned_child);
                let mut ready = false;
                for _ in 0..30 {
                    if server_matches(port) {
                        ready = true;
                        break;
                    }
                    thread::sleep(Duration::from_millis(120));
                }
                if !ready {
                    return Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "El servidor de DevHubsito no respondió").into());
                }
                port
            };

            app.manage(HubRuntime { port, _child: Mutex::new(child) });

            if std::env::args().any(|arg| arg == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("DevHubsito could not start");
}
