/**
 * Tododo — Ambient Desktop Widget Controller (Vanilla JS)
 * Zero frameworks, zero bundlers.
 * Strict textContent rendering (Zero innerHTML vulnerabilities).
 */

// Application State
const state = {
  currentFilter: "today",
  tasks: [],
  activeTaskId: null,
  isGlanceMode: false,
  isPinnedAlwaysOnTop: true,
  lastDeletedTask: null,
  audioCtx: null,
};

// Tauri IPC Bridge Wrapper
const tauri = {
  invoke: async (cmd, args = {}) => {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    console.log(`[Tauri Mock Invoke] ${cmd}:`, args);
    return mockInvoke(cmd, args);
  },
  getCurrentWindow: () => {
    if (window.__TAURI__ && window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow) {
      return window.__TAURI__.window.getCurrentWindow();
    }
    return null;
  }
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await loadTasks();
});

function setupEventListeners() {
  // Quick Add Form
  const form = document.getElementById("task-creator-form");
  const input = document.getElementById("task-title-input");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawVal = input.value.trim();
    if (!rawVal) return;

    let priority = 0;
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
        listId: null,
        dueAt: null,
      });
      input.value = "";
      playPopSound();
      await loadTasks();
    } catch (err) {
      console.error("Failed to add task:", err);
    }
  });

  // Filter View Tabs
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".view-tab").forEach((t) => t.classList.remove("active"));
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
    showToast("Task deleted", undoDelete);
    await loadTasks();
  });

  // Add Subtask Form
  document.getElementById("subtask-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeTaskId) return;
    const input = document.getElementById("subtask-add-input");
    const title = input.value.trim();
    if (!title) return;

    await tauri.invoke("add_subtask", {
      taskId: state.activeTaskId,
      title: title,
    });
    input.value = "";
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

  const opacitySlider = document.getElementById("opacity-slider");
  const opacityLabel = document.getElementById("opacity-val-label");
  opacitySlider.addEventListener("input", (e) => {
    const val = e.target.value;
    opacityLabel.textContent = `${val}%`;
    const alpha = val / 100;
    document.documentElement.style.setProperty("--bg-deep", `rgba(12, 14, 20, ${alpha})`);
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

  // Keyboard Shortcuts: Tab toggles Glance Mode, Esc closes Drawer, Ctrl+Z undoes delete
  document.addEventListener("keydown", (e) => {
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
    state.tasks = tasks;
    renderTasks();
    updateGlancePill();
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
  taskStats.textContent = `Today · ${regularTasks.length + pinnedTasks.length} left`;

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

  // Empty state
  if (state.tasks.length === 0) {
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
  }
}

/**
 * Creates a single task row using pure textContent (No innerHTML security issues)
 */
function createTaskRow(task) {
  const row = document.createElement("div");
  row.className = `task-row ${task.done ? "completed" : ""}`;
  row.dataset.id = task.id;
  row.draggable = !task.done; // Uncompleted tasks are draggable

  // Drag and Drop Event Listeners
  row.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
  });

  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
  });

  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  row.addEventListener("drop", async (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const targetId = task.id;
    if (!draggedId || draggedId === targetId) return;

    const uncompleted = state.tasks.filter((t) => !t.done);
    const fromIdx = uncompleted.findIndex((t) => t.id === draggedId);
    const toIdx = uncompleted.findIndex((t) => t.id === targetId);

    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = uncompleted.splice(fromIdx, 1);
      uncompleted.splice(toIdx, 0, moved);
      const reorderedIds = uncompleted.map((t) => t.id);

      await tauri.invoke("reorder_tasks", { taskIds: reorderedIds });
      playPopSound();
      await loadTasks();
    }
  });

  // Checkbox Box
  const checkbox = document.createElement("div");
  checkbox.className = `checkbox-box ${task.done ? "checked" : ""}`;
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-checked", task.done ? "true" : "false");

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

  // Task Info (Title & Meta)
  const info = document.createElement("div");
  info.className = "task-info";

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title; // Safe textContent

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
      prioChip.textContent = "High";
    } else if (task.priority === 1) {
      prioChip.className = "priority-chip priority-med";
      prioChip.textContent = "Medium";
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

  // Pin icon toggle button
  const pinBtn = document.createElement("button");
  pinBtn.className = `icon-btn pin-btn ${task.pinned ? "pinned" : ""}`;
  pinBtn.title = task.pinned ? "Unpin task" : "Pin to top";
  pinBtn.setAttribute("aria-label", "Toggle pin");

  const pinSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pinSvg.setAttribute("class", "pin-icon");
  pinSvg.setAttribute("width", "12");
  pinSvg.setAttribute("height", "12");
  pinSvg.setAttribute("viewBox", "0 0 24 24");
  pinSvg.setAttribute("fill", task.pinned ? "currentColor" : "none");
  pinSvg.setAttribute("stroke", "currentColor");
  pinSvg.setAttribute("stroke-width", "2");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 17h14v-2l-2-3V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6l-2 3v2z");
  pinSvg.appendChild(path);
  pinBtn.appendChild(pinSvg);

  pinBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await tauri.invoke("update_task", { id: task.id, pinned: !task.pinned });
    playPopSound();
    await loadTasks();
  });

  row.appendChild(checkbox);
  row.appendChild(info);
  row.appendChild(pinBtn);

  // Open Drawer on Row Click
  row.addEventListener("click", () => {
    openDrawer(task);
  });

  return row;
}

