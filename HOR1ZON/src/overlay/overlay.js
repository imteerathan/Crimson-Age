function $(id){return document.getElementById(id)}

function render(state){
  const mode=String(state.mode||'FULL').toLowerCase();
  document.body.className=mode;
  $('panel').style.opacity=String(state.opacity ?? 0.92);
  const data=state.data||{};
  $('title').textContent = data.currentVersion ? `v${data.currentVersion} · ${data.hostState||'STANDALONE'}` : 'Horizon Overlay Test';
  $('meta').textContent = [
    data.host || 'Standalone',
    data.updaterState || 'IDLE',
    data.version ? `Extension ${data.version}` : ''
  ].filter(Boolean).join(' · ');
  $('message').textContent = data.message || 'Overlay is running independently of Atlas.';
}

window.addEventListener('DOMContentLoaded',()=>{
  if(window.horizonOverlay?.onState) window.horizonOverlay.onState(render);
});
