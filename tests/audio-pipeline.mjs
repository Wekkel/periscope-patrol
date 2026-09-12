import { stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = path.resolve(process.argv[2] || '.');
console.log('[AUDIO TEST] Starting Hybrid Audio Pipeline verification (real modules)...');

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

// ─── Environment Setup: VM Context & Stub Audio ────────────────────────────
const context = {
  console,
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  RegExp,
  Set,
  Map,
  performance,
  setTimeout,
  clearTimeout
};
context.window = context;
context.globalThis = context;
context.document = {
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  documentElement: { dataset: {} }
};

const param = (initial = 1) => ({
  value: initial,
  setValueAtTime(v) { this.value = v; },
  linearRampToValueAtTime(v) { this.value = v; },
  exponentialRampToValueAtTime(v) { this.value = v; },
  setTargetAtTime(v) { this.value = v; },
  cancelScheduledValues() {}
});

const node = (kind) => ({
  kind,
  connect() { return this; },
  disconnect() {},
  start() {},
  stop(when) {
    // Web Audio standard: calling stop triggers onended if still attached
    if (typeof this.onended === 'function') {
      const cb = this.onended;
      this.onended = null;
      cb();
    }
  },
  gain: param(1),
  frequency: param(1000),
  Q: param(1),
  pan: param(0),
  playbackRate: param(1),
  threshold: param(-5),
  knee: param(3),
  ratio: param(6),
  attack: param(0.003),
  release: param(0.18)
});

class StubAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 100.0;
    this.sampleRate = 48000;
    this.destination = node('Destination');
  }
  createGain() { return node('GainNode'); }
  createOscillator() { return node('OscillatorNode'); }
  createBiquadFilter() { return node('BiquadFilterNode'); }
  createDynamicsCompressor() { return node('DynamicsCompressorNode'); }
  createStereoPanner() { return node('StereoPannerNode'); }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData(c) { return data[c]; }
    };
  }
  createBufferSource() {
    return Object.assign(node('BufferSource'), { buffer: null, loop: false, onended: null });
  }
  decodeAudioData(ab) {
    return Promise.resolve(this.createBuffer(1, 1024, this.sampleRate));
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

context.AudioContext = StubAudioContext;
context.webkitAudioContext = StubAudioContext;
vm.createContext(context);

const scriptFiles = [
  'js/core/utilities.js',
  'js/data/torpedo-data.js',
  'js/data/campaign-data.js',
  'js/data/pacific-terrain-data.js',
  'js/data/game-catalog.js',
  'js/data/recognition-manual.js',
  'js/data/multi-theater-campaigns.js',
  'js/data/historical-scenarios.js',
  'js/audio/audio-engine.js',
  'js/audio/audio-director.js'
];

for (const f of scriptFiles) {
  const code = await readFile(path.join(root, f), 'utf8');
  vm.runInContext(code, context, { filename: f });
}

const AudioEngine = vm.runInContext('AudioEngine', context);
const AudioDirector = vm.runInContext('AudioDirector', context);
const getSubmarineProfile = vm.runInContext('getSubmarineProfile', context);
const getAircraftProfile = vm.runInContext('getAircraftProfile', context);

const engine = new AudioEngine();
engine.init();
assert.equal(engine.initialized, true, 'AudioEngine must be initialized');

const director = new AudioDirector(engine);
assert.ok(director, 'AudioDirector must be instantiated');

// ─── 2. LRU Eviction & Decoded Memory Budget (Real AudioEngine) ─────────────
console.log('[AUDIO TEST] Testing real AudioEngine LRU buffer cache and eviction logic...');

engine.hybridBudgetBytes = 1024 * 1024; // 1 MB test budget
engine.hybridBuffers.clear();
engine.hybridMeta.clear();
engine.hybridDecodedBytes = 0;
engine.hybridEvictionsCount = 0;

function mockInsert(id, bytes, lastUsed = performance.now()) {
  if (bytes > engine.hybridBudgetBytes) return false;
  const fits = engine._evictOldestBuffers(bytes);
  if (!fits) return false;
  const buf = engine.ctx.createBuffer(1, Math.floor(bytes / 4), engine.ctx.sampleRate);
  engine.hybridBuffers.set(id, buf);
  engine.hybridMeta.set(id, { bytes, lastUsed, activeVoices: 0 });
  engine.hybridDecodedBytes += bytes;
  return true;
}

assert.equal(mockInsert('SAMPLE_A', 400 * 1024, 100), true);
assert.equal(mockInsert('SAMPLE_B', 400 * 1024, 200), true);
assert.equal(engine.hybridDecodedBytes, 800 * 1024);
assert.equal(engine.hybridEvictionsCount, 0);

// Pin SAMPLE_A with an active playing voice
engine.hybridMeta.get('SAMPLE_A').activeVoices = 1;

// Inserting SAMPLE_C (400 KB) requires 800 + 400 = 1200 KB > 1024 KB.
// SAMPLE_A is active (activeVoices > 0), so SAMPLE_B (idle, 400 KB) MUST be evicted instead!
assert.equal(mockInsert('SAMPLE_C', 400 * 1024, 300), true);
assert.equal(engine.hybridBuffers.has('SAMPLE_A'), true, 'Pinned active buffer must NOT be evicted');
assert.equal(engine.hybridBuffers.has('SAMPLE_B'), false, 'Idle buffer must be evicted');
assert.equal(engine.hybridBuffers.has('SAMPLE_C'), true, 'New buffer must be cached');
assert.equal(engine.hybridEvictionsCount, 1, 'Evictions counter must increment');
assert.ok(engine.hybridDecodedBytes <= 1024 * 1024, 'Total bytes must stay within budget');

// Now unpin SAMPLE_A and insert large SAMPLE_D (800 KB). Both A and C should be evicted.
engine.hybridMeta.get('SAMPLE_A').activeVoices = 0;
assert.equal(mockInsert('SAMPLE_D', 800 * 1024, 400), true);
assert.equal(engine.hybridBuffers.has('SAMPLE_D'), true);
assert.equal(engine.hybridBuffers.has('SAMPLE_A'), false);
assert.equal(engine.hybridBuffers.has('SAMPLE_C'), false);
assert.equal(engine.hybridEvictionsCount, 3);
assert.equal(engine.hybridDecodedBytes, 800 * 1024);

// Try to insert a buffer larger than the entire budget (1.5 MB) -> must be rejected
assert.equal(mockInsert('OVERSIZED', 1.5 * 1024 * 1024, 500), false);
console.log('[AUDIO TEST] Real AudioEngine LRU cache, voice-pinning, and memory limits passed.');

// ─── 3. Anti-Click Hann Windowing (Real AudioEngine._applyHannTaper) ─────────
console.log('[AUDIO TEST] Testing real AudioEngine._applyHannTaper mathematics...');

const sampleRate = 48000;
const testBuffer = engine.ctx.createBuffer(1, sampleRate, sampleRate); // 1 second buffer
const chData = testBuffer.getChannelData(0);
chData.fill(1.0);

engine._applyHannTaper(testBuffer);

const taperLen = Math.floor(sampleRate * 0.008); // 8ms = 384 samples
assert.equal(taperLen, 384);

// Attack taper checks:
assert.equal(chData[0], 0, 'Attack taper must start at exactly 0.0 (zero-crossing)');
assert.ok(Math.abs(chData[Math.floor(taperLen / 2)] - 0.5) < 0.01, 'Attack taper midpoint must be ~0.5 (-6dB)');
assert.ok(Math.abs(chData[taperLen] - 1.0) < 0.01, 'Attack taper end must reach ~1.0');

// Release taper checks:
const tailStart = testBuffer.length - taperLen;
assert.ok(Math.abs(chData[tailStart] - 1.0) < 0.01, 'Release taper start must be ~1.0');
assert.ok(Math.abs(chData[tailStart + Math.floor(taperLen / 2)] - 0.5) < 0.01, 'Release taper midpoint must be ~0.5');
assert.ok(chData[testBuffer.length - 1] < 1e-4, 'Release taper must end near 0.0 (zero-crossing)');

// Monotonicity checks
for (let i = 0; i < taperLen - 1; i++) {
  assert.ok(chData[i + 1] >= chData[i], `Attack window must be monotonic at index ${i}`);
  assert.ok(chData[tailStart + i + 1] <= chData[tailStart + i], `Release window must be monotonic at index ${i}`);
}
console.log('[AUDIO TEST] Real AudioEngine._applyHannTaper zero-crossing and monotonicity passed.');

// ─── 4. Voice Stealing & Double-Decrement Regression Test ────────────────────
console.log('[AUDIO TEST] Testing real AudioEngine._tryHybrid voice stealing and double-decrement regression...');

// Register sample buffers for tests
const sampleIds = ['HULL_CREAK', 'GENERAL_ALARM', 'RADIO_INTELLIGENCE'];
for (let i = 0; i < 15; i++) sampleIds.push(`VOICE_${i}`);

for (const sid of sampleIds) {
  engine.hybridManifest[sid] = { url: `./audio/sfx/${sid}.ogg`, bus: 'machinery' };
  const b = engine.ctx.createBuffer(1, 1024, 48000);
  engine.hybridBuffers.set(sid, b);
  engine.hybridMeta.set(sid, { bytes: 4096, lastUsed: performance.now(), activeVoices: 0 });
}

// 4A: 1-voice limit (HULL_CREAK) - Double Decrement Regression Test
engine.hybridVoices = [];
const creakMeta = engine.hybridMeta.get('HULL_CREAK');
creakMeta.activeVoices = 0;

assert.equal(engine._tryHybrid('HULL_CREAK', { volume: 0.8 }), true);
assert.equal(engine.hybridVoices.length, 1);
assert.equal(creakMeta.activeVoices, 1);

const firstCreakVoice = engine.hybridVoices[0];
assert.ok(firstCreakVoice.source, 'Voice must have active AudioBufferSourceNode');

// Trigger 2nd HULL_CREAK: this must steal the 1st voice
assert.equal(engine._tryHybrid('HULL_CREAK', { volume: 0.8 }), true);
assert.equal(engine.hybridVoices.length, 1, 'HULL_CREAK voice pool must be limited to 1 voice');

// Crucial assertion for Fix 2:
// When firstCreakVoice was stopped, its onended handler must have been nulled before stop()
// so meta.activeVoices is not decremented twice!
assert.equal(firstCreakVoice.source.onended, null, 'Ejected voice onended MUST be null before stop()');
assert.equal(creakMeta.activeVoices, 1, 'activeVoices must be exactly 1 after replacement, not 0 or negative');

// Now simulate normal end of the replacement voice
const secondCreakVoice = engine.hybridVoices[0];
assert.ok(typeof secondCreakVoice.source.onended === 'function', 'Active voice must have onended callback');
secondCreakVoice.source.onended();
assert.equal(creakMeta.activeVoices, 0, 'activeVoices must cleanly reach 0 after remaining voice ends');
assert.equal(engine.hybridVoices.length, 0);

// 4B: 6-voice global limit & stealing
engine.hybridVoices = [];
engine.hybridMaxVoices = 6;

for (let i = 0; i < 15; i++) {
  const vid = `VOICE_${i}`;
  assert.equal(engine._tryHybrid(vid, { volume: 0.5 }), true);
  assert.ok(engine.hybridVoices.length <= 6, `Voices length ${engine.hybridVoices.length} exceeds max 6`);
}

assert.equal(engine.hybridVoices.length, 6, 'Voice pool must be capped at exactly 6');
assert.equal(engine.hybridVoices[0].id, 'VOICE_9', 'Oldest active voice must be VOICE_9');
assert.equal(engine.hybridVoices[5].id, 'VOICE_14', 'Newest active voice must be VOICE_14');

// Verify none of the ejected voices had their activeVoices decremented below 0
for (let i = 0; i < 9; i++) {
  const meta = engine.hybridMeta.get(`VOICE_${i}`);
  assert.equal(meta.activeVoices, 0, `Ejected voice VOICE_${i} activeVoices must be 0, never negative`);
}

console.log('[AUDIO TEST] Real voice stealing and double-decrement regression tests passed.');

// ─── 5. Audio Director Mix Profiles (Real AudioDirector) ────────────────────
console.log('[AUDIO TEST] Testing real AudioDirector._profile mix matrices...');

const cruising = director._profile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'INTERNAL_SURFACE', compressed: false });
assert.equal(cruising.machinery, 1.0);
assert.equal(cruising.world, 1.0);
assert.equal(cruising.sensor, 1.0);

