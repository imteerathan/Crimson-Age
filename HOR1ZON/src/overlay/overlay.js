function $(id){return document.getElementById(id)}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function applyPosition(state){
  const panel=$('panel');
  if(!panel) return;
  const mode=String(state.mode||'FULL').toUpperCase();
  if(mode==='FOCUS'){
    panel.style.left='50%';
    panel.style.top='50%';
    panel.style.right='auto';
    panel.style.transform='translate(-50%,-50%)';
    return;
  }
  const position=state.position||{x:1,y:0.03};
  const maxLeft=Math.max(8,window.innerWidth-panel.offsetWidth-8);
  const maxTop=Math.max(8,window.innerHeight-panel.offsetHeight-8);
  const left=8+clamp(Number(position.x ?? 1),0,1)*Math.max(0,maxLeft-8);
  const top=8+clamp(Number(position.y ?? 0.03),0,1)*Math.max(0,maxTop-8);
  panel.style.left=Math.round(left)+'px';
  panel.style.top=Math.round(top)+'px';
  panel.style.right='auto';
  panel.style.transform='none';
}

function render(state){
  state=state||{};
  window.__overlayState=state;
  const mode=String(state.mode||'FULL').toLowerCase();
  document.body.className=[mode,state.editMode?'edit-mode':'',state.runtimeSuppressed?'runtime-hidden':''].filter(Boolean).join(' ');
  const opacity=Number.isFinite(Number(state.opacity))?Number(state.opacity):0.82;
  $('panel').style.opacity=String(opacity);
  $('panel').style.setProperty('--overlay-opacity',String(opacity));
  applyPosition(state);

  const data=state.data||{};
  const notification=data.notification;
  const hasNotification=Boolean(notification?.message);
  document.body.classList.toggle('notification',hasNotification);

  $('title').textContent=hasNotification?notification.message:(data.currentVersion?\`v\${data.currentVersion} · \${data.hostState||'STANDALONE'}\`:'Horizon Overlay');
  $('meta').textContent=hasNotification?'Notification':[
    data.host||'Standalone',
    data.updaterState||'IDLE',
    data.runtimeState||'GAMEPLAY'
  ].filter(Boolean).join(' · ');
  $('message').textContent=hasNotification?'':(data.message||'');
  $('hint').textContent=state.editMode?'Drag to move · Finish Position Editing in Dashboard':'Ctrl + Shift + H · Toggle overlay';
}

let drag=null;

function enableDrag(){
  const panel=$('panel');
  panel.addEventListener('pointerdown',event=>{
    const state=window.__overlayState||{};
    if(!state.editMode||event.button!==0) return;
    const rect=panel.getBoundingClientRect();
    drag={startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top,pointerId:event.pointerId};
    panel.setPointerCapture?.(event.pointerId);
  });
  panel.addEventListener('pointermove',event=>{
    if(!drag) return;
    const maxLeft=Math.max(8,window.innerWidth-panel.offsetWidth-8);
    const maxTop=Math.max(8,window.innerHeight-panel.offsetHeight-8);
    const left=clamp(drag.left+event.clientX-drag.startX,8,maxLeft);
    const top=clamp(drag.top+event.clientY-drag.startY,8,maxTop);
    panel.style.left=Math.round(left)+'px';
    panel.style.top=Math.round(top)+'px';
    panel.style.right='auto';
    panel.style.transform='none';
  });
  const finish=()=>{
    if(!drag) return;
    const maxLeft=Math.max(8,window.innerWidth-panel.offsetWidth-8);
    const maxTop=Math.max(8,window.innerHeight-panel.offsetHeight-8);
    const rect=panel.getBoundingClientRect();
    const x=maxLeft>8?clamp((rect.left-8)/(maxLeft-8),0,1):0;
    const y=maxTop>8?clamp((rect.top-8)/(maxTop-8),0,1):0;
    const pointerId=drag.pointerId;
    drag=null;
    window.horizonOverlay?.savePosition?.({x,y});
    if(pointerId!=null) panel.releasePointerCapture?.(pointerId);
  };
  panel.addEventListener('pointerup',finish);
  panel.addEventListener('pointercancel',finish);
}

window.addEventListener('DOMContentLoaded',()=>{
  enableDrag();
  if(window.horizonOverlay?.onState) window.horizonOverlay.onState(render);
});
window.addEventListener('resize',()=>applyPosition(window.__overlayState||{}));
