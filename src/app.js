/**
 * Tododo — Authentic Phone-Grade Desktop Wallpaper Widget
 * Production-ready Vanilla JS Controller
 * Direct Native IPC via window.__TAURI_INTERNALS__ & window.__TAURI__
 */

// Application State
const state = {
  tasks: [],
  lists: [],
  activeFilter: "today", // "today", "upcoming", "all", "overdue", "completed", or "list_<id>"
  searchQuery: "",
  selectedPriority: 0,   // 0: Normal, 1: Medium, 2: High
  isGlanceMode: false,
  isPinnedAlwaysOnTop: false,
  lastDeletedTask: null,
  activeDetailTask: null,
  activeSubtasks: [],
  soundEnabled: true,
  audioCtx: null,

  // Linked Pomodoro Timer (Inside Task Inspector)
  linkedPomo: {
    status: "idle", // "idle", "running", "paused"
    secondsLeft: 25 * 60,
    timerId: null,
  },

  // Standalone Pomodoro Timer
  standalonePomo: {
    modeMinutes: 25,
    status: "idle",
    totalSeconds: 25 * 60,
    secondsLeft: 25 * 60,
    timerId: null,
  },
};

// Resilient Tauri v2 IPC Bridge
const tauri = {
  invoke: async (cmd, args = {}) => {
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    if (window.__TAURI__?.core?.invoke) {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI__?.invoke) {
      return await window.__TAURI__.invoke(cmd, args);
    }
    console.error("[Tododo IPC Error] Tauri IPC bridge not found on window object.");
    throw new Error("Tauri IPC bridge not found. Make sure you are running within Tauri.");
  },
  listen: async (event, callback) => {
    if (window.__TAURI__?.event?.listen) {
      return await window.__TAURI__.event.listen(event, callback);
    }
    return () => {};
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
  await loadSettings();
  await loadLists();
  await loadTasks();
  setupBackendListeners();
});

function renderHeaderDate() {
  const dateEl = document.getElementById("widget-date-display");
  if (!dateEl) return;
  const now = new Date();
  const options = { weekday: "short", month: "short", day: "numeric" };
  dateEl.textContent = `TODAY • ${now.toLocaleDateString("en-US", options).toUpperCase()}`;
}

// ==========================================================================
// Event Listeners Setup
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
      const listId = state.activeFilter.startsWith("list_") ? state.activeFilter : null;
      await tauri.invoke("add_task", {
        title: cleanTitle,
        priority: state.selectedPriority,
        list_id: listId,
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

  // Search Controls
  const searchRow = document.getElementById("search-bar-row");
  const searchInput = document.getElementById("search-input");
  document.getElementById("btn-toggle-search").addEventListener("click", () => {
    const isVisible = searchRow.style.display !== "none";
    searchRow.style.display = isVisible ? "none" : "flex";
    if (!isVisible) {
      searchInput.focus();
    } else {
      state.searchQuery = "";
      searchInput.value = "";
      renderTasks();
    }
  });

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.toLowerCase().trim();
    renderTasks();
  });

  document.getElementById("btn-clear-search").addEventListener("click", () => {
    state.searchQuery = "";
    searchInput.value = "";
    searchRow.style.display = "none";
    renderTasks();
  });

  // Filter Chips Bar
  document.querySelectorAll(".filter-chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeFilter = chip.dataset.filter;
      updateViewTitle();
      loadTasks();
    });
  });

  // Add List Chip
  document.getElementById("btn-add-list-chip").addEventListener("click", promptCreateList);

  // Sheets: Task Details Inspector
  document.getElementById("btn-close-details").addEventListener("click", closeTaskDetails);
  setupTaskDetailsSheetListeners();

  // Sheets: Standalone Pomodoro
  document.getElementById("btn-open-pomodoro").addEventListener("click", openStandalonePomodoro);
  document.getElementById("btn-close-pomodoro").addEventListener("click", closeStandalonePomodoro);
  setupStandalonePomodoroListeners();

  // Sheets: Settings
  document.getElementById("btn-open-settings").addEventListener("click", openSettings);
  document.getElementById("btn-close-settings").addEventListener("click", closeSettings);
  setupSettingsSheetListeners();

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoDelete();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      searchRow.style.display = "flex";
      searchInput.focus();
    }
    if (e.key === "Tab" && !e.target.matches("input, textarea")) {
      e.preventDefault();
      toggleGlanceMode();
    }
    if (e.key === "Escape") {
      closeTaskDetails();
      closeStandalonePomodoro();
      closeSettings();
    }
  });
}

