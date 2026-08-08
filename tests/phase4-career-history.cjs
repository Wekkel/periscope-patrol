#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}

// Baseline contract: every runtime JS parses, and every script src used by index exists.
const jsFiles=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&jsFiles.push(p)}})(path.join(root,'js'));
for(const f of jsFiles){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}
pass('JavaScript syntaxcheck',{files:jsFiles.length});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const srcs=[...html.matchAll(/<script\s+src=["']([^"']+)["']/g)].map(m=>m[1]);
const missing=srcs.filter(s=>!fs.existsSync(path.join(root,s.replace(/^\.\//,''))));
assert('all index.html runtime script paths exist',missing.length===0,{scripts:srcs.length,missing});
assert('career-history runtime module is wired between damage and final physics',html.includes('./js/simulation/career-history.js')&&html.indexOf('./js/simulation/damage-control.js')<html.indexOf('./js/simulation/career-history.js')&&html.indexOf('./js/simulation/career-history.js')<html.indexOf('./js/simulation/physics-navigation.js'),{wired:html.includes('./js/simulation/career-history.js')});
assert('Career and Captain\'s Log UI are present',html.includes('data-stab="career"')&&html.includes('id="careerHistory"')&&html.includes('id="mCaptainLog"'),{careerTab:html.includes('data-stab="career"'),captainLog:html.includes('id="mCaptainLog"')});

const runtimeLoad=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js',
 'js/simulation/weapons/tdc-math.js','js/core/state.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js',
 'js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js',
 'js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js',
 'js/simulation/physics-navigation.js','js/rendering/world-geometry.js','js/core/game.js','js/data/historical-scenarios.js','js/ui/scenario-selector.js'];
function makeContext(sharedStore){
  const els=new Map();
  const mkClass=()=>({toggle(){},add(){},remove(){},contains(){return false}});
  const el=id=>{if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:mkClass(),addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,appendChild(){},remove(){},click(){}});return els.get(id)};
  const b={console,Math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    localStorage:{getItem:k=>sharedStore.has(String(k))?sharedStore.get(String(k)):null,setItem:(k,v)=>sharedStore.set(String(k),String(v)),removeItem:k=>sharedStore.delete(String(k)),clear:()=>sharedStore.clear()},
    audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},
    particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:8,clipboard:{writeText(){}}},
    alert(){},confirm(){return true},window:{devicePixelRatio:1,innerWidth:1280,innerHeight:800,addEventListener(){},removeEventListener(){}},
    document:{hidden:false,documentElement:{dataset:{lay:'desk'},style:{}},body:{appendChild(){}},getElementById:el,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el('__new'+Math.random())},
    innerWidth:1280,innerHeight:800};b.globalThis=b;
  const ctx=vm.createContext(b);for(const f of runtimeLoad)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
  return {ctx,els};
}
const store=new Map();const A=makeContext(store),ctx=A.ctx;

// 1) Legacy aggregate career migrates without inventing impossible patrol details.
store.set('ss2_career',JSON.stringify({totalScore:12345,patrols:4,tonnage:28750}));
const legacyCareer=vm.runInContext('SaveSystem.getCareer()',ctx);
assert('legacy aggregate career migrates to v2 without crash',legacyCareer.version===2&&legacyCareer.totalScore===12345&&legacyCareer.totalTonnage===28750&&legacyCareer.legacyPatrols===4,{version:legacyCareer.version,totalScore:legacyCareer.totalScore,totalTonnage:legacyCareer.totalTonnage,legacyPatrols:legacyCareer.legacyPatrols});
assert('legacy aggregate migration does not fabricate patrolHistory',legacyCareer.patrolHistory.length===0,{history:legacyCareer.patrolHistory.length,commendations:legacyCareer.commendations.map(x=>x.id)});
assert('legacy patrol count can preserve First War Patrol badge',legacyCareer.commendations.some(x=>x.id==='first-war-patrol'),legacyCareer.commendations.map(x=>x.id));

// 2) A pre-Phase-4 full state is upgraded on first engine touch.
const migration=vm.runInContext(`(()=>{const s=createState('Solomon Sea');for(const k of ['historyId','_careerStartDate','_historyRecorded','_historyRecordId','importantEvents','_captainEventSeq'])delete s.campaign[k];const e=new SimEngine(s,new CommandBus());e.update(0);return{historyId:s.campaign.historyId,start:s.campaign._careerStartDate,recorded:s.campaign._historyRecorded,events:s.campaign.importantEvents.length};})()`,ctx);
assert('pre-Phase-4 save state gains career fields without crash',/^legacy:/.test(migration.historyId)&&migration.start&&migration.recorded===false&&migration.events===0,migration);

