#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}
const js=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&js.push(p)}})(path.join(root,'js'));
for(const f of js){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}pass('JavaScript syntaxcheck',{files:js.length});
function nop(){}
let seed=0x087087;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const cacheCtx={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,setLineDash:nop};
const document={hidden:false,documentElement:{dataset:{lay:'touch'}},createElement(tag){return tag==='canvas'?{width:0,height:0,getContext:()=>cacheCtx}:{}},getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop};
const base={console,Math:math,Date,JSON,nop,performance:{now:()=>0},setTimeout:fn=>0,clearTimeout:nop,setInterval:()=>0,clearInterval:nop,requestAnimationFrame:()=>0,cancelAnimationFrame:nop,
 navigator:{deviceMemory:4,hardwareConcurrency:4},window:{devicePixelRatio:1.5,innerWidth:844,innerHeight:390,addEventListener:nop,visualViewport:null},document,innerWidth:844,innerHeight:390,
 audio:new Proxy({},{get:(o,k)=>o[k]||(o[k]=nop)}),Toast:{show:nop,ok:nop,warn:nop,bad:nop,auto:nop,stop:nop},particles:{draw:nop,update:nop,spawnWake:nop,spawnExplosion:nop},DayNightCycle:{CYCLE_SECONDS:86400,update:()=>({daylight:.8,timeStr:'12:00'}),renderBar:nop},localStorage:{getItem:()=>null,setItem:nop,removeItem:nop},showBriefing:nop,aarController:{open:nop}};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js','js/rendering/battle-atmosphere.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const sim=vm.runInContext(`(()=>{
  const s=createState('Solomon Sea'),bus=new CommandBus(),e=new SimEngine(s,bus);e.startNewPatrol('Solomon Sea',{missionType:'CONVOY_INTERDICTION',startDate:'1943-08-17'});
  s.time.timeScale=0;s.playerSub.propulsion.orderedRpm=250;s.playerSub.propulsion.actualRpm=250;s.playerSub.propulsion.speedKnots=13.6;
  bus.dispatch({type:'SET_ENGINE_RPM',rpm:0});e.update(.1);
  const allStop={ordered:s.playerSub.propulsion.orderedRpm,actual:s.playerSub.propulsion.actualRpm,speed:s.playerSub.propulsion.speedKnots,elapsed:s.time.elapsedSeconds};

  const m=e.configureMission('CONVOY_INTERDICTION'),merchant=s.world.contacts.find(x=>x.convoyId==='MAIN'&&x.type!=='ESCORT');
  s.weapons.hits.push({contactId:merchant.id});e.checkPrimaryMission();
  const oneHit={attack:s.campaign.objectives.find(o=>o.id==='attack').done,result:m.result,progress:missionProgressText(s)};

  m.result='SUCCESS';s.campaign.missionStatus='PATROL';s.time.timeScale=1;
  const ap=e.friendlyPortApproach(s.campaign.friendlyPort);s.playerSub.position={...ap.pos};s.playerSub.depthFeet=0;s.playerSub.propulsion.speedKnots=0;
  e.checkPortArrival(1);
  const returnRecovery={status:s.campaign.missionStatus,alongside:s.campaign.alongside||0,service:s.campaign.portService||0};

  const fp=s.campaign.friendlyPort;s.world.airThreat.nextCheck=9999;s.world.aircraft=[{id:'AIR-Z',name:'Aichi E13A',kind:'FLOATPLANE',position:{...fp.pos},heading:90,speedKnots:130,state:'SEARCHING',bombs:2,runTimer:0,spotted:false,seenBySub:false,bornAt:0}];
  e.updateAircraft(.1);const air={state:s.world.aircraft[0]?.state,bearing:s.world.aircraft[0]?.departBearing};
  return{allStop,oneHit,returnRecovery,air};
})()`,ctx);
assert('paused ALL STOP clears stale integrated speed without advancing time',sim.allStop.ordered===0&&sim.allStop.actual===0&&sim.allStop.speed===0&&sim.allStop.elapsed===0,sim.allStop);
assert('one convoy hit no longer falsely completes meaningful-neutralization objective',sim.oneHit.attack===false&&sim.oneHit.result==='ACTIVE'&&/Neutralized/.test(sim.oneHit.progress),sim.oneHit);
assert('successful old save in PATROL is recovered and completes immediately when stopped in the friendly harbor ring',sim.returnRecovery.status==='COMPLETED'&&sim.returnRecovery.alongside===0&&sim.returnRecovery.service===0,sim.returnRecovery);
assert('routine searching aircraft inside friendly-port inner zone turns away',sim.air.state==='DEPARTING'&&Number.isFinite(sim.air.bearing),sim.air);

const mapResult=vm.runInContext(`(()=>{
  const v=Object.create(CanvasView.prototype);v.lowSpec=true;v.zoom=1;v.mapCenter={xNm:0,yNm:0};v._bathyOverview=null;
  const nx=30,ny=24,cell=1,grid=new Float32Array(nx*ny);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)grid[j*nx+i]=5+(i+j)%120;
  const B={grid,nx,ny,x0:-15,y0:-12,cell};v._ensureBathy=()=>B;let images=0,mainFills=0;
  const c={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){mainFills++},drawImage(){images++},beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,setLineDash:nop,fillText:nop};
  const w2s=(x,y)=>({x:400+x,y:240+y});v.drawMapBathy(c,{},w2s,800,480);const first=v._bathyOverview;v.drawMapBathy(c,{},w2s,800,480);
  return{images,mainFills,reused:first===v._bathyOverview};
})()`,ctx);
assert('low-spec wide bathymetry reuses one cached chart layer instead of per-frame cells',mapResult.images===2&&mapResult.mainFills===0&&mapResult.reused,mapResult);

const deck=fs.readFileSync(path.join(root,'js/rendering/deck-gun-3d.js'),'utf8'),wake=fs.readFileSync(path.join(root,'js/rendering/periscope-3d.js'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
assert('ownship top deck is independently clipped on port and starboard halves',deck.includes("add('DECK_PORT'")&&deck.includes("add('DECK_STARBOARD'")&&deck.includes('3-inch deck gun'),{});
assert('wake is speed-scaled and includes subtle Kelvin divergent-wave geometry',wake.includes('speedN=clamp')&&wake.includes('19.47')&&wake.includes('Broken shoulder crests'),{});
assert('service worker version was bumped for GitHub/PWA deployment',sw.includes("const VERSION = '0.8.7'")&&sw.includes("'./js/simulation/historical-campaign.js'"),{});

if(failed){console.error(`RESTPOINTS 0.8.7 CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('RESTPOINTS 0.8.7 CONTRACT: PASS');
