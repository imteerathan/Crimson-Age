const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldTrackWindow, WindowDisplayTracker, GameInputUiDetector } = require('../src/services/overlay/window-display');

test('window target filter ignores Horizon and tiny windows', () => {
  assert.equal(shouldTrackWindow({ pid: 10, processName: 'Crimson-Atlas-Horizon', title: 'Horizon', bounds: { width: 1920, height: 1080 } }, { ownProcessNames: ['Crimson-Atlas-Horizon'] }), false);
  assert.equal(shouldTrackWindow({ pid: 12, processName: 'Game', title: 'Game', bounds: { width: 200, height: 120 } }), false);
  assert.equal(shouldTrackWindow({ pid: 13, processName: 'Game', title: 'Game', bounds: { width: 1600, height: 900 } }), true);
});

test('display tracker moves target only when game window changes display', () => {
  let callback;
  let calls = 0;
  const display1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const display2 = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } };
  const windows = [
    { pid: 100, processName: 'Game', title: 'Game', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    { pid: 100, processName: 'Game', title: 'Game', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    { pid: 100, processName: 'Game', title: 'Game', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
  ];

  const tracker = new WindowDisplayTracker({
    resolveWindow: cb => cb(null, windows.shift()),
    screenApi: {
      getDisplayNearestPoint: point => point.x >= 1920 ? display2 : display1,
      getDisplayMatching: bounds => bounds.x >= 1920 ? display2 : display1
    },
    onDisplay: display => { calls += 1; callback = display.id; }
  });

  tracker.poll();
  tracker.poll();
  tracker.poll();

  assert.equal(calls, 2);
  assert.equal(callback, 1);
  assert.equal(tracker.getState().displayId, '1');
});

test('tracker ignores resolver errors', () => {
  const tracker = new WindowDisplayTracker({
    resolveWindow: cb => cb(new Error('resolver unavailable'), null),
    screenApi: { getDisplayMatching: () => ({ id: 1 }) }
  });
  assert.doesNotThrow(() => tracker.poll());
  assert.equal(tracker.getState().displayId, null);
});


test('display tracker can restrict tracking to Crimson Desert process', () => {
  const display = { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } };
  let calls = 0;
  const tracker = new WindowDisplayTracker({
    resolveWindow: cb => cb(null, {
      pid: 200,
      processName: 'SomeOtherGame',
      title: 'Other Game',
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 }
    }),
    screenApi: { getDisplayMatching: () => display },
    onDisplay: () => { calls += 1; },
    trackedProcessNames: ['CrimsonDesert']
  });
  tracker.poll();
  assert.equal(calls, 0);
  assert.equal(tracker.getState().displayId, null);
});



test('display tracker reports game presence when the game opens and closes', () => {
  const game = { pid: 200, processName: 'CrimsonDesert', title: 'Crimson Desert', bounds: { x: 0, y: 0, width: 1600, height: 900 } };
  const sequence = [game, game, null, null, null];
  const presence = [];
  const tracker = new WindowDisplayTracker({
    resolveWindow: cb => cb(null, sequence.shift() || null),
    screenApi: { getDisplayNearestPoint: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    trackedProcessNames: ['CrimsonDesert'],
    onPresence: value => presence.push(value),
    missingSamples: 3
  });
  tracker.poll();
  tracker.poll();
  tracker.poll();
  tracker.poll();
  tracker.poll();
  assert.deepEqual(presence, [true, false]);
  assert.equal(tracker.getState().present, false);
});

test('game input detector emits one edge per ESC and controller menu/view press', () => {
  const samples = [
    { processName: 'CrimsonDesert', pressed: [] },
    { processName: 'CrimsonDesert', pressed: ['ESC'] },
    { processName: 'CrimsonDesert', pressed: ['ESC'] },
    { processName: 'CrimsonDesert', pressed: [] },
    { processName: 'CrimsonDesert', pressed: ['GAMEPAD_MENU'] },
    { processName: 'CrimsonDesert', pressed: ['GAMEPAD_MENU'] },
    { processName: 'CrimsonDesert', pressed: ['GAMEPAD_VIEW'] }
  ];
  const events = [];
  const detector = new GameInputUiDetector({
    resolveInput: cb => cb(null, samples.shift()),
    onInput: input => events.push(input)
  });
  for (let i = 0; i < 7; i++) detector.poll();
  assert.deepEqual(events, ['ESC', 'GAMEPAD_MENU', 'GAMEPAD_VIEW']);
});