function updateViewTitle() {
  const titleEl = document.getElementById("widget-view-title");
  if (!titleEl) return;

  if (state.activeFilter === "today") titleEl.textContent = "Today's Focus";
  else if (state.activeFilter === "upcoming") titleEl.textContent = "Next 7 Days";
  else if (state.activeFilter === "overdue") titleEl.textContent = "Overdue Tasks";
  else if (state.activeFilter === "completed") titleEl.textContent = "Completed";
  else if (state.activeFilter === "all") titleEl.textContent = "All Reminders";
  else if (state.activeFilter.startsWith("list_")) {
    const list = state.lists.find((l) => l.id === state.activeFilter);
    titleEl.textContent = list ? list.name : "List";
  }
}

// ==========================================================================
// Data Fetching & Rendering
// ==========================================================================
async function loadLists() {
  try {
    const lists = await tauri.invoke("get_lists");
    state.lists = lists || [];
    renderListsChips();
    populateListDropdown();
  } catch (err) {
    console.error("Failed to load lists:", err);
  }
}

function renderListsChips() {
  const container = document.getElementById("lists-chip-container");
  container.replaceChildren();

  state.lists.forEach((list) => {
    const chip = document.createElement("button");
    chip.className = `filter-chip ${state.activeFilter === list.id ? "active" : ""}`;
    chip.dataset.filter = list.id;
    chip.textContent = list.name;
    chip.style.borderColor = list.color;

    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeFilter = list.id;
      updateViewTitle();
      loadTasks();
    });

    container.appendChild(chip);
  });
}

function populateListDropdown() {
  const select = document.getElementById("detail-list-select");
  if (!select) return;

  const currentVal = select.value;
  select.replaceChildren();

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "(None)";
  select.appendChild(emptyOpt);

  state.lists.forEach((list) => {
    const opt = document.createElement("option");
    opt.value = list.id;
    opt.textContent = list.name;
    select.appendChild(opt);
  });

  select.value = currentVal;
}

async function promptCreateList() {
  const name = window.prompt("New list name (e.g., Projects, Books, Groceries):");
  if (!name || !name.trim()) return;

  try {
    await tauri.invoke("add_list", { name: name.trim(), color: "var(--accent)" });
    await loadLists();
    showToast(`List "${name.trim()}" created`);
  } catch (err) {
    showToast("Error creating list: " + String(err));
  }
}