// Fresh career for live patrol finalization tests.
store.delete('ss2_career');
const live=vm.runInContext(`(()=>{
 const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());
 // Controlled convoy: one merchant to sink and three escorts to damage but leave afloat.
 const merchant={id:'M1',name:'Tanker Kiyo Maru',type:'TANKER',displayType:'TANKER',position:{xNm:1,yNm:0},heading:90,speedKnots:8,desiredSpeed:8,tonsFactor:6200,convoyId:'MAIN',gunDamage:1.15,sunk:false};
 const escorts=[1,2,3].map(i=>({id:'E'+i,name:'Escort '+i,type:'ESCORT',displayType:'ESCORT',position:{xNm:1+i*.1,yNm:.2},heading:90,speedKnots:12,desiredSpeed:12,tonsFactor:1200,convoyId:'MAIN',gunDamage:0,sunk:false}));
 s.world.contacts=[merchant,...escorts];s.world.contactTracks={M1:{id:'M1',source:'VISUAL',confidence:.8}};
 e.checkMissionObjectives();
 // One real torpedo leaves a real READY tube. We do not invent a debrief counter.
 s.weapons.tubes[0].status='READY';s.weapons.tubes[0].flooded=true;s.tdc.targetId='M1';s.tdc.gyroAngle=0;s.tdc.solutionQuality=.9;s.tdc.rangeNm=1;s.tdc.targetSpeedKnots=8;s.tdc.targetCourse=90;s.tdc.bearing=90;
 e.fireTorpedo(1);
 // Four real deck-gun firings produce G.shots=4 and consume four rounds.
 s.weapons.deckGun.manned=true;for(let i=0;i<4;i++){s.time.elapsedSeconds=10+i*2;e.fireDeckGun();}
 // Four actual gun-hit registrations produce G.hits=4; the pre-damaged tanker sinks on hit #1.
 const hit={along:0,lenNm:.05,lateral:0};e.damageShipByDeckGun(merchant,hit);for(const x of escorts)e.damageShipByDeckGun(x,hit);
 const countersBefore={shots:s.weapons.deckGun.shots,hits:s.weapons.deckGun.hits,ammo:s.weapons.deckGun.ammo,nextTorpedoId:s.weapons.nextTorpedoId,torps:s.weapons.activeTorpedoes.length};
 s.campaign.patrolDuration=3600;s.playerSub.damage.hullIntegrity=74;s.campaign.score+=321;
 e.completeMission('Tulagi');
 let car=SaveSystem.getCareer(),rec=car.patrolHistory[0];
 const afterFirst={history:car.patrolHistory.length,record:JSON.parse(JSON.stringify(rec)),career:JSON.parse(JSON.stringify(car))};
 // Re-finalizing the same patrol must return the same row and never append another one.
 e.finalizePatrol('COMPLETED',{portName:'Tulagi'});car=SaveSystem.getCareer();
 const afterDuplicate={history:car.patrolHistory.length,totalTonnage:car.totalTonnage,totalShips:car.totalShips};
 // Mutate active state after finalization: persisted history must not follow it.
 s.campaign.importantEvents.push({type:'FAKE_AFTER_FINALIZE',text:'must not leak'});s.weapons.deckGun.shots=99;s.campaign.tonnageSunk=999999;
 const afterMutation=SaveSystem.getCareer().patrolHistory[0];
 // Starting the next patrol must preserve history.
 e.startNewPatrol('Java Sea');const afterNew=SaveSystem.getCareer();
 // Losing that patrol must create exactly one second record, even if update is called twice while lost.
 s.campaign.patrolDuration=900;s.campaign.score=77;s.playerSub.damage.hullIntegrity=0;s.playerSub.mode='SUNK';s.campaign.missionStatus='LOST';e.update(0);e.update(0);
 const afterLoss=SaveSystem.getCareer(),lost=afterLoss.patrolHistory.find(r=>r.outcome==='LOST');
 return{countersBefore,afterFirst,afterDuplicate,afterMutation,newHistory:afterNew.patrolHistory.length,afterLoss:JSON.parse(JSON.stringify(afterLoss)),lost:JSON.parse(JSON.stringify(lost)),careerHtml:(()=>{const q=new ScenarioSelector({getSnapshot:()=>s});q.renderCareer();return document.getElementById('careerHistory').innerHTML})()};
})()`,ctx);

