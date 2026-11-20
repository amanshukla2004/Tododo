use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Manages database initialization, migrations, and shared connection state.
pub struct Database;

impl Database {
    /// Resolves the SQLite file path inside OS AppData folder (%APPDATA%/com.tododo.desktop/tododo.db) with safe fallback
    pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
        if let Ok(app_dir) = app.path().app_data_dir() {
            if fs::create_dir_all(&app_dir).is_ok() {
                let db_path = app_dir.join("tododo.db");
                if Connection::open(&db_path).is_ok() {
                    return Ok(db_path);
                }
            }
        }

        if let Ok(local_dir) = app.path().app_local_data_dir() {
            if fs::create_dir_all(&local_dir).is_ok() {
                let db_path = local_dir.join("tododo.db");
                if Connection::open(&db_path).is_ok() {
                    return Ok(db_path);
                }
            }
        }

        // Fallback to current working directory
        let fallback_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        Ok(fallback_dir.join("tododo.db"))
    }

    /// Initializes SQLite connection and applies migrations up to current version
    pub fn init(app: &AppHandle) -> Result<Connection, String> {
        let db_path = Self::get_db_path(app)?;
        let mut conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

        // Enable Write-Ahead Logging (WAL) for speed and concurrency
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| format!("Failed to set journal_mode: {}", e))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        Self::migrate(&mut conn)?;
        Ok(conn)
    }

    /// Incremental migration engine using schema_version table
    pub fn migrate(conn: &mut Connection) -> Result<(), String> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
            [],
        )
        .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Version 1: Core tables
        if current_version < 1 {
            let tx = conn
                .transaction()
                .map_err(|e| format!("Failed to start migration transaction: {}", e))?;

            tx.execute_batch(
                "
                -- Lists table (Work, Study, Personal, etc.)
                CREATE TABLE IF NOT EXISTS lists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '#6366f1',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Tasks table
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    done INTEGER NOT NULL DEFAULT 0,
                    done_at TEXT,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    priority INTEGER NOT NULL DEFAULT 0, -- 0 low, 1 medium, 2 high
                    due_at TEXT, -- ISO datetime
                    reminder_offset_min INTEGER,
                    snoozed_until TEXT,
                    list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
                    repeat_rule TEXT NOT NULL DEFAULT 'none', -- none, daily, weekly, custom
                    sort_order REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Tags & junction
                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE
                );

                CREATE TABLE IF NOT EXISTS task_tags (
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                    PRIMARY KEY (task_id, tag_id)
                );

                -- Subtasks
                CREATE TABLE IF NOT EXISTS subtasks (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    done INTEGER NOT NULL DEFAULT 0,
                    sort_order REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                -- Pomodoro focus sessions
                CREATE TABLE IF NOT EXISTS pomodoro_sessions (
                    id TEXT PRIMARY KEY,
                    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
                    started_at TEXT NOT NULL DEFAULT (datetime('now')),
                    minutes INTEGER NOT NULL DEFAULT 25
                );

                -- Key-value settings table
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                -- Seed default lists
                INSERT OR IGNORE INTO lists (id, name, color) VALUES
                    ('list_personal', 'Personal', '#6366f1'),
                    ('list_work', 'Work', '#10b981'),
                    ('list_study', 'Study', '#f59e0b');

                -- Seed starter tasks
                INSERT OR IGNORE INTO tasks (id, title, notes, done, pinned, priority, due_at, list_id, repeat_rule, sort_order) VALUES
                    ('task_welcome_1', 'Welcome to Tododo! Press Enter to add a new task', 'You can type !high or !med when creating tasks.', 0, 1, 1, NULL, 'list_personal', 'none', -2.0),
                    ('task_welcome_2', 'Click any task for notes, subtasks, & Pomodoro focus', 'Try out the timer or add steps to complete.', 0, 0, 0, NULL, 'list_work', 'none', -1.0);

                -- Seed default settings
                INSERT OR IGNORE INTO settings (key, value) VALUES
                    ('theme', 'dark'),
                    ('density', 'comfortable'),
                    ('opacity', '85'),
                    ('accent_color', '#6366f1'),
                    ('sound_enabled', 'true'),
                    ('window_mode', 'expanded'),
                    ('always_on_top', 'true');

                -- Record version 1
                INSERT INTO schema_version (version, applied_at)
                VALUES (1, datetime('now'));
                ",
            )
            .map_err(|e| format!("Failed to apply migration v1: {}", e))?;

            tx.commit()
                .map_err(|e| format!("Failed to commit migration v1: {}", e))?;
        }

        // Version 2: Ensure starter tasks exist
        if current_version < 2 {
            let tx = conn
                .transaction()
                .map_err(|e| format!("Failed to start migration transaction: {}", e))?;

            tx.execute_batch(
                "
                INSERT OR IGNORE INTO tasks (id, title, notes, done, pinned, priority, due_at, list_id, repeat_rule, sort_order) VALUES
                    ('task_welcome_1', 'Welcome to Tododo! Press Enter to add a new task', 'You can type !high or !med when creating tasks.', 0, 1, 1, NULL, 'list_personal', 'none', -2.0),
                    ('task_welcome_2', 'Click any task for notes, subtasks, & Pomodoro focus', 'Try out the timer or add steps to complete.', 0, 0, 0, NULL, 'list_work', 'none', -1.0);

                INSERT INTO schema_version (version, applied_at)
                VALUES (2, datetime('now'));
                ",
            )
            .map_err(|e| format!("Failed to apply migration v2: {}", e))?;

            tx.commit()
                .map_err(|e| format!("Failed to commit migration v2: {}", e))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn test_db_migration_and_crud() {
        let mut conn = Connection::open_in_memory().unwrap();
        Database::migrate(&mut conn).unwrap();

        // 1. Test task insertion (the exact query from add_task)
        let id = "task_test_1";
        let title = "Test task";
        let prio = 2;
        let due_at: Option<String> = None;
        let list_id: Option<String> = None;
        let new_order = -1.0;

        let insert_res = conn.execute(
            "INSERT INTO tasks (id, title, notes, done, pinned, priority, due_at, list_id, repeat_rule, sort_order)
             VALUES (?, ?, '', 0, 0, ?, ?, ?, 'none', ?)",
            params![id, title.trim(), prio, due_at, list_id, new_order],
        );
        assert!(insert_res.is_ok(), "Insert failed: {:?}", insert_res.err());

        // 2. Query task back
        let (fetched_id, fetched_title, fetched_prio): (String, String, i64) = conn
            .query_row(
                "SELECT id, title, priority FROM tasks WHERE id = ?",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(fetched_id, id);
        assert_eq!(fetched_title, title);
        assert_eq!(fetched_prio, prio);

        // 3. Toggle task done
        let toggle_res = conn.execute(
            "UPDATE tasks SET done = 1, done_at = datetime('now') WHERE id = ?",
            params![id],
        );
        assert!(toggle_res.is_ok());

        // 4. Subtasks
        let sub_res = conn.execute(
            "INSERT INTO subtasks (id, task_id, title, done, sort_order) VALUES (?, ?, ?, 0, 0.0)",
            params!["sub_1", id, "Subtask 1"],
        );
        assert!(sub_res.is_ok());
    }
}
