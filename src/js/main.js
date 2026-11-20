// Main Application Controller (Responsive Size Memory, Drawer Defaults & Perspectives)
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
    updatePerspectiveBadge();
  });

  await initStore();
  initTaskSheet();
  initFocusSheet();
  initSettingsSheet();

  document.getElementById('btn-open-focus-header')?.addEventListener('click', () => openFocusSheet(null));

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

  // Window drag resizing memory
  window.addEventListener('resize', () => {
    if (!document.body.classList.contains('glance-mode')) {
      localStorage.setItem('tododo_widget_width', window.innerWidth.toString());
      localStorage.setItem('tododo_widget_height', window.innerHeight.toString());
    }
  });

  let dPrio = null, dListId = null, dRep = 'none';
  const drawer = document.getElementById('add-task-drawer');
  document.getElementById('btn-toggle-drawer')?.addEventListener('click', () => {
    if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
  });

  drawer?.querySelectorAll('.drawer-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type'), val = btn.getAttribute('data-val');
      btn.parentElement?.querySelectorAll('.drawer-opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (type === 'prio') dPrio = val === '0' ? 0 : parseInt(val, 10);
      else if (type === 'rep') dRep = val;
      else if (type === 'list') dListId = val === 'none' ? null : parseInt(val, 10);
    });
  });

  function resetDrawerDefaults() {
    dPrio = null; dListId = null; dRep = 'none';
    drawer?.querySelectorAll('.drawer-opt-btn').forEach(btn => {
      const val = btn.getAttribute('data-val');
      btn.classList.toggle('active', val === 'none' || val === '0');
    });
    populateDrawerLists();
    const ni = document.getElementById('drawer-notes-input');
    if (ni) ni.value = '';
  }

  function populateDrawerLists() {
    const row = document.getElementById('drawer-lists-row');
    if (!row) return;
    row.replaceChildren();
    row.appendChild(Object.assign(document.createElement('span'), { className: 'drawer-label', textContent: 'List:' }));
    const inb = Object.assign(document.createElement('button'), { className: `drawer-opt-btn ${dListId === null ? 'active' : ''}`, textContent: 'Inbox' });
    inb.addEventListener('click', () => { dListId = null; row.querySelectorAll('.drawer-opt-btn').forEach(b => b.classList.remove('active')); inb.classList.add('active'); });
    row.appendChild(inb);
    for (const l of state.lists) {
      const b = Object.assign(document.createElement('button'), { className: `drawer-opt-btn ${dListId === l.id ? 'active' : ''}`, textContent: l.name });
      b.addEventListener('click', () => { dListId = l.id; row.querySelectorAll('.drawer-opt-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
      row.appendChild(b);
    }
  }

  const addInput = document.getElementById('add-task-input'), addBtn = document.getElementById('btn-add-task');
  const liveChips = document.getElementById('live-chips-preview');

  function updateLiveChips(val) {
    if (!liveChips) return;
    liveChips.replaceChildren();
    if (!val.trim()) return;
    const p = parseQuickAdd(val, state.lists);
    if (p.priorityLabel) liveChips.appendChild(Object.assign(document.createElement('span'), { className: 'chip-preview prio-high', textContent: `⚡ ${p.priorityLabel}` }));
    if (p.listName) liveChips.appendChild(Object.assign(document.createElement('span'), { className: 'chip-preview list', textContent: `🏷️ ${p.listName}` }));
  }

  async function handleAddTask() {
    if (!addInput) return;
    const val = addInput.value.trim();
    if (!val) return;
    const p = parseQuickAdd(val, state.lists);
    const prio = dPrio !== null ? dPrio : p.priority;
    const listId = dListId !== null ? dListId : (state.selectedListId !== 'all' ? state.selectedListId : p.listId);
    try {
      const task = await api.addTask(p.cleanTitle, prio, listId, null);
      const notes = document.getElementById('drawer-notes-input')?.value?.trim();
      if ((notes || dRep !== 'none') && task?.id) await api.updateTask(task.id, { notes: notes || '', repeatRule: dRep });
      addInput.value = '';
      if (liveChips) liveChips.replaceChildren();
      if (drawer) drawer.style.display = 'none';
      resetDrawerDefaults();
      await refreshTasks();
    } catch (err) { console.error('Add task error:', err); }
  }

  if (addInput) {
    addInput.addEventListener('input', (e) => updateLiveChips(e.target.value));
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); } });
  }
  if (addBtn) addBtn.addEventListener('click', handleAddTask);

  const searchBox = document.getElementById('search-container'), searchInp = document.getElementById('search-input');
  document.getElementById('btn-toggle-search')?.addEventListener('click', () => {
    if (searchBox?.classList.toggle('active')) searchInp?.focus();
    else { setSearchQuery(''); if (searchInp) searchInp.value = ''; }
  });
  searchInp?.addEventListener('input', (e) => setSearchQuery(e.target.value));
  document.getElementById('btn-close-search')?.addEventListener('click', () => { searchBox?.classList.remove('active'); if (searchInp) searchInp.value = ''; setSearchQuery(''); });

  const guideModal = document.getElementById('guide-modal-overlay');
  document.getElementById('btn-open-guide')?.addEventListener('click', () => { if (guideModal) guideModal.style.display = 'flex'; });
  document.getElementById('btn-close-guide')?.addEventListener('click', () => { if (guideModal) guideModal.style.display = 'none'; });

  async function restoreNormalWindow() {
    document.body.classList.remove('glance-mode');
    const w = parseInt(localStorage.getItem('tododo_widget_width'), 10) || 350;
    const h = parseInt(localStorage.getItem('tododo_widget_height'), 10) || 520;
    await api.resizeWindow(w, h);
  }

  document.getElementById('btn-collapse-glance')?.addEventListener('click', async () => {
    document.body.classList.add('glance-mode');
    updateGlanceBar();
    await api.resizeWindow((state.capsuleWidth || 220) + 12, 54);
  });
  document.getElementById('btn-expand-glance')?.addEventListener('click', restoreNormalWindow);
  document.getElementById('btn-close-widget')?.addEventListener('click', async () => {
    if (document.body.classList.contains('glance-mode')) {
      await restoreNormalWindow();
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

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault(); searchBox?.classList.add('active'); searchInp?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && state.lastDeletedTask) {
      e.preventDefault();
      const t = state.lastDeletedTask;
      api.addTask(t.title, t.priority, t.list_id, null).then(() => {
        state.lastDeletedTask = null;
        document.getElementById('toast-container')?.replaceChildren();
        refreshTasks();
      });
    }
    if (e.key === 'Escape') {
      [guideModal, perspectiveModal].forEach(m => { if (m) m.style.display = 'none'; });
      if (document.body.classList.contains('glance-mode')) restoreNormalWindow();
    }
  });

  updatePerspectiveBadge();
  setInterval(updatePerspectiveBadge, 60000);
});

