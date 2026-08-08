// ═══════════════════════════════════════════════════ BOOTSTRAP
const game=new Game();
const canvasView=new CanvasView(document.getElementById('mainCanvas'));
const domView=new DomView();
const gyroIndicator=new GyroIndicator();
const bridgeCtrl=new BridgeController(game,canvasView);
const sceneSelector=new ScenarioSelector(game);
const touchCtrl=new TouchCtrl(game,canvasView);
const tutorial=new Tutorial(game,canvasView,touchCtrl);
showBriefing('Solomon Sea',game.getSnapshot());

// keep the canvas backing store in sync with its box
if(window.ResizeObserver){
  const ro=new ResizeObserver(()=>canvasView.resize());
  ro.observe(document.getElementById('mainCanvas'));
}else{
  window.addEventListener('resize',()=>canvasView.resize(),{passive:true});
}

// mission select / save buttons (both shells)
['newScenarioButton','mMissionSel'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>sceneSelector.open()));
['saveGameButton','mSaveGame'].forEach(id=>{
  document.getElementById(id)?.addEventListener('click',()=>{
    if(SaveSystem.save(0,game.getSnapshot())){
      audio.playWaypoint(); Toast.ok('Patrol saved to slot 1'); buzz(15);
    }
  });
});

// torpedo run-depth slider (desktop)
const torpDepthInput=document.getElementById('torpDepthInput');
const torpDepthVal=document.getElementById('torpDepthVal');
torpDepthInput?.addEventListener('input',()=>{
  const d=+torpDepthInput.value;
  if(torpDepthVal) torpDepthVal.textContent=d+'ft';
  game.dispatch({type:'SET_TORPEDO_DEPTH',depthFt:d});
});

// help overlay
const hotkeyOverlay=document.getElementById('hotkeyOverlay');
document.getElementById('hotkeyClose')?.addEventListener('click',()=>hotkeyOverlay?.classList.remove('open'));
const layoutToggle=document.getElementById('layoutToggle');
const refreshLayoutLabel=()=>{
  if(!layoutToggle) return;
  const cur=document.documentElement.dataset.lay;
  layoutToggle.textContent=cur==='touch'
    ? '⇄ Now: TOUCH layout — switch to desktop'
    : '⇄ Now: DESKTOP layout — switch to touch';
};
refreshLayoutLabel();
layoutToggle?.addEventListener('click',()=>{
  const cur=document.documentElement.dataset.lay;
  localStorage.setItem('ss_ui',cur==='touch'?'desk':'touch');
  hotkeyOverlay?.classList.remove('open');
  touchCtrl.applyLayout(true);
  refreshLayoutLabel();
  Toast.ok(cur==='touch'?'Desktop layout':'Touch layout — tabs at the bottom');
});

