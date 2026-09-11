// ═══════════════════════════════════════════════════
// ENDURANCE & MEMORY LEAK SCENARIO (Fase 1.3)
// ═══════════════════════════════════════════════════
import { ScenarioRunner } from '../scenario-runner.mjs';

const DEFAULT_PATROL_AREAS = [
  'Solomon Sea',
  'Luzon Strait',
  'Java Sea',
  'Bismarck Sea',
  'Yellow Sea'
];

/**
 * Creates an endurance scenario executing multiple consecutive combat patrols
 * in a single browser session, measuring JS heap, DOM nodes, and event listeners.
 *
 * @param {object} profile Device profile
 * @param {object} [options] Configuration options
 * @param {number} [options.iterations=3] Number of full patrol cycles
 * @param {string[]} [options.areas] Sequence of patrol areas
 */
export function createEnduranceScenario(profile, options = {}) {
  const iterations = Math.max(2, options.iterations || 3);
  const areas = options.areas || DEFAULT_PATROL_AREAS;
  const runner = new ScenarioRunner({
    name: `Endurance Patrol Lifecycle (${iterations} Iterations)`,
    profile
  });

  const memoryLog = [];

  for (let k = 1; k <= iterations; k++) {
    const patrolNum = k;
    const isFinalPatrol = k === iterations;
    const nextArea = areas[(k - 1) % areas.length];

    // ──────────────────────────────────────────────────
    // STEP 1: Patrol Briefing & Conn Readiness
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 1: Briefing & Conn Readiness`, async (ctx) => {
      // 1. Check and dismiss briefing modal
      await ctx.assertModalOpen('#briefingOverlay', `Briefing overlay must open at start of patrol ${patrolNum}`);
      await ctx.tap('#briefingDismiss');
      await ctx.assertModalClosed('#briefingOverlay', `Briefing overlay must close cleanly on patrol ${patrolNum}`);

      // 2. Sample baseline memory after briefing
      const mem = await ctx.getMemoryMetrics();
      if (mem) {
        memoryLog.push({ patrol: patrolNum, phase: 'conn_ready', ...mem });
      }
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      ctx.assertEqual(snap.depthFeet, 0, `Patrol ${patrolNum} must start on surface (depth 0 ft)`);
      ctx.assertEqual(snap.engineMode, 'DIESEL', `Patrol ${patrolNum} propulsion must be DIESEL on surface`);
      ctx.assertEqual(snap.damage.hullIntegrity, 100, `Patrol ${patrolNum} hull integrity must start at 100%`);
    });

    // ──────────────────────────────────────────────────
    // STEP 2: Combat Engagement & Torpedo Attack
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 2: Target Acquisition & Torpedo Attack`, async (ctx) => {
      // 1. Establish deterministic target geometry: place merchant contact M-01 0.35 NM ahead
      if (ctx.page) {
        await ctx.page.evaluate(() => {
          const game = globalThis.game;
          const sub = game.state.playerSub;
          sub.heading = 0;
          sub.orderedHeading = 0;
          sub.depthFeet = 55; // Periscope depth
          sub.orderedDepthFeet = 55;

          let target = game.state.world.contacts.find(c => c.id === 'M-01');
          if (!target) {
            target = {
              id: 'M-01',
              name: 'Merchant Maru',
              type: 'MERCHANT',
              side: 'ENEMY',
              position: { xNm: sub.position.xNm, yNm: sub.position.yNm - 0.35 },
              heading: 90,
              speedKnots: 0,
              flotation: 1.0,
              sunk: false,
              tonsFactor: 4200
            };
            game.state.world.contacts.push(target);
          } else {
            target.position = { xNm: sub.position.xNm, yNm: sub.position.yNm - 0.35 };
            target.heading = 90;
            target.speedKnots = 0;
            target.flotation = 1.0;
            target.sunk = false;
          }

          game.state.world.contactTracks = game.state.world.contactTracks || {};
          game.state.world.contactTracks['M-01'] = {
            id: 'M-01',
            confidence: 1.0,
            bearing: 0,
            rangeEstimateNm: 0.35,
            courseEstimate: 90,
            speedEstimateKnots: 0,
            lastSensorSource: 'VISUAL'
          };

          game.state.runtime.collisionPrev = game.state.runtime.collisionPrev || {};
          game.state.runtime.collisionPrev['M-01'] = { position: { ...target.position }, heading: target.heading };

          // Configure deterministic TDC tracking
          game.state.tdc.dudMode = 'none';
          game.state.tdc.targetId = 'M-01';
          game.state.tdc.autoTrack = true;
          game.state.tdc.trackSource = 'SCOPE';
          game.engine.updateTdc?.(true);
        });
      }

      // 2. Flood forward tubes
      await ctx.dispatch({ type: 'FLOOD_ALL_TUBES' });
      const snapTubes = await ctx.getSnapshot();
      const fwdReady = snapTubes.tubes.some(t => t.pos === 'FWD' && t.status === 'READY');
      ctx.assert(fwdReady, 'Forward tubes must be flooded and ready to fire');

      // 3. Fire torpedo from tube 1
      await ctx.dispatch({ type: 'FIRE_TORPEDO', tubeId: 1 });

      // 4. Advance simulation to let the torpedo run 0.35 NM at 46 knots (~27 sec)
      await ctx.advanceTime(32, 1);
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      const aarTorps = snap.campaign.afterAction?.torpedoes || [];
      const hasHit = aarTorps.some(t => t.status === 'HIT');
      ctx.assert(hasHit, `Patrol ${patrolNum}: Torpedo must strike target`);
    });

    // ──────────────────────────────────────────────────
    // STEP 3: Counter-Attack Damage & Bilge Control
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 3: Depth Charge Damage & Bilge Control`, async (ctx) => {
      if (ctx.page) {
        await ctx.page.evaluate(() => {
          const game = globalThis.game;
          const sub = game.state.playerSub;
          game.engine.sys?.damage?.ensureDamageState?.();
          sub.damage.hullIntegrity = 84;
          sub.damage.flooding = 0.22;
          sub.damage.pumpTripped = true;
          sub.damage.compartments = sub.damage.compartments || {};
          sub.damage.compartments['fwdBattery'] = { flooding: 0.22, repairProgress: 0 };
        });
      }

      await ctx.dispatch({ type: 'SET_REPAIR_PRIORITY', priority: 'FLOODING' });
      await ctx.dispatch({ type: 'TOGGLE_PUMPS' });
      await ctx.advanceTime(6, 1);
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      ctx.assert(snap.damage.hullIntegrity <= 90, `Patrol ${patrolNum}: Submarine must register hull damage`);
      ctx.assertEqual(snap.damage.repairPriority, 'FLOODING', `Patrol ${patrolNum}: Repair priority must be FLOODING`);
    });

    // ──────────────────────────────────────────────────
    // STEP 4: Deep Evasion & Silent Running
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 4: Deep Evasion & Silent Running`, async (ctx) => {
      await ctx.dispatch({ type: 'SET_ORDERED_DEPTH', depthFeet: 180 });
      await ctx.dispatch({ type: 'TOGGLE_SILENT_RUNNING' });
      await ctx.dispatch({ type: 'SET_ENGINE_RPM', rpm: 70 });
      await ctx.dispatch({ type: 'SET_ORDERED_HEADING', heading: 240 });
      await ctx.advanceTime(20, 1);
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      ctx.assert(snap.depthFeet > 65, `Patrol ${patrolNum}: Submarine must dive deep towards 180 ft`);
      ctx.assertEqual(snap.ballastState, 'FLOODING', `Patrol ${patrolNum}: Ballast must be FLOODING`);
      ctx.assert(snap.stealth.silentRunning, `Patrol ${patrolNum}: Silent running must be engaged`);
      ctx.assertEqual(snap.orderedRpm, 70, `Patrol ${patrolNum}: RPM must be 70`);
    });

    // ──────────────────────────────────────────────────
    // STEP 5: Surface Return & Diesel Re-ignition
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 5: Surface Return & Diesel Recharging`, async (ctx) => {
      await ctx.dispatch({ type: 'SET_ORDERED_DEPTH', depthFeet: 0 });
      await ctx.dispatch({ type: 'TOGGLE_SILENT_RUNNING' });
      await ctx.dispatch({ type: 'SET_ENGINE_RPM', rpm: 260 });
      await ctx.dispatch({ type: 'SET_ORDERED_HEADING', heading: 90 });
      await ctx.advanceTime(105, 1);
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      ctx.assert(snap.depthFeet <= 8, `Patrol ${patrolNum}: Submarine must reach surface depth`);
      ctx.assertEqual(snap.engineMode, 'DIESEL', `Patrol ${patrolNum}: Propulsion must switch to DIESEL`);
      ctx.assert(!snap.stealth.silentRunning, `Patrol ${patrolNum}: Silent running must be disengaged`);
    });

    // ──────────────────────────────────────────────────
    // STEP 6: Mission Completion & After Action Report
    // ──────────────────────────────────────────────────
    runner.addStep(`[Patrol ${patrolNum}] Step 6: Mission Completion & AAR Debrief`, async (ctx) => {
      if (ctx.page) {
        await ctx.page.evaluate(() => {
          const game = globalThis.game;
          game.engine.completeMission?.('Pearl Harbor');
          if (typeof globalThis.processPresentationEffects === 'function') {
            globalThis.processPresentationEffects();
          }
        });
      }

      await ctx.assertModalOpen('#aarOverlay', `Patrol ${patrolNum}: AAR overlay must open`);
      await ctx.assertVisible('#aarStats', `Patrol ${patrolNum}: AAR stats must be visible`);
      await ctx.tap('#aarClose');
      await ctx.assertModalClosed('#aarOverlay', `Patrol ${patrolNum}: AAR overlay must close cleanly`);
    }, async (ctx) => {
      const snap = await ctx.getSnapshot();
      ctx.assertEqual(snap.campaign.missionStatus, 'COMPLETED', `Patrol ${patrolNum}: Mission status must be COMPLETED`);

      const mem = await ctx.getMemoryMetrics();
      if (mem) {
        memoryLog.push({ patrol: patrolNum, phase: 'post_aar', ...mem });
      }
    });

    // ──────────────────────────────────────────────────
    // INTER-PATROL TRANSITION (Except after last patrol)
    // ──────────────────────────────────────────────────
    if (!isFinalPatrol) {
      runner.addStep(`[Patrol ${patrolNum} -> ${patrolNum + 1}] Transition: Commission Next Patrol`, async (ctx) => {
        // Commission next patrol
        await ctx.startNewPatrol(nextArea);

        // Advance a few frames to let simulation settle
        await ctx.advanceTime(2, 1);
      }, async (ctx) => {
        const snap = await ctx.getSnapshot();
        ctx.assertEqual(snap.campaign.missionStatus, 'PATROL', `Patrol ${patrolNum + 1} status must reset to PATROL`);
        ctx.assertEqual(snap.campaign.patrolArea, nextArea, `Patrol ${patrolNum + 1} area must be ${nextArea}`);
        ctx.assertEqual(snap.weapons.activeTorpedoesCount, 0, `No active torpedoes may leak across patrol boundaries`);
        ctx.assert((snap.campaign.afterAction?.torpedoes || []).length === 0, `After-action torpedo records must reset for patrol ${patrolNum + 1}`);
        const freshContact = snap.contacts.find(c => c.id === 'M-01');
        if (freshContact) {
          ctx.assert(freshContact.flotation === 1.0, `Newly commissioned convoy contacts must start at full flotation`);
        }

        // Memory stability checks: Heap must remain bounded under 40 MB
        const mem = await ctx.getMemoryMetrics();
        if (mem) {
          ctx.assert(mem.heapUsedMB <= 40, `JS Heap (${mem.heapUsedMB} MB) must remain bounded below 40 MB`);
          if (mem.eventListeners != null) {
            ctx.assert(mem.eventListeners <= 650, `Event listeners (${mem.eventListeners}) must not accumulate uncontrollably`);
          }
        }
      });
    }
  }

  runner.memoryLog = memoryLog;
  return runner;
}