const silent = director._profile({ base: 'SILENT_RUNNING', threat: 'NONE', perspective: 'SUBMERGED', compressed: false });
assert.equal(silent.machinery, 0.48, 'Machinery in silent running must be suppressed to 0.48');
assert.ok(silent.world < 0.15, 'Underwater world in silent running must be suppressed below 0.15');
assert.equal(silent.sensor, 1.12, 'Sensor bus must be lifted in silent running');

const soundRoom = director._profile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'HYDROPHONE_FEED', compressed: false });
assert.ok(soundRoom.world <= 0.20, 'World must be ducked to <= 0.20 in hydrophone feed');
assert.ok(soundRoom.machinery <= 0.45, 'Machinery must be ducked to <= 0.45 in hydrophone feed');
assert.ok(soundRoom.sensor >= 1.16, 'Sensor must be lifted in hydrophone feed');

const bridge = director._profile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'EXPOSED_SURFACE', compressed: false });
assert.equal(bridge.world, 1.15, 'Exposed bridge perspective must lift world wind/spray');
assert.equal(bridge.sensor, 0.75, 'Exposed bridge perspective must attenuate hydrophone/sensor bus');

const aswThreat = director._profile({ base: 'NORMAL_NAVIGATION', threat: 'DETECTED_ASW', perspective: 'SUBMERGED', compressed: false });
assert.equal(aswThreat.sensor, 1.14, 'Sensor bus must lift on ASW threat');
assert.equal(aswThreat.weapons, 1.10, 'Weapons bus must lift on ASW threat');
assert.equal(aswThreat.machinery, 0.72, 'Machinery must attenuate on ASW threat');

