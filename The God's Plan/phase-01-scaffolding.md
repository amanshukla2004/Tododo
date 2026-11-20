# Phase 1: Building the Skeleton (Project Initialization & Vanilla Scaffolding)

> **"Explain like I'm 5" summary**: Imagine building a house. In Phase 0, we bought our hammer and saw. Now in Phase 1, we put up the wooden frame, the front door, and the windows! We don't have the furniture yet, but the house stands on its own and has a roof.

---

## 1. What Did We Build in This Phase?

We built the core structure of our app with **zero bloat**:
1. **The Engine Room (`src-tauri/`)**: Written in **Rust**. This is the invisible brain that manages memory, talks to Windows, and controls SQLite.
2. **The Visual Face (`src/`)**: Written in **Pure Vanilla HTML, CSS, and JavaScript**. No React, no Vue, no Webpack, no Vite. It is 100% clean, raw, and instant.
3. **The Blueprint (`tauri.conf.json`)**: Configured the window size, title, and connected the web face to the Rust brain.

---

## 2. Project File Structure (The Anatomy)

```text
Tododo/
├── package.json              <-- Recipe card for terminal commands (npm run tauri dev)
├── src/                      <-- The visual frontend (pure web tech)
│   ├── index.html            <-- The webpage structure (headers, cards, status)
│   ├── style.css             <-- The styling (Obsidian dark theme, rounded corners)
│   └── app.js                <-- The logic (detects Tauri bridge, updates text)
├── src-tauri/                <-- The Rust backend
│   ├── Cargo.toml            <-- Rust's recipe card (rusqlite, serde, tauri)
│   ├── tauri.conf.json       <-- Desktop window blueprints
│   ├── build.rs              <-- Helper script that compiles Tauri resources
│   ├── capabilities/
│   │   └── default.json      <-- Security key allowing window to talk to Rust
│   └── src/
│       ├── main.rs           <-- Starting point of the desktop program
│       └── lib.rs            <-- Where the app builder lives
└── The God's Plan/           <-- Your baby-step documentation folder
```

---

## 3. Explaining Every File and Function (Baby Steps)

### 1. `src-tauri/src/main.rs`
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  tododo_lib::run();
}
```
- **What is `#![cfg_attr(... windows_subsystem = "windows")]`?**
  - Usually, when a Rust program runs on Windows, an ugly black command-prompt box opens behind it.
  - This single line tells Windows: *"Hey, this is a beautiful graphical app! Hide that black command prompt box."*
- **What is `fn main()`?**
  - Every computer program in the world starts running at `main()`. It simply rings the bell and says: `tododo_lib::run()`, which boots up our app!

### 2. `src-tauri/tauri.conf.json`
- `"productName": "tododo"`: The official name Windows sees.
- `"withGlobalTauri": true`:
  - **Super important**: In standard web development, JavaScript cannot touch your hard drive.
  - This setting injects a secret phone line called `window.__TAURI__` into our webpage so JavaScript can securely talk to Rust!
- `"width": 420, "height": 580`: The exact compact widget dimensions on your screen.

### 3. `src-tauri/Cargo.toml`
- Added: `rusqlite = { version = "0.33", features = ["bundled"] }`
- **What does `features = ["bundled"]` mean?**
  - It means Rust bundles the SQLite database engine directly inside our app!
  - You or anyone who downloads your app will **never** need to install SQLite, MySQL, or any database software separately. It just works out of the box!

### 4. `src/index.html`
- `<header class="widget-header" data-tauri-drag-region>`
  - Notice `data-tauri-drag-region`? That is a special Tauri superpower! When you click and drag any element with this tag, Windows moves the entire desktop window across your screen smoothly!

### 5. `src/app.js`
- Checks `if (window.__TAURI__)`:
  - If we are running inside the native Tauri desktop window, it says: `Tauri v2 Native Bridge: Connected`.
  - Uses `statusText.textContent = ...` instead of `innerHTML` to ensure zero security vulnerabilities.

---

## 4. Simplest Questions Answered

### Q: Why don't we have React or Vite?
**Answer**:
- React and Vite add dozens of hidden megabytes, hundreds of dependencies, and extra memory overhead.
- Because our app is an ambient desktop widget that needs to run 24/7 without slowing down your laptop, pure vanilla HTML/CSS/JS is 10x faster, lighter, and opens instantaneously.

### Q: How do we run this right now?
**Answer**:
```powershell
npm run tauri dev
```
Tauri will compile the Rust core, launch the desktop window, and show you the connected status!

---

## 5. Phase 1 Checklist

- [x] Create `package.json` with `@tauri-apps/cli`
- [x] Configure `src-tauri/tauri.conf.json` with `withGlobalTauri: true`
- [x] Configure `src-tauri/Cargo.toml` with `rusqlite (bundled)`
- [x] Build vanilla `src/index.html`, `src/style.css`, and `src/app.js`
- [x] Test Cargo dependencies compilation
- [x] Document everything in [phase-01-scaffolding.md](file:///c:/Users/rajsh/Desktop/ALL%20PROJECTS/PROJECTS/Tododo/The%20God's%20Plan/phase-01-scaffolding.md)
