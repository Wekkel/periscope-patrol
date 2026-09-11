// ═══════════════════════════════════════════════════ MISSION TEST HARNESS
// Unified CLI and orchestrator for deterministic browser and simulation tests.

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {createBrowserSession} from './browser-harness.mjs';
import {DEVICE_PROFILES, getDeviceProfile} from './device-profiles.mjs';
import {ScenarioContext, ScenarioRunner} from './scenario-runner.mjs';
import {createMissionLifecycleScenario} from './scenarios/mission-lifecycle-scenario.mjs';
import {createEnduranceScenario} from './scenarios/endurance-scenario.mjs';
import {createNationalStationsScenario} from './scenarios/national-stations-scenario.mjs';

export async function runMissionScenario({
  scenario,
  deviceProfile = 'DESKTOP_STANDARD',
  headless = true,
  rootDir = '.'
}) {
  const profile = typeof deviceProfile === 'string' ? getDeviceProfile(deviceProfile) : deviceProfile;
  const session = await createBrowserSession({
    deviceProfile: profile,
    headless,
    rootDir,
    deterministic: true
  });

  const context = new ScenarioContext({
    page: session.page,
    profile
  });

  try {
    const result = await scenario.run(context);
    result.errors = [...session.errors];
    result.memoryLog = scenario.memoryLog || [];
    if (session.errors.length > 0 && result.success) {
      result.success = false;
      result.error = `Scenario completed but ${session.errors.length} unhandled errors occurred in browser session.`;
    }
    return result;
  } finally {
    await session.close();
  }
}

// Built-in comprehensive smoke scenario verifying layout, hydrodynamics, UI interaction and viewmodels
export function createSmokeScenario(profile = DEVICE_PROFILES.DESKTOP_STANDARD) {
  const runner = new ScenarioRunner({
    name: `Lifecycle Smoke Test (${profile.name})`,
    profile
  });

  // Step 1: Layout Mode & Shell Separation Assertion
  runner.addStep('Initialize & Verify Shell Separation', async (ctx) => {
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

    // Dismiss briefing overlay if present so it doesn't intercept pointer events
    const briefing = await ctx.page.$('#briefingOverlay');
    if (briefing && await briefing.isVisible()) {
      await ctx.tap('#briefingDismiss');
      await ctx.assertHidden('#briefingOverlay', 'Briefing overlay must close upon acknowledgment');
    }
  });

  // Step 2: Propulsion & Helm Order Assertion
  runner.addStep('Order Ahead Two-Thirds & Course 180', async (ctx) => {
    await ctx.dispatch({ type: 'SET_ENGINE_RPM', rpm: 250 });
    await ctx.dispatch({ type: 'SET_ORDERED_HEADING', heading: 180 });
    await ctx.advanceTime(2.0);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assertEqual(snap.orderedRpm, 250, 'Engine ordered RPM must match dispatched command');
    ctx.assertEqual(snap.orderedHeading, 180, 'Ordered heading must match dispatched command');
    ctx.assert(snap.actualRpm > 0, 'Actual RPM must spool up dynamically');
    ctx.assert(snap.speedKnots > 0, 'Submarine must develop forward speed through the water');
  });

  // Step 3: Ballast & Depth Submersion Assertion
  runner.addStep('Order Dive to 55ft Periscope Depth', async (ctx) => {
    await ctx.dispatch({ type: 'SET_ORDERED_DEPTH', depthFeet: 55 });
    await ctx.advanceTime(3.0);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assertEqual(snap.orderedDepthFeet, 55, 'Ordered depth must match 55ft command');
    ctx.assert(snap.depthFeet > 0, 'Submarine must have begun descent');
    ctx.assertEqual(snap.ballastState, 'FLOODING', 'Ballast tanks must indicate FLOODING state');
  });

  // Step 4: DOM Interaction & Station Navigation Assertion
  runner.addStep('Navigate Station Tabs via DOM Interaction', async (ctx) => {
    if (profile.expectedLayout === 'desk') {
      await ctx.click('#stationSound');
      await ctx.assertVisible('#soundControls', 'Sound station controls must be displayed');
    } else {
      await ctx.tap('[data-sta="SOUND"]');
      await ctx.assertVisible('#soundControls', 'Sound station controls must be displayed on touch');
    }
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assertEqual(snap.activeStation, 'SOUND', 'Active station must be updated to SOUND in game state');
  });

  // Step 5: HUD ViewModel & Vitals Contract Assertion
  runner.addStep('Assert HUD ViewModel Contract Integrity', async (ctx) => {
    await ctx.advanceTime(0.5);
  }, async (ctx) => {
    const snap = await ctx.getSnapshot();
    ctx.assert(!!snap.hud, 'HUD viewmodel must be materialized in snapshot');
    ctx.assert(!!snap.hud.vitals, 'HUD vitals must be present');
    ctx.assert(!!snap.hud.vitals?.speed, 'HUD speed vital must be present');
    ctx.assert(!!snap.hud.vitals?.depth, 'HUD depth vital must be present');
    ctx.assert(!!snap.hud.vitals?.heading, 'HUD heading vital must be present');
    ctx.assert(!!snap.hud.vitals?.torpedoes, 'HUD torpedo vital must be present');
    ctx.assert(snap.time.elapsedSeconds >= 5.4, `Simulation time must have deterministically advanced at least 5.4s (got ${snap.time.elapsedSeconds})`);
  });

  return runner;
}

