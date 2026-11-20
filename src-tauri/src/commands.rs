use crate::models::{ExportPayload, List, Subtask, Task};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

type DbState<'a> = State<'a, Mutex<Connection>>;

/// Fetch tasks matching a filter view: "today", "upcoming", "all", "completed", "overdue", or list_id
#[tauri::command]
pub fn get_tasks(state: DbState, filter: Option<String>) -> Result<Vec<Task>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    let filter_val = filter.unwrap_or_else(|| "all".to_string());
    let mut query = String::from(
        "SELECT t.id, t.title, t.notes, t.done, t.done_at, t.pinned, t.priority,
                t.due_at, t.reminder_offset_min, t.snoozed_until, t.list_id,
                t.repeat_rule, t.sort_order, t.created_at,
                (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as subtask_count,
                (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) as subtasks_done
         FROM tasks t "
    );

    let where_clause = match filter_val.as_str() {
        "today" => "WHERE t.done = 0 AND (t.due_at IS NULL OR date(t.due_at) <= date('now'))",
        "upcoming" => "WHERE t.done = 0 AND date(t.due_at) > date('now') AND date(t.due_at) <= date('now', '+7 days')",
        "overdue" => "WHERE t.done = 0 AND t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now')",
        "completed" => "WHERE t.done = 1",
        "all" => "WHERE t.done = 0",
        list if list.starts_with("list_") => "WHERE t.done = 0 AND t.list_id = ?",
        _ => "WHERE t.done = 0",
    };

    query.push_str(where_clause);
    query.push_str(" ORDER BY t.pinned DESC, t.sort_order ASC, t.created_at DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let task_iter = if filter_val.starts_with("list_") {
        stmt.query_map(params![filter_val], map_task_row)
    } else {
        stmt.query_map([], map_task_row)
    }
    .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for task in task_iter {
        tasks.push(task.map_err(|e| e.to_string())?);
    }

    Ok(tasks)
}

fn map_task_row(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    let done_int: i64 = row.get(3)?;
    let pinned_int: i64 = row.get(5)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        done: done_int == 1,
        done_at: row.get(4)?,
        pinned: pinned_int == 1,
        priority: row.get(6)?,
        due_at: row.get(7)?,
        reminder_offset_min: row.get(8)?,
        snoozed_until: row.get(9)?,
        list_id: row.get(10)?,
        repeat_rule: row.get(11)?,
        sort_order: row.get(12)?,
        created_at: row.get(13)?,
        subtask_count: row.get(14)?,
        subtasks_done: row.get(15)?,
    })
}

/// Add a new task (auto-generates UUID-like timestamp id and highest sort order)
#[tauri::command]
pub fn add_task(
    state: DbState,
    title: String,
    priority: Option<i64>,
    list_id: Option<String>,
    due_at: Option<String>,
) -> Result<Task, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = format!("task_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    let prio = priority.unwrap_or(0);
    let min_order: f64 = conn
        .query_row("SELECT COALESCE(MIN(sort_order), 0.0) FROM tasks", [], |r| r.get(0))
        .unwrap_or(0.0);
    let new_order = min_order - 1.0;

    conn.execute(
        "INSERT INTO tasks (id, title, notes, done, pinned, priority, due_at, list_id, repeat_rule, sort_order)
         VALUES (?, ?, '', 0, 0, ?, ?, 'none', ?)",
        params![id, title.trim(), prio, due_at, list_id, new_order],
    )
    .map_err(|e| e.to_string())?;

    // Return the inserted task
    let mut stmt = conn.prepare(
        "SELECT id, title, notes, done, done_at, pinned, priority,
                due_at, reminder_offset_min, snoozed_until, list_id,
                repeat_rule, sort_order, created_at, 0, 0
         FROM tasks WHERE id = ?"
    ).map_err(|e| e.to_string())?;

    let task = stmt.query_row(params![id], map_task_row).map_err(|e| e.to_string())?;
    Ok(task)
}

