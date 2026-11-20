use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Background reminder tick worker checking due dates every 30 seconds
pub fn start_reminder_worker(app: AppHandle, conn_mutex: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(30));

            let lock_res = conn_mutex.lock();
            if let Ok(conn) = lock_res {
                // Find pending tasks that have reached their due time
                let stmt_res = conn.prepare(
                    "SELECT id, title FROM tasks
                     WHERE done = 0
                       AND due_at IS NOT NULL
                       AND datetime(due_at) <= datetime('now')
                       AND (snoozed_until IS NULL OR datetime(snoozed_until) <= datetime('now'))
                     LIMIT 5",
                );

                if let Ok(mut stmt) = stmt_res {
                    let task_rows = stmt.query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    });

                    if let Ok(tasks) = task_rows {
                        for t in tasks.flatten() {
                            let (id, title) = t;
                            // Emit desktop notification event to frontend
                            let _ = app.emit("task-due-reminder", serde_json::json!({
                                "id": id,
                                "title": title
                            }));
                        }
                    }
                }
            }
        }
    });
}
