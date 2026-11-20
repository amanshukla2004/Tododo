// Task Inspector Slide-Over Sheet Controller (Stage 2)
import { api } from './api.js';
import { state, refreshTasks } from './state.js';
import { showUndoToast } from './render.js';

let currentTask = null;
let currentSubtasks = [];

export function initTaskSheet() {
  const sheet = document.getElementById('task-sheet');
  if (!sheet) return;

  const btnBack = document.getElementById('sheet-btn-back');
  const btnPin = document.getElementById('sheet-btn-pin');
  const titleInput = document.getElementById('sheet-task-title');
  const notesInput = document.getElementById('sheet-task-notes');
  const btnAddStep = document.getElementById('btn-add-step');
  const inputStep = document.getElementById('input-step-title');
  const btnDeleteTask = document.getElementById('sheet-btn-delete');
  const btnClosePicker = document.getElementById('btn-close-picker');
  const pickerOverlay = document.getElementById('prop-picker-overlay');

  if (btnBack) btnBack.addEventListener('click', closeTaskSheet);

  if (btnClosePicker && pickerOverlay) {
    btnClosePicker.addEventListener('click', () => { pickerOverlay.style.display = 'none'; });
    pickerOverlay.addEventListener('click', (e) => { if (e.target === pickerOverlay) pickerOverlay.style.display = 'none'; });
  }

  if (btnPin) {
    btnPin.addEventListener('click', async () => {
      if (!currentTask) return;
      currentTask.pinned = !currentTask.pinned;
      btnPin.classList.toggle('pinned', currentTask.pinned);
      await api.updateTask(currentTask.id, { pinned: currentTask.pinned });
      refreshTasks();
    });
  }

  if (titleInput) {
    titleInput.addEventListener('change', async () => {
      if (!currentTask) return;
      const val = titleInput.value.trim();
      if (val && val !== currentTask.title) {
        currentTask.title = val;
        await api.updateTask(currentTask.id, { title: val });
        refreshTasks();
      }
    });
    titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });
  }

  if (notesInput) {
    notesInput.addEventListener('change', async () => {
      if (!currentTask) return;
      currentTask.notes = notesInput.value;
      await api.updateTask(currentTask.id, { notes: notesInput.value });
      refreshTasks();
    });
  }

  document.getElementById('prop-tile-priority')?.addEventListener('click', () => openPicker('priority'));
  document.getElementById('prop-tile-list')?.addEventListener('click', () => openPicker('list'));
  document.getElementById('prop-tile-repeat')?.addEventListener('click', () => openPicker('repeat'));

  async function handleAddStep() {
    if (!inputStep || !currentTask) return;
    const val = inputStep.value.trim();
    if (!val) return;
    const newSub = await api.addSubtask(currentTask.id, val);
    inputStep.value = '';
    currentSubtasks.push(newSub);
    renderStepsList();
    refreshTasks();
  }

  if (btnAddStep) btnAddStep.addEventListener('click', handleAddStep);
  if (inputStep) inputStep.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddStep(); });

  if (btnDeleteTask) {
    btnDeleteTask.addEventListener('click', async () => {
      if (!currentTask) return;
      const toDelete = currentTask;
      state.lastDeletedTask = toDelete;
      closeTaskSheet();
      await api.deleteTask(toDelete.id);
      showUndoToast(toDelete);
      refreshTasks();
    });
  }

  window.addEventListener('tododo:open-task-sheet', (e) => {
    if (e.detail?.task) openTaskSheet(e.detail.task);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (pickerOverlay?.style.display !== 'none') pickerOverlay.style.display = 'none';
      else if (sheet.classList.contains('active')) closeTaskSheet();
    }
  });
}

