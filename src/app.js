/**
 * Tododo — Authentic Phone-Grade Desktop Wallpaper Widget
 * Production-ready Vanilla JS Controller
 * Direct Native IPC via window.__TAURI_INTERNALS__ & window.__TAURI__
 */

// Application State
const state = {
  tasks: [],
  selectedPriority: 0, // 0: Normal, 1: Medium, 2: High
  isGlanceMode: false,
  isPinnedAlwaysOnTop: false,
  lastDeletedTask: null,
  audioCtx: null,
};

// Resilient Tauri v2 IPC Bridge
const tauri = {
  invoke: async (cmd, args = {}) => {
    // 1. Core Native IPC Bridge in Tauri v2
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    // 2. Global API Bridge if bundled
    if (window.__TAURI__?.core?.invoke) {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI__?.invoke) {
      return await window.__TAURI__.invoke(cmd, args);
    }
    console.error("[Tododo IPC Error] Tauri IPC bridge not found on window object.");
    throw new Error("Tauri IPC bridge not found. Make sure you are running within Tauri.");
  },
  getCurrentWindow: () => {
    if (window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow) {
      return window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
    }
    if (window.__TAURI__?.window?.getCurrentWindow) {
      return window.__TAURI__.window.getCurrentWindow();
    }
    return null;
  }
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  renderHeaderDate();
  setupEventListeners();
  await loadTasks();
});

function renderHeaderDate() {
  const dateEl = document.getElementById("widget-date-display");
  if (!dateEl) return;
  const now = new Date();
  const options = { weekday: "short", month: "short", day: "numeric" };
  dateEl.textContent = `TODAY • ${now.toLocaleDateString("en-US", options).toUpperCase()}`;
}

// ==========================================================================
// Event Listeners
// ==========================================================================
function setupEventListeners() {
  const form = document.getElementById("task-creator-form");
  const input = document.getElementById("task-title-input");
  const prioBtn = document.getElementById("prio-toggle-btn");
  const prioDot = document.getElementById("prio-dot");
  const prioLabel = document.getElementById("prio-label");

  // Cycle Priority on Tag Click (Normal -> Medium -> High -> Normal)
  prioBtn.addEventListener("click", () => {
    state.selectedPriority = (state.selectedPriority + 1) % 3;
    updatePriorityUI();
    input.focus();
  });

  function updatePriorityUI() {
    if (state.selectedPriority === 2) {
      prioDot.style.background = "var(--prio-high)";
      prioDot.style.boxShadow = "0 0 8px var(--prio-high)";
      prioLabel.textContent = "High";
      prioLabel.style.color = "var(--prio-high)";
    } else if (state.selectedPriority === 1) {
      prioDot.style.background = "var(--prio-med)";
      prioDot.style.boxShadow = "0 0 8px var(--prio-med)";
      prioLabel.textContent = "Medium";
      prioLabel.style.color = "var(--prio-med)";
    } else {
      prioDot.style.background = "var(--text-dim)";
      prioDot.style.boxShadow = "none";
      prioLabel.textContent = "Normal";
      prioLabel.style.color = "var(--text-sub)";
    }
  }

  // Auto-detect !high or !med while typing
  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();
    if (val.includes("!high") || val.includes("!urgent")) {
      state.selectedPriority = 2;
      updatePriorityUI();
    } else if (val.includes("!med") || val.includes("!medium")) {
      state.selectedPriority = 1;
      updatePriorityUI();
    }
  });

  // Fast Task Creation (Submit button or Enter)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawVal = input.value.trim();
    if (!rawVal) return;

    let cleanTitle = rawVal
      .replace(/!high/gi, "")
      .replace(/!urgent/gi, "")
      .replace(/!med(ium)?/gi, "")
      .replace(/!low/gi, "")
      .trim();

    if (!cleanTitle) return;

    try {
      await tauri.invoke("add_task", {
        title: cleanTitle,
        priority: state.selectedPriority,
      });

      input.value = "";
      state.selectedPriority = 0;
      updatePriorityUI();
      playPopSound();
      await loadTasks();
    } catch (err) {
      console.error("Failed to add task:", err);
      showToast("Error adding task: " + String(err));
    }
  });

  // Clear Completed
  document.getElementById("btn-clear-completed").addEventListener("click", async () => {
    try {
      await tauri.invoke("clear_completed");
      playPopSound();
      await loadTasks();
    } catch (err) {
      console.error("Failed to clear completed:", err);
    }
  });

  // Window Controls
  document.getElementById("btn-collapse").addEventListener("click", toggleGlanceMode);
  document.getElementById("btn-glance-expand").addEventListener("click", toggleGlanceMode);
  document.getElementById("btn-toggle-pin").addEventListener("click", toggleAlwaysOnTop);
  document.getElementById("btn-close").addEventListener("click", () => {
    const win = tauri.getCurrentWindow();
    if (win) win.hide();
  });

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoDelete();
    }
    if (e.key === "Tab" && !e.target.matches("input")) {
      e.preventDefault();
      toggleGlanceMode();
    }
  });
}

