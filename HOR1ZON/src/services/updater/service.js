const { createUpdaterState, transition } = require('./state-machine');

class UpdaterService {
  constructor({ updater, version, isPackaged = true, now = () => new Date().toISOString(), emit = () => {} }) {
    if (!updater || typeof updater.on !== 'function') throw new TypeError('updater must be an EventEmitter-compatible object');
    this.updater = updater;
    this.isPackaged = isPackaged;
    this.now = now;
    this.emit = emit;
    this.state = createUpdaterState(version);
    this.bindEvents();
  }

  publish(nextState, patch = {}) {
    this.state = transition(this.state, nextState, patch);
    this.emit(this.getState());
    return this.getState();
  }

  safePublish(nextState, patch = {}) {
    try {
      return this.publish(nextState, patch);
    } catch (error) {
      this.state = {
        ...this.state,
        state: 'ERROR',
        error: error.stack || error.message || String(error)
      };
      this.emit(this.getState());
      return this.getState();
    }
  }

  bindEvents() {
    this.updater.on('checking-for-update', () => this.safePublish('CHECKING', { error: null, checkedAt: this.now() }));
    this.updater.on('update-available', info => this.safePublish('AVAILABLE', {
      availableVersion: info?.version || null,
      progress: null,
      error: null,
      checkedAt: this.now()
    }));
    this.updater.on('update-not-available', info => this.safePublish('UP_TO_DATE', {
      availableVersion: null,
      progress: null,
      error: null,
      checkedAt: this.now()
    }));
    this.updater.on('download-progress', info => {
      if (this.state.state !== 'DOWNLOADING') this.safePublish('DOWNLOADING', { error: null });
      if (this.state.state === 'DOWNLOADING') {
        this.state = { ...this.state, progress: Math.round(Number(info?.percent || 0)) };
        this.emit(this.getState());
      }
    });
    this.updater.on('update-downloaded', info => this.safePublish('READY', {
      availableVersion: info?.version || this.state.availableVersion,
      progress: 100,
      downloadedAt: this.now(),
      error: null
    }));
    this.updater.on('error', error => {
      this.state = {
        ...this.state,
        state: 'ERROR',
        error: error?.stack || error?.message || String(error)
      };
      this.emit(this.getState());
    });
  }

  async check() {
    if (!this.isPackaged) {
      this.state = { ...this.state, state: 'UP_TO_DATE', error: null, checkedAt: this.now() };
      this.emit(this.getState());
      return this.getState();
    }
    this.safePublish('CHECKING', { error: null, checkedAt: this.now() });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.state = { ...this.state, state: 'ERROR', error: error?.stack || error?.message || String(error) };
      this.emit(this.getState());
    }
    return this.getState();
  }

  async download() {
    if (!this.isPackaged) return this.getState();
    if (this.state.state !== 'AVAILABLE') throw new Error('No update is currently available for download');
    this.safePublish('DOWNLOADING', { progress: 0, error: null });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.state = { ...this.state, state: 'ERROR', error: error?.stack || error?.message || String(error) };
      this.emit(this.getState());
    }
    return this.getState();
  }

  install() {
    if (!this.isPackaged) return false;
    if (this.state.state !== 'READY') throw new Error('No downloaded update is ready to install');
    this.safePublish('INSTALLING', { error: null });
    this.safePublish('RESTARTING');
    this.updater.quitAndInstall(false, true);
    return true;
  }

  getState() {
    return { ...this.state };
  }
}

module.exports = { UpdaterService };
