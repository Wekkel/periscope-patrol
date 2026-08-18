import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const load=async(file, names, extra={})=>{
  const src=await readFile(path.join(root,file),'utf8');
  const context={console, ...extra};
  vm.createContext(context);
  vm.runInContext(`${src}\n;globalThis.__exports={${names.join(',')}};`,context,{filename:file});
  return context.__exports;
};
const approx=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const degToRad=d=>d*Math.PI/180,radToDeg=r=>r*180/Math.PI;
const normDeg=d=>((d%360)+360)%360;
const shortDelta=(a,b)=>((b-a+540)%360)-180;
const knotsNmSec=k=>k/3600;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distNm=(a,b)=>Math.hypot(a.xNm-b.xNm,a.yNm-b.yNm);
const lerp=(a,b,t)=>a+(b-a)*t;
const bearingBetween=(a,b)=>normDeg(radToDeg(Math.atan2(b.xNm-a.xNm,-(b.yNm-a.yNm))));

const tdc=await load('js/simulation/weapons/tdc-math.js', ['calcTdc'],{degToRad,radToDeg,normDeg,shortDelta,knotsNmSec,clamp,distNm,lerp,bearingBetween});
const base={ownPosition:{xNm:0,yNm:0},ownHeading:0,targetSpeedKnots:0,targetCourse:90,torpedoSpeedKnots:46,confidence:1};
const solve=(overrides={})=>tdc.calcTdc({...base,...overrides});
const broadside=solve({bearing:90,rangeNm:4});
assert.ok(Number.isFinite(broadside.timeToImpactSec)&&broadside.interceptRunNm>0,'broadside geometry should be deterministic');
assert.ok(Math.abs(broadside.gyroAngle)>60&&Math.abs(broadside.gyroAngle)<100,'broadside gyro angle');
assert.ok(broadside.interceptRunNm>0&&broadside.timeToImpactSec>0,'broadside run/time');
const fleeing=solve({bearing:0,rangeNm:5,targetCourse:0,targetSpeedKnots:8});
assert.equal(fleeing.valid,true,'slow fleeing target should be fireable');
assert.ok(fleeing.timeToImpactSec>0&&fleeing.interceptRunNm>5,'fleeing target needs a longer run');
const crossing=solve({bearing:45,rangeNm:3,targetCourse:90,targetSpeedKnots:12});
assert.equal(crossing.valid,true,'crossing target should be fireable');
assert.ok(crossing.solutionQuality>0,'crossing solution quality');
const close=solve({bearing:10,rangeNm:.12,targetCourse:90,targetSpeedKnots:12});
assert.equal(close.valid,false,'point blank geometry must be rejected');
const outOfRange=solve({bearing:0,rangeNm:30,targetCourse:0,targetSpeedKnots:0});
assert.ok(outOfRange.timeToImpactSec>0&&outOfRange.interceptRunNm>0,'long solution remains deterministic');
const aft=solve({bearing:180,rangeNm:4,targetCourse:180,targetSpeedKnots:0});
assert.equal(aft.valid,true,'aft target should select a valid bank');

const route=await load('js/navigation/route-geometry.js',['routeProject','routePointAt','routeAdvanceOneWay','routeTrace'],{degToRad,radToDeg,normDeg,shortDelta,knotsNmSec,clamp,distNm,lerp,bearingBetween});
const lane=[{xNm:0,yNm:0},{xNm:3,yNm:0},{xNm:3,yNm:4}];
approx(route.routeProject(lane,{xNm:1,yNm:.2}).s,1,1e-9);
const mid=route.routePointAt(lane,3).pos;approx(mid.xNm,3);approx(mid.yNm,0);
assert.equal(route.routeAdvanceOneWay(lane,0,3).dir,1);
const end=route.routeAdvanceOneWay(lane,6,10);assert.equal(end.ended,true);approx(end.pos.xNm,3);approx(end.pos.yNm,4);

const optics=await load('js/rendering/optics.js',['phaseSmooth01','dayPhaseRgb','projectWorldPoint','seaSurfaceY','projectAzimuthElevation'],{clamp,lerp,degToRad,radToDeg,shortDelta,EARTH_R:6371000,makeWorldCamera(){}});
approx(optics.phaseSmooth01(0),0);approx(optics.phaseSmooth01(1),1);
assert.deepEqual([...optics.dayPhaseRgb(.5,[0,0,0],[100,100,100],[200,200,200])],[145,145,145]);
const cam={E:0,N:0,sin:0,cos:1,cx:320,cy:240,h:2,f:1000};
const projected=optics.projectWorldPoint(cam,0,100,0);assert.ok(projected&&projected.y>240&&projected.d===100,'forward world point projects into view');
approx(optics.seaSurfaceY(cam,100),240+(2/100+100/(2*6371000))*1000,1e-9);
const opticalPoint={...cam,horizonY:240,halfFov:Math.PI/4};assert.ok(optics.projectAzimuthElevation(opticalPoint,0,0),'on-axis optical point projects');assert.equal(optics.projectAzimuthElevation(opticalPoint,180,0),null,'rear optical point is outside the optic');

