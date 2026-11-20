Build a lightweight cross-platform desktop to-do app using Tauri v2 (Rust backend) with a vanilla HTML/CSS/JS frontend (no framework, no bundler; use window.__TAURI__ via withGlobalTauri). Storage is local SQLite via rusqlite with the "bundled" feature. The database lives in the OS app data dir (app.path().app_data_dir()). Keep the installer small and memory use low.

ARCHITECTURE
- The frontend never touches the database. It calls Rust #[tauri::command] functions through invoke().
- Share the connection with Mutex<Connection> in Tauri managed state. Use parameterized SQL only. Return Result<T, String>.
- Use plain textContent for user text (no innerHTML with user data).
- Handle schema changes with a schema_version table and simple migrations, so new columns work on existing installs.
- The database is the single source of truth. After every change, re-fetch and re-render.

DATABASE
- tasks: id, title, notes, done, done_at, pinned, priority (0 low, 1 medium, 2 high), due_at (ISO datetime, nullable), reminder_offset_min (nullable), snoozed_until, list_id, repeat_rule (none/daily/weekly/custom), sort_order, created_at
- lists: id, name, color
- tags: id, name; task_tags: task_id, tag_id
- subtasks: id, task_id, title, done, sort_order
- pomodoro_sessions: id, task_id, started_at, minutes

FEATURES
Core: add, edit, complete, delete tasks. Enter adds a task, double-click edits inline. Clear all completed.
Organization: due date and time, priority (low/medium/high), lists (Work, Study, Personal, user-created), tags, subtasks with progress (1 of 3), notes per task, drag and drop reorder (persist sort_order), pin to top.
Finding things: search, sort (due date, priority, created), filters (overdue, completed), smart views (Today, Next 7 days, All tasks) with live counts in the sidebar.
Smart: recurring tasks (completing one creates the next occurrence), snooze reminders (10 min, 1 hour, tomorrow), pomodoro timer linked to a task (25/5, logs sessions), undo/redo for deletes (Ctrl+Z, toast with Undo button).
Look and feel: dark/light theme following the system with a manual override, keyboard shortcuts for everything, completion animation, compact vs comfortable density, custom accent color (4 to 6 swatches), all stored in a settings table.
Data: export and import as JSON and CSV (native file dialog).

DESKTOP-NATIVE (Tauri plugins)
- System tray icon with a menu: Quick add, Open, Mini widget, Pause reminders, Start on boot, Quit. Closing the main window minimizes to tray.
- Global shortcut Ctrl+Shift+A opens a small frameless quick-add window (title input, due, priority, list, tags; Enter to add, Esc to close).
- Native notifications at due time (a Rust background task checks every 30 seconds) with Mark done and Snooze actions.
- Autostart on boot (toggle in settings).
- Single-instance lock: opening the app again focuses the existing window.
- Auto-updater using the Tauri updater plugin (leave the endpoint and pubkey as clearly marked placeholders).

WINDOWS
1. Main window, 1000x640, min 800x520, adjustable size by the user and can  movemain window and its components anywhere on the screenuser wants . Left sidebar (220px): Views (Today, Next 7 days, All tasks, Overdue, Completed), Lists, Tags, and a footer showing theme and density. Main area: title with date and count, search box, sort control, List/Calendar toggle, a full-width "Add a task and press Enter" input, then grouped task rows (Pinned, Later today, Completed). Each row has a checkbox, title, priority chip (text label, not color only), due time, tags, subtask count and a pin icon. "Clear completed (n)" sits at the bottom right. Clicking a row opens a details panel: editable title, due date/time, reminder with snooze, priority segmented control, list, repeat, tags, notes, subtasks checklist, pomodoro card.
2. Quick-add window: frameless, centered, always on top, closes on Esc or blur.
3. Mini widget: a separate small frameless window (300px wide, resizable edges, draggable header), transparent background with rounded corners, always on top, visible on all workspaces. It shows "Today · N left", a progress bar, the next tasks with times, a running focus timer, and an add-task input. It has a collapsed strip mode (only the next task plus an Open button), an opacity setting (default 85%), and optional click-through when idle. It uses the same SQLite database and the same commands as the main window, and updates live when the main window changes data (use Tauri events to broadcast changes).
4. moving from widget screen to the mini widget must be smooth transition , lika cloth, rubber stretching .

DESIGN
Clean and minimal. System font stack or Inter. Light: white surface, #f4f5f9 sidebar, indigo accent #4f46e5. Dark: #14171f background, #1c2029 surfaces, #2a2f3b borders, #e8eaf0 text, #818cf8 accent. 8px radius on rows, 14px on the widget. Text contrast at least 4.5:1. Use real buttons and inputs with aria-labels, visible focus outlines, and tap targets at least 32px. No emoji icons; use inline SVG.

BUILD ORDER (finish and run each step before the next)
1. Project setup, SQLite, migrations, core CRUD, main list UI.
2. Due dates, priority, lists, tags, subtasks, notes, pin, drag reorder.
3. Search, sort, filters, smart views, details panel.
4. Tray, minimize to tray, single instance, autostart, global quick-add shortcut.
5. Notifications, snooze, recurring tasks, undo for deletes.
6. Mini widget window and the event sync with the main window.
7. Themes, density, accent color, shortcuts, completion animation.
8. Pomodoro, calendar view, JSON/CSV import and export, updater.

After each step, tell me how to run it (npm run tauri dev) and what to test. Keep code readable with short comments on why, not what. Ask me only if something is truly blocking.