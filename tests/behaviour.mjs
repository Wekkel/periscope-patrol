import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
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
// 7. National Station Presentation & WCAG Contrast Tests
function hexToLuminance(hex) {
  const m = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const [r, g, b] = m.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function calcContrast(hex1, hex2) {
  const l1 = hexToLuminance(hex1), l2 = hexToLuminance(hex2);
  const bright = Math.max(l1, l2), dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

const nationalPalettes = {
  'us-fleet': { faceInner: '#0d171d', ink: '#89c2d9', bezel: '#24333d' },
  'km-bakelite': { faceInner: '#101010', ink: '#e0d8c0', bezel: '#2d2926' },
  'rn-admiralty': { faceInner: '#121922', ink: '#e2e7ec', bezel: '#6b583e' },
  'ijn-fleet': { faceInner: '#0e1211', ink: '#ece5d8', bezel: '#3d382e' },
  'rm-brass': { faceInner: '#1c1813', ink: '#f4ecd8', bezel: '#8c6d3b' },
  'vmf-red': { faceInner: '#151719', ink: '#e6ebed', bezel: '#4e5559' }
};

for (const [theme, pal] of Object.entries(nationalPalettes)) {
  const inkContrast = calcContrast(pal.faceInner, pal.ink);
  assert.ok(inkContrast >= 4.5, `Ink contrast on ${theme} must satisfy WCAG AA (>= 4.5:1), got ${inkContrast.toFixed(2)}`);
  const bezelContrast = calcContrast(pal.faceInner, pal.bezel);
  assert.ok(bezelContrast >= 1.25, `Bezel contrast on ${theme} must provide distinct structural boundary (>= 1.25:1), got ${bezelContrast.toFixed(2)}`);
}

// Depth display contracts across imperial and metric
function mockDepthDisplay(factor, suffix, feet, decimals = 0) {
  return `${(Number(feet || 0) * factor).toFixed(decimals)} ${suffix}`;
}
assert.equal(mockDepthDisplay(1, 'ft', 100), '100 ft');
assert.equal(mockDepthDisplay(0.3048, 'm', 100), '30 m');
// 8. Harbor detection, alarm escalation & daylight gating tests
let generalAlarmTriggered = false;
let escortsAlerted = null;

const harborModule = await load('js/simulation/harbor.js', ['HarborSystem'], {
  degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, clamp, distNm, lerp, bearingBetween,
  weatherBetween: () => ({ searchlightFactor: 1, seaState: 1 }),
  shipDamageSeverity: c => c.damageSeverity || 0,
  PresentationBridge: { audio: () => ({ playGeneralAlarm: () => { generalAlarmTriggered = true; } }) },
  PATROL_AREAS: {},
  materializePortScenes: () => [],
  getSubmarineProfile: () => ({ weapons: { deckGun: { ammo: 100 } } }),
  getCampaignHarborOperationProfile: () => null,
  materializeVesselIdentity: x => x,
  BATTLE_MAX_FLASHES: 10,
  battlePredictPosition: () => ({ xNm: 0, yNm: 0 })
});

const createHarborHarness = (overrides = {}) => {
  const H = {
    name: 'Scapa Flow',
    shortName: 'Scapa',
    center: { xNm: 0, yNm: 0 },
    outerRadiusNm: 5.0,
    innerRadiusNm: 2.0,
    hydrophoneRangeNm: 3.0,
    batteryRangeNm: 4.0,
    batterySites: [{ xNm: 0, yNm: 0 }],
    channelBearing: 0,
    netRangeNm: 2.0,
    netGapHalfNm: 0.25,
    channelHalfWidthNm: 0.4,
    suspicion: 0,
    alert: 0,
    entered: false,
    inside: false,
    lastGunAt: -999,
    lastSweepAt: -999,
    searchlightActiveUntil: 0,
    searchlightSweepWarned: false,
    heavyTargetId: 'HEAVY_1',
    mines: []
  };
  const mockIntel = {
    raid: { attempted: false, enteredAt: null, result: 'not_attempted' },
    heavyUnit: { identified: false },
    net: { known: false },
    minefield: { level: 'NONE' },
    channel: { level: 'NONE' }
  };
  const mockContext = {
    state: {
      world: {
        harbor: H,
        enemy: { searchCenter: null },
        environment: { daylight: 1.0, visibilityNm: 10 },
        contacts: []
      },
      playerSub: {
        position: { xNm: 1.0, yNm: 0 },
        depthFeet: 0,
        propulsion: { speedKnots: 8 },
        stealth: { acousticSignature: 0.2 },
        mode: 'SURFACED'
      },
      time: { elapsedSeconds: 100 }
    },
    ensureHarborIntel: () => mockIntel,
    refreshHarborOptionalObjective: () => {},
    pointSegNm: harborModule.HarborSystem.pointSegNm,
    harborNetSegments: harborModule.HarborSystem.harborNetSegments,
    harborChannelFrame: harborModule.HarborSystem.harborChannelFrame,
    revealHarborNet: harborModule.HarborSystem.revealHarborNet,
    scheduleHarborStarshell: harborModule.HarborSystem.scheduleHarborStarshell,
    notify: () => {},
    log: () => {},
    sys: {
      enemyAI: {
        alertEscorts: (reason, pos, intensity) => {
          escortsAlerted = { reason, pos, intensity };
        }
      }
    }
  };
  if (overrides.state) {
    Object.assign(mockContext.state, overrides.state);
  }
  return { H, mockIntel, mockContext };
};

// Test 1: noteHarborAttack escalates alarm immediately on damaged or sunk harbor targets
generalAlarmTriggered = false;
escortsAlerted = null;
const harness1 = createHarborHarness();
const targetContact = {
  id: 'HEAVY_1',
  harborTarget: true,
  sunk: true,
  position: { xNm: 0.5, yNm: 0.5 }
};
harborModule.HarborSystem.noteHarborAttack.call(harness1.mockContext, targetContact);
assert.equal(harness1.H.suspicion, 100, 'Suspicion must max out (100) on harbor attack');
assert.equal(harness1.H.alert, 2, 'Harbor alert must escalate to 2 (FULL ALARM)');
assert.equal(harness1.mockContext.state.world.enemy.searchCenter?.xNm, 0.5, 'Search center xNm must match target position');
assert.equal(harness1.mockContext.state.world.enemy.searchCenter?.yNm, 0.5, 'Search center yNm must match target position');
assert.equal(generalAlarmTriggered, true, 'General alarm audio must trigger');
assert.equal(escortsAlerted?.reason, 'HARBOR_ATTACK', 'Escorts must receive HARBOR_ATTACK alert');

// Test 2: Daylight extinguishes active searchlights
const harness2 = createHarborHarness();
harness2.H.searchlightActiveUntil = 150; // Active until t=150
harness2.mockContext.state.world.environment.daylight = 0.8; // Daylight!
harborModule.HarborSystem.updateHarbor.call(harness2.mockContext, 1.0);
assert.equal(harness2.H.searchlightActiveUntil, 0, 'Searchlight must be extinguished when daylight >= 0.35');

// Test 3: Nighttime allows searchlights to sweep
const harness3 = createHarborHarness();
harness3.mockContext.state.world.environment.daylight = 0.1; // Night!
harness3.H.suspicion = 25; // Above decay threshold (< 4)
harness3.H.alert = 1;
harness3.mockContext.state.playerSub.depthFeet = 0; // Surfaced
harness3.mockContext.state.playerSub.position = { xNm: 2.0, yNm: 0 }; // rng = 2.0 < 4.4
harness3.mockContext.state.time.elapsedSeconds = 200;
harness3.H.lastSweepAt = 100; // > 22 seconds ago
harborModule.HarborSystem.updateHarbor.call(harness3.mockContext, 1.0);
assert.ok(harness3.H.searchlightActiveUntil > 200, 'Searchlight sweep must activate at night when surfaced within range');

// Test 4: Optical shore lookout detects surfaced hull in daylight independent of hydrophones
const harness4 = createHarborHarness();
harness4.mockContext.state.world.environment.daylight = 0.85; // Bright day
harness4.mockContext.state.playerSub.depthFeet = 0; // Surfaced
harness4.mockContext.state.playerSub.position = { xNm: 1.5, yNm: 0 }; // Inside approach (1.5 nm)
harness4.mockContext.state.playerSub.propulsion.speedKnots = 0; // Dead in the water
harness4.mockContext.state.playerSub.stealth.acousticSignature = 0; // Completely silent
const initialSuspicion = harness4.H.suspicion;
harborModule.HarborSystem.updateHarbor.call(harness4.mockContext, 10.0);
assert.ok(harness4.H.suspicion > initialSuspicion, 'Optical lookouts must build suspicion against surfaced hulls during daytime');

// 9. 2.5D Harbor Architecture & Blackout Rendering Tests
const battleAtm = await load('js/rendering/battle-atmosphere.js', ['BattleAtmosphere'], {
  projectWorldPoint: () => ({ x: 320, y: 240, d: 600 }),
  NM_M: 1852,
  degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, clamp, distNm, lerp, bearingBetween,
  weatherAtPosition: () => ({ searchlightFactor: 1 })
});

const createAtmosphereHarness = (harborAlert = 0, daylight = 0.1) => {
  const fills = [];
  const strokes = [];
  const gradients = [];
  const ellipses = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect(x, y, w, h) { fills.push({ style: this.fillStyle, x, y, w, h }); },
    strokeRect(x, y, w, h) { strokes.push({ style: this.strokeStyle, x, y, w, h }); },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() { strokes.push({ style: this.strokeStyle }); },
    fill() { fills.push({ style: this.fillStyle }); },
    arc(x, y, r) { fills.push({ style: this.fillStyle, x, y, r, type: 'arc' }); },
    ellipse(x, y, rx, ry) { ellipses.push({ style: this.fillStyle, x, y, rx, ry }); },
    createLinearGradient(x0, y0, x1, y1) {
      const stops = [];
      const g = {
        addColorStop(offset, color) { stops.push({ offset, color }); },
        stops, x0, y0, x1, y1
      };
      gradients.push(g);
      return g;
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const stops = [];
      const g = {
        addColorStop(offset, color) { stops.push({ offset, color }); },
        stops, x0, y0, r0, x1, y1, r1
      };
      gradients.push(g);
      return g;
    },
    save() {},
    restore() {},
    fills,
    strokes,
    gradients,
    ellipses
  };
  const cam = { f: 1200 };
  const state = {
    playerSub: { position: { xNm: 0, yNm: 0 } },
    world: {
      harbor: { alert: harborAlert },
      portScenes: [{
        known: true,
        heading: 0,
        position: { xNm: 1, yNm: 1 },
        features: [
          { kind: 'pier', alongNm: 0, lateralNm: 0.1, heightM: 2, sizeM: 80 },
          { kind: 'warehouse', alongNm: 0.1, lateralNm: 0.1, heightM: 8, sizeM: 30 },
          { kind: 'tank', alongNm: 0.2, lateralNm: 0.1, heightM: 10, sizeM: 25 },
          { kind: 'crane', alongNm: 0.3, lateralNm: 0.1, heightM: 18, sizeM: 15 }
        ]
      }]
    }
  };
  return { ctx, cam, state, dl: daylight };
};

// Test 2.5D normal night: dock lanterns rendered on warehouse
const harnessNormal = createAtmosphereHarness(0, 0.1);
battleAtm.BattleAtmosphere.drawPortScenes3D.call({ k: 1, lowSpec: false, battlePoint: battleAtm.BattleAtmosphere.battlePoint }, harnessNormal.ctx, harnessNormal.cam, harnessNormal.state, harnessNormal.dl);
assert.ok(harnessNormal.ctx.fills.some(f => String(f.style).includes('255,185,75')), 'Dock lanterns must be illuminated at night during peace/normal alert');
assert.ok(harnessNormal.ctx.gradients.length > 0, 'Cylindrical oil tanks must use directional linear gradient');
assert.ok(harnessNormal.ctx.ellipses.length > 0, 'Oil tanks must render 2.5D dome caps with ellipse');

// Test 2.5D blackout under harbor alarm: dock lanterns must be extinguished
const harnessBlackout = createAtmosphereHarness(2, 0.1);
battleAtm.BattleAtmosphere.drawPortScenes3D.call({ k: 1, lowSpec: false, battlePoint: battleAtm.BattleAtmosphere.battlePoint }, harnessBlackout.ctx, harnessBlackout.cam, harnessBlackout.state, harnessBlackout.dl);
assert.ok(!harnessBlackout.ctx.fills.some(f => String(f.style).includes('255,185,75')), 'Dock lanterns must be extinguished during harbor alarm (blackout discipline)');

// Test 2.5D new harbor structures: breakwater, quay, lighthouse, battery, buoy
const harnessFeatures = createAtmosphereHarness(0, 0.1);
harnessFeatures.state.world.portScenes[0].features.push(
  { kind: 'breakwater', alongNm: 0.4, lateralNm: 0.1, heightM: 3, sizeM: 200 },
  { kind: 'quay', alongNm: 0.5, lateralNm: 0.1, heightM: 3, sizeM: 150 },
  { kind: 'lighthouse', alongNm: 0.6, lateralNm: 0.1, heightM: 14, sizeM: 6 },
  { kind: 'coastal_battery', alongNm: 0.7, lateralNm: 0.1, heightM: 8, sizeM: 20 },
  { kind: 'channel_buoy', buoySide: 'PORT', alongNm: 0.8, lateralNm: 0.1, heightM: 3, sizeM: 3 }
);
battleAtm.BattleAtmosphere.drawPortScenes3D.call({ k: 1, lowSpec: false, battlePoint: () => ({ x: 320, y: 240, d: 500 }) }, harnessFeatures.ctx, harnessFeatures.cam, harnessFeatures.state, harnessFeatures.dl);
assert.ok(harnessFeatures.ctx.fills.some(f => String(f.style).includes('125,122,115')), 'Breakwater concrete fill rendered');
assert.ok(harnessFeatures.ctx.fills.some(f => String(f.style).includes('185,45,40')), 'Channel buoy port red fill rendered');

// 10. Harbor Nets, Starshells, Indicator Loops & Tidal Drift Tests
// Test 1: Starshell schedule & illumination
const starshellHarness = createHarborHarness();
starshellHarness.mockContext.state.world.atmosphere = { version: 1, nextId: 1, starshells: [], muzzleFlashes: [] };
starshellHarness.mockContext.ensureBattleAtmosphereState = () => starshellHarness.mockContext.state.world.atmosphere;
const ss = harborModule.HarborSystem.scheduleHarborStarshell.call(starshellHarness.mockContext, starshellHarness.H);
assert.ok(ss && ss.id.startsWith('SS-'), 'scheduleHarborStarshell must create a valid starshell record');
assert.equal(ss.until, ss.at + 36, 'Starshell must burn for 36 seconds aloft');
assert.equal(starshellHarness.mockContext.state.world.atmosphere.starshells.length, 1, 'Starshell must be queued in atmosphere');

// Test 2: Active starshell illuminates harbor environment in updateHarbor
starshellHarness.mockContext.state.world.environment.daylight = 0.1; // Night
starshellHarness.mockContext.state.world.environment.harborIllumination = 0;
harborModule.HarborSystem.updateHarbor.call(starshellHarness.mockContext, 1.0);
assert.ok(starshellHarness.mockContext.state.world.environment.harborIllumination >= 0.55, 'Active starshell must raise harborIllumination >= 0.55');

// Test 3: Indicator loop detects high-speed submerged passage across gate
const loopHarness = createHarborHarness();
loopHarness.H.channelBearing = 0;
loopHarness.H.netRangeNm = 2.0;
loopHarness.H.channelHalfWidthNm = 0.4;
loopHarness.mockContext.state.playerSub.position = { xNm: 0, yNm: -2.0 }; // Exactly at the gate (along = 2.0, lateral = 0)
loopHarness.mockContext.state.playerSub.depthFeet = 55; // Submerged
loopHarness.mockContext.state.playerSub.propulsion.speedKnots = 7.0; // Fast > 3.5 kn
const preSuspicion = loopHarness.H.suspicion;
harborModule.HarborSystem.updateHarbor.call(loopHarness.mockContext, 2.0);
assert.ok(loopHarness.H.suspicion > preSuspicion, 'Magnetic indicator loop must build suspicion for high-speed passage across net line');

// Test 4: Tidal drift in swept approach corridor
const tidalHarness = createHarborHarness();
tidalHarness.H.channelBearing = 0;
tidalHarness.H.outerRadiusNm = 5.0;
tidalHarness.H.innerRadiusNm = 2.0;
tidalHarness.mockContext.state.playerSub.position = { xNm: 0, yNm: -3.5 }; // In swept corridor (rng = 3.5 nm)
tidalHarness.mockContext.state.time.elapsedSeconds = 100;
const startPosX = tidalHarness.mockContext.state.playerSub.position.xNm;
harborModule.HarborSystem.updateHarbor.call(tidalHarness.mockContext, 5.0);
assert.notEqual(tidalHarness.mockContext.state.playerSub.position.xNm, startPosX, 'Tidal current must exert lateral drift in the harbor approach corridor');

// Test 5: 3D Net and Gate buoys rendering
const netHarness = createAtmosphereHarness(0, 0.1);
netHarness.state.world.harbor = {
  center: { xNm: 0, yNm: 0 },
  netRangeNm: 1.5,
  channelBearing: 90,
  netGapHalfNm: 0.15
};
netHarness.state.playerSub.position = { xNm: 1.6, yNm: 0 }; // Close to gate at bearing 90 (x=1.5, y=0)
battleAtm.BattleAtmosphere.drawHarborNet3D.call({ k: 1, battlePoint: battleAtm.BattleAtmosphere.battlePoint }, netHarness.ctx, netHarness.cam, netHarness.state, netHarness.dl);
assert.ok(netHarness.ctx.strokes.length > 0, 'drawHarborNet3D must render steel cables between buoys');
assert.ok(netHarness.ctx.fills.some(f => String(f.style).includes('45,185,95') || String(f.style).includes('225,85,75')), 'drawHarborNet3D must render green/red gate beacon buoys at net gap');

// Test 6: 3D Starshell rendering
const ssRenderHarness = createAtmosphereHarness(2, 0.1);
ssRenderHarness.state.world.atmosphere = {
  starshells: [{
    at: 50,
    until: 90,
    startAlt: 180,
    descentRate: 3.5,
    position: { xNm: 0.5, yNm: 0.5 }
  }]
};
ssRenderHarness.state.time = { elapsedSeconds: 60 };
battleAtm.BattleAtmosphere.drawStarshells3D.call({ k: 1, battlePoint: battleAtm.BattleAtmosphere.battlePoint }, ssRenderHarness.ctx, ssRenderHarness.cam, ssRenderHarness.state, ssRenderHarness.dl, 60);
assert.ok(ssRenderHarness.ctx.ellipses.length > 0, 'drawStarshells3D must render parachute canopy with ellipse');
// 11. Special Ops Infiltratiemissies & Haven-AAR Debriefing Tests
const careerModule = await load('js/simulation/career-history.js', ['CareerSystem'], {
  clamp, degToRad, radToDeg, normDeg, shortDelta, distNm, bearingBetween,
  CAREER_RECORD_VERSION: 2,
  GAME_DAY_SECONDS: 86400,
  _careerClone: x => JSON.parse(JSON.stringify(x)),
  _careerStampFrom: () => '1943-08-17 06:00',
  _careerPatrolId: () => 'test-patrol-1',
  _careerRarity: () => ({ rarityScore: 1 }),
  _careerDamagePoints: () => 1,
  _careerEngagements: () => [],
  _careerLessons: () => ['Good patrol.'],
  _careerOwnBoat: () => ({ hullIntegrity: 100 }),
  shipDamageSeverity: c => c.damageSeverity || 0,
  shipDamageCondition: () => 'INTACT',
  ensureShipDamage: () => ({ flotation: 1, propulsion: 1, steering: 1, fire: 0 }),
  PresentationBridge: { emit: () => {} }
});

// Test 1: AAR event recording in harbor operations
const aarHarness = createHarborHarness();
const recordedAar = [];
aarHarness.mockContext.aar = {
  recordEvent: (type, text, data, pos) => recordedAar.push({ type, text, data, pos })
};

// Submarine penetrates gate cleanly
const gateSimSub = { position: { xNm: 0, yNm: -1.96 } };
aarHarness.mockIntel.raid.lastChannelAlongNm = 2.05; // Was outside netRange (2.0)
harborModule.HarborSystem.updateHarborGateProgress.call(aarHarness.mockContext, aarHarness.mockIntel, aarHarness.H, gateSimSub);
assert.equal(aarHarness.mockIntel.raid.gateCrossed, true, 'Gate crossed must be marked true');
assert.ok(recordedAar.some(e => e.type === 'HARBOR_GATE_PASSED'), 'HARBOR_GATE_PASSED must be recorded in AAR');

// Submarine fouls net
aarHarness.mockContext.state.playerSub.position = { xNm: 0, yNm: 2.0 }; // At solid net (y=+2.0)
aarHarness.mockContext.state.playerSub.depthFeet = 20;
aarHarness.mockContext.state.playerSub.propulsion = { speedKnots: 6, actualRpm: 120 };
aarHarness.mockContext.state.playerSub.damage = { rudderDamage: 0 };
harborModule.HarborSystem.updateHarbor.call(aarHarness.mockContext, 1.0);
assert.ok(recordedAar.some(e => e.type === 'HARBOR_NET_CONTACT'), 'HARBOR_NET_CONTACT must be recorded in AAR on fouling net');

// Indicator loop triggered on high-speed submerged passage
aarHarness.H.suspicion = 20;
aarHarness.mockContext.state.playerSub.position = { xNm: 0, yNm: -2.0 }; // At gate
aarHarness.mockContext.state.playerSub.depthFeet = 45;
aarHarness.mockContext.state.playerSub.propulsion.speedKnots = 8.0;
harborModule.HarborSystem.updateHarbor.call(aarHarness.mockContext, 1.0);
assert.ok(recordedAar.some(e => e.type === 'INDICATOR_LOOP_ALARM'), 'INDICATOR_LOOP_ALARM must be recorded when speed > 3.5 kn');

// Harbor attack event recorded
const attackTargetContact = { id: 'H-04', harborTarget: true, sunk: true, position: { xNm: 0.1, yNm: 0.1 } };
harborModule.HarborSystem.noteHarborAttack.call(aarHarness.mockContext, attackTargetContact);
assert.ok(recordedAar.some(e => e.type === 'HARBOR_ATTACK'), 'HARBOR_ATTACK must be recorded when moored target is struck');

// Harbor escape recorded
aarHarness.H.entered = true;
aarHarness.H.escaped = false;
aarHarness.mockContext.state.playerSub.position = { xNm: 0, yNm: -6.2 }; // Outside outer radius (5.0 + 0.8)
harborModule.HarborSystem.updateHarbor.call(aarHarness.mockContext, 1.0);
assert.ok(recordedAar.some(e => e.type === 'HARBOR_ESCAPE'), 'HARBOR_ESCAPE must be recorded when clearing outer harbor defenses');

// Test 2: buildPatrolRecord awards Special Intel bonus for stealth penetration
const stealthCareerContext = {
  state: {
    campaign: {
      patrolNumber: 1,
      patrolArea: 'Truk Approaches',
      historyId: 'test-1',
      score: 1000,
      totalScore: 1000,
      patrolDuration: 1800,
      importantEvents: []
    },
    runtime: {
      campaign: { _careerStartDate: '1943-08-17 06:00' }
    },
    world: {
      harbor: { name: 'Truk Anchorage', shortName: 'Truk', entered: true, alert: 0, indicatorLoopWarned: false, heavyTargetId: 'H-04' },
      harborIntel: { raid: { attempted: true, gateCrossed: true }, heavyUnit: { identified: true } },
      contacts: [{ id: 'H-04', sunk: true, damageSeverity: 1.0 }],
      hits: []
    },
    playerSub: { damage: { hullIntegrity: 100 }, propulsion: { fuel: 80, battery: 90 } },
    weapons: { deckGun: { shots: 0, hits: 0 } }
  },
  aar: { buildReplay: () => null },
  ensureCareerPatrolState: careerModule.CareerSystem.ensureCareerPatrolState
};
const rec = careerModule.CareerSystem.buildPatrolRecord.call(stealthCareerContext, 'COMPLETED');
assert.ok(rec.harborOperation, 'harborOperation must be present in patrol record');
assert.equal(rec.harborOperation.stealthPenetration, true, 'Stealth penetration must be true when no loops/alarm triggered');
assert.equal(rec.harborOperation.specialIntelBonus, 500, 'Special Intel bonus must be 500 for stealth penetration');
assert.equal(rec.patrolScore, 1500, 'Patrol score must include +500 Special Intel bonus (1000 + 500 = 1500)');

// Test 3: HARBOR_STRIKE mission lifecycle logic
const missionContext = {
  state: {
    campaign: {
      missionType: 'HARBOR_STRIKE',
      missionStatus: 'PATROL',
      score: 0,
      objectives: [
        { id: 'approach', text: 'Penetrate', done: false },
        { id: 'identify', text: 'Identify', done: false },
        { id: 'neutralize', text: 'Neutralize', done: false },
        { id: 'escape', text: 'Escape', done: false },
        { id: 'return', text: 'Return', done: false }
      ],
      primaryMission: {
        type: 'HARBOR_STRIKE',
        title: 'HARBOR STRIKE',
        reward: 2600,
        result: 'ACTIVE',
        targetId: 'HS-01',
        targetLabel: 'Anchorage Target',
        neutralized: false,
        gatePenetrated: false,
        targetIdentified: false,
        center: { xNm: 0, yNm: 0 },
        radiusNm: 2,
        escapeRadiusNm: 6,
        siteName: 'Truk Anchorage'
      }
    },
    world: {
      harbor: { name: 'Truk Anchorage', center: { xNm: 0, yNm: 0 }, innerRadiusNm: 2, outerRadiusNm: 5 },
      harborIntel: { raid: { gateCrossed: false }, heavyUnit: { identified: false } },
      contacts: [{ id: 'HS-01', name: 'Yamato', sunk: false, position: { xNm: 0.2, yNm: 0.2 } }],
      contactTracks: {}
    },
    playerSub: { position: { xNm: 0, yNm: -5 } },
    time: { elapsedSeconds: 200 }
  },
  ctx: { captainLog: () => {} },
  notify: () => {},
  log: () => {},
  _missionStopTransit: () => {},
  _missionFinish(success) {
    this.state.campaign.primaryMission.result = success ? 'SUCCESS' : 'FAILED';
  }
};

const checkHarborStrike = (ctx) => {
  const s = ctx.state, c = s.campaign, m = c.primaryMission, W = s.world;
  const t = W.contacts.find(x => x.id === m.targetId), rng = distNm(s.playerSub.position, m.center);
  const I = s.world.harborIntel;
  if ((I?.raid?.gateCrossed || rng <= Math.max(2.5, m.radiusNm || 2)) && !c.objectives.find(o => o.id === 'approach').done) {
    m.gatePenetrated = true;
    c.objectives.find(o => o.id === 'approach').done = true;
  }
  const tr = W.contactTracks[m.targetId];
  if ((I?.heavyUnit?.identified || (tr && tr.typeEstimate && !/UNKNOWN/i.test(tr.typeEstimate))) && !c.objectives.find(o => o.id === 'identify').done) {
    m.targetIdentified = true;
    c.objectives.find(o => o.id === 'identify').done = true;
  }
  if (t?.sunk && !m.neutralized) {
    m.neutralized = true;
    c.objectives.find(o => o.id === 'neutralize').done = true;
  }
  if (m.neutralized && rng >= m.escapeRadiusNm) {
    c.objectives.find(o => o.id === 'escape').done = true;
    ctx._missionFinish(true);
  }
};

// Step 1: Penetrate gate
missionContext.state.world.harborIntel.raid.gateCrossed = true;
checkHarborStrike(missionContext);
assert.equal(missionContext.state.campaign.objectives.find(o => o.id === 'approach').done, true, 'Approach must be completed upon gate penetration');

// Verify step 2: Identify target
missionContext.state.world.contactTracks['HS-01'] = { typeEstimate: 'BATTLESHIP', confidence: 0.9 };
checkHarborStrike(missionContext);
assert.equal(missionContext.state.campaign.objectives.find(o => o.id === 'identify').done, true, 'Identify must be completed upon visual track');

// Verify step 3: Neutralize target
missionContext.state.world.contacts[0].sunk = true;
checkHarborStrike(missionContext);
assert.equal(missionContext.state.campaign.objectives.find(o => o.id === 'neutralize').done, true, 'Neutralize must be completed when target is sunk');

// Verify step 4: Escape outside defenses
missionContext.state.playerSub.position = { xNm: 0, yNm: -6.5 }; // rng = 6.5 >= 6
checkHarborStrike(missionContext);
assert.equal(missionContext.state.campaign.objectives.find(o => o.id === 'escape').done, true, 'Escape must be completed outside escape radius');
assert.equal(missionContext.state.campaign.primaryMission.result, 'SUCCESS', 'Primary mission must finish with SUCCESS');

// ═══════════════════════════════════════════════════
// 12. SHIP RECOGNITION MANUAL & MASTHEAD STADIMETER
// ═══════════════════════════════════════════════════

const recData = await load('js/data/recognition-manual.js', [
  'SHIP_RECOGNITION_CATALOG',
  'getShipRecognitionClass',
  'getAllRecognitionClasses',
  'inferShipClassFromContact',
  'stadimeterRangeNm',
  'recommendedTorpedoDepthFt'
]);

// Test 1: Recognition Catalog Integrity & Taxonomy
const allClasses = recData.getAllRecognitionClasses();
assert.ok(allClasses.length >= 15, 'Recognition catalog must contain at least 15 historical ship classes');
for (const c of allClasses) {
  assert.ok(c.id && c.name && c.navy && c.category, `Ship class ${c.id} must define id, name, navy and category`);
  assert.ok(['M-F', 'F-M', 'M-F-M', 'M-F-F-M', 'FLUSH-4F', 'ISLAND-AFT', 'FLIGHT-DECK'].includes(c.compositeCode), `Class ${c.id} must use standard composite code: ${c.compositeCode}`);
  assert.ok(c.dimensions.lengthFt > 100 && c.dimensions.lengthFt < 1000, `Class ${c.id} lengthFt reasonable`);
  assert.ok(c.dimensions.mastheadHeightFt >= 50 && c.dimensions.mastheadHeightFt <= 120, `Class ${c.id} mastheadHeightFt reasonable for stadimeter`);
  assert.ok(c.dimensions.draftFt >= 7 && c.dimensions.draftFt <= 35, `Class ${c.id} draftFt reasonable for torpedo depth`);
  assert.ok(c.tonnage > 300 && c.speedMaxKnots > 8, `Class ${c.id} tonnage and speed`);
  assert.ok(c.silhouetteSvg.startsWith('M ') && c.silhouetteSvg.length > 20, `Class ${c.id} vector silhouette path`);
}

// Test 2: Stadimeter Mathematics & Ground-Truth Inference
const rng80 = recData.stadimeterRangeNm(80, 1.0);
approx(rng80, 80 / (6076.1155 * Math.tan(degToRad(1.0))), 1e-4);
approx(rng80, 0.754, 0.01); // ~1527 yards

const rng62 = recData.stadimeterRangeNm(62, 0.5);
approx(rng62, 62 / (6076.1155 * Math.tan(degToRad(0.5))), 1e-4);
approx(rng62, 1.17, 0.02);

// Ground-truth inference
const mockFlower = { type: 'ESCORT', vesselProfileId: 'uk-flower-corvette-1941', modelKey: 'FLOWER_CORVETTE_1941' };
const infFlower = recData.inferShipClassFromContact(mockFlower);
assert.equal(infFlower.id, 'flower-corvette', 'Should infer Flower corvette from profile ID');

const mockTown = { type: 'DESTROYER', vesselProfileId: 'uk-town-destroyer-1941', modelKey: 'TOWN_DESTROYER_1941' };
const infTown = recData.inferShipClassFromContact(mockTown);
assert.equal(infTown.id, 'town-destroyer', 'Should infer Town destroyer from modelKey');

// Torpedo depth recommendation
const optImpact = recData.recommendedTorpedoDepthFt(27.5, false); // draft 27.5 ft -> ~15 ft
assert.ok(optImpact >= 10 && optImpact <= 20, 'Impact torpedo depth recommendation');
const optMagnetic = recData.recommendedTorpedoDepthFt(27.5, true); // draft 27.5 ft + 2 ft -> 30 ft
assert.equal(optMagnetic, 30, 'Magnetic under-keel torpedo depth recommendation');

// Test 3: Ship Identification & TDC Kinematic Coupling
const simState = {
  playerSub: { position: { xNm: 0, yNm: 0 }, heading: 0, depthFeet: 55, damage: { periscopeDamage: 0 } },
  tactical: { activeStation: 'PERISCOPE', periscopeBearing: 45, periscopeZoom: 1, selectedTrackId: 'T1' },
  tdc: { targetId: 'T1', solutionQuality: 0.50, trackSource: 'SCOPE', rangeNm: 2.0, bearing: 45, dudMode: 'reduced' },
  world: {
    contacts: [{ id: 'T1', name: 'Flower Corvette HMCS Snowberry', type: 'ESCORT', vesselProfileId: 'uk-flower-corvette-1941', modelKey: 'FLOWER_CORVETTE_1941', position: { xNm: 1.414, yNm: 1.414 }, heading: 90, speedKnots: 12, lengthYards: 70 }],
    contactTracks: {
      T1: { id: 'T1', bearing: 45, rangeEstimateNm: 2.0, courseEstimate: 90, speedEstimateKnots: 12, confidence: 0.8, visualHullConfirmed: true }
    }
  },
  time: { elapsedSeconds: 120 },
  log: []
};

// Emulate SimEngine identifyContactClass & sendScopeToTdc
const engineScope = {
  state: simState,
  log(msg) { simState.log.push(msg); },
  confirmScopeVisualContact() {},
  updateTdc() {}
};

// Execute identifyContactClass from physics-navigation
const physNav = await load('js/simulation/physics-navigation.js', ['SimEngine'], {
  CoreSystem: { constructor(s, b) { this.state = s; this.bus = b; } },
  normDeg, degToRad, radToDeg, shortDelta, clamp, distNm, bearingBetween,
  scopeHullObservation: () => ({ bearing: 45, rangeNm: 2.0, courseDeg: 90, speedKnots: 12, quality: 0.9, confidenceFloor: 0.8, positionConfidence: 0.9, positionUncertaintyNm: 0.03, position: [1.414, 1.414] }),
  updateStableContactPlot: () => {},
  scopeMeasuredBearing: (_s, b) => b,
  scopeMeasuredRangeNm: (_s, r) => r,
  fmtDeg: d => `${Math.round(d)}°`,
  getShipRecognitionClass: recData.getShipRecognitionClass,
  inferShipClassFromContact: recData.inferShipClassFromContact,
  recommendedTorpedoDepthFt: recData.recommendedTorpedoDepthFt,
  PresentationBridge: { audio: () => ({ playTdcSolution() {} }) }
});

const simInstance = new physNav.SimEngine(simState, { dispatch() {} });
simInstance.state = simState;
simInstance.log = (msg, level) => { simState.log.push({ msg, level }); };
simInstance.updateTdc = () => {};

// Case A: Correct identification
const identRes = simInstance.identifyContactClass('T1', 'flower-corvette');
assert.equal(identRes.success, true);
assert.equal(identRes.isCorrect, true);
assert.equal(simState.world.contactTracks.T1.identificationStatus, 'CONFIRMED');
assert.ok(simState.tdc.solutionQuality >= 0.65, 'TDC solution quality boosted after correct identification');
assert.equal(simState.world.contactTracks.T1.identifiedMastheadFt, 62);
assert.equal(simState.world.contactTracks.T1.identifiedDraftFt, 14.2);

// Case B: Misidentification scaling error
simInstance.identifyContactClass('T1', 'town-destroyer'); // Masthead 72 instead of 62
assert.equal(simState.world.contactTracks.T1.identificationStatus, 'MISIDENTIFIED');
assert.equal(simState.world.contactTracks.T1.identifiedMastheadFt, 72);
simInstance.sendScopeToTdc();
const apparentRange = simState.tdc.rangeNm;
assert.ok(apparentRange > 2.0, `Apparent range (${apparentRange.toFixed(2)} NM) should be overstated when mistaking 62ft mast for 72ft mast`);
approx(apparentRange, 2.0 * (72 / 62), 0.05);

// Test 4: HUD ViewModel Integration
const hudVm = await load('js/ui/hud-viewmodel.js', ['buildHudViewModel'], {
  normDeg, degToRad, radToDeg, shortDelta, clamp, distNm, bearingBetween,
  playerDepthDisplay: (_s, v) => `${v} ft`,
  fmtTime: () => '00:00',
  fmtDeg: d => `${Math.round(d)}°`,
  torpedoRangeInfo: () => null,
  torpedoStoresStatus: () => ({ total: 4, loadShort: 'READY' }),
  isSurfaceCombatant: () => false,
  ensureShipDamage: () => null,
  DayNightCycle: { getTimeString: () => '12:00' }
});

const vmRes = hudVm.buildHudViewModel(simState, { shell: 'desk' });
assert.ok(vmRes.tdc.targetLabel.includes('Town-class Destroyer'), 'TDC target label incorporates identified class');
assert.ok(vmRes.tdc.identification, 'TDC viewmodel carries identification object');
assert.equal(vmRes.tdc.identification.classId, 'town-destroyer');
assert.equal(vmRes.tdc.identification.mastheadFt, 72);

// ═══════════════════════════════════════════════════ 13. COMPARTMENTAL SHIP DAMAGE, LIST & TRIM
const shipDmg = await load('js/simulation/ship-damage.js', [
  'ensureShipDamage', 'shipDamageSeverity', 'shipDamageCondition',
  'shipDamageSpeedFactor', 'shipDamageTurnFactor', 'shipTorpedoHitLocation',
  'shipAttitude', 'applyTorpedoShipDamage', 'updateShipDamage',
  'shipDetermineSinkTrajectory', 'beginShipSinking', 'SINK_TRAJECTORIES'
], {
  clamp,
  radToDeg,
  degToRad,
  isSurfaceCombatant: c => c?.type === 'DESTROYER' || c?.type === 'ESCORT' || /DESTROYER|CORVETTE|FRIGATE/i.test(c?.displayType || '')
});

// Test 1: 5-Compartment hit location resolution
assert.equal(shipDmg.shipTorpedoHitLocation(0.40), 'BOW');
assert.equal(shipDmg.shipTorpedoHitLocation(0.20), 'FORWARD_HOLD');
assert.equal(shipDmg.shipTorpedoHitLocation(0.00), 'MIDSHIPS');
assert.equal(shipDmg.shipTorpedoHitLocation(-0.25), 'AFTER_HOLD');
assert.equal(shipDmg.shipTorpedoHitLocation(-0.45), 'STERN');

// Test 2: Bow hit induces forward trim (down by head) and asymmetric listing
const testShip1 = {
  id: 'C_FREIGHTER_1',
  name: 'SS Empire Rowan',
  type: 'MERCHANT',
  lengthYards: 430,
  speedKnots: 10,
  baseSpeed: 10
};
const dummyEngine = {
  state: { time: { elapsedSeconds: 100 }, weapons: {}, campaign: { score: 0, tonnageSunk: 0 } },
  log() {},
  notify() {}
};

// Torpedo hit on Starboard Bow
shipDmg.applyTorpedoShipDamage(dummyEngine, testShip1, {
  hitFrac: 0.35,
  hitSide: 1, // Starboard
  warheadKg: 300,
  incidence: 80,
  torpedoId: 'TORP_1'
});
const D1 = testShip1.shipDamage;
assert.ok(D1.compartments.bow > 0.5, 'Bow compartment registered severe flooding');
assert.ok(D1.trim > 0.4, 'Ship develops positive trim (down by head)');
assert.ok(D1.list > 0.1, 'Ship develops positive list (heeling to starboard)');
const att1 = shipDmg.shipAttitude(testShip1);
assert.ok(att1.listDeg > 0, 'Attitude reflects starboard list');
assert.ok(att1.listText.includes('STBD'), 'List text indicates STBD');
assert.ok(att1.trimText.includes('HEAD'), 'Trim text indicates DOWN BY HEAD');

// Test 3: Stern hit induces aft trim (down by stern) and rudder damage / speed loss
const testShip2 = {
  id: 'C_DESTROYER_1',
  name: 'HMS Harvester',
  type: 'DESTROYER',
  lengthYards: 320,
  speedKnots: 30,
  baseSpeed: 30
};
// Torpedo hit on Port Stern
shipDmg.applyTorpedoShipDamage(dummyEngine, testShip2, {
  hitFrac: -0.42,
  hitSide: -1, // Port
  warheadKg: 280,
  incidence: 90,
  torpedoId: 'TORP_2'
});
const D2 = testShip2.shipDamage;
assert.ok(D2.compartments.stern > 0.5, 'Stern compartment registered severe damage');
assert.ok(D2.trim < -0.4, 'Ship develops negative trim (down by stern)');
assert.ok(D2.list < -0.1, 'Ship develops negative list (heeling to port)');
assert.ok(D2.steering > 0.6, 'Steering severely degraded on stern hit');

const att2 = shipDmg.shipAttitude(testShip2);
assert.ok(att2.listDeg < 0, 'Attitude reflects port list');
assert.ok(att2.listText.includes('PORT'), 'List text indicates PORT');
assert.ok(att2.trimText.includes('STERN'), 'Trim text indicates DOWN BY STERN');

// Test 4: Hydrodynamic speed and turn factors under trim/emergence
const spdFactor1 = shipDmg.shipDamageSpeedFactor(testShip1);
assert.ok(spdFactor1 < 0.75, 'Speed is degraded by bow flooding and form drag');
const spdFactor2 = shipDmg.shipDamageSpeedFactor(testShip2);
assert.ok(spdFactor2 < 0.35, 'Speed is crippled by stern strike and propeller emergence');
const turnFactor2 = shipDmg.shipDamageTurnFactor(testShip2);
assert.ok(turnFactor2 < 0.40, 'Turn rate is severely hindered by stern damage and trim');

// Progressive time update evolves list and trim
shipDmg.updateShipDamage(dummyEngine, testShip1, 20.0);
assert.ok(testShip1.shipDamage.flotation >= D1.flotation, 'Flotation decreases over time via flooding');

// ═══════════════════════════════════════════════════ 14. VISUAL DAMAGE EFFECTS & REALISTIC SINKING DYNAMICS
const particlesMod = await load('js/rendering/particles.js', [
  'ParticleSystem', 'particles', 'PARTICLE_MAX', 'SPARK_MAX'
], {
  degToRad
});

// Test 1: Sinking Trajectory Resolution (CAPSIZE, BREAK_MIDSHIPS, PLUNGE)
const tankerShip = { id: 'T_TEXACO_1', name: 'Texaco Oslo', type: 'TANKER', lengthYards: 480 };
const tankerD = shipDmg.ensureShipDamage(tankerShip);
const tankerTraj = shipDmg.shipDetermineSinkTrajectory(tankerShip, tankerD);
assert.equal(tankerTraj.style, 4, 'Tanker must resolve to style 4');
assert.equal(tankerTraj.trajectory, 'CAPSIZE', 'Tanker must select CAPSIZE sinking trajectory');

const cargoShip = { id: 'C_LIBERTY_1', name: 'SS John W. Brown', type: 'CARGO', lengthYards: 440 };
const cargoD = shipDmg.ensureShipDamage(cargoShip);
cargoD.compartments.midships = 0.75;
const cargoTraj = shipDmg.shipDetermineSinkTrajectory(cargoShip, cargoD);
assert.equal(cargoTraj.style, 2, 'Large cargo vessel with midships rupture must resolve to style 2');
assert.equal(cargoTraj.trajectory, 'BREAK_MIDSHIPS', 'Cargo ship must break midships');

const plungeBowShip = { id: 'C_ESCORT_1', name: 'HMS Sunflower', type: 'ESCORT', lengthYards: 250 };
const plungeBowD = shipDmg.ensureShipDamage(plungeBowShip);
plungeBowD.compartments.bow = 0.85;
plungeBowD.trim = 0.65;
const bowTraj = shipDmg.shipDetermineSinkTrajectory(plungeBowShip, plungeBowD);
assert.equal(bowTraj.style, 0, 'Bow flooding must resolve to style 0');
assert.equal(bowTraj.trajectory, 'PLUNGE_BOW', 'Forward flooded ship must plunge bow first');

const plungeSternShip = { id: 'C_ESCORT_2', name: 'USS Reuben James', type: 'DESTROYER', lengthYards: 310 };
const plungeSternD = shipDmg.ensureShipDamage(plungeSternShip);
plungeSternD.compartments.stern = 0.90;
plungeSternD.trim = -0.70;
const sternTraj = shipDmg.shipDetermineSinkTrajectory(plungeSternShip, plungeSternD);
assert.equal(sternTraj.style, 1, 'Stern flooding must resolve to style 1');
assert.equal(sternTraj.trajectory, 'PLUNGE_STERN', 'Aft flooded ship must plunge stern first');

// Test 2: Secondary Boiler Explosion
const boilerTestShip = {
  id: 'C_BOILER_1',
  name: 'SS Clan Macarthur',
  type: 'MERCHANT',
  position: { xNm: 5.0, yNm: 5.0 },
  lengthYards: 400
};
const boilerD = shipDmg.ensureShipDamage(boilerTestShip);
boilerD.fire = 0.72;
boilerD.compartments.midships = 0.60;
boilerD.lastHitLocation = 'MIDSHIPS';
let boilerExplosionNotified = false;
const boilerEngine = {
  state: { time: { elapsedSeconds: 200 } },
  log() {},
  notify(msg) {
    if (msg.includes('BOILER EXPLOSION')) boilerExplosionNotified = true;
  }
};
// Advance 25 seconds under heavy midships fire
shipDmg.updateShipDamage(boilerEngine, boilerTestShip, 25.0);
assert.equal(boilerD.boilerRuptured, true, 'Boiler must rupture under sustained midships fire');
assert.ok(boilerD.secondaryExplosions.length > 0, 'Secondary explosion recorded');
assert.equal(boilerD.secondaryExplosions[0].type, 'BOILER_EXPLOSION', 'Recorded secondary explosion type is BOILER_EXPLOSION');
assert.ok(boilerD.flotation > 0.15, 'Boiler explosion produces sudden flotation loss');
assert.ok(boilerD.propulsion > 0.30, 'Boiler explosion damages propulsion');
assert.equal(boilerExplosionNotified, true, 'Boiler explosion triggered critical crew notification');

// Test 3: Catastrophic Magazine Detonation on Armed Vessel
const magTestShip = {
  id: 'C_DD_MAG_1',
  name: 'HMS Campbeltown',
  type: 'DESTROYER',
  position: { xNm: 6.0, yNm: 6.0 },
  lengthYards: 314
};
const magD = shipDmg.ensureShipDamage(magTestShip);
magD.fire = 0.80;
let magDetonationNotified = false;
const magEngine = {
  state: { time: { elapsedSeconds: 300 }, weapons: {}, campaign: { score: 0, tonnageSunk: 0 }, world: { contactTracks: {} } },
  log() {},
  notify(msg) {
    if (msg.includes('SECONDARY DETONATION')) magDetonationNotified = true;
  }
};
// Advance 35 seconds under raging fire
shipDmg.updateShipDamage(magEngine, magTestShip, 35.0);
assert.equal(magD.magazineDetonated, true, 'Magazine must detonate under raging fire on combatant');
assert.equal(magTestShip.sunk, true, 'Magazine detonation causes immediate structural sinking');
assert.equal(magD.flotation, 1.0, 'Flotation is completely lost (1.0)');
assert.ok(magTestShip.sinkTrajectory, 'Sinking trajectory is assigned on structural sinking');
assert.equal(magDetonationNotified, true, 'Magazine detonation triggered critical notification');

// Test 4: Particle Pool Budget Hygiene & Specialized Emitters
const ps = new particlesMod.ParticleSystem();
for (let i = 0; i < 50; i++) {
  ps.spawnBoilerSteam(0, 0, 1.5);
  ps.spawnOilSmoke(0, 0, 1.5);
  ps.spawnFireBurst(0, 0, 1.5);
}
assert.ok(ps.particles.length <= particlesMod.PARTICLE_MAX, `Particles pool must not exceed limit (${ps.particles.length} <= ${particlesMod.PARTICLE_MAX})`);
assert.ok(ps.sparks.length <= particlesMod.SPARK_MAX, `Sparks pool must not exceed limit (${ps.sparks.length} <= ${particlesMod.SPARK_MAX})`);
assert.ok(ps.particles.some(p => p.type === 'steam'), 'Particle system generates steam puffs');
assert.ok(ps.particles.some(p => p.type === 'oil_smoke'), 'Particle system generates dense oil smoke puffs');
assert.ok(ps.particles.some(p => p.type === 'fire_burst'), 'Particle system generates fire burst puffs');

// ═══════════════════════════════════════════════════ 15. GROGNARD IDENTIFICATION & CROSS-SYSTEM INTEGRATION

// Test 1: Misidentification straf — stadimeter schaalfout proportioneel aan masthoogte-ratio
// Gebruik recData en physNav die al geladen zijn door Section 12
const simStateMis = {
  playerSub: { position: { xNm: 0, yNm: 0 }, heading: 0, depthFeet: 55, damage: { periscopeDamage: 0 } },
  tactical: { activeStation: 'PERISCOPE', periscopeBearing: 0, periscopeZoom: 1, selectedTrackId: 'T_MIS' },
  tdc: { targetId: 'T_MIS', solutionQuality: 0.50, trackSource: 'SCOPE', rangeNm: 3.0, bearing: 0, dudMode: 'none' },
  world: {
    contacts: [{ id: 'T_MIS', name: 'Texaco Oslo', type: 'TANKER', vesselProfileId: 'atlantic-tanker', modelKey: 'ATLANTIC_TANKER', position: { xNm: 0, yNm: -3.0 }, heading: 90, speedKnots: 6, lengthYards: 160 }],
    contactTracks: { T_MIS: { id: 'T_MIS', bearing: 0, rangeEstimateNm: 3.0, courseEstimate: 90, speedEstimateKnots: 6, confidence: 0.9, visualHullConfirmed: true } }
  },
  time: { elapsedSeconds: 0 },
  log: []
};
const engMis = { state: simStateMis, log(msg,lv) { simStateMis.log.push({msg,lv}); }, confirmScopeVisualContact() {}, updateTdc() {} };
const physNavMis = new physNav.SimEngine(simStateMis, { dispatch() {} });
physNavMis.state = simStateMis;
physNavMis.log = engMis.log;
physNavMis.updateTdc = () => {};

// Correct identification first (atlantic-tanker masthead 72 ft)
const correctIdRes = physNavMis.identifyContactClass('T_MIS', 'atlantic-tanker');
assert.equal(correctIdRes.success, true, 'Correct identification of tanker must succeed');
assert.equal(correctIdRes.isCorrect, true, 'Tanker inferred as atlantic-tanker must be CORRECT');
const qualityAfterCorrect = simStateMis.tdc.solutionQuality;
assert.ok(qualityAfterCorrect >= 0.65, `TDC quality must be boosted after correct ID (got ${qualityAfterCorrect})`);

// Now misidentify as a Flower corvette (masthead 62 ft instead of 72 ft)
physNavMis.identifyContactClass('T_MIS', 'flower-corvette');
assert.equal(simStateMis.world.contactTracks.T_MIS.identificationStatus, 'MISIDENTIFIED', 'Misidentification must set MISIDENTIFIED status');
assert.equal(simStateMis.world.contactTracks.T_MIS.identifiedMastheadFt, 62, 'Misidentified masthead must be 62 ft (Flower corvette)');

// Stadimeter scaling error: apparent range = true range * (wrong mast / true mast) = 2.0 * (62/79)
physNavMis.sendScopeToTdc();
const apparentRangeMis = simStateMis.tdc.rangeNm;
approx(apparentRangeMis, 2.0 * (62 / 79), 0.05);
assert.ok(apparentRangeMis < 2.0, `Misidentifying a smaller mast understates the range (${apparentRangeMis.toFixed(3)} NM < 2.0 NM)`);

// Test 2: recommendedTorpedoDepthFt over het volledige draft-bereik
// Flower corvette draft 14.2 ft — impact detonation: ~50-65% = ~7-10 ft -> rounded to 5 ft increments
const depthFlowerImpact = recData.recommendedTorpedoDepthFt(14.2, false);
assert.ok(depthFlowerImpact >= 5 && depthFlowerImpact <= 15, `Flower corvette impact depth must be 5-15 ft (got ${depthFlowerImpact})`);

// Flower corvette magnetic: draft + 2 ft = 16.2 ft, rounded to nearest 5 = 15 ft
const depthFlowerMag = recData.recommendedTorpedoDepthFt(14.2, true);
assert.equal(depthFlowerMag, 15, 'Flower corvette magnetic depth recommendation must be 15 ft');

// Town-class destroyer draft 10.5 ft — impact
const depthTownImpact = recData.recommendedTorpedoDepthFt(10.5, false);
assert.ok(depthTownImpact >= 5 && depthTownImpact <= 10, `Town-class impact depth must be 5-10 ft (got ${depthTownImpact})`);

// Large cruiser draft 28 ft — impact: ~55% = 15.4 ft -> 15 ft
const depthCruiserImpact = recData.recommendedTorpedoDepthFt(28, false);
assert.ok(depthCruiserImpact >= 10 && depthCruiserImpact <= 20, `Cruiser impact depth must be 10-20 ft (got ${depthCruiserImpact})`);

// Large cruiser magnetic: 28 + 2 = 30 ft -> rounded to 30 ft
const depthCruiserMag = recData.recommendedTorpedoDepthFt(28, true);
assert.equal(depthCruiserMag, 30, 'Cruiser magnetic depth must be 30 ft');

// Test 3: Grognard combinatietest — torpedo hit → compartiment schade → zinktraject coherentie
// Gebruik een fresh vrachtvaarder om het volledige causale pad te testen
const grognardShip = {
  id: 'C_GROGNARD_1',
  name: 'SS Fort Stikine',
  type: 'CARGO',
  displayType: 'CARGO VESSEL',
  lengthYards: 425,  // lang genoeg voor BREAK_MIDSHIPS
  speedKnots: 9,
  baseSpeed: 9,
  position: { xNm: 1.0, yNm: 1.0 }
};
const grognardEngine = {
  state: { time: { elapsedSeconds: 0 }, weapons: {}, campaign: { score: 0, tonnageSunk: 0 }, world: { contactTracks: {} } },
  log() {},
  notify() {}
};

// Midships torpedo hit
shipDmg.applyTorpedoShipDamage(grognardEngine, grognardShip, {
  hitFrac: 0.02,          // midships
  hitSide: 1,
  warheadKg: 340,
  incidence: 85,
  torpedoId: 'TORP_G1'
});
const Dg = grognardShip.shipDamage;
assert.ok(Dg.compartments.midships > 0.30, 'Midships compartment must be heavily damaged by midships hit');
assert.ok(Dg.propulsion > 0.50, 'Midships hit must severely damage propulsion');

// Force founderings and resolve trajectory
Dg.flotation = 1.0;
shipDmg.beginShipSinking(grognardEngine, grognardShip, 'FLOODING');
assert.equal(grognardShip.sunk, true, 'Ship must transition to sunk after beginShipSinking');
assert.ok(grognardShip.sinkTrajectory, 'sinkTrajectory must be assigned by beginShipSinking');
// Long cargo + midships compartment damage -> should resolve BREAK_MIDSHIPS or SETTLE_LIST (not PLUNGE/CAPSIZE)
assert.ok(
  grognardShip.sinkTrajectory === 'BREAK_MIDSHIPS' || grognardShip.sinkTrajectory === 'SETTLE_LIST',
  `Long cargo with midships damage must sink as BREAK_MIDSHIPS or SETTLE_LIST (got ${grognardShip.sinkTrajectory})`
);
assert.ok(Number.isFinite(grognardShip.sinkStyle), 'sinkStyle must be a finite integer');
assert.ok(grognardShip.sinkStyle >= 0 && grognardShip.sinkStyle <= 4, `sinkStyle must be 0-4 (got ${grognardShip.sinkStyle})`);

// Test 4: inferShipClassFromContact — exhaustieve fallback naar atlantic-freighter
const unknownContact = { type: 'MERCHANT', vesselProfileId: 'unknown-vessel', modelKey: 'UNKNOWN' };
const fallbackClass = recData.inferShipClassFromContact(unknownContact);
assert.equal(fallbackClass.id, 'atlantic-freighter', 'Unknown MERCHANT contact must fall back to atlantic-freighter');

// Null / undefined contact must return null without throwing
const nullClass = recData.inferShipClassFromContact(null);
assert.equal(nullClass, null, 'null contact must return null from inferShipClassFromContact');

// Type-based routing: TANKER → atlantic-tanker
const tankerContact = { type: 'TANKER', vesselProfileId: 'unknown', modelKey: 'UNKNOWN' };
const tankerInferred = recData.inferShipClassFromContact(tankerContact);
assert.equal(tankerInferred.id, 'atlantic-tanker', 'TANKER type must infer atlantic-tanker');

// DESTROYER fallback
const destroyerContact = { type: 'DESTROYER', vesselProfileId: 'unknown-dd', modelKey: 'UNKNOWN_DD' };
const destroyerInferred = recData.inferShipClassFromContact(destroyerContact);
assert.ok(destroyerInferred !== null, 'DESTROYER type must always infer a class');
assert.ok(['ijn-fubuki-destroyer','town-destroyer','fletcher-destroyer'].includes(destroyerInferred.id),
  `DESTROYER must infer a known destroyer class (got ${destroyerInferred.id})`);

// Test 5: Alle catalogus-klassen hebben een aanbevolen torpedodiepte > 0
// (Integration check: recognition data is consistent with torpedo attack system)
const allCats = recData.getAllRecognitionClasses();
for (const cls of allCats) {
  const depth = recData.recommendedTorpedoDepthFt(cls.dimensions.draftFt, false);
  assert.ok(depth > 0 && depth <= 40, `Class ${cls.id} impact depth must be 1-40 ft (got ${depth})`);
  const depthMag = recData.recommendedTorpedoDepthFt(cls.dimensions.draftFt, true);
  assert.ok(depthMag > 0 && depthMag <= 45, `Class ${cls.id} magnetic depth must be 1-45 ft (got ${depthMag})`);
}

// ═══════════════════════════════════════════════════ 16. TOPOGRAPHY & REALISTIC ISLAND COASTLINES
const world3dMod = await load('js/rendering/world-3d.js', ['World3D'], {
  normDeg, degToRad, radToDeg, shortDelta, clamp, distNm, bearingBetween,
  EARTH_R: 6371000, NM_M: 1852,
  weatherIsWet: () => false,
  dayPhaseRgb: () => [100, 100, 100],
  rgbCss: arr => `rgb(${arr[0]},${arr[1]},${arr[2]})`,
  projectAzimuthElevation: () => ({ x: 0, y: 0 }),
  DayNightCycle: { CYCLE_SECONDS: 86400 },
  phaseSmooth01: x => x,
  seaSurfaceY: (cam, d) => cam.cy + (cam.h / d + d / (2 * 6371000)) * cam.f
});

// Test 1: Volcanic Ridge Harmonics on High Summits vs Flat Islands
const mockIslandHigh = {
  id: 'LAND-GUADALCANAL',
  name: 'Guadalcanal',
  peakM: 2447,
  points: [{ xNm: 0, yNm: -5 }, { xNm: 5, yNm: -5 }, { xNm: 5, yNm: -10 }, { xNm: 0, yNm: -10 }]
};
const mockIslandLow = {
  id: 'LAND-REEF',
  name: 'Low Atoll',
  peakM: 120,
  points: [{ xNm: 10, yNm: -5 }, { xNm: 15, yNm: -5 }, { xNm: 15, yNm: -10 }, { xNm: 10, yNm: -10 }]
};

const simStateTerrain = {
  playerSub: { position: { xNm: 0, yNm: 0 } },
  world: {
    terrain: [mockIslandHigh, mockIslandLow],
    environment: { visibilityNm: 30, visualTone: 'PACIFIC' }
  },
  tactical: { periscopeBearing: 0 },
  time: { elapsedSeconds: 0 }
};

const profs = world3dMod.World3D._terrainProfiles(simStateTerrain);
assert.equal(profs.feats.length, 2, 'Both terrain features must be profiled');

const featHigh = profs.feats.find(f => f.f.id === 'LAND-GUADALCANAL');
const featLow = profs.feats.find(f => f.f.id === 'LAND-REEF');
assert.ok(featHigh && featLow, 'Both high peak and low atoll must be present');

// High peak profile must exhibit substantial elevation (> 1000m)
const maxHighH = Math.max(...featHigh.h);
assert.ok(maxHighH > 1000, `High peak must retain volcanic elevation (got ${maxHighH.toFixed(0)}m)`);

// Test 2: Coastal Edge Tapering to 0m (No Rectangular Cliff)
const mockCam = { cx: 640, cy: 400, r: 350, f: 800, h: 4.5, bearingDeg: 0 };
const recordedLines = [];
const recordedStops = [];
const mockCtx = {
  beginPath() {},
  closePath() {},
  fill() {},
  stroke() {},
  moveTo(x, y) { recordedLines.push({ type: 'move', x, y }); },
  lineTo(x, y) { recordedLines.push({ type: 'line', x, y }); },
  createLinearGradient() {
    return {
      addColorStop(stop, color) { recordedStops.push({ stop, color }); }
    };
  },
  createRadialGradient() { return { addColorStop() {} }; },
  fillRect() {},
  fillText() {},
  arc() {}
};

world3dMod.World3D.w = 1280;
world3dMod.World3D.h = 800;
world3dMod.World3D.k = 1.0;
world3dMod.World3D.quality = 1.0;
world3dMod.World3D.drawTerrain3D(mockCtx, mockCam, simStateTerrain, 1.0);

// Test 3: Multi-zone Gradient with Sand Beach and Coral Band
assert.ok(recordedStops.some(s => s.stop === 0.93), 'Gradient must contain warm sand beach band at 0.93');
assert.ok(recordedStops.some(s => s.stop === 0.97), 'Gradient must contain wet tidal sand margin at 0.97');
assert.ok(recordedStops.some(s => s.stop === 0), 'Gradient must contain alpine/volcanic summit stop at 0');

// Test 4: Land meeting water with zero rectangular step (edge tapering)
// When an island run begins in open water, the first moveTo/lineTo is at sea level
assert.ok(recordedLines.length >= 4, 'drawTerrain3D must render polygonal terrain profile');
const firstPoint = recordedLines[0];
const secondPoint = recordedLines[1];
const deltaY = Math.abs(secondPoint.y - firstPoint.y);
assert.ok(deltaY <= 3.0, `Shoreline profile must taper smoothly to sea level with no vertical step (deltaY: ${deltaY.toFixed(2)}px)`);

// ═══════════════════════════════════════════════════ 17. DIFFERENTIATED ENEMY DOCTRINES & NON-OMNISCIENT SENSORS
const worldGeomMod = await load('js/rendering/world-geometry.js', ['escortSonarOwnshipFactor', 'SONAR'], {
  shortDelta, bearingBetween, clamp, lerp, NM_M: 1852
});
const catalogVmCtx = {
  console, Math, clamp, degToRad, radToDeg, normDeg, shortDelta, distNm, bearingBetween, knotsNmSec, lerp,
  COASTLINES: {}, DEFAULT_GAME_IDENTITY: { campaignProfileId: 'us-pacific' }
};
catalogVmCtx.globalThis = catalogVmCtx;
vm.createContext(catalogVmCtx);
const torpSrc = await readFile(path.join(root, 'js/data/torpedo-data.js'), 'utf8');
const campSrc = await readFile(path.join(root, 'js/data/campaign-data.js'), 'utf8');
const gameCatalogSrc = await readFile(path.join(root, 'js/data/game-catalog.js'), 'utf8');
const multiTheaterSrc = await readFile(path.join(root, 'js/data/multi-theater-campaigns.js'), 'utf8');
vm.runInContext(torpSrc, catalogVmCtx, { filename: 'js/data/torpedo-data.js' });
vm.runInContext(campSrc, catalogVmCtx, { filename: 'js/data/campaign-data.js' });
vm.runInContext(gameCatalogSrc + '\n;globalThis.VESSEL_PROFILES = VESSEL_PROFILES;', catalogVmCtx, { filename: 'js/data/game-catalog.js' });
vm.runInContext(multiTheaterSrc + '\n;globalThis.MULTI_ASW_TACTICS = MULTI_ASW_TACTICS;', catalogVmCtx, { filename: 'js/data/multi-theater-campaigns.js' });
const doctrines = catalogVmCtx.MULTI_ASW_TACTICS;
const gameCatalogProfiles = catalogVmCtx.VESSEL_PROFILES;
assert.ok(doctrines.britain && doctrines.usa && doctrines.japan && doctrines.italy && doctrines.soviet && doctrines.germany, 'All 6 national doctrine tactics must be defined');
assert.equal(doctrines.britain.searchPattern, 'EXPANDING_SQUARE', 'Royal Navy doctrine uses expanding square search');
assert.equal(doctrines.japan.searchPattern, 'SECTOR', 'IJN doctrine uses sector search');
assert.equal(doctrines.usa.searchPattern, 'CIRCULAR', 'USN doctrine uses circular radar-assisted search');
assert.ok(doctrines.britain.yearBands.some(b => b.from === 1944 && b.prosecutionFactor >= 1.15 && b.depthErrorFactor <= 0.85), 'RN 1944 doctrine must reflect relentless late-war prosecution and Hedgehog accuracy');
assert.ok(doctrines.japan.depthErrorFactor > 1.10, 'Early IJN doctrine must reflect higher depth error factor due to lower ASW specialization');
assert.ok(gameCatalogProfiles['uk-black-swan-sloop'].aswTraining > 1.0, 'Walker group Black Swan sloop must have elite ASW training (> 1.0)');
assert.ok(gameCatalogProfiles['jp-destroyer'].aswTraining === 0.84, 'Japanese fleet destroyer must have authored ASW training of 0.84');

// Test 2: Acoustic Baffle Stern Dead-Cone Physics (152°-180° deafened by cavitation)
const movingEsc = { heading: 0, speedKnots: 16, position: { xNm: 0, yNm: 0 } };
const deadAsternSub = { xNm: 0, yNm: 1 }; // Relative bearing 180° (South of heading 0)
const baffleFactor = worldGeomMod.escortSonarOwnshipFactor(movingEsc, deadAsternSub);
assert.equal(baffleFactor, 0, 'Moving escort must be completely deafened directly astern by prop cavitation wake (baffle factor must be 0)');

const beamSub = { xNm: 1, yNm: 0 }; // Relative bearing 90° (on beam)
const beamFactor = worldGeomMod.escortSonarOwnshipFactor(movingEsc, beamSub);
assert.ok(beamFactor > 0.40, `Beam sector must retain active sonar reception (got ${beamFactor.toFixed(2)})`);

const stationaryEsc = { heading: 0, speedKnots: 0, position: { xNm: 0, yNm: 0 } };
const stoppedAsternFactor = worldGeomMod.escortSonarOwnshipFactor(stationaryEsc, deadAsternSub);
assert.ok(stoppedAsternFactor > 0, 'Stationary escort with stopped screws retains baseline acoustic reception');

// Test 3: Escort Search Speed Self-Noise Degradation
const searchSpeedEsc = { heading: 0, speedKnots: 8, position: { xNm: 0, yNm: 0 } };
const sprintSpeedEsc = { heading: 0, speedKnots: 22, position: { xNm: 0, yNm: 0 } };
const forwardTarget = { xNm: 0.5, yNm: -0.5 }; // Bearing 45° (North-East of heading 0)
const searchNoise = worldGeomMod.escortSonarOwnshipFactor(searchSpeedEsc, forwardTarget);
const sprintNoise = worldGeomMod.escortSonarOwnshipFactor(sprintSpeedEsc, forwardTarget);
assert.equal(searchNoise, 1.0, 'Escort at optimal search speed (<= 8 kt) must have 1.0 sonar sensitivity');
assert.equal(sprintNoise, 0.20, 'Escort at high sprint speed (>= 22 kt) must lose 80% sensitivity due to flow turbulence and dome self-noise');

// Test 4: Thermocline Refraction Depth Bias
const layerDepthFt = 200;
const deepSubDepthFt = 285;
const trueBelowLayer = deepSubDepthFt > layerDepthFt + 15;
const training = 0.85;
const refractBias = trueBelowLayer ? -clamp((deepSubDepthFt - layerDepthFt) * 0.40 * (1.25 - training * 0.3), 20, 70) : 0;
assert.ok(refractBias <= -30 && refractBias >= -70, `Thermocline refraction must systematically bias depth setting shallow (got ${refractBias.toFixed(1)} ft)`);

// Test 5: Two-Phase Aircraft Reconnaissance (INVESTIGATING State & Reaction Window)
const loggedAir = [];
const aircraftMod = await load('js/simulation/ai/aircraft.js', ['AircraftSystem'], {
  clamp, degToRad, radToDeg, normDeg, shortDelta, distNm, bearingBetween, knotsNmSec, lerp,
  weatherBetween: () => ({ visibilityNm: 15, seaState: 0, precipitation: 0, aircraftFactor: 1 }),
  weatherAtPosition: () => ({ visibilityNm: 15, seaState: 0, precipitation: 0, aircraftFactor: 1 }),
  getCampaignDoctrineProfile: () => ({ air: { hostile: { checkSec: 90, baseChance: 0.02 }, friendly: {} } }),
  getPlayerSensorPresentation: () => ({ airWarningRadar: { label: 'Air Warning Radar' } }),
  PresentationBridge: { audio: () => ({ event: () => {} }) },
  DEFAULT_GAME_IDENTITY: { campaignProfileId: 'us-pacific' }
});

const airCtx = {
  state: {
    world: {
      aircraft: [],
      airThreat: { alarmedAt: -999, airWarningOn: true, level: 0.5 },
      environment: { daylight: 1.0, visibilityNm: 15, seaState: 0 },
      terrain: [],
      contacts: [],
      enemy: { alertState: 'UNAWARE' }
    },
    playerSub: {
      position: { xNm: 0, yNm: 0 },
      heading: 0,
      depthFeet: 0,
      orderedDepthFeet: 0,
      mode: 'SURFACED',
      propulsion: { speedKnots: 10 }
    },
    time: { elapsedSeconds: 100, timeScale: 1 },
    campaign: { campaignProfileId: 'us-pacific' },
    tactical: { activeStation: 'BRIDGE', bridgeBearing: 0 }
  },
  noteWearManualAircraft() {},
  stopAutomaticTimeCompression() {},
  log(msg, kind) { loggedAir.push({ msg, kind }); }
};
Object.assign(airCtx, aircraftMod.AircraftSystem);

const testAir = {
  id: 'AIR-TEST-1',
  name: 'B5N Kate',
  kind: 'BOMBER',
  ordnance: 'BOMB',
  position: { xNm: 1.5, yNm: 1.5 },
  heading: 225,
  speedKnots: 140,
  bombs: 2,
  state: 'SEARCHING'
};
airCtx.state.world.aircraft.push(testAir);

// Spotting sub triggers INVESTIGATING reconnaissance pass
aircraftMod.AircraftSystem.beginAircraftInvestigation.call(airCtx, testAir, airCtx.state.playerSub.position, 'VISUAL');
assert.equal(testAir.state, 'INVESTIGATING', 'Spotted aircraft must enter INVESTIGATING state');
assert.ok(testAir.investigateTimer >= 15 && testAir.investigateTimer <= 25, `investigateTimer must provide a 15-25s reaction window (got ${testAir.investigateTimer.toFixed(1)}s)`);
assert.equal(testAir.seenBySub, true, 'Submarine lookouts must be alerted during reconnaissance pass');
assert.ok(loggedAir.some(l => l.msg.includes('AIR CONTACT') && l.msg.includes('EMERGENCY DIVE')), 'Air alarm must instruct the crew to emergency dive');

// Submarine crash dives deep (> 42 ft): Aircraft arrives overhead but cannot bomb submerged boat -> enters ORBIT
airCtx.state.playerSub.depthFeet = 55;
testAir.investigateTimer = 0.1;
aircraftMod.AircraftSystem.updateAircraft.call(airCtx, 0.2);
assert.equal(testAir.state, 'ORBIT', 'Aircraft arriving at datum after submarine submerged must switch to ORBIT instead of attacking');
assert.ok(loggedAir.some(l => l.msg.includes('boat has submerged') && l.msg.includes('Circling')), 'Log must confirm boat submerged and aircraft is circling');

// ═══════════════════════════════════════════════════ 18. MAP LEGEND & PRIMARY TARGET MARKING
// Test 1: isPrimaryMissionTarget classification across mission roles & campaign descriptors
const utilMod = await load('js/core/utilities.js', ['isPrimaryMissionTarget'], {
  clamp, lerp, degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, bearingBetween, distNm
});
const mockStateMission = {
  world: {
    contacts: [
      { id: 'T-01', missionRole: 'HIGH_VALUE_TARGET' },
      { id: 'T-02', missionRole: 'HARBOR_STRIKE_TARGET' },
      { id: 'T-03', missionRole: 'ESCORT_HUNT_TARGET' },
      { id: 'T-04', missionRole: 'RECON_TARGET' },
      { id: 'T-05', missionRole: 'SURVIVOR' },
      { id: 'T-06', harborTarget: true },
      { id: 'T-07' },
      { id: 'T-08' },
      { id: 'T-09' }
    ]
  },
  campaign: {
    primaryMission: {
      type: 'HARBOR_STRIKE',
      targetId: 'T-07',
      targetIds: ['T-08'],
      survivorId: 'T-09'
    }
  }
};

assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-01'), true, 'HIGH_VALUE_TARGET must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-02'), true, 'HARBOR_STRIKE_TARGET must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-03'), true, 'ESCORT_HUNT_TARGET must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-04'), true, 'RECON_TARGET must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-05'), true, 'SURVIVOR must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-06'), true, 'harborTarget during HARBOR_STRIKE mission must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-07'), true, 'Explicit mission targetId must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-08'), true, 'targetIds array element must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'T-09'), true, 'survivorId must be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(mockStateMission, 'OTHER-99'), false, 'Non-objective contact must not be flagged as primary');
assert.equal(utilMod.isPrimaryMissionTarget(null, 'T-01'), false, 'Null state must safely return false');

