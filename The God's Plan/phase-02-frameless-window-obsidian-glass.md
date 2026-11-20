# Phase 2: The Magic Glass Window (Frameless & Obsidian Glass)

> **"Explain like I'm 5" summary**: Regular apps on your computer have an ugly thick white border, blue title bar, and grey edges. In this phase, we took away that clunky plastic frame and turned our app into a floating piece of dark, frosted glass! It hovers right above your desktop wallpaper, blurs what's behind it, and you can grab it and move it anywhere.

---

## 1. What Did We Build in This Phase?

1. **Frameless Desktop Window**: We removed the default Windows title bar (`decorations: false`).
2. **True Glass Transparency**: Turned on native transparency (`transparent: true`) so your computer wallpaper shows through with a rich, frosted blur.
3. **Always-On-Top Mode**: Enabled `alwaysOnTop: true` so your tasks stay in view while you write code, browse the web, or study.
4. **Custom Grab & Drag**: Added `data-tauri-drag-region` so clicking and dragging the top header moves the window smoothly across your screens.
5. **Obsidian Glass Design System**: Deep obsidian tones (`#0c0e14` at 85% opacity), subtle glowing borders, and rounded corners (`16px`).

---

## 2. Explaining the Blueprints (`tauri.conf.json`)

Here are the exact settings we added to `src-tauri/tauri.conf.json`:

```json
{
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "shadow": true,
  "width": 360,
  "height": 580,
  "minWidth": 300,
  "minHeight": 44,
  "resizable": true
}
```

### Line-by-Line Breakdown:
- **`transparent: true`**: Tells Windows: *"Don't paint an opaque white or black box under this window. Let pixels have real alpha transparency!"*
- **`decorations: false`**: Hides the default operating system frame (the ugly minimize/maximize/close buttons and title bar). We build our own sleek ones!
- **`alwaysOnTop: true`**: Keeps our companion widget pinned above regular windows so you never forget your daily focus.
- **`shadow: true`**: Tells the Windows desktop window manager to draw a subtle, soft drop shadow around our rounded glass edges.
- **`minHeight: 44`**: This allows the widget to shrink into our ambient **Glance Pill Mode** (just 44px tall) like Apple's Dynamic Island!

---

## 3. Explaining the Security Permissions (`capabilities/default.json`)

In Tauri v2, for security reasons, a webpage cannot randomly resize or move the window without explicit permission. We added these capabilities:
- `core:window:allow-start-dragging`: Lets your mouse click and drag the widget.
- `core:window:allow-set-size`: Lets the widget morph between Glance Pill and Full Desk Canvas.
- `core:window:allow-set-always-on-top`: Lets the user toggle the pin button on and off.
- `core:window:allow-minimize` & `core:window:allow-close`: Allows minimizing and closing cleanly.

---

## 4. Explaining the CSS Magic (`src/style.css`)

```css
html, body {
  background: transparent !important;
}

.widget-container {
  background: rgba(12, 14, 20, 0.85);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
```

### Why does this look so good?
1. **`background: transparent !important`**: Clears any solid web background so the OS sees clear glass.
2. **`backdrop-filter: blur(28px)`**: Takes whatever is on your desktop wallpaper right behind the widget and blurs it like heavy smoked glass.
3. **`saturate(180%)`**: Adds subtle color vibrancy to the blur so it feels alive and modern.
4. **`border: 1px solid rgba(255, 255, 255, 0.08)`**: A razor-thin hairline glow that defines the widget edges against any light or dark wallpaper.

---

## 5. Phase 2 Checklist

- [x] Configure frameless transparent window in `tauri.conf.json`
- [x] Configure window management permissions in `capabilities/default.json`
- [x] Implement Obsidian Glass CSS styling with backdrop blur
- [x] Implement custom drag header with window action controls
- [x] Document everything in [phase-02-frameless-window-obsidian-glass.md](file:///c:/Users/rajsh/Desktop/ALL%20PROJECTS/PROJECTS/Tododo/The%20God's%20Plan/phase-02-frameless-window-obsidian-glass.md)