async function loadTasks() {
  try {
    const tasks = await tauri.invoke("get_tasks", { filter: state.activeFilter });
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

  // Apply search query filter if active
  let visibleTasks = state.tasks;
  if (state.searchQuery) {
    visibleTasks = visibleTasks.filter((t) =>
      t.title.toLowerCase().includes(state.searchQuery) ||
      (t.notes && t.notes.toLowerCase().includes(state.searchQuery))
    );
  }

  const activeTasks = visibleTasks.filter((t) => !t.done);
  const doneTasks = visibleTasks.filter((t) => t.done);

  countBadge.textContent = String(activeTasks.length);

  const allSorted = [...activeTasks, ...doneTasks];

  if (allSorted.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.style.textAlign = "center";
    emptyState.style.padding = "24px 0";
    emptyState.style.color = "var(--text-dim)";
    emptyState.style.fontSize = "12px";
    emptyState.textContent = state.searchQuery ? "No reminders match search" : "No reminders in this view";
    container.appendChild(emptyState);
    return;
  }

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
// Task Card Creation
// ==========================================================================
function createTaskCard(task) {
  const card = document.createElement("div");
  card.className = `task-item-card ${task.done ? "is-done" : ""}`;
  card.dataset.taskId = task.id;

  // Open Details Inspector on Card Click (except checkbox or delete button)
  card.addEventListener("click", () => {
    openTaskDetails(task);
  });

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

  // Task Text & Meta
  const info = document.createElement("div");
  info.className = "task-main-info";

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.title;

  // Double click inline edit
  text.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    startInlineEditing(text, task);
  });

  info.appendChild(text);

  // Priority Dot
  if (task.priority > 0) {
    const dot = document.createElement("span");
    dot.className = `prio-dot-tag ${task.priority === 2 ? "prio-dot-high" : "prio-dot-med"}`;
    dot.title = task.priority === 2 ? "High Priority" : "Medium Priority";
    info.appendChild(dot);
  }

  // Meta Badges (Due Date, Subtasks, Repeat)
  const metaContainer = document.createElement("div");
  metaContainer.className = "task-meta-badges";

  if (task.due_at) {
    const duePill = document.createElement("span");
    const isOverdue = !task.done && new Date(task.due_at) < new Date();
    duePill.className = `meta-pill pill-due ${isOverdue ? "is-overdue" : ""}`;
    duePill.textContent = formatShortDate(task.due_at);
    metaContainer.appendChild(duePill);
  }

  if (task.subtask_count && task.subtask_count > 0) {
    const subPill = document.createElement("span");
    subPill.className = "meta-pill pill-subtasks";
    subPill.textContent = `✓ ${task.subtasks_done || 0}/${task.subtask_count}`;
    metaContainer.appendChild(subPill);
  }

  if (task.repeat_rule && task.repeat_rule !== "none") {
    const repPill = document.createElement("span");
    repPill.className = "meta-pill pill-repeat";
    repPill.textContent = "🔁";
    metaContainer.appendChild(repPill);
  }

  info.appendChild(metaContainer);

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

  // Direct Delete Button
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

function formatShortDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch (e) {
    return "";
  }
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
// Slide-Over Sheet: Task Details Inspector
// ==========================================================================
async function openTaskDetails(task) {
  state.activeDetailTask = task;
  const sheet = document.getElementById("sheet-task-details");

  // Populate fields
  document.getElementById("detail-title-input").value = task.title;
  document.getElementById("detail-notes-input").value = task.notes || "";
  document.getElementById("detail-due-input").value = task.due_at ? task.due_at.slice(0, 16) : "";
  document.getElementById("detail-list-select").value = task.list_id || "";
  document.getElementById("detail-repeat-select").value = task.repeat_rule || "none";

  // Priority segmented control
  document.querySelectorAll("#detail-prio-control .segment-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.prio) === task.priority);
  });

  // Load Subtasks
  await loadSubtasks(task.id);

  sheet.classList.add("open");
}

function closeTaskDetails() {
  const sheet = document.getElementById("sheet-task-details");
  sheet.classList.remove("open");
  state.activeDetailTask = null;
}

