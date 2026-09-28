const STATES = Object.freeze([
  'IDLE',
  'CHECKING',
  'UP_TO_DATE',
  'AVAILABLE',
  'DOWNLOADING',
  'READY',
  'INSTALLING',
  'RESTARTING',
  'UPDATED',
  'RECOVERY',
  'ERROR'
]);

const TRANSITIONS = {
  IDLE: new Set(['CHECKING']),
  CHECKING: new Set(['UP_TO_DATE', 'AVAILABLE', 'ERROR']),
  UP_TO_DATE: new Set(['CHECKING']),
  AVAILABLE: new Set(['DOWNLOADING', 'CHECKING', 'ERROR']),
  DOWNLOADING: new Set(['READY', 'ERROR']),
  READY: new Set(['INSTALLING', 'CHECKING']),
  INSTALLING: new Set(['RESTARTING', 'ERROR']),
  RESTARTING: new Set(['UPDATED', 'RECOVERY', 'ERROR']),
  UPDATED: new Set(['CHECKING']),
  RECOVERY: new Set(['CHECKING', 'ERROR']),
  ERROR: new Set(['CHECKING', 'RECOVERY'])
};

function createUpdaterState(version) {
  return {
    state: 'IDLE',
    currentVersion: version,
    availableVersion: null,
    progress: null,
    error: null,
    checkedAt: null,
    downloadedAt: null,
    updatedAt: null
  };
}

function transition(state, nextState, patch = {}) {
  if (!STATES.includes(nextState)) throw new Error(`Unknown updater state: ${nextState}`);
  const allowed = TRANSITIONS[state.state] || new Set();
  if (!allowed.has(nextState)) throw new Error(`Invalid updater transition: ${state.state} -> ${nextState}`);
  return { ...state, ...patch, state: nextState };
}

module.exports = { STATES, createUpdaterState, transition };
