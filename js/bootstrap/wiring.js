// ═══════════════════════════════════════════════════ BOOTSTRAP
const game=new Game();
const canvasView=new CanvasView(document.getElementById('mainCanvas'));
const domView=new DomView();
const gyroIndicator=new GyroIndicator(document.getElementById('gyroIndicator'));
const bridgeCtrl=new BridgeController(game,canvasView);
const sceneSelector=new ScenarioSelector(game);
const aarController=new AfterActionReport(game);
globalThis.aarController=aarController;
const touchCtrl=new TouchCtrl(game,canvasView);
const tutorial=new Tutorial(game,canvasView,touchCtrl);
globalThis.processPresentationEffects=()=>{
  const live=game.getSnapshot();if(live.playerSub?.mode!=='SUNK')audio.updateAircraftFlyby?.(live);globalThis.audioDirector?.update?.(live);
  const desired=game.state.runtime?.audioState||{};
  for(const e of Object.values(desired)) audio[e.method]?.(...e.args);
  for(const e of PresentationBridge.take(game.state)){
    if(e.type==='impact-observed'){
      const snap=e.payload.snapshot,p=game.state.runtime.presentation||(game.state.runtime.presentation={}),q=p.impactQueue||(p.impactQueue=[]);
      if(e.payload.queued){if(q.length<5)q.push(snap);continue;}
      const startImpact=s=>{const token=s.token;p.impactStartedWall=performance.now();p.impactToken=token;p.impactQueue=q;game.state.tactical.impactObservation=s;
        setTimeout(()=>{if(game.state.tactical?.impactObservation?.token===token){const method=String(s.weapon||'').toUpperCase()==='TORPEDO'?'playTorpedoHit':'playHit';game.dispatch({type:'PLAY_AUDIO',method});}},Math.max(0,s.preImpactMs||0));
        p.impactTimer=setTimeout(()=>{if(p.impactToken!==token)return;const next=q.shift();if(next){startImpact(next);}else{p.impactStartedWall=null;p.impactToken=null;p.impactTimer=null;game.state.tactical.impactObservation=null;game.dispatch({type:'END_IMPACT_OBSERVATION',token});}},Math.max(0,s.durationMs||2350));};
      if(!p.impactToken)game.dispatch({type:'PAUSE_FOR_MODAL'});
      startImpact(snap);
      continue;
    }
    if(e.type==='audio-delay'){setTimeout(()=>game.dispatch({type:'PLAY_AUDIO',method:e.payload.method,args:e.payload.args}),Math.max(0,e.payload.delayMs||0));continue;}
    if(e.type==='command-delay'){setTimeout(()=>game.dispatch(e.payload.command),Math.max(0,e.payload.delayMs||0));continue;}
    if(e.type==='audio'){audio[e.payload.method]?.(...e.payload.args);continue;}
    if(e.type==='toast'){Toast[e.payload.method]?.(...e.payload.args);continue;}
    if(e.type==='save'){SaveSystem[e.payload.method]?.(...e.payload.args);continue;}
    if(e.type==='aar')aarController[e.payload.method]?.(...e.payload.args);
    if(e.type==='ui'&&e.payload.method==='dayNight'){const [daylight,timeStr]=e.payload.args,fill=document.getElementById('dayNightFill'),label=document.getElementById('dayNightLabel');if(fill&&label){fill.style.width=`${daylight*100}%`;fill.style.background=daylight>.7?'#f0c35a':daylight>.3?'#f0a84a':'#4a6a8a';label.textContent=`${daylight>.6?'☀':daylight>.25?'🌅':'🌙'} ${timeStr}`;}}
    if(e.type==='ui'&&e.payload.method==='resumeHide')document.getElementById('resumeBar')?.classList.remove('on');
  }
};
globalThis.skipImpactObservation=()=>{const p=game.state.runtime?.presentation;if(!p?.impactToken||performance.now()-Number(p.impactStartedWall||0)<900)return false;clearTimeout(p.impactTimer);p.impactTimer=null;const next=p.impactQueue?.shift();if(next){p.impactStartedWall=performance.now();p.impactToken=next.token;game.state.tactical.impactObservation=next;processPresentationEffects();}else{p.impactToken=null;game.state.tactical.impactObservation=null;game.dispatch({type:'END_IMPACT_OBSERVATION',token:0});}return true;};
document.addEventListener('pointerdown',()=>globalThis.skipImpactObservation?.(),{capture:true});
showBriefing(game.getSnapshot().campaign.patrolArea,game.getSnapshot());

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
    if(SaveSystem.quickSave(game.getSnapshot())){
      audio.event?.('SAVE_CONFIRMED'); Toast.ok('Quick save updated — manual slots unchanged'); buzz(15);
    }
  });
});
['loadGameButton','mLoadGame'].forEach(id=>document.getElementById(id)?.addEventListener('click',async()=>{
  const state=SaveSystem.quickLoad();
  if(!state){Toast.warn(`No quick save available${SaveSystem.lastLoadError?`: ${SaveSystem.lastLoadError}`:''}.`);return;}
  if(!await DecisionDialog.confirm({title:'LOAD QUICK SAVE',message:'Unsaved progress in the current patrol will be replaced.',confirmLabel:'LOAD',danger:true}))return;
  SaveSystem.releaseImportedResume?.();SaveSystem.autoClear?.();Object.assign(game.state,state);
  document.getElementById('scenarioOverlay')?.classList.remove('open');showBriefing(state.campaign.patrolArea,state);audio.event?.('RESUME_CONFIRMED');Toast.ok('Quick save loaded');
}));

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
  const cur=LayoutService.get().shell;
  layoutToggle.textContent=cur==='touch'
    ? '⇄ Now: TOUCH layout — switch to desktop'
    : '⇄ Now: DESKTOP layout — switch to touch';
};
refreshLayoutLabel();
layoutToggle?.addEventListener('click',()=>{
  const cur=LayoutService.get().shell;
  localStorage.setItem(PP_BUILD.storageKey('ss_ui'),cur==='touch'?'desk':'touch');
  hotkeyOverlay?.classList.remove('open');
  touchCtrl.applyLayout(true);
  refreshLayoutLabel();
  Toast.ok(cur==='touch'?'Desktop layout':'Touch layout — tabs at the bottom');
});