function setupTaskDetailsSheetListeners() {
  const titleInput = document.getElementById("detail-title-input");
  const notesInput = document.getElementById("detail-notes-input");
  const dueInput = document.getElementById("detail-due-input");
  const listSelect = document.getElementById("detail-list-select");
  const repeatSelect = document.getElementById("detail-repeat-select");
  const prioControl = document.getElementById("detail-prio-control");
  const addSubtaskForm = document.getElementById("detail-add-subtask-form");
  const addSubtaskInput = document.getElementById("detail-add-subtask-input");
  const delTaskBtn = document.getElementById("btn-detail-delete-task");

  // Title save
  titleInput.addEventListener("change", async () => {
    if (!state.activeDetailTask) return;
    const val = titleInput.value.trim();
    if (val) {
      await tauri.invoke("update_task", { id: state.activeDetailTask.id, title: val });
      await loadTasks();
    }
  });

  // Notes save
  notesInput.addEventListener("blur", async () => {
    if (!state.activeDetailTask) return;
    await tauri.invoke("update_task", { id: state.activeDetailTask.id, notes: notesInput.value });
    await loadTasks();
  });

  // Due date save
  dueInput.addEventListener("change", async () => {
    if (!state.activeDetailTask) return;
    const isoVal = dueInput.value ? new Date(dueInput.value).toISOString() : "";
    await tauri.invoke("update_task", { id: state.activeDetailTask.id, due_at: isoVal });
    await loadTasks();
  });

  // List save
  listSelect.addEventListener("change", async () => {
    if (!state.activeDetailTask) return;
    await tauri.invoke("update_task", { id: state.activeDetailTask.id, list_id: listSelect.value });
    await loadTasks();
  });

  // Repeat save
  repeatSelect.addEventListener("change", async () => {
    if (!state.activeDetailTask) return;
    await tauri.invoke("update_task", { id: state.activeDetailTask.id, repeat_rule: repeatSelect.value });
    await loadTasks();
  });

  // Priority segmented control save
  prioControl.addEventListener("click", async (e) => {
    const btn = e.target.closest(".segment-btn");
    if (!btn || !state.activeDetailTask) return;
    prioControl.querySelectorAll(".segment-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const prio = Number(btn.dataset.prio);
    await tauri.invoke("update_task", { id: state.activeDetailTask.id, priority: prio });
    await loadTasks();
  });

  // Add Subtask
  addSubtaskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeDetailTask) return;
    const title = addSubtaskInput.value.trim();
    if (!title) return;
    await tauri.invoke("add_subtask", { task_id: state.activeDetailTask.id, title });
    addSubtaskInput.value = "";
    await loadSubtasks(state.activeDetailTask.id);
    await loadTasks();
  });

  // Snooze Actions
  document.getElementById("btn-snooze-10m").addEventListener("click", () => snoozeActiveTask(10));
  document.getElementById("btn-snooze-1h").addEventListener("click", () => snoozeActiveTask(60));
  document.getElementById("btn-snooze-tomorrow").addEventListener("click", () => snoozeActiveTask(1440));

  // Linked Pomodoro Timer inside Inspector
  setupLinkedPomodoroListeners();

  // Delete Task
  delTaskBtn.addEventListener("click", async () => {
    if (!state.activeDetailTask) return;
    const taskToDelete = state.activeDetailTask;
    closeTaskDetails();
    state.lastDeletedTask = taskToDelete;
    await tauri.invoke("delete_task", { id: taskToDelete.id });
    showToast("Reminder deleted", undoDelete);
    await loadTasks();
  });
}

async function snoozeActiveTask(minutes) {
  if (!state.activeDetailTask) return;
  await tauri.invoke("snooze_task", { id: state.activeDetailTask.id, minutes });
  showToast(`Snoozed for ${minutes >= 60 ? minutes / 60 + " hour" : minutes + " min"}`);
  closeTaskDetails();
  await loadTasks();
}

async function loadSubtasks(taskId) {
  try {
    const subtasks = await tauri.invoke("get_subtasks", { task_id: taskId });
    state.activeSubtasks = subtasks || [];
    renderSubtasksList();
  } catch (err) {
    console.error("Failed to load subtasks:", err);
  }
}

