const CHANNELS = new Set(['stable', 'beta']);

function normalizeChannel(channel) {
  const value = String(channel || '').trim().toLowerCase();
  if (!CHANNELS.has(value)) throw new Error(`Unsupported update channel: ${value || 'empty'}`);
  return value;
}

function resolveFeedUrl(baseUrl, channel = 'stable') {
  if (typeof baseUrl !== 'string' || !/^https:\/\//i.test(baseUrl)) {
    throw new Error('Update feed base URL must be an HTTPS URL');
  }
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${normalizeChannel(channel)}/`;
}

module.exports = { CHANNELS, normalizeChannel, resolveFeedUrl };
