// ═══════════════════════════════════════════════════ INTERNAL BENCHMARK
// Standardized benchmark for 3D framerate, audio load, and CPU cycles.
// Direct comparison across devices, platforms, and git commits.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
import os from 'node:os';
import vm from 'node:vm';

export function calculatePercentile(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (percentile / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const weight = rank - low;
  return sortedValues[low] + weight * (sortedValues[high] - sortedValues[low]);
}

export function computeStats(values) {
  if (!values.length) {
    return { mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, stddev: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
  return {
    mean: +(mean).toFixed(2),
    p50: +(calculatePercentile(sorted, 50)).toFixed(2),
    p95: +(calculatePercentile(sorted, 95)).toFixed(2),
    p99: +(calculatePercentile(sorted, 99)).toFixed(2),
    min: +(sorted[0]).toFixed(2),
    max: +(sorted[sorted.length - 1]).toFixed(2),
    stddev: +(Math.sqrt(variance)).toFixed(2),
    count: sorted.length
  };
}

export function computeBenchmarkScores({ render, simulation, audio }) {
  // Calibrated reference baseline:
  // Render: 60 FPS (16.6ms at p95) = 1000 pts. Faster is linearly higher.
  const refRenderMs = 16.67;
  const renderScore = Math.max(100, Math.round((refRenderMs / Math.max(0.5, render.stats.p95)) * 1000));

  // Simulation: 5000 us (20x real-time 10 Hz physics step at p95) = 1000 pts.
  const refSimUs = 5000;
  const simScore = Math.max(100, Math.round((refSimUs / Math.max(50, simulation.stats.p95)) * 1000));

  // Audio: 500 us hybrid dispatch at p95 = 1000 pts.
  const refAudioUs = 500;
  const audioScore = Math.max(100, Math.round((refAudioUs / Math.max(10, audio.stats.p95)) * 1000));

  // Composite: 45% Render, 40% Simulation, 15% Audio
  const compositeScore = Math.round(renderScore * 0.45 + simScore * 0.40 + audioScore * 0.15);

  return {
    render: renderScore,
    simulation: simScore,
    audio: audioScore,
    composite: compositeScore
  };
}

export async function createBenchmarkEnvironment(root = '.') {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const scriptMatches = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

  const telemetry = {
    drawCalls: 0,
    drawMethods: new Map(),
    audioCalls: 0,
    audioNodesCreated: 0,
    activeAudioNodes: 0
  };

  const canvasContext = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        telemetry.drawCalls++;
        telemetry.drawMethods.set(prop, (telemetry.drawMethods.get(prop) || 0) + 1);
        if (prop.includes('Gradient')) {
          return { addColorStop() {} };
        }
        if (prop === 'measureText') {
          return { width: 40 };
        }
        return undefined;
      };
    }
  });

  const makeAudioParam = (defaultValue = 0) => ({
    value: defaultValue,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    setValueCurveAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {}
  });

  const audioNode = (kind) => {
    telemetry.audioNodesCreated++;
    telemetry.activeAudioNodes++;
    return {
      kind,
      connect() { telemetry.audioCalls++; return this; },
      disconnect() { telemetry.audioCalls++; telemetry.activeAudioNodes = Math.max(0, telemetry.activeAudioNodes - 1); },
      start() { telemetry.audioCalls++; },
      stop() { telemetry.audioCalls++; },
      gain: makeAudioParam(1),
      frequency: makeAudioParam(440),
      detune: makeAudioParam(0),
      Q: makeAudioParam(1),
      pan: makeAudioParam(0),
      playbackRate: makeAudioParam(1),
      threshold: makeAudioParam(-24),
      knee: makeAudioParam(30),
      ratio: makeAudioParam(12),
      attack: makeAudioParam(0.003),
      release: makeAudioParam(0.25),
      type: 'sine',
      setPeriodicWave() {}
    };
  };

  class BenchmarkAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = audioNode('Destination');
    }
    createGain() { return audioNode('GainNode'); }
    createOscillator() { return audioNode('OscillatorNode'); }
    createBiquadFilter() { return audioNode('BiquadFilterNode'); }
    createDynamicsCompressor() { return audioNode('DynamicsCompressorNode'); }
    createBufferSource() { return Object.assign(audioNode('BufferSource'), { buffer: null, loop: false }); }
    createStereoPanner() { return audioNode('StereoPannerNode'); }
    createBuffer(channels, length, rate) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: () => new Float32Array(length)
      };
    }
    createPeriodicWave() { return {}; }
    decodeAudioData(arrayBuffer) {
      telemetry.audioCalls++;
      const len = Math.max(1024, Math.min(48000, arrayBuffer?.byteLength || 1024));
      return Promise.resolve({
        numberOfChannels: 1,
        length: len,
        sampleRate: this.sampleRate,
        duration: len / this.sampleRate,
        getChannelData: () => new Float32Array(len)
      });
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  function makeMockElement(tag = 'div', id = '') {
    return {
      tagName: String(tag).toUpperCase(),
      id,
      width: 1280,
      height: 800,
      clientWidth: 1280,
      clientHeight: 800,
      getContext: () => canvasContext,
      getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800 }),
      classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
      style: { display: '', getPropertyValue: () => '', setProperty: () => {} },
      setAttribute() {},
      getAttribute: () => '',
      removeAttribute() {},
      toggleAttribute() {},
      hasAttribute: () => false,
      dataset: {},
      parentElement: null,
      children: [],
      childNodes: [],
      firstChild: null,
      lastChild: null,
      insertBefore(child) { return child; },
      contains: () => false,
      focus() {},
      blur() {},
      click() {},
      appendChild(child) { return child; },
      removeChild(child) { return child; },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
      innerHTML: '',
      textContent: ''
    };
  }

  const localStorageMap = new Map();
  const mockLocalStorage = {
    getItem: (k) => localStorageMap.get(k) || null,
    setItem: (k, v) => localStorageMap.set(k, String(v)),
    removeItem: (k) => localStorageMap.delete(k),
    clear: () => localStorageMap.clear()
  };

  // Deterministic PRNG
  let prngSeed = 0x58c0de;
  const deterministicRandom = () => {
    prngSeed = (prngSeed * 1664525 + 1013904223) >>> 0;
    return prngSeed / 4294967296;
  };

  const sandbox = {
    console,
    Math: Object.assign(Object.create(Math), { random: deterministicRandom }),
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
    WeakMap,
    WeakSet,
    Error,
    TypeError,
    Float32Array,
    Uint8Array,
    Intl,
    Promise,
    URL,
    URLSearchParams,
    fetch: async (url) => {
      const clean = String(url).replace(/^\.\//, '');
      const full = path.resolve(root, clean);
      if (existsSync(full)) {
        try {
          const data = await readFile(full);
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          };
        } catch (_) {}
      }
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
    requestAnimationFrame: (fn) => setTimeout(() => fn(Number(process.hrtime.bigint()) / 1e6), 16),
    cancelAnimationFrame: () => {},
    AudioContext: BenchmarkAudioContext,
    webkitAudioContext: BenchmarkAudioContext,
    document: {
      documentElement: { dataset: { lay: 'desk' }, style: { getPropertyValue: () => '', setProperty: () => {} } },
      body: makeMockElement('body'),
      getElementById: (id) => makeMockElement('div', id),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag) => makeMockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    },
    window: null,
    navigator: {
      deviceMemory: 8,
      hardwareConcurrency: 8,
      userAgent: 'PeriscopePatrol-InternalBenchmark/1.0',
      wakeLock: { request: async () => ({ release: async () => {}, addEventListener() {} }) }
    },
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '0px' }),
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    visualViewport: { width: 1280, height: 800, addEventListener: () => {}, removeEventListener: () => {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    Image: class { constructor() { this.width = 1; this.height = 1; } },
    location: { href: 'http://localhost/', search: '' },
    requestIdleCallback: (fn) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 10 }), 0),
    cancelIdleCallback: () => {}
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);

  for (const src of scriptMatches) {
    const file = src.replace(/^\.\//, '');
    if (file.endsWith('start.js')) continue;
    const code = await readFile(path.join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  vm.runInContext(`(() => {
    if (typeof canvasView !== 'undefined') globalThis.canvasView = canvasView;
    else if (typeof CanvasView !== 'undefined') globalThis.canvasView = new CanvasView(document.getElementById('mainCanvas'));
    if (typeof audio !== 'undefined') globalThis.audio = audio;
  })();`, context);

  return { context, telemetry };
}

export async function runBenchmark({
  root = '.',
  simTicks = 250,
  framesPerStation = 30,
  stations = ['PERISCOPE', 'BRIDGE', 'MAP', 'SOUND', 'DECK_GUN', 'TACTICAL'],
  audioDispatches = 100
} = {}) {
  const initialMemory = process.memoryUsage();
  const { context, telemetry } = await createBenchmarkEnvironment(root);

  // ─────────────────────────────────────────────────────────────
  // 1. SETUP STANDARDIZED OPERATIONAL COMBAT SCENARIO
  // ─────────────────────────────────────────────────────────────
  vm.runInContext(`(() => {
    const g = globalThis.game;
    const state = g.state;
    // Standardize theater: Solomon Sea with convoy and ASW active
    g.dispatch({
      type: 'NEW_PATROL',
      areaKey: 'Solomon Sea',
      gameIdentity: {
        campaignId: 'pacific-submarine-war',
        warPartyId: 'pacific-usa',
        theaterId: 'pacific',
        playerFactionId: 'usa',
        campaignProfileId: 'us-pacific',
        submarineProfileId: 'gato-silversides'
      }
    });
    g.engine.processCommands();

    // Ensure convoy contacts exist
    if (!state.world.contacts || state.world.contacts.length < 6) {
      state.world.contacts = g.engine.makeConvoy(PATROL_AREAS['Solomon Sea'], {
        areaKey: 'Solomon Sea',
        startDate: state.campaign.startDate,
        historicalProfile: state.campaign.historicalProfile
      });
    }

    // Set operational conditions
    state.playerSub.mode = 'PERISCOPE';
    state.playerSub.depthFeet = 55;
    state.playerSub.heading = 90;
    state.playerSub.propulsion.orderedRpm = 120;
    state.playerSub.propulsion.actualRpm = 120;
    state.world.environment.seaState = 3;
    state.world.environment.daylight = 0.85;

    // Ready a torpedo tube and fire to generate active torpedo physics
    const readyTube = state.weapons.tubes[0];
    if (readyTube) {
      readyTube.status = 'READY';
      readyTube.flooded = true;
      g.dispatch({ type: 'FIRE_TORPEDO', tubeId: readyTube.id });
      g.engine.processCommands();
    }
  })();`, context);

  // ─────────────────────────────────────────────────────────────
  // 2. SIMULATION CPU BENCHMARK
  // ─────────────────────────────────────────────────────────────
  const simTickTimesUs = [];
  const simStartNs = process.hrtime.bigint();

  for (let i = 0; i < simTicks; i++) {
    const t0 = process.hrtime.bigint();
    vm.runInContext('globalThis.game.update(0.10);', context);
    const t1 = process.hrtime.bigint();
    simTickTimesUs.push(Number(t1 - t0) / 1e3); // microseconds
  }

  const simDurationMs = Number(process.hrtime.bigint() - simStartNs) / 1e6;
  const simStats = computeStats(simTickTimesUs);
  const ticksPerSecond = Math.round((simTicks / (simDurationMs / 1000)));

  // ─────────────────────────────────────────────────────────────
  // 3. HYBRID AUDIO PIPELINE BENCHMARK
  // ─────────────────────────────────────────────────────────────
  const audioDispatchTimesUs = [];
  const audioActions = [
    'HULL_CREAK',
    'GENERAL_ALARM',
    'RADIO_INTELLIGENCE',
    'playTorpedoLaunch',
    'playTorpedoHit',
    'playDepthChargeClose',
    'playGunFire',
    'playPingEcho',
    'playWaypoint'
  ];

  const audioStartNs = process.hrtime.bigint();

  for (let i = 0; i < audioDispatches; i++) {
    const action = audioActions[i % audioActions.length];
    const t0 = process.hrtime.bigint();
    vm.runInContext(`(() => {
      const audioEng = globalThis.audio;
      if (audioEng) {
        if (typeof audioEng['${action}'] === 'function') {
          audioEng['${action}']();
        } else if (typeof audioEng._tryHybrid === 'function') {
          audioEng._tryHybrid('${action}');
        }
      }
    })();`, context);
    const t1 = process.hrtime.bigint();
    audioDispatchTimesUs.push(Number(t1 - t0) / 1e3);
  }

  const audioStats = computeStats(audioDispatchTimesUs);
  const peakVoices = vm.runInContext('globalThis.audio?.hybridVoices?.length || 0;', context);

  // ─────────────────────────────────────────────────────────────
  // 4. 3D / 2.5D MULTI-STATION RENDER BENCHMARK
  // ─────────────────────────────────────────────────────────────
  const stationRenderStats = {};
  const allFrameTimesMs = [];
  let drops16 = 0;
  let drops33 = 0;
  const initialDrawCalls = telemetry.drawCalls;

  for (const station of stations) {
    vm.runInContext(`
      globalThis.game.state.tactical.activeStation = '${station}';
    `, context);

    const stationTimes = [];

    for (let f = 0; f < framesPerStation; f++) {
      const t0 = process.hrtime.bigint();
      vm.runInContext(`
        globalThis.canvasView.render(globalThis.game.state, { device: 'desktop', shell: 'desk' });
      `, context);
      const t1 = process.hrtime.bigint();
      const frameMs = Number(t1 - t0) / 1e6;

      stationTimes.push(frameMs);
      allFrameTimesMs.push(frameMs);
      if (frameMs > 16.67) drops16++;
      if (frameMs > 33.33) drops33++;
    }

    stationRenderStats[station] = computeStats(stationTimes);
  }

  const renderStats = computeStats(allFrameTimesMs);
  const totalDrawCalls = telemetry.drawCalls - initialDrawCalls;
  const meanDrawCallsPerFrame = Math.round(totalDrawCalls / Math.max(1, allFrameTimesMs.length));
  const effectiveFps = renderStats.mean > 0 ? +(1000 / renderStats.mean).toFixed(1) : 999;

  // ─────────────────────────────────────────────────────────────
  // 5. MEMORY & ALLOCATION TELEMETRY
  // ─────────────────────────────────────────────────────────────
  const finalMemory = process.memoryUsage();
  const heapInitialMB = +(initialMemory.heapUsed / (1024 * 1024)).toFixed(2);
  const heapFinalMB = +(finalMemory.heapUsed / (1024 * 1024)).toFixed(2);
  const heapDeltaMB = +(Math.max(0, heapFinalMB - heapInitialMB)).toFixed(2);
  const allocPerTickKB = +((heapDeltaMB * 1024) / Math.max(1, simTicks)).toFixed(2);

  // ─────────────────────────────────────────────────────────────
  // 6. SCORES & SLA VERIFICATION
  // ─────────────────────────────────────────────────────────────
  const scores = computeBenchmarkScores({
    render: { stats: renderStats },
    simulation: { stats: simStats },
    audio: { stats: audioStats }
  });

  // Pass budget criteria:
  // Render: mean <= 16.6ms (60 FPS SLA)
  // Simulation: mean tick <= 10000 us (10 ms, >= 10x real-time 10 Hz physics step)
  // Audio: mean dispatch <= 1000 us (1 ms)
  // Memory delta: <= 40 MB
  const passesBudgets = (
    renderStats.mean <= 16.67 &&
    simStats.mean <= 10000 &&
    audioStats.mean <= 1000 &&
    heapDeltaMB <= 40
  );

  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (_) {}

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    gitCommit,
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0]?.model || 'Generic CPU',
      cpuCores: os.cpus().length,
      totalMemoryGB: +(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)
    },
    scores,
    render: {
      fps: effectiveFps,
      stats: renderStats,
      drops16,
      drops33,
      totalDrawCalls,
      meanDrawCallsPerFrame,
      stations: stationRenderStats
    },
    simulation: {
      ticksExecuted: simTicks,
      ticksPerSecond,
      stats: simStats
    },
    audio: {
      dispatches: audioDispatches,
      stats: audioStats,
      peakVoices,
      voiceSteals: 0,
      totalAudioCalls: telemetry.audioCalls
    },
    memory: {
      heapInitialMB,
      heapFinalMB,
      heapDeltaMB,
      allocPerTickKB
    },
    passesBudgets
  };
}

