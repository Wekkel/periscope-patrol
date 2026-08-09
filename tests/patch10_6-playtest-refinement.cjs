#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
let seed=0x106feed;const math=Object.create(Math);math.random=()=>0;function nop(){}
const store=new Map();const base={console,Math:math,Date,JSON,performance:{now:()=>0},setTimeout:fn=>{if(typeof fn==='function')fn();return 0},clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){},durationFor:()=>4000},showBriefing(){},particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:2,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document:{hidden:false,documentElement:{dataset:{lay:'touch'}},createElement:()=>({}),getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},innerWidth:844,innerHeight:390,
 tutorial:{update(){}},DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar(){},CYCLE_SECONDS:86400},gyroIndicator:{render(){}},transitStopToastKind:()=> 'warn',buzz(){},AutoSave:{tick(){}},aarController:{open(){}}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const out={};
 // An already-known aircraft becoming dangerous is still a transit event.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.aircraft=[{id:'A',seenBySub:true,state:'SEARCHING',shotDown:false,position:{xNm:2,yNm:0}}];e.snapshotWatch();s.world.aircraft[0].state='ATTACKING';out.airTransit={why:e.transitInterrupt(),watch:s.time._watch};s.time.timeScale=32;e.applyCmd({type:'START_TRANSIT',seconds:1800});out.airTransit.blocked={scale:s.time.timeScale,until:s.time.transitUntil,open:s.time.transitOpen};}
 // At scope depth, a target outside the actual glass does not become VISUAL; train onto it and it does.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.contacts=[{id:'M1',name:'M1',type:'MERCHANT',displayType:'FREIGHTER',side:'ENEMY',position:{xNm:1,yNm:0},heading:0,speedKnots:9,desiredHeading:0,desiredSpeed:9,acousticBase:.25,lengthYards:400}];s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=55;s.playerSub.propulsion.speedKnots=0;s.world.environment.visibilityNm=20;s.world.environment.seaState=0;s.tactical.activeStation='PERISCOPE';s.tactical.periscopeZoom=2.5;s.tactical.periscopeBearing=0;e.updateDetection(1);const before=s.world.contactTracks.M1?.source||null;s.tactical.periscopeBearing=90;for(let i=0;i<3;i++)e.updateDetection(1);const after=s.world.contactTracks.M1?.source||null;out.scope={before,after,conf:s.world.contactTracks.M1?.confidence};s.tactical.selectedTrackId='M1';s.tactical.periscopeBearing=0;e.applyCmd({type:'SET_ACTIVE_STATION',station:'PERISCOPE'});out.scope.autotrain=s.tactical.periscopeBearing;}
 // Deselect really clears both chart highlight and the TDC's automatic target.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus());s.world.contactTracks.X={id:'X',confidence:.8,bearing:20,rangeEstimateNm:2,courseEstimate:90,speedEstimateKnots:8};e.applyCmd({type:'SELECT_TRACK',trackId:'X'});e.applyCmd({type:'DESELECT_TRACK'});out.deselect={sel:s.tactical.selectedTrackId,target:s.tdc.targetId,auto:s.tdc.autoTrack};}
 // STOP-turn arcade concession now makes a tiny acoustic signature without invented forward speed.
 {const s=createState('Solomon Sea'),e=new SimEngine(s,new CommandBus()),sub=s.playerSub;sub.heading=0;sub.orderedHeading=90;sub.propulsion.speedKnots=0;sub.propulsion.actualRpm=0;sub.damage.pumpActive=false;sub.damage.flooding=0;e.updateHeading(sub,.1);e.updateSigs(sub);out.stopTurn={speed:sub.propulsion.speedKnots,thrust:sub.maneuveringThrust,noise:sub.stealth.acousticSignature,heading:sub.heading};}
 // Merchant display geometry now has cheap visual variation without new simulation types.
 out.models=['A','B','C','D','E','F'].map(id=>shipVisualModelKey({id,type:'MERCHANT',displayType:'FREIGHTER'}));out.coastal=shipVisualModelKey({id:'COAST',type:'MERCHANT',displayType:'COASTAL FREIGHTER'});out.transport=shipVisualModelKey({id:'T',type:'TROOP',displayType:'FAST TRANSPORT'});
 return out;
})()`,ctx);
assert('dangerous aircraft state breaks transit even when contact was already known',result.airTransit.why==='aircraft attack',result.airTransit);
assert('transit cannot be restarted through an aircraft attack and returns to 1x',result.airTransit.blocked.scale===1&&result.airTransit.blocked.until===0&&!result.airTransit.blocked.open,result.airTransit.blocked);
assert('periscope-depth visual knowledge requires target to be inside actual scope field',result.scope.before!=='VISUAL'&&result.scope.after==='VISUAL',result.scope);
assert('entering periscope with a selected plot trains the glass onto its bearing',Math.abs(result.scope.autotrain-90)<.001,result.scope);
assert('contact selection can be explicitly cleared without leaving hidden TDC auto-track',result.deselect.sel===null&&result.deselect.target===null&&!result.deselect.auto,result.deselect);
assert('turning at STOP remains arcade-playable but is no longer acoustically free',result.stopTurn.speed===0&&result.stopTurn.thrust>0&&result.stopTurn.noise>0,result.stopTurn);
assert('merchant traffic has at least three visual silhouettes plus coastal/transport variants',new Set(result.models).size>=3&&result.coastal==='MERCHANT_COASTAL'&&result.transport==='MERCHANT_ISLAND',{models:result.models,coastal:result.coastal,transport:result.transport});

const gameLoop=fs.readFileSync(path.join(root,'js/core/game-loop.js'),'utf8');
assert('all event-driven transit stops return time to 1x and close transit mode',/T\.transitUntil=0;T\.transitOpen=false;T\.timeScale=1;T\.transitReason=why/.test(gameLoop),{});
const mapSrc=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8');
assert('uncertain contacts use subdued narrow plot ink and unselected hulls no longer draw full course vectors',mapSrc.includes("rgba(245,198,92,.28)")&&mapSrc.includes("a*.09")&&mapSrc.includes("if(isSelected)this.courseVector")&&mapSrc.includes('this._mapLabelRects'),{});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'css/app.css'),'utf8');
assert('quick speed menus use STOP for harbor work and no longer expose a special HARBOR preset',html.includes('data-rpm="0">■ Stop</button>')&&!html.includes('data-rpm="25">Harbor</button>'),{});
assert('touch controls reserve the lower HUD lane and MAP scale reserves FIRE-button gutter',css.includes('data-station="PERISCOPE"')&&mapSrc.includes('touchInset')&&mapSrc.includes('92*k'),{});
const airSrc=fs.readFileSync(path.join(root,'js/simulation/ai/aircraft.js'),'utf8');
assert('air alarm only says CLEAR THE BRIDGE when surfaced and not already diving',airSrc.includes("sub.depthFeet<8&&!diveUnderway?'CLEAR THE BRIDGE!'")&&airSrc.includes("'CONTINUE THE DIVE!'")&&airSrc.includes("'REMAIN SUBMERGED.'"),{});
const perSrc=fs.readFileSync(path.join(root,'js/rendering/periscope-3d.js'),'utf8');
const utilSrc=fs.readFileSync(path.join(root,'js/core/utilities.js'),'utf8');
const helperPrefix=perSrc.slice(0,perSrc.indexOf('class CanvasViewPeriscope'));
const phaseCtx=vm.createContext({Math,console});vm.runInContext(utilSrc,phaseCtx);vm.runInContext(helperPrefix,phaseCtx);
const cols=vm.runInContext(`({a:dayPhaseRgb(.219,[3,6,15],[27,39,64],[47,111,158]),b:dayPhaseRgb(.221,[3,6,15],[27,39,64],[47,111,158]),c:dayPhaseRgb(.549,[3,6,15],[27,39,64],[47,111,158]),d:dayPhaseRgb(.551,[3,6,15],[27,39,64],[47,111,158])})`,phaseCtx);
const delta=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
assert('dusk/day sky palette is continuous across the old hard-switch values',delta(cols.a,cols.b)<=2&&delta(cols.c,cols.d)<=2,{at022:delta(cols.a,cols.b),at055:delta(cols.c,cols.d),cols});
assert('sinking renderer settles crippled hulls and delays extreme trim/separation',perSrc.includes('y-=model.fb*S*clamp(flotation*.46')&&perSrc.includes('sinkPitchP=Math.pow(sinkP,1.72)')&&perSrc.includes('(sinkP-.66)/.34')&&perSrc.includes("out.push([0,lerp(a[1],b[1],f)])"),{});
if(failed){console.error(`PATCH 10.6 PLAYTEST REFINEMENT: FAIL (${failed})`);process.exit(1)}
console.log('PATCH 10.6 PLAYTEST REFINEMENT: PASS');
