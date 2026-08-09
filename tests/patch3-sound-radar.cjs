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

let seed=0x31415926,perf=0;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const store=new Map(),audioCalls={monitor:0,stop:0,qc:0};function nop(){}
const fakeCtx={setTransform:nop,setLineDash:nop,fillRect:nop,strokeRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,fill:nop,arc:nop,arcTo:nop,closePath:nop,quadraticCurveTo:nop,bezierCurveTo:nop,fillText:nop,save:nop,restore:nop,clip:nop,translate:nop,rotate:nop,scale:nop,drawImage:nop,clearRect:nop,measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:nop}),createRadialGradient:()=>({addColorStop:nop}),textAlign:'left',textBaseline:'alphabetic',globalAlpha:1,filter:'none'};
const fakeCanvas={width:0,height:0,clientWidth:390,clientHeight:844,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:390,height:844}),addEventListener:nop};
const base={console,Math:math,Date,JSON,__audioCalls:audioCalls,__fakeCtx:fakeCtx,performance:{now:()=>{perf+=16;return perf;}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:{playSonarPing(){},playAlarm(){},playDepthCharge(){},playHit(){},playMissionComplete(){},playDive(){},playSurface(){},playCrashDive(){},playWaypoint(){},setAmbient(){},setHydrophoneMonitor(){audioCalls.monitor++},stopHydrophoneMonitor(){audioCalls.stop++},playOwnSonarPing(){audioCalls.qc++}},
 Toast:{auto:nop,ok:nop,warn:nop,bad:nop,show:nop,stop:nop},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:4,hardwareConcurrency:4},
 window:{devicePixelRatio:3,innerWidth:390,innerHeight:844,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},tutorial:{update(){}},
 DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js',
'js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const result=vm.runInContext(`(()=>{
 const out={};
 const mk=(s,id,bearing,rng,type='MERCHANT',speed=10)=>{const r=degToRad(bearing);return{id,name:id,type,displayType:type==='ESCORT'?'DESTROYER':'FREIGHTER',lengthYards:type==='ESCORT'?350:430,beamYards:55,acousticBase:type==='ESCORT'?.42:.30,position:{xNm:s.playerSub.position.xNm+Math.sin(r)*rng,yNm:s.playerSub.position.yNm-Math.cos(r)*rng},heading:250,speedKnots:speed,desiredHeading:250,desiredSpeed:speed,sunk:false,stationary:false,damage:0};};

 // Historical equipment progression is broad by date, not per-hull bureaucracy.
 out.fit={early:radarFitForDate('1942-02-01'),june42:radarFitForDate('1942-06-15'),march43:radarFitForDate('1943-03-15'),late44:radarFitForDate('1944-08-01')};

 // The automatic sound operator works while the player is somewhere else and
 // only writes the patrol log/transient callout -- never a toast.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.tactical.activeStation='MAP';s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=150;s.playerSub.propulsion.speedKnots=2;s.world.contacts=[mk(s,'E-AUTO',318,3.2,'ESCORT',18)];s.world.sound.lastOperatorAt=-999;s.time.elapsedSeconds=100;const l=s.log.length,t=(s.ui?.toasts||[]).length;e._soundOperatorReport();out.operator={logDelta:s.log.length-l,toastDelta:(s.ui?.toasts||[]).length-t,report:s.world.sound.lastOperatorReport?.text||'',station:s.tactical.activeStation};}

 // Directionality and own screw noise. Same target; only train/speed change.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=100;s.world.contacts=[mk(s,'M-LISTEN',40,4,'MERCHANT',9)];s.playerSub.propulsion.speedKnots=2;const q2=soundOwnNoiseFactor(s),center=soundSignalAt(s,40).strength,off20=soundSignalAt(s,60).strength,off60=soundSignalAt(s,100).strength;s.playerSub.propulsion.speedKnots=17;const q17=soundOwnNoiseFactor(s),fast=soundSignalAt(s,40).strength;out.listen={q2,q17,center,off20,off60,fast};}

 // Three ownship bearings over several minutes triangulate onto the existing map track.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.depthFeet=120;s.playerSub.propulsion.speedKnots=1.5;s.world.environment.seaState=.1;const c=mk(s,'M-TRI',45,6,'MERCHANT',8);c.position={xNm:5,yNm:-4};s.world.contacts=[c];s.world.contactTracks[c.id]={id:c.id,typeEstimate:'UNKNOWN',bearing:10,rangeEstimateNm:12,courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:.15,source:'HYDROPHONE',lastUpdated:0,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards,plotPosition:{xNm:10,yNm:8},lastFixPosition:{xNm:10,yNm:8},lastFixTime:0};
  const before=distNm(s.world.contactTracks[c.id].plotPosition,c.position),marks=[];const own=[{xNm:0,yNm:0},{xNm:1.2,yNm:.1},{xNm:2.4,yNm:.35}];for(let i=0;i<3;i++){s.playerSub.position={...own[i]};s.time.elapsedSeconds=i*120;s.tactical.soundBearing=bearingBetween(s.playerSub.position,c.position);marks.push(e.markSoundBearing()?.source||null);}const tr=s.world.contactTracks[c.id];out.tri={before,after:distNm(tr.plotPosition,c.position),source:tr.source,marks:(s.world.sound.bearingMarks[c.id]||[]).length,uncertainty:tr.soundUncertaintyNm};}

 // One QC echo: accurate range and an enemy datum because the transmission is loud.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=90;s.playerSub.propulsion.speedKnots=1;s.time.elapsedSeconds=20;const c=mk(s,'E-QC',72,3.4,'ESCORT',15);s.world.contacts=[c];s.tactical.soundBearing=bearingBetween(s.playerSub.position,c.position);const trueR=distNm(s.playerSub.position,c.position),toast0=(s.ui?.toasts||[]).length,tr=e.echoRange();out.qc={trueR,reported:tr?.rangeEstimateNm,errorPct:tr?Math.abs(tr.rangeEstimateNm-trueR)/trueR:null,source:tr?.source,enemy:s.world.enemy.alertState,datum:{...s.world.enemy.lastKnownSubPosition},qcAudio:__audioCalls.qc,toastDelta:(s.ui?.toasts||[]).length-toast0};}

 // SJ sees a surface ship through bad visual weather, but not before the fit date.
 {const run=date=>{const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.campaign.startDate=date;s.time.campaignDate=date;s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.world.environment.visibilityNm=1.5;s.world.environment.weather='RAIN';s.world.contacts=[mk(s,'M-SJ',90,4.8,'MERCHANT',10)];s.world.radar=null;e.ensureSoundRadarState();e._updateSJRadar(2.1);return{fit:s.world.radar.fitLabel,available:s.world.radar.sjAvailable,tracks:Object.keys(s.world.radar.sjTracks||{}).length,source:s.world.contactTracks['M-SJ']?.source||null,type:s.world.contactTracks['M-SJ']?.typeEstimate||null,active:s.world.radar.active};};out.radar={june42:run('1942-06-15'),march43:run('1943-03-15')};}

 // Late-war extensible SJ remains usable at shallow radar depth, early SJ does not.
 {const check=date=>{const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.campaign.startDate=date;s.playerSub.depthFeet=40;s.playerSub.mode='SUBMERGED';s.world.contacts=[];s.world.radar=null;e.ensureSoundRadarState();e._updateSJRadar(2.1);return{limit:s.world.radar.sjRadarDepthFt,active:s.world.radar.active};};out.depthFit={early:check('1943-03-15'),late:check('1944-08-01')};}

 // Station command path and passive audio monitor are optional; radar is a page, not station.
 {const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());s.campaign.startDate='1943-08-17';s.playerSub.depthFeet=120;s.playerSub.position={xNm:0,yNm:0};s.world.contacts=[mk(s,'M-UI',20,3,'MERCHANT',9)];e.applyCmd({type:'SET_ACTIVE_STATION',station:'SOUND'});const b0=s.tactical.soundBearing;e.applyCmd({type:'ROTATE_SOUND',deltaDeg:20});e.updateSoundRadar(.3);const mon=__audioCalls.monitor;e.applyCmd({type:'TOGGLE_SOUND_DISPLAY'});e.updateSoundRadar(.3);out.station={station:s.tactical.activeStation,b0,b1:s.tactical.soundBearing,display:s.tactical.soundDisplay,monitorCalls:mon,stopCalls:__audioCalls.stop};}

 // Renderer uses the one existing canvas and both pages draw without allocation/errors.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.campaign.startDate='1943-08-17';s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.world.contacts=[mk(s,'M-DRAW',30,3,'MERCHANT',9)];e.ensureSoundRadarState();e._updateSJRadar(2.1);const cv=new CanvasView({width:0,height:0,clientWidth:390,clientHeight:844,getContext:()=>__fakeCtx,getBoundingClientRect:()=>({width:390,height:844}),addEventListener:()=>{}});s.tactical.activeStation='SOUND';s.tactical.soundDisplay='PASSIVE';cv.render(s);s.tactical.soundDisplay='RADAR';cv.render(s);out.render={lowSpec:cv.lowSpec,dpr:cv.dpr,pixels:cv.canvas.width*cv.canvas.height,quality:cv.quality};}
 return out;
})()`,ctx);

assert('radar fit follows broad wartime progression',!result.fit.early.sd&&!result.fit.early.sj&&result.fit.june42.sd&&!result.fit.june42.sj&&result.fit.march43.sd&&result.fit.march43.sj,result.fit);
assert('late-war SJ radar-depth allowance is deeper',result.fit.late44.sjRadarDepthFt>result.fit.march43.sjRadarDepthFt,result.fit);
assert('automatic SOUND report works off-station without toast interruption',result.operator.logDelta===1&&result.operator.toastDelta===0&&/^SOUND — screws bearing/.test(result.operator.report)&&result.operator.station==='MAP',result.operator);
assert('passive hydrophone signal peaks on bearing',result.listen.center>result.listen.off20*2&&result.listen.off20>result.listen.off60,result.listen);
assert('own high speed materially masks passive listening',result.listen.q2>result.listen.q17*4&&result.listen.center>result.listen.fast*4,result.listen);
assert('three marked bearings materially improve the existing plot',result.tri.marks===3&&result.tri.source==='SOUND TRIANGULATION'&&result.tri.after<result.tri.before*.35,result.tri);
assert('QC echo gives a good range and exposes ownship to enemy',result.qc.source==='QC ECHO'&&result.qc.errorPct<.03&&['SEARCHING','ATTACKING'].includes(result.qc.enemy)&&result.qc.qcAudio>=1&&result.qc.toastDelta===1,result.qc);
assert('SJ is unavailable June 1942 but works in rain/night-independent surface search by 1943',result.radar.june42.available===false&&result.radar.june42.tracks===0&&result.radar.march43.available===true&&result.radar.march43.active===true&&result.radar.march43.tracks===1&&result.radar.march43.source==='SJ RADAR',result.radar);
assert('SJ does not magically identify ship class',result.radar.march43.type==='SURFACE SHIP',result.radar.march43);
assert('late-war SJ can work at shallow radar depth while early fit cannot',result.depthFit.early.limit===12&&result.depthFit.early.active===false&&result.depthFit.late.limit===48&&result.depthFit.late.active===true,result.depthFit);
assert('SOUND station supports fast training and radar page without requiring station for auto operation',result.station.station==='SOUND'&&Math.abs(result.station.b1-result.station.b0-20)<1e-9&&result.station.display==='RADAR'&&result.station.monitorCalls>=1&&result.station.stopCalls>=1,result.station);
assert('SOUND renderer stays on existing low-spec canvas budget',result.render.lowSpec===true&&result.render.dpr<=1.5&&result.render.pixels<=2200000,result.render);

const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),soundSrc=fs.readFileSync(path.join(root,'js/simulation/sound-radar.js'),'utf8'),renderSrc=fs.readFileSync(path.join(root,'js/rendering/sound-room.js'),'utf8');
assert('SOUND is a station but RADAR is only an instrument page',html.includes('data-sta="SOUND"')&&html.includes('id="stationSound"')&&!html.includes('data-sta="RADAR"')&&!html.includes('id="stationRadar"'),{});
assert('Patch 3 adds no WebGL/offscreen/texture render stack',!/WebGL|OffscreenCanvas|createElement\(['"]canvas|new Image\s*\(/.test(soundSrc+'\n'+renderSrc),{});
assert('sensor work is explicitly throttled',/S\._tick>=\.25/.test(soundSrc)&&/sjSweepSec:2\.0/.test(soundSrc),{});

if(failed){console.error(`PATCH 3 SOUND/RADAR CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 3 SOUND/RADAR CONTRACT: PASS');
