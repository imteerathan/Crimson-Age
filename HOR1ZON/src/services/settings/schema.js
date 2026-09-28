const ALLOWED_MODES = new Set(['FULL', 'COMPACT', 'FOCUS']);
const ALLOWED_LANGUAGES = new Set(['auto', 'th', 'en']);
const ALLOWED_HOST_MODES = new Set(['AUTO', 'ATLAS', 'STANDALONE']);
const ALLOWED_CHANNELS = new Set(['stable', 'beta']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateSettings(settings) {
  assert(settings && typeof settings === 'object', 'Settings must be an object');
  assert(settings.general && typeof settings.general === 'object', 'general settings are required');
  assert(typeof settings.general.launchAtStartup === 'boolean', 'general.launchAtStartup must be boolean');
  assert(typeof settings.general.compactMode === 'boolean', 'general.compactMode must be boolean');
  assert(ALLOWED_LANGUAGES.has(settings.general.language), 'general.language is invalid');

  assert(settings.overlay && typeof settings.overlay === 'object', 'overlay settings are required');
  assert(typeof settings.overlay.enabled === 'boolean', 'overlay.enabled must be boolean');
  assert(ALLOWED_MODES.has(settings.overlay.mode), 'overlay.mode is invalid');
  assert(Number.isFinite(settings.overlay.opacity) && settings.overlay.opacity >= 0.35 && settings.overlay.opacity <= 1, 'overlay.opacity must be between 0.35 and 1');
  assert(typeof settings.overlay.manualHide === 'boolean', 'overlay.manualHide must be boolean');
  assert(typeof settings.overlay.autoHideDuringCutscene === 'boolean', 'overlay.autoHideDuringCutscene must be boolean');
  assert(typeof settings.overlay.restoreAfterStableGameplay === 'boolean', 'overlay.restoreAfterStableGameplay must be boolean');

  assert(settings.integration && typeof settings.integration === 'object', 'integration settings are required');
  assert(ALLOWED_HOST_MODES.has(settings.integration.hostMode), 'integration.hostMode is invalid');
  assert(typeof settings.integration.telemetryEnabled === 'boolean', 'integration.telemetryEnabled must be boolean');
  assert(typeof settings.integration.reconnect === 'boolean', 'integration.reconnect must be boolean');

  assert(settings.updates && typeof settings.updates === 'object', 'updates settings are required');
  assert(ALLOWED_CHANNELS.has(settings.updates.channel), 'updates.channel is invalid');
  assert(typeof settings.updates.checkOnLaunch === 'boolean', 'updates.checkOnLaunch must be boolean');

  assert(settings.privacy && typeof settings.privacy === 'object', 'privacy settings are required');
  assert(Number.isInteger(settings.privacy.diagnosticRetentionDays) && settings.privacy.diagnosticRetentionDays >= 1 && settings.privacy.diagnosticRetentionDays <= 365, 'privacy.diagnosticRetentionDays must be 1-365');

  return true;
}

module.exports = { validateSettings };