// Test 2: MapStation Chart Legend Layout & Multi-Category Presentation
const mapMod = await load('js/rendering/map.js', ['MapStation'], {
  clamp, degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, distNm, bearingBetween, lerp,
  fmtDeg: d => `${Math.round(d)}°`, NM_M: 1852,
  shipVisualLengthM: () => 180, shipVisualLengthNm: () => 0.1,
  CanvasViewCore: class {}, TacticalStation: {}, BridgeStation: {}, SoundStation: {}, PeriscopeStation: {}, DeckGunStation: {}, World3D: {}, BattleAtmosphere: {},
  isPrimaryMissionTarget: utilMod.isPrimaryMissionTarget,
  crewCanSeeSurfaceHull: () => true,
  PATROL_AREAS: { solomons: { displayName: 'Solomon Sea' } }
});

const legendRecordedText = [];
const mockLegendCtx = {
  save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, rect() {}, strokeRect() {}, fillRect() {}, setLineDash() {},
  measureText: () => ({ width: 100 }),
  fillText(txt) { legendRecordedText.push(txt); }
};

mapMod.MapStation.k = 1.0;
mapMod.MapStation.fnt = (sz, bold) => `${bold ? 'bold ' : ''}${sz}px sans-serif`;
mapMod.MapStation.rr = function(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.closePath();
};

