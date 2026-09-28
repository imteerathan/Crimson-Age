function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeLuma(bitmap, width, height, outWidth = 48, outHeight = 27) {
  if (!Buffer.isBuffer(bitmap)) throw new TypeError('bitmap must be a Buffer');
  const expected = width * height * 4;
  if (bitmap.length < expected) throw new Error('bitmap is smaller than expected');

  const data = new Float32Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y / outHeight) * height));
    for (let x = 0; x < outWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x / outWidth) * width));
      const index = ((sy * width) + sx) * 4;
      const b = bitmap[index];
      const g = bitmap[index + 1];
      const r = bitmap[index + 2];
      data[(y * outWidth) + x] = (0.114 * b) + (0.587 * g) + (0.299 * r);
    }
  }
  return data;
}

function mean(values) {
  if (!values.length) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function variance(values, average = mean(values)) {
  if (!values.length) return 0;
  let total = 0;
  for (const value of values) {
    const delta = value - average;
    total += delta * delta;
  }
  return total / values.length;
}

function histogram(values, bins = 8) {
  const result = new Float32Array(bins);
  if (!values.length) return result;
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value / 256) * bins));
    result[index] += 1;
  }
  for (let i = 0; i < result.length; i += 1) result[i] /= values.length;
  return result;
}

function histogramDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return clamp(total / 2);
}

function meanAbsoluteDifference(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return clamp(total / 255);
}

function edgeDensity(values, width, height) {
  if (!values.length) return 0;
  let edges = 0;
  let samples = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const index = (y * width) + x;
      const dx = Math.abs(values[index + 1] - values[index]);
      const dy = Math.abs(values[index + width] - values[index]);
      if ((dx + dy) > 55) edges += 1;
      samples += 1;
    }
  }
  return samples ? edges / samples : 0;
}

function extractFeatures(frame, outWidth = 48, outHeight = 27) {
  if (!frame) throw new TypeError('frame is required');
  const size = typeof frame.getSize === 'function' ? frame.getSize() : frame.size;
  if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error('frame size is unavailable');
  }
  const bitmap = typeof frame.toBitmap === 'function' ? frame.toBitmap() : frame.bitmap;
  const luma = normalizeLuma(bitmap, size.width, size.height, outWidth, outHeight);
  const average = mean(luma);
  return {
    luma,
    histogram: histogram(luma),
    mean: average,
    variance: variance(luma, average),
    edgeDensity: edgeDensity(luma, outWidth, outHeight),
    width: outWidth,
    height: outHeight
  };
}

class VisualGameUiDetector {
  constructor({
    onObservation = () => {},
    uiThreshold = 0.72,
    restoreThreshold = 0.28,
    maxStaticMotion = 0.12,
    baselineAlpha = 0.06
  } = {}) {
    this.onObservation = onObservation;
    this.uiThreshold = clamp(uiThreshold, 0.5, 0.95);
    this.restoreThreshold = clamp(restoreThreshold, 0.05, 0.5);
    this.maxStaticMotion = clamp(maxStaticMotion, 0.03, 0.5);
    this.baselineAlpha = clamp(baselineAlpha, 0.01, 0.25);
    this.baseline = null;
    this.previous = null;
    this.samples = 0;
  }

  reset() {
    this.baseline = null;
    this.previous = null;
    this.samples = 0;
  }

  analyse(frame) {
    const current = extractFeatures(frame);
    this.samples += 1;

    if (!this.baseline) {
      this.baseline = current;
      this.previous = current;
      const result = {
        state: 'GAMEPLAY',
        confidence: 0.5,
        uiLikelihood: 0,
        baselineReady: false,
        source: 'vision',
        reason: 'baseline-initialized',
        difference: 0,
        motion: 0,
        edgeShift: 0,
        sampleCount: this.samples
      };
      this.onObservation(result);
      return result;
    }

    const difference = meanAbsoluteDifference(current.luma, this.baseline.luma);
    const motion = meanAbsoluteDifference(current.luma, this.previous.luma);
    const histShift = histogramDistance(current.histogram, this.baseline.histogram);
    const edgeShift = clamp(Math.abs(current.edgeDensity - this.baseline.edgeDensity) * 3);
    const staticScore = clamp(1 - (motion / this.maxStaticMotion));
    const spatialScore = clamp((difference - 0.18) / 0.32);
    const histogramScore = clamp((histShift - 0.08) / 0.32);

    const uiLikelihood = clamp(
      (spatialScore * 0.5)
      + (histogramScore * 0.28)
      + (staticScore * 0.16)
      + (edgeShift * 0.06)
    );

    const gameplayLike = uiLikelihood < this.restoreThreshold || motion > this.maxStaticMotion;
    if (gameplayLike) {
      this.blendBaseline(current);
    }

    const baselineReady = this.samples >= 5;
    let state = 'UNKNOWN';
    let confidence = uiLikelihood;
    let reason = 'uncertain-visual-state';

    if (baselineReady && uiLikelihood >= this.uiThreshold && motion <= this.maxStaticMotion) {
      state = 'FULLSCREEN_UI';
      confidence = uiLikelihood;
      reason = 'stable-visual-ui';
    } else if (gameplayLike) {
      state = 'GAMEPLAY';
      confidence = Math.max(0.5, 1 - uiLikelihood);
      reason = motion > this.maxStaticMotion ? 'dynamic-gameplay' : 'visual-gameplay';
    }

    const result = {
      state,
      confidence,
      uiLikelihood,
      baselineReady,
      source: 'vision',
      reason,
      difference,
      motion,
      edgeShift,
      histogramShift: histShift,
      sampleCount: this.samples
    };
    this.previous = current;
    this.onObservation(result);
    return result;
  }

  blendBaseline(current) {
    if (!this.baseline) {
      this.baseline = current;
      return;
    }
    const alpha = this.baselineAlpha;
    for (let i = 0; i < this.baseline.luma.length; i += 1) {
      this.baseline.luma[i] = (this.baseline.luma[i] * (1 - alpha)) + (current.luma[i] * alpha);
    }
    for (let i = 0; i < this.baseline.histogram.length; i += 1) {
      this.baseline.histogram[i] = (this.baseline.histogram[i] * (1 - alpha)) + (current.histogram[i] * alpha);
    }
    this.baseline.mean = (this.baseline.mean * (1 - alpha)) + (current.mean * alpha);
    this.baseline.variance = (this.baseline.variance * (1 - alpha)) + (current.variance * alpha);
    this.baseline.edgeDensity = (this.baseline.edgeDensity * (1 - alpha)) + (current.edgeDensity * alpha);
  }

  getState() {
    return {
      samples: this.samples,
      baselineReady: this.samples >= 5,
      configured: true
    };
  }
}

module.exports = {
  clamp,
  normalizeLuma,
  histogram,
  histogramDistance,
  meanAbsoluteDifference,
  edgeDensity,
  extractFeatures,
  VisualGameUiDetector
};
