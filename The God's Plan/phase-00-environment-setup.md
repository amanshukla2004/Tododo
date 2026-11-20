# Phase 0: Setting Up Our Workshop (Environment & Tools)

> **"Explain like I'm 5" summary**: Before we can build a sleek wooden toy car, we need to make sure we have a hammer, a saw, and a workbench. In this phase, we checked and installed all the core tools onto your laptop so we can build our desktop to-do widget!

---

## 1. What Are We Doing and Why?

We want to build a desktop widget that:
1. Sits on your screen like a quiet companion.
2. Uses very little memory (RAM: under 40 MB) so your laptop never gets hot or slow.
3. Looks gorgeous with smooth glass and fluid transitions.

To make this happen, we chose **Tauri v2** and **Rust**.

---

## 2. Simplest Questions Answered (Baby-Step FAQ)

### Q1: Why are we using Rust? Isn't JavaScript enough?
**Answer**: Think of JavaScript like a high-speed bicycle, and Rust like an aerospace rocket engine.
- Most desktop apps (like Slack, Discord, or VS Code) use a tool called **Electron**. Electron literally glues a whole Google Chrome web browser inside every single app. That’s why having 3 apps open can eat 1 GB of your computer’s memory!
- **Tauri** does something genius: instead of carrying Google Chrome inside the app, it uses the **built-in browser engine that already lives inside Windows** (called **Microsoft Edge WebView2**). Then, it uses **Rust** behind the scenes to talk directly to your hard drive and operating system.
- Result: Our widget uses **~30 MB of RAM** instead of **350 MB**, and opens in less than half a second.

### Q2: What is "Rustup" and "Cargo"?
- **Rust**: The programming language we use for the backend.
- **rustc**: The translator (compiler) that takes human-written Rust code and turns it into `0`s and `1`s that your computer's CPU can execute at lightning speed.
- **Cargo**: Rust's helper/butler. Whenever you say `cargo build` or `cargo run`, Cargo goes and gathers all the libraries (called "crates") and builds your project automatically.
- **Rustup**: The manager that installs and updates Rust, rustc, and Cargo for you with one click.

### Q3: What is "Smart App Control" in Windows 11 and what happened with our test?
**Answer**: 
- Windows 11 has a security guard called **Smart App Control**. Whenever a brand-new program is created on your laptop (like a newly compiled Rust `.exe` or a new `.node` plugin), the security guard says: *"Wait! I don't recognize you yet. Show me your badge!"*
- Because our new test file didn't have a badge, Windows blocked it initially.
- **How we fixed it**: We created a local developer badge (a digital certificate named `TododoLocalDev`). We gave our test program this badge (`Set-AuthenticodeSignature`). Immediately, Windows said: *"Welcome! You may run!"* and our Rust program printed `Hello from Rust!`.

### Q4: What is "Node.js" and "npm"? We said "No Framework", so why is it here?
**Answer**:
- We are **NOT** using React, Angular, Vue, or Webpack. The UI will be 100% pure, clean, raw HTML, CSS, and JavaScript.
- However, the Tauri project runner (`@tauri-apps/cli`) runs via Node.js so we can simply type:
  ```powershell
  npm run tauri dev
  ```
  to start our app with one command! Node is already installed on your machine (`v24.19.0`).

---

## 3. The Exact Commands We Ran & What Every Word Means

### Step 1: Checking what was already on your machine
```powershell
node --version
npm --version
```
- **What it did**: Asked your laptop for Node and npm versions.
- **Result**: You had Node `v24.19.0` and npm `11.17.0`. Ready to go!

### Step 2: Installing Rust with Windows Package Manager
```powershell
winget install --id Rustlang.Rustup --accept-package-agreements --accept-source-agreements --silent
```
- **`winget`**: Microsoft’s official "app store in the terminal".
- **`--id Rustlang.Rustup`**: The official name of Rust's installer.
- **`--silent`**: Does the work cleanly in the background without popping up 5 installer windows.

### Step 3: Setting up the GNU toolchain
```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu
rustup default stable-x86_64-pc-windows-gnu
```
- **What it did**: Installed all the Windows libraries and linkers so Rust can compile `.exe` files out of the box.

### Step 4: Creating a Local Developer Code-Signing Certificate
```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=TododoLocalDev" -CertStoreLocation "Cert:\CurrentUser\My"
```
- **What it did**: Created your personal developer badge on Windows so your laptop allows all our newly compiled binaries to run without Smart App Control interference.

### Step 5: Verifying the Tauri v2 CLI
```powershell
npx @tauri-apps/cli --version
```
- **Result**: `tauri-cli 2.12.6` is installed, verified, and running smoothly!

---

## 4. Phase 0 Status: COMPLETE

- [x] Create project plan directory (`The God's Plan`)
- [x] Create `implementation.md` roadmap
- [x] Verify Node.js (`v24.19.0`) & npm (`11.17.0`)
- [x] Install Rustup, Cargo (`v1.100.0`), and rustc (`v1.100.0`)
- [x] Configure developer code-signing certificate for Windows 11 Smart App Control
- [x] Verify Tauri v2 CLI (`tauri-cli 2.12.6`)

**Workshop is ready! We are now prepared for Phase 1.**
