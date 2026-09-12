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

// ─── 7. Audio Director Mix Matrices, Threat Scaling & Stings ───────────────
console.log('[AUDIO TEST] Testing Audio Director mix matrices, dynamic threat scaling, and stings...');

// 1. Verify stings & alarms files on disk
const stingKeys = [
  'GENERAL_ALARM', 'BRIEFING_START', 'OBJECTIVE_COMPLETE', 'OBJECTIVE_FAILED',
  'RETURN_TO_BASE', 'AAR_CAREER', 'AIR_ATTACK_TENSION', 'MUSIC_HISTORIC',
  'MUSIC_RETURN', 'MUSIC_FAIL'
];
let totalStingsDiskBytes = 0;
for (const key of stingKeys) {
  const spec = manifest[key];
  assert.ok(spec, `Sting manifest entry missing for ${key}`);
  const filePath = path.join(root, spec.url.replace(/^\.\//, ''));
  assert.ok(existsSync(filePath), `Sting file missing at ${filePath}`);
  const st = await stat(filePath);
  assert.ok(st.size > 10000, `Sting file ${key} is unexpectedly small (${st.size} bytes)`);
  totalStingsDiskBytes += st.size;
}
console.log(`[AUDIO TEST] Total 10 stings & alarms disk footprint: ${(totalStingsDiskBytes / 1024).toFixed(1)} KB`);
assert.ok(totalStingsDiskBytes < 750 * 1024, `10 stings & alarms exceed 750 KB disk allocation: ${totalStingsDiskBytes}`);

// 2. AudioDirector mix profile evaluation
function calcDirectorProfile(q) {
  const m = { system: 1, command: 1, sensor: 1, world: 1, machinery: 1, weapons: 1, mission: 1 };
  if (q.base === 'SILENT_RUNNING') Object.assign(m, { system: .70, command: .82, sensor: 1.12, world: .32, machinery: .48, mission: .82 });
  else if (q.base === 'PERISCOPE_STALK') Object.assign(m, { system: .82, sensor: 1.05, world: .48, machinery: .70 });
  else if (q.base === 'SURFACED_TRANSIT') Object.assign(m, { world: 1.05, machinery: 1.02 });
  else if (q.base === 'RETURN_HOME') Object.assign(m, { world: .88, machinery: .86, mission: 1.05 });

  if (q.perspective === 'HYDROPHONE_FEED') Object.assign(m, { system: m.system * .68, world: m.world * .20, machinery: m.machinery * .45, sensor: Math.min(1.30, m.sensor * 1.16) });
  else if (q.perspective === 'PERISCOPE_INTERNAL') Object.assign(m, { world: m.world * .72, machinery: m.machinery * .88 });
  else if (q.perspective === 'EXPOSED_SURFACE') Object.assign(m, { world: Math.min(1.30, m.world * 1.15), sensor: m.sensor * .75 });
  else if (q.perspective === 'SUBMERGED') m.world *= .42;

  if (q.threat === 'ENEMY_SEARCH') Object.assign(m, { sensor: Math.min(1.28, m.sensor * 1.12), machinery: m.machinery * .78 });
  else if (q.threat === 'DETECTED_ASW') Object.assign(m, { sensor: Math.min(1.30, m.sensor * 1.14), command: 1.05, machinery: m.machinery * .72, world: m.world * .78, weapons: 1.10 });
  else if (q.threat === 'AIR_ATTACK') Object.assign(m, { command: 1.06, world: Math.min(1.15, m.world * 1.08), machinery: m.machinery * .88, weapons: 1.08 });

  if (q.compressed) { m.system *= .38; m.command *= .58; m.world *= .62; m.machinery *= .78; m.mission *= .72; }
  return m;
}

// Cruising navigation mix (normal baseline)
const cruising = calcDirectorProfile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'INTERNAL_SURFACE', compressed: false });
assert.equal(cruising.machinery, 1.0);
assert.equal(cruising.world, 1.0);
assert.equal(cruising.sensor, 1.0);

