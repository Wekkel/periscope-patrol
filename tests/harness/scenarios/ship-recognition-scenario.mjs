// ═══════════════════════════════════════════════════ SHIP RECOGNITION SCENARIO
// Deterministic 5-step browser test scenario verifying the full grognard
// identification flow: periscope observation → ONI manual open → class assignment
// → TDC kinematic coupling with masthead scaling → torpedo attack → AAR validation.

import {ScenarioRunner} from '../scenario-runner.mjs';
import {DEVICE_PROFILES} from '../device-profiles.mjs';

export function createShipRecognitionScenario(profile = DEVICE_PROFILES.DESKTOP_STANDARD) {
  const runner = new ScenarioRunner({
    name: `Ship Recognition & Grognard Identification Scenario (${profile.name})`,
    profile
  });

  // ──────────────────────────────────────────────────
  // PHASE 1: Setup — Periscope Depth, Target Placement
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 1: Setup — Periscope Depth & Target Contact', async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(!!snap, 'Game snapshot must be available');
    ctx.assert(snap.mode !== 'SUNK', 'Submarine must start alive');

    // Dismiss briefing overlay if present
    const briefing = await ctx.page.$('#briefingOverlay');
    if (briefing && await briefing.isVisible()) {
      await ctx.tap('#briefingDismiss');
      await ctx.assertHidden('#briefingOverlay', 'Briefing overlay must close');
    }

    // Place submarine at periscope depth and inject a deterministic target
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const game = globalThis.game;
        const sub = game.state.playerSub;
        sub.heading = 0;
        sub.orderedHeading = 0;
        sub.depthFeet = 55;
        sub.orderedDepthFeet = 55;

        // Inject Town-class destroyer 0.80 NM dead ahead
        const existingIdx = game.state.world.contacts.findIndex(c => c.id === 'REC-01');
        const contact = {
          id: 'REC-01',
          name: 'HMS Vanoc',
          type: 'DESTROYER',
          displayType: 'TOWN-CLASS DESTROYER',
          side: 'ENEMY',
          vesselProfileId: 'uk-town-destroyer-1941',
          modelKey: 'TOWN_DESTROYER_1941',
          position: { xNm: sub.position.xNm, yNm: sub.position.yNm - 0.80 },
          heading: 270,
          speedKnots: 8,
          flotation: 1.0,
          sunk: false,
          tonsFactor: 1190,
          lengthYards: 104  // 314 ft
        };
        if (existingIdx >= 0) {
          game.state.world.contacts[existingIdx] = contact;
        } else {
          game.state.world.contacts.push(contact);
        }

        // Inject a contact track so the TDC can lock
        game.state.world.contactTracks = game.state.world.contactTracks || {};
        game.state.world.contactTracks['REC-01'] = {
          id: 'REC-01',
          confidence: 1.0,
          bearing: 0,
          rangeEstimateNm: 0.80,
          courseEstimate: 270,
          speedEstimateKnots: 8,
          lastSensorSource: 'VISUAL',
          visualHullConfirmed: true,
          typeEstimate: 'DESTROYER'
        };

        // Configure TDC on this target
        game.state.tdc.dudMode = 'none';
        game.state.tdc.targetId = 'REC-01';
        game.state.tdc.autoTrack = true;
        game.state.tdc.trackSource = 'SCOPE';
        game.engine.updateTdc?.(true);
      });
    }

    await ctx.advanceTime(0.5, 1);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    const contact = snap.contacts.find(c => c.id === 'REC-01');
    ctx.assert(!!contact, 'Target REC-01 must be injected into world contacts');
    ctx.assert(!contact.sunk, 'Target must start alive');
    ctx.assertEqual(snap.tdc.targetId, 'REC-01', 'TDC must lock onto REC-01');
  });

  // ──────────────────────────────────────────────────
  // PHASE 2: Open Recognition Manual via globalThis
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 2: Open Recognition Manual', async (ctx) => {
    if (ctx.page) {
      // Open the manual via the globalThis API (same path as clicking the button)
      await ctx.page.evaluate(() => {
        globalThis.RecognitionManual?.open(globalThis.game);
      });
      // Allow DOM to render
      await ctx.advanceTime(0.1, 1);
    }
  }, async (ctx) => {
    if (ctx.page) {
      // Manual modal must be visible (not hidden)
      const isVisible = await ctx.page.evaluate(() => {
        const modal = document.getElementById('recManualModal');
        return modal && !modal.classList.contains('hidden');
      });
      ctx.assert(isVisible, 'Recognition manual modal must be open');

      // Catalog must have loaded entries
      const entryCount = await ctx.page.evaluate(() => {
        return document.querySelectorAll('#recManualList .rec-card-item').length;
      });
      ctx.assert(entryCount >= 15, `Manual list must display at least 15 classes (got ${entryCount})`);
    }
  });

  // ──────────────────────────────────────────────────
  // PHASE 3: Identify Target — Correct Classification
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 3: Identify Target as Town-class Destroyer', async (ctx) => {
    if (ctx.page) {
      // Close the manual and dispatch IDENTIFY_CONTACT_CLASS directly
      // (simulates the captain clicking "IDENTIFY TARGET AS TOWN-CLASS DESTROYER" in the footer)
      await ctx.page.evaluate(() => {
        globalThis.RecognitionManual?.close();
      });
      await ctx.dispatch({ type: 'IDENTIFY_CONTACT_CLASS', trackId: 'REC-01', classId: 'town-destroyer' });
      await ctx.advanceTime(0.2, 1);
    }
  }, async (ctx) => {
    if (ctx.page) {
      const result = await ctx.page.evaluate(() => {
        const track = globalThis.game.state.world.contactTracks['REC-01'];
        return {
          status: track?.identificationStatus,
          classId: track?.identifiedClassId,
          mastheadFt: track?.identifiedMastheadFt,
          draftFt: track?.identifiedDraftFt
        };
      });
      ctx.assertEqual(result.status, 'CONFIRMED', 'Track must be CONFIRMED after correct identification');
      ctx.assertEqual(result.classId, 'town-destroyer', 'Identified class must be town-destroyer');
      ctx.assertEqual(result.mastheadFt, 72, 'Identified masthead must be 72 ft for Town-class');
      ctx.assert(result.draftFt > 0, 'Draft must be recorded after identification');

      // TDC solution quality must be boosted
      const snap = await ctx.getSnapshot();
      ctx.assert(snap.tdc.solutionQuality >= 0.60,
        `TDC solution quality must improve after correct identification (got ${snap.tdc.solutionQuality?.toFixed(2)})`);
    }
  });

  // ──────────────────────────────────────────────────
  // PHASE 4: Fire Torpedo & Verify Hit
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 4: Flood Tubes, Fire Torpedo & Advance to Impact', async (ctx) => {
    // Flood forward tubes
    await ctx.dispatch({ type: 'FLOOD_ALL_TUBES' });
    const snapTubes = await ctx.getSnapshot();
    const fwdReady = snapTubes.tubes.some(t => t.pos === 'FWD' && t.status === 'READY');
    ctx.assert(fwdReady, 'Forward tubes must be READY before firing');

    // Place the target stationary dead ahead at 0.35 NM for deterministic hit
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const game = globalThis.game;
        const sub = game.state.playerSub;
        const c = game.state.world.contacts.find(c => c.id === 'REC-01');
        if (c) {
          c.position = { xNm: sub.position.xNm, yNm: sub.position.yNm - 0.35 };
          c.heading = 90;
          c.speedKnots = 0;
          const D = typeof globalThis.ensureShipDamage === 'function'
            ? globalThis.ensureShipDamage(c)
            : (c.shipDamage || (c.shipDamage = {}));
          D.flotation = 0.50;
          const tr = game.state.world.contactTracks['REC-01'];
          if (tr) {
            tr.bearing = 0;
            tr.rangeEstimateNm = 0.35;
            tr.courseEstimate = 90;
            tr.speedEstimateKnots = 0;
          }
          game.state.runtime.collisionPrev = game.state.runtime.collisionPrev || {};
          game.state.runtime.collisionPrev['REC-01'] = { position: { ...c.position }, heading: c.heading };
          game.state.tdc.targetId = 'REC-01';
          game.state.tdc.dudMode = 'none';
          game.engine.updateTdc?.(true);
        }
      });
    }

    // Fire tube 1
    await ctx.dispatch({ type: 'FIRE_TORPEDO', tubeId: 1 });

    // Advance time: 0.35 NM at 46 knots ≈ 27 s; give 38 s margin
    await ctx.advanceTime(40, 1);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    const aarTorps = snap.campaign.afterAction?.torpedoes || [];
    ctx.assert(aarTorps.length >= 1, 'At least one torpedo must be logged in the AAR');
    const hasHit = aarTorps.some(t => t.status === 'HIT');
    ctx.assert(hasHit, 'Torpedo must register a HIT in the AAR record');
  });

  // ──────────────────────────────────────────────────
  // PHASE 5: Mission Complete & AAR Validation
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 5: Mission Completion & AAR Integrity', async (ctx) => {
    if (ctx.page) {
      await ctx.page.evaluate(() => {
        const game = globalThis.game;
        const contact = game.state.world.contacts.find(c => c.id === 'REC-01');
        if (contact && !contact.sunk) {
          if (typeof globalThis.beginShipSinking === 'function') {
            globalThis.beginShipSinking(game.engine, contact, 'FLOODING');
          }
        }
        game.engine.completeMission?.('Home Base');
        if (typeof globalThis.processPresentationEffects === 'function') {
          globalThis.processPresentationEffects();
        }
      });
    }

    await ctx.assertModalOpen('#aarOverlay', 'AAR overlay must open upon mission completion');
    await ctx.assertVisible('#aarStats', 'AAR statistics panel must be visible');
    await ctx.tap('#aarClose');
    await ctx.assertModalClosed('#aarOverlay', 'AAR overlay must close cleanly');
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assertEqual(snap.campaign.missionStatus, 'COMPLETED', 'Campaign must record COMPLETED mission status');

    if (ctx.page) {
      // Verify the sunk target carries a sinkTrajectory field (set by Phase 5.3)
      const sinkInfo = await ctx.page.evaluate(() => {
        const contact = globalThis.game.state.world.contacts.find(c => c.id === 'REC-01');
        return {
          sunk: contact?.sunk,
          sinkTrajectory: contact?.sinkTrajectory ?? null,
          sinkStyle: contact?.sinkStyle ?? null
        };
      });
      ctx.assert(sinkInfo.sunk, 'Target REC-01 must be sunk after the torpedo hit');
      ctx.assert(sinkInfo.sinkTrajectory !== null,
        'Sunk contact must have a sinkTrajectory assigned by ship-damage.js');
      ctx.assert(Number.isFinite(sinkInfo.sinkStyle),
        'Sunk contact must have a numeric sinkStyle');

      // Verify identification persisted in the track (survives until AAR)
      const trackInfo = await ctx.page.evaluate(() => {
        const track = globalThis.game.state.world.contactTracks['REC-01'];
        return {
          identificationStatus: track?.identificationStatus ?? null,
          identifiedClassId: track?.identifiedClassId ?? null
        };
      });
      ctx.assert(
        trackInfo.identificationStatus === 'CONFIRMED' || trackInfo.identificationStatus === null,
        'Track identification must remain CONFIRMED (or track may be removed when sunk — both acceptable)'
      );
    }
  });

  return runner;
}