// keyboard shortcuts
window.addEventListener('keydown',e=>{
  if(e.target&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  const k=e.key.toLowerCase();
  if(k==='m'){sceneSelector.open();return;}
  if(k==='l'){tutorial.active?tutorial.next():tutorial.start();return;}
  if(k==='t'){const on=audio.toggle();Toast.ok(on?'Audio ON':'Audio OFF');return;}
  if(k==='?'||k==='/'){hotkeyOverlay?.classList.toggle('open');refreshDiag();return;}
  if(k==='escape'){hotkeyOverlay?.classList.remove('open');sceneSelector.close();return;}
  if(k==='tab'){e.preventDefault();game.dispatch({type:'CYCLE_TIME_SCALE'});return;}
  if(k==='f'){game.dispatch({type:'FLOOD_ALL_TUBES'});Toast.ok('Fwd tubes flooded');}
  if(k==='g'){game.dispatch({type:'FIRE_TORPEDO',tubeId:1});}
  if(k==='v'){game.dispatch({type:'FIRE_READY_SPREAD'});}
  if(k==='c'){game.dispatch({type:'PERISCOPE_SELECT_CENTER_CONTACT'});}
  if(k==='x'){game.dispatch({type:'TDC_SEND_SCOPE_OBSERVATION'});}
  if(k==='+'||k==='='){canvasView.zoomAt(1.2,innerWidth/2,innerHeight/2);}
  if(k==='-'){canvasView.zoomAt(1/1.2,innerWidth/2,innerHeight/2);}
});

// audio needs a user gesture
document.addEventListener('pointerdown',()=>audio.ensure(),{once:true});

// Safety net: if the page ended up in the desktop layout on a device that is
// actually being touched, switch over. Without this a stored 'desk' preference
// (or a mis-detected tablet) hides the tab bar and there is no way back on a
// device with no keyboard.
window.addEventListener('pointerdown',e=>{
  if(e.pointerType&&e.pointerType!=='touch') return;
  if(document.documentElement.dataset.lay!=='desk') return;
  if(localStorage.getItem('ss_ui')==='desk') return;      // explicit user choice — respect it
  localStorage.setItem('ss_ui','touch');
  touchCtrl.applyLayout(true);
  Toast.ok('Touch detected — switched to the touch layout');
},{capture:true});

// live layout diagnostics — shown in the help overlay
function refreshDiag(){
  const el=document.getElementById('diagLine');
  if(!el) return;
  const d=touchCtrl.checkLayout();
  const vv=window.visualViewport;
  el.innerHTML=`layout <b>${document.documentElement.dataset.lay}</b> · `+
    `window ${window.innerWidth}×${window.innerHeight}`+
    (vv?` · visible ${Math.round(vv.width)}×${Math.round(vv.height)}`:'')+
    ` · dpr ${(window.devicePixelRatio||1).toFixed(2)}`+
    ` · canvas ${canvasView.w}×${canvasView.h}@${canvasView.dpr}`+
    (d?` · tabbar bottom ${d.tabsBottom}/${d.viewport}${d.overflow>2?' ⚠ OFF SCREEN':''}`+
       (d.blockedBy?` · ⚠ covered by ${d.blockedBy}`:' · tabs clear'):'')+
    ` · pref ${localStorage.getItem('ss_ui')||'auto'}`;
}
document.getElementById('mHelpBtn')?.addEventListener('click',()=>setTimeout(refreshDiag,60));
document.getElementById('tutHelpBtn')?.addEventListener('click',()=>setTimeout(refreshDiag,60));

// desktop header buttons (always reachable, even when the touch shell is hidden)
document.getElementById('deskLayoutBtn')?.addEventListener('click',()=>{
  localStorage.setItem('ss_ui','touch');
  touchCtrl.applyLayout(true);
  Toast.ok('Touch layout — tabs are at the bottom of the screen');
});
document.getElementById('deskTutBtn')?.addEventListener('click',()=>tutorial.start());

// one-off touch hint
if(document.documentElement.dataset.lay==='touch'&&!localStorage.getItem('ss_hint')){
  setTimeout(()=>{
    Toast.ok('Tip: drag the compass to steer, drag the depth column to dive');
    localStorage.setItem('ss_hint','1');
  },2600);
}


/* ═══════════════════════════════════════════════════ HELM INSTRUMENTS
   Three dials that replace three sliders nobody dragged.

   The grammar is the same on all three: a heavy pale needle for where she
   IS, a thin amber one for where she has been ORDERED, an absolute rim, a
   relative face, detents you can feel, and the context that governs the
   order painted on the dial instead of printed underneath it.

   What each needed of its own:
     DEPTH   rescales between a fine and a deep range, because holding 55 ft
             under a periscope needs ten times the precision of sitting at
             250. The sea floor is a sector she cannot be ordered into.
     COURSE  is a full circle — a compass that stopped at 270° would be a
             lie — so one dial degree is one degree of course and the face
             is geared down to a third for the last degree of a solution.
     POWER   is linear in revolutions because that is what you order, but
             the knots are marked at their true positions and bunch towards
             flank: the last hundred revolutions buy almost no speed and a
             great deal of noise, and the noise is a sector on the rim.
*/
