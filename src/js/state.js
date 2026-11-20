// Central State Store
import { api } from './api.js';

export const state = {
  tasks: [],
  lists: [],
  activeFilter: 'all',
  selectedListId: 'all',
  searchQuery: '',
  activeTask: null,
  accent: '#8B74F0',
  frostOpacity: 0.58,
  widgetOpacity: 0.58,
  capsuleWidth: 220,
  capsuleOpacity: 0.45,
  calmMode: false,
  soundsEnabled: false,
  stayOnTop: false,
  lastDeletedTask: null,
  listeners: new Set(),
};

export function subscribe(listener) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function notify() {
  for (const listener of state.listeners) {
    try {
      listener(state);
    } catch (e) {
      console.error('[State Listener Error]', e);
    }
  }
}

export async function initStore() {
  try {
    const [tasks, lists, settings] = await Promise.all([
      api.getTasks(state.activeFilter),
      api.getLists(),
      api.getSettings(),
    ]);

    state.tasks = tasks || [];
    state.lists = lists || [];

    if (settings) {
      if (settings.accent) state.accent = settings.accent;
      if (settings.frost_opacity) state.frostOpacity = parseFloat(settings.frost_opacity) || 0.58;
      if (settings.widget_opacity) state.widgetOpacity = parseFloat(settings.widget_opacity) || 0.58;
      if (settings.capsule_width) state.capsuleWidth = parseInt(settings.capsule_width, 10) || 220;
      if (settings.capsule_opacity) state.capsuleOpacity = parseFloat(settings.capsule_opacity) || 0.45;
      if (settings.calm_mode) state.calmMode = settings.calm_mode === 'true';
      if (settings.sounds_enabled) state.soundsEnabled = settings.sounds_enabled === 'true';
      if (settings.stay_on_top) state.stayOnTop = settings.stay_on_top === 'true';
    }

    applyThemeSettings();
    notify();
  } catch (err) {
    console.error('Failed to initStore:', err);
  }
}

export async function refreshTasks() {
  try {
    state.tasks = await api.getTasks(state.activeFilter) || [];
    notify();
  } catch (err) {
    console.error('Failed to refresh tasks:', err);
  }
}

export function setFilter(filter) {
  state.activeFilter = filter;
  refreshTasks();
}

export function setSelectedList(listId) {
  state.selectedListId = listId;
  notify();
}

export function setSearchQuery(query) {
  state.searchQuery = (query || '').toLowerCase().trim();
  notify();
}

export function applyThemeSettings() {
  document.documentElement.style.setProperty('--accent', state.accent);
  document.documentElement.style.setProperty('--frost-opacity', state.frostOpacity);
  document.documentElement.style.setProperty('--widget-opacity', state.widgetOpacity);
  document.documentElement.style.setProperty('--capsule-width', `${state.capsuleWidth}px`);
  document.documentElement.style.setProperty('--capsule-opacity', state.capsuleOpacity);
  if (state.calmMode) {
    document.body.classList.add('calm-mode');
  } else {
    document.body.classList.remove('calm-mode');
  }
}

export function getFilteredTasks() {
  let list = [...state.tasks];
  if (state.selectedListId !== 'all') {
    list = list.filter(t => state.selectedListId === null ? !t.list_id : t.list_id === state.selectedListId);
  }
  if (state.searchQuery) {
    list = list.filter(t =>
      (t.title && t.title.toLowerCase().includes(state.searchQuery)) ||
      (t.notes && t.notes.toLowerCase().includes(state.searchQuery))
    );
  }
  return list;
}

export function getUpNextTask() {
  const pending = state.tasks.filter(t => !t.done);
  if (!pending.length) return null;
  const pinned = pending.filter(t => t.pinned);
  if (pinned.length) return pinned[0];
  const byPrio = [...pending].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return byPrio[0];
}
