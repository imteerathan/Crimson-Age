const { handshake } = require('./handshake');

const STATES = Object.freeze([
  'DISCONNECTED',
  'DISCOVERING',
  'CONNECTED',
  'NEGOTIATED',
  'RUNNING',
  'FALLBACK'
]);

class AtlasConnection {
  constructor(manifest) {
    this.manifest = manifest;
    this.state = {
      status: 'DISCONNECTED',
      connected: false,
      host: null,
      negotiated: [],
      fallback: [],
      reason: 'NOT_DISCOVERED',
      updatedAt: new Date().toISOString()
    };
  }

  evaluate(hostInfo, hostCapabilities) {
    const result = handshake({
      manifest: this.manifest,
      hostInfo: hostInfo || null,
      hostCapabilities: hostCapabilities || []
    });

    this.state = {
      status: result.state === 'RUNNING' ? 'RUNNING' : result.state === 'NEGOTIATED' ? 'NEGOTIATED' : 'FALLBACK',
      connected: result.connected,
      host: result.host || null,
      negotiated: result.negotiated || [],
      fallback: result.fallback || [],
      reason: result.reason || null,
      updatedAt: new Date().toISOString()
    };

    return this.getState();
  }

  disconnect(reason = 'HOST_DISCONNECTED') {
    this.state = {
      ...this.state,
      status: 'DISCONNECTED',
      connected: false,
      reason,
      updatedAt: new Date().toISOString()
    };
    return this.getState();
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

module.exports = { AtlasConnection, STATES };