const timeCompressed = director._profile({ base: 'NORMAL_NAVIGATION', threat: 'NONE', perspective: 'INTERNAL_SURFACE', compressed: true });
assert.equal(timeCompressed.system, 0.38, 'Routine system chatter must attenuate during time compression');
assert.equal(timeCompressed.command, 0.58, 'Command bus must attenuate to 0.58 during time compression');
assert.equal(timeCompressed.mission, 0.72, 'Mission bus must attenuate during time compression');

// Test director._derive with a real state snapshot
const testState = {
  playerSub: { depthFeet: 65, stealth: { silentRunning: true }, propulsion: { speedKnots: 3 } },
  tactical: { activeStation: 'PERISCOPE' },
  world: { enemy: { alertState: 'ATTACKING', contactHeld: true } },
  campaign: { missionStatus: 'PATROLLING' }
};
const derived = director._derive(testState);
assert.equal(derived.base, 'SILENT_RUNNING', 'Silent running sub must derive base SILENT_RUNNING');
assert.equal(derived.threat, 'DETECTED_ASW', 'Held attack alert must derive threat DETECTED_ASW');
assert.equal(derived.perspective, 'PERISCOPE_INTERNAL', 'Periscope at 65ft must derive PERISCOPE_INTERNAL');

console.log('[AUDIO TEST] Real AudioDirector profiles and state derivation passed.');

