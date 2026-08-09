#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const jsFiles=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&jsFiles.push(p)}})(path.join(root,'js'));
for(const f of jsFiles){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}
pass('JavaScript syntaxcheck',{files:jsFiles.length});
const store=new Map();let perfTick=0;
const base={console,Math,Date,JSON,performance:{now:()=>{perfTick+=0.25;return perfTick;}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:8},window:{devicePixelRatio:1},document:{hidden:false,documentElement:{dataset:{lay:'desk'}},getElementById:()=>null},innerWidth:1280,innerHeight:800,
 tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js',
'js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js','js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js','js/core/game-loop.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const out={};
 const mkShip=(id,x,y,hdg,spd,type='MERCHANT',len=420,tons=4200)=>({id,name:id,type,lengthYards:len,tonsFactor:tons,position:{xNm:x,yNm:y},heading:hdg,desiredHeading:hdg,speedKnots:spd,desiredSpeed:spd,baseSpeed:spd,visualProfile:1,acousticBase:.3});
 const mkEngine=()=>{const s=createState('Solomon Sea');s.world.contacts=[];s.world.terrain=[];s.world.convoyRoutes=[];s.world.ports=[];const e=new SimEngine(s,new CommandBus());return{s,e};};

 // Regression guard: generalized ship hull rectangle preserves the old deck-gun XY intersection exactly.
 {let mismatches=0,checked=0,seed=123456789;const rnd=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const legacy=(a,b,c)=>{const lenNm=(c.lengthYards||400)*0.9144/NM_M,halfL=lenNm*.5,halfB=lenNm/(c.type==='ESCORT'?10.5:7.2)*.5;const h=degToRad(c.heading||0),fx=Math.sin(h),fy=-Math.cos(h),px=-fy,py=fx;const local=q=>{const dx=q.xNm-c.position.xNm,dy=q.yNm-c.position.yNm;return{x:dx*fx+dy*fy,y:dx*px+dy*py}};const p0=local(a),p1=local(b),dx=p1.x-p0.x,dy=p1.y-p0.y;let u0=0,u1=1;const clip=(p,q)=>{if(Math.abs(p)<1e-12)return q>=0;const r=q/p;if(p<0){if(r>u1)return false;if(r>u0)u0=r}else{if(r<u0)return false;if(r<u1)u1=r}return true};if(!clip(-dx,p0.x+halfL)||!clip(dx,halfL-p0.x)||!clip(-dy,p0.y+halfB)||!clip(dy,halfB-p0.y))return null;return{u:u0,halfB};};
  for(let i=0;i<500;i++){const c=mkShip('R',0,0,rnd()*360,0,rnd()<.3?'ESCORT':'MERCHANT',280+rnd()*300,3000),a={xNm:(rnd()-.5)*.7,yNm:(rnd()-.5)*.7},b={xNm:(rnd()-.5)*.7,yNm:(rnd()-.5)*.7};const x=legacy(a,b,c),y=HullGeometry.segmentHullIntersection(a,b,shipHull(c));checked++;if(!!x!==!!y||(x&&Math.abs(x.u-y.u)>1e-10))mismatches++;}
  out.deckGunGeometryRegression={checked,mismatches};}

 // Shared geometry: deck-gun segment delegates to the same hull helper; swept test must catch tunnelling.
 {const a=mkShip('A',0,0,0,0),h=shipHull(a),p0={xNm:-.02,yNm:0,zM:5},p1={xNm:.02,yNm:0,zM:5};const seg=HullGeometry.segmentHullIntersection(p0,p1,h);
  const {e}=mkEngine(),gun=e.segmentShipGunHit(p0,p1,a);
  const sub={position:{xNm:-.5,yNm:0},heading:90,depthFeet:0,propulsion:{speedKnots:30}};
  const tgt=mkShip('FAST',0,0,0,0);
  const hit=movingHullIntersection(subHull(sub,{xNm:-.5,yNm:0},90),subHull(sub,{xNm:.5,yNm:0},90),shipHull(tgt),shipHull(tgt));
  out.geometry={segment:!!seg,gun:!!gun,shared:!!seg&&!!gun&&Math.abs(seg.u-gun.u)<1e-12&&Math.abs(seg.halfB-gun.halfB)<1e-12,swept:!!hit,t:hit?.t};}

 // Two merchants head-on: the avoidance layer should turn both to starboard and they should pass without physical contact.
 {const {s,e}=mkEngine();const a=mkShip('M-A',-.20,0,90,10),b=mkShip('M-B',.20,0,270,10);s.world.contacts=[a,b];
  const before=closestApproach(a,b,75,shipHull(a),shipHull(b));e.surfaceAvoidance();const commands=[a.desiredHeading,b.desiredHeading];let min=99;
  for(let k=0;k<100;k++){e.captureCollisionFrame();e.updateWorld(1);e.updateVesselCollisions(1);min=Math.min(min,distNm(a.position,b.position));}
  out.avoidance={beforeCPA:before.centerNm,beforeT:before.timeSec,commands,minNm:min,events:s.world.collisionEvents.length,final:[a.heading,b.heading]};}

 // Deep crossing: same swept geometry, but no vertical overlap means no collision or damage.
 {const {s,e}=mkEngine();const c=mkShip('M-DEEP',0,0,0,0);c.stationary=true;s.world.contacts=[c];const sub=s.playerSub;
  sub.position={xNm:-.12,yNm:0};sub.heading=90;sub.depthFeet=150;sub.propulsion.speedKnots=20;e.captureCollisionFrame();sub.position={xNm:.12,yNm:0};e.updateVesselCollisions(43.2);
  out.deep={events:s.world.collisionEvents.length,hull:sub.damage.hullIntegrity};}

 // Surfaced crossing: identical path must produce a real physical contact and visible state/UI evidence.
 {const {s,e}=mkEngine();const c=mkShip('M-SURF',0,0,0,0);c.stationary=true;s.world.contacts=[c];const sub=s.playerSub;
  sub.position={xNm:-.12,yNm:0};sub.heading=90;sub.depthFeet=0;sub.propulsion.speedKnots=6;e.captureCollisionFrame();sub.position={xNm:.12,yNm:0};e.updateVesselCollisions(144);
  out.surface={events:s.world.collisionEvents.length,hull:sub.damage.hullIntegrity,last:s.world.lastCollision,toasts:(s.ui?.toasts||[]).map(x=>x.msg)};}

 // Damage scales with speed and angle. Compare a 2 kn square touch, a 2 kn 10-degree scrape, and a 23 kn destroyer impact.
 {const run=(speed,offset,type='ESCORT')=>{const {s,e}=mkEngine();const c=mkShip('E-RAM',0,offset,180,speed,type,type==='ESCORT'?350:420,type==='ESCORT'?2200:4200);s.world.contacts=[c];const sub=s.playerSub;
    sub.position={xNm:0,yNm:0};sub.heading=90;sub.depthFeet=0;sub.propulsion.speedKnots=0;e.captureCollisionFrame();c.position={xNm:0,yNm:-offset};e.updateVesselCollisions(Math.max(1,offset*2/speed*3600));return s.world.lastCollision;};
  const square2=run(2,.03,'ESCORT'),fast=run(23,.18,'ESCORT');
  const {s,e}=mkEngine(),c=mkShip('E-GLANCE',-.0197,.00347,0,2,'ESCORT',350,2200),sub=s.playerSub;sub.position={xNm:0,yNm:0};sub.heading=90;sub.depthFeet=0;sub._collisionPrev={position:{xNm:0,yNm:0},heading:90,depthFeet:0};c._collisionPrev={position:{xNm:0,yNm:0},heading:0};c.position={xNm:.0197,yNm:-.00347};
  const glancing=e.collisionImpact(sub,c,{normal:{x:0,y:1}},36);out.impact={square2,glancing,fast};}

 // CPA watch: transit reports exact risk; manual high compression is handed back to 1x before contact.
 {const {s,e}=mkEngine();const c=mkShip('M-CPA',.24,0,270,10);s.world.contacts=[c];const sub=s.playerSub;sub.position={xNm:-.24,yNm:0};sub.heading=90;sub.depthFeet=0;sub.propulsion.speedKnots=10;
  e.snapshotWatch();s.time.transitUntil=9999;const why=e.transitInterrupt();s.time.transitUntil=0;s.time.timeScale=32;const stopped=e.compressedCollisionWatch();
  out.cpa={why,stopped,scale:s.time.timeScale,reason:s.time.stopReason,toasts:(s.ui?.toasts||[]).map(x=>x.msg)};}

 // Exercise the actual GameLoop transit contract: a collision-risk return must end skip/transit.
 {const g=new Game();g.state.world.terrain=[];g.state.world.convoyRoutes=[];g.state.world.ports=[];g.state.world.contacts=[mkShip('M-LOOP',.24,0,270,10)];const sub=g.state.playerSub;sub.position={xNm:-.24,yNm:0};sub.heading=90;sub.orderedHeading=90;sub.depthFeet=0;sub.propulsion.speedKnots=10;sub.propulsion.actualRpm=250;sub.propulsion.orderedRpm=250;g.engine.snapshotWatch();g.state.time.transitUntil=9999;g.state.time.transitOpen=true;
  const loop=new GameLoop(g,{render(){}},{render(){}},{updateTouch(){}});loop.domInterval=999;loop.frame(loop.last+100);out.transitLoop={until:g.state.time.transitUntil,reason:g.state.time.transitReason,stopReason:g.state.time.stopReason};}

 // Normal convoy formation must not create phantom hull contacts over ten minutes of navigation-only simulation.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.contacts=e.makeConvoy(PATROL_AREAS['Solomon Sea']);s.world.aircraft=[];s.world.collisionEvents=[];let min=99;
  for(let k=0;k<600;k++){e.captureCollisionFrame();e.updateWorld(1);e.updateVesselCollisions(1);for(let i=0;i<s.world.contacts.length;i++)for(let j=i+1;j<s.world.contacts.length;j++)min=Math.min(min,distNm(s.world.contacts[i].position,s.world.contacts[j].position));}
  out.convoy={events:s.world.collisionEvents.length,minCenterNm:min,count:s.world.contacts.length};}
 return out;
})()`,ctx);

const escortSource=fs.readFileSync(path.join(root,'js/simulation/ai/escort-asw.js'),'utf8');
assert('legacy proximity/random escort ram trigger removed',!escortSource.includes('rng<0.12')&&!escortSource.includes('32+Math.random()*30'),{proximityTrigger:escortSource.includes('rng<0.12'),randomRamDamage:escortSource.includes('32+Math.random()*30')});
assert('deck-gun hull generalization preserves legacy XY hit geometry',result.deckGunGeometryRegression.checked===500&&result.deckGunGeometryRegression.mismatches===0,result.deckGunGeometryRegression);

assert('shared hull geometry + high-speed swept intersection',result.geometry.segment&&result.geometry.gun&&result.geometry.shared&&result.geometry.swept&&result.geometry.t>0&&result.geometry.t<1,result.geometry);
assert('two merchants on collision course alter course',Math.abs(result.avoidance.commands[0]-90)>1&&Math.abs(result.avoidance.commands[1]-270)>1,result.avoidance);
assert('two merchants avoid physical collision',result.avoidance.events===0&&result.avoidance.minNm>.02,result.avoidance);
assert('deep submarine passes below merchant',result.deep.events===0&&result.deep.hull===100,result.deep);
assert('surfaced submarine physically collides',result.surface.events===1&&result.surface.hull<100&&result.surface.toasts.some(x=>x.includes('COLLISION')),result.surface);
assert('impact angle matters at 2 kn: glancing scrape is lighter than square contact',result.impact.glancing.damage<result.impact.square2.damage&&result.impact.glancing.impactAngleDeg<20&&result.impact.glancing.damage<1,result.impact);
assert('high-speed destroyer impact is potentially fatal',result.impact.fast&&result.impact.fast.damage>50&&result.impact.fast.damage>result.impact.square2.damage*10,result.impact);
assert('transit CPA watch reports collision risk before impact',/^COLLISION RISK · CPA/.test(result.cpa.why),result.cpa);
assert('actual GameLoop ends transit before predicted collision',result.transitLoop.until===0&&/^COLLISION RISK · CPA/.test(result.transitLoop.reason||''),result.transitLoop);
assert('manual compressed time stops at 1x on collision risk',result.cpa.stopped&&result.cpa.scale===1&&/^COLLISION RISK · CPA/.test(result.cpa.reason),result.cpa);
assert('normal convoy formation has no phantom collisions',result.convoy.events===0,result.convoy);
if(failed)process.exit(1);console.log('PHASE 1 COLLISION CONTRACT: PASS');
