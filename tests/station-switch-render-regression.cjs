#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
const pass=(n,d)=>console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`);
const fail=(n,d)=>{failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)};
const assert=(n,c,d)=>c?pass(n,d):fail(n,d);
function nop(){}
for(const f of ['js/rendering/canvas-core.js','js/rendering/map.js','js/rendering/bridge-3d.js','js/rendering/deck-gun-3d.js']){
  const r=cp.spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});assert('syntax '+f,r.status===0,r.stderr.trim());
}
const grad=()=>({addColorStop:nop});
const fakeCtx=new Proxy({
  createLinearGradient:grad,createRadialGradient:grad,measureText:s=>({width:String(s).length*7}),getTransform:()=>({}),
  setTransform:nop,setLineDash:nop,fillRect:nop,strokeRect:nop,beginPath:nop,moveTo:nop,lineTo:nop,stroke:nop,fill:nop,
  arc:nop,ellipse:nop,rect:nop,arcTo:nop,closePath:nop,quadraticCurveTo:nop,bezierCurveTo:nop,fillText:nop,save:nop,restore:nop,
  clip:nop,translate:nop,rotate:nop,scale:nop,drawImage:nop,clearRect:nop
},{get:(o,k)=>k in o?o[k]:(typeof k==='string'?nop:undefined),set:(o,k,v)=>(o[k]=v,true)});
const store=new Map(),base={console,Math,Date,JSON,performance:{now:()=>1000},setTimeout:()=>0,clearTimeout:nop,setInterval:()=>0,clearInterval:nop,requestAnimationFrame:()=>0,cancelAnimationFrame:nop,
 localStorage:{getItem:k=>store.get(String(k))||null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>nop}),Toast:{show:nop,ok:nop,warn:nop,bad:nop,auto:nop,stop:nop,durationFor:()=>4000},showBriefing:nop,
 particles:{draw:nop,update:nop,spawnWake:nop,spawnExplosion:nop},navigator:{deviceMemory:4,hardwareConcurrency:4},
 window:{devicePixelRatio:1,innerWidth:800,innerHeight:1200,addEventListener:nop,visualViewport:null},
 document:{hidden:false,documentElement:{dataset:{lay:'touch'},style:{setProperty:nop}},getElementById:()=>null,querySelectorAll:()=>[],addEventListener:nop},
 innerWidth:800,innerHeight:1200,DayNightCycle:{update:()=>({daylight:1,timeStr:'12:00'}),renderBar:nop,CYCLE_SECONDS:86400},
 gyroIndicator:{render:nop},buzz:nop,AutoSave:{tick:nop},fakeCtx};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/simulation/ship-damage.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/sound-radar.js','js/simulation/weather-system.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/simulation/mission-framework.js','js/simulation/traffic-director.js','js/simulation/historical-campaign.js','js/simulation/battle-atmosphere.js','js/simulation/after-action-report.js','js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/sound-room.js','js/rendering/map.js','js/rendering/battle-atmosphere.js','js/core/game.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const result=vm.runInContext(`(()=>{
 const g=new Game();g.engine.ensureWeatherSystem?.(true);
 const canvas={width:800,height:1200,clientWidth:800,clientHeight:1200,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:1200,left:0,top:0}),addEventListener(){}};
 const cv=new CanvasView(canvas),routes=[];
 for(const station of ['TACTICAL','MAP','BRIDGE','DECK_GUN','PERISCOPE','SOUND','TACTICAL']){
   g.state.playerSub.depthFeet=0;g.state.playerSub.mode='SURFACED';
   g.dispatch({type:'SET_ACTIVE_STATION',station}); // must be synchronous — no g.update() here
   cv.render(g.state);
   routes.push({asked:station,actual:g.state.tactical.activeStation,error:cv._lastRenderError?.message||null});
 }
 // One broken renderer must not brick the station bar / future frames.
 const saved=cv.drawMap;cv.drawMap=()=>{throw new Error('synthetic map failure')};
 g.dispatch({type:'SET_ACTIVE_STATION',station:'MAP'});let threw=false;try{cv.render(g.state)}catch(e){threw=true;}
 const guarded={threw,error:cv._lastRenderError?.message||null,station:g.state.tactical.activeStation};
 cv.drawMap=saved;g.dispatch({type:'SET_ACTIVE_STATION',station:'TACTICAL'});cv.render(g.state);
 guarded.recovered=g.state.tactical.activeStation==='TACTICAL'&&!cv._lastRenderError;
 return{routes,guarded};
})()`,ctx);
assert('full station sequence dispatches and renders on a G88-class portrait viewport',result.routes.every(x=>x.asked===x.actual&&!x.error),result.routes);
assert('a renderer exception is contained instead of freezing station navigation',!result.guarded.threw&&result.guarded.error==='synthetic map failure'&&result.guarded.recovered,result.guarded);

const scopeResult=vm.runInContext(`(()=>{
 const g=new Game(),s=g.state;
 s.playerSub.position={xNm:0,yNm:0};s.playerSub.depthFeet=55;s.playerSub.mode='PERISCOPE_DEPTH';
 s.tactical.activeStation='PERISCOPE';s.tactical.periscopeBearing=0;s.tactical.periscopeZoom=2.5;
 const c={id:'SCOPE-T',name:'Patrol Craft',type:'PATROL_CRAFT',displayType:'PATROL CRAFT',side:'ENEMY',lengthYards:135,visualProfile:.55,position:{xNm:0,yNm:-.5},heading:90,speedKnots:10,sunk:false};
 s.world.contacts=[c];s.world.environment.visibilityNm=12;s.world.environment.daylight=1;s.world.environment.seaState=0;
 s.world.contactTracks[c.id]={id:c.id,typeEstimate:'SURFACE SHIP',bearing:0,rangeEstimateNm:.5,courseEstimate:90,speedEstimateKnots:10,confidence:.7,source:'HYDROPHONE',lastUpdated:0,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards};
 const can=scopeCanResolveHull(s,c),obs=scopeHullObservation(s,c);
 const tr=g.engine.confirmScopeVisualContact(c.id);
 g.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:1});g.update(.1);
 const canvas={width:800,height:1200,clientWidth:800,clientHeight:1200,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:1200,left:0,top:0}),addEventListener(){}};
 const cv=new CanvasView(canvas);cv.render(s);const scopeErr=cv._lastRenderError?.message||null;
 g.dispatch({type:'SET_ACTIVE_STATION',station:'MAP'});cv.render(s);const mapErr=cv._lastRenderError?.message||null;
 return{can,obs:!!obs,tr:!!tr,source:s.world.contactTracks[c.id]?.positionSource,hull:s.world.contactTracks[c.id]?.visualHullConfirmed,scopeErr,mapErr,station:s.tactical.activeStation};
})()`,ctx);
assert('scope hull helpers are globally defined and produce a coherent visual observation',scopeResult.can&&scopeResult.obs&&scopeResult.tr&&scopeResult.source==='VISUAL'&&scopeResult.hull,scopeResult);
assert('periscope rotate/render and subsequent MAP switch survive without scope helper ReferenceErrors',!scopeResult.scopeErr&&!scopeResult.mapErr&&scopeResult.station==='MAP',scopeResult);

const weatherResult=vm.runInContext(`(()=>{
 const g=new Game(),s=g.state,canvas={width:800,height:1200,clientWidth:800,clientHeight:1200,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:1200,left:0,top:0}),addEventListener(){}};
 const cv=new CanvasView(canvas);cv.zoom=28;let ellipses=0,lines=0;
 const wxCtx=new Proxy(fakeCtx,{get:(o,k)=>k==='ellipse'?(()=>{ellipses++;}):k==='lineTo'?(()=>{lines++;}):o[k],set:(o,k,v)=>(o[k]=v,true)});
 const own={...s.playerSub.position};s.world.weatherSystem={cells:[{id:'WX-T',center:{xNm:own.xNm+2,yNm:own.yNm+1},radiusNm:4,heading:90,speedKnots:12,bornAt:0,lifeSec:10000}]};
 const before=JSON.stringify(s.world.weatherSystem.cells),w2s=(x,y)=>({x:400+(x-own.xNm)*28,y:600+(y-own.yNm)*28});
 cv.drawMapWeather(wxCtx,s,w2s,800,1200);const after=JSON.stringify(s.world.weatherSystem.cells);
 return{ellipses,lines,unchanged:before===after};
})()`,ctx);
assert('weather MAP overlay actually draws a cell and remains read-only',weatherResult.ellipses>=2&&weatherResult.lines>=2&&weatherResult.unchanged,weatherResult);
const mapSrc=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8'),gameSrc=fs.readFileSync(path.join(root,'js/core/game.js'),'utf8'),loopSrc=fs.readFileSync(path.join(root,'js/core/game-loop.js'),'utf8'),touchSrc=fs.readFileSync(path.join(root,'js/controllers/touch-controller.js'),'utf8'),surfaceSrc=fs.readFileSync(path.join(root,'js/simulation/surface-watch.js'),'utf8'),physicsSrc=fs.readFileSync(path.join(root,'js/simulation/physics-navigation.js'),'utf8');
assert('station switching is synchronous UI state and no longer waits for a simulation tick',gameSrc.includes("cmd?.type==='SET_ACTIVE_STATION'")&&gameSrc.includes('this.engine.applyCmd(cmd)'),{});
assert('touch station taps repaint immediately',touchSrc.includes('this.cv.render(snap)')&&touchSrc.includes('this.updateTouch(snap,true)'),{});
assert('game loop contains simulation faults without sacrificing later rendering',loopSrc.includes('_safeUpdate(dt)')&&loopSrc.includes("SIMULATION PAUSED"),{});
assert('weather overlay is present but read-only and independent from weather simulation callbacks',mapSrc.includes('drawMapWeather(ctx,state,w2s,w,h)')&&mapSrc.includes('weatherSystem?.cells')&&!mapSrc.includes('weatherAtPosition(state,c.center)')&&!mapSrc.includes('_weatherCellInfluence(c,own)'),{});
assert('scope visual resolution has one canonical globally loaded implementation',surfaceSrc.includes('function scopeCanResolveHull')&&surfaceSrc.includes('function scopeHullObservation')&&physicsSrc.includes('scopeHullObservation(s,c)'),{});
if(failed){console.error(`STATION SWITCH / RENDER REGRESSION: FAIL (${failed})`);process.exit(1)}
console.log('STATION SWITCH / RENDER REGRESSION: PASS');
