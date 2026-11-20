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

            // Intercept window close to hide to tray instead of quitting
            if let Some(main_window) = app.get_webview_window("main") {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
