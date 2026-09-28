const { JsonStore } = require('./json-store');

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  launchCount: 0,
  firstStartedAt: null,
  lastStartedAt: null,
  lastShutdownAt: null,
  lastHostStatus: null,
  lastUpdaterState: null,
  migrationVersion: 0
});

class ExtensionStateStore {
  constructor(filePath) {
    this.store = new JsonStore(filePath, DEFAULT_STATE);
  }

  load() {
    const state = this.store.load();
    if (!Number.isInteger(state.schemaVersion) || state.schemaVersion < 1) {
      throw new Error('Invalid extension state schemaVersion');
    }
    return state;
  }

  markStarted(timestamp) {
    const current = this.store.get();
    return this.store.set({
      launchCount: current.launchCount + 1,
      firstStartedAt: current.firstStartedAt || timestamp,
      lastStartedAt: timestamp,
      lastShutdownAt: null
    });
  }

  markShutdown(timestamp) {
    return this.store.set({ lastShutdownAt: timestamp });
  }

  setHostStatus(status) {
    return this.store.set({ lastHostStatus: status });
  }

  setUpdaterState(status) {
    return this.store.set({ lastUpdaterState: status });
  }

  setMigrationVersion(version) {
    return this.store.set({ migrationVersion: version });
  }

  get() {
    return this.store.get();
  }
}

module.exports = { DEFAULT_STATE, ExtensionStateStore };
