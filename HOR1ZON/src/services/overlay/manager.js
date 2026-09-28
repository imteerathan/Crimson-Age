class OverlayManager {
  constructor({
    BrowserWindowClass,
    screenApi,
    pathModule,
    overlayHtmlPath,
    overlayPreloadPath,
    onState = () => {},
    onPositionChange = () => {},
    displayResolver = null
  }) {
    if (typeof BrowserWindowClass !== 'function') throw new TypeError('BrowserWindowClass is required');
    if (!screenApi || typeof screenApi.getDisplayNearestPoint !== 'function') throw new TypeError('screenApi is required');
    this.BrowserWindowClass = BrowserWindowClass;
    this.screen = screenApi;
    this.path = pathModule;
    this.overlayHtmlPath = overlayHtmlPath;
    this.overlayPreloadPath = overlayPreloadPath;
    this.onState = onState;
    this.onPositionChange = onPositionChange;
    this.displayResolver = displayResolver;
    this.targetDisplay = null;
    this.window = null;
    this.windowReady = false;
    this.visible = false;
    this.editMode = false;
    this.runtimeSuppressed = false;
    this.notificationTimer = null;
    this.config = {
      enabled: true,
      mode: 'FULL',
      opacity: 0.82,
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

  getWindowSize() {
    const mode = String(this.config.mode || 'FULL').toUpperCase();
    if (mode === 'COMPACT') return { width: 280, height: 84 };
    if (mode === 'FOCUS') return { width: 420, height: 150 };
    return { width: 360, height: 104 };
  }

  getDisplayArea(display) {
    return display?.workArea || display?.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;

    this.windowReady = false;
    const size = this.getWindowSize();
    this.window = new this.BrowserWindowClass({
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
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
      this.windowReady = false;
      this.visible = false;
      this.editMode = false;
      this.emitState();
    });

    this.window.webContents.on('did-finish-load', () => {
      this.windowReady = true;
      this.pushState();
      if (this.visible && (this.canShow() || this.editMode || this.data.notification)) this.revealWindow();
    });

    this.reposition();
    this.window.loadFile(this.overlayHtmlPath);
    return this.window;
  }

  revealWindow() {
    if (!this.window || this.window.isDestroyed() || !this.windowReady) return false;
    this.reposition();
    this.applyInteractionMode();
    this.window.showInactive();
    return true;
  }

  applyInteractionMode() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setIgnoreMouseEvents(!this.editMode, { forward: true });
    if (typeof this.window.setFocusable === 'function') this.window.setFocusable(this.editMode);
  }

  reposition() {
    if (!this.window || this.window.isDestroyed()) return;
    const display = this.targetDisplay || this.displayResolver?.() || this.screen.getDisplayNearestPoint({ x: 0, y: 0 });
    const area = this.getDisplayArea(display);
    const size = this.getWindowSize();
    const spanX = Math.max(0, area.width - size.width - 16);
    const spanY = Math.max(0, area.height - size.height - 16);
    const x = Math.round(area.x + 8 + Math.max(0, Math.min(1, Number(this.config.position?.x ?? 1))) * spanX);
    const y = Math.round(area.y + 8 + Math.max(0, Math.min(1, Number(this.config.position?.y ?? 0.03))) * spanY);
    this.window.setBounds({ x, y, width: size.width, height: size.height });
  }

  setTargetDisplay(display) {
    if (!display || !display.bounds) return this.getState();
    const oldArea = this.getDisplayArea(this.targetDisplay);
    const newArea = this.getDisplayArea(display);
    const changed = !this.targetDisplay || String(this.targetDisplay.id) !== String(display.id)
      || oldArea.x !== newArea.x || oldArea.y !== newArea.y || oldArea.width !== newArea.width || oldArea.height !== newArea.height;
    this.targetDisplay = display;
    if (changed || this.window) this.reposition();
    this.pushState();
    this.emitState('target-display-changed');
    return this.getState();
  }

  configure(config = {}) {
    this.config = { ...this.config, ...config, position: { ...this.config.position, ...(config.position || {}) } };
    if (!this.config.enabled && this.visible) this.hide();
    if (this.window) this.reposition();
    this.pushState();
    return this.getState();
  }

  setData(data = {}) {
    this.data = { ...this.data, ...data };
    this.pushState();
    return this.getState();
  }

  canShow() {
    return this.config.enabled && !this.config.manualHide && (!this.runtimeSuppressed || this.editMode);
  }

  setPosition(position = {}) {
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Overlay position must contain numeric x/y');
    this.config.position = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    this.onPositionChange(this.config.position);
    if (this.window) this.reposition();
    this.pushState();
    return this.getState();
  }

  setRuntimeSuppressed(suppressed, reason = 'runtime') {
    this.runtimeSuppressed = Boolean(suppressed);
    if (this.runtimeSuppressed && !this.editMode) this.hide(reason);
    else if (!this.runtimeSuppressed && this.config.restoreAfterStableGameplay !== false) this.show(reason);
    else this.emitState(reason);
    return this.getState();
  }

  setEditMode(enabled) {
    this.editMode = Boolean(enabled);
    if (this.editMode) {
      this.ensureWindow();
      this.visible = true;
      this.reposition();
      this.applyInteractionMode();
      this.revealWindow();
    } else if (this.runtimeSuppressed) {
      this.hide('edit-position-disabled');
    } else {
      this.applyInteractionMode();
    }
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
    this.ensureWindow();
    this.visible = true;
    this.reposition();
    this.applyInteractionMode();
    this.revealWindow();
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
    this.ensureWindow();
    this.visible = true;
    this.reposition();
    this.applyInteractionMode();
    this.revealWindow();
    this.pushState();
    this.emitState(reason);
    return this.getState();
  }

  hide(reason = 'manual') {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
    this.visible = false;
    if (reason === 'manual' || reason === 'ipc-hide') this.editMode = false;
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
    const display = this.targetDisplay ? {
      id: this.targetDisplay.id,
      bounds: this.targetDisplay.bounds,
      workArea: this.targetDisplay.workArea || this.targetDisplay.bounds
    } : null;
    return {
      visible: this.visible,
      editMode: this.editMode,
      runtimeSuppressed: this.runtimeSuppressed,
      ...this.config,
      targetDisplay: display,
      data: { ...this.data }
    };
  }

  destroy() {
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.windowReady = false;
    this.visible = false;
    this.editMode = false;
    this.emitState('destroy');
  }
}

module.exports = { OverlayManager };