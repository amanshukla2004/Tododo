# Phase 4: The Secret Walkie-Talkie (Rust-to-Frontend IPC Commands)

> **"Explain like I'm 5" summary**: The visual screen (HTML/CSS) lives on the top floor of our house, and the SQLite safe lives in the basement (Rust). For safety, the top floor is never allowed to walk into the basement directly. Instead, we installed a secret walkie-talkie system! When you click "Add Task", JavaScript whispers through the walkie-talkie, Rust opens the vault, updates the ledger, and whispers back: *"Done!"*

---

## 1. What Did We Build in This Phase?

1. **The Typed Data Models (`models.rs`)**: Defined official Rust data structures for `Task`, `List`, `Subtask`, and `Settings`.
2. **The Command Intercom (`commands.rs`)**: Built 16 safe, parameterized Rust functions that handle everything from adding tasks to toggling checkboxes and reordering.
3. **Managed State Connection (`lib.rs`)**: Shared the single `Mutex<Connection>` across all commands so every query uses the exact same database.
4. **Command Registration**: Hooked every command into Tauri's `invoke_handler![]` macro.

---

## 2. Simplest Questions Answered (FAQ for Beginners)

### Q: What is "IPC"?
**Answer**:
- **IPC** stands for *Inter-Process Communication*.
- It's simply the conversation between your webpage and your computer's operating system.
- In JavaScript, you write:
  ```javascript
  const tasks = await window.__TAURI__.core.invoke("get_tasks", { filter: "today" });
  ```
  and Rust automatically runs `pub fn get_tasks(...)` and returns the tasks as a clean JavaScript Array!

### Q: Why do we use `?` in our SQL queries? What is "parameterized SQL"?
**Answer**:
- If someone names a task: `"Eat dinner"; DROP TABLE tasks;`, and we pasted that raw text into the database, it would delete all your tasks! This famous bug is called **SQL Injection**.
- By using `params![title, priority]`, Rust treats the user's text as **harmless data**, never as executable SQL code. Your data is 100% bulletproof.

### Q: Why does every function return `Result<T, String>`?
**Answer**:
- In sloppy software, if an error happens, the whole app crashes with a blue screen.
- In Rust, `Result<T, String>` means:
  - If everything worked: return `Ok(data)`
  - If something failed: return `Err("Friendly message")`
- This ensures our app **never crashes**, even if your hard drive is full!

---

## 3. The 16 Intercom Commands We Built

1. `get_tasks(filter)`: Gets tasks for Today, Upcoming, All, Overdue, or a specific List.
2. `add_task(title, priority, list_id, due_at)`: Adds a new task.
3. `toggle_task(id)`: Flips completion status and records completion timestamp.
4. `update_task(id, ...)`: Updates title, notes, priority, or pin status.
5. `delete_task(id)`: Deletes a task cleanly.
6. `clear_completed()`: Wipes all completed tasks in one click.
7. `reorder_tasks(task_ids)`: Saves custom drag-and-drop order into SQLite.
8. `get_lists()`: Gets all lists with live uncompleted task counts.
9. `get_subtasks(task_id)`: Gets checklists for a specific task.
10. `add_subtask(task_id, title)`: Adds a checklist item.
11. `toggle_subtask(id)`: Checks off a checklist item.
12. `delete_subtask(id)`: Deletes a checklist item.
13. `get_settings()`: Reads all user settings.
14. `save_setting(key, value)`: Saves user preferences (theme, opacity, sound).
15. `export_data()`: Exports all your data into a clean JSON string.
16. `import_data(json_str)`: Restores your tasks from a backup.

---

## 4. Phase 4 Checklist

- [x] Create strongly-typed Rust models in `src-tauri/src/models.rs`
- [x] Build 16 secure parameterized SQL commands in `src-tauri/src/commands.rs`
- [x] Register shared `Mutex<Connection>` in `src-tauri/src/lib.rs`
- [x] Register all commands in `invoke_handler![]`
- [x] Document everything in [phase-04-rust-ipc-commands.md](file:///c:/Users/rajsh/Desktop/ALL%20PROJECTS/PROJECTS/Tododo/The%20God's%20Plan/phase-04-rust-ipc-commands.md)
