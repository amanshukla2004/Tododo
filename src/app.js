/**
 * Tododo — Phone-Grade Desktop Wallpaper Widget Controller
 * Pure Vanilla JavaScript | Zero Frameworks | Strict textContent
 */

// Application State
const state = {
  currentFilter: "today",
  tasks: [],
  activeTaskId: null,
  isGlanceMode: false,
  windowMode: "normal", // "normal" (wallpaper widget), "desktop" (pinned behind all), "top" (hover)
  isPinnedAlwaysOnTop: false,
  selectedPriority: 0,
  lastDeletedTask: null,
  audioCtx: null,
};

// Tauri IPC Bridge
const tauri = {
  invoke: async (cmd, args = {}) => {
    if (window.__TAURI__?.core?.invoke) {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI__?.invoke) {
      return await window.__TAURI__.invoke(cmd, args);
    }
    console.warn(`[Tauri Mock Invoke] ${cmd}:`, args);
    return mockInvoke(cmd, args);
  },
  getCurrentWindow: () => {
    if (window.__TAURI__) {
      if (window.__TAURI__.webviewWindow?.getCurrentWebviewWindow) {
        return window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
      }
      if (window.__TAURI__.window?.getCurrentWindow) {
        return window.__TAURI__.window.getCurrentWindow();
      }
    }
    return null;
  }
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  renderDate();
  setupEventListeners();
  await loadSavedSettings();
  await loadTasks();
});

function renderDate() {
  const dateEl = document.getElementById("widget-date-display");
  if (!dateEl) return;
  const now = new Date();
  const options = { weekday: "short", month: "short", day: "numeric" };
  const formatted = now.toLocaleDateString("en-US", options).toUpperCase();
  dateEl.textContent = `TODAY • ${formatted}`;
}