function renderSubtasksList() {
  const container = document.getElementById("detail-subtasks-list");
  const statsLabel = document.getElementById("detail-subtask-stats");
  const fillBar = document.getElementById("detail-subtask-progress-fill");

  container.replaceChildren();

  const total = state.activeSubtasks.length;
  const done = state.activeSubtasks.filter((s) => s.done).length;

  statsLabel.textContent = `${done}/${total}`;
  fillBar.style.width = total > 0 ? `${(done / total) * 100}%` : "0%";

  state.activeSubtasks.forEach((sub) => {
    const row = document.createElement("div");
    row.className = `subtask-row-item ${sub.done ? "done" : ""}`;

    const check = document.createElement("div");
    check.className = `subtask-row-check ${sub.done ? "checked" : ""}`;
    check.addEventListener("click", async () => {
      await tauri.invoke("toggle_subtask", { id: sub.id });
      playPopSound();
      if (state.activeDetailTask) {
        await loadSubtasks(state.activeDetailTask.id);
        await loadTasks();
      }
    });

    const text = document.createElement("span");
    text.className = "subtask-row-text";
    text.textContent = sub.title;

    const del = document.createElement("button");
    del.className = "subtask-del-btn";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      await tauri.invoke("delete_subtask", { id: sub.id });
      if (state.activeDetailTask) {
        await loadSubtasks(state.activeDetailTask.id);
        await loadTasks();
      }
    });

    row.appendChild(check);
    row.appendChild(text);
    row.appendChild(del);
    container.appendChild(row);
  });
}

// ==========================================================================
// Pomodoro Timers (Linked & Standalone)
// ==========================================================================
function setupLinkedPomodoroListeners() {
  const startBtn = document.getElementById("btn-detail-pomo-start");
  const resetBtn = document.getElementById("btn-detail-pomo-reset");
  const timeDisplay = document.getElementById("detail-pomo-time");
  const statusBadge = document.getElementById("detail-pomo-status");

  startBtn.addEventListener("click", () => {
    if (state.linkedPomo.status === "running") {
      // Pause
      clearInterval(state.linkedPomo.timerId);
      state.linkedPomo.status = "paused";
      startBtn.textContent = "Resume Focus";
      statusBadge.textContent = "Paused";
    } else {
      // Start / Resume
      state.linkedPomo.status = "running";
      startBtn.textContent = "Pause Focus";
      statusBadge.textContent = "Focusing";

      state.linkedPomo.timerId = setInterval(async () => {
        state.linkedPomo.secondsLeft--;
        const m = Math.floor(state.linkedPomo.secondsLeft / 60);
        const s = state.linkedPomo.secondsLeft % 60;
        timeDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

        if (state.linkedPomo.secondsLeft <= 0) {
          clearInterval(state.linkedPomo.timerId);
          state.linkedPomo.status = "idle";
          state.linkedPomo.secondsLeft = 25 * 60;
          startBtn.textContent = "Start Focus";
          statusBadge.textContent = "Completed 🎉";
          playChimeSound();
          if (state.activeDetailTask) {
            await tauri.invoke("log_pomodoro_session", {
              task_id: state.activeDetailTask.id,
              minutes: 25,
            });
            showToast("25 min Focus Session Logged! 🎉");
          }
        }
      }, 1000);
    }
  });

  resetBtn.addEventListener("click", () => {
    clearInterval(state.linkedPomo.timerId);
    state.linkedPomo.status = "idle";
    state.linkedPomo.secondsLeft = 25 * 60;
    timeDisplay.textContent = "25:00";
    startBtn.textContent = "Start Focus";
    statusBadge.textContent = "Ready";
  });
}

function openStandalonePomodoro() {
  loadPomodoroStats();
  document.getElementById("sheet-pomodoro").classList.add("open");
}

function closeStandalonePomodoro() {
  document.getElementById("sheet-pomodoro").classList.remove("open");
}

