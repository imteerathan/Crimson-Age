const fs = require('fs');
const path = require('path');
const { validateSettings } = require('./schema');

const DEFAULTS = Object.freeze({
  general: { launchAtStartup: false, compactMode: false, language: 'auto' },
  overlay: { enabled: true, mode: 'FULL', opacity: 0.82, manualHide: false, autoHideDuringCutscene: true, autoHideDuringGameUi: true, restoreAfterStableGameplay: true, position: { x: 1, y: 0.03 } },
  integration: { hostMode: 'AUTO', telemetryEnabled: false, reconnect: true },
  updates: { channel: 'stable', checkOnLaunch: true },
  privacy: { diagnosticRetentionDays: 14 }
});

function normalizeLegacySettings(state) {
  const next = clone(state);
  if (!next.overlay || typeof next.overlay !== 'object') next.overlay = {};
  if (!Number.isFinite(next.overlay.opacity)) next.overlay.opacity = DEFAULTS.overlay.opacity;
  next.overlay.opacity = Math.max(0.1, Math.min(1, next.overlay.opacity));
  if (typeof next.overlay.autoHideDuringGameUi !== 'boolean') next.overlay.autoHideDuringGameUi = true;
  if (!next.overlay.position || typeof next.overlay.position !== 'object') next.overlay.position = clone(DEFAULTS.overlay.position);
  if (!Number.isFinite(next.overlay.position.x)) next.overlay.position.x = DEFAULTS.overlay.position.x;
  if (!Number.isFinite(next.overlay.position.y)) next.overlay.position.y = DEFAULTS.overlay.position.y;
  next.overlay.position.x = Math.max(0, Math.min(1, next.overlay.position.x));
  next.overlay.position.y = Math.max(0, Math.min(1, next.overlay.position.y));
  return next;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') out[key] = merge(base[key], value);
    else out[key] = value;
  }
  return out;
}

class SettingsStore {
  constructor(filePath, defaults = DEFAULTS) {
    this.filePath = filePath;
    this.defaults = clone(defaults);
    validateSettings(this.defaults);
    this.state = clone(defaults);
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.state = normalizeLegacySettings(merge(this.defaults, JSON.parse(raw)));
      validateSettings(this.state);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const corruptPath = this.filePath.replace(/\.json$/i, '.corrupt.json');
        try { fs.renameSync(this.filePath, corruptPath); } catch {}
      }
      this.state = clone(this.defaults);
      this.save();
    }
    return clone(this.state);
  }

  get() { return clone(this.state); }

  set(patch) {
    const next = normalizeLegacySettings(merge(this.state, patch));
    validateSettings(next);
    this.state = next;
    this.save();
    return this.get();
  }

  reset() { this.state = clone(this.defaults); this.save(); return this.get(); }

  save() {
    validateSettings(this.state);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { DEFAULTS, SettingsStore };