function resolveFeedUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !/^https:\/\//i.test(baseUrl)) {
    throw new Error('Update feed base URL must be an HTTPS URL');
  }
  const base = baseUrl.replace(/\/+$/, '');
  return base + '/stable/';
}

module.exports = { resolveFeedUrl };
