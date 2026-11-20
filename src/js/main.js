// Main Application Controller (All Stages Integrated)
import { api } from './api.js';
import { state, initStore, subscribe, setSearchQuery, refreshTasks, getUpNextTask } from './state.js';
import { renderApp } from './render.js';
import { parseQuickAdd } from './parse.js';
import { initTaskSheet } from './taskSheet.js';
import { initFocusSheet } from './focus.js';
import { initSettingsSheet } from './settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  subscribe(() => {
    renderApp();
    updateGlanceBar();
  });

  await initStore();
  initTaskSheet();
  initFocusSheet();
  initSettingsSheet();

  // Add Task & Live Chips
  const addInput = document.getElementById('add-task-input');
  const addBtn = document.getElementById('btn-add-task');
  const liveChipsContainer = document.getElementById('live-chips-preview');

  function updateLiveChips(rawVal) {
    if (!liveChipsContainer) return;
    liveChipsContainer.replaceChildren();
    if (!rawVal.trim()) return;

    const parsed = parseQuickAdd(rawVal, state.lists);
    if (parsed.dueLabel) {
      const chip = document.createElement('span');
      chip.className = 'chip-preview due';
      chip.textContent = `📅 ${parsed.dueLabel}`;
      liveChipsContainer.appendChild(chip);
    }
    if (parsed.priorityLabel) {
      const chip = document.createElement('span');
      chip.className = 'chip-preview prio-high';
      chip.textContent = `⚡ ${parsed.priorityLabel}`;
      liveChipsContainer.appendChild(chip);
    }
    if (parsed.listName) {
      const chip = document.createElement('span');
      chip.className = 'chip-preview list';
      chip.textContent = `🏷️ ${parsed.listName}`;
      liveChipsContainer.appendChild(chip);
    }
  }

  async function handleAddTask() {
    if (!addInput) return;
    const rawVal = addInput.value.trim();
    if (!rawVal) return;

    const parsed = parseQuickAdd(rawVal, state.lists);
    try {
      await api.addTask(parsed.cleanTitle, parsed.priority, parsed.listId, parsed.dueAt);
      addInput.value = '';
      if (liveChipsContainer) liveChipsContainer.replaceChildren();
      await refreshTasks();
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }

  if (addInput) {
    addInput.addEventListener('input', (e) => updateLiveChips(e.target.value));
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); }
    });
  }
  if (addBtn) addBtn.addEventListener('click', handleAddTask);

  // Search Toggle
  const searchToggleBtn = document.getElementById('btn-toggle-search');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchCloseBtn = document.getElementById('btn-close-search');

  if (searchToggleBtn && searchContainer && searchInput) {
    searchToggleBtn.addEventListener('click', () => {
      const isOpen = searchContainer.classList.toggle('active');
      if (isOpen) searchInput.focus();
      else { setSearchQuery(''); searchInput.value = ''; }
    });
    searchInput.addEventListener('input', (e) => setSearchQuery(e.target.value));
    if (searchCloseBtn) {
      searchCloseBtn.addEventListener('click', () => {
        searchContainer.classList.remove('active');
        searchInput.value = '';
        setSearchQuery('');
      });
    }
  }

  // Smart Input Guide Modal
  const btnOpenGuide = document.getElementById('btn-open-guide');
  const btnCloseGuide = document.getElementById('btn-close-guide');
  const guideOverlay = document.getElementById('guide-modal-overlay');
  if (btnOpenGuide && guideOverlay) {
    btnOpenGuide.addEventListener('click', () => { guideOverlay.style.display = 'flex'; });
  }
  if (btnCloseGuide && guideOverlay) {
    btnCloseGuide.addEventListener('click', () => { guideOverlay.style.display = 'none'; });
    guideOverlay.addEventListener('click', (e) => {
      if (e.target === guideOverlay) guideOverlay.style.display = 'none';
    });
  }

  // Glance Pill Mini View Toggle (Stage 4)
  const btnCollapseGlance = document.getElementById('btn-collapse-glance');
  const btnExpandGlance = document.getElementById('btn-expand-glance');
  const btnCloseWidget = document.getElementById('btn-close-widget');

  if (btnCollapseGlance) {
    btnCollapseGlance.addEventListener('click', async () => {
      document.body.classList.add('glance-mode');
      updateGlanceBar();
      const capW = (state.capsuleWidth || 220) + 12;
      await api.resizeWindow(capW, 54);
    });
  }
  if (btnExpandGlance) {
    btnExpandGlance.addEventListener('click', async () => {
      document.body.classList.remove('glance-mode');
      await api.resizeWindow(360, 480);
    });
  }
  if (btnCloseWidget) {
    btnCloseWidget.addEventListener('click', async () => {
      if (document.body.classList.contains('glance-mode')) {
        document.body.classList.remove('glance-mode');
        await api.resizeWindow(360, 480);
        return;
      }
      const openSheet = document.querySelector('.sheet.active');
      if (openSheet) {
        openSheet.classList.remove('active');
        document.querySelector('.glass-surface')?.classList.remove('sheet-open');
        return;
      }
      await api.closeWindow();
    });
  }

  // Confetti Completion Event
  window.addEventListener('tododo:task-completed', (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { x, y } = e.detail || {};
    spawnConfettiBurst(x || window.innerWidth / 2, y || window.innerHeight / 2);
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      if (searchContainer && searchInput) {
        searchContainer.classList.add('active');
        searchInput.focus();
      }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (state.lastDeletedTask) {
        e.preventDefault();
        const t = state.lastDeletedTask;
        api.addTask(t.title, t.priority, t.list_id, t.due_at).then(() => {
          state.lastDeletedTask = null;
          const tc = document.getElementById('toast-container');
          if (tc) tc.replaceChildren();
          refreshTasks();
        });
      }
    }
    if (e.key === ' ' && document.activeElement?.classList.contains('task-tile')) {
      e.preventDefault();
      const cb = document.activeElement.querySelector('.task-checkbox');
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    }
    if (e.key === 'Escape') {
      if (guideOverlay && guideOverlay.style.display !== 'none') {
        guideOverlay.style.display = 'none';
      } else if (document.body.classList.contains('glance-mode')) {
        document.body.classList.remove('glance-mode');
        api.resizeWindow(360, 480);
      }
    }
  });
});

