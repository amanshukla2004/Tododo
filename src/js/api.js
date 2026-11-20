// Central Tauri IPC API wrapper

async function invokeTauri(cmd, args = {}) {
  try {
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
      return await window.__TAURI__.invoke(cmd, args);
    }
    console.warn(`[API Mock] Invoking ${cmd} with:`, args);
    return mockFallback(cmd, args);
  } catch (err) {
    console.error(`[API Error] ${cmd}:`, err);
    throw err;
  }
}

export const api = {
  getTasks: (filter = 'all') => invokeTauri('get_tasks', { filter }),
  addTask: (title, priority = 0, listId = null, dueAt = null) =>
    invokeTauri('add_task', { title, priority, listId, dueAt }),
  toggleTask: (id) => invokeTauri('toggle_task', { id }),
  updateTask: (id, updates = {}) => invokeTauri('update_task', { id, ...updates }),
  deleteTask: (id) => invokeTauri('delete_task', { id }),
  clearCompleted: () => invokeTauri('clear_completed'),
  reorderTasks: (taskIds) => invokeTauri('reorder_tasks', { taskIds }),

  getLists: () => invokeTauri('get_lists'),
  addList: (name, color = '#8B74F0') => invokeTauri('add_list', { name, color }),
  deleteList: (id) => invokeTauri('delete_list', { id }),

  getSubtasks: (taskId) => invokeTauri('get_subtasks', { taskId }),
  addSubtask: (taskId, title) => invokeTauri('add_subtask', { taskId, title }),
  toggleSubtask: (id) => invokeTauri('toggle_subtask', { id }),
  deleteSubtask: (id) => invokeTauri('delete_subtask', { id }),

  logPomodoroSession: (taskId = null, minutes = 25) =>
    invokeTauri('log_pomodoro_session', { taskId, minutes }),
  getPomodoroStats: () => invokeTauri('get_pomodoro_stats'),

  getSettings: () => invokeTauri('get_settings'),
  saveSetting: (key, value) => invokeTauri('save_setting', { key, value }),
  snoozeTask: (id, minutes = 10) => invokeTauri('snooze_task', { id, minutes }),

  exportData: () => invokeTauri('export_data'),
  importData: (jsonStr) => invokeTauri('import_data', { jsonStr }),
  setWindowMode: (mode) => invokeTauri('set_window_mode', { mode }),
  resizeWindow: (width, height) => invokeTauri('resize_window', { width, height }),
  minimizeWindow: () => invokeTauri('minimize_window'),
  closeWindow: () => invokeTauri('close_window'),
};

function mockFallback(cmd, args) {
  if (cmd === 'get_tasks') return [];
  if (cmd === 'get_lists') return [];
  if (cmd === 'get_settings') return {};
  if (cmd === 'get_pomodoro_stats') return { total_sessions: 0, total_minutes: 0 };
  return null;
}