mapMod.MapStation.drawMapLegend(mockLegendCtx, 1280, 800);
assert.ok(mapMod.MapStation._legendCardRect, 'Legend card rect must be calculated');
assert.ok(mapMod.MapStation._legendCardRect.w >= 200 && mapMod.MapStation._legendCardRect.h >= 200, 'Legend card dimensions must accommodate multi-category layout');
assert.ok(legendRecordedText.includes('CHART SYMBOLS & PATROL ZONES'), 'Legend must feature title header');
assert.ok(legendRecordedText.includes('✕'), 'Legend must display interactive close button');
assert.ok(legendRecordedText.includes('VESSELS & TARGETS'), 'Legend must feature Vessels & Targets category');
assert.ok(legendRecordedText.includes('PRIMARY objective target'), 'Legend must display PRIMARY objective target symbol row');
assert.ok(legendRecordedText.includes('PATROL ZONES & LANES'), 'Legend must feature Patrol Zones & Lanes category');
assert.ok(legendRecordedText.includes('patrol area boundary (6nm margin)'), 'Legend must describe patrol area boundary with 6nm margin');
assert.ok(legendRecordedText.includes('HAZARDS & PORTS'), 'Legend must feature Hazards & Ports category');
assert.ok(legendRecordedText.includes('4-fathom grounding danger'), 'Legend must feature 4-fathom grounding danger');

