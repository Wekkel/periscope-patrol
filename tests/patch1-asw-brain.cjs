#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
let seed=0x51a2b3c4;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const store=new Map(),toastCalls=[];let perf=0;
const base={console,Math:math,Date,JSON,performance:{now:()=>{perf+=16;return perf;}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:{pingCount:0,playSonarPing(){this.pingCount++},playAlarm(){},playDepthCharge(){},playHit(){},playMissionComplete(){},playDive(){},playSurface(){},playCrashDive(){},playWaypoint(){},setAmbient(){}},
 Toast:{auto(m){toastCalls.push(['auto',m])},ok(m){toastCalls.push(['ok',m])},warn(m){toastCalls.push(['warn',m])},bad(m){toastCalls.push(['bad',m])},show(){},stop(m){toastCalls.push(['stop',m])}},
 TOAST_RED:/DEPTH CHARGE|ATTACKING|AIR ALARM/i,showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:8},
 window:{devicePixelRatio:1,innerWidth:1280,innerHeight:800},document:{hidden:false,documentElement:{dataset:{lay:'desk'}},getElementById:()=>null},tutorial:{update(){}},
 DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/core/state.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js','js/rendering/world-geometry.js','js/core/game-loop.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const out={};
 const convoy=(key,n,date,difficulty)=>{const s=createState(key),e=new SimEngine(s,new CommandBus()),a={...PATROL_AREAS[key],convoyCountRange:[n,n]};return e.makeConvoy(a,{areaKey:key,startDate:date,difficulty});};
 out.counts={java42:convoy('Java Sea',2,'1942-06-01','EASY').filter(x=>x.type==='ESCORT').length,
   solomon43:convoy('Solomon Sea',4,'1943-08-17').filter(x=>x.type==='ESCORT').length,
   luzon43:convoy('Luzon Strait',4,'1943-08-17').filter(x=>x.type==='ESCORT').length,
   truk44hard:convoy('Truk Approaches',4,'1944-09-01','HARD').filter(x=>x.type==='ESCORT').length};
 const hard=convoy('Truk Approaches',4,'1944-09-01','HARD'),hardEsc=hard.filter(x=>x.type==='ESCORT');out.screenRoles=hardEsc.map(x=>x.screenRole);

 // Four-escort convoy screen for six minutes: roles should remain attached to
 // the moving convoy and the collision layer must see no phantom contacts.
 {const s=createState('Truk Approaches'),e=new SimEngine(s,new CommandBus());s.world.contacts=hard;s.playerSub.position={xNm:150,yNm:150};s.playerSub.depthFeet=180;s.playerSub.propulsion.speedKnots=0;s.world.collisionEvents=[];
  for(let t=0;t<360;t++){e.updateEnemyAI(1);e.captureCollisionFrame();e.updateWorld(1);e.updateVesselCollisions(1);s.time.elapsedSeconds+=1;}
  const errs=s.world.contacts.filter(x=>x.type==='ESCORT').map(x=>{const q=e.screenTarget(x);return q?distNm(x.position,q):99});
  out.screen={events:s.world.collisionEvents.length,roles:s.world.contacts.filter(x=>x.type==='ESCORT').map(x=>x.screenRole),maxStationError:Math.max(...errs),alert:s.world.enemy.alertState};}

 // Cooperative role assignment around one noisy datum.
 {const s=createState('Truk Approaches'),e=new SimEngine(s,new CommandBus());s.world.contacts=convoy('Truk Approaches',4,'1944-09-01','HARD');const E=s.world.contacts.filter(x=>x.type==='ESCORT');
  s.world.enemy.alertState='ATTACKING';s.world.enemy.contactHeld=true;s.world.enemy.solution={xNm:8,yNm:8,courseDeg:240,speedKn:5,depthFt:240,errNm:.035,ageSec:0};
  e.ensureASWState();e.assignASWRoles(E[2].id,true);const roles=Object.fromEntries(E.map(x=>[x.id,x.aswRole]));
  for(const x of E)e.updateEscortBeh(x,s.world.enemy,s.playerSub,s.world,E.indexOf(x),E.length,1);
  out.roles={roles,headings:E.map(x=>({id:x.id,role:x.aswRole,hdg:x.desiredHeading})),prosecutor:E.find(x=>x.aswRole==='PROSECUTOR')?.id,datum:{...e.ensureASWState().datum}};
  const p=E.find(x=>x.aswRole==='PROSECUTOR');out.anticipation={raw:{xNm:s.world.enemy.solution.xNm,yNm:s.world.enemy.solution.yNm},attackPoint:{...p.attackPoint},leadNm:distNm(s.world.enemy.solution,p.attackPoint)};

  // Same enemy plot, radically different hidden true submarine position: escort
  // helm orders must be identical while submerged/no visual contact.
  const snapshot=JSON.stringify(s),run=pos=>{const z=JSON.parse(snapshot);z.playerSub.position=pos;z.playerSub.depthFeet=240;z.world.enemy.visualOnSub=false;const q=new SimEngine(z,new CommandBus()),es=z.world.contacts.filter(x=>x.type==='ESCORT');for(const x of es)q.updateEscortBeh(x,z.world.enemy,z.playerSub,z.world,es.indexOf(x),es.length,1);return es.map(x=>+x.desiredHeading.toFixed(9));};
  out.truthIndependence={a:run({xNm:-30,yNm:40}),b:run({xNm:80,yNm:-90})};}

 // Search ping vs firm ranging ping cadence and information hierarchy.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.contacts=convoy('Solomon Sea',4,'1943-08-17');const esc=s.world.contacts.find(x=>x.type==='ESCORT');
  s.playerSub.position={xNm:100,yNm:100};s.playerSub.depthFeet=200;s.world.enemy.alertState='SEARCHING';s.world.enemy.searchCenter={xNm:0,yNm:0};e.ensureASWState().datum={xNm:0,yNm:0,errNm:.4,source:'CUE'};esc.pingTimer=0;
  const log0=s.log.length;e.updateSonar(.1);const searchPing=e.ensureASWState().pingEvents.at(-1),logAfterSearch=s.log.length;
  s.world.enemy.alertState='ATTACKING';s.world.enemy.contactHeld=true;s.world.enemy.solution={xNm:esc.position.xNm+.8,yNm:esc.position.yNm,courseDeg:180,speedKn:4,depthFt:180,errNm:.02,ageSec:0};esc.sonarContact=true;esc.sonarContactUntil=s.time.elapsedSeconds+20;esc.pingTimer=0;e.updateSonar(.1);const rangePing=e.ensureASWState().pingEvents.at(-1);
  // Make a clean reacquisition record without running another sensor roll.
  s.world.enemy.contactHeld=false;s.world.enemy.solution={xNm:2.5,yNm:-1.2,courseDeg:210,speedKn:5,depthFt:190,errNm:.03,ageSec:0};e.noteASWFix(esc,'ACTIVE',.9);s.world.enemy.contactHeld=true;
  out.sonar={searchInterval:searchPing.intervalSec,rangingInterval:rangePing.intervalSec,searchLogDelta:logAfterSearch-log0,pings:audio.pingCount,latestLog:s.log[0],datum:{...e.ensureASWState().datum},prosecutor:s.world.contacts.find(x=>x.aswRole==='PROSECUTOR')?.id};}

 // Lost contact expands a systematic box; containment/sweep targets differ.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.contacts=convoy('Solomon Sea',4,'1944-08-01','HARD');const E=s.world.contacts.filter(x=>x.type==='ESCORT');
  s.world.enemy.alertState='SEARCHING';s.world.enemy.contactHeld=false;const A=e.ensureASWState();A.datum={xNm:0,yNm:0,errNm:.08,source:'ACTIVE'};A.lastFixAt=0;A.searchStartedAt=0;A.searchRadiusNm=.55;A.estimatedCourseDeg=240;A.estimatedSpeedKn=5;s.time.elapsedSeconds=300;e.assignASWRoles(null,true);const before=A.searchRadiusNm;e.updateASWBrain(60);const after=A.searchRadiusNm,lead=e.aswDatum(120);
  const targets=E.map(x=>({id:x.id,role:x.aswRole,target:e.searchTarget(x)}));out.search={before,after,lead,leadNm:distNm({xNm:0,yNm:0},lead),targets};}

 // Only prosecutor may roll a DC pattern even if another escort is sitting on
 // the same datum.
 {const s=createState('Truk Approaches'),e=new SimEngine(s,new CommandBus());s.world.contacts=convoy('Truk Approaches',4,'1944-09-01','HARD');const E=s.world.contacts.filter(x=>x.type==='ESCORT'),datum={xNm:5,yNm:5};
  for(const x of E){x.position={...datum};x.heading=0;x.speedKnots=10;x.desiredSpeed=10;}s.playerSub.depthFeet=180;s.world.enemy.alertState='ATTACKING';s.world.enemy.contactHeld=true;s.world.enemy.solution={...datum,courseDeg:0,speedKn:0,depthFt:180,errNm:.02,ageSec:0};
  e.ensureASWState();e.assignASWRoles(E[0].id,true);const non=E.find(x=>x.aswRole!=='PROSECUTOR'&&x.aswRole!=='CONVOY_GUARD');e.updateEscortBeh(non,s.world.enemy,s.playerSub,s.world,E.indexOf(non),E.length,1);const afterNon=s.world.depthCharges.length;
  const pro=E.find(x=>x.aswRole==='PROSECUTOR');e.updateEscortBeh(pro,s.world.enemy,s.playerSub,s.world,E.indexOf(pro),E.length,1);out.dc={afterNon,afterPro:s.world.depthCharges.length,owners:[...new Set(s.world.depthCharges.map(x=>x.ownerId))],pattern:SONAR.patternSize,log:s.log[0]};}
 return out;
})()`,ctx);

assert('escort strength scales from 1 through 4',result.counts.java42===1&&result.counts.solomon43===2&&result.counts.luzon43===3&&result.counts.truk44hard===4,result.counts);
assert('four-escort screen has named relative roles',result.screenRoles.includes('FORWARD_SCREEN')&&result.screenRoles.includes('PORT_FLANK')&&result.screenRoles.includes('STARBOARD_FLANK')&&result.screenRoles.length===4,result.screenRoles);
assert('moving escort screen holds convoy-relative stations without phantom collision',result.screen.events===0&&result.screen.maxStationError<1.4&&result.screen.alert==='UNAWARE',result.screen);
const tactical=Object.values(result.roles.roles);
assert('contact creates cooperative prosecutor/containment/sweep/guard roles',tactical.filter(x=>x==='PROSECUTOR').length===1&&tactical.includes('CONTAINMENT')&&tactical.includes('SWEEP')&&tactical.includes('CONVOY_GUARD'),result.roles);
assert('escorts do not all steer straight at the same datum',new Set(result.roles.headings.map(x=>Math.round(x.hdg))).size>=3,result.roles.headings);
assert('prosecutor anticipates estimated submarine movement',result.anticipation.leadNm>.15,result.anticipation);
assert('escort helm orders are independent of hidden true submarine position',JSON.stringify(result.truthIndependence.a)===JSON.stringify(result.truthIndependence.b),result.truthIndependence);
assert('firm solution makes sonar ping/range cycle materially faster',result.sonar.searchInterval>=8.5&&result.sonar.rangingInterval<result.sonar.searchInterval&&result.sonar.rangingInterval<=7.5,result.sonar);
assert('routine search ping creates audio/state evidence but no patrol-log interruption',result.sonar.searchLogDelta===0&&result.sonar.pings>=2,result.sonar);
assert('reacquired firm contact shifts datum and promotes detecting escort to prosecutor',Math.abs(result.sonar.datum.xNm-2.5)<1e-9&&Math.abs(result.sonar.datum.yNm+1.2)<1e-9&&result.sonar.prosecutor,result.sonar);
assert('ESCORT HAS CONTACT is a critical log/UI event',result.sonar.latestLog?.level==='bad'&&/ESCORT HAS CONTACT/.test(result.sonar.latestLog.message),result.sonar.latestLog);
assert('lost-contact search box expands and dead-reckons likely escape',result.search.after>result.search.before&&result.search.leadNm>.15,result.search);
assert('only PROSECUTOR rolls depth charges',result.dc.afterNon===0&&result.dc.afterPro===result.dc.pattern&&result.dc.owners.length===1&&/DEPTH CHARGES/.test(result.dc.log.message),result.dc);

// UI policy regression: generic warn+SONAR toasts were intentionally removed.
const loopSource=fs.readFileSync(path.join(root,'js/core/game-loop.js'),'utf8'),toastSource=fs.readFileSync(path.join(root,'js/ui/toast.js'),'utf8');
assert('UI no longer promotes every sonar/ping log to a toast',!loopSource.includes("entry.level==='warn'&&m.includes('SONAR')")&&!/\|pinging\|active sonar/.test(toastSource),{genericSonarToast:loopSource.includes("m.includes('SONAR')")});

if(failed){console.error(`PATCH 1 ASW BRAIN CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 1 ASW BRAIN CONTRACT: PASS');
