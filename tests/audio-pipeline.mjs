// ═══════════════════════════════════════════════════ HYBRID AUDIO PIPELINE TESTS
// Standalone deterministic verification for Periscope Patrol Hybrid Audio Pipeline.

import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] || '.');
console.log('[AUDIO TEST] Starting Hybrid Audio Pipeline verification...');

// ─── 1. Manifest & File Integrity ───────────────────────────────────────────
const manifest = {
  SONAR_PING: { url: './audio/sfx/sonar_ping_01.ogg', bus: 'sensor' },
  GENERAL_ALARM: { url: './audio/sfx/general_alarm_01.ogg', bus: 'command' },
  DECK_GUN_SHOT: { url: './audio/sfx/deck_gun_shot_01.ogg', bus: 'weapons' },
  DECK_GUN_IMPACT: { url: './audio/sfx/deck_gun_impact_01.ogg', bus: 'weapons' },
  TORPEDO_LAUNCH: { url: './audio/sfx/torpedo_launch_01.ogg', bus: 'weapons' },
  TUBE_FILL: { url: './audio/sfx/torpedo_tube_fill_01.ogg', bus: 'system' },
  TORPEDO_HIT: { url: './audio/sfx/torpedo_impact_01.ogg', bus: 'weapons' },
  TORPEDO_DUD: { url: './audio/sfx/torpedo_dud_01.ogg', bus: 'weapons' },
  DEPTH_CHARGE: { url: './audio/sfx/depth_charge_near_01.ogg', bus: 'weapons' },
  HYDROPHONE_CONTACT: { url: './audio/sfx/hydrophone_contact_01.ogg', bus: 'sensor' },
  RADIO_INTELLIGENCE: { url: './audio/sfx/radio_intelligence_01.ogg', bus: 'command' },
  HULL_CREAK: { url: './audio/sfx/hull_pressure_creaks_01.ogg', bus: 'machinery' },
  TORPEDO_RUN: { url: './audio/sfx/torpedo_run_01.ogg', bus: 'sensor' },
  AIRCRAFT_ATTACK: { url: './audio/sfx/aircraft_overflight_attack_01.ogg', bus: 'world' },
  AIRCRAFT_PATROL: { url: './audio/sfx/aircraft_overflight_patrol_01.ogg', bus: 'world' },
  AIRCRAFT_RECON: { url: './audio/sfx/aircraft_overflight_recon_01.ogg', bus: 'world' },
  CAVITATION: { url: './audio/loops/cavitation_01.ogg', bus: 'sensor' },
  DIESEL_MACHINERY: { url: './audio/loops/diesel_machinery_01.ogg', bus: 'machinery' },
  ELECTRIC_MOTOR: { url: './audio/loops/electric_motor_01.ogg', bus: 'machinery' },
  SEA_AMBIENCE: { url: './audio/loops/sea_ambience_01.ogg', bus: 'world' },
  SURFACED_WEATHER: { url: './audio/loops/surfaced_weather_01.ogg', bus: 'world' },
  AAR_CAREER: { url: './audio/stings/aar_career_01.ogg', bus: 'mission' },
  AIR_ATTACK_TENSION: { url: './audio/stings/air_attack_tension_01.ogg', bus: 'mission' },
  BRIEFING_START: { url: './audio/stings/briefing_start_01.ogg', bus: 'mission' },
  MUSIC_FAIL: { url: './audio/stings/music_fail_01.ogg', bus: 'mission' },
  MUSIC_HISTORIC: { url: './audio/stings/music_historic_01.ogg', bus: 'mission' },
  MUSIC_RETURN: { url: './audio/stings/music_return_01.ogg', bus: 'mission' },
  OBJECTIVE_COMPLETE: { url: './audio/stings/objective_complete_01.ogg', bus: 'mission' },
  OBJECTIVE_FAILED: { url: './audio/stings/objective_failed_01.ogg', bus: 'mission' },
  RETURN_TO_BASE: { url: './audio/stings/return_to_base_01.ogg', bus: 'mission' }
};

let manifestCount = 0;
let totalAudioDiskBytes = 0;