/* Keyboard ownership is shared by the global shell and BridgeController.
   Both consult the same top-layer guard so an arrow pressed in the AAR cannot
   also train the periscope behind it. Escape closes exactly one visible layer,
   highest first; it never tears down two stacked overlays in one keypress. */
function ppKeyboardBlocked(){
  const open=id=>document.getElementById(id)?.classList.contains('open');
  const briefing=document.getElementById('briefingOverlay');
  return !!globalThis.Picker?.open||open('aarOverlay')||open('hotkeyOverlay')||
    open('scenarioOverlay')||!!(briefing&&getComputedStyle(briefing).display!=='none')||
    open('tSheet')||document.getElementById('orderPad')?.classList.contains('on');
}
globalThis.ppKeyboardBlocked=ppKeyboardBlocked;
function closeTopUiLayer(){
  if(globalThis.Picker?.open){Picker.close();return true;}
  if(document.getElementById('aarOverlay')?.classList.contains('open')){aarController.close(false);return true;}
  const briefing=document.getElementById('briefingOverlay');
  if(briefing&&getComputedStyle(briefing).display!=='none'){document.getElementById('briefingDismiss')?.click();return true;}
  if(hotkeyOverlay?.classList.contains('open')){hotkeyOverlay.classList.remove('open');return true;}
  if(document.getElementById('scenarioOverlay')?.classList.contains('open')){sceneSelector.close();return true;}
  if(document.getElementById('orderPad')?.classList.contains('on')){touchCtrl.closePad?.();return true;}
  if(document.getElementById('tSheet')?.classList.contains('open')){touchCtrl.setPane('view');return true;}
  return false;
}

