const test = require('node:test');
const assert = require('node:assert/strict');
const { MigrationService } = require('../src/services/migration/service');

test('migration service applies each pending version in order', () => {
  const order = [];
  const service = new MigrationService({
    currentVersion: 3,
    migrations: [
      { version: 1, up: () => order.push(1) },
      { version: 2, up: () => order.push(2) },
      { version: 3, up: () => order.push(3) }
    ]
  });
  const result = service.run(0);
  assert.deepEqual(order, [1,2,3]);
  assert.deepEqual(result.applied, [1,2,3]);
  assert.equal(result.version, 3);
});

test('migration service rejects newer stored versions', () => {
  const service = new MigrationService({ currentVersion: 2, migrations: [] });
  assert.throws(() => service.run(3), /newer than this build/);
});
