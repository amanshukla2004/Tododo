// Settings Sheet Controller (Stage 3 + Capsule Customization)
import { api } from './api.js';
import { state, applyThemeSettings, refreshTasks } from './state.js';

export function initSettingsSheet() {
  const sheet = document.getElementById('settings-sheet');
  if (!sheet) return;

  const btnOpen = document.getElementById('btn-open-settings');
  const btnBack = document.getElementById('settings-btn-back');

  if (btnOpen) btnOpen.addEventListener('click', openSettingsSheet);
  if (btnBack) btnBack.addEventListener('click', closeSettingsSheet);

  // Accent Swatches
  const swatchesContainer = document.getElementById('accent-swatches');
  if (swatchesContainer) {
    const accents = ['#8B74F0', '#3D97DB', '#E96A4D', '#1FA77B', '#E8A317', '#E04F8A'];
    swatchesContainer.replaceChildren();

    accents.forEach(hex => {
      const swatch = document.createElement('button');
      swatch.className = `swatch-btn ${state.accent === hex ? 'active' : ''}`;
      swatch.style.backgroundColor = hex;
      swatch.setAttribute('aria-label', `Set accent color ${hex}`);
      swatch.setAttribute('title', hex);

      swatch.addEventListener('click', async () => {
        document.querySelectorAll('.swatch-btn').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.accent = hex;
        applyThemeSettings();
        await api.saveSetting('accent', hex);
      });

      swatchesContainer.appendChild(swatch);
    });
  }

  // Frost Opacity Slider (Range 40 to 90 percent)
  const frostSlider = document.getElementById('frost-slider');
  const frostValueLabel = document.getElementById('frost-value-label');
  if (frostSlider) {
    frostSlider.value = Math.round(state.frostOpacity * 100);
    if (frostValueLabel) frostValueLabel.textContent = `${frostSlider.value}%`;

    frostSlider.addEventListener('input', async (e) => {
      let val = parseInt(e.target.value, 10);
      if (val < 40) val = 40;
      if (val > 90) val = 90;
      const opacity = val / 100;
      state.frostOpacity = opacity;
      if (frostValueLabel) frostValueLabel.textContent = `${val}%`;
      applyThemeSettings();
      await api.saveSetting('frost_opacity', opacity.toString());
    });
  }

  // Capsule Mode Customization: Size & Glass Transparency
  const capSizeSlider = document.getElementById('capsule-size-slider');
  const capSizeLabel = document.getElementById('capsule-size-label');
  if (capSizeSlider) {
    capSizeSlider.value = state.capsuleWidth || 220;
    if (capSizeLabel) capSizeLabel.textContent = `${capSizeSlider.value}px`;
    capSizeSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10) || 220;
      state.capsuleWidth = val;
      if (capSizeLabel) capSizeLabel.textContent = `${val}px`;
      applyThemeSettings();
      if (document.body.classList.contains('glance-mode')) {
        await api.resizeWindow(val + 12, 54);
      }
      await api.saveSetting('capsule_width', val.toString());
    });
  }

  const capOpacitySlider = document.getElementById('capsule-opacity-slider');
  const capOpacityLabel = document.getElementById('capsule-opacity-label');
  if (capOpacitySlider) {
    capOpacitySlider.value = Math.round((state.capsuleOpacity || 0.45) * 100);
    if (capOpacityLabel) capOpacityLabel.textContent = `${capOpacitySlider.value}%`;
    capOpacitySlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value, 10);
      const op = val / 100;
      state.capsuleOpacity = op;
      if (capOpacityLabel) capOpacityLabel.textContent = `${val}%`;
      applyThemeSettings();
      await api.saveSetting('capsule_opacity', op.toString());
    });
  }

  // Switches: Sounds, Stay on Top, Calm Mode
  const switchSounds = document.getElementById('switch-sounds');
  const switchStayOnTop = document.getElementById('switch-stay-on-top');
  const switchCalmMode = document.getElementById('switch-calm-mode');

  if (switchSounds) {
    switchSounds.checked = state.soundsEnabled;
    switchSounds.addEventListener('change', async () => {
      state.soundsEnabled = switchSounds.checked;
      await api.saveSetting('sounds_enabled', state.soundsEnabled.toString());
    });
  }

  if (switchStayOnTop) {
    switchStayOnTop.checked = state.stayOnTop;
    switchStayOnTop.addEventListener('change', async () => {
      state.stayOnTop = switchStayOnTop.checked;
      const mode = state.stayOnTop ? 'top' : 'desktop';
      await api.setWindowMode(mode);
      await api.saveSetting('stay_on_top', state.stayOnTop.toString());
    });
  }

  if (switchCalmMode) {
    switchCalmMode.checked = state.calmMode;
    switchCalmMode.addEventListener('change', async () => {
      state.calmMode = switchCalmMode.checked;
      applyThemeSettings();
      await api.saveSetting('calm_mode', state.calmMode.toString());
    });
  }

  // Export & Import JSON
  const btnExport = document.getElementById('btn-export-json');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      try {
        const jsonStr = await api.exportData();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tododo-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export error:', err);
      }
    });
  }

  const btnImport = document.getElementById('btn-import-json');
  const fileInput = document.getElementById('input-import-file');
  if (btnImport && fileInput) {
    btnImport.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await api.importData(text);
        await refreshTasks();
        fileInput.value = '';
        closeSettingsSheet();
      } catch (err) {
        console.error('Import error:', err);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('active')) {
      closeSettingsSheet();
    }
  });
}

export function openSettingsSheet() {
  const sheet = document.getElementById('settings-sheet');
  const surface = document.querySelector('.glass-surface');
  if (sheet) sheet.classList.add('active');
  if (surface) surface.classList.add('sheet-open');
}

export function closeSettingsSheet() {
  const sheet = document.getElementById('settings-sheet');
  const surface = document.querySelector('.glass-surface');
  if (sheet) sheet.classList.remove('active');
  if (surface) surface.classList.remove('sheet-open');
}