function setupStandalonePomodoroListeners() {
  const toggleBtn = document.getElementById("btn-standalone-pomo-toggle");
  const resetBtn = document.getElementById("btn-standalone-pomo-reset");
  const timeDisplay = document.getElementById("standalone-pomo-time");
  const ringProgress = document.getElementById("pomo-ring-progress");

  // Mode tabs (25m / 5m / 15m)
  document.querySelectorAll(".pomo-mode-selector .segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pomo-mode-selector .segment-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mins = Number(btn.dataset.pomoDuration);
      state.standalonePomo.modeMinutes = mins;
      state.standalonePomo.totalSeconds = mins * 60;
      state.standalonePomo.secondsLeft = mins * 60;
      clearInterval(state.standalonePomo.timerId);
      state.standalonePomo.status = "idle";
      toggleBtn.textContent = "Start Timer";
      updateStandaloneTimerUI();
    });
  });

  toggleBtn.addEventListener("click", () => {
    if (state.standalonePomo.status === "running") {
      clearInterval(state.standalonePomo.timerId);
      state.standalonePomo.status = "paused";
      toggleBtn.textContent = "Resume Timer";
    } else {
      state.standalonePomo.status = "running";
      toggleBtn.textContent = "Pause Timer";

      state.standalonePomo.timerId = setInterval(async () => {
        state.standalonePomo.secondsLeft--;
        updateStandaloneTimerUI();

        if (state.standalonePomo.secondsLeft <= 0) {
          clearInterval(state.standalonePomo.timerId);
          state.standalonePomo.status = "idle";
          state.standalonePomo.secondsLeft = state.standalonePomo.totalSeconds;
          toggleBtn.textContent = "Start Timer";
          playChimeSound();
          await tauri.invoke("log_pomodoro_session", {
            task_id: null,
            minutes: state.standalonePomo.modeMinutes,
          });
          await loadPomodoroStats();
          showToast(`Timer Finished! +${state.standalonePomo.modeMinutes}m logged.`);
        }
      }, 1000);
    }
  });

  resetBtn.addEventListener("click", () => {
    clearInterval(state.standalonePomo.timerId);
    state.standalonePomo.status = "idle";
    state.standalonePomo.secondsLeft = state.standalonePomo.totalSeconds;
    toggleBtn.textContent = "Start Timer";
    updateStandaloneTimerUI();
  });

  function updateStandaloneTimerUI() {
    const m = Math.floor(state.standalonePomo.secondsLeft / 60);
    const s = state.standalonePomo.secondsLeft % 60;
    timeDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    // Circular SVG ring progress (circumference ~ 276.46)
    const pct = state.standalonePomo.secondsLeft / state.standalonePomo.totalSeconds;
    const offset = 276.46 * (1 - pct);
    ringProgress.style.strokeDashoffset = String(offset);
  }
}

async function loadPomodoroStats() {
  try {
    const stats = await tauri.invoke("get_pomodoro_stats");
    document.getElementById("pomo-total-sessions").textContent = String(stats.total_sessions || 0);
    document.getElementById("pomo-total-minutes").textContent = `${stats.total_minutes || 0}m`;
  } catch (err) {
    console.error("Failed to load pomodoro stats:", err);
  }
}

// ==========================================================================
// Settings Sheet & Personalization
// ==========================================================================
function openSettings() {
  document.getElementById("sheet-settings").classList.add("open");
}

function closeSettings() {
  document.getElementById("sheet-settings").classList.remove("open");
}

async function loadSettings() {
  try {
    const settings = await tauri.invoke("get_settings");
    if (!settings) return;

    if (settings.accent_color) {
      applyAccentColor(settings.accent_color);
    }
    if (settings.opacity) {
      applyGlassOpacity(Number(settings.opacity));
      document.getElementById("setting-opacity-slider").value = settings.opacity;
    }
    if (settings.sound_enabled !== undefined) {
      state.soundEnabled = settings.sound_enabled === "true";
      document.getElementById("setting-sound-toggle").checked = state.soundEnabled;
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

function setupSettingsSheetListeners() {
  // Theme Color Swatches
  document.querySelectorAll("#theme-swatches-container .swatch-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#theme-swatches-container .swatch-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const color = btn.dataset.color;
      applyAccentColor(color);
      await tauri.invoke("save_setting", { key: "accent_color", value: color });
      playPopSound();
    });
  });

  // Opacity Slider
  const opacitySlider = document.getElementById("setting-opacity-slider");
  opacitySlider.addEventListener("input", async () => {
    const val = opacitySlider.value;
    applyGlassOpacity(val);
    await tauri.invoke("save_setting", { key: "opacity", value: String(val) });
  });

  // Sound Toggle
  const soundToggle = document.getElementById("setting-sound-toggle");
  soundToggle.addEventListener("change", async () => {
    state.soundEnabled = soundToggle.checked;
    await tauri.invoke("save_setting", { key: "sound_enabled", value: String(state.soundEnabled) });
  });

  // Export JSON
  document.getElementById("btn-export-json").addEventListener("click", async () => {
    try {
      const jsonStr = await tauri.invoke("export_data");
      // Trigger download
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tododo_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Data exported to JSON file! 💾");
    } catch (err) {
      showToast("Export error: " + String(err));
    }
  });

  // Import JSON
  const importInput = document.getElementById("input-import-json");
  importInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result;
        if (typeof content === "string") {
          const count = await tauri.invoke("import_data", { json_str: content });
          showToast(`Imported ${count} items successfully!`);
          await loadLists();
          await loadTasks();
        }
      } catch (err) {
        showToast("Import failed: " + String(err));
      }
    };
    reader.readAsText(file);
  });
}

