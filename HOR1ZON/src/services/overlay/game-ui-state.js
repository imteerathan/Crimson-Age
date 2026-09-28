const HIDDEN_STATES = new Set([
  'FULLSCREEN_UI',
  'MENU',
  'INVENTORY',
  'SKILL',
  'STORAGE',
  'MAP',
  'JOURNAL',
  'PHOTO_MODE',
  'CUTSCENE',
  'DIALOGUE',
  'INPUT_UI'
]);

const STATES = new Set([
  'UNKNOWN',
  'GAMEPLAY',
  ...HIDDEN_STATES
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function normalizeState(value) {
  const state = String(value || 'UNKNOWN').trim().toUpperCase();
  return STATES.has(state) ? state : 'UNKNOWN';
}

function normalizeConfidence(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : fallback;
}

function normalizeTimestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

class GameUiStateEngine {
  constructor({
    onState = () => {},
    candidateFrames = 3,
    restoreFrames = 4,
    minConfidence = 0.72,
    inputHintTtlMs = 900
  } = {}) {
    if (typeof onState !== 'function') throw new TypeError('onState must be a function');
    this.onState = onState;
    this.candidateFrames = Math.max(1, Number(candidateFrames) || 3);
    this.restoreFrames = Math.max(1, Number(restoreFrames) || 4);
    this.minConfidence = clamp(minConfidence, 0.5, 1);
    this.inputHintTtlMs = Math.max(100, Number(inputHintTtlMs) || 900);
    this.state = 'GAMEPLAY';
    this.source = 'default';
    this.confidence = 0.5;
    this.reason = 'startup';
    this.updatedAt = new Date().toISOString();
    this.candidate = null;
    this.candidateCount = 0;
    this.restoreCount = 0;
    this.lastInputHint = null;
    this.lastEvidence = null;
  }

  reset(reason = 'reset') {
    this.state = 'GAMEPLAY';
    this.source = 'reset';
    this.confidence = 0.5;
    this.reason = reason;
    this.updatedAt = new Date().toISOString();
    this.candidate = null;
    this.candidateCount = 0;
    this.restoreCount = 0;
    this.lastInputHint = null;
    this.lastEvidence = null;
    this.onState(this.getState());
    return this.getState();
  }

  noteInputHint(input, timestamp = new Date().toISOString(), meta = {}) {
    this.lastInputHint = {
      input: String(input || 'UNKNOWN').toUpperCase(),
      timestamp: normalizeTimestamp(timestamp),
      meta: { ...meta }
    };
    return this.getState();
  }

  setTelemetryState(state, confidence = 1, meta = {}) {
    return this.ingest({
      telemetry: {
        state,
        confidence,
        source: meta.source || 'telemetry',
        reason: meta.reason || 'telemetry'
      },
      timestamp: meta.timestamp
    });
  }

  selectEvidence({ telemetry, vision, inputHint, timestamp }) {
    const now = Date.parse(normalizeTimestamp(timestamp));
    const hint = inputHint || this.lastInputHint;
    const hintAge = hint ? Math.max(0, now - Date.parse(hint.timestamp)) : Infinity;
    const recentInputHint = hintAge <= this.inputHintTtlMs;

    const telemetryState = normalizeState(telemetry?.state);
    const telemetryConfidence = normalizeConfidence(telemetry?.confidence);
    if (telemetryState !== 'UNKNOWN' && telemetryConfidence >= this.minConfidence) {
      return {
        state: telemetryState,
        confidence: telemetryConfidence,
        source: telemetry.source || 'telemetry',
        reason: telemetry.reason || 'telemetry-confirmed',
        recentInputHint
      };
    }

    const visionState = normalizeState(vision?.state);
    const visionConfidence = normalizeConfidence(
      vision?.confidence,
      normalizeConfidence(vision?.uiLikelihood, 0)
    );
    const threshold = recentInputHint ? Math.max(0.62, this.minConfidence - 0.08) : this.minConfidence;
    if (visionState !== 'UNKNOWN' && visionConfidence >= threshold) {
      return {
        state: visionState,
        confidence: visionConfidence,
        source: vision.source || 'vision',
        reason: vision.reason || 'vision-confirmed',
        recentInputHint
      };
    }

    const uiLikelihood = normalizeConfidence(vision?.uiLikelihood, 0);
    if (uiLikelihood >= threshold) {
      return {
        state: 'FULLSCREEN_UI',
        confidence: uiLikelihood,
        source: vision?.source || 'vision',
        reason: recentInputHint ? 'visual-ui-after-input-hint' : 'visual-ui',
        recentInputHint
      };
    }

    if (vision?.baselineReady && normalizeState(visionState) === 'GAMEPLAY') {
      return {
        state: 'GAMEPLAY',
        confidence: Math.max(0.5, 1 - uiLikelihood),
        source: vision.source || 'vision',
        reason: vision.reason || 'visual-gameplay',
        recentInputHint
      };
    }

    return {
      state: 'UNKNOWN',
      confidence: 0,
      source: 'none',
      reason: 'insufficient-evidence',
      recentInputHint
    };
  }

  emit(state, evidence, timestamp) {
    this.state = state;
    this.source = evidence.source;
    this.confidence = evidence.confidence;
    this.reason = evidence.reason;
    this.updatedAt = normalizeTimestamp(timestamp);
    this.onState(this.getState());
  }

  ingest({ telemetry = null, vision = null, inputHint = null, timestamp = new Date().toISOString() } = {}) {
    if (inputHint) this.noteInputHint(inputHint.input || inputHint, inputHint.timestamp || timestamp, inputHint.meta || {});

    const evidence = this.selectEvidence({
      telemetry,
      vision,
      inputHint: inputHint || this.lastInputHint,
      timestamp
    });
    this.lastEvidence = {
      ...evidence,
      timestamp: normalizeTimestamp(timestamp)
    };

    if (evidence.state === 'UNKNOWN') {
      this.candidate = null;
      this.candidateCount = 0;
      this.restoreCount = 0;
      return this.getState();
    }

    if (evidence.state === 'GAMEPLAY') {
      this.candidate = null;
      this.candidateCount = 0;
      this.restoreCount += 1;
      if (this.state !== 'GAMEPLAY' && this.restoreCount >= this.restoreFrames) {
        this.emit('GAMEPLAY', evidence, timestamp);
      } else if (this.state === 'GAMEPLAY' && (this.source !== evidence.source || Math.abs(this.confidence - evidence.confidence) > 0.12)) {
        this.emit('GAMEPLAY', evidence, timestamp);
      }
      return this.getState();
    }

    this.restoreCount = 0;
    if (this.state === evidence.state) {
      this.candidate = evidence.state;
      this.candidateCount = this.candidateFrames;
      if (this.source !== evidence.source || Math.abs(this.confidence - evidence.confidence) > 0.12) {
        this.emit(evidence.state, evidence, timestamp);
      }
      return this.getState();
    }

    if (this.candidate === evidence.state) this.candidateCount += 1;
    else {
      this.candidate = evidence.state;
      this.candidateCount = 1;
    }

    if (this.candidateCount >= this.candidateFrames) this.emit(evidence.state, evidence, timestamp);
    return this.getState();
  }

  getState() {
    return {
      state: this.state,
      source: this.source,
      confidence: this.confidence,
      reason: this.reason,
      updatedAt: this.updatedAt,
      candidate: this.candidate,
      candidateCount: this.candidateCount,
      restoreCount: this.restoreCount,
      lastInputHint: this.lastInputHint ? { ...this.lastInputHint, meta: { ...(this.lastInputHint.meta || {}) } } : null,
      lastEvidence: this.lastEvidence ? { ...this.lastEvidence } : null
    };
  }
}

module.exports = { HIDDEN_STATES, STATES, normalizeState, GameUiStateEngine };
