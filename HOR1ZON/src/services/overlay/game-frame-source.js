class WindowsGameFrameSource {
  constructor({ desktopCapturer, getSourcesOptions = {} } = {}) {
    if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') throw new TypeError('desktopCapturer.getSources is required');
    this.desktopCapturer = desktopCapturer;
    this.getSourcesOptions = {
      types: ['window'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: false,
      ...getSourcesOptions
    };
  }

  static getWindowHandleFromSourceId(sourceId) {
    const match = /^window:(\d+):/.exec(String(sourceId || ''));
    return match ? Number(match[1]) : null;
  }

  async capture(targetWindow) {
    if (!targetWindow) throw new Error('targetWindow is required');
    const targetHwnd = Number(targetWindow.hwnd);
    const targetTitle = String(targetWindow.title || '').trim().toLowerCase();
    const sources = await this.desktopCapturer.getSources(this.getSourcesOptions);
    if (!Array.isArray(sources) || !sources.length) throw new Error('No window capture sources available');

    const exact = sources.find(source => WindowsGameFrameSource.getWindowHandleFromSourceId(source.id) === targetHwnd);
    const titleMatches = sources.filter(source => {
      const name = String(source.name || '').trim().toLowerCase();
      return targetTitle && (name === targetTitle || name.includes(targetTitle) || targetTitle.includes(name));
    });
    const source = exact || (titleMatches.length === 1 ? titleMatches[0] : null);
    if (!source) throw new Error('Game capture source not found');

    const size = source.thumbnail?.getSize?.();
    if (!size || size.width <= 0 || size.height <= 0) throw new Error('Game capture thumbnail is empty');

    return {
      image: source.thumbnail,
      sourceId: source.id,
      sourceName: source.name,
      hwnd: WindowsGameFrameSource.getWindowHandleFromSourceId(source.id),
      size
    };
  }
}

class GameUiMonitor {
  constructor({
    frameSource,
    visualDetector,
    stateEngine,
    onState = () => {},
    onObservation = () => {},
    intervalMs = 333
  } = {}) {
    if (!frameSource || typeof frameSource.capture !== 'function') throw new TypeError('frameSource.capture is required');
    if (!visualDetector || typeof visualDetector.analyse !== 'function') throw new TypeError('visualDetector.analyse is required');
    if (!stateEngine || typeof stateEngine.ingest !== 'function') throw new TypeError('stateEngine.ingest is required');
    this.frameSource = frameSource;
    this.visualDetector = visualDetector;
    this.stateEngine = stateEngine;
    this.onState = onState;
    this.onObservation = onObservation;
    this.intervalMs = Math.max(150, Number(intervalMs) || 333);
    this.targetWindow = null;
    this.telemetry = null;
    this.timer = null;
    this.running = false;
    this.polling = false;
    this.lastError = null;
    this.lastObservation = null;
  }

  setTargetWindow(windowInfo) {
    this.targetWindow = windowInfo ? JSON.parse(JSON.stringify(windowInfo)) : null;
    return this.getState();
  }

  noteInputHint(input, info = {}) {
    this.stateEngine.noteInputHint(input, new Date().toISOString(), {
      pid: info.pid || null,
      title: info.title || null
    });
    return this.getState();
  }

  setTelemetry(telemetry) {
    this.telemetry = telemetry ? { ...telemetry } : null;
    return this.getState();
  }

  reset(reason = 'reset') {
    this.visualDetector.reset();
    this.stateEngine.reset(reason);
    this.lastError = null;
    this.lastObservation = null;
    return this.getState();
  }

  async poll() {
    if (this.polling || !this.running || !this.targetWindow) return this.getState();
    this.polling = true;
    try {
      const captured = await this.frameSource.capture(this.targetWindow);
      const vision = this.visualDetector.analyse(captured.image);
      this.lastObservation = {
        ...vision,
        capture: {
          sourceId: captured.sourceId,
          sourceName: captured.sourceName,
          hwnd: captured.hwnd
        }
      };
      this.onObservation(this.lastObservation);
      const state = this.stateEngine.ingest({
        telemetry: this.telemetry,
        vision,
        timestamp: new Date().toISOString()
      });
      this.onState(state);
      this.lastError = null;
    } catch (error) {
      this.lastError = error?.message || String(error);
    } finally {
      this.polling = false;
    }
    return this.getState();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.reset('game-session-started');
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(reason = 'stopped') {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.reset(reason);
  }

  getState() {
    return {
      running: this.running,
      targetWindow: this.targetWindow,
      telemetry: this.telemetry,
      detector: this.visualDetector.getState(),
      engine: this.stateEngine.getState(),
      lastError: this.lastError,
      lastObservation: this.lastObservation
    };
  }
}

module.exports = { WindowsGameFrameSource, GameUiMonitor };