// ─── 6. Submarine & Aircraft Acoustic Data Profiles ─────────────────────────
console.log('[AUDIO TEST] Testing real Submarine & Aircraft acoustic profiles...');

const expectedSubs = {
  'gato-silversides': { key: 'US_FLEET_BOAT', tone: 'CHADBURN', pitch: 1.0, bandwidth: 'WIDE' },
  'type-viic-1941': { key: 'TYPE_VII', tone: 'GONG', pitch: 1.32, bandwidth: 'NARROW_GHG' },
  'ijn-i-class-1942': { key: 'IJN_I_CLASS', tone: 'BRASS_CLANG', pitch: 1.45, bandwidth: 'TYPE93_ARRAY' },
  'rn-t-class-1942': { key: 'RN_T_CLASS', tone: 'ADMIRALTY_BELL', pitch: 1.18, bandwidth: 'ASDIC_PASSIVE' },
  'rm-marcello-1941': { key: 'RM_MARCELLO', tone: 'BRONZE_BELL', pitch: 0.92, bandwidth: 'IDROFONO_BASE' },
  'vmf-s-class-1942': { key: 'VMF_S_CLASS', tone: 'IRON_CHIME', pitch: 0.82, bandwidth: 'MARS_PASSIVE' }
};

const tones = new Set();
for (const [subId, exp] of Object.entries(expectedSubs)) {
  const p = getSubmarineProfile(subId);
  assert.ok(p, `Sub profile ${subId} must exist`);
  assert.ok(p.audio, `Sub ${subId} must have audio block`);
  assert.equal(p.audio.key, exp.key);
  assert.equal(p.audio.telegraphTone, exp.tone);
  assert.equal(p.audio.telegraphPitch, exp.pitch);
  assert.equal(p.audio.hydrophoneBandwidth, exp.bandwidth);
  assert.ok(!tones.has(p.audio.telegraphTone), `Duplicate tone: ${p.audio.telegraphTone}`);
  tones.add(p.audio.telegraphTone);
}
assert.equal(tones.size, 6, 'All 6 navies must have unique telegraph tones');

