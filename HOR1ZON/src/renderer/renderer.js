let settings;
let updater;
let host;

const $ = (id) => document.querySelector(id);
const pageButtons = document.querySelectorAll('[data-page]');

function showPage(id) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === id));
  pageButtons.forEach(button => button.classList.toggle('active', button.dataset.page === id));
}

function fillSettings(s) {
  $('#launchAtStartup').checked = s.general.launchAtStartup;
  $('#compactMode').checked = s.general.compactMode;
  $('#language').value = s.general.language;
  $('#overlayEnabled').checked = s.overlay.enabled;
  $('#autoHide').checked = s.overlay.autoHideDuringCutscene;
  $('#restore').checked = s.overlay.restoreAfterStableGameplay;
  $('#overlayMode').value = s.overlay.mode;
  $('#opacity').value = s.overlay.opacity;
  $('#hostMode').value = s.integration.hostMode;
  $('#telemetry').checked = s.integration.telemetryEnabled;
  $('#reconnect').checked = s.integration.reconnect;
  $('#channel').value = s.updates.channel;
  $('#checkLaunch').checked = s.updates.checkOnLaunch;
  $('#retention').value = s.privacy.diagnosticRetentionDays;
}

function readSettingsPatch() {
  return {
    general: {
      launchAtStartup: $('#launchAtStartup').checked,
      compactMode: $('#compactMode').checked,
      language: $('#language').value
    },
    overlay: {
      enabled: $('#overlayEnabled').checked,
      autoHideDuringCutscene: $('#autoHide').checked,
      restoreAfterStableGameplay: $('#restore').checked,
      mode: $('#overlayMode').value,
      opacity: Number($('#opacity').value)
    },
    integration: {
      hostMode: $('#hostMode').value,
      telemetryEnabled: $('#telemetry').checked,
      reconnect: $('#reconnect').checked
    },
    updates: {
      channel: $('#channel').value,
      checkOnLaunch: $('#checkLaunch').checked
    },
    privacy: {
      diagnosticRetentionDays: Number($('#retention').value)
    }
  };
}

async function renderRuntimeState() {
  const state = await window.horizon.getExtensionState();
  $('#launchCount').textContent = String(state.launchCount);
  $('#lastStarted').textContent = state.lastStartedAt || '—';
  const diagnostics = await window.horizon.getRecentDiagnostics(30);
  $('#diagnostics').textContent = diagnostics.length ? diagnostics.map(x => `${x.timestamp}  ${x.event}`).join('\\n') : 'No diagnostics yet.';
}

function renderHost(state) {
  $('#hostPill').textContent = state.status;
  $('#dashHost').textContent = state.connected
    ? `${state.host?.name || 'Atlas'} v${state.host?.version || '?'}`
    : 'Standalone fallback';
  $('#dashCaps').textContent = state.negotiated?.length ? state.negotiated.join(', ') : 'Local capabilities only';
  $('#connectionState').textContent = state.status;
  window.horizon.getLoaderStatus().then(loader => { $('#loaderState').textContent = loader.loaded ? 'LOADED' : loader.reason; }).catch(() => { $('#loaderState').textContent = 'UNAVAILABLE'; });
  $('#connectionReason').textContent = state.reason || 'None';
  $('#connectionNegotiated').textContent = state.negotiated?.join(', ') || 'None';
  $('#connectionFallback').textContent = state.fallback?.join(', ') || 'None';
}

function renderOverlay(state) {
  const value = state || {};
  $('#overlayStatus').textContent = value.visible ? 'VISIBLE' : 'HIDDEN';
  $('#overlayModeDash').textContent = value.mode || 'FULL';
}

async function refreshOverlay() {
  const state = await window.horizon.getOverlayState();
  renderOverlay(state);
}

function renderUpdater(state) {
  updater = state;
  $('#dashUpdate').textContent = state.state;
  $('#dashVersion').textContent = state.currentVersion || '—';
  $('#updateMessage').textContent = state.error || (state.availableVersion ? `Available: v${state.availableVersion}` : state.state === 'UNCONFIGURED' ? 'Update feed is not configured for this build.' : 'No update selected.');
  $('#updateBar').style.width = `${Math.max(0, Math.min(100, Number(state.progress || 0)))}%`;
  $('#checkUpdate').disabled = ['CHECKING','DOWNLOADING','INSTALLING','RESTARTING'].includes(state.state);
  $('#downloadUpdate').disabled = state.state !== 'AVAILABLE';
  $('#installUpdate').disabled = state.state !== 'READY';
  $('#checkUpdate').textContent = state.state === 'DOWNLOADING' ? `Downloading ${state.progress || 0}%` : 'Check for Updates';
}

async function boot() {
  for (const button of pageButtons) button.onclick = () => showPage(button.dataset.page);

  const manifest = await window.horizon.getManifest();
  settings = await window.horizon.getSettings();
  host = await window.horizon.getHostStatus();
  updater = await window.horizon.getUpdaterState();

  $('#headerVersion').textContent = `v${manifest.version}`;
  fillSettings(settings);
  renderHost(host);
  renderUpdater(updater);
  await refreshOverlay();
  await renderRuntimeState();

  $('#saveSettings').onclick = async () => {
    try {
      settings = await window.horizon.setSettings(readSettingsPatch());
      fillSettings(settings);
      $('#settingsMessage').textContent = 'Settings saved.';
    } catch (error) {
      $('#settingsMessage').textContent = error?.message || String(error);
    }
  };

  $('#resetSettings').onclick = async () => {
    settings = await window.horizon.resetSettings();
    fillSettings(settings);
    $('#settingsMessage').textContent = 'Settings reset to defaults.';
  };

  $('#checkUpdate').onclick = async () => {
    updater = await window.horizon.checkForUpdates();
    renderUpdater(updater);
  };

  $('#downloadUpdate').onclick = async () => {
    updater = await window.horizon.downloadUpdate();
    renderUpdater(updater);
  };

  $('#installUpdate').onclick = async () => {
    await window.horizon.installUpdate();
  };

  $('#showOverlay').onclick = async () => renderOverlay(await window.horizon.showOverlay());
  $('#hideOverlay').onclick = async () => renderOverlay(await window.horizon.hideOverlay());
  $('#toggleOverlay').onclick = async () => renderOverlay(await window.horizon.toggleOverlay());

  $('#refreshHost').onclick = async () => {
    host = await window.horizon.getHostStatus();
    renderHost(host);
    await renderRuntimeState();
  };

  window.horizon.onUpdaterState(next => renderUpdater(next));
}

boot().catch(error => {
  document.body.innerHTML = `<main><section class="card"><h1>Horizon startup error</h1><pre>${String(error.stack || error)}</pre></section></main>`;
});