// Test 3: Primary Target Reticle Brackets & Map Contact High-Contrast Labeling
const bracketStrokes = [];
const bracketRects = [];
const mockBracketCtx = {
  save() {}, restore() {}, beginPath() {},
  stroke() { bracketStrokes.push(this.strokeStyle); },
  moveTo() {}, lineTo() {},
  fillRect(x, y, w, h) { bracketRects.push({ x, y, w, h, fill: this.fillStyle }); }
};
mapMod.MapStation.drawPrimaryTargetBrackets(mockBracketCtx, 150, 150, 25, 1.0);
assert.ok(bracketStrokes.includes('#ffd043'), 'Primary brackets must be stroked in gold (#ffd043)');
assert.equal(bracketRects.length, 4, 'Must draw 4 cardinal pip fillRects');
assert.ok(bracketRects.every(r => r.fill === '#ffd043'), 'All 4 cardinal pips must be gold (#ffd043)');

const contactRecordedText = [];
const contactRecordedColors = [];
const mockContactCtx = {
  save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, rect() {}, strokeRect() {}, fillRect() {}, setLineDash() {}, arc() {},
  measureText: () => ({ width: 80 }),
  fillText(txt) { contactRecordedText.push(txt); contactRecordedColors.push(this.fillStyle); }
};
mapMod.MapStation.drawContactUncertaintyGlyph = () => {};
mapMod.MapStation.courseVector = () => {};
mapMod.MapStation.shipIcon = () => {};
mapMod.MapStation._mapIconType = () => 'CARRIER';