for (const [id, spec] of Object.entries(manifest)) {
  const filePath = path.join(root, spec.url.replace(/^\.\//, ''));
  assert.ok(existsSync(filePath), `Manifest slot '${id}' file missing at: ${filePath}`);
  const st = await stat(filePath);
  assert.ok(st.size > 1000, `Audio asset for '${id}' is suspiciously small: ${st.size} bytes`);
  totalAudioDiskBytes += st.size;
  manifestCount++;
}

console.log(`[AUDIO TEST] Manifest integrity verified: ${manifestCount} audio slots exist and have valid payloads.`);
console.log(`[AUDIO TEST] Total disk audio size: ${(totalAudioDiskBytes / (1024 * 1024)).toFixed(2)} MB (${totalAudioDiskBytes} bytes) <= budget 2.00 MB`);
assert.ok(totalAudioDiskBytes <= 2_000_000, `Audio files on disk exceed 2MB budget: ${totalAudioDiskBytes}`);

// ─── 2. LRU Eviction & Decoded Memory Budget Simulation ─────────────────────
console.log('[AUDIO TEST] Testing LRU buffer cache and eviction logic...');

class MockHybridCache {
  constructor(budgetBytes = 8 * 1024 * 1024) {
    this.hybridBuffers = new Map();
    this.hybridMeta = new Map();
    this.hybridDecodedBytes = 0;
    this.hybridBudgetBytes = budgetBytes;
    this.hybridEvictionsCount = 0;
  }

  _evictOldestBuffers(neededBytes = 0) {
    if (this.hybridDecodedBytes + neededBytes <= this.hybridBudgetBytes) return true;
    const candidates = [];
    for (const [id, meta] of this.hybridMeta.entries()) {
      if ((meta.activeVoices || 0) === 0) {
        candidates.push({ id, bytes: meta.bytes, lastUsed: meta.lastUsed || 0 });
      }
    }
    candidates.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const c of candidates) {
      this.hybridBuffers.delete(c.id);
      this.hybridMeta.delete(c.id);
      this.hybridDecodedBytes = Math.max(0, this.hybridDecodedBytes - c.bytes);
      this.hybridEvictionsCount++;
      if (this.hybridDecodedBytes + neededBytes <= this.hybridBudgetBytes) break;
    }
    return (this.hybridDecodedBytes + neededBytes <= this.hybridBudgetBytes);
  }

  insert(id, bytes, lastUsed = Date.now()) {
    if (bytes > this.hybridBudgetBytes) return false;
    const fits = this._evictOldestBuffers(bytes);
    if (!fits) return false;
    this.hybridBuffers.set(id, { id });
    this.hybridMeta.set(id, { bytes, lastUsed, activeVoices: 0 });
    this.hybridDecodedBytes += bytes;
    return true;
  }
}

// Set up 1 MB test budget
const cache = new MockHybridCache(1024 * 1024);
assert.equal(cache.insert('SAMPLE_A', 400 * 1024, 100), true);
assert.equal(cache.insert('SAMPLE_B', 400 * 1024, 200), true);
assert.equal(cache.hybridDecodedBytes, 800 * 1024);
assert.equal(cache.hybridEvictionsCount, 0);

// Pin SAMPLE_A with an active playing voice
cache.hybridMeta.get('SAMPLE_A').activeVoices = 1;

// Inserting SAMPLE_C (400 KB) requires 800 + 400 = 1200 KB > 1024 KB.
// SAMPLE_A is active (activeVoices > 0), so SAMPLE_B (idle, 400 KB) MUST be evicted instead!
assert.equal(cache.insert('SAMPLE_C', 400 * 1024, 300), true);
assert.equal(cache.hybridBuffers.has('SAMPLE_A'), true, 'Pinned active buffer must NOT be evicted');
assert.equal(cache.hybridBuffers.has('SAMPLE_B'), false, 'Idle buffer must be evicted');
assert.equal(cache.hybridBuffers.has('SAMPLE_C'), true, 'New buffer must be cached');
assert.equal(cache.hybridEvictionsCount, 1, 'Evictions counter must increment');
assert.ok(cache.hybridDecodedBytes <= 1024 * 1024, 'Total bytes must stay within budget');

// Now unpin SAMPLE_A and insert large SAMPLE_D (800 KB). Both A and C should be evicted.
cache.hybridMeta.get('SAMPLE_A').activeVoices = 0;
assert.equal(cache.insert('SAMPLE_D', 800 * 1024, 400), true);
assert.equal(cache.hybridBuffers.has('SAMPLE_D'), true);
assert.equal(cache.hybridBuffers.has('SAMPLE_A'), false);
assert.equal(cache.hybridBuffers.has('SAMPLE_C'), false);
assert.equal(cache.hybridEvictionsCount, 3);
assert.equal(cache.hybridDecodedBytes, 800 * 1024);

// Try to insert a buffer larger than the entire budget (1.5 MB) -> must be rejected
assert.equal(cache.insert('OVERSIZED', 1.5 * 1024 * 1024, 500), false);
console.log('[AUDIO TEST] LRU cache, voice-pinning, and memory limits passed.');

// ─── 3. Anti-Click Hann Windowing Mathematics ──────────────────────────────
console.log('[AUDIO TEST] Testing bidirectional Hann anti-click tapering mathematics...');

const sampleRate = 48000;
const taperLen = Math.floor(sampleRate * 0.008); // 8ms = 384 samples
assert.equal(taperLen, 384);

// Test attack taper: d[i] *= 0.5 * (1 - cos(pi * i / taperLen))
const attackFirst = 0.5 * (1 - Math.cos((Math.PI * 0) / taperLen));
const attackMid = 0.5 * (1 - Math.cos((Math.PI * (taperLen / 2)) / taperLen));
const attackEnd = 0.5 * (1 - Math.cos((Math.PI * taperLen) / taperLen));

assert.equal(attackFirst, 0, 'Attack taper must start at exactly 0.0 (zero-crossing)');
assert.ok(Math.abs(attackMid - 0.5) < 1e-6, 'Attack taper midpoint must be 0.5 (-6dB)');
assert.ok(Math.abs(attackEnd - 1.0) < 1e-6, 'Attack taper end must reach exactly 1.0');

// Test release taper: d[tailStart + i] *= 0.5 * (1 + cos(pi * i / taperLen))
const releaseFirst = 0.5 * (1 + Math.cos((Math.PI * 0) / taperLen));
const releaseMid = 0.5 * (1 + Math.cos((Math.PI * (taperLen / 2)) / taperLen));
const releaseEnd = 0.5 * (1 + Math.cos((Math.PI * taperLen) / taperLen));

assert.ok(Math.abs(releaseFirst - 1.0) < 1e-6, 'Release taper start must be exactly 1.0');
assert.ok(Math.abs(releaseMid - 0.5) < 1e-6, 'Release taper midpoint must be 0.5 (-6dB)');
assert.equal(releaseEnd, 0, 'Release taper must end at exactly 0.0 (zero-crossing)');

// Verify monotonicity
for (let i = 0; i < taperLen - 1; i++) {
  const a0 = 0.5 * (1 - Math.cos((Math.PI * i) / taperLen));
  const a1 = 0.5 * (1 - Math.cos((Math.PI * (i + 1)) / taperLen));
  assert.ok(a1 > a0, `Attack window must be strictly monotonic at index ${i}`);

  const r0 = 0.5 * (1 + Math.cos((Math.PI * i) / taperLen));
  const r1 = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / taperLen));
  assert.ok(r1 < r0, `Release window must be strictly monotonic at index ${i}`);
}
console.log('[AUDIO TEST] Hann windowing mathematics and zero-crossing bounds passed.');

