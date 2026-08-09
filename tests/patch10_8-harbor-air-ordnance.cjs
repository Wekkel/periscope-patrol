#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
function nop(){};const math=Object.create(Math);math.random=()=>0.23;const store=new Map();
const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()},audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){},durationFor:()=>4000},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:1200,innerHeight:800,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:1200,innerHeight:800,globalThis:null};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus()),out={};
 // Simulate a stale pre-fix Tulagi RV persisted with a dangerously shallow centre.
 const port=s.campaign.friendlyPort;s.campaign.portApproach={portName:port.name,pos:{...port.pos},seabedFeet:24};
 const ap=e.friendlyPortApproach(port),samples=[];
 for(const rr of [0,.15,.30]){const steps=rr?12:1;for(let i=0;i<steps;i++){const a=rr?degToRad(i*360/steps):0,q={xNm:ap.pos.xNm+Math.sin(a)*rr,yNm:ap.pos.yNm-Math.cos(a)*rr};const t=e.checkTerrainCollision({position:q});samples.push({sea:Bathy.feet(q.xNm,q.yNm),collision:t.collision,shallow:t.inShallow});}}
 out.rv={ap,minFeet:Math.min(...samples.map(x=>x.sea)),bad:samples.filter(x=>x.sea<70||x.collision||x.shallow).length};
 // The green ring is a hard gameplay promise even if a coarse polygon lies.
 s.playerSub.position={...ap.pos};s.playerSub.depthFeet=0;s.playerSub.propulsion.speedKnots=2;s.playerSub.damage.hullIntegrity=100;
 const realCheck=e.checkTerrainCollision.bind(e);e.checkTerrainCollision=()=>({collision:true,inShallow:true});e.applyTerrainEffects(s.playerSub,.1);e.checkTerrainCollision=realCheck;
 out.ringOverride={risk:s.playerSub.groundingRisk,shallow:s.playerSub.inShallowWater,hull:s.playerSub.damage.hullIntegrity,seabed:s.playerSub.seabedFeet};
 // A flying boat now puts a depth charge into the water first. No instantaneous blast.
 const logs=[];e.log=function(m){logs.push(m)};s.world.depthCharges=[];s.weapons.explosions=[];s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=100;s.playerSub.damage.hullIntegrity=100;
 const dcPlane={id:'AIR-DC',name:'Type 97 flying boat',kind:'FLYING_BOAT',ordnance:'DEPTH_CHARGE',position:{xNm:0,yNm:-.1},rattled:0};
 e.airAttack(dcPlane,s.playerSub);const dc=s.world.depthCharges[0],h0=s.playerSub.damage.hullIntegrity,exp0=s.weapons.explosions.length;
 for(let i=0;i<Math.max(1,Math.floor(dc.fuseSec)-1);i++)e.updateDCs(1);
 const before={status:dc.status,hull:s.playerSub.damage.hullIntegrity,age:dc.ageSec,fuse:dc.fuseSec};
 for(let i=0;i<4;i++)e.updateDCs(1);
 out.airDc={source:dc.source,fuse:dc.fuseSec,h0,exp0,before,afterHull:s.playerSub.damage.hullIntegrity,afterStatus:dc.status,waterWarning:logs.some(x=>/DEPTH CHARGE IN THE WATER/.test(x))};
 // A bomber remains an ordinary bomb: immediate water burst, no sinking DC object.
 s.world.depthCharges=[];s.weapons.explosions=[];logs.length=0;s.playerSub.damage.hullIntegrity=100;
 const bomber={id:'AIR-B',name:'Nakajima B5N',kind:'BOMBER',ordnance:'BOMB',position:{xNm:0,yNm:-.1},rattled:0};e.airAttack(bomber,s.playerSub);
 out.bomb={dcs:s.world.depthCharges.length,labels:s.weapons.explosions.map(x=>x.label),logs:[...logs],hull:s.playerSub.damage.hullIntegrity};
 return out;
})()`,ctx);
assert('stale shallow Tulagi RV is re-charted into a wholly safe 0.30 nm service disk',result.rv.ap.safeWater&&result.rv.minFeet>=70&&result.rv.bad===0,result.rv);
assert('green friendly RV cannot ground the boat even if coarse terrain overlaps the marked ring',!result.ringOverride.risk&&!result.ringOverride.shallow&&result.ringOverride.hull===100&&result.ringOverride.seabed>=90,result.ringOverride);
assert('aerial depth charge enters the water and remains sinking before detonation',result.airDc.source==='AIR'&&result.airDc.fuse>=5&&result.airDc.exp0===0&&result.airDc.before.status==='SINKING'&&result.airDc.before.hull===100,result.airDc);
assert('submerged player receives an explicit depth-charge-in-water warning before the explosion',result.airDc.waterWarning,result.airDc);
assert('aerial DC at 100 ft preserves evasive playability rather than becoming a near-certain catastrophic hit',result.airDc.afterStatus==='DETONATED'&&result.airDc.afterHull>90,result.airDc);
assert('ordinary aircraft bombs remain immediate bomb bursts, distinct from sinking depth charges',result.bomb.dcs===0&&result.bomb.labels.some(x=>/AIR BOMB/.test(x)),result.bomb);
const mapSrc=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8');
assert('map adds a solid four-fathom grounding-danger contour and identifies the RV as safe water',mapSrc.includes("curve(4,'rgba(239,106,88,0.48)',[])")&&mapSrc.includes('4-fathom grounding danger')&&mapSrc.includes('SAFE SERVICE WATER'),{});
const airSrc=fs.readFileSync(path.join(root,'js/simulation/ai/aircraft.js'),'utf8');
assert('aircraft population formula/cadence was not increased while ordnance was refined',airSrc.includes('air.nextCheck=90')&&airSrc.includes('let chance=0.020*air.level')&&airSrc.includes('if(W.aircraft.length>=2) chance=0'),{});
if(failed){console.error(`PATCH 10.8 HARBOR / AIR ORDNANCE: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 10.8 HARBOR / AIR ORDNANCE: PASS');