// global keyboard shortcuts
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k===' '&&game.state.runtime?.presentation?.impactToken){e.preventDefault();globalThis.skipImpactObservation?.();return;}
  if(k==='escape'){
    if(closeTopUiLayer())e.preventDefault();
    return;
  }
  if(e.target&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if(ppKeyboardBlocked())return;
  if(k==='m'){sceneSelector.open();return;}
  if(k==='l'){tutorial.active?tutorial.next():tutorial.start();return;}
  if(k==='t'){const on=audio.toggle();Toast.ok(on?'Audio ON':'Audio OFF');return;}
  if(k==='?'||k==='/'){hotkeyOverlay?.classList.toggle('open');refreshDiag();return;}
  if(k==='tab'){e.preventDefault();game.dispatch({type:'CYCLE_TIME_SCALE'});return;}
  if(k==='f'){game.dispatch({type:'FLOOD_ALL_TUBES'});Toast.ok('Fwd tubes flooded');}
  if(k==='g'){game.dispatch({type:'FIRE_TORPEDO',tubeId:1});}
  if(k==='v'){game.dispatch({type:'FIRE_READY_SPREAD'});}
  if(k==='c'){game.dispatch({type:'PERISCOPE_SELECT_CENTER_CONTACT'});}
  if(k==='x'){game.dispatch({type:'TDC_SEND_SCOPE_OBSERVATION'});}
  if(k==='+'||k==='='){canvasView.zoomAt(1.2,innerWidth/2,innerHeight/2);}
  if(k==='-'){canvasView.zoomAt(1/1.2,innerWidth/2,innerHeight/2);}
});

// Audio needs a user gesture. The title identity belongs to a true app opening:
// play it once after unlock, then let MISSION_START fade it instead of replaying
// it every time the player starts another patrol in the same app session.
(()=>{
  const events=['pointerdown','touchstart','mousedown','keydown','click'];
  const unlock=e=>{
    Promise.resolve(audio.resumeFromGesture?.(e.type)).then(running=>{
      if(running){events.forEach(type=>document.removeEventListener(type,unlock,true));audio.playTitleCue?.('START');}
    });
  };
  events.forEach(type=>document.addEventListener(type,unlock,{capture:true,passive:true}));
})();