// ==========================================================================
// Event Listeners & Controls
// ==========================================================================
function setupEventListeners() {
  const form = document.getElementById("task-creator-form");
  const input = document.getElementById("task-title-input");

  // Quick Priority Chips
  document.querySelectorAll(".quick-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.tag;
      if (chip.classList.contains("active")) {
        chip.classList.remove("active");
        state.selectedPriority = 0;
      } else {
        document.querySelectorAll(".quick-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.selectedPriority = tag === "!high" ? 2 : 1;
      }
      input.focus();
    });
  });

  // Task Creation (Enter or Submit Button)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawVal = input.value.trim();
    if (!rawVal) return;

    let priority = state.selectedPriority;
    let cleanTitle = rawVal;

    if (cleanTitle.includes("!high") || cleanTitle.includes("!urgent")) {
      priority = 2;
      cleanTitle = cleanTitle.replace("!high", "").replace("!urgent", "").trim();
    } else if (cleanTitle.includes("!med") || cleanTitle.includes("!medium")) {
      priority = 1;
      cleanTitle = cleanTitle.replace("!med", "").replace("!medium", "").trim();
    } else if (cleanTitle.includes("!low")) {
      priority = 0;
      cleanTitle = cleanTitle.replace("!low", "").trim();
    }

    try {
      await tauri.invoke("add_task", {
        title: cleanTitle,
        priority: priority,
      });

      input.value = "";
      state.selectedPriority = 0;
      document.querySelectorAll(".quick-chip").forEach((c) => c.classList.remove("active"));
      playPopSound();
      await loadTasks();
    } catch (err) {
      console.error("Failed to add task:", err);
      showToast("Error adding task: " + String(err));
    }
  });

  // Filter Tabs
  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.currentFilter = tab.dataset.filter;
      await loadTasks();
    });
  });

  // Clear Completed
  document.getElementById("btn-clear-completed").addEventListener("click", async (e) => {
    e.stopPropagation();
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

  // Details Drawer Controls
  document.getElementById("btn-close-drawer").addEventListener("click", closeDrawer);
  document.getElementById("drawer-task-title").addEventListener("change", async (e) => {
    if (!state.activeTaskId) return;
    await tauri.invoke("update_task", {
      id: state.activeTaskId,
      title: e.target.value.trim(),
    });
    await loadTasks();
  });

  document.getElementById("drawer-task-notes").addEventListener("change", async (e) => {
    if (!state.activeTaskId) return;
    await tauri.invoke("update_task", {
      id: state.activeTaskId,
      notes: e.target.value,
    });
    await loadTasks();
  });

  document.querySelectorAll("#drawer-priority-picker .segment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!state.activeTaskId) return;
      const prio = parseInt(btn.dataset.priority, 10);
      document.querySelectorAll("#drawer-priority-picker .segment-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await tauri.invoke("update_task", {
        id: state.activeTaskId,
        priority: prio,
      });
      await loadTasks();
    });
  });

  document.getElementById("btn-delete-task").addEventListener("click", async () => {
    if (!state.activeTaskId) return;
    const taskToDelete = state.tasks.find((t) => t.id === state.activeTaskId);
    state.lastDeletedTask = taskToDelete;

    await tauri.invoke("delete_task", { id: state.activeTaskId });
    closeDrawer();
    showToast("Task removed", undoDelete);
    await loadTasks();
  });

  // Subtasks Add
  document.getElementById("subtask-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeTaskId) return;
    const subInput = document.getElementById("subtask-add-input");
    const subTitle = subInput.value.trim();
    if (!subTitle) return;

    await tauri.invoke("add_subtask", {
      taskId: state.activeTaskId,
      title: subTitle,
    });
    subInput.value = "";
    playPopSound();
    await refreshSubtasks(state.activeTaskId);
    await loadTasks();
  });

  // Settings Modal Controls
  document.getElementById("btn-settings-toggle").addEventListener("click", () => {
    document.getElementById("settings-modal").classList.add("open");
  });
  document.getElementById("btn-close-settings").addEventListener("click", () => {
    document.getElementById("settings-modal").classList.remove("open");
  });

  // Window Mode Selector
  document.querySelectorAll("#window-mode-control .segment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode;
      await applyWindowMode(mode);
    });
  });

  const opacitySlider = document.getElementById("opacity-slider");
  const opacityLabel = document.getElementById("opacity-val-label");
  opacitySlider.addEventListener("input", (e) => {
    const val = e.target.value;
    opacityLabel.textContent = `${val}%`;
    const alpha = val / 100;
    document.documentElement.style.setProperty("--bg-deep", `rgba(14, 17, 26, ${alpha})`);
    tauri.invoke("save_setting", { key: "opacity", value: String(val) });
  });

  // Color Swatches
  document.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      const color = swatch.dataset.color;
      document.documentElement.style.setProperty("--accent-indigo", color);
      document.documentElement.style.setProperty("--accent-glow", `${color}40`);
      tauri.invoke("save_setting", { key: "accent_color", value: color });
    });
  });

  // Pomodoro Focus Timer
  let pomoSeconds = 25 * 60;
  let pomoInterval = null;
  const pomoDisplay = document.getElementById("pomodoro-timer-display");
  const btnPomoToggle = document.getElementById("btn-pomo-toggle");
  const btnPomoReset = document.getElementById("btn-pomo-reset");

  function updatePomoDisplay() {
    const mins = String(Math.floor(pomoSeconds / 60)).padStart(2, "0");
    const secs = String(pomoSeconds % 60).padStart(2, "0");
    pomoDisplay.textContent = `${mins}:${secs}`;
  }

  btnPomoToggle.addEventListener("click", () => {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
      btnPomoToggle.textContent = "Resume Focus";
    } else {
      btnPomoToggle.textContent = "Pause";
      pomoInterval = setInterval(() => {
        if (pomoSeconds > 0) {
          pomoSeconds -= 1;
          updatePomoDisplay();
        } else {
          clearInterval(pomoInterval);
          pomoInterval = null;
          btnPomoToggle.textContent = "Start Focus";
          playPopSound();
          showToast("Focus session complete! 🎉");
        }
      }, 1000);
    }
  });

  btnPomoReset.addEventListener("click", () => {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
    pomoSeconds = 25 * 60;
    btnPomoToggle.textContent = "Start Focus";
    updatePomoDisplay();
  });

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      document.getElementById("settings-modal").classList.remove("open");
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoDelete();
    }
    if (e.key === "Tab" && !e.target.matches("input, textarea")) {
      e.preventDefault();
      toggleGlanceMode();
    }
  });
}