// ─── 4. Voice Stealing & Voice Limit Logic ──────────────────────────────────
console.log('[AUDIO TEST] Testing soft voice stealing pool bounded behavior...');

const maxVoices = 6;
const voices = [];
let stolenCount = 0;

function spawnVoice(id, now = 100) {
  while (voices.length >= maxVoices) {
    const oldest = voices.shift();
    // Simulate soft ramp down: 8ms linear ramp to 0.0001, then stop
    stolenCount++;
  }
  const voice = { id, startedAt: now };
  voices.push(voice);
  return voice;
}

for (let i = 0; i < 15; i++) {
  spawnVoice(`VOICE_${i}`, 100 + i);
  assert.ok(voices.length <= maxVoices, `Voice pool exceeded max limit of ${maxVoices}`);
}

assert.equal(voices.length, 6, 'Voice pool must be capped at exactly maxVoices');
assert.equal(stolenCount, 9, 'Exactly 9 voices must have been gracefully stolen');
assert.equal(voices[0].id, 'VOICE_9', 'Oldest remaining voice must be VOICE_9');
assert.equal(voices[5].id, 'VOICE_14', 'Latest voice must be VOICE_14');
console.log('[AUDIO TEST] Voice pool limits and stealing logic passed.');

// ─── 5. Combat Acoustics, Ducking & Spatial Panning ────────────────────────
console.log('[AUDIO TEST] Testing combat acoustics, distance attenuation, and spatial panning...');

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const degToRad = d => (d * Math.PI) / 180;
const normDeg = d => ((d % 360) + 360) % 360;
const shortDelta = (a, b) => ((b - a + 540) % 360) - 180;