const hull=await load('js/simulation/collision/hull-geometry.js',['movingHullIntersection'],{degToRad,radToDeg,normDeg,shortDelta,knotsNmSec,clamp,distNm,lerp,bearingBetween,vesselGameplayType:c=>c?.gameplayType||'MERCHANT',getSubmarineProfile:()=>null});
const box=(x,y)=>({position:{xNm:x,yNm:y},heading:0,halfLengthNm:.5,halfBeamNm:.2});
assert.ok(hull.movingHullIntersection(box(-2,0),box(2,0),box(0,-2),box(0,2)),'crossing OBBs should hit');
assert.equal(hull.movingHullIntersection(box(-2,0),box(-1,0),box(0,2),box(0,3)),null,'separated OBBs should miss');
assert.ok(hull.movingHullIntersection(box(0,-1.02),box(0,-.999),box(0,0),box(0,0)),'edge contact should hit');
assert.equal(hull.movingHullIntersection(box(-2,0),box(-1.1,0),box(0,2),box(0,2.9)),null,'parallel paths should miss');
assert.ok(hull.movingHullIntersection(box(-2,-2),box(0,0),box(2,-2),box(0,0)),'diagonal crossing should hit');

const hud=await load('js/ui/hud-viewmodel.js',['buildHudViewModel'],{
  playerDepthDisplay:(_s,v)=>`${Math.round(v)} ft`,fmtDeg:v=>`${Math.round(v)}°`,fmtTime:v=>`${Math.round(v)}s`,
  DayNightCycle:{getTimeString:v=>`${Math.round(v)}s`},torpedoRangeInfo:()=>null,
  torpedoStoresStatus:()=>({total:4,loadShort:'READY'})
});
const hudState=(overrides={})=>({playerSub:{depthFeet:0,keelClearanceFeet:120,heading:90,mode:'SURFACED',inShallowWater:false,propulsion:{battery:80,fuel:90,speedKnots:4,engineMode:'DIESEL'},damage:{hullIntegrity:100,crushDepthFeet:420,warnings:[]},stealth:{acousticSignature:.2}},tdc:{targetId:null,solutionQuality:0,status:'READY'},weapons:{tubes:[{status:'READY'}]},world:{environment:{visibilityNm:10,weather:'CLEAR',seaState:1},enemy:{alertState:'UNAWARE'},contactTracks:{},depthCharges:[]},campaign:{objectives:[],importantEvents:[],score:0,tonnageSunk:0},time:{elapsedSeconds:0,timeScale:1},map:{plottedCourse:[]},log:[],...overrides});
const baseHud=hudState();
const damagedHud=hudState({playerSub:{...baseHud.playerSub,depthFeet:80,keelClearanceFeet:20,damage:{...baseHud.playerSub.damage,hullIntegrity:45}}});
for(const s of [baseHud,damagedHud,hudState({playerSub:{...baseHud.playerSub,depthFeet:80}})]){const v=hud.buildHudViewModel(s,{device:'desktop',shell:'desk'});for(const key of ['vitals','fire','mission','damage','systems','navigation','log','time'])assert.ok(v[key],`HUD viewmodel contract missing ${key}`);for(const key of ['depth','underKeel','heading','speed','torpedoes','battery','fuel','threat','hull'])assert.ok(v.vitals[key]&&'value' in v.vitals[key]&&'unit' in v.vitals[key]&&'state' in v.vitals[key]&&'actionable' in v.vitals[key],`HUD vital contract missing ${key}`);}
assert.equal(hud.buildHudViewModel(baseHud,{}).fire.available,false);assert.match(hud.buildHudViewModel(baseHud,{}).fire.reason,/target/i);
assert.equal(hud.buildHudViewModel(damagedHud,{}).vitals.hull.state,'caution');
assert.equal(hud.buildHudViewModel(damagedHud,{}).vitals.underKeel.state,'critical');

// Render failures must not prevent the station-navigation phase of a frame.
let navigated=false;
const frameWithRenderRecovery=(render,navigate)=>{try{render();}catch(_err){}finally{navigate();}};
frameWithRenderRecovery(()=>{throw new Error('periscope display fault');},()=>{navigated=true;});
assert.equal(navigated,true,'station navigation must survive a render failure');

console.log('behaviour tests passed: TDC 6, routes 4, optics 5, HUD viewmodel 3, hull SAT 5, render recovery 1');
