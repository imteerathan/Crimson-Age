const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateVersion(version, fieldName) {
  assert(typeof version === 'string' && SEMVER_RE.test(version), `${fieldName} must be SemVer`);
}

function validateManifest(manifest) {
  assert(manifest && typeof manifest === 'object', 'Manifest must be an object');
  assert(typeof manifest.id === 'string' && manifest.id.length > 0, 'Manifest id is required');
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'Manifest name is required');
  validateVersion(manifest.version, 'Manifest version');
  assert(manifest.host && typeof manifest.host === 'object', 'Manifest host is required');
  assert(typeof manifest.host.name === 'string' && manifest.host.name.length > 0, 'Host name is required');
  validateVersion(manifest.host.minVersion, 'Host minimum version');
  assert(Array.isArray(manifest.capabilities), 'Capabilities must be an array');
  assert(manifest.capabilities.every(x => typeof x === 'string' && x.length > 0), 'Capabilities must be non-empty strings');
  assert(manifest.permissions && typeof manifest.permissions === 'object', 'Permissions are required');
  assert(manifest.permissions.gameSaveWrite === false, 'Horizon must not request game save writes');
  assert(manifest.entry && typeof manifest.entry === 'object', 'Manifest entry points are required');
  assert(typeof manifest.entry.renderer === 'string', 'Renderer entry is required');
  assert(typeof manifest.entry.service === 'string', 'Service entry is required');
  return true;
}

function negotiateCapabilities(requested, hostSupported) {
  const requestedSet = new Set(requested || []);
  const supportedSet = new Set(hostSupported || []);
  const negotiated = [];
  const fallback = [];

  for (const capability of requestedSet) {
    if (supportedSet.has(capability)) negotiated.push(capability);
    else fallback.push(capability);
  }

  return { negotiated, fallback };
}

module.exports = { validateManifest, negotiateCapabilities };