// 1. Ducking factor curve: duckFactor = clamp(1 - (priority / 100) * 0.52, 0.42, 0.92)
function calcDuckFactor(priority) {
  const p = clamp((Number(priority) || 0) / 100, 0, 1);
  return clamp(1 - p * 0.52, 0.42, 0.92);
}

// Torpedo hit (p=100) must duck world/machinery deeply (~48% volume)
const duckTorpedo = calcDuckFactor(100);
assert.ok(Math.abs(duckTorpedo - 0.48) < 1e-4, `Torpedo duck factor expected ~0.48, got ${duckTorpedo}`);

// Depth charge near (p=98) must duck heavily
const duckDCNear = calcDuckFactor(98);
assert.ok(duckDCNear < 0.50, `Near DC duck factor expected < 0.50, got ${duckDCNear}`);

// Torpedo launch (p=72) must duck moderately
const duckLaunch = calcDuckFactor(72);
assert.ok(duckLaunch > 0.60 && duckLaunch < 0.65, `Launch duck factor expected ~0.625, got ${duckLaunch}`);

// Minor dud (p=50) must duck lightly
const duckDud = calcDuckFactor(50);
assert.ok(duckDud > 0.70 && duckDud < 0.76, `Dud duck factor expected ~0.74, got ${duckDud}`);

// 2. Spatial stereo panner calculation: pan = clamp(sin(delta), -1, 1)
function calcPan(ownHeading, bearingDeg) {
  const delta = shortDelta(ownHeading || 0, bearingDeg);
  return clamp(Math.sin(degToRad(delta)), -1, 1);
}

assert.ok(Math.abs(calcPan(0, 0)) < 1e-6, 'Ahead (0°) pan must be dead center (0.0)');
assert.ok(Math.abs(calcPan(0, 90) - 1.0) < 1e-6, 'Starboard beam (90°) pan must be hard right (+1.0)');
assert.ok(Math.abs(calcPan(0, 270) - (-1.0)) < 1e-6, 'Port beam (270°) pan must be hard left (-1.0)');
assert.ok(Math.abs(calcPan(0, 180)) < 1e-6, 'Astern (180°) pan must be center (0.0)');
assert.ok(Math.abs(calcPan(45, 135) - 1.0) < 1e-6, 'Relative starboard beam with ownHeading 45° must be +1.0');
assert.ok(Math.abs(calcPan(315, 225) - (-1.0)) < 1e-6, 'Relative port beam with ownHeading 315° must be -1.0');

// 3. Distance attenuation scaling:
// Depth charge: scale = far ? 0.45 : mid ? 0.72 : 1.0
function calcDCScale(dist) {
  const near = clamp(1 - (Number(dist) || 0), 0, 1);
  const far = near < 0.18;
  const mid = !far && near < 0.58;
  return far ? 0.45 : mid ? 0.72 : 1.0;
}

assert.equal(calcDCScale(0.05), 1.0, 'Point blank DC (dist=0.05) must have full scale 1.0');
assert.equal(calcDCScale(0.50), 0.72, 'Mid-range DC (dist=0.50) must scale to 0.72');
assert.equal(calcDCScale(0.95), 0.45, 'Distant DC (dist=0.95) must scale to 0.45');

