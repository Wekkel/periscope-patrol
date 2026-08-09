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

let seed=0x82828282;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const store=new Map(),toastCalls=[];let perf=0;
function nop(){}
const fakeCtx={setTransform:nop,setLineDash:nop,fillRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,fill:nop,arc:nop,arcTo:nop,closePath:nop,quadraticCurveTo:nop,fillText:nop,save:nop,restore:nop,clip:nop,translate:nop,rotate:nop,scale:nop,drawImage:nop,clearRect:nop,measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:nop}),createRadialGradient:()=>({addColorStop:nop}),
 textAlign:'left',textBaseline:'alphabetic',globalAlpha:1,filter:'none'};
const base={console,Math:math,Date,JSON,performance:{now:()=>{perf+=16;return perf;}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:{playSonarPing(){},playAlarm(){},playDepthCharge(){},playHit(){},playMissionComplete(){},playDive(){},playSurface(){},playCrashDive(){},playWaypoint(){},setAmbient(){}},
 Toast:{auto(m){toastCalls.push(['auto',m])},ok(m){toastCalls.push(['ok',m])},warn(m){toastCalls.push(['warn',m])},bad(m){toastCalls.push(['bad',m])},show(){},stop(m){toastCalls.push(['stop',m])}},
 showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:4,hardwareConcurrency:4},
 window:{devicePixelRatio:3,innerWidth:390,innerHeight:844,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},tutorial:{update(){}},
 DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js',
'js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const result=vm.runInContext(`(()=>{
 const out={},mk=(s,id,bearing,rng,type='MERCHANT',displayType='FREIGHTER',speed=10)=>{const r=degToRad(bearing);return{id,name:id,type,displayType,lengthYards:type==='ESCORT'?350:430,beamYards:58,visualProfile:type==='ESCORT'?.75:1,acousticBase:.35,tonsFactor:5000,position:{xNm:s.playerSub.position.xNm+Math.sin(r)*rng,yNm:s.playerSub.position.yNm-Math.cos(r)*rng},heading:270,speedKnots:speed,desiredHeading:270,desiredSpeed:speed,sunk:false,damage:0};};

 // Surface-only station + persisted tactical extensions.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.tactical.activeStation='MAP';s.playerSub.depthFeet=55;s.playerSub.mode='PERISCOPE_DEPTH';e.applyCmd({type:'SET_ACTIVE_STATION',station:'BRIDGE'});out.submerged={station:s.tactical.activeStation,toasts:s.ui?.toasts?.slice(-1)||[]};
  s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.playerSub.heading=123;e.applyCmd({type:'SET_ACTIVE_STATION',station:'BRIDGE'});e.applyCmd({type:'ROTATE_BRIDGE',deltaDeg:17});e.applyCmd({type:'TOGGLE_BRIDGE_BINOCULARS'});out.surface={station:s.tactical.activeStation,bearing:s.tactical.bridgeBearing,bino:s.tactical.bridgeBinoculars};
  const legacy=JSON.parse(JSON.stringify(s));delete legacy.tactical.bridgeBearing;delete legacy.tactical.bridgeBinoculars;legacy.tactical.activeStation='BRIDGE';const le=new SimEngine(legacy,new CommandBus());le.ensureTacticalExtensions();out.migration={bearing:legacy.tactical.bridgeBearing,bino:legacy.tactical.bridgeBinoculars,station:legacy.tactical.activeStation};}

 // Surface watch can see smoke farther than a periscope, but a distant mark
 // does not magically identify the hull.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.world.environment.visibilityNm=10;s.world.environment.daylight=1;s.world.environment.seaState=.15;s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.tactical.activeStation='BRIDGE';s.tactical.bridgeBearing=90;
  const far=mk(s,'M-SMOKE',90,11.2,'MERCHANT','TANKER',10);s.world.contacts=[far];
  const surfLim=bridgeVisualLimitNm(s,far);const o1=bridgeObservation(s,far,false),o2=bridgeObservation(s,far,false);const tr=e.markBridgeContact(null,false);
  s.playerSub.depthFeet=55;s.playerSub.mode='PERISCOPE_DEPTH';const perLim=bridgeVisualLimitNm(s,far);
  out.range={surfLim,perLim,marked:!!tr,type:tr?.typeEstimate,source:tr?.source,observer:tr?.observer,fixErrorNm:tr?distNm(tr.plotPosition,far.position):null,deterministic:JSON.stringify(o1)===JSON.stringify(o2)};}

 // Binocular mode is a narrower but better observation; TARGET feeds the
 // existing selected-track/TDC state rather than creating a parallel target system.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.world.environment.visibilityNm=12;s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.tactical.activeStation='BRIDGE';s.tactical.bridgeBearing=90;
  const close=mk(s,'M-CLOSE',90,4,'MERCHANT','FREIGHTER',8),off=mk(s,'M-OFF',97,4,'MERCHANT','TRANSPORT',8);s.world.contacts=[close,off];
  s.tactical.bridgeBinoculars=false;const wide=e.bridgeCenterContact('M-OFF')?.id||null;
  s.tactical.bridgeBinoculars=true;const explicit=e.bridgeCenterContact('M-OFF')?.id||null; // explicit target may still be selected; centre gating is below
  const centreOff=(()=>{s.world.contacts=[off];return e.bridgeCenterContact()?.id||null})();
  s.world.contacts=[close,off];const tr=e.markBridgeContact('M-CLOSE',true);
  out.target={wide,explicit,centreOff,track:tr?.id,selected:s.tactical.selectedTrackId,tdc:s.tdc.targetId,type:tr?.typeEstimate,confidence:tr?.confidence,bino:s.tactical.bridgeBinoculars};}

 // Direct GUN transition and automatic bridge clearing on a dive order.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.tactical.activeStation='BRIDGE';const ammo=s.weapons.deckGun.ammo;e.applyCmd({type:'SET_ACTIVE_STATION',station:'DECK_GUN'});out.gun={station:s.tactical.activeStation,manned:s.weapons.deckGun.manned,ammo:s.weapons.deckGun.ammo,unchanged:s.weapons.deckGun.ammo===ammo};
  e.applyCmd({type:'SET_ACTIVE_STATION',station:'BRIDGE'});e.applyCmd({type:'DIVE'});out.dive={station:s.tactical.activeStation,orderedDepth:s.playerSub.orderedDepthFeet,mode:s.playerSub.mode,bino:s.tactical.bridgeBinoculars};}

 // Enemy side: at the same 4 nm range the surfaced hull is lookout-detectable;
 // the periscope is below that visual reach. Force the stochastic roll to 0
 // only for this reach test so the geometry/reach distinction is deterministic.
 {const run=depth=>{const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.world.environment.daylight=1;s.world.environment.visibilityNm=12;s.world.environment.seaState=0;s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=depth;s.playerSub.mode=depth<12?'SURFACED':'PERISCOPE_DEPTH';s.playerSub.propulsion.speedKnots=2;const esc=mk(s,'E-LOOK',0,4,'ESCORT','DESTROYER',12);s.world.contacts=[esc];Math.random=()=>0;e.updateLookouts(1);return{sighted:!!s.world.enemy.visualOnSub,alert:s.world.enemy.alertState,solution:s.world.enemy.solution?.source||null};};out.visibility={surface:run(0),periscope:run(55)};}
 return out;
})()`,ctx);

assert('BRIDGE is refused below the surface',result.submerged.station==='MAP'&&result.submerged.toasts.length===1,result.submerged);
assert('surface bridge station initializes on own heading and accepts look/binocular commands',result.surface.station==='BRIDGE'&&result.surface.bearing===140&&result.surface.bino===true,result.surface);
assert('old save tactical state migrates bridge fields without crash',Number.isFinite(result.migration.bearing)&&result.migration.bino===false&&result.migration.station==='BRIDGE',result.migration);
assert('surface watch visual/smoke reach exceeds periscope reach',result.range.surfLim>11.2&&result.range.perLim<10,result.range);
assert('distant bridge mark creates noisy VISUAL plot without magical identity',result.range.marked&&result.range.type==='SURFACE SHIP'&&result.range.source==='VISUAL'&&result.range.observer==='BRIDGE'&&result.range.fixErrorNm>0,result.range);
assert('bridge observation error is stable for the same seed/time bucket',result.range.deterministic,result.range);
assert('binocular TARGET uses existing selected-track and TDC state',result.target.track==='M-CLOSE'&&result.target.selected==='M-CLOSE'&&result.target.tdc==='M-CLOSE'&&result.target.confidence>=.68,result.target);
assert('binocular centre field is narrower than wide watch',result.target.wide==='M-OFF'&&result.target.centreOff===null,result.target);
assert('bridge GUN action enters existing auto-manned deck-gun station without spending ammo',result.gun.station==='DECK_GUN'&&result.gun.manned&&result.gun.unchanged,result.gun);
assert('dive order is accepted while bridge watch remains topside for the clear-deck sequence',result.dive.station==='BRIDGE'&&result.dive.orderedDepth>=100&&result.dive.mode==='DIVING',result.dive);
assert('surfaced submarine is materially more visually exposed than periscope depth',result.visibility.surface.sighted===true&&result.visibility.periscope.sighted===false,result.visibility);

// Renderer + low-end resource contract.
const CanvasView=vm.runInContext('CanvasView',ctx),CanvasViewBridge=vm.runInContext('CanvasViewBridge',ctx);
const canvas={width:0,height:0,clientWidth:390,clientHeight:844,getContext:()=>fakeCtx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}),addEventListener:nop,setPointerCapture:nop};
const cv=new CanvasView(canvas);
assert('4 GB / 4-core class is flagged low-spec',cv.lowSpec===true,{lowSpec:cv.lowSpec,dpr:cv.dpr});
assert('4 GB canvas backing DPR is capped at 1.5 and under 2.2 MP',cv.dpr<=1.5&&canvas.width*canvas.height<=2200000,{dpr:cv.dpr,pixels:canvas.width*canvas.height,backing:[canvas.width,canvas.height]});

const sRender=vm.runInContext(`(()=>{const s=createState('Java Sea');s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.playerSub.heading=90;s.tactical.activeStation='BRIDGE';s.tactical.bridgeBearing=90;s.world.contacts=[];return s})()`,ctx);
let qSeen=null,hudFov=null,sceneCalls=[];
const proto=CanvasViewBridge.prototype;
const fakeView={portrait:false,lowSpec:true,quality:1,k:1,setupBridgeCam:function(state,fov,w,h){return proto.setupBridgeCam.call(this,state,fov,w,h)},
 drawSky3D(){qSeen=this.quality;sceneCalls.push('sky')},drawSea3D(){sceneCalls.push('sea')},drawTerrain3D(){sceneCalls.push('terrain')},drawDistantBridgeSmoke(){sceneCalls.push('smoke')},drawOwnWake(){sceneCalls.push('wake')},drawWakes3D(){},drawFleet3D(){sceneCalls.push('fleet')},drawExplosions3D(){},drawSplashes3D(){},drawRain(){},drawScopeSpray(){},drawNightOverlay(){sceneCalls.push('night')},drawBridgeForedeck(){sceneCalls.push('foredeck')},drawBridgeHud(_c,_w,_h,_s,cam){hudFov=cam.fovDeg}};
proto.drawBridge.call(fakeView,fakeCtx,844,390,sRender);
assert('wide bridge render path uses 82-degree full-screen camera and shared world scene',hudFov===82&&sceneCalls.includes('sky')&&sceneCalls.includes('sea')&&sceneCalls.includes('fleet')&&sceneCalls.includes('foredeck'),{fov:hudFov,sceneCalls});
assert('low-spec bridge effects are capped without permanently lowering adaptive quality',qSeen<=.58&&fakeView.quality===1,{during:qSeen,after:fakeView.quality});
sRender.tactical.bridgeBinoculars=true;hudFov=null;proto.drawBridge.call(fakeView,fakeCtx,844,390,sRender);
assert('binocular mode narrows bridge FOV to 24 degrees',hudFov===24,{fov:hudFov});

// Smoke cues are actually rendered beyond nominal hull-visibility range.
sRender.tactical.bridgeBinoculars=false;sRender.world.environment.visibilityNm=10;sRender.world.environment.daylight=1;sRender.world.contacts=[{id:'M-SMOKE-R',type:'TANKER',displayType:'TANKER',position:{xNm:sRender.playerSub.position.xNm+11.2,yNm:sRender.playerSub.position.yNm},heading:270,speedKnots:10,sunk:false,stationary:false}];
let smokePuffs=0;const smokeCtx={beginPath:nop,fill:nop,set fillStyle(v){},arc(){smokePuffs++}};
proto.drawDistantBridgeSmoke.call({quality:.58,lowSpec:true,proj:()=>({x:420,y:180,d:11.2*1852})},smokeCtx,{bearingDeg:90,fovDeg:82},sRender,1,100);
assert('moving tanker smoke is rendered beyond 10 nm nominal visibility',smokePuffs===2,{rangeNm:11.2,nominalVisNm:10,puffs:smokePuffs});

let route=0;cv.drawBridge=()=>{route++};cv.drawHitFlash=nop;cv.drawAirAlarm=nop;sRender.tactical.bridgeBinoculars=false;cv.render(sRender);
assert('CanvasView runtime routes BRIDGE station to bridge renderer',route===1,{route});

const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'css/app.css'),'utf8'),touch=fs.readFileSync(path.join(root,'js/controllers/touch-controller.js'),'utf8'),desk=fs.readFileSync(path.join(root,'js/controllers/bridge-controller.js'),'utf8');
assert('BRIDGE station and all four requested controls exist in UI',[`data-sta="BRIDGE"`,`id="stationBridge"`,`id="bridgeBino"`,`id="bridgeMark"`,`id="bridgeTarget"`,`id="bridgeGun"`].every(x=>html.includes(x)),{bridge:true});
assert('touch/desktop controllers wire drag, binoculars, mark, target and gun',touch.includes("mode==='bridge'")&&touch.includes('BRIDGE_MARK_CONTACT')&&touch.includes('BRIDGE_TARGET_CONTACT')&&touch.includes('TOGGLE_BRIDGE_BINOCULARS')&&touch.includes("station:'DECK_GUN'")&&desk.includes("k==='5'"),{touch:true,desktop:true});
assert('portrait controls stay horizontal/bottom and landscape becomes compact vertical strip',css.includes('html[data-lay="touch"] #bridgeControls{left:8px;right:8px;bottom:8px')&&css.includes('flex-direction:column;width:82px'),{responsive:true});
const bridgeSource=fs.readFileSync(path.join(root,'js/rendering/bridge-3d.js'),'utf8');
assert('bridge view has no circular periscope clipping mask',!bridgeSource.match(/ctx\.clip\s*\(/),{unmasked:true});
assert('bridge renderer does not allocate a second canvas/WebGL/texture engine',!bridgeSource.match(/createElement\s*\(\s*['"]canvas|WebGL|OffscreenCanvas|new Image\s*\(/),{sharedRenderer:true});

if(failed){console.error(`PATCH 2 SURFACE WATCH CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 2 SURFACE WATCH CONTRACT: PASS');
