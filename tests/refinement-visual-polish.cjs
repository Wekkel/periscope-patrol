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

let seed=0x9a77c123;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
function nop(){}
const store=new Map(),toastNodes=[];
const toastContainer={children:[],appendChild(n){this.children.push(n);toastNodes.push(n)},replaceChildren(){this.children=[]}};
function toastNode(){return{className:'',textContent:'',dataset:{},style:{setProperty(k,v){this[k]=v}},remove(){this.removed=true}}}
const fakeCtx={setTransform:nop,setLineDash:nop,fillRect:nop,strokeRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,fill:nop,arc:nop,ellipse:nop,rect:nop,arcTo:nop,closePath:nop,quadraticCurveTo:nop,fillText:nop,save:nop,restore:nop,clip:nop,translate:nop,rotate:nop,scale:nop,drawImage:nop,clearRect:nop,measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:nop}),createRadialGradient:()=>({addColorStop:nop}),textAlign:'left',textBaseline:'alphabetic',globalAlpha:1,filter:'none'};
let perf=0;
const base={console,Math:math,Date,JSON,performance:{now:()=>{perf+=16;return perf;}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:{playSonarPing(){},playAlarm(){},playDepthCharge(){},playHit(){},playMissionComplete(){},playDive(){},playSurface(){},playCrashDive(){},playWaypoint(){},playDeckGun(){},setAmbient(){}},
 showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:4,hardwareConcurrency:4},
 window:{devicePixelRatio:3,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>toastNode(),getElementById:id=>id==='toastContainer'?toastContainer:null,querySelectorAll:()=>[],addEventListener:nop},tutorial:{update(){}},
 DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/ui/toast.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js',
'js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

// Toast lifetime grows with the message instead of hard-expiring at 2.3/3.5 s.
const toastTimes=vm.runInContext(`(()=>{const short='Map centred on ownship';const long='Dive: deck-gun crew and AA crew clearing the deck automatically — dive held about 18 seconds until the hatch is shut.';const lost='THE BOAT IS LOST. There is nobody left to pass the order to — start a new patrol from the menu.';return{short:Toast.durationFor(short,'ok'),long:Toast.durationFor(long,'bad'),lost:Toast.durationFor(lost,'bad')}})()`,ctx);
assert('toast lifetime scales with reading length',toastTimes.short>=2800&&toastTimes.long>=5500&&toastTimes.long>toastTimes.short&&toastTimes.lost>toastTimes.short,toastTimes);

const CanvasView=vm.runInContext('CanvasView',ctx),CanvasViewDeckGun=vm.runInContext('CanvasViewDeckGun',ctx),SimEngine=vm.runInContext('SimEngine',ctx),CommandBus=vm.runInContext('CommandBus',ctx);
const canvas={width:0,height:0,clientWidth:844,clientHeight:390,getContext:()=>fakeCtx,getBoundingClientRect:()=>({left:0,top:0,width:844,height:390}),addEventListener:nop,setPointerCapture:nop};
const cv=new CanvasView(canvas);

// Real ownship geometry retains the same inferred relative bearing under a focal-length change.
const perspective=vm.runInContext(`(()=>{const s=createState('Java Sea');s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.playerSub.position={xNm:0,yNm:0};s.playerSub.heading=90;s.tactical.bridgeBearing=110;s.tactical.bridgeZoom=0;return s})()`,ctx);
const camWide=cv.setupBridgeCam(perspective,82,844,390),camBino=cv.setupBridgeCam(perspective,24,844,390);
const bp=cv.ownshipDeckPoint(perspective.playerSub,34,0,1.2);
const pw=cv.proj(camWide,bp.xNm*1852,-bp.yNm*1852,bp.zM),pb=cv.proj(camBino,bp.xNm*1852,-bp.yNm*1852,bp.zM);
const aw=Math.atan((pw.x-camWide.cx)/camWide.f),ab=Math.atan((pb.x-camBino.cx)/camBino.f);
assert('bridge bow keeps identical world bearing when optics change',Math.abs(aw-ab)<1e-10,{wideScreenX:pw.x,binoScreenX:pb.x,inferredWideDeg:aw*180/Math.PI,inferredBinoDeg:ab*180/Math.PI});
perspective.tactical.bridgeZoom=.5;const midFov=vm.runInContext('bridgeFovDeg',ctx)(perspective),midMag=vm.runInContext('bridgeMagnification',ctx)(perspective);
assert('bridge supports continuous optical zoom between wide and binocular endpoints',midFov<82&&midFov>24&&midMag>1&&midMag<5,{midFov,midMag});

// An attacking aircraft in the bridge field is guaranteed to become a visible contact.
const airResult=vm.runInContext(`(()=>{const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.tactical.activeStation='BRIDGE';s.tactical.bridgeBearing=90;s.tactical.bridgeZoom=0;s.world.environment.daylight=1;s.world.environment.visibilityNm=12;s.world.airThreat={level:0,nextCheck:9999,sdOn:false,alarmedAt:-999};s.world.aircraft=[{id:'AIR-T',name:'Nakajima B5N',kind:'BOMBER',position:{xNm:2,yNm:0},heading:270,speedKnots:145,state:'ATTACKING',bombs:2,runTimer:20,spotted:true,seenBySub:false,bornAt:0}];e.updateAircraft(.1);return{seen:s.world.aircraft[0].seenBySub,state:s.world.aircraft[0].state,log:s.log.slice(-1)[0]?.message}})()`,ctx);
assert('attacking aircraft inside bridge field cannot remain invisible',airResult.seen===true,airResult);
const airState=vm.runInContext(`(()=>{const s=createState('Java Sea');s.playerSub.position={xNm:0,yNm:0};s.playerSub.heading=90;s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.tactical.bridgeBearing=90;s.world.environment.visibilityNm=12;s.world.aircraft=[{id:'AIR-V',name:'B5N',kind:'BOMBER',position:{xNm:2,yNm:0},heading:270,speedKnots:150,state:'ATTACKING',seenBySub:true}];return s})()`,ctx);
let planeFills=0;const planeCtx=Object.assign({},fakeCtx,{fill(){planeFills++}});const acam=cv.setupBridgeCam(airState,82,844,390);cv.drawBridgeAircraft(planeCtx,acam,airState,1,0);
assert('bridge renderer draws a seen attacking aircraft as vector geometry',planeFills>0,{planeFills});

// Gun overshoot splash must be depth-sorted behind a nearer aligned target.
const splashState=vm.runInContext(`(()=>{const s=createState('Java Sea');s.playerSub.position={xNm:0,yNm:0};s.playerSub.heading=90;s.playerSub.depthFeet=0;s.world.contacts=[{id:'M1',type:'MERCHANT',lengthYards:430,position:{xNm:1,yNm:0},heading:0,speedKnots:8,sunk:false}];return s})()`,ctx);
const behind=cv.gunSplashBehindShip({},splashState,{position:{xNm:1.25,yNm:0},age:.5}),front=cv.gunSplashBehindShip({},splashState,{position:{xNm:.75,yNm:0},age:.5}),side=cv.gunSplashBehindShip({},splashState,{position:{xNm:1.25,yNm:.15},age:.5});
assert('overshoot splash aligned behind target is classified behind the hull',behind===true&&front===false,{behind,front,side});
let order=[];const drawState=splashState;drawState.weapons.deckGun.manned=true;drawState.weapons.deckGun.ammo=120;drawState.weapons.deckGun.splashes=[];drawState.world.environment.daylight=1;drawState.world.environment.weather='CLEAR';drawState.world.environment.seaState=.2;
const seqView=Object.create(cv);Object.assign(seqView,{portrait:false,k:1,rr:nop,drawSky3D:nop,drawSea3D:nop,drawTerrain3D:nop,drawWakes3D:nop,drawGunSplashes3D(_c,_cam,_s,b){order.push(b?'far-splash':'near-splash')},drawFleet3D(){order.push('fleet')},drawExplosions3D:nop,drawGunProjectiles3D(){order.push('shells')},drawRain:nop,drawNightOverlay:nop,drawOwnshipSurfaceDeck3D(){order.push('own-deck')},fnt:()=> '10px monospace'});
CanvasViewDeckGun.prototype.drawDeckGun.call(seqView,fakeCtx,844,390,drawState);
assert('gun painter draws far splashes before ships and near splashes after ships',order.indexOf('far-splash')<order.indexOf('fleet')&&order.indexOf('near-splash')>order.indexOf('fleet'),order);
assert('gun view now includes projected ownship deck beneath the mount',order.includes('own-deck'),order);

// Turn dynamics: angular rate itself ramps, while escort remains more agile than merchant.
const turnData=vm.runInContext(`(()=>{const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());const run=type=>{const c={type,heading:0,desiredHeading:90,speedKnots:10,desiredSpeed:10};let maxStep=0,first=null;for(let i=0;i<100;i++){const b=c.heading;e.steerShip(c,.1);const step=Math.abs(shortDelta(b,c.heading));maxStep=Math.max(maxStep,step);if(i===0)first={heading:c.heading,rate:c.turnRateDegSec};}return{heading:c.heading,rate:c.turnRateDegSec,maxStep,first}};const speed={type:'MERCHANT',heading:0,desiredHeading:0,speedKnots:5,desiredSpeed:10};for(let i=0;i<100;i++)e.steerShip(speed,.1);return{merchant:run('MERCHANT'),escort:run('ESCORT'),speed:speed.speedKnots}})()`,ctx);
assert('ships ramp into turns instead of snapping instantly to full rudder',turnData.merchant.first.rate>0&&turnData.merchant.first.rate<1.2&&turnData.merchant.maxStep<=.121,turnData.merchant);
assert('escort turns materially faster than merchant but both remain rate-limited',turnData.escort.heading>turnData.merchant.heading&&turnData.escort.maxStep<=.341,turnData);
assert('ship speed changes progressively rather than jumping to ordered speed',turnData.speed>5&&turnData.speed<10,turnData.speed);

// The observed chart course follows a real turning hull and carries a turn cue estimate.
const mapTurn=vm.runInContext(`(()=>{const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.world.environment.visibilityNm=20;s.world.environment.daylight=1;s.world.environment.seaState=0;const c={id:'M-TURN',name:'Merchant',type:'MERCHANT',displayType:'FREIGHTER',lengthYards:430,beamYards:58,visualProfile:1,acousticBase:.2,position:{xNm:0,yNm:-1},heading:0,desiredHeading:90,speedKnots:10,desiredSpeed:10,sunk:false};s.world.contacts=[c];s.world.contactTracks[c.id]={id:c.id,typeEstimate:'FREIGHTER',bearing:0,rangeEstimateNm:1,courseEstimate:0,speedEstimateKnots:10,confidence:1,source:'VISUAL',lastUpdated:0,staleSeconds:0,contactType:'MERCHANT',lengthYards:430};for(let i=0;i<60;i++){e.steerShip(c,.1);e.updateDetection(.1);}const tr=s.world.contactTracks[c.id];return{actual:c.heading,plotCourse:tr.courseEstimate,turnRate:tr.turnRateEstimateDegSec}})()`,ctx);
assert('MAP contact heading follows a turning observed ship and records turn direction',mapTurn.actual>0&&mapTurn.plotCourse>0&&mapTurn.turnRate>0,mapTurn);
const mapSource=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8');
assert('MAP renders a turn cue from observed turn rate without using desiredHeading',mapSource.includes('turnRateEstimateDegSec')&&mapSource.includes('this.turnCue('),{});

// Performance architecture remains bounded: no new render context or particle engine.
const bridgeSrc=fs.readFileSync(path.join(root,'js/rendering/bridge-3d.js'),'utf8'),gunSrc=fs.readFileSync(path.join(root,'js/rendering/deck-gun-3d.js'),'utf8');
assert('refinement adds no extra canvas/WebGL/offscreen renderer',!/(createElement\s*\(\s*['"]canvas|WebGL|OffscreenCanvas)/.test(bridgeSrc+gunSrc),{});

if(failed){console.error(`REFINEMENT POLISH CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('REFINEMENT POLISH CONTRACT: PASS');
