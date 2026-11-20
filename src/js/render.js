// Pure DOM Renderer for Tododo (Stage 1 & 2 + List Filter & Time Badge)
import { api } from './api.js';
import { state, setFilter, setSelectedList, refreshTasks, getFilteredTasks, getUpNextTask } from './state.js';

export function renderApp() {
  renderHeader();
  renderFilterChips();
  renderListFilterRow();
  renderTaskList();
}

export function renderHeader() {
  const badge = document.getElementById('btn-day-progress');
  if (badge) {
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const msLeft = Math.max(0, end - now);
    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    const pct = Math.round(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100);
    badge.textContent = `⏳ ${h}h ${m}m left (${pct}%)`;
  }
}

export function renderFilterChips() {
  const container = document.getElementById('filter-row');
  if (!container) return;
  container.replaceChildren();
  const filters = [{ key: 'all', label: 'All Tasks' }, { key: 'completed', label: 'Done' }];
  for (const f of filters) {
    const btn = document.createElement('button');
    btn.className = `filter-chip ${state.activeFilter === f.key ? 'active' : ''}`;
    btn.textContent = f.label;
    btn.addEventListener('click', () => setFilter(f.key));
    container.appendChild(btn);
  }
}

export function renderListFilterRow() {
  const container = document.getElementById('list-filter-row');
  if (!container) return;
  container.replaceChildren();

  const addChip = (label, active, onClick) => {
    const btn = document.createElement('button');
    btn.className = `list-chip ${active ? 'active' : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
  };

  addChip('All', state.selectedListId === 'all', () => setSelectedList('all'));
  addChip('📥 Inbox', state.selectedListId === null, () => setSelectedList(null));

  state.lists.forEach(l => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex; align-items:center; gap:2px;';
    const btn = document.createElement('button');
    btn.className = `list-chip ${state.selectedListId === l.id ? 'active' : ''}`;
    btn.textContent = `🏷️ ${l.name}`;
    btn.addEventListener('click', () => setSelectedList(l.id));

    const del = document.createElement('button');
    del.className = 'btn-delete-list-chip';
    del.textContent = '✕';
    del.title = `Delete list "${l.name}"`;
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete list "${l.name}"? Tasks will move to Inbox.`)) {
        await api.deleteList(l.id);
        if (state.selectedListId === l.id) state.selectedListId = 'all';
        state.lists = await api.getLists();
        renderListFilterRow();
        refreshTasks();
      }
    });

    wrap.append(btn, del);
    container.appendChild(wrap);
  });

  const addListBtn = document.createElement('button');
  addListBtn.className = 'list-chip btn-new-list-chip';
  addListBtn.textContent = '+ List';
  addListBtn.addEventListener('click', async () => {
    const name = window.prompt('Enter new list name:');
    if (name?.trim()) {
      await api.addList(name.trim(), '#8B74F0');
      state.lists = await api.getLists();
      renderListFilterRow();
    }
  });
  container.appendChild(addListBtn);
}

export function renderTaskList() {
  const container = document.getElementById('task-list-container');
  if (!container) return;
  container.replaceChildren();
  const tasks = getFilteredTasks();
  if (!tasks.length) { container.appendChild(renderEmptyState()); return; }

  for (const task of tasks) {
    const tile = document.createElement('div');
    tile.className = `task-tile ${task.done ? 'completed' : ''}`;
    let tileColor = task.done ? 'var(--list-done)' : 'var(--list-study)';
    if (task.list_id && !task.done) {
      const l = state.lists.find(x => x.id === task.list_id);
      if (l) tileColor = l.name.toLowerCase().includes('work') ? 'var(--list-work)' : (l.name.toLowerCase().includes('personal') ? 'var(--list-personal)' : (l.color || 'var(--list-study)'));
    }
    tile.style.setProperty('--tile-color', tileColor);

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'task-checkbox'; cb.checked = task.done;
    cb.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (cb.checked) {
        const r = cb.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent('tododo:task-completed', { detail: { x: r.left + 11, y: r.top + 11 } }));
      }
      await api.toggleTask(task.id);
      refreshTasks();
    });

    const content = document.createElement('div'); content.className = 'tile-content';
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex; align-items:center; gap:6px; overflow:hidden;';
    const titleEl = document.createElement('div'); titleEl.className = 'tile-title'; titleEl.textContent = task.title;
    titleRow.appendChild(titleEl);

    if (task.priority > 0) {
      const prioPill = document.createElement('span');
      prioPill.className = `pill ${task.priority >= 3 ? 'pill-high' : (task.priority === 2 ? 'pill-med' : 'pill-low')}`;
      prioPill.style.cssText = 'font-size:9.5px; padding:1px 6px; font-weight:700; flex-shrink:0;';
      prioPill.textContent = task.priority >= 3 ? '⚡ High' : (task.priority === 2 ? 'Medium' : 'Low');
      titleRow.appendChild(prioPill);
    }
    content.appendChild(titleRow);

    if (task.subtask_count > 0 || (task.repeat_rule && task.repeat_rule !== 'none')) {
      const meta = document.createElement('div'); meta.className = 'tile-meta';
      if (task.subtask_count > 0) meta.appendChild(Object.assign(document.createElement('span'), { textContent: `${task.subtasks_done}/${task.subtask_count} steps` }));
      if (task.repeat_rule && task.repeat_rule !== 'none') meta.appendChild(Object.assign(document.createElement('span'), { textContent: `· ${task.repeat_rule}` }));
      content.appendChild(meta);
    }
    content.addEventListener('click', () => window.dispatchEvent(new CustomEvent('tododo:open-task-sheet', { detail: { task } })));

    const right = document.createElement('div'); right.className = 'tile-right';
    if (task.list_id && state.selectedListId === 'all') {
      const lObj = state.lists.find(l => l.id === task.list_id);
      if (lObj) right.appendChild(Object.assign(document.createElement('span'), { className: 'pill', style: 'font-size:9px; padding:1px 6px;', textContent: lObj.name }));
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-tile-delete'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); state.lastDeletedTask = task;
      await api.deleteTask(task.id); showUndoToast(task); refreshTasks();
    });
    right.appendChild(delBtn);
    tile.append(cb, content, right);
    container.appendChild(tile);
  }
}

function renderEmptyState() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:24px 16px; text-align:center;';
  const icon = document.createElement('div'); icon.style.cssText = 'font-size:32px; margin-bottom:6px;';
  const h = document.createElement('div'); h.style.cssText = 'font-family:var(--font-heading); font-size:15px; font-weight:700; color:var(--ink);';
  const sub = document.createElement('div'); sub.style.cssText = 'font-size:11.5px; color:var(--muted); margin-top:4px;';
  if (state.activeFilter === 'completed') { icon.textContent = '✨'; h.textContent = 'All caught up!'; sub.textContent = 'Completed items will show up here'; }
  else { icon.textContent = '🍃'; h.textContent = 'Clear skies'; sub.textContent = 'Add a task below to start your flow'; }
  box.append(icon, h, sub);
  return box;
}

export function showUndoToast(task) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.replaceChildren();
  const toast = document.createElement('div'); toast.className = 'undo-toast';
  const text = document.createElement('span'); text.textContent = `Deleted "${task.title}"`;
  const undoBtn = document.createElement('button'); undoBtn.className = 'btn-toast-undo'; undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', async () => {
    await api.addTask(task.title, task.priority, task.list_id, task.due_at);
    state.lastDeletedTask = null; toast.remove(); refreshTasks();
  });
  toast.append(text, undoBtn);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}