// ==========================================================================
// Data Fetching & Rendering
// ==========================================================================
async function loadTasks() {
  try {
    const tasks = await tauri.invoke("get_tasks", { filter: "all" });
    state.tasks = tasks || [];
    renderTasks();
    updateGlancePill();
    updateProgressFooter();
  } catch (err) {
    console.error("Failed to load tasks:", err);
    showToast("Database error: " + String(err));
  }
}

function renderTasks() {
  const container = document.getElementById("tasks-container");
  const countBadge = document.getElementById("canvas-task-stats");
  container.replaceChildren();

  const activeTasks = state.tasks.filter((t) => !t.done);
  const doneTasks = state.tasks.filter((t) => t.done);

  countBadge.textContent = String(activeTasks.length);

  // Render active tasks first, then completed tasks at the bottom
  const allSorted = [...activeTasks, ...doneTasks];

  allSorted.forEach((task) => {
    container.appendChild(createTaskCard(task));
  });
}

function updateProgressFooter() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  const fill = document.getElementById("progress-bar-fill");
  const text = document.getElementById("footer-progress-text");

  if (total > 0) {
    const pct = Math.round((done / total) * 100);
    fill.style.width = `${pct}%`;
    text.textContent = `${done} of ${total} completed (${pct}%)`;
  } else {
    fill.style.width = "0%";
    text.textContent = "0 reminders";
  }
}

