const { negotiateCapabilities } = require('../../core/contracts/manifest');

const HOST_STATES = Object.freeze([
  'DISCOVERING',
  'CONNECTED',
  'NEGOTIATED',
  'RUNNING',
  'DISCONNECTED',
  'FALLBACK'
]);

function parseSemver(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.exec(String(version || ''));
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) throw new Error('Both versions must be valid SemVer values');
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function handshake({ manifest, hostInfo = null, hostCapabilities = [] }) {
  if (!hostInfo) {
    return {
      state: 'FALLBACK',
      connected: false,
      reason: 'HOST_NOT_FOUND',
      negotiated: [],
      fallback: manifest.capabilities.slice()
    };
  }

  if (hostInfo.name !== manifest.host.name) {
    return {
      state: 'FALLBACK',
      connected: false,
      reason: 'HOST_NAME_MISMATCH',
      negotiated: [],
      fallback: manifest.capabilities.slice()
    };
  }

  if (compareSemver(hostInfo.version, manifest.host.minVersion) < 0) {
    return {
      state: 'FALLBACK',
      connected: false,
      reason: 'HOST_VERSION_UNSUPPORTED',
      negotiated: [],
      fallback: manifest.capabilities.slice()
    };
  }

  const capabilities = negotiateCapabilities(manifest.capabilities, hostCapabilities);
  return {
    state: capabilities.fallback.length ? 'NEGOTIATED' : 'RUNNING',
    connected: true,
    reason: null,
    host: { name: hostInfo.name, version: hostInfo.version },
    negotiated: capabilities.negotiated,
    fallback: capabilities.fallback
  };
}

module.exports = { HOST_STATES, compareSemver, handshake };