function openPicker(type) {
  if (!currentTask) return;
  const overlay = document.getElementById('prop-picker-overlay');
  const title = document.getElementById('picker-title');
  const container = document.getElementById('picker-options-container');
  if (!overlay || !container || !title) return;
  container.replaceChildren();

  const addBtn = (label, onSelect) => {
    const btn = document.createElement('button');
    btn.className = 'picker-btn';
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      await onSelect();
      updatePropertyTiles();
      overlay.style.display = 'none';
      refreshTasks();
    });
    container.appendChild(btn);
  };

  if (type === 'priority') {
    title.textContent = 'Select Priority';
    const prios = [{ l: '⚪ None', v: 0 }, { l: '🔵 Low (!low)', v: 1 }, { l: '🟡 Medium (!med)', v: 2 }, { l: '🔴 High (!high / !urgent)', v: 3 }];
    prios.forEach(p => addBtn(p.l, () => { currentTask.priority = p.v; return api.updateTask(currentTask.id, { priority: p.v }); }));

  } else if (type === 'list') {
    title.textContent = 'Select List';
    addBtn('📥 Inbox (Default)', () => { currentTask.list_id = null; return api.updateTask(currentTask.id, { listId: null }); });
    state.lists.forEach(l => addBtn(`🏷️ ${l.name}`, () => { currentTask.list_id = l.id; return api.updateTask(currentTask.id, { listId: l.id }); }));

  } else if (type === 'repeat') {
    title.textContent = 'Select Repeat';
    const rules = [{ l: '❌ None', v: 'none' }, { l: '🔁 Daily', v: 'daily' }, { l: '📅 Weekly', v: 'weekly' }, { l: '🗓️ Monthly', v: 'monthly' }];
    rules.forEach(r => addBtn(r.l, () => { currentTask.repeat_rule = r.v; return api.updateTask(currentTask.id, { repeatRule: r.v }); }));
  }

  overlay.style.display = 'flex';
}

export async function openTaskSheet(task) {
  currentTask = { ...task };
  const sheet = document.getElementById('task-sheet');
  const surface = document.querySelector('.glass-surface');
  if (!sheet) return;

  const titleInput = document.getElementById('sheet-task-title');
  const notesInput = document.getElementById('sheet-task-notes');
  const btnPin = document.getElementById('sheet-btn-pin');

  if (titleInput) titleInput.value = task.title || '';
  if (notesInput) notesInput.value = task.notes || '';
  if (btnPin) btnPin.classList.toggle('pinned', !!task.pinned);

  updatePropertyTiles();
  try {
    currentSubtasks = await api.getSubtasks(task.id) || [];
  } catch {
    currentSubtasks = [];
  }
  renderStepsList();

  sheet.classList.add('active');
  if (surface) surface.classList.add('sheet-open');
}

export function closeTaskSheet() {
  const sheet = document.getElementById('task-sheet');
  const surface = document.querySelector('.glass-surface');
  const overlay = document.getElementById('prop-picker-overlay');
  if (overlay) overlay.style.display = 'none';
  if (sheet) sheet.classList.remove('active');
  if (surface) surface.classList.remove('sheet-open');
  currentTask = null;
}

function updatePropertyTiles() {
  if (!currentTask) return;
  const valPrio = document.getElementById('prop-val-priority');
  if (valPrio) valPrio.textContent = ['None', 'Low', 'Medium', 'High'][currentTask.priority] || 'None';
  const valList = document.getElementById('prop-val-list');
  if (valList) {
    const listObj = currentTask.list_id ? state.lists.find(l => l.id === currentTask.list_id) : null;
    valList.textContent = listObj ? listObj.name : 'Inbox';
  }
  const valRepeat = document.getElementById('prop-val-repeat');
  if (valRepeat) {
    valRepeat.textContent = currentTask.repeat_rule && currentTask.repeat_rule !== 'none' ? currentTask.repeat_rule : 'None';
  }
}

function renderStepsList() {
  const container = document.getElementById('sheet-steps-list');
  const countEl = document.getElementById('sheet-steps-count');
  if (!container) return;
  container.replaceChildren();

  const doneCount = currentSubtasks.filter(s => s.done).length;
  if (countEl) countEl.textContent = `${doneCount}/${currentSubtasks.length}`;

  for (const step of currentSubtasks) {
    const row = document.createElement('div');
    row.className = `step-item ${step.done ? 'done' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-checkbox';
    cb.style.cssText = 'width: 18px; height: 18px;';
    cb.checked = step.done;
    cb.addEventListener('change', async () => {
      step.done = cb.checked;
      row.classList.toggle('done', step.done);
      await api.toggleSubtask(step.id);
      const nd = currentSubtasks.filter(s => s.done).length;
      if (countEl) countEl.textContent = `${nd}/${currentSubtasks.length}`;
      refreshTasks();
    });

    const text = document.createElement('span');
    text.className = 'step-text';
    text.textContent = step.title;

    const del = document.createElement('button');
    del.className = 'btn-step-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Delete step ${step.title}`);
    del.addEventListener('click', async () => {
      await api.deleteSubtask(step.id);
      currentSubtasks = currentSubtasks.filter(s => s.id !== step.id);
      renderStepsList();
      refreshTasks();
    });

    row.append(cb, text, del);
    container.appendChild(row);
  }
}
