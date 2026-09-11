// ═══════════════════════════════════════════════════ FULL MISSION LIFECYCLE SCENARIO
// Deterministic 6-phase test scenario covering:
// Briefing → Attack → Damage → Escape → Return → After Action Report (AAR)

import {ScenarioRunner} from '../scenario-runner.mjs';
import {DEVICE_PROFILES} from '../device-profiles.mjs';

export function createMissionLifecycleScenario(profile = DEVICE_PROFILES.DESKTOP_STANDARD) {
  const runner = new ScenarioRunner({
    name: `Full Mission Lifecycle Scenario (${profile.name})`,
    profile
  });

  // ──────────────────────────────────────────────────
  // PHASE 1: Briefing & Conn Readiness
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 1: Briefing & Conn Readiness', async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(!!snap, 'Game snapshot must be available');
    ctx.assert(snap.mode !== 'SUNK', 'Submarine must start alive');
    await ctx.assertLayout(profile.expectedLayout);

    if (profile.expectedLayout === 'desk') {
      await ctx.assertVisible('#desktopShell', 'Desktop shell must be visible on desktop profile');
      await ctx.assertHidden('#touchShell', 'Touch shell must be hidden on desktop profile');
    } else {
      await ctx.assertVisible('#touchShell', 'Touch shell must be visible on touch profile');
      await ctx.assertHidden('#desktopShell', 'Desktop shell must be hidden on touch profile');
    }

    // Assert briefing overlay is present and then dismiss it
    await ctx.assertVisible('#briefingOverlay', 'Briefing overlay must appear at mission start');
    await ctx.tap('#briefingDismiss');
    await ctx.assertHidden('#briefingOverlay', 'Briefing overlay must close upon acknowledgment');
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(snap.battery >= 90, 'Battery must be near full charge');
    ctx.assert(snap.fuel >= 90, 'Fuel must be near full capacity');
    ctx.assertEqual(snap.damage.hullIntegrity, 100, 'Hull integrity must start at 100%');
  });

  // ──────────────────────────────────────────────────
  // PHASE 2: Target Acquisition, Tube Flooding & Torpedo Attack
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 2: Target Acquisition, Tube Flooding & Torpedo Attack', async (ctx) => {
    // 1. Establish deterministic target geometry: place merchant contact M-01 0.42 NM ahead
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
    const target = snap.contacts.find(c => c.id === 'M-01');
    ctx.assert(!!target, 'Target M-01 must be tracked');
    const aarTorps = snap.campaign.afterAction?.torpedoes || [];
    ctx.assert(aarTorps.length >= 1, 'Torpedo launch must be logged in after-action record');
    const hasHit = aarTorps.some(t => t.status === 'HIT');
    ctx.assert(hasHit, 'Torpedo must strike target (status === HIT in after-action record)');
  });

  // ──────────────────────────────────────────────────
  // PHASE 3: Counter-Attack, Depth Charge Damage & Bilge Control
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 3: Counter-Attack, Depth Charge Damage & Bilge Control', async (ctx) => {
    // 1. Simulate enemy depth-charge attack scoring near miss and compartment flooding
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const game = globalThis.game;
        const sub = game.state.playerSub;
        // Inject realistic shock and flooding casualty
        game.engine.sys?.damage?.ensureDamageState?.();
        sub.damage.hullIntegrity = 82;
        sub.damage.flooding = 0.24;
        sub.damage.pumpTripped = true;
        sub.damage.compartments = sub.damage.compartments || {};
        sub.damage.compartments['fwdBattery'] = { flooding: 0.24, repairProgress: 0 };
        game.engine.aarRecordEvent?.('DEPTH_CHARGE_ATTACK', 'Depth charges detonated close aboard. Hull integrity reduced to 82%. Forward battery taking water.');
      });
    }

    // 2. Dispatch emergency repair and pump orders
    await ctx.dispatch({ type: 'SET_REPAIR_PRIORITY', priority: 'FLOODING' });
    await ctx.dispatch({ type: 'TOGGLE_PUMPS' });

    // 3. Advance time to allow damage control party and bilge pumps to engage
    await ctx.advanceTime(6, 1);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(snap.damage.hullIntegrity <= 90, 'Submarine must exhibit hull battle damage');
    ctx.assertEqual(snap.damage.repairPriority, 'FLOODING', 'Damage control priority must be set to FLOODING');
  });

  // ──────────────────────────────────────────────────
  // PHASE 4: Deep Evasion & Silent Running
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 4: Deep Evasion & Silent Running', async (ctx) => {
    // 1. Order deep evasion dive below thermocline (180 ft), silent running, and creeping RPM
    await ctx.dispatch({ type: 'SET_ORDERED_DEPTH', depthFeet: 180 });
    await ctx.dispatch({ type: 'TOGGLE_SILENT_RUNNING' });
    await ctx.dispatch({ type: 'SET_ENGINE_RPM', rpm: 70 });
    await ctx.dispatch({ type: 'SET_ORDERED_HEADING', heading: 240 });

    // 2. Advance time 20 seconds to establish diving posture and negative buoyancy
    await ctx.advanceTime(20, 1);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(snap.depthFeet > 65, 'Submarine must dive deep towards 180 ft evasion depth (at creeping speed)');
    ctx.assertEqual(snap.ballastState, 'FLOODING', 'Ballast tanks must be actively flooding');
    ctx.assert(snap.stealth.silentRunning, 'Silent running must be engaged');
    ctx.assertEqual(snap.orderedRpm, 70, 'Engines must be set to quiet creeping RPM (70)');
    ctx.assertEqual(snap.orderedHeading, 240, 'Evasion course must be set to 240°');
  });

  // ──────────────────────────────────────────────────
  // PHASE 5: Surface Return & Diesel Recharging
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 5: Surface Return & Diesel Recharging', async (ctx) => {
    // 1. Order surface ascent, disengage silent running, and order diesel speed
    await ctx.dispatch({ type: 'SET_ORDERED_DEPTH', depthFeet: 0 });
    await ctx.dispatch({ type: 'TOGGLE_SILENT_RUNNING' });
    await ctx.dispatch({ type: 'SET_ENGINE_RPM', rpm: 260 });
    await ctx.dispatch({ type: 'SET_ORDERED_HEADING', heading: 90 });

    // 2. Advance simulation time 105 seconds to blow ballast, break surface and ignite diesels
    await ctx.advanceTime(105, 1);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(snap.depthFeet <= 8, 'Submarine must reach surface depth (depth <= 8 ft)');
    ctx.assertEqual(snap.engineMode, 'DIESEL', 'Propulsion must switch to diesel engines upon surfacing');
    ctx.assert(!snap.stealth.silentRunning, 'Silent running must be disengaged for standard surface cruise');
  });

  // ──────────────────────────────────────────────────
  // PHASE 6: Mission Completion & After Action Report (AAR) Validation
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 6: Mission Completion & After Action Report (AAR) Validation', async (ctx) => {
    // 1. Conclude mission and trigger harbor completion
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.engine.completeMission?.('Pearl Harbor');
        if (typeof globalThis.processPresentationEffects === 'function') {
          globalThis.processPresentationEffects();
        }
      });
    }

    // 2. Assert AAR modal is displayed
    await ctx.assertModalOpen('#aarOverlay', 'After Action Report overlay must open upon patrol completion');
    await ctx.assertVisible('#aarStats', 'AAR statistics panel must be visible');

    // 3. Close the AAR modal via user interaction
    await ctx.tap('#aarClose');
    await ctx.assertModalClosed('#aarOverlay', 'AAR overlay must close cleanly upon clicking close');
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assertEqual(snap.campaign.missionStatus, 'COMPLETED', 'Campaign mission status must be COMPLETED');
  });

  return runner;
}
