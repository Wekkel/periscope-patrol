// ═══════════════════════════════════════════════════ NATIONAL STATIONS CROSS-FLEET SCENARIO
// Deterministic 7-phase browser test scenario verifying cockpit themes,
// localized orders, metric/imperial scales, and acoustic fingerprints
// across all 6 playable navies.

import {ScenarioRunner} from '../scenario-runner.mjs';
import {DEVICE_PROFILES} from '../device-profiles.mjs';

export function createNationalStationsScenario(profile = DEVICE_PROFILES.DESKTOP_STANDARD) {
  const runner = new ScenarioRunner({
    name: `National Stations Cross-Fleet Scenario (${profile.name})`,
    profile
  });

  // ──────────────────────────────────────────────────
  // PHASE 1: Initial State & Shell Verification
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 1: Initial State & Briefing Dismissal', async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(!!snap, 'Game snapshot must be available');
    ctx.assert(snap.mode !== 'SUNK', 'Submarine must start alive');
    await ctx.assertLayout(profile.expectedLayout);

    // Dismiss briefing overlay if present
    const briefing = await ctx.page.$('#briefingOverlay');
    if (briefing && await briefing.isVisible()) {
      await ctx.tap('#briefingDismiss');
      await ctx.assertHidden('#briefingOverlay', 'Briefing overlay must close upon acknowledgment');
    }

    if (ctx.page) {
      const theme = await ctx.page.evaluate(() => document.documentElement.dataset.stationTheme);
      ctx.assert(!!theme, 'Document root must have data-station-theme attribute set');
    }
  });

  // ──────────────────────────────────────────────────
  // PHASE 2: Kriegsmarine Type VIIC (Bakelite / German Orders / Metric)
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 2: Kriegsmarine Type VIIC Station & Orders', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'type-viic-1941';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('type-viic-1941');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder0: ui.engineOrders[0],
          engineOrder5: ui.engineOrders[5],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          depthOrderLabel: ui.orders.depth
        };
      });
      ctx.assertEqual(res.theme, 'km-bakelite', 'Kriegsmarine must set km-bakelite station theme');
      ctx.assertEqual(res.depthSuffix, 'm', 'Kriegsmarine must use metric depth suffix');
      ctx.assertEqual(res.engineOrder0, 'STOP', 'Kriegsmarine order 0 must be STOP');
      ctx.assertEqual(res.engineOrder5, 'ÄUSSERSTE', 'Kriegsmarine order 5 must be ÄUSSERSTE');
      ctx.assertEqual(res.telegraphTone, 'GONG', 'Kriegsmarine audio tone must be GONG');
      ctx.assertEqual(res.depthOrderLabel, 'Tiefe', 'Depth order label must be Tiefe');
    }
    await ctx.advanceTime(0.5);
  });

  // ──────────────────────────────────────────────────
  // PHASE 3: Imperial Japanese Navy I-15 (Urushi Lacquer / Rōmaji / Metric)
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 3: IJN I-15 Class Station & Orders', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'ijn-i-class-1942';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('ijn-i-class-1942');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder0: ui.engineOrders[0],
          engineOrder4: ui.engineOrders[4],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          courseLabel: ui.gauges.course
        };
      });
      ctx.assertEqual(res.theme, 'ijn-fleet', 'IJN must set ijn-fleet station theme');
      ctx.assertEqual(res.depthSuffix, 'm', 'IJN must use metric depth suffix');
      ctx.assertEqual(res.engineOrder0, 'TEISHI', 'IJN order 0 must be TEISHI');
      ctx.assertEqual(res.engineOrder4, 'KAISHIN', 'IJN order 4 must be KAISHIN');
      ctx.assertEqual(res.telegraphTone, 'BRASS_CLANG', 'IJN audio tone must be BRASS_CLANG');
      ctx.assertEqual(res.courseLabel, 'Shinro', 'Course gauge label must be Shinro');
    }
    await ctx.advanceTime(0.5);
  });

  // ──────────────────────────────────────────────────
  // PHASE 4: Royal Navy T-Class (Admiralty / British Imperial Orders)
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 4: Royal Navy T-Class Station & Orders', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'rn-t-class-1942';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('rn-t-class-1942');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder1: ui.engineOrders[1],
          engineOrder5: ui.engineOrders[5],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          speedLabel: ui.gauges.speed
        };
      });
      ctx.assertEqual(res.theme, 'rn-admiralty', 'Royal Navy must set rn-admiralty station theme');
      ctx.assertEqual(res.depthSuffix, 'ft', 'Royal Navy must use imperial depth suffix');
      ctx.assertEqual(res.engineOrder1, 'DEAD SLOW', 'Royal Navy order 1 must be DEAD SLOW');
      ctx.assertEqual(res.engineOrder5, 'EMERGENCY', 'Royal Navy order 5 must be EMERGENCY');
      ctx.assertEqual(res.telegraphTone, 'ADMIRALTY_BELL', 'Royal Navy audio tone must be ADMIRALTY_BELL');
      ctx.assertEqual(res.speedLabel, 'KNOTS', 'Speed gauge label must be KNOTS');
    }
    await ctx.advanceTime(0.5);
  });

  // ──────────────────────────────────────────────────
  // PHASE 5: Regia Marina Marcello-Class (Bronze Brass / Italian Orders / Metric)
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 5: Regia Marina Marcello Station & Orders', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'rm-marcello-1941';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('rm-marcello-1941');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder0: ui.engineOrders[0],
          engineOrder4: ui.engineOrders[4],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          depthLabel: ui.gauges.depth
        };
      });
      ctx.assertEqual(res.theme, 'rm-brass', 'Regia Marina must set rm-brass station theme');
      ctx.assertEqual(res.depthSuffix, 'm', 'Regia Marina must use metric depth suffix');
      ctx.assertEqual(res.engineOrder0, 'ALT', 'Regia Marina order 0 must be ALT');
      ctx.assertEqual(res.engineOrder4, 'AVANTI TUTTA', 'Regia Marina order 4 must be AVANTI TUTTA');
      ctx.assertEqual(res.telegraphTone, 'BRONZE_BELL', 'Regia Marina audio tone must be BRONZE_BELL');
      ctx.assertEqual(res.depthLabel, 'Profondità', 'Depth gauge label must be Profondità');
    }
    await ctx.advanceTime(0.5);
  });

  // ──────────────────────────────────────────────────
  // PHASE 6: Soviet VMF S-Class (Cast Iron Red / Translit Orders / Metric)
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 6: Soviet VMF S-Class Station & Orders', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'vmf-s-class-1942';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('vmf-s-class-1942');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder4: ui.engineOrders[4],
          engineOrder5: ui.engineOrders[5],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          depthLabel: ui.gauges.depth
        };
      });
      ctx.assertEqual(res.theme, 'vmf-red', 'Soviet VMF must set vmf-red station theme');
      ctx.assertEqual(res.depthSuffix, 'm', 'Soviet VMF must use metric depth suffix');
      ctx.assertEqual(res.engineOrder4, 'POLNYY', 'Soviet VMF order 4 must be POLNYY');
      ctx.assertEqual(res.engineOrder5, 'SAMYY BYSTRYY', 'Soviet VMF order 5 must be SAMYY BYSTRYY');
      ctx.assertEqual(res.telegraphTone, 'IRON_CHIME', 'Soviet VMF audio tone must be IRON_CHIME');
      ctx.assertEqual(res.depthLabel, 'Glubina', 'Depth gauge label must be Glubina');
    }
    await ctx.advanceTime(0.5);
  });

  // ──────────────────────────────────────────────────
  // PHASE 7: Reversibility & US Fleet Boat Restoration
  // ──────────────────────────────────────────────────
  runner.addStep('Phase 7: Reversibility & US Fleet Restoration', async (ctx) => {
    if (ctx.page) {
      const res = await ctx.page.evaluate(() => {
        const game = globalThis.game;
        game.state.playerSub.profileId = 'gato-silversides';
        game.state.playerSub.presentation = null;
        const ui = getPlayerStationPresentation(game.state);
        document.documentElement.dataset.stationTheme = ui.theme;
        globalThis.domView?.applyPresentation(game.state, ui);
        const soundId = globalThis.audio?.setSubmarineProfile('gato-silversides');
        return {
          theme: document.documentElement.dataset.stationTheme,
          depthSuffix: ui.depth.suffix,
          engineOrder5: ui.engineOrders[5],
          telegraphTone: soundId?.telegraphTone || globalThis.audio?.soundIdentity?.telegraphTone,
          powerLabel: ui.gauges.power
        };
      });
      ctx.assertEqual(res.theme, 'us-fleet', 'US Navy must restore us-fleet station theme');
      ctx.assertEqual(res.depthSuffix, 'ft', 'US Navy must use imperial depth suffix');
      ctx.assertEqual(res.engineOrder5, 'FLANK', 'US Navy order 5 must be FLANK');
      ctx.assertEqual(res.telegraphTone, 'CHADBURN', 'US Navy audio tone must be CHADBURN');
      ctx.assertEqual(res.powerLabel, 'Power', 'Power gauge label must be Power');
    }
    await ctx.advanceTime(0.5);
  });

  return runner;
}
