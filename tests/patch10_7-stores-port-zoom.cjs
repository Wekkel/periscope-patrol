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
const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:fn=>{if(typeof fn==='function')fn();return 0},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()},audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){},durationFor:()=>4000},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:1200,innerHeight:800,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:1200,innerHeight:800,globalThis:null};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus()),out={};
 out.store0=torpedoStoresStatus(s);
 s.weapons.tubes[0].status='EMPTY';out.storeAfterFire=torpedoStoresStatus(s);
 s.weapons.tubes[0].status='LOADED_DRY';s.weapons.tubes[0].specKey='mk18';s.weapons.torpedoInventory=15;out.storeMixed=torpedoStoresStatus(s);
 // active-mission friendly RV service; no patrol completion should occur.
 s.campaign.primaryMission={type:'CONVOY_INTERDICTION'};s.campaign.missionStatus='ACTIVE';
 const port=s.campaign.friendlyPort;s.campaign.portApproach={portName:port.name,pos:{xNm:10,yNm:10},seabedFeet:140};s.playerSub.position={xNm:10,yNm:10};s.playerSub.depthFeet=0;s.playerSub.propulsion.speedKnots=0;
 s.playerSub.propulsion.fuel=31;s.playerSub.propulsion.battery=44;s.playerSub.damage.hullIntegrity=48;s.playerSub.damage.flooding=.5;s.playerSub.damage.periscopeDamage=.7;s.weapons.torpedoInventory=3;s.weapons.deckGun.ammo=17;s.world.aaAmmo=88;s.weapons.tubes[1].status='EMPTY';s.weapons.tubes[1].reloadProgress=.2;
 for(let i=0;i<16;i++)e.checkPortArrival(1);
 out.service={mission:s.campaign.missionStatus,lock:s.campaign._portServiceLock,fuel:s.playerSub.propulsion.fuel,battery:s.playerSub.propulsion.battery,hull:s.playerSub.damage.hullIntegrity,flood:s.playerSub.damage.flooding,scope:s.playerSub.damage.periscopeDamage,reserve:s.weapons.torpedoInventory,loaded:s.weapons.tubes.filter(t=>t.status==='LOADED_DRY').length,gun:s.weapons.deckGun.ammo,aa:s.world.aaAmmo,last:s.campaign.lastPortServiceAt};
 return out;
})()`,ctx);
assert('torpedo HUD can report total aboard, loaded, reserve, READY and load type',result.store0.total===22&&result.store0.loaded===6&&result.store0.reserve===16&&result.store0.loadShort==='MK14F',result.store0);
assert('torpedo stores total drops when a tube is empty rather than showing reserve only',result.storeAfterFire.total===21&&result.storeAfterFire.loaded===5,result.storeAfterFire);
assert('loaded tube types can be shown separately when a mixed load exists',/MK18/.test(result.storeMixed.loadedText)&&/MK14F/.test(result.storeMixed.loadedText),result.storeMixed);
assert('friendly RV services an active patrol without completing it',result.service.mission==='ACTIVE'&&result.service.lock,result.service);
assert('friendly RV replenishes fuel, battery, torpedoes, deck gun and AA',result.service.fuel===100&&result.service.battery===100&&result.service.reserve===16&&result.service.loaded===6&&result.service.gun===120&&result.service.aa===1200,result.service);
assert('friendly RV performs full arcade battle-damage repair',result.service.hull===100&&result.service.flood===0&&result.service.scope===0,result.service);

// Rendering cull: at max zoom around Tulagi only the nearby terrain feature
// should be submitted to Canvas2D instead of all Solomon polygons.
const renderCtx=vm.createContext({console,Math,WeakMap,CanvasViewSound:class{},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
vm.runInContext(fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8')+'\nthis.CV=CanvasView;',renderCtx,{filename:'map.js'});
// Pull real terrain across contexts as plain JSON.
const terrain=JSON.parse(vm.runInContext(`JSON.stringify(PATROL_AREAS['Solomon Sea'].terrain)`,ctx));
let points=0,paths=0;const fake={beginPath(){paths++},moveTo(){points++},lineTo(){points++},closePath(){},fill(){},stroke(){},setLineDash(){},createLinearGradient(){return{addColorStop(){}}},save(){},restore(){}};
const cv=Object.create(renderCtx.CV.prototype);cv.k=1;cv.w=1200;cv.h=800;cv.zoom=900;cv._terrainBoundsCache=new WeakMap();
const center={xNm:151.4,yNm:48};const w2s=(x,y)=>({x:600+(x-center.xNm)*900,y:400+(y-center.yNm)*900});
cv.drawMapTerrain(fake,terrain,w2s);
const allPoints=terrain.reduce((n,f)=>n+f.points.length,0);
assert('high-zoom terrain renderer culls off-screen islands before building Canvas paths',points<allPoints*.25,{submittedPoints:points,allTerrainPoints:allPoints,paths});
const mapSrc=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8');
assert('zoom optimization is limited to simple viewport culling, not a new renderer',mapSrc.includes('_terrainBoundsCache')&&!mapSrc.includes('OffscreenCanvas')&&!mapSrc.includes('WebGL'),{});
if(failed){console.error(`PATCH 10.7 STORES / PORT / ZOOM: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 10.7 STORES / PORT / ZOOM: PASS');
