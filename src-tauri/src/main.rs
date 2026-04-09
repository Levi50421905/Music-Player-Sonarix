// src-tauri/src/main.rs
// ─────────────────────────────────────────────────────────────────────────────
// WHY Rust backend di Tauri:
//   - Akses file system native (lebih cepat dari browser FS API)
//   - Global shortcut (media keys) harus diregister di OS level
//   - System tray tidak bisa dari browser context
//   - FLAC/high-res audio bisa di-serve langsung tanpa transcoding

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

fn main() {
    tauri::Builder::default()
        // ── Plugins ──────────────────────────────────────────────────────────
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:resonance.db", vec![])
            .build()
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([
                "MediaPlayPause",
                "MediaNextTrack",
                "MediaPreviousTrack",
                "MediaStop",
            ])
            .unwrap()
            .with_handler(|app, shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Kirim event ke frontend via emit
                    let event_name = match shortcut.key().as_str() {
                        "MediaPlayPause"     => "media:playpause",
                        "MediaNextTrack"     => "media:next",
                        "MediaPreviousTrack" => "media:prev",
                        "MediaStop"          => "media:stop",
                        _                    => return,
                    };
                    let _ = app.emit(event_name, ());
                }
            })
            .build()
        )
        // ── Custom commands ───────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            open_file_manager,
        ])
        // ── Setup ─────────────────────────────────────────────────────────────
        .setup(|app| {
            // System Tray
            let quit   = MenuItem::with_id(app, "quit",   "Quit Resonance", true, None::<&str>)?;
            let show   = MenuItem::with_id(app, "show",   "Show Window",    true, None::<&str>)?;
            let menu   = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── Custom commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn open_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}