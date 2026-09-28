const test = require('node:test');
const assert = require('node:assert/strict');
const { OverlayRuntimeGuard } = require('../src/services/overlay/runtime-guard');

function fakeOverlay() {
  return {
    calls: [],
    state: { visible: true, runtimeSuppressed: false },
    setRuntimeSuppressed(value, reason) {
      this.calls.push({ method: 'setRuntimeSuppressed', value, reason });
      this.state.visible = !value;
      this.state.runtimeSuppressed = Boolean(value);
    },
    setData(data) { this.calls.push({ method: 'setData', data }); },
    getState() { return this.state; }
  };
}

test('fullscreen UI and dialogue suppress, gameplay restores', () => {
  const overlay = fakeOverlay();
  const guard = new OverlayRuntimeGuard({
    overlay,
    getSettings: () => ({ overlay: { autoHideDuringGameUi: true, autoHideDuringCutscene: true, restoreAfterStableGameplay: true } })
  });
  guard.setState('FULLSCREEN_UI', { reason: 'menu' });
  assert.equal(guard.getState().hiddenByRuntime, true);
  assert.equal(overlay.state.runtimeSuppressed, true);
  guard.setState('GAMEPLAY', { reason: 'menu-closed' });
  assert.equal(guard.getState().hiddenByRuntime, false);
  assert.equal(overlay.state.runtimeSuppressed, false);
});

test('cutscene policy can be controlled independently from fullscreen UI', () => {
  const overlay = fakeOverlay();
  const guard = new OverlayRuntimeGuard({
    overlay,
    getSettings: () => ({ overlay: { autoHideDuringGameUi: false, autoHideDuringCutscene: true, restoreAfterStableGameplay: true } })
  });
  guard.setState('FULLSCREEN_UI');
  assert.equal(overlay.state.runtimeSuppressed, false);
  guard.setState('CUTSCENE');
  assert.equal(overlay.state.runtimeSuppressed, true);
});
