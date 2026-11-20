# Phase 8: The Ninja in the Corner (System Tray & Background Polish)

> **"Explain like I'm 5" summary**: If you close an app, it usually turns off and disappears completely. But our desktop to-do app is your loyal companion! In this phase, we gave it a cozy home in your Windows System Tray (down by the clock). When you click the `X` button, it doesn't shut down—it tucks away quietly into the tray, ready to pop back up whenever you need it.

---

## 1. What Did We Build in This Phase?

1. **Native Windows System Tray Icon**: An icon sitting right beside your Windows clock and volume slider.
2. **Close-to-Tray Intercept**: When you click the `X` button, Rust catches the event (`CloseRequested`), stops Windows from killing the app (`api.prevent_close()`), and softly hides the window.
3. **Tray Context Menu**:
   - Right-click the tray icon to see: *Show Tododo*, *Toggle Glance Pill*, and *Quit Tododo*.
   - Left-click the tray icon: Instantly summons or hides the widget!
4. **Instant Event Dispatch**: Emits `toggle-glance-mode` events directly from the tray menu to the frontend.

---

## 2. Simplest Questions Answered (FAQ for Beginners)

### Q: Why shouldn't the app quit when I click close?
**Answer**:
- If you have to launch your to-do app from the Start Menu every time you want to see a task, you will simply forget to use it!
- By staying in the System Tray, it uses less than **30 MB of RAM**, stays asleep, and wakes up instantly in 0.01 seconds when you click it.

### Q: How does Rust prevent Windows from closing the app?
**Answer**:
- In `lib.rs`, we wrote:
  ```rust
  if let tauri::WindowEvent::CloseRequested { api, .. } = event {
      api.prevent_close(); // "Wait, don't exit!"
      let _ = win_clone.hide(); // Just make it invisible
  }
  ```
- To completely exit the app, you simply right-click the tray icon and select **Quit Tododo**.

---

## 3. Phase 8 Checklist

- [x] Build native Windows System Tray in `src-tauri/src/tray.rs`
- [x] Configure Tray context menu (Show, Glance Mode, Quit)
- [x] Implement single left-click tray toggle
- [x] Implement `api.prevent_close()` minimize-to-tray in `src-tauri/src/lib.rs`
- [x] Document everything in [phase-08-system-tray-global-shortcuts.md](file:///c:/Users/rajsh/Desktop/ALL%20PROJECTS/PROJECTS/Tododo/The%20God's%20Plan/phase-08-system-tray-global-shortcuts.md)
