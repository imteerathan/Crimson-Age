const { validateHostInfo, PROTOCOL_NAME, PROTOCOL_VERSION } = require('./loader');

const STATES = Object.freeze(['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'DEGRADED', 'ERROR']);

class AtlasBridge {
  constructor({ manifest, transport }) {
    if (!manifest || typeof manifest !== 'object') throw new TypeError('manifest is required');
    if (!transport || typeof transport.getHostInfo !== 'function' || typeof transport.getCapabilities !== 'function') {
      throw new TypeError('transport must provide getHostInfo() and getCapabilities()');
    }
    this.manifest = manifest;
    this.transport = transport;
    this.state = {
      status: 'DISCONNECTED',
      host: null,
      capabilities: [],
      reason: 'NOT_CONNECTED',
      updatedAt: new Date().toISOString()
    };
  }

  async connect() {
    this.state = { ...this.state, status: 'CONNECTING', reason: null, updatedAt: new Date().toISOString() };
    try {
      const info = await this.transport.getHostInfo();
      validateHostInfo(info);
      if (info.name !== this.manifest.host.name) throw new Error('Host name mismatch');
      if (info.protocol && (info.protocol.name !== PROTOCOL_NAME || info.protocol.version !== PROTOCOL_VERSION)) {
        throw new Error('Unsupported host protocol');
      }

      const capabilities = await this.transport.getCapabilities();
      if (!Array.isArray(capabilities)) throw new Error('Host capabilities must be an array');

      this.state = {
        status: 'CONNECTED',
        host: { name: info.name, version: info.version, protocol: info.protocol || null },
        capabilities: capabilities.slice(),
        reason: null,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.state = {
        status: 'ERROR',
        host: null,
        capabilities: [],
        reason: error?.message || String(error),
        updatedAt: new Date().toISOString()
      };
    }
    return this.getState();
  }

  disconnect(reason = 'HOST_DISCONNECTED') {
    this.state = {
      status: 'DISCONNECTED',
      host: null,
      capabilities: [],
      reason,
      updatedAt: new Date().toISOString()
    };
    return this.getState();
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

module.exports = { AtlasBridge, STATES };