export function formatComparison(current, baseline) {
  if (!baseline) return null;
  const pct = (cur, base) => {
    if (!base) return '0.0%';
    const d = ((cur - base) / base) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
  };

  return {
    scoreDiff: current.scores.composite - baseline.scores.composite,
    scorePct: pct(current.scores.composite, baseline.scores.composite),
    renderFpsDiff: +(current.render.fps - baseline.render.fps).toFixed(1),
    renderFpsPct: pct(current.render.fps, baseline.render.fps),
    renderMeanMsDiff: +(current.render.stats.mean - baseline.render.stats.mean).toFixed(2),
    renderMeanMsPct: pct(current.render.stats.mean, baseline.render.stats.mean),
    simMeanUsDiff: +(current.simulation.stats.mean - baseline.simulation.stats.mean).toFixed(1),
    simMeanUsPct: pct(current.simulation.stats.mean, baseline.simulation.stats.mean),
    simTpsDiff: current.simulation.ticksPerSecond - baseline.simulation.ticksPerSecond,
    simTpsPct: pct(current.simulation.ticksPerSecond, baseline.simulation.ticksPerSecond),
    audioMeanUsDiff: +(current.audio.stats.mean - baseline.audio.stats.mean).toFixed(1),
    audioMeanUsPct: pct(current.audio.stats.mean, baseline.audio.stats.mean)
  };
}

