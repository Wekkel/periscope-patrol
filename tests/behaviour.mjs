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
assert.ok(ssRenderHarness.ctx.gradients.length > 0, 'drawStarshells3D must render magnesium flare and sea reflection gradients');

console.log('behaviour tests passed: TDC 6, routes 4, optics 5, HUD viewmodel 3, hull SAT 5, render recovery 1, national palettes 6, harbor 4, 2.5D port 2, nets/starshells 6');
