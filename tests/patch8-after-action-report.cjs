#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
let seed=0x88aa4411;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);function nop(){}
const store=new Map(),opened=[];const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:fn=>{if(typeof fn==='function')fn();return 0},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:844,innerHeight:390,
 tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}},aarController:{open:(r,o)=>opened.push({r:JSON.parse(JSON.stringify(r)),o})}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());e.startNewPatrol('Solomon Sea',{missionType:'CONVOY_INTERDICTION',startDate:'1943-08-24'});
 // Controlled observed merchant: truth and player plot intentionally differ.
 const c=s.world.contacts.find(x=>x.type!=='ESCORT')||s.world.contacts[0];c.position={xNm:4,yNm:-2};c.heading=70;c.speedKnots=9;
 s.world.contactTracks[c.id]={id:c.id,confidence:.78,positionConfidence:.58,source:'HYDROPHONE',lastSensorSource:'HYDROPHONE',plotPosition:{xNm:3.5,yNm:-1.6},lastFixPosition:{xNm:3.5,yNm:-1.6},courseEstimate:65,speedEstimateKnots:8,typeEstimate:'SURFACE SHIP',visualHullConfirmed:false};
 // Route and contact samples over a minute.
 for(let i=0;i<65;i++){s.playerSub.position.xNm+=.001;s.time.elapsedSeconds+=1;s.campaign.patrolDuration+=1;e.updateAfterActionRecorder(1);}
 e.captainLog('CONVOY_SIGHTED','Enemy convoy sighted.',{contactId:c.id},'convoy-sighted');
 // Real torpedo launch is captured as a track object.
 s.weapons.tubes[0].status='READY';s.weapons.tubes[0].flooded=true;s.tdc.targetId=c.id;s.tdc.autoTrack=true;s.tdc.gyroAngle=0;s.tdc.solutionQuality=.9;s.tdc.rangeNm=1;s.tdc.targetSpeedKnots=9;s.tdc.targetCourse=70;s.tdc.bearing=80;
 e.fireTorpedo(1);const torp=s.weapons.activeTorpedoes[0];if(torp){torp.position={xNm:3.9,yNm:-1.9};e.aarTorpedoFinish(torp,'HIT',c.id);}
 // One depth-charge pattern and one material damage event.
 const esc=s.world.contacts.find(x=>x.type==='ESCORT');if(esc){esc.dcRemaining=28;esc.position={xNm:s.playerSub.position.xNm+.2,yNm:s.playerSub.position.yNm};esc.heading=180;e.dropDC(esc,s.playerSub,{...s.playerSub.position});}
 e.applyShock(7);
 // One aircraft attack that leaves without being shot down counts as evaded.
 s.world.aircraft=[{id:'AIR-T',name:'Aichi E13A',state:'ATTACKING',position:{xNm:s.playerSub.position.xNm+.5,yNm:s.playerSub.position.yNm},seenBySub:true,shotDown:false}];e.updateAfterActionRecorder(1);s.world.aircraft=[];e.updateAfterActionRecorder(1);
 const pre=e.buildAfterActionReplay();
 // Complete and persist. The UI controller spy must receive the immutable record.
 s.campaign.score=250;s.playerSub.damage.hullIntegrity=71;e.completeMission('Tulagi');
 const car=SaveSystem.getCareer(),rec=car.patrolHistory[0];
 const persisted=JSON.parse(JSON.stringify(rec.replay));s.campaign.afterAction.route.push({t:99999,xNm:999,yNm:999});const detached=SaveSystem.getCareer().patrolHistory[0].replay.route.some(p=>p.xNm===999);
 const og=pre.observedTracks.find(x=>x.id===c.id),tg=pre.truthTracks.find(x=>x.id===c.id),op=og?.points?.at(-1),tp=tg?.points?.at(-1);
 return{pre:{route:pre.route.length,obs:pre.observedTracks.reduce((n,g)=>n+(g.points?.length||0),0),truth:pre.truthTracks.reduce((n,g)=>n+(g.points?.length||0),0),events:pre.events.map(x=>x.type),torps:pre.torpedoes,aircraftEvaded:pre.aircraftEvaded,obsPos:op&&{xNm:op[1],yNm:op[2]},truthPos:tp&&{xNm:tp[1],yNm:tp[2]}},
   rec:{aircraftEvaded:rec.aircraftEvaded,replay:rec.replay&&{route:rec.replay.route.length,obs:rec.replay.observedTracks.reduce((n,g)=>n+(g.points?.length||0),0),truth:rec.replay.truthTracks.reduce((n,g)=>n+(g.points?.length||0),0),events:rec.replay.events.length,torps:rec.replay.torpedoes.length}},detached};
})()`,ctx);
// opened array lives outside VM; read it directly below.
assert('recorder samples the own route at low frequency rather than per-frame',result.pre.route>=4&&result.pre.route<=7,result.pre.route);
assert('player-known plot and intelligence truth are recorded separately',result.pre.obs>0&&result.pre.truth>0&&result.pre.obsPos&&result.pre.truthPos&&Math.hypot(result.pre.obsPos.xNm-result.pre.truthPos.xNm,result.pre.obsPos.yNm-result.pre.truthPos.yNm)>.2,{observed:result.pre.obsPos,truth:result.pre.truthPos});
assert('replay records attack, depth-charge and damage events',result.pre.events.includes('TORPEDO_ATTACK')&&result.pre.events.includes('DEPTH_CHARGE_ATTACK')&&result.pre.events.includes('DAMAGE')&&result.pre.events.includes('CONVOY_SIGHTED'),result.pre.events);
assert('torpedo replay stores launch and outcome without running a replay simulation',result.pre.torps.length===1&&result.pre.torps[0].status==='HIT'&&result.pre.torps[0].start&&result.pre.torps[0].end,result.pre.torps[0]);
assert('aircraft that attacked and left alive is counted as evaded',result.pre.aircraftEvaded===1,result.pre.aircraftEvaded);
assert('completed patrol persists replay and aircraft-evaded statistic',result.rec.aircraftEvaded===1&&result.rec.replay&&result.rec.replay.route>0&&result.rec.replay.events>0&&result.rec.replay.torps===1,result.rec);
assert('persisted replay is immutable after active patrol-state mutation',result.detached===false,{detached:result.detached});
assert('PATROL COMPLETE opens the AAR controller before any menu flow',opened.length===1&&opened[0].o?.completed===true&&opened[0].r?.replay?.route?.length>0,{opened:opened.length,completed:opened[0]?.o?.completed});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ui=fs.readFileSync(path.join(root,'js/ui/after-action-report.js'),'utf8'),sim=fs.readFileSync(path.join(root,'js/simulation/after-action-report.js'),'utf8');
assert('AAR overlay exposes timeline, replay canvas and intelligence-picture toggle',/aarCanvas/.test(html)&&/aarTimeline/.test(html)&&/SHOW INTELLIGENCE PICTURE/.test(html),{});
assert('AAR replay exposes auto camera, manual zoom and fit controls',/aarAutoCam/.test(html)&&/aarZoomIn/.test(html)&&/aarZoomOut/.test(html)&&/aarFit/.test(html)&&ui.includes('autoCamera(')&&ui.includes('drawMomentCard('),{});
assert('AAR key moments get event holds and procedural picture cards without external image assets',ui.includes('_holdTicksFor')&&ui.includes('drawMomentPicture')&&ui.includes('TORPEDO_HIT')&&ui.includes('SHIP_SUNK'),{});
assert('AAR UI redraws on interaction and does not own a requestAnimationFrame loop',!/requestAnimationFrame/.test(ui)&&!/requestAnimationFrame/.test(sim),{});
assert('recorder is explicitly throttled and bounded',sim.includes('AAR_ROUTE_SAMPLE_SEC=15')&&sim.includes('AAR_TRACK_SAMPLE_SEC=30')&&sim.includes('AAR_MAX_POINTS_PER_TRACK=480'),{});
if(failed){console.error(`PATCH 8 AFTER ACTION REPORT CONTRACT: FAIL (${failed})`);process.exit(1)}console.log('PATCH 8 AFTER ACTION REPORT CONTRACT: PASS');
