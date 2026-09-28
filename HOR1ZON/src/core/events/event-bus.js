class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const bucket = this.listeners.get(eventName) || new Set();
    bucket.add(callback);
    this.listeners.set(eventName, bucket);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(callback);
    if (!bucket.size) this.listeners.delete(eventName);
  }

  emit(event) {
    if (!event || typeof event !== 'object') throw new TypeError('event must be an object');
    if (typeof event.event !== 'string' || !event.event) throw new Error('event.event is required');
    if (!Number.isInteger(event.version) || event.version < 1) throw new Error('event.version must be a positive integer');

    const listeners = this.listeners.get(event.event);
    if (!listeners) return 0;

    let count = 0;
    for (const callback of [...listeners]) {
      callback(event);
      count += 1;
    }
    return count;
  }
}

module.exports = { EventBus };