function startInlineEditing(titleEl, task) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = task.title;
  input.className = "creator-input";
  input.style.border = "1px solid var(--accent-indigo)";
  input.style.borderRadius = "4px";
  input.style.padding = "2px 6px";

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
// Details Drawer Management
// ==========================================================================
async function openDrawer(task) {
  state.activeTaskId = task.id;
  const drawer = document.getElementById("details-drawer");
  const titleInput = document.getElementById("drawer-task-title");
  const notesArea = document.getElementById("drawer-task-notes");

  titleInput.value = task.title;
  notesArea.value = task.notes || "";

  // Set Priority Segment
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

    const doneCount = subtasks.filter((s) => s.done).length;
    progressText.textContent = `${doneCount}/${subtasks.length}`;

    subtasks.forEach((s) => {
      const item = document.createElement("div");
      item.className = "subtask-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = s.done;
      cb.addEventListener("change", async () => {
        playPopSound();
        await tauri.invoke("toggle_subtask", { id: s.id });
        await refreshSubtasks(taskId);
        await loadTasks();
      });

      const label = document.createElement("span");
      label.style.flex = "1";
      label.style.textDecoration = s.done ? "line-through" : "none";
      label.textContent = s.title;

      const del = document.createElement("button");
      del.className = "drawer-close";
      del.textContent = "✕";
      del.addEventListener("click", async () => {
        await tauri.invoke("delete_subtask", { id: s.id });
        await refreshSubtasks(taskId);
        await loadTasks();
      });

      item.appendChild(cb);
      item.appendChild(label);
      item.appendChild(del);
      list.appendChild(item);
    });
  } catch (err) {
    console.error("Failed to load subtasks:", err);
  }
}

// ==========================================================================
// Dual Form Factor & Elastic Morph Transitions
// ==========================================================================
async function toggleGlanceMode() {
  state.isGlanceMode = !state.isGlanceMode;
  const pill = document.getElementById("glance-pill");
  const canvas = document.getElementById("widget-canvas");
  const win = tauri.getCurrentWindow();

  if (state.isGlanceMode) {
    // Elastic rubber collapse animation
    canvas.classList.add("rubber-morph-collapse");
    setTimeout(async () => {
      canvas.style.display = "none";
      canvas.classList.remove("rubber-morph-collapse");
      pill.style.display = "flex";
      pill.classList.add("rubber-morph-expand");
      if (win && win.setSize) {
        await win.setSize(new window.__TAURI__.dpi.LogicalSize(320, 48));
      }
    }, 200);
  } else {
    // Elastic rubber expand animation
    pill.classList.add("rubber-morph-collapse");
    setTimeout(async () => {
      pill.style.display = "none";
      pill.classList.remove("rubber-morph-collapse");
      canvas.style.display = "flex";
      canvas.classList.add("rubber-morph-expand");
      if (win && win.setSize) {
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
    pillTitle.textContent = "All tasks completed! 🎉";
  }

  if (total > 0) {
    const percent = (done.length / total) * 100;
    progressPath.setAttribute("stroke-dasharray", `${percent}, 100`);
  } else {
    progressPath.setAttribute("stroke-dasharray", `0, 100`);
  }
}

async function toggleAlwaysOnTop() {
  state.isPinnedAlwaysOnTop = !state.isPinnedAlwaysOnTop;
  const pinBtn = document.getElementById("btn-toggle-pin");
  pinBtn.classList.toggle("pinned", state.isPinnedAlwaysOnTop);

  const win = tauri.getCurrentWindow();
  if (win && win.setAlwaysOnTop) {
    await win.setAlwaysOnTop(state.isPinnedAlwaysOnTop);
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

  undoBtn.onclick = () => {
    toast.classList.remove("show");
    if (undoCallback) undoCallback();
  };

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
    listId: t.list_id,
    dueAt: t.due_at,
  });
  state.lastDeletedTask = null;
  await loadTasks();
}

// ==========================================================================
// Micro-Sound Synthesis (Web Audio API)
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

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (err) {
    // Audio context silent fallback
  }
}

// ==========================================================================
// Development Fallback Mock
// ==========================================================================
function mockInvoke(cmd, args) {
  if (cmd === "get_tasks") {
    return [
      { id: "1", title: "Complete Tododo desktop widget", done: false, pinned: true, priority: 2, subtask_count: 3, subtasks_done: 2 },
      { id: "2", title: "Enjoy Obsidian Glass aesthetic", done: false, pinned: false, priority: 1 },
      { id: "3", title: "Review The God's Plan documentation", done: true, pinned: false, priority: 0 },
    ];
  }
  if (cmd === "get_subtasks") {
    return [
      { id: "s1", title: "Scaffold Tauri v2 and SQLite", done: true },
      { id: "s2", title: "Build Obsidian Glass design system", done: true },
      { id: "s3", title: "Test elastic rubber morphing", done: false },
    ];
  }
  return [];
}
