class OverlayManager {
  constructor({
    BrowserWindowClass,
    screenApi,
    pathModule,
    overlayHtmlPath,
    overlayPreloadPath,
    onState = () => {}
  }) {
    if (typeof BrowserWindowClass !== 'function') throw new TypeError('BrowserWindowClass is required');
    if (!screenApi || typeof screenApi.getDisplayNearestPoint !== 'function') {
      throw new TypeError('screenApi is required');
    }
    this.BrowserWindowClass = BrowserWindowClass;
    this.screen = screenApi;
    this.path = pathModule;
    this.overlayHtmlPath = overlayHtmlPath;
    this.overlayPreloadPath = overlayPreloadPath;
    this.onState = onState;
    this.window = null;
    this.visible = false;
    this.config = {
      enabled: true,
      mode: 'FULL',
      opacity: 0.92,
      manualHide: false,
      autoHideDuringCutscene: true,
      restoreAfterStableGameplay: true
    };
    this.data = {
      version: null,
      host: 'Standalone',
      hostState: 'FALLBACK',
      updaterState: 'IDLE',
      currentVersion: null
    };
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;

    this.window = new this.BrowserWindowClass({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.overlayPreloadPath
      }
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.on('closed', () => {
      this.window = null;
      this.visible = false;
      this.emitState();
    });

    this.window.webContents.on('did-finish-load', () => this.pushState());
    this.reposition();
    this.window.loadFile(this.overlayHtmlPath);
    return this.window;
  }

  reposition() {
    if (!this.window || this.window.isDestroyed()) return;
    const point = this.screen.getCursorScreenPoint
      ? this.screen.getCursorScreenPoint()
      : { x: 0, y: 0 };
    const display = this.screen.getDisplayNearestPoint(point);
    const area = display.workArea || display.bounds;
    const width = area.width;
    const height = area.height;
    this.window.setBounds({
      x: area.x,
      y: area.y,
      width,
      height
    });
  }

  configure(config = {}) {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled && this.visible) this.hide();
    this.pushState();
    return this.getState();
  }

  setData(data = {}) {
    this.data = { ...this.data, ...data };
    this.pushState();
    return this.getState();
  }

  canShow() {
    return this.config.enabled && !this.config.manualHide;
  }

  show(reason = 'manual') {
    if (!this.canShow()) {
      this.emitState(reason);
      return this.getState();
    }
    const window = this.ensureWindow();
    this.reposition();
    window.showInactive();
    this.visible = true;
    this.pushState();
    this.emitState(reason);
    return this.getState();
  }

  hide(reason = 'manual') {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
    this.visible = false;
    this.emitState(reason);
    return this.getState();
  }

  toggle(reason = 'manual') {
    return this.visible ? this.hide(reason) : this.show(reason);
  }

  pushState() {
    if (!this.window || this.window.isDestroyed() || this.window.webContents.isLoading()) return;
    this.window.webContents.send('horizon:overlay:state', this.getState());
  }

  emitState(reason = 'state') {
    this.onState({ ...this.getState(), reason });
  }

  getState() {
    return {
      visible: this.visible,
      ...this.config,
      data: { ...this.data }
    };
  }

  destroy() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.visible = false;
    this.emitState('destroy');
  }
}

module.exports = { OverlayManager };
