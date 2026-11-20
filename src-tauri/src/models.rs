use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub done: bool,
    pub done_at: Option<String>,
    pub pinned: bool,
    pub priority: i64, // 0 low, 1 medium, 2 high
    pub due_at: Option<String>,
    pub reminder_offset_min: Option<i64>,
    pub snoozed_until: Option<String>,
    pub list_id: Option<String>,
    pub repeat_rule: String,
    pub sort_order: f64,
    pub created_at: String,
    pub subtask_count: Option<i64>,
    pub subtasks_done: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct List {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
    pub task_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub done: bool,
    pub sort_order: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroSession {
    pub id: String,
    pub task_id: Option<String>,
    pub started_at: String,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPayload {
    pub tasks: Vec<Task>,
    pub lists: Vec<List>,
    pub subtasks: Vec<Subtask>,
    pub version: i64,
}
