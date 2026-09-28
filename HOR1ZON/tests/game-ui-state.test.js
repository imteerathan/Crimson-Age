const test = require('node:test');
const assert = require('node:assert/strict');
const { GameUiStateEngine } = require('../src/services/overlay/game-ui-state');

test('input hint never hides overlay by itself', () => {
  const states = [];
  const engine = new GameUiStateEngine({ onState: state => states.push(state.state), candidateFrames: 2 });
  engine.noteInputHint('GAMEPAD_VIEW');
  engine.ingest({ vision: { state: 'GAMEPLAY', confidence: 0.9, baselineReady: true } });
  assert.equal(engine.getState().state, 'GAMEPLAY');
  assert.equal(states.includes('FULLSCREEN_UI'), false);
});

test('a controller input hint cannot promote a low-confidence visual UI result', () => {
  const engine = new GameUiStateEngine({ candidateFrames: 1, minConfidence: 0.72 });
  engine.noteInputHint('GAMEPAD_VIEW');
  engine.ingest({
    vision: {
      state: 'FULLSCREEN_UI',
      confidence: 0.68,
      uiLikelihood: 0.68,
      baselineReady: true
    }
  });
  assert.equal(engine.getState().state, 'GAMEPLAY');
});

test('vision UI requires consecutive confirmation frames', () => {
  const states = [];
  const engine = new GameUiStateEngine({ onState: state => states.push(state.state), candidateFrames: 3 });
  const vision = { state: 'FULLSCREEN_UI', confidence: 0.84, uiLikelihood: 0.84, baselineReady: true };
  engine.ingest({ vision });
  engine.ingest({ vision });
  assert.equal(engine.getState().state, 'GAMEPLAY');
  engine.ingest({ vision });
  assert.equal(engine.getState().state, 'FULLSCREEN_UI');
  assert.deepEqual(states, ['FULLSCREEN_UI']);
});

test('gameplay restoration also requires stable confirmation', () => {
  const engine = new GameUiStateEngine({ candidateFrames: 2, restoreFrames: 3 });
  const ui = { state: 'FULLSCREEN_UI', confidence: 0.9, uiLikelihood: 0.9, baselineReady: true };
  engine.ingest({ vision: ui });
  engine.ingest({ vision: ui });
  assert.equal(engine.getState().state, 'FULLSCREEN_UI');

  const gameplay = { state: 'GAMEPLAY', confidence: 0.9, uiLikelihood: 0.05, baselineReady: true };
  engine.ingest({ vision: gameplay });
  engine.ingest({ vision: gameplay });
  assert.equal(engine.getState().state, 'FULLSCREEN_UI');
  engine.ingest({ vision: gameplay });
  assert.equal(engine.getState().state, 'GAMEPLAY');
});

test('telemetry wins over visual disagreement when confidence is sufficient', () => {
  const engine = new GameUiStateEngine({ candidateFrames: 1 });
  engine.ingest({
    telemetry: { state: 'INVENTORY', confidence: 0.95, source: 'atlas.telemetry' },
    vision: { state: 'GAMEPLAY', confidence: 0.9, uiLikelihood: 0.05, baselineReady: true }
  });
  assert.equal(engine.getState().state, 'INVENTORY');
  assert.equal(engine.getState().source, 'atlas.telemetry');
});
