#!/usr/bin/env node
'use strict';

const fs=require('fs');
const vm=require('vm');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');

function fail(msg,detail){
  console.error(`FAIL: ${msg}${detail!==undefined?` — ${JSON.stringify(detail)}`:''}`);
  process.exitCode=1;
}
function pass(msg,detail){console.log(`PASS: ${msg}${detail!==undefined?` — ${JSON.stringify(detail)}`:''}`);}
function assert(name,cond,detail){cond?pass(name,detail):fail(name,detail);}

// 1. Syntax contract: every runtime JS file must parse independently.
const jsFiles=[];
(function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p); else if(e.isFile()&&p.endsWith('.js')) jsFiles.push(p);
  }
})(path.join(root,'js'));
for(const f of jsFiles){
  const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  if(r.status!==0){fail(`syntax ${path.relative(root,f)}`,r.stderr.trim());process.exit(1);}
}
pass('JavaScript syntaxcheck',{files:jsFiles.length});

// 2. Load the simulation/rendering core as classic scripts, matching browser globals.
const store=new Map();
const base={
  console,Math,Date,JSON,
  performance:{now:()=>0},setTimeout:()=>0,clearTimeout:()=>{},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},
  localStorage:{
    getItem:k=>store.has(String(k))?store.get(String(k)):null,
    setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()
  },
  audio:new Proxy({}, {get:()=>()=>{}}),
  Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},
  showBriefing(){}, particles:{draw(){}},
  navigator:{deviceMemory:8},window:{devicePixelRatio:1},document:{},innerWidth:1280,innerHeight:800
};
base.globalThis=base;
const context=vm.createContext(base);
const load=[
  'js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js',
  'js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/core/command-bus.js','js/persistence/save-system.js',
  'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js',
  'js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js',
  'js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js',
  'js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js',
  'js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js'
];
for(const f of load) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});

const result=vm.runInContext(`(()=>{
  const r={};
  const g=new Game();
  r.initial={area:g.state.campaign.patrolArea,station:g.state.tactical.activeStation,tubes:g.state.weapons.tubes.length};

  // New-patrol map centering: state -> simulation -> renderer.
  const fakeCtx=new Proxy({},{get:(o,k)=>{if(!(k in o))o[k]=()=>{};return o[k]},set:(o,k,v)=>(o[k]=v,true)});
  const fakeCanvas={width:800,height:600,clientWidth:800,clientHeight:600,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})};
  const cv=new CanvasView(fakeCanvas);
  cv.follow=false;cv.mapCenter={xNm:777,yNm:-444};
  const seq0=g.state.map.recenterSeq||0;
  g.dispatch({type:'NEW_PATROL',areaKey:'Truk Approaches'});g.update(0);
  r.patrolStart={area:g.state.campaign.patrolArea,pos:{...g.state.playerSub.position},contacts:g.state.world.contacts.length,
    recenterSeq:g.state.map.recenterSeq,seqAdvanced:g.state.map.recenterSeq===seq0+1};

  let harborDrawCalls=0;
  for(const name of ['drawMapBathy','drawAreaBounds','drawMapTerrain','drawMapPorts','drawFriendlyApproach','drawMapTrail','drawMapPlot',
    'drawTorpedoEnvelope','drawMapDCs','drawMapTorps','drawMapExplosions','drawMapContacts','drawUltra','drawMapAircraft','drawMapOwnship','drawMapLegend']) cv[name]=()=>{};
  cv.drawMapHarbor=()=>{harborDrawCalls++;};cv.rr=()=>{};
  g.state.tactical.activeStation='MAP';g.state.world.convoyRoutes=[];g.state.world.terrain=[];g.state.world.depthCharges=[];
  g.state.world.aircraft=[];g.state.world.contactTracks={};g.state.weapons.activeTorpedoes=[];g.state.weapons.explosions=[];
  cv.drawMap(fakeCtx,800,600,g.state);
  r.mapCenter={follow:cv.follow,x:cv.mapCenter.xNm,y:cv.mapCenter.yNm,
    matches:cv.mapCenter.xNm===g.state.playerSub.position.xNm&&cv.mapCenter.yNm===g.state.playerSub.position.yNm};
  r.trukDisclosure={radioInbox:g.state.world.radio.inbox.length,harborPresent:!!g.state.world.harbor,harborDrawCalls};

  // UI station routing: verify CanvasView.render selects the corresponding renderer.
  const calls={TACTICAL:0,MAP:0,PERISCOPE:0,DECK_GUN:0};
  const cvRoute=new CanvasView(fakeCanvas);
  cvRoute.drawTactical=()=>calls.TACTICAL++;cvRoute.drawMap=()=>calls.MAP++;cvRoute.drawPeriscope=()=>calls.PERISCOPE++;cvRoute.drawDeckGun=()=>calls.DECK_GUN++;
  cvRoute.drawHitFlash=()=>{};cvRoute.drawAirAlarm=()=>{};
  g.state.world.shakeMag=0;
  for(const sta of ['TACTICAL','MAP','PERISCOPE']){g.state.tactical.activeStation=sta;cvRoute.render(g.state);}
  r.renderRoutes=calls;

  // Periscope command path.
  g.dispatch({type:'SET_ACTIVE_STATION',station:'PERISCOPE'});g.update(0);r.periscope={station:g.state.tactical.activeStation,bearing:g.state.tactical.periscopeBearing};

  // Time compression command path.
  g.dispatch({type:'SET_TIME_SCALE',scale:8});g.update(0);r.timeScale=g.state.time.timeScale;

  // Manual save/load roundtrip.
  g.state.playerSub.heading=137;
  const saved=SaveSystem.save(4,g.state);g.state.playerSub.heading=12;
  const loaded=SaveSystem.load(4);r.saveLoad={saved,heading:loaded?.playerSub?.heading,area:loaded?.campaign?.patrolArea};

  // Torpedo command path: flood then fire a ready forward tube on a valid solution.
  g.state.tdc.targetId=g.state.world.contacts.find(c=>!c.harborTarget)?.id||g.state.world.contacts[0]?.id;
  g.state.tdc.gyroAngle=0;g.state.tdc.rangeNm=1;g.state.tdc.targetCourse=90;g.state.tdc.targetSpeedKnots=0;g.state.tdc.solutionQuality=1;g.state.tdc.status='SOLUTION';
  g.engine.floodTube(1,false);const torpsBefore=g.state.weapons.activeTorpedoes.length;g.engine.fireTorpedo(1);
  r.torpedo={tubeStatus:g.state.weapons.tubes[0].status,activeBefore:torpsBefore,activeAfter:g.state.weapons.activeTorpedoes.length};

  // Deck-gun command path including the arcade crew automation and an actual shell creation.
  g.state.time.timeScale=1;g.state.playerSub.depthFeet=0;g.state.world.aaManned=false;g.state.world.environment.seaState=.2;
  g.state.weapons.deckGun.ammo=120;g.state.weapons.deckGun.lastFireAt=-999;
  g.dispatch({type:'SET_ACTIVE_STATION',station:'DECK_GUN'});g.update(0);
  const ammo0=g.state.weapons.deckGun.ammo;g.dispatch({type:'FIRE_DECK_GUN'});g.update(0);
  r.deckGun={station:g.state.tactical.activeStation,manned:g.state.weapons.deckGun.manned,ammoBefore:ammo0,
    ammoAfter:g.state.weapons.deckGun.ammo,shells:g.state.weapons.deckGun.shells.length};
  calls.DECK_GUN=0;cvRoute.render(g.state);r.renderRoutes.DECK_GUN=calls.DECK_GUN;

  // Baseline limitations: observations only. Phase 0 must not repair them.
  const d=g.state.playerSub.damage;
  Object.assign(d,{flooding:.5,ballastDamage:.5,motorDamage:.5,rudderDamage:.5,periscopeDamage:.5,damageControlActive:false,crewFatigue:0});
  g.engine.updateDmgCtrl(g.state.playerSub,10);
  r.damageControl={active:d.damageControlActive,values:{flooding:d.flooding,ballastDamage:d.ballastDamage,motorDamage:d.motorDamage,rudderDamage:d.rudderDamage,periscopeDamage:d.periscopeDamage}};
  r.careerKeys=Object.keys(SaveSystem.getCareer()).sort();
  return r;
})()`,context);

