#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
let seed=0x9142cafe;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);function nop(){}
const notices=[];const store=new Map();const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:fn=>{if(typeof fn==='function')fn();return 0},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show:(m,k)=>notices.push([k||'info',m]),ok:m=>notices.push(['ok',m]),warn:m=>notices.push(['warn',m]),bad:m=>notices.push(['bad',m]),auto(){},stop(){}},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:844,innerHeight:390,
 tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}},aarController:{open(){}}};base.globalThis=base;
base.__setRandomSeed=v=>{seed=(Number(v)||1)>>>0};
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js',
'js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const profiles=vm.runInContext(`(()=>{
 const early=historicalCampaignProfile('1942-06-15','Java Sea');
 const mid=historicalCampaignProfile('1943-08-15','Solomon Sea');
 const electric=historicalCampaignProfile('1943-09-15','Solomon Sea');
 const late=historicalCampaignProfile('1944-09-15','Luzon Strait');
 return{early,mid,electric,late,
   earlyDud:historicalTorpedoDudChance({campaign:{historicalProfile:early}},'mk14fast','reduced'),
   lateDud:historicalTorpedoDudChance({campaign:{historicalProfile:late}},'mk14fast','reduced'),
   escortEarly:aswEscortCount('Solomon Sea',4,{startDate:'1942-06-15'}),
   escortLate:aswEscortCount('Solomon Sea',4,{startDate:'1944-09-15'}),
   refitMk18:historicalRefitMessages(historicalCampaignProfile('1943-08-20','Solomon Sea'),historicalCampaignProfile('1943-09-20','Solomon Sea')),
   refit44:historicalRefitMessages(historicalCampaignProfile('1943-12-20','Solomon Sea'),historicalCampaignProfile('1944-01-20','Solomon Sea')),
   next:historicalNextPatrolDate('1943-10-20',6,4242)
 };
})()`,ctx);
assert('calendar creates distinct early/mid/late war profiles',profiles.early.era==='EARLY WAR'&&profiles.mid.era==='MID WAR'&&profiles.late.era==='LATE WAR',{early:profiles.early.era,mid:profiles.mid.era,late:profiles.late.era});
assert('early June 1942 has SD but no SJ and no Mark 18',profiles.early.sdAvailable===true&&profiles.early.sjAvailable===false&&!profiles.early.availableTorpedoes.includes('mk18'),{radar:profiles.early.radarLabel,torpedoes:profiles.early.availableTorpedoes});
assert('mid-war SJ is fitted while Mark 18 remains date-gated until September 1943',profiles.mid.sjAvailable===true&&!profiles.mid.availableTorpedoes.includes('mk18')&&profiles.electric.availableTorpedoes.includes('mk18'),{midRange:profiles.mid.sjRangeNm,electric:profiles.electric.availableTorpedoes});
assert('late war improves US sensors and makes enemy ASW/air threat stronger',profiles.late.sjRangeNm>profiles.mid.sjRangeNm&&profiles.late.soundFactor>profiles.mid.soundFactor&&profiles.late.aswSkill>profiles.mid.aswSkill&&profiles.late.airThreatFactor>profiles.mid.airThreatFactor,{mid:{sj:profiles.mid.sjRangeNm,sound:profiles.mid.soundFactor,asw:profiles.mid.aswSkill,air:profiles.mid.airThreatFactor},late:{sj:profiles.late.sjRangeNm,sound:profiles.late.soundFactor,asw:profiles.late.aswSkill,air:profiles.late.airThreatFactor}});
assert('late-war merchant world is sparser but individual enemy merchants are larger/faster',profiles.late.trafficDensityFactor<profiles.mid.trafficDensityFactor&&profiles.late.merchantTonnageFactor>profiles.mid.merchantTonnageFactor&&profiles.late.merchantSpeedBonus>profiles.mid.merchantSpeedBonus,{density:profiles.late.trafficDensityFactor,tons:profiles.late.merchantTonnageFactor,speedBonus:profiles.late.merchantSpeedBonus});
assert('surface opportunities narrow as the war progresses',profiles.early.surfaceOpportunity>profiles.mid.surfaceOpportunity&&profiles.mid.surfaceOpportunity>profiles.late.surfaceOpportunity,{early:profiles.early.surfaceOpportunity,mid:profiles.mid.surfaceOpportunity,late:profiles.late.surfaceOpportunity});
assert('same reduced Mark 14 setting is materially less failure-prone late war',Math.abs(profiles.earlyDud-.10)<1e-9&&Math.abs(profiles.lateDud-.026)<1e-9,{early:profiles.earlyDud,late:profiles.lateDud});
assert('escort screen strength changes by year without an XP system',profiles.escortEarly===1&&profiles.escortLate===3,{early:profiles.escortEarly,late:profiles.escortLate});
assert('refit messages announce equipment rather than skill levels',profiles.refitMk18.some(x=>/Mark 18 electric torpedoes/.test(x))&&profiles.refit44.some(x=>/improved SJ radar/.test(x))&&profiles.refit44.some(x=>/LATE WAR/.test(x)),{mk18:profiles.refitMk18,late:profiles.refit44});
const days=(Date.parse(profiles.next+'T00:00:00Z')-Date.parse('1943-10-20T00:00:00Z'))/86400000;
assert('between-patrol calendar advances by a bounded deterministic refit interval',days>=18&&days<=28,{next:profiles.next,days});

// Radar is not merely a label: the late-war range can detect a contact that the
// same mid-war SJ plot cannot reach.
const radar=vm.runInContext(`(()=>{
 function run(date){const s=createState('Solomon Sea');s.campaign.startDate=date;s.time.campaignDate=date;const e=new SimEngine(s,new CommandBus());e.ensureHistoricalCampaignProfile(true);s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=0;s.playerSub.mode='SURFACED';s.world.contacts=[{id:'R',name:'Tanker',type:'TANKER',lengthYards:520,position:{xNm:7.5,yNm:0},heading:0,speedKnots:8,visualProfile:1,acousticBase:.4}];s.world.contactTracks={};e.ensureSoundRadarState();s.world.radar._tick=99;e._updateSJRadar(.1);return{fit:s.world.radar.fitLabel,range:s.world.radar.sjRangeNm,seen:!!s.world.radar.sjTracks.R};}
 return{mid:run('1943-08-15'),late:run('1944-09-15')};
})()`,ctx);
assert('late-war SJ materially extends the tactical radar envelope',radar.mid.seen===false&&radar.late.seen===true,radar);

// Calendar gate is enforced in the actual command path.
notices.length=0;
const torpGate=vm.runInContext(`(()=>{
 function run(date){const s=createState('Solomon Sea');s.campaign.startDate=date;s.time.campaignDate=date;const e=new SimEngine(s,new CommandBus());e.ensureHistoricalCampaignProfile(true);e.applyCmd({type:'SET_TORPEDO_TYPE',specKey:'mk18'});return{key:s.tdc.torpedoSpecKey,toasts:(s.ui?.toasts||[]).map(x=>x.msg)};}
 const a=run('1943-08-15'),b=run('1944-02-15');return{early:a.key,late:b.key,earlyToasts:a.toasts};
})()`,ctx);
assert('Mark 18 cannot be selected before its campaign availability but can later',torpGate.early==='mk14fast'&&torpGate.late==='mk18',torpGate);
assert('unavailable torpedo selection gives a calendar/refit warning',torpGate.earlyToasts.some(x=>/not available on this patrol date/i.test(x)),torpGate.earlyToasts);

// Start-new-patrol is the actual integration point for air threat, traffic and refits.
seed=0x33aa55cc;
const integration=vm.runInContext(`(()=>{
 function patrol(date){__setRandomSeed(0x33aa55cc);const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());e.startNewPatrol('Solomon Sea',{startDate:date,missionType:'CONVOY_INTERDICTION'});const merch=s.world.contacts.filter(c=>c.convoyId==='MAIN'&&c.type!=='ESCORT');return{date:s.campaign.startDate,era:s.campaign.historicalProfile.era,air:s.world.airThreat.level,traffic:s.world.traffic.groups.length,merchants:merch.length,avgTons:merch.reduce((a,c)=>a+c.tonsFactor,0)/Math.max(1,merch.length),avgSpeed:merch.reduce((a,c)=>a+c.baseSpeed,0)/Math.max(1,merch.length)};}
 const early=patrol('1942-06-15'),late=patrol('1944-09-15');
 const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());e.startNewPatrol('Solomon Sea',{startDate:'1943-08-20',missionType:'CONVOY_INTERDICTION'});s.campaign.nextPatrolDate='1943-09-20';e.startNewPatrol('Solomon Sea',{missionType:'CONVOY_INTERDICTION'});
 return{early,late,nextDate:s.campaign.startDate,refit:s.campaign.refitMessages,hasMk18:s.campaign.equipment.torpedoes.includes('mk18')};
})()`,ctx);
assert('startNewPatrol applies lower early-war and higher late-war air threat',integration.early.air<integration.late.air,{early:integration.early.air,late:integration.late.air});
assert('traffic director actually produces fewer ambient groups late war',integration.early.traffic>integration.late.traffic,{early:integration.early.traffic,late:integration.late.traffic});
assert('late-war generated merchants are materially larger on average',integration.late.avgTons>integration.early.avgTons,{early:integration.early.avgTons,late:integration.late.avgTons});
assert('next patrol consumes the campaign calendar and surfaces the refit',integration.nextDate==='1943-09-20'&&integration.hasMk18&&integration.refit.some(x=>/Mark 18/.test(x)),{date:integration.nextDate,refit:integration.refit});

// Old save migration and career persistence.
const migration=vm.runInContext(`(()=>{
 const s=createState('Solomon Sea');s.campaign.startDate='1944-04-04';delete s.campaign.historicalProfile;delete s.campaign.equipment;delete s.campaign.refitMessages;const e=new SimEngine(s,new CommandBus());e.update(0);
 const r=e.buildPatrolRecord('COMPLETED',{patrolScore:0,hullAtEnd:88});return{profile:s.campaign.historicalProfile,equipment:s.campaign.equipment,recordProfile:r.historicalProfile,recordEquipment:r.equipment};
})()`,ctx);
assert('pre-Patch-9 save gains historical profile/equipment without a crash',migration.profile?.era==='LATE WAR'&&migration.equipment?.radar,{profile:migration.profile?.era,equipment:migration.equipment});
assert('career/debrief record freezes the historical fit used on that patrol',migration.recordProfile?.date==='1944-04-04'&&migration.recordEquipment?.radar===migration.equipment.radar,{profile:migration.recordProfile?.date,radar:migration.recordEquipment?.radar});

const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),hist=fs.readFileSync(path.join(root,'js/simulation/historical-campaign.js'),'utf8'),brief=fs.readFileSync(path.join(root,'js/ui/briefing.js'),'utf8'),cache=fs.readFileSync(path.join(root,'PWA_CACHE_FILES.txt'),'utf8'),sensors=fs.readFileSync(path.join(root,'js/simulation/sensors.js'),'utf8');
const refs=[...html.matchAll(/<script\s+src=["']\.\/([^"']+\.js)["']/g)].map(m=>m[1]);
assert('historical campaign module is loaded and present in PWA cache',refs.includes('js/simulation/historical-campaign.js')&&cache.includes('./js/simulation/historical-campaign.js'),{scripts:refs.length});
assert('briefing exposes war calendar, equipment and refit messages',/WAR CALENDAR/.test(brief)&&/EQUIPMENT/.test(brief)&&/REFIT/.test(brief),{});
assert('surface-opportunity factor is actually consumed by enemy lookout detection',/surfaceOpportunity/.test(sensors)&&/enemyVisualFactor/.test(sensors),{});
assert('historical layer adds no skill tree, RAF, WebGL or offscreen renderer',!/skill\s*tree/i.test(hist)&&!/requestAnimationFrame/.test(hist)&&!/WebGL/i.test(hist)&&!/OffscreenCanvas/.test(hist),{});
if(failed){console.error(`PATCH 9 HISTORICAL CAMPAIGN CONTRACT: FAIL (${failed})`);process.exit(1)}console.log('PATCH 9 HISTORICAL CAMPAIGN CONTRACT: PASS');
