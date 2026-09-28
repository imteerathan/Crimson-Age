class MigrationService {
  constructor({ currentVersion, migrations = [] }) {
    if (!Number.isInteger(currentVersion) || currentVersion < 1) throw new TypeError('currentVersion must be a positive integer');
    this.currentVersion = currentVersion;
    this.migrations = new Map();

    for (const migration of migrations) {
      if (!Number.isInteger(migration.version) || migration.version < 1) throw new TypeError('migration.version must be positive');
      if (typeof migration.up !== 'function') throw new TypeError('migration.up must be a function');
      if (this.migrations.has(migration.version)) throw new Error('Duplicate migration version');
      this.migrations.set(migration.version, migration.up);
    }
  }

  run(fromVersion, context = {}) {
    if (!Number.isInteger(fromVersion) || fromVersion < 0) throw new TypeError('fromVersion must be a non-negative integer');
    if (fromVersion > this.currentVersion) throw new Error('Stored migration version is newer than this build');

    const applied = [];
    let version = fromVersion;
    for (let next = fromVersion + 1; next <= this.currentVersion; next += 1) {
      const migrate = this.migrations.get(next);
      if (migrate) migrate(context);
      applied.push(next);
      version = next;
    }
    return { version, applied };
  }
}

module.exports = { MigrationService };