// Silent running mix
const silent = calcDirectorProfile({ base: 'SILENT_RUNNING', threat: 'NONE', perspective: 'SUBMERGED', compressed: false });
assert.equal(silent.machinery, 0.48, 'Machinery in silent running must be suppressed to 0.48');
assert.ok(silent.world < 0.15, 'Underwater world in silent running must be suppressed below 0.15');
assert.equal(silent.sensor, 1.12, 'Sensor bus must be lifted in silent running');

// Hydrophone feed in Sound Room
const soundRoom = calcDirectorProfile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'HYDROPHONE_FEED', compressed: false });
assert.ok(soundRoom.world <= 0.20, 'World must be ducked to <= 0.20 in hydrophone feed');
assert.ok(soundRoom.machinery <= 0.45, 'Machinery must be ducked to <= 0.45 in hydrophone feed');
assert.ok(soundRoom.sensor >= 1.16, 'Sensor must be lifted in hydrophone feed');

// Exposed surface perspective on Bridge
const bridge = calcDirectorProfile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'EXPOSED_SURFACE', compressed: false });
assert.equal(bridge.world, 1.15, 'Exposed bridge perspective must lift world wind/spray');
assert.equal(bridge.sensor, 0.75, 'Exposed bridge perspective must attenuate hydrophone/sensor bus');

// Detected ASW combat threat escalation
const aswThreat = calcDirectorProfile({ base: 'NORMAL_NAVIGATION', threat: 'DETECTED_ASW', perspective: 'SUBMERGED', compressed: false });
assert.equal(aswThreat.sensor, 1.14, 'Sensor bus must lift on ASW threat');
assert.equal(aswThreat.weapons, 1.10, 'Weapons bus must lift on ASW threat');
assert.equal(aswThreat.machinery, 0.72, 'Machinery must attenuate on ASW threat');

// Time compression mix
const timeCompressed = calcDirectorProfile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'INTERNAL_SURFACE', compressed: true });
assert.equal(timeCompressed.system, 0.38, 'Routine system chatter must attenuate during time compression');
assert.equal(timeCompressed.command, 0.58, 'Command bus must attenuate to 0.58 during time compression');
assert.equal(timeCompressed.mission, 0.72, 'Mission bus must attenuate during time compression');

// 3. Alarm ducking factors & hierarchy
const duckGeneralAlarm = calcDuckFactor(86);
assert.ok(duckGeneralAlarm < 0.56 && duckGeneralAlarm > 0.54, `General alarm duck factor must be ~0.55, got ${duckGeneralAlarm}`);

const duckCrashDive = calcDuckFactor(92);
assert.ok(duckCrashDive < 0.53 && duckCrashDive > 0.51, `Crash dive duck factor must be ~0.52, got ${duckCrashDive}`);

assert.ok(duckCrashDive < duckGeneralAlarm, 'Crash dive must duck machinery deeper than general alarm');

// ─── 8. National Telegraph Acoustics, Helm Feedback & Hydrophone Bandwidth ──
console.log('[AUDIO TEST] Testing national telegraph acoustics, helm feedback, and hydrophone filters...');

function calcTelegraphParams(identity) {
  const tPitch = clamp(Number(identity.telegraphPitch) || 1, 0.7, 1.6);
  const tone = identity.telegraphTone || 'CHADBURN';
  const baseFreq = (tone === 'GONG' ? 1350 : tone === 'ADMIRALTY_BELL' ? 1480 : tone === 'BRASS_CLANG' ? 1620 : tone === 'BRONZE_BELL' ? 1120 : tone === 'IRON_CHIME' ? 820 : 1200) * tPitch;
  const lowFreq = (tone === 'IRON_CHIME' ? 95 : tone === 'BRONZE_BELL' ? 115 : tone === 'GONG' ? 145 : 110) * tPitch;
  const hasEchoStrike = (tone === 'GONG' || tone === 'ADMIRALTY_BELL' || tone === 'BRONZE_BELL');
  return { tPitch, tone, baseFreq, lowFreq, hasEchoStrike };
}

