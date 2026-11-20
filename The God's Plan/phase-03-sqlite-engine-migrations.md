# Phase 3: The Secret Vault (SQLite Database Engine & Migrations)

> **"Explain like I'm 5" summary**: When you close your laptop and turn it off, where do your to-dos go so they don't disappear? They are safely saved into a tiny, super-fast digital notebook right on your hard drive! In this phase, we built our SQLite database engine and created the digital filing cabinets for your tasks, lists, tags, and settings.

---

## 1. What Did We Build in This Phase?

1. **Local SQLite File**: We set up SQLite to save inside your official Windows AppData directory (`%APPDATA%/com.tododo.app/tododo.db`).
2. **The Smart Migration Engine**: We built a `schema_version` table. If we ever add new features or columns next month, your existing tasks will **never** be deleted or corrupted!
3. **Database Tables Created**:
   - `tasks`: The main ledger for all your to-dos.
   - `lists`: Categories like *Personal*, *Work*, and *Study*.
   - `tags` & `task_tags`: Custom labels like `#urgent`, `#reading`.
   - `subtasks`: Step-by-step checklists inside a task.
   - `pomodoro_sessions`: Focus timer logs.
   - `settings`: Saves your favorite theme, opacity, and sound settings.

---

## 2. Simplest Questions Answered (FAQ for Beginners)

### Q: Why SQLite? Why not a cloud database like Firebase or MongoDB?
**Answer**:
- Cloud databases require the internet, require logins and passwords, and can be slow.
- **SQLite** is a single file on your laptop. It reads and writes in **less than 1 millisecond**, works completely offline on an airplane, and respects 100% of your privacy!

### Q: What is `app.path().app_data_dir()`?
**Answer**:
- In Windows, you shouldn't randomly save user data files in random folders. Windows provides a dedicated secret vault folder for apps called `AppData\Roaming`.
- `app.path().app_data_dir()` automatically finds `C:\Users\<You>\AppData\Roaming\com.tododo.app\` so your database is kept safe and clean.

### Q: What is WAL Mode (`conn.pragma_update(None, "journal_mode", "WAL")`)?
**Answer**:
- **WAL** stands for *Write-Ahead Logging*.
- In plain English: normally, if one part of the app is writing a task, other parts have to wait. In WAL mode, you can read tasks and write tasks at the same time with zero lag!

### Q: What is `Mutex<Connection>`?
**Answer**:
- Imagine a physical ledger book. If two people try to write on the exact same page at the exact same millisecond, they will bump elbows and make a mess.
- A **Mutex** (Mutual Exclusion lock) is like a hall pass: Rust holds the hall pass whenever it writes to the database. When it finishes, it passes it to the next task. This guarantees **zero crashes and zero corrupted data**.

---

## 3. The Tasks Table Breakdown

| Column | Type | What it means |
| :--- | :--- | :--- |
| `id` | `TEXT` | Unique ID so every task has a name tag. |
| `title` | `TEXT` | What you need to do (e.g. "Buy groceries"). |
| `priority` | `INTEGER` | `0` = Low, `1` = Medium, `2` = High! |
| `pinned` | `INTEGER` | `1` means pinned to the top like a bulletin board. |
| `done` | `INTEGER` | `0` = pending, `1` = completed with a checkmark! |
| `due_at` | `TEXT` | When it's due (e.g. "2026-11-20T18:00:00"). |
| `sort_order` | `REAL` | A number used for smooth drag-and-drop reordering. |

---

## 4. Phase 3 Checklist

- [x] Configure bundled `rusqlite` engine in `db.rs`
- [x] Implement automatic AppData folder resolution
- [x] Build incremental migration engine with `schema_version`
- [x] Seed default lists (*Personal*, *Work*, *Study*) and settings
- [x] Document everything in [phase-03-sqlite-engine-migrations.md](file:///c:/Users/rajsh/Desktop/ALL%20PROJECTS/PROJECTS/Tododo/The%20God's%20Plan/phase-03-sqlite-engine-migrations.md)