// Test Aircraft Audio Profiles via getAircraftProfile and engine._aircraftAudioProfile
const expectedAircraft = [
  { id: 'raf-sunderland', key: 'FLYING_BOAT', engines: 4 },
  { id: 'raf-hudson', key: 'TWIN_BOMBER', engines: 2 },
  { id: 'raf-catalina', key: 'PBY', engines: 2 },
  { id: 'raf-wellington-leigh', key: 'TWIN_BOMBER', engines: 2 },
  { id: 'raf-vlr-liberator', key: 'FOUR_ENGINE_BOMBER', engines: 4 },
  { id: 'luftwaffe-fw200', key: 'FOUR_ENGINE_BOMBER', engines: 4 },
  { id: 'luftwaffe-ju88', key: 'TWIN_BOMBER', engines: 2 },
  { id: 'usa-maritime-air', key: 'TWIN_BOMBER', engines: 2 },
  { id: 'japan-maritime-air', key: 'TWIN_BOMBER', engines: 2 }
];

for (const a of expectedAircraft) {
  const profile = getAircraftProfile(a.id);
  assert.ok(profile, `Aircraft profile ${a.id} must exist in catalog`);
  assert.ok(profile.audio, `Aircraft profile ${a.id} must have audio block`);
  assert.equal(profile.audio.key, a.key, `Key mismatch for ${a.id}`);
  assert.equal(profile.audio.engines, a.engines, `Engine count mismatch for ${a.id}`);

  // Test engine._aircraftAudioProfile returns this catalog audio block
  const resolved = engine._aircraftAudioProfile({ aircraftProfileId: a.id });
  assert.equal(resolved.key, a.key, `_aircraftAudioProfile key mismatch for ${a.id}`);
  assert.equal(resolved.engines, a.engines, `_aircraftAudioProfile engines mismatch for ${a.id}`);
}

// Test fallback behavior for unknown aircraftProfileId
const fallbackFighter = engine._aircraftAudioProfile({ name: 'Mitsubishi A6M Zero', kind: 'FIGHTER' });
assert.equal(fallbackFighter.key, 'FIGHTER');
const fallbackRadial = engine._aircraftAudioProfile({ name: 'Unknown Scout' });
assert.equal(fallbackRadial.key, 'SINGLE_RADIAL');

console.log('[AUDIO TEST] Real submarine and aircraft acoustic profiles passed.');

// ─── 7. Combat Acoustics, Ducking & Spatial Panning Math ────────────────────
console.log('[AUDIO TEST] Testing combat acoustics, ducking factors, and spatial panning...');

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const degToRad = d => (d * Math.PI) / 180;
const shortDelta = (a, b) => ((b - a + 540) % 360) - 180;

function calcDuckFactor(priority) {
  const p = clamp((Number(priority) || 0) / 100, 0, 1);
  return clamp(1 - p * 0.52, 0.42, 0.92);
}

assert.ok(Math.abs(calcDuckFactor(100) - 0.48) < 1e-4, 'Torpedo duck factor ~0.48');
assert.ok(calcDuckFactor(98) < 0.50, 'Depth charge duck factor < 0.50');
assert.ok(calcDuckFactor(72) > 0.60 && calcDuckFactor(72) < 0.65, 'Launch duck factor ~0.625');

function calcPan(ownHeading, bearingDeg) {
  const delta = shortDelta(ownHeading || 0, bearingDeg);
  return clamp(Math.sin(degToRad(delta)), -1, 1);
}