// ─────────────────────────────────────────────────────────────
// CLI ENTRY POINT
// ─────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  const args = process.argv.slice(2);
  const isQuiet = args.includes('--quiet');
  const saveBaseline = args.includes('--save-baseline');
  const baselinePath = args.find(a => a.startsWith('--compare='))?.split('=')[1] || path.join('.', 'tests', 'benchmark-baseline.json');
  const outputPath = args.find(a => a.startsWith('--output='))?.split('=')[1] || null;

  if (!isQuiet) {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  PERISCOPE PATROL — STANDARDIZED INTERNAL PERFORMANCE BENCHMARK');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`OS: ${process.platform} (${process.arch}) | Node: ${process.version} | CPU: ${os.cpus()[0]?.model}`);
  }

  const result = await runBenchmark({ root: '.' });

  let baseline = null;
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    } catch (_) {}
  }

  const comparison = baseline ? formatComparison(result, baseline) : null;

  if (saveBaseline) {
    await writeFile(baselinePath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[BENCHMARK] Baseline saved to: ${baselinePath}`);
  }

  if (outputPath) {
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  if (isQuiet) {
    const compStr = comparison ? ` | Score Δ: ${comparison.scorePct} (${comparison.scoreDiff >= 0 ? '+' : ''}${comparison.scoreDiff})` : '';
    console.log(`[BENCHMARK] FPS: ${result.render.fps} (p95: ${result.render.stats.p95}ms) | Sim: ${result.simulation.stats.mean}µs/tick (${result.simulation.ticksPerSecond} TPS) | Audio: ${result.audio.stats.mean}µs | Score: ${result.scores.composite}${compStr} | SLA: ${result.passesBudgets ? 'PASS' : 'FAIL'}`);
  } else {
    console.log('\n─── [1] 3D & 2.5D RENDER PERFORMANCE ───────────────────────────');
    console.log(`  Framerate:          ${result.render.fps} FPS (equivalent mean: ${result.render.stats.mean} ms)`);
    console.log(`  Latency (ms):       p50: ${result.render.stats.p50} | p95: ${result.render.stats.p95} | p99: ${result.render.stats.p99} | max: ${result.render.stats.max}`);
    console.log(`  Frame drops:        >16.6ms: ${result.render.drops16} | >33.3ms: ${result.render.drops33}`);
    console.log(`  Draw calls / frame: ${result.render.meanDrawCallsPerFrame} calls (total: ${result.render.totalDrawCalls})`);
    console.log('  Station breakdown:');
    for (const [st, stats] of Object.entries(result.render.stations)) {
      console.log(`    - ${st.padEnd(12)}: mean ${stats.mean.toFixed(2)} ms | p95 ${stats.p95.toFixed(2)} ms`);
    }

    console.log('\n─── [2] SIMULATION CPU CYCLES ─────────────────────────────────');
    console.log(`  Throughput:         ${result.simulation.ticksPerSecond.toLocaleString()} ticks / sec`);
    console.log(`  Duration / tick:    mean: ${result.simulation.stats.mean} µs | p50: ${result.simulation.stats.p50} µs | p95: ${result.simulation.stats.p95} µs | max: ${result.simulation.stats.max} µs`);

    console.log('\n─── [3] HYBRID AUDIO LOAD ──────────────────────────────────────');
    console.log(`  Dispatch latency:   mean: ${result.audio.stats.mean} µs | p95: ${result.audio.stats.p95} µs`);
    console.log(`  Active voices:      ${result.audio.peakVoices} slots | Total audio calls: ${result.audio.totalAudioCalls}`);

    console.log('\n─── [4] MEMORY & GC PRESSURE ──────────────────────────────────');
    console.log(`  Heap used:          ${result.memory.heapInitialMB} MB -> ${result.memory.heapFinalMB} MB (Δ ${result.memory.heapDeltaMB} MB)`);
    console.log(`  Alloc rate:         ${result.memory.allocPerTickKB} KB / sim tick`);

    console.log('\n─── [5] STANDARDIZED BENCHMARK SCORES ──────────────────────────');
    console.log(`  Render Score:       ${result.scores.render} pts`);
    console.log(`  Simulation Score:   ${result.scores.simulation} pts`);
    console.log(`  Audio Score:        ${result.scores.audio} pts`);
    console.log(`  ──────────────────────────────────────`);
    console.log(`  COMPOSITE SCORE:    ${result.scores.composite} pts`);

    if (comparison) {
      console.log('\n─── [6] COMPARISON VS BASELINE (git commit: ' + (baseline.gitCommit || 'ref') + ') ───────');
      console.log(`  Composite Score:    ${comparison.scoreDiff >= 0 ? '+' : ''}${comparison.scoreDiff} (${comparison.scorePct})`);
      console.log(`  Render FPS:         ${comparison.renderFpsDiff >= 0 ? '+' : ''}${comparison.renderFpsDiff} (${comparison.renderFpsPct})`);
      console.log(`  Sim Tick:           ${comparison.simMeanUsDiff >= 0 ? '+' : ''}${comparison.simMeanUsDiff} µs (${comparison.simMeanUsPct})`);
      console.log(`  Sim Throughput:     ${comparison.simTpsDiff >= 0 ? '+' : ''}${comparison.simTpsDiff} TPS (${comparison.simTpsPct})`);
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`  SLA STATUS: ${result.passesBudgets ? 'PASSED (Within all budgets)' : 'FAILED (Budget exceeded)'}`);
    console.log('════════════════════════════════════════════════════════════════\n');
  }

  process.exit(result.passesBudgets ? 0 : 1);
}
