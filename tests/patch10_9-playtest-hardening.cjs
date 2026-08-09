#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
function nop(){};const math=Object.create(Math);math.random=()=>0.31;const store=new Map();
const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()},audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){},durationFor:()=>4000},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:1200,innerHeight:800,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:1200,innerHeight:800,globalThis:null};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const out={};
 // A clearly resolved 6x scope target at 4.3 nm should immediately become a strong visual chart fix.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=55;s.playerSub.propulsion.speedKnots=0;s.tactical.activeStation='PERISCOPE';s.tactical.periscopeZoom=2.5;s.tactical.periscopeBearing=90;s.world.environment.visibilityNm=10;s.world.environment.seaState=0;s.world.weatherCells=[];
  s.world.contacts=[{id:'M-SCOPE',name:'Merchant',type:'MERCHANT',displayType:'FREIGHTER',side:'ENEMY',position:{xNm:4.3,yNm:0},heading:35,speedKnots:9,desiredHeading:35,desiredSpeed:9,acousticBase:.25,lengthYards:430}];e.updateDetection(.1);const tr=s.world.contactTracks['M-SCOPE'];out.scope={source:tr?.source,conf:tr?.confidence,pos:tr?.positionConfidence,hull:tr?.visualHullConfirmed,course:tr?.courseEstimate,speed:tr?.speedEstimateKnots};}
 // During a known convoy chase, merchant #2 becoming visual is not another stop;
 // an escort crossing 6 nm or newly becoming visual is.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.world.contacts=[
   {id:'M1',type:'MERCHANT',convoyId:'MAIN',position:{xNm:0,yNm:-8},heading:0,speedKnots:9,lengthYards:430},
   {id:'M2',type:'MERCHANT',convoyId:'MAIN',position:{xNm:.4,yNm:-8.2},heading:0,speedKnots:9,lengthYards:430},
   {id:'E1',type:'ESCORT',convoyId:'MAIN',position:{xNm:0,yNm:-7},heading:0,speedKnots:12,lengthYards:300}
  ];s.world.contactTracks={M1:{id:'M1',confidence:.9,visualHullConfirmed:true,hullConfirmedAt:0,rangeEstimateNm:8,positionSource:'VISUAL'},E1:{id:'E1',confidence:.7,visualHullConfirmed:false,rangeEstimateNm:7,positionSource:'HYDROPHONE'}};e.snapshotWatch();s.world.contactTracks.M2={id:'M2',confidence:.8,visualHullConfirmed:true,hullConfirmedAt:0,rangeEstimateNm:8.2,positionSource:'VISUAL'};out.moreMerchant=e.transitInterrupt();
  e.snapshotWatch();s.world.contactTracks.E1.rangeEstimateNm=5.8;out.escortBand=e.transitInterrupt();
  s.world.contactTracks.E1.rangeEstimateNm=7;s.world.contactTracks.E1.visualHullConfirmed=false;e.snapshotWatch();s.world.contactTracks.E1.visualHullConfirmed=true;s.world.contactTracks.E1.hullConfirmedAt=s.time.elapsedSeconds;out.escortVisual=e.transitInterrupt();}
 // Optical footprint is smooth/bounded state: 18-ray lookout, 9-ray scope, none deep.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.environment.visibilityNm=8;s.world.weatherCells=[];s.playerSub.depthFeet=0;e.updateMapState(1);out.visSurf={mode:s.map.visibilityFootprint.mode,n:s.map.visibilityFootprint.points.length};s.time.elapsedSeconds+=2;s.playerSub.depthFeet=55;s.tactical.activeStation='PERISCOPE';s.tactical.periscopeZoom=2.5;s.tactical.periscopeBearing=123;e.updateMapState(1);out.visScope={mode:s.map.visibilityFootprint.mode,n:s.map.visibilityFootprint.points.length};s.time.elapsedSeconds+=2;s.playerSub.depthFeet=120;e.updateMapState(1);out.visDeep={mode:s.map.visibilityFootprint.mode,n:s.map.visibilityFootprint.points.length};}
 // Successful FIRE gives explicit tube/type feedback.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus()),notes=[];e.notify=(m,k)=>notes.push({m,k});e.alertEscorts=()=>false;s.playerSub.heading=0;s.playerSub.depthFeet=20;const tube=s.weapons.tubes[0];tube.status='READY';tube.flooded=true;s.tdc.targetId='MANUAL';s.tdc.autoTrack=false;s.tdc.bearing=0;s.tdc.rangeNm=.6;s.tdc.targetCourse=0;s.tdc.targetSpeedKnots=0;s.tdc.gyroAngle=0;s.tdc.solutionQuality=.95;s.tdc.torpedoSpecKey='mk14fast';s.tdc.torpedoSpeedKnots=46;e.fireTorpedo(tube.id);out.fire={notes,active:s.weapons.activeTorpedoes.length,status:tube.status};}
 return out;
})()`,ctx);
assert('6x periscope visual contact becomes a strong pinned chart fix immediately',result.scope.source==='VISUAL'&&result.scope.hull&&result.scope.conf>=.85&&result.scope.pos>=.94&&result.scope.course===35&&result.scope.speed===9,result.scope);
assert('known convoy does not repeatedly break transit for each additional merchant becoming visual',result.moreMerchant===null,result);
assert('known escort closing through 6 nm still breaks convoy-chase transit',result.escortBand==='escort inside 6 nm',result);
assert('a newly visual escort always hands the conn back to the player',result.escortVisual==='escort now in sight',result);
assert('map optical coverage is bounded smooth footprint rather than square cells',result.visSurf.mode==='LOOKOUT'&&result.visSurf.n===18&&result.visScope.mode==='SCOPE'&&result.visScope.n===9&&result.visDeep.n===0,{surface:result.visSurf,scope:result.visScope,deep:result.visDeep});
assert('successful torpedo FIRE reports exact tube and torpedo type',result.fire.active===1&&result.fire.status==='EMPTY'&&result.fire.notes.some(x=>/TORPEDO AWAY — Tube 1 \(FWD\), Mark 14 Fast/.test(x.m)),result.fire);

const touch=fs.readFileSync(path.join(root,'js/controllers/touch-controller.js'),'utf8'),dom=fs.readFileSync(path.join(root,'js/ui/dom-view.js'),'utf8'),canvas=fs.readFileSync(path.join(root,'js/rendering/canvas-core.js'),'utf8'),per=fs.readFileSync(path.join(root,'js/rendering/periscope-3d.js'),'utf8'),map=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8'),bridge=fs.readFileSync(path.join(root,'js/rendering/bridge-3d.js'),'utf8'),atmo=fs.readFileSync(path.join(root,'js/rendering/battle-atmosphere.js'),'utf8'),css=fs.readFileSync(path.join(root,'css/app.css'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert('programmatic 1x transit stop also refreshes both custom time-picker labels',touch.includes('tsel._pkLabel?.()')&&touch.includes('hsel._pkLabel?.()')&&dom.includes('tsel._pkLabel?.()'),{});
assert('persistent aircraft banner no longer says clear the bridge once submerged or already diving',canvas.includes("sub.depthFeet>=12?'STAY SUBMERGED':diveUnderway?'CONTINUE THE DIVE':'CLEAR THE BRIDGE'"),{});
assert('scope renderer and sensor acquisition use the same local weather-limited visual range',per.includes("cam.kind='PERISCOPE'")&&per.includes("bridgeVisualLimitNm(state,c)*NM_M*1.02"),{});
assert('night/gloom torpedo hits use cheap screen-blended local light and burning ships cast a fading glow/reflection',per.includes("globalCompositeOperation='screen'")&&per.includes("/HIT/.test(e.label||'')&&age<5.2")&&atmo.includes("globalCompositeOperation='screen'")&&atmo.includes('gloom'),{});
assert('quick speed block explicitly exposes silent-running speed limitation',touch.includes('SILENT · ${p.actualRpm.toFixed(0)}rpm')&&touch.includes("`${p.speedKnots.toFixed(1)}kn · SILENT`"),{});
assert('battery percentage plus CHG/DRAIN/FULL state is in permanent quick status',html.includes('id="qBatt"')&&html.includes('id="qBattState"')&&touch.includes("charging?'CHG':p.engineMode==='ELECTRIC'?'DRAIN':'HOLD'"),{});
assert('blocky explored-cell shading is no longer rendered as literal eyesight',!map.includes('// fog of war')&&map.includes('Current optical coverage')&&map.includes('visibilityFootprint'),{});
assert('B5N bomber silhouette is broad conventional/tapered rather than swept dart',map.includes('B5N/Kate: broad conventional tapered wing')&&bridge.includes('Nakajima B5N: long fuselage with a broad, nearly unswept tapered'),{});
assert('tablet side controls sit low while periscope information owns a centre gutter between them',css.includes('data-station="PERISCOPE"] #ovlRight{bottom:8px;}')&&per.includes('const side=touch?Math.min(96*k,w*.19):0'),{});
if(failed){console.error(`PATCH 10.9 PLAYTEST HARDENING: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 10.9 PLAYTEST HARDENING: PASS');
