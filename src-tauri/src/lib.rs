pub mod commands;
pub mod db;
pub mod models;
pub mod reminders;
pub mod tray;

use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance enforcement: prevents duplicate windows and focuses existing widget on pinned taskbar click
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Initialize SQLite database and migrations
            let conn = db::Database::init(&app.handle())
                .expect("Failed to initialize SQLite database");

            let shared_conn = Arc::new(Mutex::new(conn));

            // Register shared Mutex<Connection> in Tauri managed state
            app.manage(shared_conn.clone());

            // Start background reminder tick worker (checks every 30s)
            reminders::start_reminder_worker(app.handle().clone(), shared_conn);

            // Setup Windows System Tray
            tray::setup_tray(&app.handle())
                .expect("Failed to setup system tray");

            // Configure desktop wallpaper widget placement & behavior
            if let Some(main_window) = app.get_webview_window("main") {
                // Ensure the window resides on the desktop background layer (behind active apps)
                let _ = main_window.set_always_on_bottom(true);

                // Place widget naturally in the top-right desktop workspace
                if let Ok(Some(monitor)) = app.handle().primary_monitor() {
                    let m_pos = monitor.position();
                    let m_size = monitor.size();
                    let scale = monitor.scale_factor();
                    let widget_width_px = (350.0 * scale) as i32;
                    let margin_x = (48.0 * scale) as i32;
                    let margin_y = (64.0 * scale) as i32;
                    let x = m_pos.x + (m_size.width as i32) - widget_width_px - margin_x;
                    let y = m_pos.y + margin_y;
                    let _ = main_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                }

                // Intercept window close to hide to tray instead of quitting
                let win_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::add_task,
            commands::toggle_task,
            commands::update_task,
            commands::delete_task,
            commands::clear_completed,
            commands::reorder_tasks,
            commands::get_lists,
            commands::get_subtasks,
            commands::add_subtask,
            commands::toggle_subtask,
            commands::delete_subtask,
            commands::get_settings,
            commands::save_setting,
            commands::snooze_task,
            commands::export_data,
            commands::import_data,
            commands::set_window_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
