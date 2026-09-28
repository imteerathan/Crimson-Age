const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFeedUrl } = require('../src/services/updater/feed');

test('update feed resolver always uses the stable channel', () => {
  assert.equal(
    resolveFeedUrl('https://updates.example.test/root/'),
    'https://updates.example.test/root/stable/'
  );
});

test('update feed resolver rejects insecure configuration', () => {
  assert.throws(() => resolveFeedUrl('http://updates.example.test/root'), /HTTPS URL/);
});
