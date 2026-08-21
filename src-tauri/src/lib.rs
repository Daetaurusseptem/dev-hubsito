use std::{fs, net::{SocketAddr, TcpStream}, path::PathBuf, time::Duration};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_shell::ShellExt;

fn hub_is_running() -> bool {
    let address: SocketAddr = "127.0.0.1:4173".parse().expect("valid DevHubsito address");
    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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

            if !hub_is_running() {
                let public_dir = app.path().resource_dir()?.join("public");
                let mut command = app
                    .shell()
                    .sidecar("devhubsito-server")?
                    .env("DEVHUBSITO_DESKTOP", "1")
                    .env("DEVHUBSITO_DATA_DIR", data_dir.as_os_str())
                    .env("DEVHUBSITO_PUBLIC_DIR", public_dir.as_os_str());

                if let Some(home) = app.path().home_dir().ok() {
                    command = command.env("DEV_HUB_ALLOWED_ROOTS", home.as_os_str());
                    let bun: PathBuf = home.join(".bun").join("bin").join("bun.exe");
                    if bun.exists() {
                        command = command.env("BUN_BIN", bun.as_os_str());
                    }
                }
                let (_events, _child) = command.spawn()?;
            }

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