// Audio settings are profile-independent device preferences: a phone and a
// tablet may need very different output levels. Keep them outside patrol saves.
(()=>{const KEY=PP_BUILD.storageKey('periscope_audio_v1'),sfx=document.getElementById('audioSfxVolume'),mus=document.getElementById('audioMusicVolume'),sv=document.getElementById('audioSfxValue'),mv=document.getElementById('audioMusicValue');
  let q={sfx:62,music:42};try{q={...q,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(_){}
  const apply=()=>{q.sfx=clamp(Number(sfx?.value??q.sfx),0,100);q.music=clamp(Number(mus?.value??q.music),0,100);audio.setSfxVolume(q.sfx/100);audio.setMusicVolume(q.music/100);if(sv)sv.textContent=`${Math.round(q.sfx)}%`;if(mv)mv.textContent=`${Math.round(q.music)}%`;try{localStorage.setItem(KEY,JSON.stringify(q));}catch(_){}};
  if(sfx)sfx.value=q.sfx;if(mus)mus.value=q.music;apply();sfx?.addEventListener('input',apply,{passive:true});mus?.addEventListener('input',apply,{passive:true});})();

// Safety net: if the page ended up in the desktop layout on a device that is
// actually being touched, switch over. Without this a stored 'desk' preference
// (or a mis-detected tablet) hides the tab bar and there is no way back on a
// device with no keyboard.
window.addEventListener('pointerdown',e=>{
  if(e.pointerType&&e.pointerType!=='touch') return;
  if(LayoutService.get().shell!=='desk') return;
  if(localStorage.getItem(PP_BUILD.storageKey('ss_ui'))==='desk') return;      // explicit user choice — respect it
  /* Hybrid Windows laptops can legitimately receive a touch pointer while a
     fine mouse/trackpad remains the primary control. Do not tear down their
     desktop cockpit merely because the screen was touched once. */
  if(window.matchMedia?.('(pointer:fine)').matches&&window.innerWidth>=900) return;
  localStorage.setItem(PP_BUILD.storageKey('ss_ui'),'touch');
  touchCtrl.applyLayout(true);
  Toast.ok('Touch detected — switched to the touch layout');
},{capture:true});

// live layout diagnostics — shown in the help overlay
function refreshDiag(){
  const el=document.getElementById('diagLine');
  if(!el) return;
  const d=touchCtrl.checkLayout();
  const vv=window.visualViewport;
  el.innerHTML=`layout <b>${LayoutService.get().shell}</b> · `+
    `window ${window.innerWidth}×${window.innerHeight}`+
    (vv?` · visible ${Math.round(vv.width)}×${Math.round(vv.height)}`:'')+
    ` · dpr ${(window.devicePixelRatio||1).toFixed(2)}`+
    ` · canvas ${canvasView.w}×${canvasView.h}@${canvasView.dpr}`+
    ` · build ${PP_BUILD.isDev?'AD DEV':'PROD'}`+
    (d?` · tabbar bottom ${d.tabsBottom}/${d.viewport}${d.overflow>2?' ⚠ OFF SCREEN':''}`+
       (d.blockedBy?` · ⚠ covered by ${d.blockedBy}`:' · tabs clear'):'')+
    ` · pref ${localStorage.getItem(PP_BUILD.storageKey('ss_ui'))||'auto'}`+
    ` · audio ${audio.audioStats?.().context||'none'} · resume ${audio.audioStats?.().gestureResumeAttempts||0}×`+
    ` (${audio.audioStats?.().lastGestureEvent||'none'})`;
}
document.getElementById('mHelpBtn')?.addEventListener('click',()=>setTimeout(refreshDiag,60));
document.getElementById('tutHelpBtn')?.addEventListener('click',()=>setTimeout(refreshDiag,60));

// desktop header buttons (always reachable, even when the touch shell is hidden)
document.getElementById('deskLayoutBtn')?.addEventListener('click',()=>{
  localStorage.setItem(PP_BUILD.storageKey('ss_ui'),'touch');
  touchCtrl.applyLayout(true);
  Toast.ok('Touch layout — tabs are at the bottom of the screen');
});
document.getElementById('deskTutBtn')?.addEventListener('click',()=>tutorial.start());

// Desktop command families. The old desktop shell stacked every skipper control
// into one very tall sidebar. On a laptop that made essential controls depend on
// scroll position and visually competed with the tactical picture. Keep the same
// DOM controls and command handlers, but expose one command family at a time.
// Station changes select the most relevant family; the player's manual choice is
// remembered per PROD/DEV build without changing simulation state.
const DESK_CMD_KEY=PP_BUILD.storageKey('ss_deskcmd');
function setDeskCommandPane(name,persist=true){
  const panes=[...document.querySelectorAll('.desk-cmd-pane')];
  if(!panes.some(p=>p.dataset.deskCmd===name)) name='helm';
  panes.forEach(p=>p.classList.toggle('active',p.dataset.deskCmd===name));
  document.querySelectorAll('#deskCommandTabs [data-cmd]').forEach(b=>b.classList.toggle('active',b.dataset.cmd===name));
  if(persist){try{localStorage.setItem(DESK_CMD_KEY,name);}catch(_){}}
}
document.querySelectorAll('#deskCommandTabs [data-cmd]').forEach(b=>b.addEventListener('click',()=>setDeskCommandPane(b.dataset.cmd)));
let initialDeskCmd='helm';
try{initialDeskCmd=localStorage.getItem(DESK_CMD_KEY)||'helm';}catch(_){}
setDeskCommandPane(initialDeskCmd,false);
const deskCmdForStation={
  stationTactical:'weapons', stationBridge:'helm', stationSound:'firecontrol',
  stationPeriscope:'firecontrol', stationMap:'helm', stationDeckGun:'weapons'
};
for(const [id,pane] of Object.entries(deskCmdForStation)){
  document.getElementById(id)?.addEventListener('click',()=>{
    if(LayoutService.get().shell==='desk') setDeskCommandPane(pane);
  });
}

// one-off touch hint
if(LayoutService.get().shell==='touch'&&!localStorage.getItem(PP_BUILD.storageKey('ss_hint'))){
  setTimeout(()=>{
    Toast.ok('Tip: drag the compass to steer, drag the depth column to dive');
    localStorage.setItem(PP_BUILD.storageKey('ss_hint'),'1');
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

/* ═══════════════════════════════════════════════════ RENDER DEBUG CAPTURE
   Deliberately console-only: this is a reproducible visual test fixture, not a
   gameplay control. It renders a CLONE of live state, captures mainCanvas, then
   restores the real frame, so taking a screenshot cannot alter a patrol/save.

   Examples:
     PeriscopeDebug.downloadScenario('bridge-air-attack',{rangeNm:1.1});
     PeriscopeDebug.downloadScenario('impact-framing',{type:'CARRIER',rangeNm:.08});
     PeriscopeDebug.downloadScenario('map-labels',{strategy:'HYBRID'});
     PeriscopeDebug.downloadScenario('map-harbor-approach',{netKnown:false});
     PeriscopeDebug.downloadScenario('map-harbor-approach',{netKnown:true});
     PeriscopeDebug.downloadCurrent();

   MAP strategies kept for visual A/B testing: GREEDY, NEAREST, WIDE, OUTWARD,
   LANES and the production default HYBRID.  Keeping these deterministic hooks
   makes future label/layout changes reviewable without spending a patrol trying
   to recreate a crowded convoy by hand. */
(function installPeriscopeDebugCapture(){
  const clone=x=>{try{return typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));}catch(_){return JSON.parse(JSON.stringify(x));}};
  const at=(origin,bearingDeg,rangeNm)=>{const r=degToRad(bearingDeg);return{xNm:origin.xNm+Math.sin(r)*rangeNm,yNm:origin.yNm-Math.cos(r)*rangeNm};};
  const makeScenario=(name,opts={})=>{
    const s=clone(game.getSnapshot()),sub=s.playerSub,now=s.time.elapsedSeconds||0;
    s.time.timeScale=0;s.time.transitUntil=0;s.time.transitOpen=false;s.world.shakeMag=0;s.tactical.impactObservation=null;
    if(name==='bridge-air-attack'){
      const br=normDeg(Number(opts.bearingDeg??sub.heading)),range=clamp(Number(opts.rangeNm)||1.1,.18,8),kind=String(opts.kind||'BOMBER').toUpperCase();
      sub.depthFeet=0;sub.orderedDepthFeet=0;sub.mode='SURFACED';s.tactical.activeStation='BRIDGE';s.tactical.bridgeBearing=br;s.tactical.bridgeZoom=Number(opts.zoom)||0;s.tactical.bridgeBinoculars=!!opts.binoculars;
      Object.assign(s.world.environment,{daylight:Number(opts.daylight??.72),visibilityNm:Number(opts.visibilityNm??14),seaState:Number(opts.seaState??.32),weather:opts.weather||'PARTLY CLOUDY',precipitation:0});
      const pos=at(sub.position,br,range),hdg=bearingBetween(pos,sub.position);
      s.world.aircraft=[{id:'DBG-AIR',side:'ENEMY',name:kind==='FLYING_BOAT'?'Type 97 flying boat':kind==='FLOATPLANE'?'Aichi E13A':'Nakajima B5N',kind,ordnance:kind==='FLYING_BOAT'?'DEPTH_CHARGE':'BOMB',position:pos,heading:hdg,speedKnots:175,state:'ATTACKING',seenBySub:true,spotted:true,bombs:2,bornAt:now-90,runTimer:0}];
      return s;
    }
    if(name==='impact-framing'){
      const br=normDeg(Number(opts.bearingDeg??sub.heading)),range=clamp(Number(opts.rangeNm)||.12,.025,5),type=String(opts.type||'CARRIER').toUpperCase();
      const lengths={CARRIER:820,HEAVY_CRUISER:660,DESTROYER:350,KAIBOKAN:255,MERCHANT:440},lengthFeet=Number(opts.lengthFeet)||lengths[type]||440;
      const pos=at(sub.position,br,range),heading=normDeg(br+90),target=materializeVesselIdentity({id:'DBG-HIT',name:`Debug ${type.replaceAll('_',' ')}`,type,displayType:type.replaceAll('_',' '),side:'ENEMY',position:pos,heading,speedKnots:10,lengthYards:lengthFeet,tonsFactor:type==='CARRIER'?26000:type==='HEAVY_CRUISER'?13000:6000,visualProfile:1,shipDamage:{flotation:.62,propulsion:.45,steering:.18,fire:.28},sunk:false,sinkingProgress:0,hitFrac:.12,hitSide:1},s);
      sub.depthFeet=55;sub.orderedDepthFeet=55;sub.mode='SUBMERGED';s.world.contacts=[target];s.tactical.activeStation='PERISCOPE';s.tactical.periscopeBearing=br;
      s.tactical.impactObservation={token:1,contactId:target.id,name:target.name,type:target.type,displayType:target.displayType,lengthYards:lengthFeet,tonsFactor:target.tonsFactor,heading,speedKnots:target.speedKnots,position:{...pos},shipDamage:{...target.shipDamage},sunk:false,sinkingProgress:0,sinkStyle:0,hitFrac:.12,hitSide:1,stationary:false,beforeShip:{heading,speedKnots:10,shipDamage:{flotation:0,propulsion:0,steering:0,fire:0},sunk:false,sinkingProgress:0,sinkStyle:0,hitFrac:0,hitSide:1},impactPosition:{...pos,zM:2.5},viewerPos:{...sub.position},viewerDepth:55,viewerHeading:sub.heading,originStation:'PERISCOPE',viewBearing:br,originFov:32,targetBearing:br,weapon:'TORPEDO',location:'MIDSHIPS',condition:'CRIPPLED',rangeNm:range,preImpactMs:1500,durationMs:9000,startedWall:performance.now()-2300,torpedoHeading:br,torpedoWakePath:[],torpedoWakeNm:.35,torpedoWakeVisible:true};
      return s;
    }
    if(name==='map-labels'){
      s.tactical.activeStation='MAP';sub.depthFeet=0;sub.mode='SURFACED';Object.assign(s.world.environment,{daylight:.72,visibilityNm:18,seaState:.28,weather:'CLEAR'});
      const specs=[
        ['T01','MERCHANT',18,.40,4,9,'ENEMY'],['T02','DESTROYER',42,.46,211,28,'ENEMY'],['T03','TANKER',68,.52,174,10,'ENEMY'],
        ['T04','KAIBOKAN',96,.43,318,18,'ENEMY'],['T05','CARGO SHIP',126,.58,266,8,'ENEMY'],['T06','HEAVY CRUISER',154,.47,32,24,'ENEMY'],
        ['T07','MERCHANT',202,.55,118,9,'FRIENDLY'],['T08','PATROL CRAFT',238,.42,63,15,'ENEMY'],['T09','MERCHANT',276,.50,342,7,'NEUTRAL'],
        ['T10','CARRIER',318,.62,155,21,'ENEMY']
      ];
      s.world.contacts=[];s.world.contactTracks={};
      for(const [id,type,bear,rng,course,kn,aff] of specs){
        const pos=at(sub.position,bear,rng),display=type.replaceAll('_',' ');
        s.world.contacts.push(materializeVesselIdentity({id,name:`Debug ${display}`,type:type==='CARGO SHIP'?'MERCHANT':type,displayType:display,side:aff==='ENEMY'?'ENEMY':aff,position:pos,heading:course,speedKnots:kn,lengthYards:type==='DESTROYER'?350:type==='HEAVY CRUISER'?660:type==='CARRIER'?820:430,sunk:false},s));
        s.world.contactTracks[id]={id,bearing:bear,rangeEstimateNm:rng,confidence:.96,positionConfidence:.97,plotPosition:{...pos},lastFixPosition:{...pos},positionFixAt:now,lastUpdated:now,visualHullConfirmed:true,hullConfirmedAt:now,positionSource:'VISUAL',source:'VISUAL',typeEstimate:display,contactType:type,courseEstimate:course,speedEstimateKnots:kn,affiliation:aff};
      }
      s.tactical.selectedTrackId='T02';return s;
    }
    if(name==='map-harbor-approach'){
      s.tactical.activeStation='MAP';sub.depthFeet=55;sub.orderedDepthFeet=55;sub.mode='SUBMERGED';Object.assign(s.world.environment,{daylight:.48,visibilityNm:11,seaState:.38,weather:'OVERCAST'});
      const channelBearing=68,center=at(sub.position,normDeg(channelBearing+180),5.25);
      s.world.harbor={name:'Truk Anchorage',center,outerRadiusNm:5.6,innerRadiusNm:1.25,channelBearing,channelHalfWidthNm:.42,channelSafeHalfWidthNm:.34,channelDepthFeet:120,innerBasinDepthFeet:110,mineInnerNm:2.15,mineOuterNm:4.75,netRangeNm:1.82,netHalfSpanNm:1.18,netGapHalfNm:.28,netMaxDepthFt:320,hydrophoneRangeNm:4.6,batteryRangeNm:5.1,suspicion:0,alert:0,entered:true,inside:false,mines:[]};
      s.world.harborIntel={harborName:'Truk Anchorage',minefield:{level:opts.reported?'REPORTED':'OBSERVED',reportCenterDx:.18,reportCenterDy:-.12,reportedInnerNm:1.86,reportedOuterNm:5.62,observedInnerNm:2.10,observedOuterNm:4.78},channel:{level:opts.reported?'REPORTED':'OBSERVED',reportedBearing:74,reportedHalfWidthNm:1.12,observedBearing:69,observedHalfWidthNm:.60},net:{known:!!opts.netKnown,source:opts.netKnown?'VISUAL':null},batteries:[],heavyUnit:{reported:true,identified:false,identity:null},raid:{attempted:false,result:'not_attempted',gateCrossed:false,reconComplete:false}};
      s.world.ports=[...(s.world.ports||[]).filter(p=>!/Truk/i.test(p.name||'')),{name:'Truk Anchorage',side:'ENEMY',pos:{...center}}];
      s.world.contacts=[];s.world.contactTracks={};s.map.plottedCourse=[];s.map.autoFollowPlot=false;return s;
    }
    throw new Error(`Unknown PeriscopeDebug scenario: ${name}`);
  };
  const capture=(state,{strategy=null,zoom=null,center=null}={})=>{
    const old={strategy:canvasView.mapLabelStrategy,zoom:canvasView.zoom,center:{...canvasView.mapCenter},follow:canvasView.follow};
    try{
      if(strategy)canvasView.mapLabelStrategy=String(strategy).toUpperCase();
      if(Number.isFinite(zoom))canvasView.zoom=zoom;
      if(center)canvasView.mapCenter={...center};
      canvasView.render(state,LayoutService.get());
      return canvasView.canvas.toDataURL('image/png');
    }finally{
      canvasView.mapLabelStrategy=old.strategy;canvasView.zoom=old.zoom;canvasView.mapCenter=old.center;canvasView.follow=old.follow;
      canvasView.render(game.getSnapshot(),LayoutService.get());
    }
  };
  const saveDataUrl=(url,name)=>{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();return name;};
  globalThis.PeriscopeDebug={
    labelStrategies:['GREEDY','NEAREST','WIDE','OUTWARD','LANES','HYBRID'],
    captureCurrentDataUrl(){canvasView.render(game.getSnapshot(),LayoutService.get());return canvasView.canvas.toDataURL('image/png');},
    downloadCurrent(filename='periscope-current.png'){return saveDataUrl(this.captureCurrentDataUrl(),filename);},
    captureScenarioDataUrl(name,opts={}){const s=makeScenario(name,opts),map=name==='map-labels'||name==='map-harbor-approach',harbor=name==='map-harbor-approach',center=harbor?{xNm:(s.playerSub.position.xNm+s.world.harbor.center.xNm)/2,yNm:(s.playerSub.position.yNm+s.world.harbor.center.yNm)/2}:{...s.playerSub.position};return capture(s,{strategy:opts.strategy||null,zoom:map?(Number(opts.zoom)||(harbor?54:72)):null,center:map?center:null});},
    downloadScenario(name,opts={}){const strategy=String(opts.strategy||'').toLowerCase(),suffix=strategy?`-${strategy}`:'';return saveDataUrl(this.captureScenarioDataUrl(name,opts),opts.filename||`periscope-${name}${suffix}.png`);},
    build(){const scope=document.getElementById('deskScopeControls'),s=game.getSnapshot();return{channel:PP_BUILD.channel,isDev:PP_BUILD.isDev,path:location.pathname,storagePrefix:PP_BUILD.storagePrefix,touchUiContract:PP_BUILD.touchUiContract?.()||'unavailable',patrolRuntimeContext:s.world?.patrolContext||null,patrolRuntimeContextMatches:typeof patrolRuntimeContextMatches==='function'?patrolRuntimeContextMatches(s):null,desktopScopeControls:scope?{hidden:scope.hidden,ariaHidden:scope.getAttribute('aria-hidden'),display:getComputedStyle(scope).display}:null,serviceWorker:navigator.serviceWorker?.controller?.scriptURL||null};},
    qualityBudget(samples=6){
      const s=game.getSnapshot(),counts={contacts:(s.world.contacts||[]).length,tracks:Object.keys(s.world.contactTracks||{}).length,aircraft:(s.world.aircraft||[]).length,torpedoes:(s.weapons.activeTorpedoes||[]).length,depthCharges:(s.world.depthCharges||[]).length,particles:(particles.particles||[]).length,sparks:(particles.sparks||[]).length,log:(s.log||[]).length},limits={objects:180,particles:420,sparks:120,log:100,renderAverageMs:22,audioDecodedBytes:8*1024*1024,heapBytes:180*1024*1024};
      const total=counts.contacts+counts.tracks+counts.aircraft+counts.torpedoes+counts.depthCharges,t0=performance.now(),n=clamp(samples|0,1,20),layout=LayoutService.get();for(let i=0;i<n;i++)canvasView.render(s,layout);const renderAverageMs=(performance.now()-t0)/n,heapBytes=performance.memory?.usedJSHeapSize??null,audioDecodedBytes=audio.hybridDecodedBytes||0;
      const warnings=[];if(total>limits.objects)warnings.push(`objects ${total}/${limits.objects}`);if(counts.particles>limits.particles)warnings.push(`particles ${counts.particles}/${limits.particles}`);if(counts.sparks>limits.sparks)warnings.push(`sparks ${counts.sparks}/${limits.sparks}`);if(counts.log>limits.log)warnings.push(`log ${counts.log}/${limits.log}`);if(renderAverageMs>limits.renderAverageMs)warnings.push(`render ${renderAverageMs.toFixed(1)}ms/${limits.renderAverageMs}ms`);if(audioDecodedBytes>limits.audioDecodedBytes)warnings.push(`audio ${audioDecodedBytes}/${limits.audioDecodedBytes}`);if(heapBytes&&heapBytes>limits.heapBytes)warnings.push(`heap ${heapBytes}/${limits.heapBytes}`);
      return{ok:!warnings.length,counts,total,renderAverageMs,audioDecodedBytes,heapBytes,limits,warnings};
    },
    audio:{
      // Audio review never mutates simulation state. Use it to audition a
      // recipe immediately after a code change instead of playing a patrol.
      list(){return['SONAR','OWN_SONAR','DEPTH_FAR','DEPTH_MEDIUM','DEPTH_NEAR','DEPTH_SPLASH','TUBE_FLOOD','TUBE_READY','TDC','STATION','SCOPE_EXTEND','SCOPE_RETRACT','MINE','AIR_BOMB','BATTLE_STATIONS','TITLE'];},
      play(name,opts={}){return audio.debugPlay(name,opts);},
      sonar(variant=audio.sonarVariant){audio.setSonarVariant(variant);return audio.debugPlay('SONAR',{variant});},
      ownSonar(variant=audio.sonarVariant){audio.setSonarVariant(variant);return audio.debugPlay('OWN_SONAR',{variant});},
      setSonarVariant(variant){return audio.setSonarVariant(variant);},
      event(name,opts={}){return audio.event(name,opts);},
      preview(base='SILENT_RUNNING',threat='NONE',perspective=null,durationMs=8000){return globalThis.audioDirector?.preview(base,threat,perspective,durationMs);},
      stopPreview(){return globalThis.audioDirector?.stopPreview();},
      stats(){return{engine:audio.audioStats(),director:globalThis.audioDirector?.stats?.()};}
    }
  };
})();
