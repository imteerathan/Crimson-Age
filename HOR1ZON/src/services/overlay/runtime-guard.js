const HIDDEN_STATES = new Set(['FULLSCREEN_UI', 'CUTSCENE', 'DIALOGUE']);

class OverlayRuntimeGuard {
  constructor({ overlay, getSettings = () => ({}) }) {
    if (!overlay) throw new TypeError('overlay is required');
    this.overlay = overlay;
    this.getSettings = getSettings;
    this.state = 'GAMEPLAY';
    this.hiddenByRuntime = false;
    this.stableSince = null;
  }

  getState() {
    return {
      state: this.state,
      hiddenByRuntime: this.hiddenByRuntime,
      stableSince: this.stableSince
    };
  }

  setState(nextState = 'UNKNOWN', meta = {}) {
    const state = String(nextState || 'UNKNOWN').toUpperCase();
    this.state = state;

    const settings = this.getSettings().overlay || {};
    const autoHide = settings.autoHideDuringGameUi !== false && settings.autoHideDuringCutscene !== false;
    const shouldHide = autoHide && HIDDEN_STATES.has(state);

    if (shouldHide) {
      this.hiddenByRuntime = true;
      this.stableSince = null;
      this.overlay.setRuntimeSuppressed(true, `runtime-${state.toLowerCase()}`);
    } else if (state === 'GAMEPLAY') {
      if (this.hiddenByRuntime && settings.restoreAfterStableGameplay !== false) {
        this.hiddenByRuntime = false;
        this.stableSince = new Date().toISOString();
        this.overlay.setRuntimeSuppressed(false, 'runtime-gameplay-restored');
      }
    }

    this.overlay.setData({
      runtimeState: state,
      runtimeReason: meta.reason || null
    });

    return this.getState();
  }

  setFullScreenUi(active, reason = 'ui') {
    return this.setState(active ? 'FULLSCREEN_UI' : 'GAMEPLAY', { reason });
  }

  setCutscene(active, reason = 'cutscene') {
    return this.setState(active ? 'CUTSCENE' : 'GAMEPLAY', { reason });
  }

  setDialogue(active, reason = 'dialogue') {
    return this.setState(active ? 'DIALOGUE' : 'GAMEPLAY', { reason });
  }
}

module.exports = { OverlayRuntimeGuard, HIDDEN_STATES };
