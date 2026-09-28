const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFeatures, meanAbsoluteDifference, histogramDistance, VisualGameUiDetector } = require('../src/services/overlay/visual-game-ui-detector');

function frameFromLuma(width, height, value) {
  const bitmap = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const index = i * 4;
    bitmap[index] = value;
    bitmap[index + 1] = value;
    bitmap[index + 2] = value;
    bitmap[index + 3] = 255;
  }
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => bitmap
  };
}

test('feature extraction is deterministic', () => {
  const features = extractFeatures(frameFromLuma(96, 54, 120));
  assert.equal(features.luma.length, 48 * 27);
  assert.equal(features.histogram.reduce((a, b) => a + b, 0) > 0.99, true);
  assert.equal(Math.abs(features.mean - 120) < 0.1, true);
});

test('image distance helpers are bounded', () => {
  const a = new Float32Array([0, 50, 100, 200]);
  const b = new Float32Array([10, 60, 90, 180]);
  assert.equal(meanAbsoluteDifference(a, b) >= 0, true);
  assert.equal(meanAbsoluteDifference(a, b) <= 1, true);
  assert.equal(histogramDistance(new Float32Array([1, 0]), new Float32Array([0, 1])), 1);
});

test('visual detector does not report UI before baseline is ready', () => {
  const detector = new VisualGameUiDetector();
  const first = detector.analyse(frameFromLuma(96, 54, 80));
  assert.equal(first.state, 'GAMEPLAY');
  assert.equal(first.baselineReady, false);
});

test('large stable visual transition can be classified as UI', () => {
  const detector = new VisualGameUiDetector({ uiThreshold: 0.55 });
  const gameplay = frameFromLuma(96, 54, 80);
  for (let i = 0; i < 6; i += 1) detector.analyse(gameplay);
  const menu = frameFromLuma(96, 54, 210);
  let result;
  for (let i = 0; i < 3; i += 1) result = detector.analyse(menu);
  assert.equal(result.state, 'FULLSCREEN_UI');
  assert.equal(result.uiLikelihood >= 0.55, true);
});