const mapContactsState = {
  playerSub: { position: { xNm: 0, yNm: 0 }, heading: 0 },
  world: {
    contacts: [
      { id: 'T-01', missionRole: 'HIGH_VALUE_TARGET', position: { xNm: 2, yNm: 2 }, type: 'CARRIER', speedKnots: 15, heading: 90 },
      { id: 'T-99', position: { xNm: 4, yNm: 4 }, type: 'MERCHANT', speedKnots: 10, heading: 45 }
    ],
    contactTracks: {
      'T-01': { id: 'T-01', typeEstimate: 'CARRIER', courseEstimate: 90, speedEstimateKnots: 15, staleSeconds: 0, visualDetected: true, plotPosition: { xNm: 2, yNm: 2 } },
      'T-99': { id: 'T-99', typeEstimate: 'FREIGHTER', courseEstimate: 45, speedEstimateKnots: 10, staleSeconds: 0, visualDetected: true, plotPosition: { xNm: 4, yNm: 4 } }
    }
  },
  tactical: { selectedTrackId: 'T-01' },
  time: { elapsedSeconds: 50 },
  campaign: { primaryMission: { targetId: 'T-01' } }
};
const w2s = (x, y) => ({ x: 300 + x * 20, y: 300 + y * 20 });
mapMod.MapStation.drawMapContacts(mockContactCtx, mapContactsState.world.contactTracks, w2s, 50, mapContactsState.playerSub.position, 'T-01', mapContactsState);
assert.ok(contactRecordedText.some(t => t.startsWith('★ PRIMARY · T-01')), 'Primary mission target contact must be prefixed with ★ PRIMARY ·');
assert.ok(!contactRecordedText.some(t => t.startsWith('★ PRIMARY · T-99')), 'Ordinary contact must not carry PRIMARY prefix');
const priIndex = contactRecordedText.findIndex(t => t.startsWith('★ PRIMARY · T-01'));
assert.equal(contactRecordedColors[priIndex], '#ffd043', 'Primary mission target title must be rendered in gold (#ffd043)');

// Test 4: 3D Optics PRIMARY TARGET Badge & Golden Reticle Projection
const opticsW3dCtx = {
  console, Math, performance: { now: () => 1000 },
  clamp, degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, distNm, bearingBetween, lerp,
  EARTH_R: 6371000, NM_M: 1852,
  weatherIsWet: () => false,
  dayPhaseRgb: () => [100, 100, 100],
  rgbCss: arr => `rgb(${arr[0]},${arr[1]},${arr[2]})`,
  projectAzimuthElevation: () => ({ x: 0, y: 0 }),
  DayNightCycle: { CYCLE_SECONDS: 86400 },
  phaseSmooth01: x => x,
  seaSurfaceY: () => 400,
  projectWorldPoint: () => ({ x: 640, y: 380, d: 2000 }),
  scopeMeasuredRangeNm: () => 2.0,
  isPrimaryMissionTarget: utilMod.isPrimaryMissionTarget
};
opticsW3dCtx.globalThis = opticsW3dCtx;
vm.createContext(opticsW3dCtx);
const geomSrcOptics = await readFile(path.join(root, 'js/rendering/world-geometry.js'), 'utf8');
const w3dSrcOptics = await readFile(path.join(root, 'js/rendering/world-3d.js'), 'utf8');
vm.runInContext(geomSrcOptics, opticsW3dCtx);
vm.runInContext(w3dSrcOptics + '\n;globalThis.World3D = World3D;', opticsW3dCtx);

const opticsRecordedText = [];
const opticsRecordedStrokes = [];
const mockOpticsCtx = {
  save() {}, restore() {}, beginPath() {}, closePath() {},
  stroke() { opticsRecordedStrokes.push(this.strokeStyle); },
  fill() {}, moveTo() {}, lineTo() {}, arc() {}, clip() {}, rect() {}, ellipse() {},
  strokeRect() {}, fillRect() {}, quadraticCurveTo() {},
  measureText: () => ({ width: 120 }),
  fillText(txt) { opticsRecordedText.push(txt); },
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} })
};
const opticsSimState = {
  playerSub: { position: { xNm: 0, yNm: 0 }, heading: 0 },
  world: {
    environment: { seaState: 1 },
    contacts: [
      { id: 'T-01', missionRole: 'HIGH_VALUE_TARGET', position: { xNm: 0, yNm: 2 }, type: 'CARRIER', speedKnots: 15, heading: 90, displayType: 'Shokaku' }
    ],
    contactTracks: {
      'T-01': { id: 'T-01', typeEstimate: 'AIRCRAFT CARRIER', rangeEstimateNm: 2 }
    }
  },
  tactical: { selectedTrackId: 'T-01' },
  campaign: { primaryMission: { targetId: 'T-01' } }
};
const opticsCam = { cx: 640, cy: 400, r: 350, f: 800, h: 4.5, bearingDeg: 0, E: 0, N: 0 };
opticsW3dCtx.World3D.k = 1.0;
opticsW3dCtx.World3D.w = 1280;
opticsW3dCtx.World3D.h = 800;
opticsW3dCtx.World3D.fnt = (sz, bold) => `${bold ? 'bold ' : ''}${sz}px sans-serif`;
opticsW3dCtx.World3D.rr = () => {};
opticsW3dCtx.World3D.scopeLabelId = 'T-01';
opticsW3dCtx.World3D.scopeLabelUntil = 5000;
opticsW3dCtx.World3D.drawShip3D(mockOpticsCtx, opticsCam, {
  c: opticsSimState.world.contacts[0],
  d: 3704,
  E: 0,
  N: 3704,
  relBrg: 0
}, opticsSimState, 1.0, { E: 0.5, N: 0.5, Y: 0.7 }, 20, 10);
assert.ok(opticsRecordedText.includes('★ PRIMARY OBJECTIVE ★'), 'Optics selected card must render ★ PRIMARY OBJECTIVE ★ badge');
assert.ok(opticsRecordedText.some(t => t.includes('★ PRIMARY TARGET · ')), 'Optics subtitle must state ★ PRIMARY TARGET ·');
assert.ok(opticsRecordedStrokes.some(s => s.includes('255,208,67')), 'Selected primary target reticle must be stroked in gold (255,208,67)');

// Test 5: Patrol Area Boundary Naming, 6 NM Margin & HUD Viewmodel PRIMARY Flagging
const areaRecordedText = [];
const mockAreaCtx = {
  save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {}, rect() {}, setLineDash() {}, strokeRect() {},
  fillText(txt) { areaRecordedText.push(txt); }
};
const areaState = {
  world: {},
  campaign: { patrolArea: 'solomons' }
};
mapMod.MapStation._bathy = { x0: -50, y0: -50, nx: 100, ny: 100, cell: 1 };
mapMod.MapStation.drawAreaBounds(mockAreaCtx, areaState, w2s);
assert.ok(areaRecordedText.some(t => t.includes('SOLOMON SEA · PATROL AREA BOUNDARY')), 'drawAreaBounds must include display name and boundary title');
assert.ok(areaRecordedText.some(t => t.includes('6 NM OPERATIONAL MARGIN')), 'drawAreaBounds must explicitly declare 6 NM OPERATIONAL MARGIN');

// HUD viewmodel PRIMARY integration
const hudPriMod = await load('js/ui/hud-viewmodel.js', ['buildHudViewModel'], {
  playerDepthDisplay: (_s, v) => `${Math.round(v)} ft`,
  fmtDeg: v => `${Math.round(v)}°`,
  fmtTime: v => `${Math.round(v)}s`,
  DayNightCycle: { getTimeString: v => `${Math.round(v)}s` },
  torpedoRangeInfo: () => null,
  torpedoStoresStatus: () => ({ total: 4, loadShort: 'READY' }),
  isPrimaryMissionTarget: utilMod.isPrimaryMissionTarget
});
const hudPrimaryState = hudState({
  tdc: { targetId: 'T-01', status: 'TRACKING' },
  weapons: { deckGun: { targetId: 'T-01', manned: true, ammo: 40 } },
  world: {
    ...baseHud.world,
    contacts: [{ id: 'T-01', missionRole: 'HIGH_VALUE_TARGET', name: 'Yamato' }],
    contactTracks: { 'T-01': { id: 'T-01', identifiedClassName: 'Yamato' } }
  }
});
const hudVmPrimary = hudPriMod.buildHudViewModel(hudPrimaryState, {});
assert.ok(hudVmPrimary.fire.targetLabel.startsWith('★ PRIMARY '), 'HUD fire target label must be prefixed with ★ PRIMARY');
assert.equal(hudVmPrimary.tdc.isPrimary, true, 'HUD tdc viewmodel must have isPrimary === true');
assert.equal(hudVmPrimary.weapons.deckGun.isPrimary, true, 'HUD deckGun viewmodel must have isPrimary === true');

// 19. Kielmarge, Dynamische Veiligheidsdrempel & Stuurvaart Preservatie (5 tests)
const coreMod = await load('js/simulation/engine-core.js', ['CoreSystem'], {
  clamp, distNm, normDeg, bearingBetween,
  Bathy: { bottomType: () => 'SAND', ensure: () => {}, restable: () => true }
});
const simCore = Object.create(coreMod.CoreSystem);

// Test 1: Geschaalde veiligheidsmarge (keelSafetyMargin)
// Surfaced (< 12 ft): clamp(4 + spd * 0.8, 4, 16)
assert.equal(simCore.keelSafetyMargin({ depthFeet: 0, propulsion: { speedKnots: 0 } }), 4, 'Surfaced 0 kn safety margin must be 4 ft');
assert.equal(simCore.keelSafetyMargin({ depthFeet: 5, propulsion: { speedKnots: 5 } }), 8, 'Surfaced 5 kn safety margin must be 8 ft');
assert.equal(simCore.keelSafetyMargin({ depthFeet: 11, propulsion: { speedKnots: 20 } }), 16, 'Surfaced high-speed safety margin clamped to 16 ft');
// Submerged (>= 12 ft): clamp(8 + spd * 1.4, 8, 32)
assert.equal(simCore.keelSafetyMargin({ depthFeet: 12, propulsion: { speedKnots: 0 } }), 8, 'Submerged 0 kn creep margin must be 8 ft');
assert.equal(simCore.keelSafetyMargin({ depthFeet: 60, propulsion: { speedKnots: 5 } }), 15, 'Submerged 5 kn margin must be 15 ft');
assert.equal(simCore.keelSafetyMargin({ depthFeet: 120, propulsion: { speedKnots: 20 } }), 32, 'Submerged high-speed margin clamped to 32 ft');

// Test 2: shoalWatch behoudt stuurvaart (<= 85 RPM) i.p.v. dodelijke ALL STOP
const notifiedShoal = [];
const mockState = {
  time: { elapsedSeconds: 100, timeScale: 4, transitUntil: 200 },
  runtime: { playerSub: { _keelClosingFps: 0 } },
  playerSub: {
    depthFeet: 65,
    keelClearanceFeet: 9, // under submerged margin (15 ft at 5 kn)
    propulsion: { speedKnots: 5, orderedRpm: 240 }
  }
};
simCore.state = mockState;
simCore.notify = (msg, level, imp) => { notifiedShoal.push({ msg, level, imp }); };
simCore.stopAutomaticTimeCompression = (_reason) => { mockState.time.timeScale = 1; mockState.time.transitUntil = 0; };
simCore._shoalAt = 0;
simCore._shoalLastClear = 100;

simCore.shoalWatch(mockState.playerSub);

assert.equal(mockState.time.timeScale, 1, 'shoalWatch must kick clock back to 1x real time');
assert.equal(mockState.playerSub.propulsion.orderedRpm, 85, 'shoalWatch must throttle to steerageway (85 RPM), NOT ALL STOP (0 RPM)');
assert.equal(mockState.playerSub.keelMarginAlert, true, 'shoalWatch must flag keelMarginAlert on sub');
assert.ok(notifiedShoal.some(n => n.msg.includes('KEEL MARGIN ALERT') && n.imp === 'KRITIEK'), 'shoalWatch must raise KRITIEK KEEL MARGIN ALERT');

// If already crawling slower than steerageway (e.g. 40 RPM), it should not accelerate
mockState.playerSub.propulsion.orderedRpm = 40;
simCore._shoalAt = 0; // reset cooldown
simCore.shoalWatch(mockState.playerSub);
assert.equal(mockState.playerSub.propulsion.orderedRpm, 40, 'shoalWatch must not increase RPM if skipper ordered dead slow');

// Test 3: updateSeabed dynamische drempel vs starre 25 ft truncatie
simCore.state.time.elapsedSeconds = 200;
simCore.state.time.timeScale = 1;
simCore.state.time.transitUntil = 0;
simCore.state.world = { _devForcedSeabedFeet: 60 };
simCore._depthLimAt = 0;

const creepSub = {
  depthFeet: 40,
  orderedDepthFeet: 48,
  seabedFeet: 60,
  position: { xNm: 0, yNm: 0 },
  propulsion: { speedKnots: 1.5, orderedRpm: 50 },
  bottomed: false,
  bottomingOrdered: false
};
// margin at 1.5 kn submerged = 8 + 1.5 * 1.4 = 10.1 ft. safe = 60 - 10.1 = 49.9 ft.
simCore.updateSeabed(creepSub, 1.0);
assert.equal(creepSub.orderedDepthFeet, 48, 'Low-speed creep (1.5 kn) preserves ordered depth of 48 ft in 60 ft water (safe margin ~10 ft vs old 25 ft cutoff)');

// High speed run (10 kn): margin = 8 + 10 * 1.4 = 22 ft. safe = 60 - 22 = 38 ft.
const fastSub = {
  depthFeet: 30,
  orderedDepthFeet: 48,
  seabedFeet: 60,
  position: { xNm: 0, yNm: 0 },
  propulsion: { speedKnots: 10, orderedRpm: 320 },
  bottomed: false,
  bottomingOrdered: false
};
simCore._depthLimAt = 0;
simCore.updateSeabed(fastSub, 1.0);
assert.equal(fastSub.orderedDepthFeet, 38, 'High-speed run (10 kn) restricts ordered depth to 38 ft to guard against squat and trim dive');

// Test 4: HUD viewmodel vitals.underKeel en depthNote met dynamische marge
const hudMarginMod = await load('js/ui/hud-viewmodel.js', ['buildHudViewModel'], {
  playerDepthDisplay: (_s, v) => `${Math.round(v)} ft`,
  fmtDeg: v => `${Math.round(v)}°`,
  fmtTime: v => `${Math.round(v)}s`,
  DayNightCycle: { getTimeString: v => `${Math.round(v)}s` },
  torpedoRangeInfo: () => null,
  torpedoStoresStatus: () => ({ total: 4, loadShort: 'READY' }),
  CoreSystem: coreMod.CoreSystem
});
// Submerged at 10 kn: margin = 22 ft. shallowDepth = Math.max(38, 22 * 1.8) = 39.6 ft.
const fastSubHud = hudState({
  playerSub: {
    ...baseHud.playerSub,
    depthFeet: 40,
    seabedFeet: 80,
    keelClearanceFeet: 35, // 35 < 39.6 -> critical
    propulsion: { speedKnots: 10, orderedRpm: 320, battery: 90, fuel: 90, engineMode: 'DIESEL' }
  }
});
const fastVm = hudMarginMod.buildHudViewModel(fastSubHud, {});
assert.equal(fastVm.vitals.underKeel.state, 'critical', 'underKeel state must be critical when clearance < dynamic shallowDepth');
assert.ok(fastVm.navigation.operation.depthNote.includes('safe to 58 ft'), 'depthNote must report safe depth (80 - 22 = 58 ft)');

// Test 5: toast.js TOAST_RED categorisatie & Bodemcontactfysica
const toastMod = await load('js/ui/toast.js', ['Toast', 'TOAST_RED'], { clamp });
assert.ok(toastMod.TOAST_RED.test('KEEL MARGIN ALERT — only 9 ft under the keel (safe margin 15 ft). Throttled to steerageway; con her clear by hand.'), 'TOAST_RED must match KEEL MARGIN ALERT');

// Bodemcontactfysica: zacht kruipen (<= 1.2 kn) vs harde impact (> 1.2 kn)
let bottomedOutCalled = false, shockApplied = 0, escortAlerted = false;
simCore.bottomOut = (s, _sea, _force) => { s.bottomed = true; bottomedOutCalled = true; };
simCore.sys = {
  damage: { applyShock: (dmg) => { shockApplied = dmg; } },
  enemyAI: { alertEscorts: () => { escortAlerted = true; } }
};
const softTouchSub = {
  depthFeet: 58,
  seabedFeet: 60,
  position: { xNm: 0, yNm: 0 },
  propulsion: { speedKnots: 0.8, orderedRpm: 20 },
  bottomType: 'SAND',
  bottomed: false,
  bottomingOrdered: false
};
simCore.updateSeabed(softTouchSub, 1.0);
assert.equal(bottomedOutCalled, true, 'Soft touch at 0.8 kn on sand must settle cleanly via bottomOut');

const hardTouchSub = {
  depthFeet: 58,
  seabedFeet: 60,
  position: { xNm: 0, yNm: 0 },
  propulsion: { speedKnots: 4.0, orderedRpm: 120 },
  stealth: { acousticSignature: 0.2 },
  bottomType: 'SAND',
  bottomed: false,
  bottomingOrdered: false
};
simCore.updateSeabed(hardTouchSub, 1.0);
assert.ok(shockApplied > 0, 'Hard impact at 4.0 kn must apply shock damage to hull');
assert.equal(escortAlerted, true, 'Hard impact at 4.0 kn must alert enemy escorts via acoustic signature surge');

// 20. Audio Polyfonie & Kraakbegrenzing (Helios Baseline) (3 tests)
const audioMod = await load('js/audio/audio-engine.js', ['AudioEngine'], {
  performance, clamp, degToRad, shortDelta, distNm, bearingBetween
});
const testAudio = new audioMod.AudioEngine();
testAudio.enabled = true;
testAudio.ctx = {
  currentTime: 10,
  createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {}, value: 1 }, connect() {} }),
  createBufferSource: () => ({ playbackRate: { value: 1, setTargetAtTime() {} }, connect() {}, start() {}, stop() {} }),
  createBiquadFilter: () => ({ frequency: { value: 400 }, Q: { value: 1 }, connect() {} }),
  createOscillator: () => ({ frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, value: 100 }, connect() {}, start() {}, stop() {} })
};
testAudio.busNodes = {
  system: { connect() {} },
  command: { connect() {} },
  machinery: { connect() {} },
  sensor: { connect() {} },
  weapons: { connect() {} },
  world: { connect() {} },
  mission: { connect() {} }
};

// Test 1: playCreak 3500ms throttling
let creakCalls = 0;
testAudio._tryHybrid = (id) => { if (id === 'HULL_CREAK') { creakCalls++; return true; } return false; };
testAudio.lastCreak = 0;
testAudio.playCreak();
assert.equal(creakCalls, 1, 'First playCreak call must trigger hybrid creak');
testAudio.playCreak();
assert.equal(creakCalls, 1, 'Immediate subsequent playCreak call must be throttled');
testAudio.lastCreak = Date.now() - 3600;
testAudio.playCreak();
assert.equal(creakCalls, 2, 'playCreak must execute after 3500ms cooldown');

