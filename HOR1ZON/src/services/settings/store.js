const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  general: {
    launchAtStartup: false,
    compactMode: false,
    language: 'auto'
  },
  overlay: {
    enabled: true,
    mode: 'FULL',
    opacity: 0.92,
    manualHide: false,
    autoHideDuringCutscene: true,
    restoreAfterStableGameplay: true
  },
  integration: {
    hostMode: 'AUTO',
    telemetryEnabled: false,
    reconnect: true
  },
  updates: {
    channel: 'stable',
    checkOnLaunch: true
  },
  privacy: {
    diagnosticRetentionDays: 14
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

class SettingsStore {
  constructor(filePath, defaults = DEFAULTS) {
    this.filePath = filePath;
    this.defaults = clone(defaults);
    this.state = clone(defaults);
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.state = merge(this.defaults, JSON.parse(raw));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = clone(this.defaults);
      this.save();
    }
    return clone(this.state);
  }

  get() {
    return clone(this.state);
  }

  set(patch) {
    this.state = merge(this.state, patch);
    this.save();
    return this.get();
  }

  reset() {
    this.state = clone(this.defaults);
    this.save();
    return this.get();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { DEFAULTS, SettingsStore };