function updatePerspectiveBadge() {
  const btn = document.getElementById('btn-day-progress');
  if (!btn) return;
  const now = new Date();
  const minPassed = now.getHours() * 60 + now.getMinutes();
  const pctDay = Math.round((minPassed / 1440) * 100);
  const hLeft = 23 - now.getHours(), mLeft = 59 - now.getMinutes();
  btn.textContent = `⏳ ${hLeft}h ${mLeft}m left (${pctDay}%)`;
}

function updateGlanceBar() {
  const upNext = getUpNextTask();
  const titleEl = document.getElementById('glance-task-title');
  const metaEl = document.getElementById('glance-task-meta');
  const circleEl = document.getElementById('glance-progress-circle');
  const pending = state.tasks.filter(t => !t.done), done = state.tasks.filter(t => t.done);
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
  const minPassed = now.getHours() * 60 + now.getMinutes();
  const pctDay = Math.round((minPassed / 1440) * 100);
  const hLeft = 23 - now.getHours(), mLeft = 59 - now.getMinutes();
  const dow = now.getDay(), pctWeek = Math.round(((dow * 1440 + minPassed) / 10080) * 100);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pctMonth = Math.round((now.getDate() / dim) * 100);
  const soy = new Date(now.getFullYear(), 0, 1), doy = Math.floor((now - soy) / 86400000);
  const pctYear = Math.round((doy / 365) * 100), daysLeftYear = 365 - doy;

  const cards = [
    { title: '☀️ Day Progress', val: `${pctDay}%`, sub: `${hLeft}h ${mLeft}m left until midnight`, pct: pctDay, col: 'var(--pastel-peach)' },
    { title: '📅 Week Progress', val: `${pctWeek}%`, sub: `${7 - dow} days left in week`, pct: pctWeek, col: 'var(--pastel-lilac)' },
    { title: '🗓️ Month Progress', val: `${pctMonth}%`, sub: `${dim - now.getDate()} days left in ${now.toLocaleString('default', { month: 'short' })}`, pct: pctMonth, col: 'var(--pastel-mint)' },
    { title: '🌍 Year Progress', val: `${pctYear}%`, sub: `${daysLeftYear} days remaining in ${now.getFullYear()}`, pct: pctYear, col: 'var(--accent)' },
    { title: '🎉 New Year Countdown', val: `${daysLeftYear} days`, sub: `Jan 1, ${now.getFullYear() + 1}`, pct: 100 - pctYear, col: 'var(--pastel-butter)' },
  ];

  for (const c of cards) {
    const card = document.createElement('div'); card.className = 'perspective-card';
    card.innerHTML = `<div class="perspective-title-row"><span>${c.title}</span><b>${c.val}</b></div><div class="perspective-bar-bg"><div class="perspective-bar-fill" style="width:${Math.min(100, Math.max(0, c.pct))}%; background:${c.col};"></div></div><span style="font-size:11px; color:var(--muted);">${c.sub}</span>`;
    container.appendChild(card);
  }

  // Custom User Countdowns
  let customEvents = [];
  try { customEvents = JSON.parse(localStorage.getItem('tododo_events') || '[]'); } catch {}

  const evSection = document.createElement('div');
  evSection.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:6px; border-top:1px solid rgba(43,35,64,0.08); padding-top:8px;';
  evSection.appendChild(Object.assign(document.createElement('span'), { style: 'font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase;', textContent: 'Custom Countdowns & Events' }));

  customEvents.forEach((ev, idx) => {
    const target = new Date(ev.date), diff = Math.ceil((target - now) / 86400000);
    const evCard = document.createElement('div'); evCard.className = 'perspective-card'; evCard.style.padding = '8px 10px';
    const r = document.createElement('div'); r.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-size:12px;';
    r.innerHTML = `<span><b>${ev.name}</b> <small style="color:var(--muted);">(${ev.date})</small></span><span><b>${diff > 0 ? `${diff}d left` : (diff === 0 ? 'Today!' : 'Passed')}</b></span>`;
    const del = Object.assign(document.createElement('button'), { className: 'btn-delete-list-chip', textContent: '✕', title: 'Delete event' });
    del.addEventListener('click', () => { customEvents.splice(idx, 1); localStorage.setItem('tododo_events', JSON.stringify(customEvents)); renderPerspectiveModal(); });
    r.appendChild(del);
    evCard.appendChild(r);
    evSection.appendChild(evCard);
  });

  const addRow = document.createElement('div'); addRow.style.cssText = 'display:flex; gap:6px; margin-top:4px;';
  const nameInp = Object.assign(document.createElement('input'), { className: 'step-add-input', placeholder: 'Event name (e.g. Birthday, Exam)...', style: 'flex:1;' });
  const dateInp = Object.assign(document.createElement('input'), { type: 'date', className: 'step-add-input', style: 'width:115px;' });
  const addBtn = Object.assign(document.createElement('button'), { className: 'btn-start-focus', textContent: 'Add', style: 'padding:4px 12px; font-size:11px;' });
  addBtn.addEventListener('click', () => {
    if (nameInp.value.trim() && dateInp.value) {
      customEvents.push({ name: nameInp.value.trim(), date: dateInp.value });
      localStorage.setItem('tododo_events', JSON.stringify(customEvents));
      renderPerspectiveModal();
    }
  });
  addRow.append(nameInp, dateInp, addBtn);
  evSection.appendChild(addRow);
  container.appendChild(evSection);
}