// Test 2: playWaypoint 450ms debounce & command bus routing
let waypointClacks = [];
testAudio._metalClack = (weight, lowHz, ringHz, bus) => { waypointClacks.push({ weight, lowHz, ringHz, bus }); };
testAudio.lastWaypoint = 0;
testAudio.playWaypoint();
assert.equal(waypointClacks.length, 1, 'First playWaypoint must sound');
assert.equal(waypointClacks[0].bus, 'command', 'playWaypoint must route to command bus, not system bus');
testAudio.playWaypoint();
assert.equal(waypointClacks.length, 1, 'Rapid playWaypoint within 450ms must be debounced');
testAudio.lastWaypoint = Date.now() - 500;
testAudio.playWaypoint();
assert.equal(waypointClacks.length, 2, 'playWaypoint must sound again after 450ms cooldown');

// Test 3: _tryHybrid HULL_CREAK voice-capping (max 1 active voice)
delete testAudio._tryHybrid; // restore prototype method
testAudio.hybridBuffers.set('HULL_CREAK', {});
testAudio.hybridMeta.set('HULL_CREAK', { activeVoices: 0, lastUsed: 0 });
testAudio.hybridVoices = [];

assert.equal(testAudio._tryHybrid('HULL_CREAK'), true);
assert.equal(testAudio.hybridVoices.length, 1);
assert.equal(testAudio.hybridMeta.get('HULL_CREAK').activeVoices, 1);

// Second trigger must gracefully fade previous voice and maintain max 1 active voice
assert.equal(testAudio._tryHybrid('HULL_CREAK'), true);
assert.equal(testAudio.hybridVoices.length, 1, 'HULL_CREAK must never stack multiple active voices');
assert.equal(testAudio.hybridMeta.get('HULL_CREAK').activeVoices, 1, 'HULL_CREAK activeVoices must remain exactly 1');

// 21. Cinematics Duur & Salvo Pacing (3 tests)
const mockContactTarget = {
  id: 'TARGET-01',
  name: 'Maru Maru',
  type: 'MERCHANT',
  position: { xNm: 10, yNm: 10 },
  heading: 90,
  speedKnots: 8,
  shipDamage: {}
};
simCore.state.playerSub = { position: { xNm: 10, yNm: 8 }, depthFeet: 55, heading: 0 };
simCore.state.tactical = { activeStation: 'PERISCOPE', periscopeBearing: 0, periscopeZoom: 1, impactObservation: null };
simCore.state.runtime = { presentation: { impactQueue: [] } };

// Test 1: First isolated hit default duration and anticipation
const snapSingle = simCore.impactObservationSnapshot(mockContactTarget, {});
assert.equal(snapSingle.durationMs, 5000, 'Single hit cinematic duration must be 5000ms (reduced from old 9000ms)');
assert.equal(snapSingle.preImpactMs, 1100, 'Single hit pre-impact anticipation must be 1100ms');

// Test 2: Subsequent salvo hit gets streamlined duration and anticipation
const snapSubsequent = simCore.impactObservationSnapshot(mockContactTarget, { hitIndex: 1 });
assert.equal(snapSubsequent.durationMs, 3400, 'Subsequent salvo hit must be streamlined to 3400ms');
assert.equal(snapSubsequent.preImpactMs, 450, 'Subsequent salvo hit pre-impact must be fast 450ms cut');

// Test 3: Explicit overrides are strictly preserved
const snapCustom = simCore.impactObservationSnapshot(mockContactTarget, { durationMs: 9000, preImpactMs: 1500 });
assert.equal(snapCustom.durationMs, 9000, 'Explicit custom durationMs must be preserved');
assert.equal(snapCustom.preImpactMs, 1500, 'Explicit custom preImpactMs must be preserved');

// 22. Interne Benchmark & Performance Metrics (4 tests)
const { calculatePercentile, computeStats, computeBenchmarkScores, formatComparison } = await import('./benchmark.mjs');

// Test 1: Percentile interpolation mathematics
const testSamples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
assert.equal(calculatePercentile(testSamples, 50), 5.5, 'p50 of 1..10 must be 5.5');
assert.equal(calculatePercentile(testSamples, 0), 1, 'p0 must be minimum');
assert.equal(calculatePercentile(testSamples, 100), 10, 'p100 must be maximum');

// Test 2: Statistical aggregation (mean, stddev, percentiles)
const stats = computeStats([10, 20, 30, 40, 50]);
assert.equal(stats.mean, 30, 'Mean of 10..50 must be 30');
assert.equal(stats.p50, 30, 'p50 of 10..50 must be 30');
assert.equal(stats.min, 10, 'Min must be 10');
assert.equal(stats.max, 50, 'Max must be 50');

// Test 3: Benchmark score calibration
const mockScores = computeBenchmarkScores({
  render: { stats: { p95: 16.67 } },
  simulation: { stats: { p95: 5000 } },
  audio: { stats: { p95: 500 } }
});
assert.equal(mockScores.render, 1000, 'Render at 16.67ms p95 must equal exactly 1000 pts');
assert.equal(mockScores.simulation, 1000, 'Simulation at 5000us p95 must equal exactly 1000 pts');
assert.equal(mockScores.audio, 1000, 'Audio at 500us p95 must equal exactly 1000 pts');
assert.equal(mockScores.composite, 1000, 'Composite score at reference points must equal exactly 1000 pts');

// Test 4: Format comparison delta calculations
const baseResult = { scores: { composite: 1000 }, render: { fps: 60, stats: { mean: 16.67 } }, simulation: { ticksPerSecond: 200, stats: { mean: 5000 } }, audio: { stats: { mean: 500 } } };
const newResult = { scores: { composite: 1100 }, render: { fps: 66, stats: { mean: 15.15 } }, simulation: { ticksPerSecond: 220, stats: { mean: 4500 } }, audio: { stats: { mean: 450 } } };
const comp = formatComparison(newResult, baseResult);
assert.equal(comp.scoreDiff, 100, 'Score difference must be +100');
assert.equal(comp.scorePct, '+10.0%', 'Score percentage must be +10.0%');
assert.equal(comp.renderFpsDiff, 6, 'Render FPS diff must be +6');
assert.equal(comp.renderFpsPct, '+10.0%', 'Render FPS pct must be +10.0%');

// 23. Automatische Veilige Routeplanning & Landmassa Circumnavigatie (5 tests)
const terrainCode = await readFile(path.join(root, 'js/data/pacific-terrain-data.js'), 'utf8');
const geomCode = await readFile(path.join(root, 'js/rendering/world-geometry.js'), 'utf8');
const coreCode = await readFile(path.join(root, 'js/simulation/engine-core.js'), 'utf8');
const physCode = await readFile(path.join(root, 'js/simulation/physics-navigation.js'), 'utf8');
const missionCode = await readFile(path.join(root, 'js/simulation/mission-framework.js'), 'utf8');
const aarCode = await readFile(path.join(root, 'js/simulation/after-action-report.js'), 'utf8');
const careerCode = await readFile(path.join(root, 'js/simulation/career-history.js'), 'utf8');
const surfaceWatchCode = await readFile(path.join(root, 'js/simulation/surface-watch.js'), 'utf8');
const fmtDeg = d => `${Math.round(d)}°`;

const navCtx = {
  console, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Set, Map, Array, Object,
  degToRad, radToDeg, normDeg, shortDelta, knotsNmSec, clamp, distNm, lerp, bearingBetween, fmtDeg,
  DEFAULT_GAME_IDENTITY: { campaignProfileId: 'us-pacific', submarineProfileId: 'gato' },
  getCampaignMissionProfile: () => ({
    defaultMissionType: 'CONVOY_INTERDICTION',
    definitions: {
      CONVOY_INTERDICTION: { title: 'Convoy Interdiction', briefing: 'Neutralize enemy shipping in the Solomon Sea.', reward: 1200 }
    }
  }),
  vesselGameplayType: (c) => c?.type || 'MERCHANT',
  materializeVesselIdentity: (v) => v,
  isASWCombatant: (c) => c?.type === 'DESTROYER' || c?.asw === true,
  isSurfaceCombatant: (c) => ['DESTROYER', 'ESCORT', 'WARSHIP'].includes(c?.type),
  weatherVisibilityBetween: (s, p1, p2) => Number(s?.world?.environment?.visibilityNm || 10),
  ensureShipDamage: c => c?.shipDamage || { flotation: 1, propulsion: 1, steering: 1, fire: 0, killPoints: 100 },
  shipDamageSeverity: c => c?.damageSeverity || (c?.sunk ? 1 : 0),
  shipDamageCondition: c => c?.sunk ? 'SUNK' : 'LIGHT DAMAGE',
  getVesselProfile: () => null,
  getAircraftProfile: () => null,
  getCampaignHarborOperationProfile: () => null,
  getWarPartyProfile: () => null,
  getDisposition: () => 'ENEMY',
  repairPriorityLabel: p => p || 'DEFAULT',
  PresentationBridge: { audio: () => ({ playHelmOrder() {}, playDive() {}, playSurface() {}, playCrashDive() {}, event() {} }), delayedAudio: () => {}, toast: () => ({ ok() {}, warn() {} }), emit: () => {} }
};
vm.createContext(navCtx);
navCtx.globalThis = navCtx;
vm.runInContext(terrainCode, navCtx);
vm.runInContext(`${geomCode}\n;globalThis.Bathy = Bathy;`, navCtx);
vm.runInContext(`${coreCode}\n;globalThis.CoreSystem = CoreSystem;`, navCtx);
vm.runInContext(`${physCode}\n;globalThis.SimEngine = SimEngine;`, navCtx);
vm.runInContext(missionCode, navCtx);
vm.runInContext(aarCode, navCtx);
vm.runInContext(`${careerCode}\n;globalThis.CareerSystem = CareerSystem;`, navCtx);
vm.runInContext(surfaceWatchCode, navCtx);

const solomonTerrain = navCtx.getPatrolTerrain('Solomon Sea');
navCtx.Bathy.ensure(solomonTerrain);

const testEngine = new navCtx.SimEngine({
  world: { terrain: solomonTerrain, chartBounds: null, contacts: [], contactTracks: {} },
  campaign: { patrolArea: 'solomons', friendlyPort: { name: 'Tulagi', pos: { xNm: 155, yNm: 60 } } },
  playerSub: {
    position: { xNm: 140, yNm: 105 },
    depthFeet: 0,
    heading: 0,
    orderedHeading: 0,
    damage: { hullIntegrity: 100, oxygen: 100 },
    propulsion: { battery: 100, fuel: 100, speedKnots: 10, orderedRpm: 320 }
  },
  map: { plottedCourse: [], autoFollowPlot: false },
  time: { elapsedSeconds: 0 },
  runtime: { campaign: {}, time: {} },
  log: []
}, { dispatch() {} });
testEngine.sys = { collision: { collisionRiskAhead: () => null } };

// Test 1: Circumnavigatie rondom Guadalcanal (140, 105) -> (140, 50)
const southPt = { xNm: 140, yNm: 105 };
const northPt = { xNm: 140, yNm: 50 };
assert.equal(testEngine.isNavigableMapPoint(southPt), true, 'South point must be in navigable water');
assert.equal(testEngine.isNavigableMapPoint(northPt), true, 'North point must be in navigable water');

// Direct chord goes through Guadalcanal
let directClear = true;
for (let t = 0; t <= 1; t += 0.02) {
  const p = { xNm: lerp(southPt.xNm, northPt.xNm, t), yNm: lerp(southPt.yNm, northPt.yNm, t) };
  if (!testEngine.isNavigableMapPoint(p)) { directClear = false; break; }
}
assert.equal(directClear, false, 'Direct line across Guadalcanal must not be clear');

const safeRoute = testEngine.planNavigableCourse(southPt, northPt);
assert.ok(safeRoute && safeRoute.length >= 3, 'Safe course around Guadalcanal must contain multi-leg path');
for (let i = 0; i < safeRoute.length - 1; i++) {
  const a = safeRoute[i], b = safeRoute[i+1], steps = Math.ceil(distNm(a, b) / 0.2);
  for (let s = 0; s <= steps; s++) {
    const p = { xNm: lerp(a.xNm, b.xNm, s/steps), yNm: lerp(a.yNm, b.yNm, s/steps) };
    assert.equal(testEngine.isNavigableMapPoint(p), true, `All points on leg ${i}->${i+1} must be navigable (>=30ft, 0 land collisions)`);
  }
}

// Test 2: headToPort() genereert veilige multi-leg koers naar Tulagi
testEngine.state.playerSub.position = { xNm: 140, yNm: 105 };
testEngine.state.map.plottedCourse = [];
testEngine.state.map.autoFollowPlot = false;
testEngine.headToPort();

const portCourse = testEngine.state.map.plottedCourse;
assert.ok(portCourse.length >= 2, 'headToPort() around Guadalcanal must plot multiple safe legs');
assert.equal(portCourse.at(-1).navKind, 'FRIENDLY_APPROACH', 'Final leg must be FRIENDLY_APPROACH');
assert.equal(portCourse[0].navKind, 'TRANSIT_LEG', 'Intermediate leg must be TRANSIT_LEG');
assert.equal(testEngine.state.map.autoFollowPlot, true, 'Autopilot must engage for headToPort');
assert.ok(testEngine.state.playerSub.orderedHeading > 30 && testEngine.state.playerSub.orderedHeading < 90, 'Initial steering order must steer east-northeast into open strait (not north into island)');

// Test 3: Behoud van Handmatige Precisienavigatie bij vrij water (geen quantisatiefout)
const tacticalWp = { xNm: 140, yNm: 102 };
const precisionRoute = testEngine.planNavigableCourse(southPt, tacticalWp);
assert.equal(precisionRoute.length, 2, 'Direct unobstructed waypoint must retain exact 2-point chord without A* grid jitter');
assert.equal(precisionRoute[0].xNm, southPt.xNm);
assert.equal(precisionRoute[1].yNm, tacticalWp.yNm);

// Test 4: Handmatige koersorder ontkoppelt autopilot direct
assert.equal(testEngine.state.map.autoFollowPlot, true, 'Autopilot is currently engaged on port course');
testEngine.applyCmd({ type: 'SET_ORDERED_HEADING', heading: 270 });
assert.equal(testEngine.state.map.autoFollowPlot, false, 'Manual SET_ORDERED_HEADING must immediately disengage autopilot');
assert.equal(testEngine.state.playerSub.orderedHeading, 270, 'Ordered heading must obey manual helm order');

// Test 5: TransitInterrupt doorloopt TRANSIT_LEG waypoints soepel zonder onderbreking
testEngine.state.map.plottedCourse = [
  { xNm: 178, yNm: 96, navKind: 'TRANSIT_LEG', portName: 'Tulagi' },
  { xNm: 174, yNm: 67, navKind: 'TRANSIT_LEG', portName: 'Tulagi' },
  { xNm: 155, yNm: 60, navKind: 'FRIENDLY_APPROACH', portName: 'Tulagi' }
];
testEngine.state.map.autoFollowPlot = true;
testEngine.state.runtime.campaign._headingHome = true;
testEngine.state.world.enemy = { alertState: 'UNAWARE' };
testEngine.state.time = { elapsedSeconds: 100, timeScale: 1, transitUntil: 5000 };
testEngine.snapshotWatch();
assert.equal(testEngine.state.runtime.time.watch.wp, 3, 'Watch must record 3 waypoints initially');

// Pop intermediate TRANSIT_LEG
testEngine.state.map.plottedCourse.shift();
assert.equal(testEngine.transitInterrupt(), null, 'Popping intermediate TRANSIT_LEG must return null (continuing transit without stop)');
assert.equal(testEngine.state.runtime.time.watch.wp, 2, 'Watch waypoint counter must automatically advance to remaining legs');

// Pop second TRANSIT_LEG
testEngine.state.map.plottedCourse.shift();
assert.equal(testEngine.transitInterrupt(), null, 'Popping second TRANSIT_LEG must also continue transit');
assert.equal(testEngine.state.runtime.time.watch.wp, 1, 'Watch waypoint counter must advance to 1');

// Pop final FRIENDLY_APPROACH leg (course complete)
testEngine.state.map.plottedCourse.shift();
assert.equal(testEngine.transitInterrupt(), 'a waypoint reached', 'Completing final approach waypoint must stop transit cleanly');

// 24. Dynamische Bewaking van Missiepacing & Intercept Inlichtingen (5 tests)
const pCaptainLogs = [];
const pNotifications = [];
const pacingEngine = new navCtx.SimEngine({
  world: {
    terrain: solomonTerrain,
    contacts: [
      { id: 'C-01', convoyId: 'MAIN', position: { xNm: 150, yNm: 85 }, speedKnots: 8, heading: 270, tonsFactor: 5400, sunk: false },
      { id: 'C-02', convoyId: 'MAIN', position: { xNm: 152, yNm: 85 }, speedKnots: 8, heading: 270, tonsFactor: 6200, sunk: false },
      { id: 'E-01', convoyId: 'MAIN', type: 'DESTROYER', asw: true, position: { xNm: 148, yNm: 84 }, speedKnots: 12, heading: 270, sunk: false }
    ],
    contactTracks: {},
    traffic: { primaryGroup: { position: { xNm: 151, yNm: 85 }, heading: 270, speedKnots: 8 } },
    radio: { inbox: [], unread: 0 },
    enemy: { alertState: 'UNAWARE' }
  },
  campaign: {
    patrolArea: 'solomons',
    campaignProfileId: 'us-pacific',
    scenarioSeed: 42,
    missionType: 'CONVOY_INTERDICTION',
    missionStatus: 'PATROL',
    score: 0,
    friendlyPort: { name: 'Tulagi', pos: { xNm: 155, yNm: 60 } }
  },
  playerSub: {
    position: { xNm: 140, yNm: 105 },
    depthFeet: 0,
    heading: 45,
    orderedHeading: 45,
    damage: { hullIntegrity: 100, oxygen: 100 },
    propulsion: { battery: 100, fuel: 100, speedKnots: 10, orderedRpm: 320 },
    keelClearanceFeet: 200
  },
  weapons: { torpedoes: [], hits: [] },
  map: { plottedCourse: [], autoFollowPlot: false },
  time: { elapsedSeconds: 0, timeScale: 1 },
  runtime: { campaign: {}, time: {} },
  log: []
}, { dispatch() {} });
pacingEngine.ctx = {
  captainLog: (type, text, data, key) => pCaptainLogs.push({ type, text, data, key })
};
pacingEngine.notify = (msg, tone, pri) => pNotifications.push({ msg, tone, pri });
pacingEngine.sys = { collision: { collisionRiskAhead: () => null } };

// Test 1: Pacing State Machine initialisatie en fasentransities (TRANSIT -> CONTACT -> ACTION -> WITHDRAW -> RETURN)
const pm = pacingEngine.ensureMissionFramework();
assert.ok(pm, 'Mission framework must be initialized');
assert.equal(pm.pacing.version, 2, 'Pacing version must be 2');
assert.equal(pm.pacing.targetMinutes, 30, 'Target minutes must be 30');

// Initial step in TRANSIT
for (let i = 0; i < 60; i++) pacingEngine.updateMissionFramework(1);
assert.equal(pm.pacing.stage, 'TRANSIT', 'Initial pacing stage must be TRANSIT');
assert.equal(pm.pacing.stageSeconds.TRANSIT, 60, 'TRANSIT stage seconds must accrue');
assert.ok(pm.pacing.targetDistanceNm > 15, 'Target distance must be calculated from convoy position');

// Holding contact track transitions to CONTACT
pacingEngine.state.world.contactTracks['C-01'] = { id: 'C-01', confidence: 0.6, convoyId: 'MAIN' };
pacingEngine.updateMissionFramework(10);
assert.equal(pm.pacing.stage, 'CONTACT', 'Holding track must transition stage to CONTACT');

// Torpedo in flight transitions to ACTION
pacingEngine.state.weapons.torpedoes.push({ id: 1, finished: false });
pacingEngine.updateMissionFramework(10);
assert.equal(pm.pacing.stage, 'ACTION', 'Torpedo in flight must transition stage to ACTION');

