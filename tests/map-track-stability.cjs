#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
function nop(){}
const math=Object.create(Math);math.random=()=>.3141592653;
const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){},clear(){}},audio:{playSonarPing(){},playAlarm(){},playDepthCharge(){},playHit(){},playMissionComplete(){},playDive(){},playSurface(){},playCrashDive(){},playWaypoint(){},playDeckGun(){},playOwnSonarPing(){},setHydrophoneMonitor(){},stopHydrophoneMonitor(){},setAmbient(){}},
 showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:1,innerWidth:844,innerHeight:390,addEventListener(){},visualViewport:null},document:{hidden:false,documentElement:{dataset:{}},createElement:()=>({style:{setProperty(){}}}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener(){}},tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const s=createState('Java Sea'),e=new SimEngine(s,new CommandBus());
 s.campaign.scenarioSeed=77123;s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=140;s.playerSub.propulsion.speedKnots=2;s.world.environment.seaState=.15;s.world.environment.visibilityNm=8;s.world.contactTracks={};
 const c={id:'M-DANCE',name:'Merchant',type:'MERCHANT',displayType:'FREIGHTER',lengthYards:440,beamYards:58,acousticBase:.30,position:{xNm:2.8,yNm:-1.7},heading:90,speedKnots:9,desiredHeading:90,desiredSpeed:9,sunk:false,stationary:false,damage:0};s.world.contacts=[c];
 let prevRaw=null,prevPlot=null,prevWorld={...c.position},maxRaw=0,maxPlot=0,maxWorld=0,bucketRaw=0,bucketPlot=0,atBucket=null;
 for(let i=0;i<=420;i++){
   const dt=.1;s.time.elapsedSeconds=i*dt;
   if(i){const r=degToRad(c.heading),run=knotsNmSec(c.speedKnots)*dt;c.position.xNm+=Math.sin(r)*run;c.position.yNm-=Math.cos(r)*run;}
   const q=e.calcAco(s.playerSub,c,distNm(s.playerSub.position,c.position),s.world.environment).score;
   const raw=passiveSoundObservation(s,c,q).position;e.updateDetection(dt);const plot={...s.world.contactTracks[c.id].plotPosition};
   if(prevRaw){const rw=distNm(prevWorld,c.position),rr=distNm(prevRaw,raw),rp=distNm(prevPlot,plot);maxWorld=Math.max(maxWorld,rw);maxRaw=Math.max(maxRaw,rr);maxPlot=Math.max(maxPlot,rp);if(i===200){bucketRaw=rr;bucketPlot=rp;atBucket={rawM:rr*1852,plotM:rp*1852,worldM:rw*1852};}}
   prevRaw={...raw};prevPlot={...plot};prevWorld={...c.position};
 }
 const hydro={maxRawM:maxRaw*1852,maxPlotM:maxPlot*1852,maxWorldM:maxWorld*1852,bucketRawM:bucketRaw*1852,bucketPlotM:bucketPlot*1852,atBucket,track:s.world.contactTracks[c.id]};
 // Fresh visual tracking must outrank an SJ sweep in the same moment.
 const v=createState('Solomon Sea'),ve=new SimEngine(v,new CommandBus());v.campaign.startDate='1943-08-17';v.playerSub.position={xNm:0,yNm:0};v.playerSub.depthFeet=0;v.playerSub.mode='SURFACED';v.world.environment.visibilityNm=12;v.world.environment.daylight=1;v.world.contactTracks={};const vc={...c,id:'M-VIS',position:{xNm:3,yNm:0},heading:20,speedKnots:8};v.world.contacts=[vc];v.time.elapsedSeconds=100;ve.updateDetection(.1);const before={...v.world.contactTracks[vc.id].plotPosition},beforeSource=v.world.contactTracks[vc.id].source;ve.ensureSoundRadarState();ve._updateSJRadar(2.1);const after={...v.world.contactTracks[vc.id].plotPosition},afterSource=v.world.contactTracks[vc.id].source;
 return{hydro,visualRadar:{beforeSource,afterSource,shiftM:distNm(before,after)*1852,posConf:v.world.contactTracks[vc.id].positionConfidence}};
})()`,ctx);
assert('raw hydrophone noise still changes materially at a 20-second bucket boundary',result.hydro.bucketRawM>100,result.hydro);
assert('MAP track no longer inherits the raw hundreds-of-metres hydrophone jump',result.hydro.bucketPlotM<5&&result.hydro.maxPlotM<5,result.hydro);
assert('real merchant motion remains sub-metre per 0.1 s at 9 knots',result.hydro.maxWorldM<.6,result.hydro);
assert('hydrophone bearing confidence no longer masquerades as precise positional confidence',result.hydro.track.positionConfidence<.5&&result.hydro.track.positionUncertaintyNm>.2,{positionConfidence:result.hydro.track.positionConfidence,uncertaintyNm:result.hydro.track.positionUncertaintyNm,source:result.hydro.track.source});
assert('fresh VISUAL position is not kicked sideways by the following SJ sweep',result.visualRadar.beforeSource==='VISUAL'&&result.visualRadar.afterSource==='VISUAL'&&result.visualRadar.shiftM<1,result.visualRadar);
if(failed){console.error(`MAP TRACK STABILITY CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('MAP TRACK STABILITY CONTRACT: PASS');