assert('patrol start',result.patrolStart.area==='Truk Approaches'&&result.patrolStart.contacts>0,result.patrolStart);
assert('new patrol raises map recenter state signal',result.patrolStart.seqAdvanced,result.patrolStart.recenterSeq);
assert('MAP consumes recenter signal and centers on ownship',result.mapCenter.matches&&result.mapCenter.follow,result.mapCenter);
assert('MAP renderer route',result.renderRoutes.MAP===1,result.renderRoutes);
assert('periscope command + renderer route',result.periscope.station==='PERISCOPE'&&result.renderRoutes.PERISCOPE===1,result.periscope);
assert('time compression',result.timeScale===8,result.timeScale);
assert('save/load roundtrip',result.saveLoad.saved&&result.saveLoad.heading===137&&result.saveLoad.area==='Truk Approaches',result.saveLoad);
assert('torpedo flood/fire',result.torpedo.tubeStatus==='EMPTY'&&result.torpedo.activeAfter===result.torpedo.activeBefore+1,result.torpedo);
assert('deck gun auto-man + fire + renderer',result.deckGun.station==='DECK_GUN'&&result.deckGun.manned&&result.deckGun.ammoAfter===result.deckGun.ammoBefore-1&&result.deckGun.shells===1&&result.renderRoutes.DECK_GUN===1,result.deckGun);
assert('baseline: Truk harbor visible to MAP before radio intel',result.trukDisclosure.radioInbox===0&&result.trukDisclosure.harborPresent&&result.trukDisclosure.harborDrawCalls===1,result.trukDisclosure);
assert('legacy damage fields remain repairable under Phase 3 priority model',result.damageControl.active===true&&Object.values(result.damageControl.values).every(v=>v<.5),result.damageControl);
assert('Phase 4 career schema is available without breaking baseline flows',JSON.stringify(result.careerKeys)===JSON.stringify(['commendations','legacyPatrols','patrolHistory','totalScore','totalShips','totalTonnage','version']),result.careerKeys);

if(process.exitCode) process.exit(process.exitCode);
console.log('PHASE 0 CONTRACT: PASS');
