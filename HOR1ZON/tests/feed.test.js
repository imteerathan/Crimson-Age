const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChannel, resolveFeedUrl } = require('../src/services/updater/feed');

test('update feed resolver supports stable and beta channels', () => {
  assert.equal(normalizeChannel('STABLE'), 'stable');
  assert.equal(normalizeChannel('beta'), 'beta');
  assert.equal(
    resolveFeedUrl('https://updates.example.test/root/', 'stable'),
    'https://updates.example.test/root/stable/'
  );
});

test('update feed resolver rejects unsupported or insecure configuration', () => {
  assert.throws(() => normalizeChannel('nightly'), /Unsupported update channel/);
  assert.throws(() => resolveFeedUrl('http://updates.example.test/root', 'stable'), /HTTPS URL/);
});
