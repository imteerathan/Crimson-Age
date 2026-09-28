const fs = require('fs');
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = clone(defaults);
    this.state = clone(defaults);
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.state = { ...clone(this.defaults), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const corruptPath = this.filePath.replace(/\.json$/i, '.corrupt.json');
        try { fs.renameSync(this.filePath, corruptPath); } catch {}
      }
      this.state = clone(this.defaults);
      this.save();
    }
    return this.get();
  }

  get() {
    return clone(this.state);
  }

  set(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('patch must be an object');
    this.state = { ...this.state, ...clone(patch) };
    this.save();
    return this.get();
  }

  reset() {
    this.state = clone(this.defaults);
    this.save();
    return this.get();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { JsonStore, clone };