// ==========================================================================
// Task Card Creation (Phone Widget Element)
// ==========================================================================
function createTaskCard(task) {
  const card = document.createElement("div");
  card.className = `task-item-card ${task.done ? "is-done" : ""}`;
  card.dataset.taskId = task.id;

  // Hollow Spring Checkbox
  const check = document.createElement("div");
  check.className = `check-circle ${task.done ? "checked" : ""}`;
  check.title = task.done ? "Mark as pending" : "Mark as completed";

  const tickSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  tickSvg.setAttribute("class", "check-svg");
  tickSvg.setAttribute("viewBox", "0 0 24 24");
  tickSvg.setAttribute("width", "11");
  tickSvg.setAttribute("height", "11");
  tickSvg.setAttribute("fill", "none");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", "20 6 9 17 4 12");
  polyline.setAttribute("stroke-width", "3");
  polyline.setAttribute("stroke", "currentColor");
  tickSvg.appendChild(polyline);
  check.appendChild(tickSvg);

  check.addEventListener("click", async (e) => {
    e.stopPropagation();
    check.classList.toggle("checked");
    playPopSound();
    await tauri.invoke("toggle_task", { id: task.id });
    await loadTasks();
  });

  // Task Text & Priority Dot
  const info = document.createElement("div");
  info.className = "task-main-info";

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.title; // Safe textContent

  // Double click inline edit
  text.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startInlineEditing(text, task);
  });

  info.appendChild(text);

  if (task.priority > 0) {
    const dot = document.createElement("span");
    dot.className = `prio-dot-tag ${task.priority === 2 ? "prio-dot-high" : "prio-dot-med"}`;
    dot.title = task.priority === 2 ? "High Priority" : "Medium Priority";
    info.appendChild(dot);
  }

  // Hover Actions (Pin & Instant Delete)
  const actions = document.createElement("div");
  actions.className = "item-actions";

  // Pin button
  const pinBtn = document.createElement("button");
  pinBtn.className = `row-mini-btn btn-pin ${task.pinned ? "pinned" : ""}`;
  pinBtn.title = task.pinned ? "Unpin reminder" : "Pin to top";
  pinBtn.setAttribute("aria-label", "Pin");
  pinBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="${task.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2.5"><path d="M5 17h14v-2l-2-3V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6l-2 3v2z"/></svg>`;
  pinBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await tauri.invoke("update_task", { id: task.id, pinned: !task.pinned });
    playPopSound();
    await loadTasks();
  });

  // Direct Delete Button (Instant Remove!)
  const delBtn = document.createElement("button");
  delBtn.className = "row-mini-btn btn-trash";
  delBtn.title = "Delete reminder";
  delBtn.setAttribute("aria-label", "Delete");
  delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    state.lastDeletedTask = task;
    await tauri.invoke("delete_task", { id: task.id });
    showToast("Reminder deleted", undoDelete);
    await loadTasks();
  });

  actions.appendChild(pinBtn);
  actions.appendChild(delBtn);

  card.appendChild(check);
  card.appendChild(info);
  card.appendChild(actions);

  return card;
}

function startInlineEditing(textEl, task) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = task.title;
  input.className = "inline-add-input";
  input.style.border = "1px solid var(--accent)";
  input.style.borderRadius = "6px";
  input.style.padding = "2px 8px";
  input.style.background = "rgba(0, 0, 0, 0.5)";

  textEl.replaceWith(input);
  input.focus();

  const save = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== task.title) {
      await tauri.invoke("update_task", { id: task.id, title: newTitle });
      await loadTasks();
    } else {
      input.replaceWith(textEl);
    }
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") input.replaceWith(textEl);
  });
}

// ==========================================================================
// Dynamic Island HUD (Glance Mode)
// ==========================================================================
function toggleGlanceMode() {
  state.isGlanceMode = !state.isGlanceMode;
  const pill = document.getElementById("glance-pill");
  const canvas = document.getElementById("widget-canvas");
  const win = tauri.getCurrentWindow();

  if (state.isGlanceMode) {
    canvas.classList.add("rubber-morph-collapse");
    setTimeout(async () => {
      canvas.style.display = "none";
      canvas.classList.remove("rubber-morph-collapse");
      pill.style.display = "flex";
      pill.classList.add("rubber-morph-expand");
      if (win?.setSize && window.__TAURI__?.dpi?.LogicalSize) {
        await win.setSize(new window.__TAURI__.dpi.LogicalSize(350, 48));
      }
    }, 180);
  } else {
    pill.classList.add("rubber-morph-collapse");
    setTimeout(async () => {
      pill.style.display = "none";
      pill.classList.remove("rubber-morph-collapse");
      canvas.style.display = "flex";
      canvas.classList.add("rubber-morph-expand");
      if (win?.setSize && window.__TAURI__?.dpi?.LogicalSize) {
        await win.setSize(new window.__TAURI__.dpi.LogicalSize(350, 460));
      }
    }, 180);
  }
}

function updateGlancePill() {
  const pillTitle = document.getElementById("glance-title");
  const glanceCount = document.getElementById("glance-count");
  const progressPath = document.getElementById("glance-progress-path");

  const uncompleted = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);
  const total = state.tasks.length;

  glanceCount.textContent = String(uncompleted.length);

  if (uncompleted.length > 0) {
    pillTitle.textContent = uncompleted[0].title;
  } else {
    pillTitle.textContent = "All caught up! 🎉";
  }

  if (total > 0) {
    const percent = (done.length / total) * 100;
    progressPath.setAttribute("stroke-dasharray", `${percent}, 100`);
  } else {
    progressPath.setAttribute("stroke-dasharray", "0, 100");
  }
}

// ==========================================================================
// Pin Always on Top Toggle
// ==========================================================================
async function toggleAlwaysOnTop() {
  state.isPinnedAlwaysOnTop = !state.isPinnedAlwaysOnTop;
  const pinBtn = document.getElementById("btn-toggle-pin");
  pinBtn.classList.toggle("pinned", state.isPinnedAlwaysOnTop);
  pinBtn.title = state.isPinnedAlwaysOnTop
    ? "Pinned on Top (Click for Desktop Wallpaper Mode)"
    : "Desktop Wallpaper Mode (Click to Pin on Top)";

  try {
    const mode = state.isPinnedAlwaysOnTop ? "top" : "desktop";
    await tauri.invoke("set_window_mode", { mode });
  } catch (err) {
    console.warn("set_window_mode error:", err);
  }
}

// ==========================================================================
// Toast & Undo
// ==========================================================================
function showToast(message, undoCallback) {
  const toast = document.getElementById("toast-notification");
  const msg = document.getElementById("toast-message");
  const undoBtn = document.getElementById("toast-undo-btn");

  msg.textContent = message;
  toast.classList.add("show");

  if (undoCallback) {
    undoBtn.style.display = "inline-block";
    undoBtn.onclick = () => {
      toast.classList.remove("show");
      undoCallback();
    };
  } else {
    undoBtn.style.display = "none";
  }

  setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

async function undoDelete() {
  if (!state.lastDeletedTask) return;
  const t = state.lastDeletedTask;
  await tauri.invoke("add_task", {
    title: t.title,
    priority: t.priority,
  });
  state.lastDeletedTask = null;
  await loadTasks();
}

// ==========================================================================
// Micro-Sound Synthesis (Audio Pop)
// ==========================================================================
function playPopSound() {
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = state.audioCtx;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(480, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {}
}
