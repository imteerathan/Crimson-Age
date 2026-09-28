class OverlayManager {
  constructor({
    BrowserWindowClass,
    screenApi,
    pathModule,
    overlayHtmlPath,
    overlayPreloadPath,
    onState = () => {},
    onPositionChange = () => {}
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
    this.onPositionChange = onPositionChange;
    this.window = null;
    this.visible = false;
    this.editMode = false;
    this.runtimeSuppressed = false;
    this.notificationTimer = null;
    this.config = {
      enabled: true,
      mode: 'FULL',
      opacity: 0.92,
      manualHide: false,
      autoHideDuringCutscene: true,
      restoreAfterStableGameplay: true,
      autoHideDuringGameUi: true,
      position: { x: 1, y: 0.03 }
    };
    this.data = {
      version: null,
      host: 'Standalone',
      hostState: 'FALLBACK',
      updaterState: 'IDLE',
      currentVersion: null,
      runtimeState: 'GAMEPLAY',
      runtimeReason: null,
      notification: null
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
    this.applyInteractionMode();
    this.window.on('closed', () => {
      if (this.notificationTimer) clearTimeout(this.notificationTimer);
      this.window = null;
      this.visible = false;
      this.editMode = false;
      this.emitState();
    });

    this.window.webContents.on('did-finish-load', () => this.pushState());
    this.reposition();
    this.window.loadFile(this.overlayHtmlPath);
    return this.window;
  }

  applyInteractionMode() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setIgnoreMouseEvents(!this.editMode, { forward: true });
    if (typeof this.window.setFocusable === 'function') this.window.setFocusable(this.editMode);
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
    this.config = { ...this.config, ...config, position: { ...this.config.position, ...(config.position || {}) } };
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
    return this.config.enabled && !this.config.manualHide && !this.runtimeSuppressed;
  }

  setPosition(position = {}) {
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Overlay position must contain numeric x/y');
    this.config.position = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    this.onPositionChange(this.config.position);
    this.pushState();
    return this.getState();
  }

  setRuntimeSuppressed(suppressed, reason = 'runtime') {
    this.runtimeSuppressed = Boolean(suppressed);
    if (this.runtimeSuppressed) this.hide(reason);
    else if (this.config.restoreAfterStableGameplay !== false) this.show(reason);
    else this.emitState(reason);
    return this.getState();
  }

  setEditMode(enabled) {
    this.editMode = Boolean(enabled);
    if (this.editMode) this.show('edit-position');
    this.applyInteractionMode();
    this.pushState();
    this.emitState(this.editMode ? 'edit-position-enabled' : 'edit-position-disabled');
    return this.getState();
  }

  notify(message, duration = 3000) {
    const text = String(message || '').trim();
    if (!text || this.config.manualHide || !this.config.enabled) return this.getState();
    const wasVisible = this.visible;
    const ms = Math.max(500, Number(duration) || 3000);
    this.data.notification = { message: text, duration: ms, startedAt: new Date().toISOString() };
    const window = this.ensureWindow();
    this.reposition();
    this.applyInteractionMode();
    window.showInactive();
    this.visible = true;
    this.pushState();
    this.emitState('notification');
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = setTimeout(() => {
      this.notificationTimer = null;
      this.data.notification = null;
      if (this.runtimeSuppressed || !wasVisible) this.hide('notification-expired');
      else { this.pushState(); this.emitState('notification-expired'); }
    }, ms);
    return this.getState();
  }

  show(reason = 'manual') {
    if (!this.canShow()) {
      this.emitState(reason);
      return this.getState();
    }
    const window = this.ensureWindow();
    this.reposition();
    this.applyInteractionMode();
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
      editMode: this.editMode,
      runtimeSuppressed: this.runtimeSuppressed,
      ...this.config,
      data: { ...this.data }
    };
  }

  destroy() {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.visible = false;
    this.editMode = false;
    this.emitState('destroy');
  }
}

module.exports = { OverlayManager };