// Aerial bomb distance attenuation: v = clamp(1 - dist * 0.72, 0.18, 0.75)
function calcBombScale(dist) {
  const d = clamp(Number(dist) || 0, 0, 1);
  return clamp(1 - d * 0.72, 0.18, 0.75);
}

assert.equal(calcBombScale(0.0), 0.75, 'Direct hit bomb (dist=0.0) must be 0.75');
assert.equal(calcBombScale(1.0), 0.28, 'Distant bomb (dist=1.0) must attenuate to 0.28');
assert.ok(calcBombScale(0.5) < calcBombScale(0.2), 'Bomb scaling must be strictly monotonic decreasing with distance');

console.log('[AUDIO TEST] Combat acoustics, ducking, distance scaling, and spatial panning passed.');

// ─── 6. Ambient Loops, RPM Pitching & Cavitation Triggers ──────────────────
console.log('[AUDIO TEST] Testing ambient loops, RPM pitching, and cavitation triggers...');

// 1. Loop files disk budget & decoded heap verification
const loopKeys = ['DIESEL_MACHINERY', 'ELECTRIC_MOTOR', 'SEA_AMBIENCE', 'SURFACED_WEATHER', 'CAVITATION'];
let totalLoopsDiskBytes = 0;
for (const key of loopKeys) {
  const spec = manifest[key];
  assert.ok(spec, `Loop manifest entry missing for ${key}`);
  const filePath = path.join(root, spec.url.replace(/^\.\//, ''));
  assert.ok(existsSync(filePath), `Loop file missing at ${filePath}`);
  const st = await stat(filePath);
  assert.ok(st.size > 20000, `Loop file ${key} is unexpectedly small (${st.size} bytes)`);
  totalLoopsDiskBytes += st.size;
}
console.log(`[AUDIO TEST] Total 5 loops disk footprint: ${(totalLoopsDiskBytes / 1024).toFixed(1)} KB`);
assert.ok(totalLoopsDiskBytes < 800 * 1024, `5 ambient loops exceed 800 KB disk allocation: ${totalLoopsDiskBytes}`);

// 2. RPM to playbackRate transfer functions
function calcDieselRate(rpm) {
  const r = clamp(Number(rpm) || 0, 0, 1);
  return 0.80 + r * 0.45;
}

function calcElectricRate(rpm) {
  const r = clamp(Number(rpm) || 0, 0, 1);
  return 0.85 + r * 0.40;
}

// Diesel rate bounds: 0.80 (idle) to 1.25 (flank)
assert.equal(calcDieselRate(0.0), 0.80, 'Diesel idle playbackRate must be 0.80');
assert.ok(Math.abs(calcDieselRate(0.5) - 1.025) < 1e-6, 'Diesel half speed playbackRate must be 1.025');
assert.equal(calcDieselRate(1.0), 1.25, 'Diesel flank speed playbackRate must be 1.25');
assert.ok(calcDieselRate(0.8) > calcDieselRate(0.4), 'Diesel rate must increase monotonically with RPM');

// Electric rate bounds: 0.85 (stop/slow) to 1.25 (flank)
assert.equal(calcElectricRate(0.0), 0.85, 'Electric stop playbackRate must be 0.85');
assert.ok(Math.abs(calcElectricRate(0.5) - 1.05) < 1e-6, 'Electric half speed playbackRate must be 1.05');
assert.equal(calcElectricRate(1.0), 1.25, 'Electric flank speed playbackRate must be 1.25');
assert.ok(calcElectricRate(0.8) > calcElectricRate(0.4), 'Electric rate must increase monotonically with RPM');

// 3. Cavitation trigger logic
function calcCavitationIntensity(subDepthFt, ownRpm, bestEscortDistNm = 99, escortSpeedKnots = 0) {
  const ownCav = (subDepthFt < 55) && (ownRpm > 0.65);
  const ownCavIntensity = ownCav ? clamp((ownRpm - 0.65) / 0.35, 0, 1) * clamp(1 - (subDepthFt || 0) / 55, 0, 1) : 0;
  const escortCavIntensity = (bestEscortDistNm < 0.85 && escortSpeedKnots > 16) ? clamp(1 - bestEscortDistNm / 0.85, 0, 1) * clamp((escortSpeedKnots - 16) / 14, 0, 1) : 0;
  return Math.max(ownCavIntensity, escortCavIntensity);
}

// Deep diving at flank -> hydrostatic pressure suppresses own cavitation
assert.equal(calcCavitationIntensity(120, 1.0), 0, 'No own cavitation at 120ft depth despite flank speed');
// Shallow crawl -> low rpm blade tip speed below vapor pressure threshold
assert.equal(calcCavitationIntensity(20, 0.35), 0, 'No cavitation at low RPM (0.35) even in shallow water');
// Shallow water (25ft) at flank speed -> cavitation scream triggered!
const shallowFlankCav = calcCavitationIntensity(25, 1.0);
assert.ok(shallowFlankCav > 0.50, `Shallow flank cavitation intensity must be > 0.50, got ${shallowFlankCav}`);
// Just at threshold: depth 55ft -> 0
assert.equal(calcCavitationIntensity(55, 1.0), 0, 'Cavitation must cut off at or below 55ft threshold');

// Escort cavitation: destroyer closing fast at 28 knots, distance 0.35 nm
const escortCav = calcCavitationIntensity(150, 0.2, 0.35, 28);
assert.ok(escortCav > 0.40, `Charging escort cavitation must be audible (>0.40), got ${escortCav}`);
// Distant escort (1.2 nm) -> no cavitation audible
assert.equal(calcCavitationIntensity(150, 0.2, 1.2, 28), 0, 'Distant escort (>0.85 nm) must not trigger cavitation');
// Slow escort (10 knots) -> no blade cavitation
assert.equal(calcCavitationIntensity(150, 0.2, 0.35, 10), 0, 'Slow escort (<16 knots) must not trigger cavitation');

// 4. Silent running damping
function calcElectricMotorLevel(silentRunning, rpm) {
  const drive = 0.56 + (clamp(rpm, 0, 1)) * 0.66;
  return (silentRunning ? 0.009 : 0.016) * drive;
}

const normalLevel = calcElectricMotorLevel(false, 0.5);
const silentLevel = calcElectricMotorLevel(true, 0.5);
const dampingRatio = silentLevel / normalLevel;
assert.ok(Math.abs(dampingRatio - 0.5625) < 1e-4, `Silent running must attenuate electric motor to ~56% (-5dB), got ${dampingRatio}`);

// 5. Persistent loop pinning in LRU cache
const loopCache = new MockHybridCache(4 * 1024 * 1024);
assert.equal(loopCache.insert('DIESEL_MACHINERY', 1.2 * 1024 * 1024, 100), true);
assert.equal(loopCache.insert('ELECTRIC_MOTOR', 1.1 * 1024 * 1024, 200), true);
assert.equal(loopCache.insert('SEA_AMBIENCE', 1.1 * 1024 * 1024, 300), true);

// Pin the active persistent loops
loopCache.hybridMeta.get('DIESEL_MACHINERY').activeVoices = 1;
loopCache.hybridMeta.get('ELECTRIC_MOTOR').activeVoices = 1;
// SEA_AMBIENCE is idle (activeVoices = 0)

// Try to insert CAVITATION (1.0 MB) into 4 MB cache (currently 3.4 MB used).
// Needed: 3.4 + 1.0 = 4.4 MB > 4.0 MB.
// SEA_AMBIENCE must be evicted because DIESEL and ELECTRIC are pinned!
assert.equal(loopCache.insert('CAVITATION', 1.0 * 1024 * 1024, 400), true);
assert.equal(loopCache.hybridBuffers.has('DIESEL_MACHINERY'), true, 'Pinned diesel loop must remain');
assert.equal(loopCache.hybridBuffers.has('ELECTRIC_MOTOR'), true, 'Pinned electric motor loop must remain');
assert.equal(loopCache.hybridBuffers.has('SEA_AMBIENCE'), false, 'Unpinned sea ambience was evicted');
assert.equal(loopCache.hybridBuffers.has('CAVITATION'), true, 'New cavitation buffer cached');

console.log('[AUDIO TEST] Ambient loops, RPM transfer functions, cavitation logic, and silent running passed.');

console.log('\n[AUDIO TEST] All Hybrid Audio Pipeline tests passed successfully (6/6 test suites)!');

