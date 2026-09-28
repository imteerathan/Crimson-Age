const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DiagnosticsService } = require('../src/services/diagnostics/service');

test('diagnostics records events and prunes by retention window', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-diag-'));
  let now = new Date('2026-09-28T12:00:00.000Z');
  const service = new DiagnosticsService(path.join(dir, 'events.jsonl'), {
    retentionDays: 2,
    now: () => now
  });

  service.record('old', { a: 1 });
  now = new Date('2026-09-26T11:59:59.000Z');
  service.record('boundary-old');
  now = new Date('2026-09-28T12:00:00.000Z');
  service.record('new');

  assert.equal(service.listRecent(10).length, 3);
  assert.equal(service.prune(), 1);
  assert.deepEqual(service.listRecent(10).map(x => x.event), ['new']);
});