function applyAccentColor(hex) {
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-glow", `${hex}55`);
}

function applyGlassOpacity(val) {
  const label = document.getElementById("opacity-val-label");
  if (label) label.textContent = `${val}%`;
  const decimal = Number(val) / 100;
  document.documentElement.style.setProperty(
    "--glass-bg",
    `linear-gradient(150deg, rgba(255, 255, 255, 0.08) 0%, rgba(18, 22, 34, ${decimal * 0.85}) 25%, rgba(10, 13, 20, ${decimal}) 100%)`
  );
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
    canvas.style.display = "none";
    pill.style.display = "flex";
    if (win?.setSize && window.__TAURI__?.dpi?.LogicalSize) {
      win.setSize(new window.__TAURI__.dpi.LogicalSize(350, 48));
    }
  } else {
    pill.style.display = "none";
    canvas.style.display = "flex";
    if (win?.setSize && window.__TAURI__?.dpi?.LogicalSize) {
      win.setSize(new window.__TAURI__.dpi.LogicalSize(350, 460));
    }
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
  pillTitle.textContent = uncompleted.length > 0 ? uncompleted[0].title : "All caught up! 🎉";

  if (total > 0) {
    const percent = (done.length / total) * 100;
    progressPath.setAttribute("stroke-dasharray", `${percent}, 100`);
  } else {
    progressPath.setAttribute("stroke-dasharray", "0, 100");
  }
}

// ==========================================================================
// Window Mode: Desktop Wallpaper vs Pin on Top
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
// Live Due Reminder Banner
// ==========================================================================
function setupBackendListeners() {
  tauri.listen("task-due-reminder", (event) => {
    const task = event.payload;
    if (!task) return;
    showDueReminderBanner(task);
  });

  tauri.listen("toggle-glance-mode", () => {
    toggleGlanceMode();
  });
}

function showDueReminderBanner(task) {
  const banner = document.getElementById("banner-task-due");
  const title = document.getElementById("banner-due-task-title");
  const doneBtn = document.getElementById("btn-banner-mark-done");
  const snoozeBtn = document.getElementById("btn-banner-snooze");

  title.textContent = task.title;
  banner.style.display = "flex";
  playChimeSound();

  doneBtn.onclick = async () => {
    banner.style.display = "none";
    await tauri.invoke("toggle_task", { id: task.id });
    await loadTasks();
  };

  snoozeBtn.onclick = async () => {
    banner.style.display = "none";
    await tauri.invoke("snooze_task", { id: task.id, minutes: 10 });
    showToast("Reminder snoozed 10m");
    await loadTasks();
  };
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
    list_id: t.list_id,
  });
  state.lastDeletedTask = null;
  await loadTasks();
}

// ==========================================================================
// Micro-Sound Synthesis (Web Audio API)
// ==========================================================================
function playPopSound() {
  if (!state.soundEnabled) return;
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = state.audioCtx;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {}
}

function playChimeSound() {
  if (!state.soundEnabled) return;
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = state.audioCtx;
    if (ctx.state === "suspended") ctx.resume();

    const notes = [587.33, 880, 1174.66]; // D5, A5, D6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);

      gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.4);
    });
  } catch (e) {}
}