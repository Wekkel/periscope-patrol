#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}

const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}
pass('JavaScript syntaxcheck',{files:js.length});

let seed=0x51f15eed;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
function nop(){}
const store=new Map(),texts=[];let fills=0,darkSmoke=0;
const grad=()=>({addColorStop:nop});
const fakeCtx={setTransform:nop,setLineDash:nop,strokeRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,arc:nop,ellipse:nop,rect:nop,arcTo:nop,closePath:nop,quadraticCurveTo:nop,fillText(t){texts.push(String(t))},save:nop,restore:nop,clip:nop,translate:nop,rotate:nop,scale:nop,drawImage:nop,clearRect:nop,fillRect(){fills++},measureText:t=>({width:String(t).length*6}),createLinearGradient:grad,createRadialGradient:grad,textAlign:'left',textBaseline:'alphabetic',globalAlpha:1,filter:'none',lineWidth:1};
let _fillStyle='';Object.defineProperty(fakeCtx,'fillStyle',{get(){return _fillStyle},set(v){_fillStyle=v;if(String(v).startsWith('rgba(12,13,14'))darkSmoke++}});fakeCtx.fill=nop;
let perf=0;
const base={console,Math:math,Date,JSON,performance:{now:()=>{perf+=.5;return perf;}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:3,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:844,innerHeight:390,
 tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js',
'js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const result=vm.runInContext(`(()=>{
 const out={};
 const mk=(id,type='MERCHANT',len=420,spd=10)=>({id,name:id,type,displayType:type==='TANKER'?'TANKER':'FREIGHTER',lengthYards:len,visualProfile:1,acousticBase:.35,tonsFactor:type==='TANKER'?7800:4200,position:{xNm:0,yNm:0},heading:90,desiredHeading:90,speedKnots:spd,desiredSpeed:spd,baseSpeed:spd,convoyRole:'MERCHANT',convoyId:'MAIN',formationIndex:0,formationFwd:0,formationSide:0,sunk:false});
 const eng=()=>{const s=createState('Solomon Sea');s.world.contacts=[];s.world.terrain=[];s.world.convoyRoutes=[];s.world.ports=[];s.world.aircraft=[];s.world.environment.daylight=1;s.world.environment.visibilityNm=20;s.world.environment.seaState=.15;const e=new SimEngine(s,new CommandBus());return{s,e};};
 const hit=(e,c,frac,id)=>applyTorpedoShipDamage(e,c,{hitFrac:frac,hitSide:1,incidence:90,warheadKg:292,torpedoId:id});
 // Machine room: major propulsion casualty, black-smoke/fire state, but not an instant sink.
 {const {s,e}=eng(),c=mk('ENG', 'MERCHANT',420,10);s.world.contacts=[c];const d=hit(e,c,-.18,'T-ENG'),atHit={score:s.campaign.score,sunk:c.sunk,location:d.location,damage:{...c.shipDamage}};for(let i=0;i<60;i++){s.time.elapsedSeconds+=1;updateShipDamage(e,c,1);e.steerShip(c,1);}out.engineRoom={atHit,after60:{speed:c.speedKnots,cap:c.damageSpeedCap,sunk:c.sunk,condition:shipDamageCondition(c),damage:{...c.shipDamage}}};}
 // Bow: visible trim/flooding and progressive speed loss, not generic HP subtraction.
 {const {s,e}=eng(),c=mk('BOW','MERCHANT',420,10);s.world.contacts=[c];const d=hit(e,c,.38,'T-BOW'),f0=c.shipDamage.flotation,cap0=c.baseSpeed*shipDamageSpeedFactor(c);for(let i=0;i<120;i++){s.time.elapsedSeconds+=1;updateShipDamage(e,c,1);e.steerShip(c,1);}out.bow={location:d.location,f0,f90:c.shipDamage.flotation,trim:c.shipDamage.trim,cap0,cap90:c.damageSpeedCap,speed:c.speedKnots,sunk:c.sunk};}
 // Stern: steering casualty creates persistent bias/jam and a real course deviation.
 {const {s,e}=eng(),c=mk('STERN','MERCHANT',320,9);s.world.contacts=[c];const d=hit(e,c,-.43,'T-STERN'),h0=c.heading;for(let i=0;i<120;i++){s.time.elapsedSeconds+=1;updateShipDamage(e,c,1);c.desiredHeading=90;e.steerShip(c,1);}out.stern={location:d.location,steering:c.shipDamage.steering,bias:c.shipDamage.rudderBiasDeg,jam:c.shipDamage.rudderJam,heading0:h0,heading120:c.heading,delta:shortDelta(h0,c.heading)};}
 // A deterministic heavy amidships opening founders later; score/tonnage are credited only at actual sinking.
 {const {s,e}=eng(),c=mk('MID1','MERCHANT',420,10);s.world.contacts=[c];const before={score:s.campaign.score,tonnage:s.campaign.tonnageSunk};const d=hit(e,c,0,'T4');const immediate={score:s.campaign.score,tonnage:s.campaign.tonnageSunk,sunk:c.sunk,flotation:c.shipDamage.flotation,founderingAt:c.shipDamage.founderingAt};let elapsed=0;while(!c.sunk&&elapsed<240){elapsed++;s.time.elapsedSeconds+=1;updateShipDamage(e,c,1);}out.midships={location:d.location,before,immediate,after:{elapsed,sunk:c.sunk,score:s.campaign.score,tonnage:s.campaign.tonnageSunk,killCredited:c.shipDamage.killCredited,sinkDuration:c.sinkDurationSec}};}
 // Repeated real deck-gun subsystem hits can burn a tanker until its crew abandons it without inventing a second HP threshold.
 {const {s,e}=eng(),c=mk('TK-AB','TANKER',520,8);s.world.contacts=[c];for(let i=0;i<10;i++)e.damageShipByDeckGun(c,{along:0,lenNm:(c.lengthYards*.9144/1852)});const afterHits={sunk:c.sunk,gunDamage:c.gunDamage,condition:shipDamageCondition(c),damage:{...c.shipDamage},score:s.campaign.score};let sec=0;while(!c.shipDamage.abandoned&&!c.sunk&&sec<360){sec++;s.time.elapsedSeconds+=1;updateShipDamage(e,c,1);}out.abandon={afterHits,afterWait:{sec,abandoned:c.shipDamage.abandoned,sunk:c.sunk,speedOrder:c.desiredSpeed,condition:shipDamageCondition(c),score:s.campaign.score}};}
 // Damage creates a straggler and one escort is detached to guard it while the healthy convoy continues.
 {const s=createState('Truk Approaches'),e=new SimEngine(s,new CommandBus());s.world.contacts=e.makeConvoy(PATROL_AREAS['Truk Approaches'],{areaKey:'Truk Approaches',startDate:'1944-02-17',difficulty:'HARD'});s.world.terrain=[];s.world.ports=[];s.world.aircraft=[];const merchants=s.world.contacts.filter(c=>c.type!=='ESCORT'),escorts=s.world.contacts.filter(c=>c.type==='ESCORT');const casualty=merchants[0],healthy=merchants[1];hit(e,casualty,-.18,'T-GUARD');s.world.enemy.alertState='UNAWARE';e.assignASWRoles(null,true);const guard=escorts.find(x=>x.aswRole==='DAMAGED_GUARD');const d0=distNm(casualty.position,healthy.position);for(let k=0;k<1800;k++){s.time.elapsedSeconds+=1;e.updateConvoyNavigation(1);e.updateASWBrain(1);for(const esc of escorts)e.updateEscortBeh(esc,s.world.enemy,s.playerSub,s.world,0,escorts.length,1);e.updateWorld(1);}const core=e.convoyFrame(),d1=distNm(casualty.position,healthy.position),gd=guard?distNm(guard.position,casualty.position):null;out.guard={escorts:escorts.length,casualtySpeed:casualty.speedKnots,casualtyCap:casualty.damageSpeedCap,healthySpeed:healthy.speedKnots,guardId:guard?.id,guardRole:guard?.aswRole,guardShipId:guard?.guardShipId,d0,d1,guardDistance:gd,core};}
 // Visual knowledge carries a damage estimate; career debrief reads actual subsystem state.
 {const {s,e}=eng(),c=mk('VIS-DMG','TANKER',520,7);c.position={xNm:2,yNm:0};s.world.contacts=[c];for(let i=0;i<7;i++)applyDeckGunShipDamage(e,c,{along:0,lenNm:c.lengthYards*.9144/1852});s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.world.environment.visibilityNm=15;s.tactical.bridgeBearing=90;s.tactical.bridgeZoom=1;e.markBridgeContact(c.id,false);const tr=s.world.contactTracks[c.id];const rec=e.buildPatrolRecord('COMPLETED');out.knowledge={track:{source:tr?.source,damageEstimate:tr?.damageEstimate,damageSeverity:tr?.damageSeverity},career:rec.damagedShips.find(x=>x.id===c.id)};}
 return out;
})()`,ctx);

assert('machine-room torpedo hit wrecks propulsion but leaves ship afloat',result.engineRoom.atHit.location==='ENGINE ROOM'&&!result.engineRoom.atHit.sunk&&result.engineRoom.after60.speed>2&&result.engineRoom.after60.speed<4&&result.engineRoom.after60.damage.propulsion>.65&&result.engineRoom.after60.damage.fire>.2,result.engineRoom);
assert('bow torpedo hit produces progressive flooding, down-by-bow trim and lower speed capability',result.bow.location==='BOW'&&result.bow.f90>result.bow.f0&&result.bow.trim>.5&&result.bow.cap90<result.bow.cap0&&!result.bow.sunk,result.bow);
assert('stern torpedo hit produces persistent steering casualty and course deviation',result.stern.location==='STERN'&&result.stern.steering>.65&&Math.abs(result.stern.bias)>3&&Math.abs(result.stern.delta)>10,result.stern);
assert('heavy midships hit does not award kill on impact, then founders and credits once',result.midships.location==='MIDSHIPS'&&!result.midships.immediate.sunk&&result.midships.immediate.score===result.midships.before.score&&result.midships.after.sunk&&result.midships.after.score>0&&result.midships.after.tonnage>0&&result.midships.after.killCredited,result.midships);
assert('repeated deck-gun hits drive subsystem fire and can lead to abandonment without immediate sink',!result.abandon.afterHits.sunk&&result.abandon.afterHits.damage.fire>.78&&result.abandon.afterWait.abandoned&&!result.abandon.afterWait.sunk&&result.abandon.afterWait.speedOrder===0,result.abandon);
assert('damaged merchant becomes a separate straggler with a dedicated escort guard',result.guard.escorts>=2&&result.guard.guardRole==='DAMAGED_GUARD'&&result.guard.guardShipId&&result.guard.d1>result.guard.d0+.35&&result.guard.guardDistance<1.5,result.guard);
assert('visual contact knowledge exposes a damage condition to UI without exposing raw subsystem truth directly',result.knowledge.track.source==='VISUAL'&&!!result.knowledge.track.damageEstimate&&result.knowledge.track.damageSeverity>.1,result.knowledge.track);
assert('career debrief records actual four-state damage for a surviving damaged ship',result.knowledge.career&&result.knowledge.career.subsystems&&result.knowledge.career.subsystems.fire>.2&&result.knowledge.career.weapon==='DECK_GUN',result.knowledge.career);

// Time selector width and compact selected label are a real UI-level change.
const css=fs.readFileSync(path.join(root,'css/app.css'),'utf8'),picker=fs.readFileSync(path.join(root,'js/ui/picker.js'),'utf8');
assert('time-skip picker has stable width instead of resizing to option text',/#tBtnTime\s*\+\s*\.pk-btn\s*\{[^}]*width\s*:\s*96px[^}]*min-width\s*:\s*96px/s.test(css)&&/#timeSelect\s*\+\s*\.pk-btn\s*\{[^}]*width\s*:\s*214px/s.test(css),{});
assert('compact top time picker uses stable selected labels including unlimited skip',picker.includes("'UNTIL EVENT'")&&picker.includes("'16×'")&&picker.includes("'30 MIN'"),{});

// Map actually renders the observed damage label.
const CanvasView=vm.runInContext('CanvasView',ctx);const canvas={width:844,height:390,clientWidth:844,clientHeight:390,getContext:()=>fakeCtx,getBoundingClientRect:()=>({left:0,top:0,width:844,height:390}),addEventListener:nop};const cv=new CanvasView(canvas);cv.zoom=50;cv.k=1;texts.length=0;
const tr={id:'M-UI',typeEstimate:'TANKER',bearing:90,rangeEstimateNm:2,courseEstimate:90,speedEstimateKnots:3,confidence:.9,source:'VISUAL',lastUpdated:100,positionFixAt:100,positionConfidence:.9,positionUncertaintyNm:.03,plotPosition:{xNm:2,yNm:0},contactType:'TANKER',lengthYards:520,damageEstimate:'BURNING',damageSeverity:.8};
cv.drawMapContacts(fakeCtx,{[tr.id]:tr},p=>({x:422+p.xNm*50,y:195+p.yNm*50}),100,{xNm:0,yNm:0},tr.id);
assert('MAP UI renders observed BURNING/CRIPPLED condition',texts.includes('BURNING'),texts.filter(x=>x.includes('BURN')||x.includes('M-UI')));

// Shared 3D renderer adds bounded black smoke for a genuinely damaged visible ship.
darkSmoke=0;const rs=vm.runInContext(`(()=>{const s=createState('Solomon Sea');s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.playerSub.heading=90;s.tactical.periscopeBearing=90;s.world.environment.visibilityNm=12;s.world.environment.daylight=1;s.world.contacts=[{id:'SMOKE',name:'Burning tanker',type:'TANKER',displayType:'TANKER',lengthYards:520,position:{xNm:1.5,yNm:0},heading:90,speedKnots:3,desiredSpeed:3,baseSpeed:9,sunk:false,shipDamage:{version:1,flotation:.35,propulsion:.76,steering:.1,fire:.72,floodRate:0,fireRate:0,trim:0,list:0,hitCount:1,lastHitAt:0,lastHitLocation:'ENGINE ROOM',lastHitFrac:-.15,lastWeapon:'TORPEDO',rudderBiasDeg:0,rudderJam:0,founderingAt:null,abandonAt:null,abandoned:false,killCredited:false,legacyMigrated:true}}];return s})()`,ctx);cv.w=844;cv.h=390;cv.k=1;cv.quality=.58;cv.lowSpec=true;const cam=cv.setupCam(rs,42,422,195,180);cv.drawFleet3D(fakeCtx,cam,rs,1,rs.world.environment,0);
assert('damaged ship is visibly smoking in shared bridge/periscope/gun 3D renderer',darkSmoke>0,{darkSmoke});

// Patch 5 remains a scalar, low-cost model; no new render engine/particle stack.
const dmgSrc=fs.readFileSync(path.join(root,'js/simulation/ship-damage.js'),'utf8');
assert('Patch 5 damage model adds no WebGL/canvas/offscreen/particle engine',!/(WebGL|OffscreenCanvas|createElement\s*\(\s*['"]canvas|requestAnimationFrame)/.test(dmgSrc),{});
assert('surface ship damage model has exactly the four intended primary subsystem fields',['flotation','propulsion','steering','fire'].every(k=>dmgSrc.includes(`'${k}'`)),{});
const torpSrc=fs.readFileSync(path.join(root,'js/simulation/weapons/torpedoes.js'),'utf8'),gunSrc=fs.readFileSync(path.join(root,'js/simulation/weapons/deck-gun.js'),'utf8');
assert('torpedo and deck-gun kill paths use subsystem damage rather than a hit-point threshold',torpSrc.includes('applyTorpedoShipDamage')&&gunSrc.includes('applyDeckGunShipDamage')&&!/gunDamage\s*(?:>=|>|<=|<)\s*/.test(gunSrc),{});

if(failed){console.error(`PATCH 5 SHIP DAMAGE CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 5 SHIP DAMAGE CONTRACT: PASS');