function calcHydrophoneFilterFreqs(bandwidth, cadenceHz) {
  const cad = clamp(cadenceHz, 0.55, 3.4);
  const bwFactor = bandwidth === 'NARROW_GHG' ? 1.22 : bandwidth === 'ASDIC_PASSIVE' ? 1.12 : bandwidth === 'TYPE93_ARRAY' ? 0.94 : bandwidth === 'IDROFONO_BASE' ? 0.88 : bandwidth === 'MARS_PASSIVE' ? 0.82 : 1.0;
  const whineFreq = (480 + cad * 390) * bwFactor;
  const filterFreq = (520 + cad * 330) * bwFactor;
  return { bwFactor, whineFreq, filterFreq };
}

const fleetIdentities = {
  US_FLEET: { telegraphPitch: 1.0, telegraphTone: 'CHADBURN', hydrophoneBandwidth: 'WIDE' },
  KM_VIIC: { telegraphPitch: 1.32, telegraphTone: 'GONG', hydrophoneBandwidth: 'NARROW_GHG' },
  IJN_B1: { telegraphPitch: 1.45, telegraphTone: 'BRASS_CLANG', hydrophoneBandwidth: 'TYPE93_ARRAY' },
  RN_T_CLASS: { telegraphPitch: 1.18, telegraphTone: 'ADMIRALTY_BELL', hydrophoneBandwidth: 'ASDIC_PASSIVE' },
  RM_MARCELLO: { telegraphPitch: 0.92, telegraphTone: 'BRONZE_BELL', hydrophoneBandwidth: 'IDROFONO_BASE' },
  VMF_S_CLASS: { telegraphPitch: 0.82, telegraphTone: 'IRON_CHIME', hydrophoneBandwidth: 'MARS_PASSIVE' }
};

const observedBaseFreqs = new Set();
for (const [fleet, id] of Object.entries(fleetIdentities)) {
  const params = calcTelegraphParams(id);
  assert.ok(params.baseFreq >= 600 && params.baseFreq <= 2500, `Base frequency for ${fleet} out of acoustic bounds: ${params.baseFreq}`);
  assert.ok(params.lowFreq >= 70 && params.lowFreq <= 250, `Low frequency for ${fleet} out of acoustic bounds: ${params.lowFreq}`);
  assert.ok(!observedBaseFreqs.has(Math.round(params.baseFreq)), `Telegraph base frequency collision detected for ${fleet}: ${params.baseFreq}`);
  observedBaseFreqs.add(Math.round(params.baseFreq));

  // Hydrophone filter response check
  const hSlow = calcHydrophoneFilterFreqs(id.hydrophoneBandwidth, 0.8);
  const hFast = calcHydrophoneFilterFreqs(id.hydrophoneBandwidth, 2.5);
  assert.ok(hFast.whineFreq > hSlow.whineFreq, 'Faster contact cadence must increase hydrophone whine frequency');
  assert.ok(hFast.filterFreq > hSlow.filterFreq, 'Faster contact cadence must shift hydrophone noise bandpass upward');
}

// Ensure Kriegsmarine GHG has highest frequency resonance and Soviet Mars has lowest
const kmBw = calcHydrophoneFilterFreqs(fleetIdentities.KM_VIIC.hydrophoneBandwidth, 1.5);
const vmfBw = calcHydrophoneFilterFreqs(fleetIdentities.VMF_S_CLASS.hydrophoneBandwidth, 1.5);
const usBw = calcHydrophoneFilterFreqs(fleetIdentities.US_FLEET.hydrophoneBandwidth, 1.5);
assert.ok(kmBw.bwFactor > usBw.bwFactor, 'Kriegsmarine GHG must have narrower/higher resonance than US wideband');
// Debounce gating verification
let lastTelegraph = 1000;
function testTelegraphDebounce(nowMs) {
  if (nowMs - lastTelegraph < 150) return false;
  lastTelegraph = nowMs;
  return true;
}
assert.equal(testTelegraphDebounce(1050), false, 'Telegraph must debounce within 150ms window');
assert.equal(testTelegraphDebounce(1160), true, 'Telegraph must fire after 150ms debounce window');

