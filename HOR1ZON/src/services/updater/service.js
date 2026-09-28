const { createUpdaterState, transition } = require('./state-machine');

class UpdaterService {
  constructor({
    updater,
    version,
    isPackaged = true,
    configured = true,
    now = () => new Date().toISOString(),
    emit = () => {}
  }) {
    if (!updater || typeof updater.on !== 'function') throw new TypeError('updater must be an EventEmitter-compatible object');
    this.updater = updater;
    this.isPackaged = isPackaged;
    this.configured = configured;
    this.now = now;
    this.emit = emit;
    this.state = createUpdaterState(version, configured);
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

  patch(patch) {
    this.state = { ...this.state, ...patch };
    this.emit(this.getState());
    return this.getState();
  }

  bindEvents() {
    this.updater.on('checking-for-update', () => {
      if (this.state.state === 'CHECKING') {
        this.patch({ error: null, checkedAt: this.now() });
        return;
      }
      this.safePublish('CHECKING', { error: null, checkedAt: this.now() });
    });

    this.updater.on('update-available', info => {
      if (this.state.state === 'AVAILABLE') {
        this.patch({
          availableVersion: info?.version || this.state.availableVersion,
          progress: null,
          error: null,
          checkedAt: this.now()
        });
        return;
      }
      this.safePublish('AVAILABLE', {
        availableVersion: info?.version || null,
        progress: null,
        error: null,
        checkedAt: this.now()
      });
    });

    this.updater.on('update-not-available', () => {
      if (this.state.state === 'UP_TO_DATE') {
        this.patch({ availableVersion: null, progress: null, error: null, checkedAt: this.now() });
        return;
      }
      this.safePublish('UP_TO_DATE', {
        availableVersion: null,
        progress: null,
        error: null,
        checkedAt: this.now()
      });
    });

    this.updater.on('download-progress', info => {
      if (this.state.state !== 'DOWNLOADING') {
        this.safePublish('DOWNLOADING', { error: null });
      }
      if (this.state.state === 'DOWNLOADING') {
        this.patch({ progress: Math.round(Number(info?.percent || 0)) });
      }
    });

    this.updater.on('update-downloaded', info => {
      if (this.state.state === 'READY') {
        this.patch({
          availableVersion: info?.version || this.state.availableVersion,
          progress: 100,
          downloadedAt: this.now(),
          error: null
        });
        return;
      }
      this.safePublish('READY', {
        availableVersion: info?.version || this.state.availableVersion,
        progress: 100,
        downloadedAt: this.now(),
        error: null
      });
    });

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

    if (!this.configured) {
      this.state = { ...this.state, state: 'UNCONFIGURED', error: null, checkedAt: this.now() };
      this.emit(this.getState());
      return this.getState();
    }

    if (this.state.state === 'CHECKING') return this.getState();
    if (this.state.state === 'AVAILABLE' || this.state.state === 'READY') {
      this.patch({ checkedAt: this.now(), error: null });
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
    if (!this.isPackaged || !this.configured) return this.getState();
    if (this.state.state === 'DOWNLOADING') return this.getState();
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
    if (!this.isPackaged || !this.configured) return false;
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