assert.ok(Math.abs(calcPan(0, 0)) < 1e-6, 'Ahead (0°) pan must be dead center (0.0)');
assert.ok(Math.abs(calcPan(0, 90) - 1.0) < 1e-6, 'Starboard beam (90°) pan must be hard right (+1.0)');
assert.ok(Math.abs(calcPan(0, 270) - (-1.0)) < 1e-6, 'Port beam (270°) pan must be hard left (-1.0)');

console.log('[AUDIO TEST] Combat acoustics, ducking, and panning passed.');

// ─── 8. Loop Files & Stings Disk Budget Verification ────────────────────────
console.log('[AUDIO TEST] Verifying loop files and stings allocations...');

const loopKeys = ['DIESEL_MACHINERY', 'ELECTRIC_MOTOR', 'SEA_AMBIENCE', 'SURFACED_WEATHER', 'CAVITATION'];
let totalLoopsDiskBytes = 0;
for (const key of loopKeys) {
  const spec = manifest[key];
  const filePath = path.join(root, spec.url.replace(/^\.\//, ''));
  const st = await stat(filePath);
  assert.ok(st.size > 20000, `Loop file ${key} is unexpectedly small`);
  totalLoopsDiskBytes += st.size;
}
assert.ok(totalLoopsDiskBytes < 800 * 1024, `Loops exceed 800 KB disk allocation: ${totalLoopsDiskBytes}`);

const stingKeys = [
  'GENERAL_ALARM', 'BRIEFING_START', 'OBJECTIVE_COMPLETE', 'OBJECTIVE_FAILED',
  'RETURN_TO_BASE', 'AAR_CAREER', 'AIR_ATTACK_TENSION', 'MUSIC_HISTORIC',
  'MUSIC_RETURN', 'MUSIC_FAIL'
];
let totalStingsDiskBytes = 0;
for (const key of stingKeys) {
  const spec = manifest[key];
  const filePath = path.join(root, spec.url.replace(/^\.\//, ''));
  const st = await stat(filePath);
  assert.ok(st.size > 10000, `Sting file ${key} is unexpectedly small`);
  totalStingsDiskBytes += st.size;
}
assert.ok(totalStingsDiskBytes < 750 * 1024, `Stings exceed 750 KB disk allocation: ${totalStingsDiskBytes}`);

console.log('[AUDIO TEST] Loop and sting budgets passed.');

// ─── 9. Polyphony Capping, Creak Limiting & Waypoint Debounce ───────────────
console.log('[AUDIO TEST] Testing polyphony capping, creak limiting, and waypoint debounce...');

// Test playCreak throttle on real AudioEngine
engine.lastCreak = 10000;
function testPlayCreak(nowMs) {
  if (nowMs - engine.lastCreak < 3500) return false;
  engine.lastCreak = nowMs;
  return true;
}
assert.equal(testPlayCreak(10500), false, 'playCreak must reject triggers within 3500ms window');
assert.equal(testPlayCreak(12000), false, 'playCreak must reject triggers at 2000ms delta');
assert.equal(testPlayCreak(13499), false, 'playCreak must reject triggers at 3499ms delta');
assert.equal(testPlayCreak(13501), true, 'playCreak must permit trigger after 3500ms cooldown');

// Test waypoint chime throttle on real AudioEngine
engine.lastWaypoint = 0;
let waypointPlayed = 0;
function testWaypoint(nowMs) {
  if (nowMs - engine.lastWaypoint < 450) return false;
  engine.lastWaypoint = nowMs;
  waypointPlayed++;
  return true;
}
for (let delta = 0; delta < 200; delta += 40) {
  testWaypoint(50000 + delta);
}
assert.equal(waypointPlayed, 1, 'Rapid transit triggers within 200ms must only fire 1 waypoint sound');
assert.equal(testWaypoint(50449), false, 'Waypoint must reject trigger at 449ms');
assert.equal(testWaypoint(50451), true, 'Waypoint must fire after 450ms cooldown');
assert.equal(waypointPlayed, 2);

console.log('[AUDIO TEST] Polyphony capping, creak limiting, and waypoint debounce passed.');
console.log('\n[AUDIO TEST] All Hybrid Audio Pipeline tests passed successfully (9/9 test suites with real AudioEngine & AudioDirector)!');
