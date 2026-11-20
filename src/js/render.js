// Pure DOM Renderer for Tododo (Stage 1 & 2)
import { api } from './api.js';
import { state, setFilter, refreshTasks, getFilteredTasks, getUpNextTask } from './state.js';

export function renderApp() {
  renderHeader();
  renderHeroCard();
  renderFilterChips();
  renderTaskList();
}

export function renderHeader() {
  const greetingEl = document.getElementById('header-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    let greet = 'Good evening';
    if (hour >= 5 && hour < 12) greet = 'Good morning';
    else if (hour >= 12 && hour < 18) greet = 'Good afternoon';
    greetingEl.textContent = greet;
  }
}

export function renderHeroCard() {
  const heroCard = document.getElementById('hero-card');
  if (!heroCard) return;
  const upNext = getUpNextTask();
  heroCard.replaceChildren();

  if (!upNext) {
    const label = document.createElement('div');
    label.className = 'hero-label';
    label.textContent = 'UP NEXT';
    const title = document.createElement('h2');
    title.className = 'hero-title';
    title.textContent = 'All caught up for today';
    const footer = document.createElement('div');
    footer.className = 'hero-footer';
    const sub = document.createElement('span');
    sub.style.cssText = 'font-size: 12px; color: #7C5648;';
    sub.textContent = 'Take a breather or add a new goal below';
    footer.appendChild(sub);
    heroCard.append(label, title, footer);
    return;
  }

  const label = document.createElement('div');
  label.className = 'hero-label';
  let dueText = 'UP NEXT';
  if (upNext.pinned) {
    dueText = 'UP NEXT · PINNED';
  } else if (upNext.due_at) {
    const dueDate = new Date(upNext.due_at);
    const diffHours = Math.round((dueDate - new Date()) / (1000 * 60 * 60));
    dueText = diffHours > 0 && diffHours <= 24 ? `UP NEXT · IN ${diffHours}H` : (diffHours <= 0 ? 'UP NEXT · DUE NOW' : 'UP NEXT · TODAY');
  }
  label.textContent = dueText;

  const title = document.createElement('h2');
  title.className = 'hero-title';
  title.textContent = upNext.title;

  const footer = document.createElement('div');
  footer.className = 'hero-footer';
  const pillsContainer = document.createElement('div');
  pillsContainer.className = 'hero-pills';

  if (upNext.list_id) {
    const listObj = state.lists.find(l => l.id === upNext.list_id);
    if (listObj) {
      const listPill = document.createElement('span');
      listPill.className = 'pill';
      const nl = listObj.name.toLowerCase();
      if (nl.includes('work')) listPill.classList.add('pill-work');
      else if (nl.includes('personal')) listPill.classList.add('pill-personal');
      else listPill.classList.add('pill-study');
      listPill.textContent = listObj.name;
      pillsContainer.appendChild(listPill);
    }
  }

  if (upNext.priority > 0) {
    const prioPill = document.createElement('span');
    prioPill.className = 'pill';
    if (upNext.priority >= 3) {
      prioPill.classList.add('pill-high');
      prioPill.textContent = 'High';
    } else if (upNext.priority === 2) {
      prioPill.classList.add('pill-med');
      prioPill.textContent = 'Medium';
    } else {
      prioPill.classList.add('pill-low');
      prioPill.textContent = 'Low';
    }
    pillsContainer.appendChild(prioPill);
  }

  const focusBtn = document.createElement('button');
  focusBtn.className = 'btn-start-focus';
  focusBtn.textContent = 'Start focus';
  focusBtn.setAttribute('aria-label', `Start focus on ${upNext.title}`);
  focusBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('tododo:open-focus', { detail: { task: upNext } }));
  });

  footer.append(pillsContainer, focusBtn);
  heroCard.append(label, title, footer);
}

export function renderFilterChips() {
  const container = document.getElementById('filter-row');
  if (!container) return;
  container.replaceChildren();

  const filters = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'completed', label: 'Done' },
  ];

  for (const f of filters) {
    const btn = document.createElement('button');
    btn.className = `filter-chip ${state.activeFilter === f.key ? 'active' : ''}`;
    btn.textContent = f.label;
    btn.setAttribute('aria-label', `Filter ${f.label}`);
    btn.addEventListener('click', () => setFilter(f.key));
    container.appendChild(btn);
  }
}