/// Toggle task completion status (and auto-spawns next recurring task if repeat_rule is set)
#[tauri::command]
pub fn toggle_task(state: DbState, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    let row_data: (i64, String, String, Option<String>, i64, Option<String>) = conn
        .query_row(
            "SELECT done, title, repeat_rule, due_at, priority, list_id FROM tasks WHERE id = ?",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .map_err(|e| e.to_string())?;

    let (is_done, title, repeat_rule, due_at, prio, list_id) = row_data;
    let new_done = if is_done == 1 { 0 } else { 1 };
    let done_at: Option<String> = if new_done == 1 {
        Some(chrono_now_iso())
    } else {
        None
    };

    conn.execute(
        "UPDATE tasks SET done = ?, done_at = ? WHERE id = ?",
        params![new_done, done_at, id],
    )
    .map_err(|e| e.to_string())?;

    // If completing a recurring task, automatically generate the next occurrence!
    if new_done == 1 && repeat_rule != "none" {
        let next_due_modifier = match repeat_rule.as_str() {
            "daily" => "+1 day",
            "weekly" => "+7 days",
            _ => "+1 day",
        };

        let next_id = format!("task_{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis());

        conn.execute(
            "INSERT INTO tasks (id, title, notes, done, pinned, priority, due_at, list_id, repeat_rule, sort_order)
             VALUES (?, ?, '', 0, 0, ?, datetime(COALESCE(?, datetime('now')), ?), ?, ?, 0.0)",
            params![next_id, title, prio, due_at, next_due_modifier, list_id, repeat_rule],
        ).map_err(|e| e.to_string())?;
    }

    Ok(new_done == 1)
}

/// Snooze a task reminder by N minutes
#[tauri::command]
pub fn snooze_task(state: DbState, id: String, minutes: i64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let modifier = format!("+{} minutes", minutes);
    conn.execute(
        "UPDATE tasks SET snoozed_until = datetime('now', ?) WHERE id = ?",
        params![modifier, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Update full task details
#[tauri::command]
pub fn update_task(
    state: DbState,
    id: String,
    title: Option<String>,
    notes: Option<String>,
    priority: Option<i64>,
    due_at: Option<String>,
    list_id: Option<String>,
    pinned: Option<bool>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;

    if let Some(t) = title {
        conn.execute("UPDATE tasks SET title = ? WHERE id = ?", params![t.trim(), id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(n) = notes {
        conn.execute("UPDATE tasks SET notes = ? WHERE id = ?", params![n, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(p) = priority {
        conn.execute("UPDATE tasks SET priority = ? WHERE id = ?", params![p, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(d) = due_at {
        let val = if d.trim().is_empty() { None } else { Some(d) };
        conn.execute("UPDATE tasks SET due_at = ? WHERE id = ?", params![val, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(l) = list_id {
        let val = if l.trim().is_empty() { None } else { Some(l) };
        conn.execute("UPDATE tasks SET list_id = ? WHERE id = ?", params![val, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(pin) = pinned {
        let p_int = if pin { 1 } else { 0 };
        conn.execute("UPDATE tasks SET pinned = ? WHERE id = ?", params![p_int, id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Delete a task
#[tauri::command]
pub fn delete_task(state: DbState, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Clear all completed tasks
#[tauri::command]
pub fn clear_completed(state: DbState) -> Result<usize, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM tasks WHERE done = 1", [])
        .map_err(|e| e.to_string())?;
    Ok(affected)
}

/// Reorder tasks by persisting sort_order
#[tauri::command]
pub fn reorder_tasks(state: DbState, task_ids: Vec<String>) -> Result<(), String> {
    let mut conn = state.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (index, id) in task_ids.iter().enumerate() {
        let order = index as f64;
        tx.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", params![order, id])
            .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Fetch all lists with live task counts
#[tauri::command]
pub fn get_lists(state: DbState) -> Result<Vec<List>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT l.id, l.name, l.color, l.created_at,
                (SELECT COUNT(*) FROM tasks t WHERE t.list_id = l.id AND t.done = 0) as task_count
         FROM lists l ORDER BY l.name ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        Ok(List {
            id: r.get(0)?,
            name: r.get(1)?,
            color: r.get(2)?,
            created_at: r.get(3)?,
            task_count: r.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut lists = Vec::new();
    for row in rows {
        lists.push(row.map_err(|e| e.to_string())?);
    }
    Ok(lists)
}

/// Subtasks CRUD
#[tauri::command]
pub fn get_subtasks(state: DbState, task_id: String) -> Result<Vec<Subtask>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, task_id, title, done, sort_order, created_at
         FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![task_id], |r| {
        let d: i64 = r.get(3)?;
        Ok(Subtask {
            id: r.get(0)?,
            task_id: r.get(1)?,
            title: r.get(2)?,
            done: d == 1,
            sort_order: r.get(4)?,
            created_at: r.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn add_subtask(state: DbState, task_id: String, title: String) -> Result<Subtask, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let id = format!("sub_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    conn.execute(
        "INSERT INTO subtasks (id, task_id, title, done, sort_order) VALUES (?, ?, ?, 0, 0.0)",
        params![id, task_id, title.trim()],
    ).map_err(|e| e.to_string())?;

    Ok(Subtask {
        id,
        task_id,
        title: title.trim().to_string(),
        done: false,
        sort_order: 0.0,
        created_at: chrono_now_iso(),
    })
}

#[tauri::command]
pub fn toggle_subtask(state: DbState, id: String) -> Result<bool, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let done: i64 = conn.query_row("SELECT done FROM subtasks WHERE id = ?", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let new_done = if done == 1 { 0 } else { 1 };
    conn.execute("UPDATE subtasks SET done = ? WHERE id = ?", params![new_done, id])
        .map_err(|e| e.to_string())?;
    Ok(new_done == 1)
}

#[tauri::command]
pub fn delete_subtask(state: DbState, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM subtasks WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Settings key-value store
#[tauri::command]
pub fn get_settings(state: DbState) -> Result<HashMap<String, String>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

#[tauri::command]
pub fn save_setting(state: DbState, key: String, value: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Export entire workspace to JSON string
#[tauri::command]
pub fn export_data(state: DbState) -> Result<String, String> {
    let tasks = get_tasks(state.clone(), Some("all".to_string()))?;
    let lists = get_lists(state.clone())?;
    let payload = ExportPayload {
        tasks,
        lists,
        subtasks: Vec::new(),
        version: 1,
    };
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

/// Import workspace from JSON string
#[tauri::command]
pub fn import_data(state: DbState, json_str: String) -> Result<usize, String> {
    let payload: ExportPayload = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    let mut conn = state.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut count = 0;
    for t in payload.tasks {
        let done_int = if t.done { 1 } else { 0 };
        let pin_int = if t.pinned { 1 } else { 0 };
        tx.execute(
            "INSERT OR REPLACE INTO tasks (id, title, notes, done, done_at, pinned, priority, due_at, list_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![t.id, t.title, t.notes, done_int, t.done_at, pin_int, t.priority, t.due_at, t.list_id, t.sort_order],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

fn chrono_now_iso() -> String {
    // Generates ISO timestamp string (UTC)
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}.000Z", duration.as_secs())
}