// ==========================================================================
// Data Fetching & Strict textContent Rendering
// ==========================================================================
async function loadTasks() {
  try {
    const tasks = await tauri.invoke("get_tasks", { filter: state.currentFilter });
    state.tasks = tasks || [];
    renderTasks();
    updateGlancePill();
    updateProgressFooter();
  } catch (err) {
    console.error("Failed to load tasks:", err);
  }
}

function renderTasks() {
  const pinnedList = document.getElementById("list-pinned");
  const mainList = document.getElementById("list-main");
  const completedList = document.getElementById("list-completed");
  const emptyState = document.getElementById("empty-state");
  const pinnedGroup = document.getElementById("group-pinned");
  const completedGroup = document.getElementById("group-completed");
  const completedCount = document.getElementById("completed-count");
  const taskStats = document.getElementById("canvas-task-stats");

  pinnedList.replaceChildren();
  mainList.replaceChildren();
  completedList.replaceChildren();

  const pinnedTasks = state.tasks.filter((t) => t.pinned && !t.done);
  const regularTasks = state.tasks.filter((t) => !t.pinned && !t.done);
  const doneTasks = state.tasks.filter((t) => t.done);

  // Update header stats
  const activeCount = regularTasks.length + pinnedTasks.length;
  taskStats.textContent = `${activeCount} left`;

  // Pinned Section
  if (pinnedTasks.length > 0) {
    pinnedGroup.style.display = "block";
    pinnedTasks.forEach((t) => pinnedList.appendChild(createTaskRow(t)));
  } else {
    pinnedGroup.style.display = "none";
  }

  // Focus Section
  if (regularTasks.length > 0) {
    regularTasks.forEach((t) => mainList.appendChild(createTaskRow(t)));
  }

  // Completed Section
  if (doneTasks.length > 0) {
    completedGroup.style.display = "block";
    completedCount.textContent = String(doneTasks.length);
    doneTasks.forEach((t) => completedList.appendChild(createTaskRow(t)));
  } else {
    completedGroup.style.display = "none";
  }

  // Empty State
  if (pinnedTasks.length === 0 && regularTasks.length === 0 && doneTasks.length === 0) {
    emptyState.style.display = "flex";
  } else {
    emptyState.style.display = "none";
  }
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
    text.textContent = "0 tasks";
  }
}

// ==========================================================================
// Task Row Creation (Phone-Widget Micro-Card)
// ==========================================================================
function createTaskRow(task) {
  const row = document.createElement("div");
  row.className = `task-row ${task.done ? "completed" : ""}`;
  row.dataset.taskId = task.id;

  // Spring Circular Checkbox
  const checkbox = document.createElement("div");
  checkbox.className = `checkbox-box ${task.done ? "checked" : ""}`;
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-checked", task.done ? "true" : "false");
  checkbox.title = task.done ? "Mark as pending" : "Mark as complete";

  const tickSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  tickSvg.setAttribute("class", "checkbox-tick");
  tickSvg.setAttribute("viewBox", "0 0 24 24");
  tickSvg.setAttribute("width", "11");
  tickSvg.setAttribute("height", "11");
  tickSvg.setAttribute("fill", "none");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", "20 6 9 17 4 12");
  tickSvg.appendChild(polyline);
  checkbox.appendChild(tickSvg);

  checkbox.addEventListener("click", async (e) => {
    e.stopPropagation();
    checkbox.classList.toggle("checked");
    playPopSound();
    await tauri.invoke("toggle_task", { id: task.id });
    await loadTasks();
  });

  // Task Info
  const info = document.createElement("div");
  info.className = "task-info";

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title; // Strict textContent

  // Double click inline edit
  title.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startInlineEditing(title, task);
  });

  const meta = document.createElement("div");
  meta.className = "task-sub-meta";

  // Priority Chip
  if (task.priority > 0) {
    const prioChip = document.createElement("span");
    if (task.priority === 2) {
      prioChip.className = "priority-chip priority-high";
      prioChip.textContent = "HIGH";
    } else if (task.priority === 1) {
      prioChip.className = "priority-chip priority-med";
      prioChip.textContent = "MED";
    }
    meta.appendChild(prioChip);
  }

  // Subtask progress
  if (task.subtask_count && task.subtask_count > 0) {
    const subBadge = document.createElement("span");
    subBadge.className = "subtask-badge";
    subBadge.textContent = `📋 ${task.subtasks_done || 0}/${task.subtask_count}`;
    meta.appendChild(subBadge);
  }

  info.appendChild(title);
  if (meta.children.length > 0) info.appendChild(meta);

  // Micro Actions Cluster (Pin + Instant Delete)
  const actions = document.createElement("div");
  actions.className = "row-actions";

  // Pin Button
  const pinBtn = document.createElement("button");
  pinBtn.className = `action-mini-btn pin-btn ${task.pinned ? "pinned" : ""}`;
  pinBtn.title = task.pinned ? "Unpin task" : "Pin to top";
  pinBtn.setAttribute("aria-label", "Pin task");
  pinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${task.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M5 17h14v-2l-2-3V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6l-2 3v2z"/></svg>`;
  pinBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await tauri.invoke("update_task", { id: task.id, pinned: !task.pinned });
    playPopSound();
    await loadTasks();
  });

  // Direct Delete Button (Instant Remove!)
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-mini-btn delete-btn";
  deleteBtn.title = "Delete task";
  deleteBtn.setAttribute("aria-label", "Delete task");
  deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    state.lastDeletedTask = task;
    await tauri.invoke("delete_task", { id: task.id });
    showToast("Task removed", undoDelete);
    await loadTasks();
  });

  actions.appendChild(pinBtn);
  actions.appendChild(deleteBtn);

  row.appendChild(checkbox);
  row.appendChild(info);
  row.appendChild(actions);

  // Open Details Drawer on Row Click (outside of buttons)
  row.addEventListener("click", () => {
    openDrawer(task);
  });

  return row;
}