export function renderTaskList() {
  const container = document.getElementById('task-list-container');
  if (!container) return;
  container.replaceChildren();

  const tasks = getFilteredTasks();
  if (tasks.length === 0) {
    container.appendChild(renderEmptyState());
    return;
  }

  for (const task of tasks) {
    const tile = document.createElement('div');
    tile.className = `task-tile ${task.done ? 'completed' : ''}`;
    tile.setAttribute('tabindex', '0');

    let tileColor = 'var(--list-study)';
    if (task.list_id) {
      const listObj = state.lists.find(l => l.id === task.list_id);
      if (listObj) {
        if (listObj.name.toLowerCase().includes('work')) tileColor = 'var(--list-work)';
        else if (listObj.name.toLowerCase().includes('personal')) tileColor = 'var(--list-personal)';
        else tileColor = listObj.color || 'var(--list-study)';
      }
    }
    if (task.done) tileColor = 'var(--list-done)';
    tile.style.setProperty('--tile-color', tileColor);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', `Mark ${task.title} as ${task.done ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        const rect = checkbox.getBoundingClientRect();
        window.dispatchEvent(new CustomEvent('tododo:task-completed', {
          detail: { x: rect.left + 11, y: rect.top + 11 }
        }));
      }
      await api.toggleTask(task.id);
      refreshTasks();
    });

    const content = document.createElement('div');
    content.className = 'tile-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'tile-title';
    titleEl.textContent = task.title;
    content.appendChild(titleEl);

    if (task.subtask_count > 0 || (task.repeat_rule && task.repeat_rule !== 'none')) {
      const meta = document.createElement('div');
      meta.className = 'tile-meta';
      if (task.subtask_count > 0) {
        const stepSpan = document.createElement('span');
        stepSpan.textContent = `${task.subtasks_done}/${task.subtask_count} steps`;
        meta.appendChild(stepSpan);
      }
      if (task.repeat_rule && task.repeat_rule !== 'none') {
        const repSpan = document.createElement('span');
        repSpan.textContent = `· ${task.repeat_rule}`;
        meta.appendChild(repSpan);
      }
      content.appendChild(meta);
    }

    content.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('tododo:open-task-sheet', { detail: { task } }));
    });

    const right = document.createElement('div');
    right.className = 'tile-right';
    if (task.due_at) {
      const timeEl = document.createElement('span');
      timeEl.className = 'tile-time';
      const d = new Date(task.due_at);
      timeEl.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      right.appendChild(timeEl);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-tile-delete';
    delBtn.setAttribute('aria-label', `Delete task ${task.title}`);
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      state.lastDeletedTask = task;
      await api.deleteTask(task.id);
      showUndoToast(task);
      refreshTasks();
    });
    right.appendChild(delBtn);

    tile.append(checkbox, content, right);
    container.appendChild(tile);
  }
}

function renderEmptyState() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:24px 16px; text-align:center;';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 36px; margin-bottom: 8px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'font-family: var(--font-heading); font-size: 16px; font-weight: 700; color: var(--ink);';

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size: 12px; color: var(--muted); margin-top: 4px;';

  if (state.activeFilter === 'completed') {
    icon.textContent = '✨';
    heading.textContent = 'All caught up!';
    sub.textContent = 'Completed items will show up here';
  } else if (state.activeFilter === 'overdue') {
    icon.textContent = '🌤️';
    heading.textContent = 'No overdue tasks';
    sub.textContent = 'You are right on track!';
  } else {
    icon.textContent = '🍃';
    heading.textContent = 'Clear skies';
    sub.textContent = 'Add a task below to start your flow';
  }

  box.append(icon, heading, sub);
  return box;
}

export function showUndoToast(task) {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  toastContainer.replaceChildren();

  const toast = document.createElement('div');
  toast.className = 'toast';
  const msg = document.createElement('span');
  msg.textContent = 'Task deleted';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'btn-undo';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', async () => {
    if (state.lastDeletedTask) {
      const t = state.lastDeletedTask;
      await api.addTask(t.title, t.priority, t.list_id, t.due_at);
      state.lastDeletedTask = null;
      toastContainer.replaceChildren();
      refreshTasks();
    }
  });

  toast.append(msg, undoBtn);
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toastContainer.contains(toast)) toastContainer.replaceChildren();
  }, 4500);
}
