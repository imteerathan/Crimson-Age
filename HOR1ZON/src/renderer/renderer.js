async function boot() {
  const manifest = await window.horizon.getManifest();
  const settings = await window.horizon.getSettings();
  const host = await window.horizon.getHostStatus();
  let updater = await window.horizon.getUpdaterState();

  document.querySelector('#version').textContent = manifest.version;
  document.querySelector('#host').textContent = `${host.mode} · connected=${host.connected}`;
  document.querySelector('#overlayEnabled').checked = settings.overlay.enabled;
  document.querySelector('#cutscene').checked = settings.overlay.autoHideDuringCutscene;

  const updaterStatus = document.querySelector('#updaterStatus');
  const updaterMessage = document.querySelector('#updaterMessage');
  const updateButton = document.querySelector('#update');
  const installButton = document.querySelector('#install');

  function renderUpdater() {
    updaterStatus.textContent = updater.state;
    updaterMessage.textContent = updater.error || (updater.availableVersion ? `Available: v${updater.availableVersion}` : 'No update selected');
    updateButton.disabled = ['CHECKING', 'DOWNLOADING', 'INSTALLING', 'RESTARTING'].includes(updater.state);
    installButton.disabled = updater.state !== 'READY';
    if (updater.state === 'DOWNLOADING') updateButton.textContent = `Downloading ${updater.progress || 0}%`;
    else updateButton.textContent = 'Check for Updates';
  }

  updateButton.onclick = async () => {
    updater = await window.horizon.checkForUpdates();
    if (updater.state === 'AVAILABLE') updater = await window.horizon.downloadUpdate();
    renderUpdater();
  };

  installButton.onclick = async () => {
    await window.horizon.installUpdate();
  };

  window.horizon.onUpdaterState((next) => {
    updater = next;
    renderUpdater();
  });
  renderUpdater();

  document.querySelector('#save').onclick = async () => {
    await window.horizon.setSettings({ overlay: {
      enabled: document.querySelector('#overlayEnabled').checked,
      autoHideDuringCutscene: document.querySelector('#cutscene').checked
    }});
  };

  document.querySelector('#reset').onclick = async () => {
    const next = await window.horizon.resetSettings();
    document.querySelector('#overlayEnabled').checked = next.overlay.enabled;
    document.querySelector('#cutscene').checked = next.overlay.autoHideDuringCutscene;
  };
}

boot().catch((error) => {
  document.body.innerHTML = `<main><section class="card"><h1>Horizon startup error</h1><pre>${String(error.stack || error)}</pre></section></main>`;
});
