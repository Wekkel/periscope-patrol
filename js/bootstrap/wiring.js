// ═══════════════════════════════════════════════════ BOOTSTRAP
const game=new Game();
const canvasView=new CanvasView(document.getElementById('mainCanvas'));
const domView=new DomView();
const gyroIndicator=new GyroIndicator();
const bridgeCtrl=new BridgeController(game,canvasView);
const sceneSelector=new ScenarioSelector(game);
const aarController=new AfterActionReport(game);
globalThis.aarController=aarController;
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
      const pos=at(sub.position,br,range),heading=normDeg(br+90),target={id:'DBG-HIT',name:`Debug ${type.replaceAll('_',' ')}`,type,displayType:type.replaceAll('_',' '),side:'ENEMY',position:pos,heading,speedKnots:10,lengthYards:lengthFeet,tonsFactor:type==='CARRIER'?26000:type==='HEAVY_CRUISER'?13000:6000,visualProfile:1,shipDamage:{flotation:.62,propulsion:.45,steering:.18,fire:.28},sunk:false,sinkingProgress:0,hitFrac:.12,hitSide:1};
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
        s.world.contacts.push({id,name:`Debug ${display}`,type:type==='CARGO SHIP'?'MERCHANT':type,displayType:display,side:aff==='ENEMY'?'ENEMY':aff,position:pos,heading:course,speedKnots:kn,lengthYards:type==='DESTROYER'?350:type==='HEAVY CRUISER'?660:type==='CARRIER'?820:430,sunk:false});
        s.world.contactTracks[id]={id,bearing:bear,rangeEstimateNm:rng,confidence:.96,positionConfidence:.97,plotPosition:{...pos},lastFixPosition:{...pos},positionFixAt:now,lastUpdated:now,visualHullConfirmed:true,hullConfirmedAt:now,positionSource:'VISUAL',source:'VISUAL',typeEstimate:display,contactType:type,courseEstimate:course,speedEstimateKnots:kn,affiliation:aff};
      }
      s.tactical.selectedTrackId='T02';return s;
    }
    if(name==='map-harbor-approach'){
      s.tactical.activeStation='MAP';sub.depthFeet=55;sub.orderedDepthFeet=55;sub.mode='SUBMERGED';Object.assign(s.world.environment,{daylight:.48,visibilityNm:11,seaState:.38,weather:'OVERCAST'});
      const channelBearing=68,center=at(sub.position,normDeg(channelBearing+180),5.25);
      s.world.harbor={name:'Truk Anchorage',center,outerRadiusNm:5.6,innerRadiusNm:1.25,channelBearing,channelHalfWidthNm:.42,mineInnerNm:2.15,mineOuterNm:4.75,netRangeNm:1.82,netHalfSpanNm:1.18,netGapHalfNm:.28,hydrophoneRangeNm:4.6,batteryRangeNm:5.1,suspicion:0,alert:0,entered:true,inside:false,mines:[]};
      s.world.harborIntel={harborName:'Truk Anchorage',minefield:{level:opts.reported?'REPORTED':'OBSERVED',reportCenterDx:.18,reportCenterDy:-.12,reportedInnerNm:1.86,reportedOuterNm:5.62,observedInnerNm:2.10,observedOuterNm:4.78},channel:{level:opts.reported?'REPORTED':'OBSERVED',reportedBearing:74,reportedHalfWidthNm:1.12,observedBearing:69,observedHalfWidthNm:.60},net:{known:!!opts.netKnown,source:opts.netKnown?'VISUAL':null},batteries:[],heavyUnit:{reported:true,identified:false,identity:null},raid:{attempted:false,result:'not_attempted'}};
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
      canvasView.render(state);
      return canvasView.canvas.toDataURL('image/png');
    }finally{
      canvasView.mapLabelStrategy=old.strategy;canvasView.zoom=old.zoom;canvasView.mapCenter=old.center;canvasView.follow=old.follow;
      canvasView.render(game.getSnapshot());
    }
  };
  const saveDataUrl=(url,name)=>{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();return name;};
  globalThis.PeriscopeDebug={
    labelStrategies:['GREEDY','NEAREST','WIDE','OUTWARD','LANES','HYBRID'],
    captureCurrentDataUrl(){canvasView.render(game.getSnapshot());return canvasView.canvas.toDataURL('image/png');},
    downloadCurrent(filename='periscope-current.png'){return saveDataUrl(this.captureCurrentDataUrl(),filename);},
    captureScenarioDataUrl(name,opts={}){const s=makeScenario(name,opts),map=name==='map-labels'||name==='map-harbor-approach',harbor=name==='map-harbor-approach',center=harbor?{xNm:(s.playerSub.position.xNm+s.world.harbor.center.xNm)/2,yNm:(s.playerSub.position.yNm+s.world.harbor.center.yNm)/2}:{...s.playerSub.position};return capture(s,{strategy:opts.strategy||null,zoom:map?(Number(opts.zoom)||(harbor?54:72)):null,center:map?center:null});},
    downloadScenario(name,opts={}){const strategy=String(opts.strategy||'').toLowerCase(),suffix=strategy?`-${strategy}`:'';return saveDataUrl(this.captureScenarioDataUrl(name,opts),opts.filename||`periscope-${name}${suffix}.png`);}
  };
})();