// Direct CLI entry point
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const eq = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
    if (eq) return eq;
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return null;
  };
  const scenarioArg = getArg('scenario') || 'smoke';
  const iterArg = getArg('iterations');
  const iterations = iterArg ? parseInt(iterArg, 10) : 3;
  const devArg = getArg('device') || getArg('profile');
  const isAll = args.includes('--all-devices') || devArg === 'all' || devArg === 'ALL';
  const targetProfiles = isAll
    ? Object.keys(DEVICE_PROFILES)
    : [devArg || 'DESKTOP_STANDARD'];

  console.log(`[TEST HARNESS] Executing scenario '${scenarioArg}' (iterations: ${iterations}) across profiles: ${targetProfiles.join(', ')}`);

  let anyFail = false;
  for (const pKey of targetProfiles) {
    const profile = getDeviceProfile(pKey);
    console.log(`\n--- Running scenario on ${profile.name} (layout: ${profile.expectedLayout}) ---`);
    let scenario;
    if (scenarioArg === 'lifecycle') {
      scenario = createMissionLifecycleScenario(profile);
    } else if (scenarioArg === 'national-stations' || scenarioArg === 'national') {
      scenario = createNationalStationsScenario(profile);
    } else if (scenarioArg === 'endurance') {
      scenario = createEnduranceScenario(profile, { iterations });
    } else {
      scenario = createSmokeScenario(profile);
    }

    const result = await runMissionScenario({
      scenario,
      deviceProfile: profile,
      headless: true
    });

    console.log(`Result: ${result.success ? 'PASSED' : 'FAILED'} (${result.durationMs}ms)`);
    console.log(`Steps: ${result.stepsPassed} / ${result.stepsTotal} passed`);

    if (result.memoryLog?.length > 0) {
      console.log('\n[MEMORY TELEMETRY]');
      console.table(result.memoryLog.map(m => ({
        patrol: m.patrol,
        phase: m.phase,
        'heapUsed (MB)': m.heapUsedMB,
        'domElements': m.domElements,
        'cdpNodes': m.cdpNodes,
        'listeners': m.eventListeners
      })));
    }

    if (!result.success) {
      anyFail = true;
      console.error(`Error: ${result.error}`);
      if (result.errors?.length) {
        console.error('Browser session errors:', JSON.stringify(result.errors, null, 2));
      }
    }
  }

  process.exit(anyFail ? 1 : 0);
}
