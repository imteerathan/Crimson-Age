const fs = require('fs');
const path = require('path');

class DiagnosticsService {
  constructor(filePath, { retentionDays = 14, now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.retentionDays = retentionDays;
    this.now = now;
  }

  record(event, payload = {}) {
    if (!event || typeof event !== 'string') throw new TypeError('event must be a string');
    const entry = {
      timestamp: this.now().toISOString(),
      event,
      payload: payload && typeof payload === 'object' ? payload : { value: payload }
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  }

  listRecent(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
    let lines;
    try {
      lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return lines.slice(-limit).map(line => JSON.parse(line));
  }

  prune() {
    const cutoff = this.now().getTime() - this.retentionDays * 86400000;
    let entries;
    try {
      entries = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }

    const kept = entries.filter(entry => Date.parse(entry.timestamp) >= cutoff);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, kept.map(entry => JSON.stringify(entry)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
    return entries.length - kept.length;
  }
}

module.exports = { DiagnosticsService };
