// ═══════════════════════════════════════════════════ BROWSER BENCHMARK SCENARIO
// Runs standardized in-browser performance benchmarks with real hardware Canvas2D,
// requestAnimationFrame, WebAudio graphs, and CDP heap telemetry.

import { ScenarioRunner } from '../scenario-runner.mjs';
import { DEVICE_PROFILES } from '../device-profiles.mjs';

export function createBenchmarkScenario(profile = DEVICE_PROFILES.DESKTOP_STANDARD, options = {}) {
  const runner = new ScenarioRunner({
    name: `Internal Browser Benchmark (${profile.name})`,
    profile
  });

  const simTicks = options.simTicks || 150;
  const framesPerStation = options.framesPerStation || 25;
  const stations = options.stations || ['PERISCOPE', 'BRIDGE', 'MAP', 'SOUND', 'DECK_GUN', 'TACTICAL'];

  // ──────────────────────────────────────────────────
  // STEP 1: Initialize Operational Combat Theater
  // ──────────────────────────────────────────────────
  runner.addStep('Initialize Operational Combat Theater', async (ctx) => {
    // Dismiss briefing if opened
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const modal = document.getElementById('briefingOverlay');
        if (modal) modal.style.display = 'none';
        const dismiss = document.getElementById('briefingDismiss');
        if (dismiss) dismiss.click();

        const game = globalThis.game;
        if (!game) return;
        game.dispatch({
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
        game.engine.processCommands();

        const s = game.state;
        s.playerSub.mode = 'PERISCOPE';
        s.playerSub.depthFeet = 55;
        s.playerSub.heading = 90;
        s.playerSub.propulsion.orderedRpm = 120;
        s.playerSub.propulsion.actualRpm = 120;
        s.world.environment.seaState = 3;
        s.world.environment.daylight = 0.85;

        // Ready and fire a torpedo
        const tube = s.weapons.tubes[0];
        if (tube) {
          tube.status = 'READY';
          tube.flooded = true;
          game.dispatch({ type: 'FIRE_TORPEDO', tubeId: tube.id });
          game.engine.processCommands();
        }
      });
    }
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(!!snap, 'Game state must exist');
    ctx.assert(snap.contactsCount >= 4, 'Combat theater must contain convoy contacts');
  });

  // ──────────────────────────────────────────────────
  // STEP 2: In-Browser Physics & Simulation CPU Benchmark
  // ──────────────────────────────────────────────────
  runner.addStep('Simulation CPU Benchmark', async (ctx) => {
    if (ctx.page) {
      const simResults = await ctx.page.evaluate(({ count }) => {
        const game = globalThis.game;
        const tickTimesUs = [];
        const startNs = performance.now();

        for (let i = 0; i < count; i++) {
          const t0 = performance.now();
          game.update(0.10);
          const t1 = performance.now();
          tickTimesUs.push((t1 - t0) * 1000); // us
        }

        const totalMs = performance.now() - startNs;
        tickTimesUs.sort((a, b) => a - b);
        const sum = tickTimesUs.reduce((a, b) => a + b, 0);
        const mean = sum / tickTimesUs.length;
        const p50 = tickTimesUs[Math.floor(tickTimesUs.length * 0.50)];
        const p95 = tickTimesUs[Math.floor(tickTimesUs.length * 0.95)];

        return {
          count,
          totalMs,
          meanUs: +(mean).toFixed(1),
          p50Us: +(p50).toFixed(1),
          p95Us: +(p95).toFixed(1),
          tps: Math.round(count / (totalMs / 1000))
        };
      }, { count: simTicks });

      ctx.simResults = simResults;
      ctx.assert(simResults.meanUs < 15000, `Simulation mean tick ${simResults.meanUs}us must be <= 15000us`);
    }
  });

  // ──────────────────────────────────────────────────
  // STEP 3: Multi-Station Hardware Render Benchmark
  // ──────────────────────────────────────────────────
  runner.addStep('Multi-Station Hardware Render Benchmark', async (ctx) => {
    if (ctx.page) {
      const renderResults = await ctx.page.evaluate(async ({ stationList, framesPer }) => {
        const game = globalThis.game;
        const canvasView = globalThis.canvasView || (typeof CanvasView !== 'undefined' ? new CanvasView(document.getElementById('mainCanvas')) : null);
        if (!canvasView) throw new Error('CanvasView is not available');
        const layout = globalThis.LayoutService?.get?.() || 'desk';
        const allFrameTimes = [];
        const stationMetrics = {};
        let drops16 = 0;
        let drops33 = 0;

        for (const station of stationList) {
          game.state.tactical.activeStation = station;
          const times = [];

          for (let f = 0; f < framesPer; f++) {
            const t0 = performance.now();
            canvasView.render(game.state, layout);
            const t1 = performance.now();
            const frameMs = t1 - t0;
            times.push(frameMs);
            allFrameTimes.push(frameMs);
            if (frameMs > 16.67) drops16++;
            if (frameMs > 33.33) drops33++;

            // Yield to browser frame loop every 5 frames
            if (f % 5 === 0) {
              await new Promise(r => requestAnimationFrame(r));
            }
          }

          times.sort((a, b) => a - b);
          const mean = times.reduce((a, b) => a + b, 0) / times.length;
          stationMetrics[station] = {
            meanMs: +(mean).toFixed(2),
            p95Ms: +(times[Math.floor(times.length * 0.95)]).toFixed(2)
          };
        }

        allFrameTimes.sort((a, b) => a - b);
        const mean = allFrameTimes.reduce((a, b) => a + b, 0) / allFrameTimes.length;
        const p50 = allFrameTimes[Math.floor(allFrameTimes.length * 0.50)];
        const p95 = allFrameTimes[Math.floor(allFrameTimes.length * 0.95)];
        const fps = mean > 0 ? +(1000 / mean).toFixed(1) : 999;

        return {
          totalFrames: allFrameTimes.length,
          meanMs: +(mean).toFixed(2),
          p50Ms: +(p50).toFixed(2),
          p95Ms: +(p95).toFixed(2),
          fps,
          drops16,
          drops33,
          stations: stationMetrics
        };
      }, { stationList: stations, framesPer: framesPerStation });

      ctx.renderResults = renderResults;
      ctx.assert(renderResults.meanMs <= 20.0, `Render mean ${renderResults.meanMs}ms must be <= 20ms`);
    }
  });

  // ──────────────────────────────────────────────────
  // STEP 4: Audio Engine Voice & Dispatch Telemetry
  // ──────────────────────────────────────────────────
  runner.addStep('Audio Engine Telemetry', async (ctx) => {
    if (ctx.page) {
      const audioResults = await ctx.page.evaluate(() => {
        const a = globalThis.audio;
        if (!a) return null;
        const voices = a.hybridVoices?.length || 0;
        const state = a.ctx?.state || 'suspended';

        // Trigger safe sounds
        if (typeof a.playWaypoint === 'function') a.playWaypoint();
        if (typeof a.playCreak === 'function') a.playCreak();

        return {
          state,
          activeVoices: voices,
          audioDirectorAttached: !!globalThis.audioDirector
        };
      });

      ctx.audioResults = audioResults;
      ctx.assert(!!audioResults, 'Audio engine must report valid state');
    }
  });

  // ──────────────────────────────────────────────────
  // STEP 5: Memory Leak & CDP Node Verification
  // ──────────────────────────────────────────────────
  runner.addStep('Memory & Node Leak Verification', async (ctx) => {
    const mem = await ctx.getMemoryMetrics();
    if (mem) {
      ctx.assert(mem.heapUsedMB < 150, `Heap memory ${mem.heapUsedMB} MB must remain under 150 MB ceiling`);
      ctx.assert(mem.domElements < 3500, `DOM elements (${mem.domElements}) must remain bounded under 3500`);
    }
  });

  return runner;
}