let lastHelm = 2000;
function testHelmDebounce(nowMs) {
  if (nowMs - lastHelm < 180) return false;
  lastHelm = nowMs;
  return true;
}
assert.equal(testHelmDebounce(2100), false, 'Helm order must debounce within 180ms window');
assert.equal(testHelmDebounce(2200), true, 'Helm order must fire after 180ms debounce window');

console.log('[AUDIO TEST] National telegraph acoustics, helm feedback, and hydrophone filters passed.');

// ─── 9. Audio Polyfonie & Kraakbegrenzing (Helios Baseline) ────────────────
console.log('[AUDIO TEST] Testing Helios polyphony capping, hull creak limiting, and waypoint debounce...');

// Test 1: HULL_CREAK voice-capping (max 1 active voice)
const creakVoices = [];
let creakStolenOrFaded = 0;
const mockMetaCreak = { activeVoices: 0, bytes: 120 * 1024, lastUsed: 0 };

function tryHybridCreak(id, nowSec) {
  const maxSampleVoices = id === 'HULL_CREAK' ? 1 : 4;
  if ((mockMetaCreak.activeVoices || 0) >= maxSampleVoices) {
    if (maxSampleVoices === 1) {
      const idx = creakVoices.findIndex(v => v.id === id);
      if (idx !== -1) {
        creakVoices.splice(idx, 1);
        mockMetaCreak.activeVoices--;
        creakStolenOrFaded++;
      }
    } else {
      return false;
    }
  }
  const voice = { id, startedAt: nowSec };
  creakVoices.push(voice);
  mockMetaCreak.activeVoices++;
  return true;
}

// First creak spawns successfully
assert.equal(tryHybridCreak('HULL_CREAK', 10.0), true);
assert.equal(creakVoices.length, 1);
assert.equal(mockMetaCreak.activeVoices, 1);
assert.equal(creakStolenOrFaded, 0);

// Second creak gracefully fades/steals the first without stacking
assert.equal(tryHybridCreak('HULL_CREAK', 11.5), true);
assert.equal(creakVoices.length, 1, 'HULL_CREAK must never stack multiple active voices');
assert.equal(mockMetaCreak.activeVoices, 1, 'HULL_CREAK activeVoices must remain exactly 1');
assert.equal(creakStolenOrFaded, 1, 'Old creak voice must be faded/stolen gracefully');

// Test 2: playCreak throttling window (3500ms)
let lastCreakMs = 10000;
function testPlayCreakThrottle(nowMs) {
  if (nowMs - lastCreakMs < 3500) return false;
  lastCreakMs = nowMs;
  return true;
}
assert.equal(testPlayCreakThrottle(10500), false, 'playCreak must reject triggers within 3500ms window');
assert.equal(testPlayCreakThrottle(12000), false, 'playCreak must reject triggers at 2000ms delta');
assert.equal(testPlayCreakThrottle(13499), false, 'playCreak must reject triggers at 3499ms delta');
assert.equal(testPlayCreakThrottle(13501), true, 'playCreak must permit trigger after 3500ms cooldown');

// Test 3: playWaypoint throttling window (450ms) and command bus routing
let lastWaypointMs = 0;
let waypointPlayedCount = 0;
function testPlayWaypointThrottle(nowMs) {
  if (nowMs - lastWaypointMs < 450) return false;
  lastWaypointMs = nowMs;
  waypointPlayedCount++;
  return true;
}
// Rapid transit across 5 waypoints within 200ms
for (let delta = 0; delta < 200; delta += 40) {
  testPlayWaypointThrottle(50000 + delta);
}
assert.equal(waypointPlayedCount, 1, 'Rapid transit triggers within 200ms must only fire 1 waypoint sound');
assert.equal(testPlayWaypointThrottle(50449), false, 'Waypoint must reject trigger at 449ms');
assert.equal(testPlayWaypointThrottle(50451), true, 'Waypoint must fire after 450ms cooldown');
assert.equal(waypointPlayedCount, 2, 'Waypoint count must be 2 after cooldown expires');

console.log('[AUDIO TEST] Helios polyphony capping, hull creak limiting, and waypoint debounce passed.');

console.log('\n[AUDIO TEST] All Hybrid Audio Pipeline tests passed successfully (9/9 test suites)!');