assert('complete patrol is stored exactly once',live.afterFirst.history===1&&live.afterDuplicate.history===1,live.afterDuplicate);
assert('deck-gun debrief counters come from actual gun system',live.countersBefore.shots===4&&live.countersBefore.hits===4&&live.countersBefore.ammo===116&&live.afterFirst.record.deckGunRounds===live.countersBefore.shots&&live.afterFirst.record.deckGunHits===live.countersBefore.hits,{system:live.countersBefore,record:{rounds:live.afterFirst.record.deckGunRounds,hits:live.afterFirst.record.deckGunHits}});
assert('torpedoesFired comes from actual launch sequence',live.countersBefore.nextTorpedoId===2&&live.countersBefore.torps===1&&live.afterFirst.record.torpedoesFired===1,{system:live.countersBefore,record:live.afterFirst.record.torpedoesFired});
assert('completed record captures real sink/damage/tonnage/hull data',live.afterFirst.record.shipsSunk===1&&live.afterFirst.record.tonnage===6200&&live.afterFirst.record.shipsDamaged===3&&live.afterFirst.record.hullAtEnd===74,{shipsSunk:live.afterFirst.record.shipsSunk,tonnage:live.afterFirst.record.tonnage,shipsDamaged:live.afterFirst.record.shipsDamaged,hullAtEnd:live.afterFirst.record.hullAtEnd});
const firstEvents=live.afterFirst.record.importantEvents.map(e=>e.type);
assert('captain log contains curated convoy/sink/return events',firstEvents.includes('CONVOY_SIGHTED')&&firstEvents.includes('SHIP_SUNK')&&firstEvents.includes('RETURNED_TO_PORT'),firstEvents);
assert('persisted patrol record is detached from later active-state mutation',live.afterMutation.deckGunRounds===4&&live.afterMutation.tonnage===6200&&!live.afterMutation.importantEvents.some(e=>e.type==='FAKE_AFTER_FINALIZE'),{rounds:live.afterMutation.deckGunRounds,tonnage:live.afterMutation.tonnage,events:live.afterMutation.importantEvents.map(e=>e.type)});
assert('new patrol does not erase previous history',live.newHistory===1,{history:live.newHistory});
assert('lost patrol is persisted once',live.afterLoss.patrolHistory.length===2&&live.afterLoss.patrolHistory.filter(r=>r.outcome==='LOST').length===1,{history:live.afterLoss.patrolHistory.map(r=>r.outcome)});
assert('lost patrol captain log records Boat lost',live.lost&&live.lost.importantEvents.some(e=>e.type==='BOAT_LOST'),live.lost?.importantEvents?.map(e=>e.type));
assert('career UI renders completed and lost patrol history',/COMPLETED/.test(live.careerHtml)&&/LOST/.test(live.careerHtml)&&/WAR RECORD/.test(live.careerHtml),{length:live.careerHtml.length});

// 3) Browser-reload equivalent: new JS VM, same localStorage backing map.
const B=makeContext(store);const reloaded=vm.runInContext('SaveSystem.getCareer()',B.ctx);
assert('fresh runtime context retains persistent patrol records',reloaded.patrolHistory.length===2&&reloaded.totalTonnage===6200&&reloaded.totalShips===1,{history:reloaded.patrolHistory.length,totalTonnage:reloaded.totalTonnage,totalShips:reloaded.totalShips});

// 4) Additional curated event hooks: Truk identity/mine and a survived DC attack.
const eventHooks=vm.runInContext(`(()=>{
 const s=createState('Truk Approaches'),e=new SimEngine(s,new CommandBus());e.setupHarbor('Truk Approaches');const H=s.world.harbor,I=e.ensureHarborIntel();
 s.world.contactTracks['H-04']={id:'H-04',source:'VISUAL',confidence:.9,typeEstimate:'HEAVY CRUISER'};e.updateHarborKnowledge(0);
 const m=H.mines[0];s.playerSub.position={xNm:m.xNm,yNm:m.yNm};s.playerSub.depthFeet=25;e.updateHarbor(.1);
 s.campaign._depthChargeAttackSeen=true;s.world.enemy.alertState='SEARCHING';s.world.enemy.alertTimerSec=0;e.updateEnemyAI(0);
 return s.campaign.importantEvents.map(x=>x.type);
})()`,ctx);
assert('Truk identity, mine strike and survived depth-charge attack feed captain log',eventHooks.includes('HEAVY_UNIT_IDENTIFIED')&&eventHooks.includes('MINE_STRUCK')&&eventHooks.includes('DEPTH_CHARGE_ATTACK_SURVIVED'),eventHooks);

// 5) Commendations remain pure historical badges (no state modifiers).
const badgeStore=new Map(),C=makeContext(badgeStore);const badges=vm.runInContext(`(()=>{
 const base={version:1,startDate:'1943-01-01 00:00',endDate:'1943-01-02 00:00',durationSeconds:100,outcome:'COMPLETED',patrolScore:0,careerTotalScore:0,shipsSunk:1,tonnage:10000,shipsDamaged:0,torpedoesFired:0,torpedoHits:0,torpedoDuds:0,deckGunRounds:0,deckGunHits:0,aircraftKills:0,optionalObjectives:[],importantEvents:[],hullAtEnd:100};
 SaveSystem.recordPatrol({...base,id:'a',patrolNumber:1,area:'Solomon Sea'});
 SaveSystem.recordPatrol({...base,id:'b',patrolNumber:2,area:'Java Sea',tonnage:40000});
 SaveSystem.recordPatrol({...base,id:'c',patrolNumber:3,area:'Truk Approaches',tonnage:0,harborRaid:{attempted:true,result:'abandoned'}});
 SaveSystem.recordPatrol({...base,id:'d',patrolNumber:4,area:'Bismarck Sea',tonnage:0,hullAtEnd:20});
 return SaveSystem.getCareer().commendations.map(x=>x.id).sort();
})()`,C.ctx);
assert('historical commendations are awarded from persisted patrol facts',JSON.stringify(badges)===JSON.stringify(['50000-tons','critical-hull-return','first-war-patrol','truk-penetration'].sort()),badges);

if(failed){console.error(`PHASE 4 CAREER HISTORY CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PHASE 4 CAREER HISTORY CONTRACT: PASS');
