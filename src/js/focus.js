// Focus Sheet & Pomodoro Controller (Stage 3 + Mini Timer on Main Menu)
import { api } from './api.js';
import { state, refreshTasks } from './state.js';

let linkedTask = null;
let modeMinutes = 25;
let secondsLeft = 25 * 60;
let timerId = null;
let isRunning = false;
let sessionCount = 1;
let todayTotalMinutes = 0;

export function initFocusSheet() {
  const sheet = document.getElementById('focus-sheet');
  if (!sheet) return;

  const btnBack = document.getElementById('focus-btn-back');
  const btnToggle = document.getElementById('focus-btn-toggle');
  const btnReset = document.getElementById('focus-btn-reset');
  const btnSkip = document.getElementById('focus-btn-skip');

  if (btnBack) btnBack.addEventListener('click', closeFocusSheet);

  document.querySelectorAll('.chip-focus-mode').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip-focus-mode').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = parseInt(chip.getAttribute('data-mins'), 10) || 25;
      setFocusMode(mins);
    });
  });

  if (btnToggle) btnToggle.addEventListener('click', toggleTimer);
  if (btnReset) btnReset.addEventListener('click', resetTimer);
  if (btnSkip) btnSkip.addEventListener('click', skipSession);

  // Mini Focus Bar on Main Menu controls
  const miniLeft = document.getElementById('mini-focus-left');
  const miniSub5 = document.getElementById('mini-focus-sub5');
  const miniAdd5 = document.getElementById('mini-focus-add5');
  const miniToggle = document.getElementById('mini-focus-toggle');

  if (miniLeft) miniLeft.addEventListener('click', () => openFocusSheet(linkedTask));
  if (miniSub5) miniSub5.addEventListener('click', (e) => { e.stopPropagation(); adjustTimerMinutes(-5); });
  if (miniAdd5) miniAdd5.addEventListener('click', (e) => { e.stopPropagation(); adjustTimerMinutes(5); });
  if (miniToggle) miniToggle.addEventListener('click', (e) => { e.stopPropagation(); toggleTimer(); });

  window.addEventListener('tododo:open-focus', (e) => {
    openFocusSheet(e.detail?.task || null);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('active')) {
      closeFocusSheet();
    }
  });

  loadPomodoroStats();
}

export async function openFocusSheet(task = null) {
  if (task) linkedTask = task;
  const sheet = document.getElementById('focus-sheet');
  const surface = document.querySelector('.glass-surface');
  const taskTitleEl = document.getElementById('focus-linked-task-title');

  if (taskTitleEl) {
    taskTitleEl.textContent = linkedTask ? linkedTask.title : 'General Focus';
  }

  await loadPomodoroStats();
  updateTimerUI();

  if (sheet) sheet.classList.add('active');
  if (surface) surface.classList.add('sheet-open');
  updateMiniFocusBar();
}

export function closeFocusSheet() {
  const sheet = document.getElementById('focus-sheet');
  const surface = document.querySelector('.glass-surface');
  if (sheet) sheet.classList.remove('active');
  if (surface) surface.classList.remove('sheet-open');
  updateMiniFocusBar();
}

export function adjustTimerMinutes(deltaMins) {
  secondsLeft = Math.max(60, secondsLeft + deltaMins * 60);
  updateTimerUI();
  updateMiniFocusBar();
}

function setFocusMode(mins) {
  pauseTimer();
  modeMinutes = mins;
  secondsLeft = mins * 60;
  updateTimerUI();
  updateMiniFocusBar();
}

function toggleTimer() {
  if (isRunning) pauseTimer();
  else startTimer();
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  const btnToggle = document.getElementById('focus-btn-toggle');
  if (btnToggle) btnToggle.textContent = 'Pause';

  timerId = setInterval(() => {
    if (secondsLeft > 0) {
      secondsLeft--;
      updateTimerUI();
      updateMiniFocusBar();
    } else {
      completeSession();
    }
  }, 1000);
  updateMiniFocusBar();
}

function pauseTimer() {
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  const btnToggle = document.getElementById('focus-btn-toggle');
  if (btnToggle) btnToggle.textContent = 'Start';
  updateMiniFocusBar();
}

function resetTimer() {
  pauseTimer();
  secondsLeft = modeMinutes * 60;
  updateTimerUI();
  updateMiniFocusBar();
}

async function skipSession() {
  pauseTimer();
  secondsLeft = modeMinutes * 60;
  updateTimerUI();
  updateMiniFocusBar();
}

async function completeSession() {
  pauseTimer();
  playChime();

  try {
    const taskId = linkedTask ? linkedTask.id : null;
    await api.logPomodoroSession(taskId, modeMinutes);
    todayTotalMinutes += modeMinutes;
    sessionCount++;
  } catch (err) {
    console.error('Failed to log session:', err);
  }

  secondsLeft = modeMinutes * 60;
  updateTimerUI();
  updateStatsMeta();
  updateMiniFocusBar();
  refreshTasks();
}

export function updateMiniFocusBar() {
  const bar = document.getElementById('mini-focus-bar');
  if (!bar) return;
  const timeEl = document.getElementById('mini-focus-time');
  const titleEl = document.getElementById('mini-focus-title');
  const toggleEl = document.getElementById('mini-focus-toggle');
  const iconEl = document.getElementById('mini-focus-icon');
  const isSheetOpen = document.getElementById('focus-sheet')?.classList.contains('active');

  const sessionActive = isRunning || (secondsLeft < modeMinutes * 60 && secondsLeft > 0);
  if (sessionActive && !isSheetOpen) {
    bar.classList.add('active');
  } else {
    bar.classList.remove('active');
  }

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  if (timeEl) timeEl.textContent = timeStr;
  if (titleEl) titleEl.textContent = linkedTask ? linkedTask.title : 'Focus Session';
  if (toggleEl) toggleEl.textContent = isRunning ? 'Pause' : 'Start';
  if (iconEl) iconEl.textContent = isRunning ? '⚡' : '⏸️';
}

async function loadPomodoroStats() {
  try {
    const stats = await api.getPomodoroStats();
    if (stats) {
      todayTotalMinutes = stats.total_minutes || 0;
      sessionCount = ((stats.total_sessions || 0) % 4) + 1;
    }
  } catch {
    // Fallback defaults
  }
  updateStatsMeta();
}

function updateStatsMeta() {
  const metaEl = document.getElementById('focus-session-meta');
  if (metaEl) {
    metaEl.textContent = `Session ${sessionCount} of 4 · ${todayTotalMinutes} min total`;
  }
}

function updateTimerUI() {
  const timeEl = document.getElementById('focus-countdown-text');
  const ringProgress = document.getElementById('focus-progress-circle');

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const formatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  if (timeEl) timeEl.textContent = formatted;

  if (ringProgress) {
    const totalSec = modeMinutes * 60;
    const progress = (totalSec - secondsLeft) / totalSec;
    const circumference = 2 * Math.PI * 88;
    const offset = circumference * (1 - progress);
    ringProgress.style.strokeDashoffset = offset;
  }
}

function playChime() {
  if (!state.soundsEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.85);
  } catch {
    // Audio ignored
  }
}