function startInlineEditing(titleEl, task) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = task.title;
  input.className = "capsule-input";
  input.style.border = "1px solid var(--accent-indigo)";
  input.style.borderRadius = "6px";
  input.style.padding = "2px 8px";
  input.style.background = "rgba(0, 0, 0, 0.4)";

  titleEl.replaceWith(input);
  input.focus();

  const save = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== task.title) {
      await tauri.invoke("update_task", { id: task.id, title: newTitle });
      await loadTasks();
    } else {
      input.replaceWith(titleEl);
    }
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") input.replaceWith(titleEl);
  });
}

// ==========================================================================
// Details Drawer
// ==========================================================================
async function openDrawer(task) {
  state.activeTaskId = task.id;
  const drawer = document.getElementById("details-drawer");
  const titleInput = document.getElementById("drawer-task-title");
  const notesArea = document.getElementById("drawer-task-notes");

  titleInput.value = task.title;
  notesArea.value = task.notes || "";

  document.querySelectorAll("#drawer-priority-picker .segment-btn").forEach((btn) => {
    if (parseInt(btn.dataset.priority, 10) === task.priority) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  await refreshSubtasks(task.id);
  drawer.classList.add("open");
}

function closeDrawer() {
  document.getElementById("details-drawer").classList.remove("open");
  state.activeTaskId = null;
}

async function refreshSubtasks(taskId) {
  try {
    const subtasks = await tauri.invoke("get_subtasks", { taskId });
    const list = document.getElementById("drawer-subtasks-list");
    const progressText = document.getElementById("drawer-subtask-progress");
    list.replaceChildren();

    const total = subtasks.length;
    const done = subtasks.filter((s) => s.done).length;
    progressText.textContent = `${done}/${total}`;

    subtasks.forEach((s) => {
      const item = document.createElement("div");
      item.className = `subtask-item ${s.done ? "done" : ""}`;

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = s.done;
      check.addEventListener("change", async () => {
        await tauri.invoke("toggle_subtask", { id: s.id });
        await refreshSubtasks(taskId);
        await loadTasks();
      });

      const span = document.createElement("span");
      span.textContent = s.title;
      span.style.flex = "1";

      const del = document.createElement("button");
      del.className = "action-mini-btn delete-btn";
      del.innerHTML = "✕";
      del.addEventListener("click", async () => {
        await tauri.invoke("delete_subtask", { id: s.id });
        await refreshSubtasks(taskId);
        await loadTasks();
      });

      item.appendChild(check);
      item.appendChild(span);
      item.appendChild(del);
      list.appendChild(item);
    });
  } catch (err) {
    console.error("Failed to refresh subtasks:", err);
  }
}

// ==========================================================================
// Glance Pill HUD (Dynamic Island)
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
        await win.setSize(new window.__TAURI__.dpi.LogicalSize(360, 48));
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
        await win.setSize(new window.__TAURI__.dpi.LogicalSize(360, 580));
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
// Window Mode & Position
// ==========================================================================
async function applyWindowMode(mode) {
  state.windowMode = mode;
  state.isPinnedAlwaysOnTop = (mode === "top");

  const pinBtn = document.getElementById("btn-toggle-pin");
  if (pinBtn) {
    pinBtn.classList.toggle("pinned", state.isPinnedAlwaysOnTop);
    pinBtn.title = state.isPinnedAlwaysOnTop
      ? "Hovering on Top (Click for Wallpaper Widget)"
      : "Desktop Wallpaper Widget (Click to Hover on Top)";
  }

  document.querySelectorAll("#window-mode-control .segment-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  try {
    await tauri.invoke("set_window_mode", { mode });
  } catch (err) {
    console.warn("set_window_mode invoke error:", err);
  }

  try {
    await tauri.invoke("save_setting", { key: "window_mode", value: mode });
  } catch (err) {
    console.warn("save_setting window_mode error:", err);
  }
}

async function toggleAlwaysOnTop() {
  const nextMode = state.windowMode === "top" ? "normal" : "top";
  await applyWindowMode(nextMode);
}

async function loadSavedSettings() {
  try {
    const settings = await tauri.invoke("get_settings");
    if (settings) {
      if (settings.opacity) {
        const val = parseInt(settings.opacity, 10);
        const slider = document.getElementById("opacity-slider");
        const label = document.getElementById("opacity-val-label");
        if (slider) slider.value = val;
        if (label) label.textContent = `${val}%`;
        document.documentElement.style.setProperty("--bg-deep", `rgba(14, 17, 26, ${val / 100})`);
      }
      if (settings.accent_color) {
        const color = settings.accent_color;
        document.documentElement.style.setProperty("--accent-indigo", color);
        document.documentElement.style.setProperty("--accent-glow", `${color}40`);
        document.querySelectorAll(".color-swatch").forEach((s) => {
          s.classList.toggle("active", s.dataset.color === color);
        });
      }
      const mode = settings.window_mode || "normal";
      await applyWindowMode(mode);

      // Restore position
      const win = tauri.getCurrentWindow();
      if (win && settings.window_pos_x && settings.window_pos_y && win.setPosition) {
        const x = parseInt(settings.window_pos_x, 10);
        const y = parseInt(settings.window_pos_y, 10);
        if (!isNaN(x) && !isNaN(y) && window.__TAURI__?.dpi?.PhysicalPosition) {
          try {
            await win.setPosition(new window.__TAURI__.dpi.PhysicalPosition(x, y));
          } catch (e) {
            console.warn("Could not restore window position:", e);
          }
        }
      }

      if (win?.onMoved) {
        try {
          win.onMoved(({ payload }) => {
            if (payload && typeof payload.x === "number" && typeof payload.y === "number") {
              tauri.invoke("save_setting", { key: "window_pos_x", value: String(payload.x) });
              tauri.invoke("save_setting", { key: "window_pos_y", value: String(payload.y) });
            }
          });
        } catch (e) {
          console.warn("onMoved error:", e);
        }
      }
    }
  } catch (err) {
    console.warn("loadSavedSettings error:", err);
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
// Sound Effects
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
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {}
}

// ==========================================================================
// Fallback Mock (Only if running in plain browser)
// ==========================================================================
function mockInvoke(cmd, args) {
  if (cmd === "get_tasks") {
    return [
      { id: "1", title: "Review product design with team", done: false, pinned: true, priority: 2, subtask_count: 3, subtasks_done: 1 },
      { id: "2", title: "Complete Tododo wallpaper widget", done: false, pinned: false, priority: 1 },
      { id: "3", title: "Workout 45 mins", done: true, pinned: false, priority: 0 },
    ];
  }
  if (cmd === "get_subtasks") {
    return [
      { id: "s1", title: "Verify glass transparency", done: true },
      { id: "s2", title: "Test direct task delete button", done: false },
    ];
  }
  return [];
}
