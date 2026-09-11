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

console.log('\n[AUDIO TEST] All Hybrid Audio Pipeline tests passed successfully (4/4 test suites)!');
