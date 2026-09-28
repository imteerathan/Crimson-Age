async function boot() {
  const manifest = await window.horizon.getManifest();
  const settings = await window.horizon.getSettings();
  const host = await window.horizon.getHostStatus();
  document.querySelector('#version').textContent = manifest.version;
  document.querySelector('#host').textContent = `${host.mode} · connected=${host.connected}`;
  document.querySelector('#overlayEnabled').checked = settings.overlay.enabled;
  document.querySelector('#cutscene').checked = settings.overlay.autoHideDuringCutscene;

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