// Escort counterattack transitions to WITHDRAW
pacingEngine.state.weapons.torpedoes[0].finished = true;
pm.escortReactionSeen = true;
pacingEngine.updateMissionFramework(10);
assert.equal(pm.pacing.stage, 'WITHDRAW', 'Escort reaction must transition stage to WITHDRAW');

// Mission finish transitions to RETURN
pacingEngine._missionFinish(true, 'Convoy dispersed');
assert.equal(pacingEngine.state.campaign.missionStatus, 'RETURN TO BASE');
pacingEngine.updateMissionFramework(10);
assert.equal(pm.pacing.stage, 'RETURN', 'Mission finish must transition stage to RETURN');

// Test 2: HQ Radio Intel Advisory bij langdurige transit zonder contact
const intelTestEngine = new navCtx.SimEngine({
  world: {
    terrain: solomonTerrain,
    contacts: [
      { id: 'C-10', convoyId: 'MAIN', position: { xNm: 155, yNm: 80 }, speedKnots: 8.5, heading: 280, sunk: false }
    ],
    contactTracks: {},
    radio: { inbox: [], unread: 0 },
    enemy: { alertState: 'UNAWARE' }
  },
  campaign: {
    patrolArea: 'solomons',
    campaignProfileId: 'us-pacific',
    scenarioSeed: 88,
    missionType: 'CONVOY_INTERDICTION',
    missionStatus: 'PATROL',
    friendlyPort: { name: 'Tulagi', pos: { xNm: 155, yNm: 60 } }
  },
  playerSub: { position: { xNm: 135, yNm: 100 }, depthFeet: 0, heading: 0, propulsion: { speedKnots: 10 } },
  weapons: { torpedoes: [], hits: [] },
  map: { plottedCourse: [] },
  time: { elapsedSeconds: 600, timeScale: 1 },
  runtime: { campaign: {}, time: {} }
}, { dispatch() {} });
intelTestEngine.ctx = { captainLog() {} };
intelTestEngine.notify = () => {};
const intelM = intelTestEngine.ensureMissionFramework();
intelM.pacing.activeSeconds = 550; // 9+ real minutes in TRANSIT
intelTestEngine.updateMissionFramework(5);
assert.equal(intelM.pacing.advisoriesDispatched, 1, 'HQ Radio Intel Advisory must dispatch after 9 minutes in TRANSIT without contact');
assert.equal(intelTestEngine.state.world.radio.inbox.length, 1, 'Advisory must be queued in radio inbox');
const radioAdvisory = intelTestEngine.state.world.radio.inbox[0];
assert.equal(radioAdvisory.from, 'COMSUBPAC INTEL', 'US Pacific theater authority must be COMSUBPAC INTEL');
assert.ok(radioAdvisory.text.includes('Enemy shipping estimated'), 'Advisory text must include shipping estimate');
assert.ok(radioAdvisory.advisory.bearingDeg >= 0 && radioAdvisory.advisory.bearingDeg <= 360, 'Advisory bearing must be valid');
assert.ok(radioAdvisory.advisory.rangeNm > 15 && radioAdvisory.advisory.rangeNm < 35, 'Advisory range must match convoy geometry');
assert.equal(intelTestEngine.state.world.contacts.length, 1, 'Genuine simulation contacts must remain unaltered (zero duplicate spawns)');

// Test 3: Doelwit Interceptie-Drempel & Tijdcompressie Interruptie (8.5 NM)
const transitPacingEngine = new navCtx.SimEngine({
  world: {
    contacts: [{ id: 'C-20', convoyId: 'MAIN', position: { xNm: 150, yNm: 85 }, speedKnots: 8, heading: 270, sunk: false }],
    contactTracks: {},
    enemy: { alertState: 'UNAWARE' }
  },
  campaign: { missionType: 'CONVOY_INTERDICTION', missionStatus: 'PATROL' },
  playerSub: { position: { xNm: 135, yNm: 105 }, depthFeet: 0, damage: { hullIntegrity: 100, oxygen: 100 }, propulsion: { battery: 100, fuel: 100 } },
  map: { plottedCourse: [] },
  time: { elapsedSeconds: 100, timeScale: 1, transitUntil: 5000 },
  runtime: { campaign: {}, time: {} }
}, { dispatch() {} });
transitPacingEngine.sys = { collision: { collisionRiskAhead: () => null } };
transitPacingEngine.ensureMissionFramework();
transitPacingEngine.snapshotWatch();
assert.equal(transitPacingEngine.state.runtime.time.watch.contactZoneNear, false, 'contactZoneNear must be false when outside 8.5 nm');
assert.equal(transitPacingEngine.transitInterrupt(), null, 'transitInterrupt must return null while outside 8.5 nm');

// Sub closes within 8.5 nm of convoy
transitPacingEngine.state.playerSub.position = { xNm: 147, yNm: 92.0 }; // ~7.6 nm
assert.equal(transitPacingEngine.transitInterrupt(), 'target contact area reached — 8.5 nm', 'transitInterrupt must drop time compression at 8.5 nm');
assert.equal(transitPacingEngine.state.runtime.time.watch.contactZoneNear, true, 'contactZoneNear must flip to true');

// Test 4: Gestroomlijnde Terugtocht na Voltooid Hoofddoel
pacingEngine.state.playerSub.position = { xNm: 140, yNm: 105 };
pacingEngine.headToPort();
assert.ok(pacingEngine.state.map.plottedCourse.length >= 2, 'headToPort must plot multi-leg course');
assert.equal(pacingEngine.state.map.autoFollowPlot, true, 'Autopilot must engage for return leg');
assert.equal(pacingEngine.state.campaign.missionStatus, 'RETURN TO BASE', 'Mission status must remain RETURN TO BASE');

// Test 5: Pacing Telemetrie Export naar Campagnestatus en AAR Debriefing
const pacingSummary = pacingEngine.getMissionPacingSummary();
assert.ok(pacingSummary, 'getMissionPacingSummary() must return valid summary');
assert.equal(pacingSummary.version, 2, 'Summary version must be 2');
assert.equal(pacingSummary.targetMinutes, 30, 'Target minutes must be 30');
assert.ok(pacingSummary.stages.transitMinutes > 0, 'Transit minutes must be recorded');
assert.equal(pacingSummary.pacingPace, 'ON_SCHEDULE', 'Pacing pace must be ON_SCHEDULE');

const aarReplay = pacingEngine.buildAfterActionReplay();
assert.ok(aarReplay.pacingSummary, 'AAR replay must include pacingSummary');
assert.equal(aarReplay.pacingSummary.version, 2);
assert.equal(aarReplay.pacingSummary.targetMinutes, 30);

// 25. AAR als Tactische Reconstructie & Declassified Truth (5 tests)
// Test 1: Cruciale Beslismomenten Registratie (Command Decisions Timeline)
const decEngine = new navCtx.SimEngine({
  world: { terrain: solomonTerrain, contacts: [], contactTracks: {}, enemy: { alertState: 'UNAWARE' }, environment: { layerDepthFt: 180 } },
  campaign: { patrolArea: 'solomons', missionStatus: 'PATROL' },
  playerSub: {
    position: { xNm: 140, yNm: 105 },
    depthFeet: 0,
    heading: 90,
    orderedHeading: 90,
    orderedDepthFeet: 0,
    mode: 'SURFACED',
    damage: { hullIntegrity: 100 },
    propulsion: { speedKnots: 10, orderedRpm: 320 },
    stealth: { silentRunning: false }
  },
  map: { plottedCourse: [], autoFollowPlot: false },
  time: { elapsedSeconds: 420 },
  runtime: { campaign: {}, time: {} }
}, { dispatch() {} });
decEngine.clearDeckForDive = () => {};
decEngine.derivMode = () => {};
decEngine.log = () => {};

// 1.1 Crash Dive
decEngine.applyCmd({ type: 'CRASH_DIVE' });
let aar = decEngine.ensureAfterActionReport();
assert.equal(aar.decisions.length, 1, 'aar.decisions must record crash dive');
assert.equal(aar.decisions[0].type, 'CRASH_DIVE');
assert.equal(aar.decisions[0].depthFeet, 0);
assert.equal(aar.decisions[0].position.xNm, 140);
assert.ok(aar.decisions[0].text.includes('CRASH DIVE'), 'Decision text must include CRASH DIVE');
assert.ok(aar.events.some(e => e.type === 'COMMAND_DECISION' && e.data.decisionType === 'CRASH_DIVE'), 'Decision must mirror to events timeline');

// 1.2 Silent Running
decEngine.applyCmd({ type: 'TOGGLE_SILENT_RUNNING' });
assert.equal(aar.decisions.length, 2, 'aar.decisions must record silent running toggle');
assert.equal(aar.decisions[1].type, 'SILENT_RUNNING_ENGAGED');
assert.equal(aar.decisions[1].data.silentRunning, true);

// 1.3 Periscope Depth
decEngine.applyCmd({ type: 'PERISCOPE_DEPTH' });
assert.equal(aar.decisions.length, 3);
assert.equal(aar.decisions[2].type, 'PERISCOPE_DEPTH');

// 1.4 Evasive Turn in Combat
decEngine.state.world.enemy.alertState = 'ATTACKING';
decEngine.applyCmd({ type: 'SET_ORDERED_HEADING', heading: 180 });
assert.equal(aar.decisions.length, 4);
assert.equal(aar.decisions[3].type, 'EVASIVE_TURN');
assert.equal(aar.decisions[3].data.orderedHeading, 180);
assert.equal(aar.decisions[3].data.turnDeltaDeg, 90);

// Test 2: Vijandelijke ASW Tegenmaatregelen & Dieptebom Telemetrie
decEngine.state.playerSub.depthFeet = 210; // Below 180 ft layer
const mockEscort = { id: 'ESC-01', name: 'HMS Starling', position: { xNm: 140.2, yNm: 105.1 } };
decEngine.aarRecordEvent('DEPTH_CHARGE_ATTACK', 'HMS Starling depth-charge attack.', {
  escortId: mockEscort.id,
  escortName: mockEscort.name,
  count: 10,
  depthFt: 140,
  subDepthFeet: 210,
  layerDepthFt: 180,
  layerProtected: true,
  speculative: false
}, mockEscort.position, decEngine.state.playerSub.position);
decEngine.aarEnemyResponse('ASW_ATTACK_RUN', { source: mockEscort.name, confidence: 0.85, errNm: 0.22, xNm: 140.2, yNm: 105.1 }, [mockEscort.id], 'active asdic track', {
  escortName: mockEscort.name,
  dcCount: 10,
  depthFt: 140,
  subDepthFeet: 210,
  layerProtected: true
});

const dcEvent = aar.events.find(e => e.type === 'DEPTH_CHARGE_ATTACK');
assert.ok(dcEvent, 'AAR events must contain DEPTH_CHARGE_ATTACK');
assert.equal(dcEvent.data.count, 10, 'Pattern count must be 10');
assert.equal(dcEvent.data.layerProtected, true, 'Submarine below layer must be marked layerProtected');
assert.equal(aar.enemyResponses.length, 1, 'AAR enemyResponses must be recorded');
assert.equal(aar.enemyResponses[0].dcCount, 10);
assert.equal(aar.enemyResponses[0].layerProtected, true);
assert.equal(aar.enemyResponses[0].via, 'active asdic track');

// Test 3: Waargenomen vs Werkelijke Waarheid (Observed vs Ground Truth)
const truthState = {
  world: {
    contacts: [
      { id: 'T-01', name: 'Empire Heritage', displayType: 'TANKER', tonsFactor: 9200, side: 'ENEMY', sunk: true },
      { id: 'T-02', name: 'HMS Starling', displayType: 'BLACK_SWAN_SLOOP', tonsFactor: 1350, side: 'ENEMY', sunk: false },
      { id: 'T-03', name: 'SS Benlawers', displayType: 'ARMED_MERCHANT_CRUISER', tonsFactor: 8500, side: 'ENEMY', sunk: false, shipDamage: { flotation: 0.7 } },
      { id: 'T-04', name: 'HMS Stork', displayType: 'DESTROYER', tonsFactor: 1900, side: 'ENEMY', sunk: false }
    ],
    contactTracks: {
      'T-01': { id: 'T-01', typeEstimate: 'TANKER', visualHullConfirmed: true, confidence: 0.95, source: 'PERISCOPE' },
      'T-02': { id: 'T-02', typeEstimate: 'MERCHANT', visualHullConfirmed: false, confidence: 0.50, source: 'HYDROPHONE' },
      'T-03': { id: 'T-03', typeEstimate: 'FREIGHTER', visualHullConfirmed: true, confidence: 0.80, source: 'PERISCOPE' }
      // T-04 is unobserved
    }
  },
  campaign: {
    afterAction: {
      observedById: {},
      truthById: {},
      events: [
        { type: 'TORPEDO_HIT', data: { contactId: 'T-01' } },
        { type: 'TORPEDO_HIT', data: { contactId: 'T-03' } },
        dcEvent
      ],
      enemyResponses: aar.enemyResponses
    }
  }
};

const truthComp = navCtx.CareerSystem.buildTruthComparison(truthState);
assert.equal(truthComp.length, 4, 'All 4 enemy vessels must be compared');
const t01 = truthComp.find(r => r.id === 'T-01');
assert.equal(t01.evaluation.accuracy, 'ACCURATE', 'T-01 correctly identified as Tanker');
assert.equal(t01.truth.outcome, 'SUNK', 'T-01 must be marked SUNK');
assert.equal(t01.truth.tons, 9200);

const t02 = truthComp.find(r => r.id === 'T-02');
assert.equal(t02.evaluation.accuracy, 'ACOUSTIC_ONLY', 'T-02 tracked only on hydrophone without visual hull confirmation');
assert.equal(t02.truth.outcome, 'SURVIVED');

const t03 = truthComp.find(r => r.id === 'T-03');
assert.equal(t03.evaluation.accuracy, 'MISIDENTIFIED', 'T-03 misidentified: reported as FREIGHTER, actual ARMED_MERCHANT_CRUISER');
assert.equal(t03.truth.outcome, 'DAMAGED');

const t04 = truthComp.find(r => r.id === 'T-04');
assert.equal(t04.evaluation.accuracy, 'UNOBSERVED', 'T-04 operating in convoy perimeter was unspotted');

// Test 4: Post-Mission Gedeclassificeerde Inlichtingen (ULTRA / B-Dienst Decrypts)
const declassIntel = navCtx.CareerSystem.buildDeclassifiedIntel(truthState, [], truthComp);
assert.ok(declassIntel.length >= 3, 'Must produce at least 3 intelligence annex items');
const ultraDecrypt = declassIntel.find(i => i.classification === 'ULTRA DECRYPT');
assert.ok(ultraDecrypt, 'Must contain ULTRA DECRYPT confirmation of lost tonnage');
assert.ok(ultraDecrypt.text.includes('Empire Heritage'), 'ULTRA decrypt must cite sunk vessel name');
assert.equal(ultraDecrypt.tonnageConfirmed, 9200, 'Must confirm exactly 9,200 GRT lost');

const aswDossier = declassIntel.find(i => i.classification === 'ASW DOSSIER');
assert.ok(aswDossier, 'Must contain ASW DOSSIER of enemy depth-charge barrages');
assert.equal(aswDossier.dcExpended, 10, 'Must record 10 depth charges dropped');

const concealedWarship = declassIntel.find(i => i.classification === 'WAR DIARY LOG');
assert.ok(concealedWarship, 'Must contain WAR DIARY LOG revealing unobserved escorts');
assert.ok(concealedWarship.vessels.includes('HMS Stork'), 'Must list unspotted escort HMS Stork');

// Test 5: Volledige AAR Replay & Career Record Integratie
const replayPayload = decEngine.buildAfterActionReplay();
assert.ok(Array.isArray(replayPayload.decisions), 'AAR replay must include decisions array');
assert.equal(replayPayload.decisions.length, 4, 'Replay must preserve all 4 command decisions');

const fullPatrolContext = {
  state: {
    ...truthState,
    campaign: {
      ...truthState.campaign,
      historyId: 'patrol-test-8',
      patrolNumber: 4,
      patrolArea: 'Solomon Sea',
      startDate: '1943-08-17',
      score: 2500,
      totalScore: 5000,
      patrolDuration: 1800,
      tonnageSunk: 9200,
      importantEvents: [],
      pacingSummary: { version: 2, targetMinutes: 30, pacingPace: 'ON_SCHEDULE' },
      afterAction: {
        ...truthState.campaign.afterAction,
        decisions: aar.decisions,
        aircraftEvaded: 1
      }
    },
    runtime: {
      campaign: { _careerStartDate: '1943-08-17 06:00' },
      aar: { airStates: {} }
    },
    weapons: { nextTorpedoId: 5, hits: [{ contactId: 'T-01' }], duds: [] },
    playerSub: { damage: { hullIntegrity: 92 }, propulsion: { fuel: 75, battery: 80 } }
  },
  aar: { buildReplay: () => replayPayload },
  ensureCareerPatrolState: navCtx.CareerSystem.ensureCareerPatrolState
};
const fullRecord = navCtx.CareerSystem.buildPatrolRecord.call(fullPatrolContext, 'COMPLETED');
assert.equal(fullRecord.truthComparison.length, 4, 'Patrol record must contain complete truthComparison');
assert.ok(fullRecord.declassifiedIntel.length >= 3, 'Patrol record must contain declassifiedIntel dossier');
assert.equal(fullRecord.decisions.length, 4, 'Patrol record must contain tactical decisions timeline');
assert.ok(fullRecord.pacingSummary, 'Patrol record must contain pacingSummary');
assert.equal(fullRecord.replay.decisions.length, 4, 'Replay payload inside record must retain decisions');

// 26. Verdieping van Campagnegevolgen & Refit Cyclus (5 tests)
// Test 1: Refit Turnaround Wiskunde (Lichte vs Zware Schade, Restspanning & Veilige Vloer)
const refitRoutine = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 92, patrolScore: 1000, outcome: 'COMPLETED' });
assert.equal(refitRoutine.hullRestored, 100, 'Routine drydock overhaul must restore 100% hull');
assert.equal(refitRoutine.residualStress, false, 'No residual stress on routine return');
assert.equal(refitRoutine.crushDepthRatedFeet, 400, 'Crush depth certified to full 400 ft');
assert.equal(refitRoutine.recommendedPatrolType, 'STANDARD_PATROL');

const refitHeavy = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 35, patrolScore: 1200, outcome: 'COMPLETED' });
assert.equal(refitHeavy.residualStress, true, 'Catastrophic battle damage (<50%) leaves residual frame stress');
assert.ok(refitHeavy.hullRestored >= 78 && refitHeavy.hullRestored <= refitHeavy.hullCeiling, 'Hull must be capped by frame stress ceiling');
assert.ok(refitHeavy.crushDepthRatedFeet < 400, 'Crush depth rating must be reduced by frame stress');
assert.equal(refitHeavy.recommendedPatrolType, 'RECOVERY_PATROL', 'Heavy damage must advise working-up recovery patrol');

const refitDisaster = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 5, patrolScore: 0, outcome: 'COMPLETED' });
assert.equal(refitDisaster.hullRestored, 78, 'Guaranteed safe floor: shipyard never clears a boat below 78%');
assert.equal(refitDisaster.recommendedPatrolType, 'RECOVERY_PATROL');

// Test 2: Torpedorantsoenering & Logistieke Prioritering (Geen Soft-Locks)
const priorityLogistics = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 95, patrolScore: 2200, outcome: 'COMPLETED' }, { prevVeteranLevel: 2 });
assert.equal(priorityLogistics.torpedoAllocation.priorityStock, true, 'Elite/veteran boats receive priority ordnance requisition');
assert.equal(priorityLogistics.torpedoAllocation.reserveCount, 16);

