// Main Application Controller (All Stages + Interactive Drawer & Perspectives)
import { api } from './api.js';
import { state, initStore, subscribe, setSearchQuery, refreshTasks, getUpNextTask } from './state.js';
import { renderApp } from './render.js';
import { parseQuickAdd } from './parse.js';
import { initTaskSheet } from './taskSheet.js';
import { initFocusSheet, openFocusSheet } from './focus.js';
import { initSettingsSheet } from './settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  subscribe(() => {
    renderApp();
    updateGlanceBar();
    populateDrawerLists();
  });

  await initStore();
  initTaskSheet();
  initFocusSheet();
  initSettingsSheet();

  // Dedicated Focus Button in Header (Works even if no tasks)
  document.getElementById('btn-open-focus-header')?.addEventListener('click', () => openFocusSheet(null));

  // Time & Life Perspective Modal
  const btnDayProgress = document.getElementById('btn-day-progress');
  const perspectiveModal = document.getElementById('time-perspective-modal');
  const btnClosePerspective = document.getElementById('btn-close-perspective');

  if (btnDayProgress && perspectiveModal) {
    btnDayProgress.addEventListener('click', () => { renderPerspectiveModal(); perspectiveModal.style.display = 'flex'; });
  }
  if (btnClosePerspective && perspectiveModal) {
    btnClosePerspective.addEventListener('click', () => { perspectiveModal.style.display = 'none'; });
    perspectiveModal.addEventListener('click', (e) => { if (e.target === perspectiveModal) perspectiveModal.style.display = 'none'; });
  }

  // Interactive Add-Task Drawer State
  let dPrio = null;
  let dListId = null;
  let dDue = null;
  let dRep = 'none';

  const drawer = document.getElementById('add-task-drawer');
  const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
  if (btnToggleDrawer && drawer) {
    btnToggleDrawer.addEventListener('click', () => {
      drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
    });
  }

  function setupDrawerOptions() {
    drawer?.querySelectorAll('.drawer-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const val = btn.getAttribute('data-val');
        btn.parentElement?.querySelectorAll('.drawer-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (type === 'prio') dPrio = val === '0' ? 0 : parseInt(val, 10);
        else if (type === 'due') {
          if (val === 'none') dDue = null;
          else if (val === 'today') { const d = new Date(); d.setHours(18, 0, 0, 0); dDue = d.toISOString(); }
          else if (val === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); dDue = d.toISOString(); }
        } else if (type === 'rep') dRep = val;
        else if (type === 'list') dListId = val === 'none' ? null : parseInt(val, 10);
      });
    });
  }
  setupDrawerOptions();

  function populateDrawerLists() {
    const row = document.getElementById('drawer-lists-row');
    if (!row) return;
    const inboxBtn = row.firstElementChild ? row.children[1] : null;
    row.replaceChildren();
    const lbl = document.createElement('span'); lbl.className = 'drawer-label'; lbl.textContent = 'List:'; row.appendChild(lbl);
    const inb = document.createElement('button'); inb.className = `drawer-opt-btn ${dListId === null ? 'active' : ''}`;
    inb.setAttribute('data-type', 'list'); inb.setAttribute('data-val', 'none'); inb.textContent = 'Inbox';
    inb.addEventListener('click', () => { dListId = null; row.querySelectorAll('.drawer-opt-btn').forEach(b => b.classList.remove('active')); inb.classList.add('active'); });
    row.appendChild(inb);
    for (const l of state.lists) {
      const b = document.createElement('button'); b.className = `drawer-opt-btn ${dListId === l.id ? 'active' : ''}`;
      b.setAttribute('data-type', 'list'); b.setAttribute('data-val', l.id); b.textContent = l.name;
      b.addEventListener('click', () => { dListId = l.id; row.querySelectorAll('.drawer-opt-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
      row.appendChild(b);
    }
  }

  // Add Task & Live Chips
  const addInput = document.getElementById('add-task-input');
  const addBtn = document.getElementById('btn-add-task');
  const liveChipsContainer = document.getElementById('live-chips-preview');

  function updateLiveChips(rawVal) {
    if (!liveChipsContainer) return;
    liveChipsContainer.replaceChildren();
    if (!rawVal.trim()) return;
    const parsed = parseQuickAdd(rawVal, state.lists);
    if (parsed.dueLabel) liveChipsContainer.appendChild(Object.assign(document.createElement('span'), { className: 'chip-preview due', textContent: `📅 ${parsed.dueLabel}` }));
    if (parsed.priorityLabel) liveChipsContainer.appendChild(Object.assign(document.createElement('span'), { className: 'chip-preview prio-high', textContent: `⚡ ${parsed.priorityLabel}` }));
    if (parsed.listName) liveChipsContainer.appendChild(Object.assign(document.createElement('span'), { className: 'chip-preview list', textContent: `🏷️ ${parsed.listName}` }));
  }

  async function handleAddTask() {
    if (!addInput) return;
    const rawVal = addInput.value.trim();
    if (!rawVal) return;
    const parsed = parseQuickAdd(rawVal, state.lists);
    const finalPrio = dPrio !== null ? dPrio : parsed.priority;
    const finalListId = dListId !== null ? dListId : (state.selectedListId !== 'all' ? state.selectedListId : parsed.listId);
    const finalDue = dDue !== null ? dDue : parsed.dueAt;
    try {
      const task = await api.addTask(parsed.cleanTitle, finalPrio, finalListId, finalDue);
      const notesVal = document.getElementById('drawer-notes-input')?.value?.trim();
      if ((notesVal || dRep !== 'none') && task?.id) {
        await api.updateTask(task.id, { notes: notesVal || '', repeatRule: dRep });
      }
      addInput.value = '';
      if (document.getElementById('drawer-notes-input')) document.getElementById('drawer-notes-input').value = '';
      if (liveChipsContainer) liveChipsContainer.replaceChildren();
      if (drawer) drawer.style.display = 'none';
      await refreshTasks();
    } catch (err) { console.error('Failed to add task:', err); }
  }

  if (addInput) {
    addInput.addEventListener('input', (e) => updateLiveChips(e.target.value));
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); } });
  }
  if (addBtn) addBtn.addEventListener('click', handleAddTask);

  // Search Toggle
  const searchToggleBtn = document.getElementById('btn-toggle-search');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchCloseBtn = document.getElementById('btn-close-search');
  if (searchToggleBtn && searchContainer && searchInput) {
    searchToggleBtn.addEventListener('click', () => {
      if (searchContainer.classList.toggle('active')) searchInput.focus();
      else { setSearchQuery(''); searchInput.value = ''; }
    });
    searchInput.addEventListener('input', (e) => setSearchQuery(e.target.value));
    searchCloseBtn?.addEventListener('click', () => { searchContainer.classList.remove('active'); searchInput.value = ''; setSearchQuery(''); });
  }

  // Guide Modal
  const btnOpenGuide = document.getElementById('btn-open-guide');
  const btnCloseGuide = document.getElementById('btn-close-guide');
  const guideOverlay = document.getElementById('guide-modal-overlay');
  if (btnOpenGuide && guideOverlay) btnOpenGuide.addEventListener('click', () => { guideOverlay.style.display = 'flex'; });
  if (btnCloseGuide && guideOverlay) {
    btnCloseGuide.addEventListener('click', () => { guideOverlay.style.display = 'none'; });
    guideOverlay.addEventListener('click', (e) => { if (e.target === guideOverlay) guideOverlay.style.display = 'none'; });
  }

  // Glance Pill Mini View Toggle
  const btnCollapseGlance = document.getElementById('btn-collapse-glance');
  const btnExpandGlance = document.getElementById('btn-expand-glance');
  const btnCloseWidget = document.getElementById('btn-close-widget');

  if (btnCollapseGlance) {
    btnCollapseGlance.addEventListener('click', async () => {
      document.body.classList.add('glance-mode');
      updateGlanceBar();
      await api.resizeWindow((state.capsuleWidth || 220) + 12, 54);
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

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault(); searchContainer?.classList.add('active'); searchInput?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (state.lastDeletedTask) {
        e.preventDefault();
        const t = state.lastDeletedTask;
        api.addTask(t.title, t.priority, t.list_id, t.due_at).then(() => {
          state.lastDeletedTask = null;
          document.getElementById('toast-container')?.replaceChildren();
          refreshTasks();
        });
      }
    }
    if (e.key === 'Escape') {
      [guideOverlay, perspectiveModal].forEach(m => { if (m) m.style.display = 'none'; });
      if (document.body.classList.contains('glance-mode')) {
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
  if (titleEl) titleEl.textContent = upNext ? upNext.title : 'All clear for now';
  if (metaEl) metaEl.textContent = `${pending.length} left`;
  if (circleEl && state.tasks.length > 0) {
    circleEl.style.strokeDashoffset = 87.96 * (1 - (done.length / state.tasks.length));
  }
}

function renderPerspectiveModal() {
  const container = document.getElementById('perspective-content');
  if (!container) return;
  container.replaceChildren();

  const now = new Date();
  const minPassedToday = now.getHours() * 60 + now.getMinutes();
  const pctDay = Math.round((minPassedToday / 1440) * 100);
  const hoursLeftToday = 23 - now.getHours();
  const minsLeftToday = 59 - now.getMinutes();

  const dayOfWeek = now.getDay();
  const pctWeek = Math.round(((dayOfWeek * 1440 + minPassedToday) / 10080) * 100);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pctMonth = Math.round((now.getDate() / daysInMonth) * 100);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  const pctYear = Math.round((dayOfYear / 365) * 100);
  const daysLeftYear = 365 - dayOfYear;

  const cards = [
    { title: '☀️ Day Progress', val: `${pctDay}%`, sub: `${hoursLeftToday}h ${minsLeftToday}m remaining until midnight`, pct: pctDay, color: 'var(--pastel-peach)' },
    { title: '📅 Week Progress', val: `${pctWeek}%`, sub: `${7 - dayOfWeek} days left in this week`, pct: pctWeek, color: 'var(--pastel-lilac)' },
    { title: '🗓️ Month Progress', val: `${pctMonth}%`, sub: `${daysInMonth - now.getDate()} days remaining in ${now.toLocaleString('default', { month: 'long' })}`, pct: pctMonth, color: 'var(--pastel-mint)' },
    { title: '🌍 Year Progress', val: `${pctYear}%`, sub: `${daysLeftYear} days remaining until ${now.getFullYear() + 1}`, pct: pctYear, color: 'var(--accent)' },
    { title: '🎉 New Year Countdown', val: `${daysLeftYear} days`, sub: `Jan 1, ${now.getFullYear() + 1}`, pct: 100 - pctYear, color: 'var(--pastel-butter)' },
  ];

  for (const c of cards) {
    const card = document.createElement('div'); card.className = 'perspective-card';
    const row = document.createElement('div'); row.className = 'perspective-title-row';
    row.innerHTML = `<span>${c.title}</span><span style="font-weight:700;">${c.val}</span>`;
    const barBg = document.createElement('div'); barBg.className = 'perspective-bar-bg';
    const fill = document.createElement('div'); fill.className = 'perspective-bar-fill';
    fill.style.width = `${Math.min(100, Math.max(0, c.pct))}%`; fill.style.background = c.color;
    barBg.appendChild(fill);
    const sub = document.createElement('span'); sub.style.cssText = 'font-size:11px; color:var(--muted);'; sub.textContent = c.sub;
    card.append(row, barBg, sub);
    container.appendChild(card);
  }
}