function updateGlanceBar() {
  const upNext = getUpNextTask();
  const titleEl = document.getElementById('glance-task-title');
  const metaEl = document.getElementById('glance-task-meta');
  const circleEl = document.getElementById('glance-progress-circle');

  const pending = state.tasks.filter(t => !t.done);
  const done = state.tasks.filter(t => t.done);
  const total = state.tasks.length;

  if (titleEl) titleEl.textContent = upNext ? upNext.title : 'All clear for now';
  if (metaEl) metaEl.textContent = `${pending.length} left · ${done.length} done`;

  if (circleEl && total > 0) {
    const fraction = done.length / total;
    const circ = 2 * Math.PI * 14;
    circleEl.style.strokeDashoffset = circ * (1 - fraction);
  }
}

function spawnConfettiBurst(x, y) {
  const colors = ['#FFC9B5', '#D4C4FF', '#BDEBD6', '#FFE08A', '#BFE3FF', '#8B74F0'];
  for (let i = 0; i < 6; i++) {
    const dot = document.createElement('div');
    const angle = (i * 60) * (Math.PI / 180);
    const dist = 24 + Math.random() * 12;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;

    dot.style.cssText = `
      position: fixed; width: 6px; height: 6px; border-radius: 50%;
      background: ${colors[i % colors.length]};
      left: ${x}px; top: ${y}px; pointer-events: none; z-index: 999;
      transition: transform 300ms cubic-bezier(0, .8, .2, 1), opacity 300ms ease;
    `;
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
      dot.style.opacity = '0';
    });
    setTimeout(() => dot.remove(), 320);
  }
}
