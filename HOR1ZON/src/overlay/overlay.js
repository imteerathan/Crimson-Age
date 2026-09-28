function $(id){return document.getElementById(id)}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function getWorkArea(state){
  return state?.targetDisplay?.workArea || state?.targetDisplay?.bounds || {
    x:0,y:0,width:window.screen?.availWidth||window.innerWidth,height:window.screen?.availHeight||window.innerHeight
  };
}

function render(state){
  state=state||{};
  window.__overlayState=state;
  const mode=String(state.mode||'FULL').toLowerCase();
  document.body.className=[mode,state.editMode?'edit-mode':'',state.runtimeSuppressed?'runtime-hidden':''].filter(Boolean).join(' ');
  const opacity=Number.isFinite(Number(state.opacity))?Number(state.opacity):0.82;
  $('panel').style.opacity=String(opacity);
  $('panel').style.setProperty('--overlay-opacity',String(opacity));

  const data=state.data||{};
  const notification=data.notification;
  const hasNotification=Boolean(notification?.message);
  document.body.classList.toggle('notification',hasNotification);

  $('title').textContent=hasNotification?notification.message:(data.currentVersion?'v'+data.currentVersion+' · '+(data.hostState||'STANDALONE'):'Horizon Overlay');
  $('meta').textContent=hasNotification?'Notification':[
    data.host||'Standalone',
    data.updaterState||'IDLE',
    data.runtimeState||'GAMEPLAY'
  ].filter(Boolean).join(' · ');
  $('message').textContent=hasNotification?'':(data.message||'');
  $('hint').textContent=state.editMode?'Drag to move · Finish Position Editing in Dashboard':'Ctrl + Shift + H · Toggle overlay';
}

let drag=null;
let saveTimer=null;

function positionFromDrag(event){
  const state=window.__overlayState||{};
  const area=getWorkArea(state);
  const start=drag?.startPosition||state.position||{x:1,y:0.03};
  const availableX=Math.max(1,area.width-window.outerWidth-16);
  const availableY=Math.max(1,area.height-window.outerHeight-16);
  return {
    x:clamp(Number(start.x)+((event.screenX-drag.startX)/availableX),0,1),
    y:clamp(Number(start.y)+((event.screenY-drag.startY)/availableY),0,1)
  };
}

function requestSavePosition(position){
  if(!window.__overlayState?.editMode) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    saveTimer=null;
    window.horizonOverlay?.savePosition?.(position);
  },50);
}

function enableDrag(){
  const panel=$('panel');
  panel.addEventListener('pointerdown',event=>{
    const state=window.__overlayState||{};
    if(!state.editMode||event.button!==0) return;
    drag={startX:event.screenX,startY:event.screenY,startPosition:{...(state.position||{x:1,y:0.03})},pointerId:event.pointerId};
    panel.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  const move=event=>{
    if(!drag) return;
    requestSavePosition(positionFromDrag(event));
    event.preventDefault();
  };
  const finish=event=>{
    if(!drag) return;
    const position=positionFromDrag(event||{screenX:drag.startX,screenY:drag.startY});
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer=null;
    window.horizonOverlay?.savePosition?.(position);
    const pointerId=drag.pointerId;
    drag=null;
    if(pointerId!=null) panel.releasePointerCapture?.(pointerId);
    event?.preventDefault?.();
  };
  window.addEventListener('pointermove',move,true);
  window.addEventListener('pointerup',finish,true);
  window.addEventListener('pointercancel',finish,true);
}

window.addEventListener('DOMContentLoaded',()=>{
  enableDrag();
  if(window.horizonOverlay?.onState) window.horizonOverlay.onState(render);
});
