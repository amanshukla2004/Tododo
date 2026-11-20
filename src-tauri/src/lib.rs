pub mod commands;
pub mod db;
pub mod models;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize SQLite database and migrations
            let conn = db::Database::init(&app.handle())
                .expect("Failed to initialize SQLite database");

            // Register shared Mutex<Connection> in Tauri managed state
            app.manage(Mutex::new(conn));

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
            commands::export_data,
            commands::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