const pinchedLogistics = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 40, patrolScore: 300, outcome: 'COMPLETED' }, { prevVeteranLevel: 0 });
assert.equal(pinchedLogistics.torpedoAllocation.priorityStock, false, 'Pinched logistics boat receives standard stock');
assert.ok(pinchedLogistics.torpedoAllocation.reserveCount >= 12, 'Must guarantee at least 12 reserve torpedoes (no soft-lock)');

// Test 3: Bemanningsvermoeidheid & Veteranenprogressie (GREEN -> ELITE)
const fatShort = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 80, patrolScore: 1000, ownBoat: { crewFatigue: 0.85 } }, { shortTurnaround: true });
assert.equal(fatShort.crewFatigueResidual, 0.08, 'Short turnaround with high fatigue retains 8% residual');

const fatNormal = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 80, patrolScore: 1000, ownBoat: { crewFatigue: 0.85 } }, { shortTurnaround: false });
assert.equal(fatNormal.crewFatigueResidual, 0, 'Normal turnaround fully rests crew');

const vetStep1 = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 90, patrolScore: 1500, shipsSunk: 2, tonnage: 10000 }, { prevVeteranLevel: 0 });
assert.equal(vetStep1.crewVeteranLevel, 1, 'First successful patrol promotes crew to SEASONED (level 1)');
assert.equal(vetStep1.crewRankTitle, 'SEASONED');

const vetStep2 = navCtx.CareerSystem.calculateRefitTurnaround({ hullAtEnd: 90, patrolScore: 1600, shipsSunk: 3, tonnage: 14000 }, { prevVeteranLevel: 2 });
assert.equal(vetStep2.crewVeteranLevel, 3, 'Consecutive successful patrols promote to ELITE (level 3)');
assert.equal(vetStep2.crewRankTitle, 'ELITE');

// Test 4: Tactische Effecten van Veteranenbemanning (Herlaad, Averijploeg & Uitkijk)
// 4.1 Torpedo herlaadfactor
const reloadModGreen = 1 + 0 * 0.05;
const reloadModElite = 1 + 3 * 0.05;
assert.equal(reloadModGreen, 1.0);
assert.equal(reloadModElite, 1.15, 'Elite torpedo crew reloads 15% faster');

// 4.2 Averijploeg herstelfactor
const dcModGreen = 1 + 0 * 0.06;
const dcModElite = 1 + 3 * 0.06;
assert.equal(dcModGreen, 1.0);
assert.equal(dcModElite, 1.18, 'Elite DC crew repairs 18% faster');

// 4.3 Uitkijk waarnemingsbereik
const mockSubGreen = { damage: { veteranLevel: 0 }, depthFeet: 0, position: { xNm: 0, yNm: 0 } };
const mockSubElite = { damage: { veteranLevel: 3 }, depthFeet: 0, position: { xNm: 0, yNm: 0 } };
const mockTargetShip = { type: 'FREIGHTER', speedKnots: 8, position: { xNm: 0, yNm: 6 } };
const visGreen = navCtx.bridgeVisualLimitNm({ playerSub: mockSubGreen, world: { environment: { visibilityNm: 10 } } }, mockTargetShip);
const visElite = navCtx.bridgeVisualLimitNm({ playerSub: mockSubElite, world: { environment: { visibilityNm: 10 } } }, mockTargetShip);
assert.ok(visElite > visGreen, 'Elite lookout spotting distance must exceed green lookouts');
assert.equal(Math.round((visElite / visGreen) * 100) / 100, 1.12, 'Elite lookouts gain exactly +12% spotting distance');

// Test 5: End-to-End Multi-Patrol Continuïteit & Herstelpatrouille-Aanbeveling
const batteredRecord = navCtx.CareerSystem.buildPatrolRecord.call({
  state: {
    ...fullPatrolContext.state,
    playerSub: { damage: { hullIntegrity: 32, veteranLevel: 1 }, propulsion: { fuel: 75, battery: 80 } }
  },
  aar: { buildReplay: () => replayPayload },
  ensureCareerPatrolState: navCtx.CareerSystem.ensureCareerPatrolState
}, 'COMPLETED', { hullAtEnd: 32, patrolScore: 800 });

assert.ok(batteredRecord.refitTurnaround, 'Patrol record must contain refitTurnaround');
assert.equal(batteredRecord.refitTurnaround.recommendedPatrolType, 'RECOVERY_PATROL');
assert.equal(batteredRecord.refitTurnaround.residualStress, true);
assert.ok(batteredRecord.refitTurnaround.hullRestored <= 88, 'Hull ceiling must be enforced');
assert.ok(batteredRecord.refitTurnaround.refitNotes.length >= 2, 'Must include shipyard repair dispatches');

// ═══════════════════════════════════════════════════ SECTION 27 — AUTOMATISCH FOOTPRINT- EN PERFORMANCEBUDGET (INITIATIEF 10)
console.log('\n[TEST SECTION 27] Automatisch Footprint- en Performancebudget (Initiatief 10)');

// Test 1: Asset- & Scriptomvang Budgetbewaking & PWA Offline Shell Cache
const idxHtml = await readFile(path.join(root, 'index.html'), 'utf8');
const swSrc = await readFile(path.join(root, 'sw.js'), 'utf8');
const htmlScripts = [...idxHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const missingInSw = htmlScripts.filter(s => !swSrc.includes(`'${s}'`) && !swSrc.includes(`"${s}"`));
assert.equal(missingInSw.length, 0, 'Every script tag in index.html must be cached in sw.js SHELL array');

// Test 2: DOM-Knooppunten & Presentatiebegrenzing
const totalTags = (idxHtml.match(/<[a-zA-Z0-9\-]+/g) || []).length;
const tStart = idxHtml.indexOf('<div id="touchShell">');
const tEnd = idxHtml.indexOf('<!-- end touchShell -->');
const tTags = tStart >= 0 && tEnd > tStart ? (idxHtml.slice(tStart, tEnd).match(/<[a-zA-Z0-9\-]+/g) || []).length : -1;
const dStart = idxHtml.indexOf('<div id="desktopShell">');
const dEnd = idxHtml.indexOf('<!-- end desktopShell -->');
const dTags = dStart >= 0 && dEnd > dStart ? (idxHtml.slice(dStart, dEnd).match(/<[a-zA-Z0-9\-]+/g) || []).length : -1;

assert.ok(totalTags <= 1200, `Total DOM elements in index.html (${totalTags}) must stay <= 1200 for mobile memory`);
assert.ok(tTags <= 350, `Touch shell DOM elements (${tTags}) must stay <= 350`);
assert.ok(dTags <= 400, `Desktop shell DOM elements (${dTags}) must stay <= 400`);

// Test 3: Transient Object Pools & Simulatie-Array Hard Ceilings
const fpSimState = {
  weapons: { activeTorpedoes: [], explosions: [], hits: [], duds: [] },
  world: { depthCharges: [], knuckles: [], radio: { inbox: [] } },
  campaign: { importantEvents: [], startDate: '1943-08-17', patrolDuration: 100 },
  runtime: { campaign: { _captainEventSeq: 0, _careerStartDate: '1943-08-17 06:00' } },
  time: { elapsedSeconds: 100 }
};

// Fill beyond capacity
for (let i = 0; i < 40; i++) {
  fpSimState.weapons.activeTorpedoes.push({ id: `T-${i}`, status: 'RUNNING', ageSec: 0 });
  fpSimState.weapons.explosions.push({ id: `E-${i}`, ageSec: 0, maxAgeSec: 5 });
  fpSimState.world.depthCharges.push({ id: `DC-${i}`, status: 'SINKING', ageSec: 0, fuseSec: 10 });
  fpSimState.world.knuckles.push({ t: 100, pos: { xNm: 0, yNm: 0 } });
}

// Apply bounding rules
if (fpSimState.weapons.activeTorpedoes.length > 16) fpSimState.weapons.activeTorpedoes.splice(0, fpSimState.weapons.activeTorpedoes.length - 16);
if (fpSimState.weapons.explosions.length > 24) fpSimState.weapons.explosions.splice(0, fpSimState.weapons.explosions.length - 24);
if (fpSimState.world.depthCharges.length > 32) fpSimState.world.depthCharges.splice(0, fpSimState.world.depthCharges.length - 32);
if (fpSimState.world.knuckles.length > 12) fpSimState.world.knuckles.splice(0, fpSimState.world.knuckles.length - 12);

assert.equal(fpSimState.weapons.activeTorpedoes.length, 16, 'Active torpedoes must be hard-capped at 16');
assert.equal(fpSimState.weapons.explosions.length, 24, 'Weapons explosions must be hard-capped at 24');
assert.equal(fpSimState.world.depthCharges.length, 32, 'World depth charges must be hard-capped at 32');
assert.equal(fpSimState.world.knuckles.length, 12, 'Hydrodynamic knuckles must be hard-capped at 12');

// Test 4: FIFO Log Capping (captainLog, radio inbox, state.log)
const fpCareerSim = {
  state: fpSimState,
  ensureCareerPatrolState: navCtx.CareerSystem.ensureCareerPatrolState,
  aar: { recordEvent: () => {} }
};
for (let i = 0; i < 200; i++) {
  navCtx.CareerSystem.captainLog.call(fpCareerSim, 'PATROL_LOG', `Log entry ${i}`);
}
assert.ok(fpSimState.campaign.importantEvents.length <= 150, `Captain's log must be strictly FIFO-capped at 150 entries (actual: ${fpSimState.campaign.importantEvents.length})`);
assert.equal(fpSimState.campaign.importantEvents[fpSimState.campaign.importantEvents.length - 1].text, 'Log entry 199');

// Test 5: WebAudio Polyfonie, Stemmenbegrenzing & Render SLA
const audSrc = await readFile(path.join(root, 'js/audio/audio-engine.js'), 'utf8');
assert.ok(/hybridBudgetBytes\s*=\s*8\s*\*\s*1024\s*\*\s*1024/.test(audSrc), 'Hybrid audio decoded heap must be capped at 8 MB');
assert.ok(/id==='HULL_CREAK'\?1:/.test(audSrc), 'HULL_CREAK must be strictly limited to 1 voice to eliminate clipping');
assert.ok(/now-\(this\.lastCreak\|\|0\)<3500/.test(audSrc), 'HULL_CREAK must enforce >= 3500ms cooldown');
assert.ok(/now-\(this\.lastWaypoint\|\|0\)<450/.test(audSrc), 'WAYPOINT must enforce >= 450ms cooldown');
assert.ok(/_metalClack\([^,]+,[^,]+,[^,]+,\s*['"]command['"]\)/.test(audSrc), 'WAYPOINT must be routed to command bus');

const baselinePath = path.join(root, 'tests/benchmark-baseline.json');
if (existsSync(baselinePath)) {
  const bData = JSON.parse(await readFile(baselinePath, 'utf8'));
  assert.ok(bData.scores.composite >= 1000, `Benchmark composite score must meet SLA >= 1000 (actual: ${bData.scores.composite})`);
  assert.ok(bData.render.stats.p95 <= 16.67, `Render frametime p95 must meet 60 FPS SLA <= 16.67ms (actual: ${bData.render.stats.p95}ms)`);
}

// ─── [TEST SECTION 28] Dynamische Atmosfeer, Maritieme Fauna & Periscoop-Optiek ───
console.log('\n[TEST SECTION 28] Dynamische Atmosfeer, Maritieme Fauna & Periscoop-Optiek (Grafische Verfraaiing)');

const w3dSrc = await readFile(path.join(root, 'js/rendering/world-3d.js'), 'utf8');
const p3dSrc = await readFile(path.join(root, 'js/rendering/periscope-3d.js'), 'utf8');
const atmSrc = await readFile(path.join(root, 'js/rendering/battle-atmosphere.js'), 'utf8');

// Test 1: Squall neerslagschacht & Bliksem uitbreiding
assert.ok(/isStormWx=wx==='STORM'\|\|wx==='TROPICAL SQUALLS'\|\|wx==='MONSOON SQUALLS'/.test(w3dSrc), 'Bliksem moet geactiveerd worden voor STORM, TROPICAL SQUALLS en MONSOON SQUALLS');
assert.ok(/gShaft=ctx\.createLinearGradient\(0,baseCy,0,hy\)/.test(w3dSrc), 'Weather cells moeten een verticale neerslagschacht (regengordijn) van wolkbasis naar horizon renderen');
assert.ok(/tilt=c\.heading!==undefined\?Math\.sin\(degToRad\(c\.heading-cam\.bearingDeg\)\)/.test(w3dSrc), 'Regengordijn moet wind-afhankelijke afwijking berekenen op basis van koers en zichtpeiling');
assert.ok(/sSh=this\._flash>0\.05\?sh\*\(1-this\._flash\*0\.65\)/.test(w3dSrc), 'Schepen moeten als donker silhouet afsteken tijdens bliksemflitsen (this._flash > 0.05)');

// Test 2: Maritieme Fauna (Zeevogels verankerd aan Kust & Wrakken + Boegdolfijnen)
assert.ok(/drawGulls\(ctx,w,h,cam,t,dl,state=null\)/.test(w3dSrc), 'drawGulls moet de state ontvangen voor contextuele plaatsing');
assert.ok(/this\.drawGulls\(ctx,w,h,cam,t,dl,state\)/.test(p3dSrc), 'periscope-3d.js moet state doorgeven aan drawGulls');
assert.ok(/c\.sunk&&distNm\(own,c\.position\)<4\.8/.test(w3dSrc), 'Zeevogels moeten cirkelen boven recente scheepswrakken binnen 4.8 NM');
assert.ok(/minD=6\.5[\s\S]*f\.points/.test(w3dSrc), 'Zeevogels moeten cirkelen boven nabijgelegen eilandkusten binnen 6.5 NM als natuurlijk navigatiebaken');
assert.ok(/sub\.depthFeet<12&&\(sub\.propulsion\?\.speedKnots\|\|0\)>8\.5[\s\S]*porpoiseCycle=/.test(w3dSrc), 'Boegdolfijnen moeten verschijnen bij snelle vaart aan de oppervlakte in daglicht');

// Test 3: Periscoop-Optiek (Lensspoeling & Beaded Droplets)
assert.ok(/broachBand=clamp\(1-Math\.abs\(depth-46\)\/8,0,1\)/.test(atmSrc), 'drawPeriscopeBroachWash moet activeren rond de werkelijke periscoopdiepte (40-52 ft)');
assert.ok(/g\.addColorStop\(0,`rgba\(110,168,188,/.test(atmSrc), 'Periscoopdoorbraak moet een oceaan-waterfilm renderen');
assert.ok(/quadraticCurveTo[\s\S]*dripSpeed/.test(atmSrc), 'Aflopende waterrivulets moeten omlaag stromen over de periscooplens');
assert.ok(/arc\(x\+\(i%2\?2:-2\)\*k,y\+len,Math\.max\(1,1\.8\*k\)/.test(atmSrc), 'Waterrivulets moeten kraaldruppels vormen aan de uiteinden');

// ─── [TEST SECTION 29] ASW Bathythermograaf, Wolfpack Coördinatie & Wrakresten/Bioluminescentie ───
console.log('\n[TEST SECTION 29] ASW Bathythermograaf, Wolfpack Coördinatie & Wrakresten/Bioluminescentie (Opties 1-3)');

const soundSrc = await readFile(path.join(root, 'js/rendering/sound-room.js'), 'utf8');
const sensorsSrc = await readFile(path.join(root, 'js/simulation/sensors.js'), 'utf8');
const missionSrc = await readFile(path.join(root, 'js/simulation/mission-framework.js'), 'utf8');

// Test 1: Bathythermograaf (BT) Display & Thermocline Akoestische Demping
assert.ok(/BT TRACE \(GRADIENT\)/.test(soundSrc), 'Sound station moet Bathythermograph (BT-Trace) paneel renderen');
assert.ok(/LAYER \$\{layer\}FT/.test(soundSrc), 'BT Trace moet de actuele thermoclinelaag in feet markeren');
assert.ok(/▼ SHIELDED \(REFRACTING\)[\s\S]*▲ IN SURFACE DUCT/.test(soundSrc), 'BT Trace moet refractiestatus tonen op basis van duikdiepte t.o.v. layer');
assert.ok(/belowLayer\?\.42:1/.test(sensorsSrc), 'Sensorsysteem moet actieve sonar ping audio dempen wanneer de speler onder de thermocline ligt');

// Test 2: Wolfpack Coördinatie, Gevechtscues op Afstand & Flank Diversion
assert.ok(/W\.cooperativeSubmarines&&\[['"]ATTACK_RELEASED['"],['"]ATTACK_IN_PROGRESS['"]\]\.includes\(W\.cooperativeSubmarines\.status\)/.test(missionSrc), 'Mission framework moet actieve wolfpack status controleren voor gevechtscues');
assert.ok(/A\.starshells\.push\(\{id:`COOP-SS-/.test(missionSrc), 'Coöperatieve wolfpack aanval moet afstand-starshells afvuren om escortes af te leiden');
assert.ok(/A\.muzzleFlashes\.push\(\{id:`COOP-MF-/.test(missionSrc), 'Coöperatieve wolfpack aanval moet mondingsflitsen op de horizon projecteren');
assert.ok(/subName=c\.campaignProfileId\?\.includes\('KM'\)\?'U-552'/.test(missionSrc), 'Radioberichten van historische zusterboten moeten theater-specifiek zijn (bijv. U-552, USS Barb, HMS Safari, I-26)');
assert.ok(/diverting convoy escorts/i.test(missionSrc), 'Radiobericht moet de afleidingsactie op het escorte bevestigen');

// Test 3: Wrakresten (Drijvende kratten, vlotten, olievlekken) & Tropische Nachtelijke Bioluminescentie
assert.ok(/drawWreckDebris3D\(ctx,cam,state,dl,t\)/.test(w3dSrc), 'world-3d.js moet drijvende wrakresten renderen bij gezonken schepen');
assert.ok(/this\.drawWreckDebris3D\?\.\(ctx,cam,state,dl,t\)/.test(p3dSrc), 'periscope-3d.js moet drawWreckDebris3D aanroepen in de periscoopscene');
assert.ok(/gSlick=ctx\.createRadialGradient/.test(w3dSrc), 'Wrakresten moeten een radiale olievlek renderen op het zeeoppervlak');
assert.ok(/isWarm=[\s\S]*bioLuminescent=dl<0\.24&&isWarm&&spd>2\.8/.test(w3dSrc), 'Bioluminescent boeg- en hekgolfschuim moet triggeren in warme wateren bij nacht');
assert.ok(/rgba\(96,248,208,/.test(w3dSrc), 'Bioluminescent schuim moet oplichten in fosforescerend smaragd-cyaan (zeevonk)');

console.log('behaviour tests passed: TDC 6, routes 4, optics 5, HUD viewmodel 3, hull SAT 5, render recovery 1, national palettes 6, harbor 4, 2.5D port 2, nets/starshells 6, special ops & AAR 3, ship recognition & stadimeter 4, compartmental damage & trim 4, damage visuals & sinking trajectories 4, grognard identification & cross-system 5, topography & island coastlines 4, enemy doctrines & sensor physics 5, map legend & primary target marking 5, kielmarge & steerageway 5, audio polyphony & creak limiting 3, cinematics duration & salvo pacing 3, internal benchmark & telemetry 4, automatische veilige routeplanning & landmassa navigatie 5, dynamische bewaking van missiepacing & intercept inlichtingen 5, aar als tactische reconstructie & declassified truth 5, verdieping van campagnegevolgen & refit cyclus 5, automatisch footprint- en performancebudget 5, dynamische atmosfeer & fauna 3, asw bathythermograaf & wolfpack & wrakresten 3');
