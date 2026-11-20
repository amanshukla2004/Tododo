use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Manages database initialization, migrations, and shared connection state.
pub struct Database;

impl Database {
    /// Resolves the SQLite file path inside OS AppData folder (%APPDATA%/com.tododo.app/tododo.db)
    pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        if !app_dir.exists() {
            fs::create_dir_all(&app_dir)
                .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        }

        Ok(app_dir.join("tododo.db"))
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
    fn migrate(conn: &mut Connection) -> Result<(), String> {
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

        Ok(())
    }
}
