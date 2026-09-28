const { validateManifest, negotiateCapabilities } = require('../../core/contracts/manifest');
const { compareSemver } = require('./handshake');

const PROTOCOL_NAME = 'atlas-extension';
const PROTOCOL_VERSION = 1;

function validateHostInfo(hostInfo) {
  if (!hostInfo || typeof hostInfo !== 'object') throw new TypeError('hostInfo must be an object');
  if (typeof hostInfo.name !== 'string' || !hostInfo.name) throw new Error('Host name is required');
  if (typeof hostInfo.version !== 'string' || !hostInfo.version) throw new Error('Host version is required');
  if (hostInfo.protocol && typeof hostInfo.protocol === 'object') {
    if (hostInfo.protocol.name !== PROTOCOL_NAME) throw new Error('Unsupported host protocol');
    if (hostInfo.protocol.version !== PROTOCOL_VERSION) throw new Error('Unsupported host protocol version');
  }
  return true;
}

function createLoader({ manifest, onEvent = () => {} }) {
  validateManifest(manifest);

  let session = {
    loaded: false,
    host: null,
    negotiated: [],
    fallback: manifest.capabilities.slice(),
    reason: 'NOT_LOADED'
  };

  function emit(event, payload = {}) {
    onEvent({
      event,
      version: 1,
      timestamp: new Date().toISOString(),
      source: 'horizon.loader',
      payload
    });
  }

  function load(host) {
    if (!host || !host.info) {
      session = { ...session, loaded: false, reason: 'HOST_NOT_FOUND' };
      emit('horizon.loader.fallback', { reason: session.reason });
      return getState();
    }

    validateHostInfo(host.info);
    if (compareSemver(host.info.version, manifest.host.minVersion) < 0) {
      session = { ...session, loaded: false, reason: 'HOST_VERSION_UNSUPPORTED' };
      emit('horizon.loader.fallback', { reason: session.reason });
      return getState();
    }
    const negotiated = negotiateCapabilities(manifest.capabilities, host.capabilities || []);

    session = {
      loaded: true,
      host: { ...host.info },
      negotiated: negotiated.negotiated,
      fallback: negotiated.fallback,
      reason: negotiated.fallback.length ? 'PARTIAL_CAPABILITIES' : null
    };

    if (typeof host.onLoad === 'function') host.onLoad({ manifest, negotiated: negotiated.negotiated });
    emit('horizon.loader.loaded', {
      host: session.host,
      negotiated: session.negotiated,
      fallback: session.fallback
    });
    return getState();
  }

  function unload(reason = 'HOST_UNLOADED') {
    if (session.loaded) emit('horizon.loader.unloading', { reason });
    session = {
      loaded: false,
      host: null,
      negotiated: [],
      fallback: manifest.capabilities.slice(),
      reason
    };
    return getState();
  }

  function getState() {
    return JSON.parse(JSON.stringify(session));
  }

  return Object.freeze({ load, unload, getState });
}

module.exports = {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  validateHostInfo,
  createLoader
};
