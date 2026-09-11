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
  'shipAttitude', 'applyTorpedoShipDamage', 'updateShipDamage'
], {
  clamp,
  radToDeg,
  degToRad,
  isSurfaceCombatant: () => false
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

console.log('behaviour tests passed: TDC 6, routes 4, optics 5, HUD viewmodel 3, hull SAT 5, render recovery 1, national palettes 6, harbor 4, 2.5D port 2, nets/starshells 6, special ops & AAR 3, ship recognition & stadimeter 4, compartmental damage & trim 4');

