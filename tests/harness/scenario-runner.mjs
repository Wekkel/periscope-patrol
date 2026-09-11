// ═══════════════════════════════════════════════════ SCENARIO RUNNER
// Deterministic test scenario engine for mission lifecycle automation.

export function extractScenarioSnapshot(rawSnap, layout = 'desk') {
  if (!rawSnap) return null;
  const sub = rawSnap.playerSub || {};
  const prop = sub.propulsion || {};
  const dmg = sub.damage || {};
  const w = rawSnap.weapons || {};
  const tdc = rawSnap.tdc || {};
  const camp = rawSnap.campaign || {};
  const time = rawSnap.time || {};
  const tact = rawSnap.tactical || {};

  // Pure HUD viewmodel inspection when available
  let hudVm = null;
  if (typeof globalThis.buildHudViewModel === 'function') {
    try {
      hudVm = globalThis.buildHudViewModel(rawSnap, layout);
    } catch (_) {}
  }

  return {
    mode: sub.mode,
    depthFeet: sub.depthFeet ?? 0,
    orderedDepthFeet: sub.orderedDepthFeet ?? 0,
    ballastState: sub.ballastState,
    verticalSpeedFps: sub.verticalSpeedFps ?? 0,
    heading: sub.heading ?? 0,
    orderedHeading: sub.orderedHeading ?? 0,
    rudder: sub.rudder ?? 0,
    speedKnots: prop.speedKnots ?? 0,
    actualRpm: prop.actualRpm ?? 0,
    orderedRpm: prop.orderedRpm ?? 0,
    engineMode: prop.engineMode,
    battery: prop.battery ?? 100,
    fuel: prop.fuel ?? 100,
    stealth: {
      silentRunning: !!sub.stealth?.silentRunning,
      acousticSignature: sub.stealth?.acousticSignature ?? 0.5
    },
    activeStation: tact.activeStation,
    contactsCount: rawSnap.world?.contacts?.length || 0,
    contacts: (rawSnap.world?.contacts || []).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      side: c.side,
      sunk: !!c.sunk,
      position: c.position ? { ...c.position } : null,
      flotation: c.flotation ?? 1
    })),
    tubes: (w.tubes || []).map(t => ({ id: t.id, status: t.status, pos: t.pos, flooded: !!t.flooded })),
    weapons: {
      tubes: (w.tubes || []).map(t => ({ id: t.id, status: t.status, pos: t.pos, flooded: !!t.flooded })),
      activeTorpedoesCount: w.activeTorpedoes?.length || 0,
      torpedoInventory: w.torpedoInventory ?? 0
    },
    tdc: {
      targetId: tdc.targetId,
      status: tdc.status,
      solutionQuality: tdc.solutionQuality,
      bearing: tdc.bearing,
      rangeNm: tdc.rangeNm
    },
    damage: {
      hullIntegrity: dmg.hullIntegrity ?? 100,
      flooding: dmg.flooding ?? 0,
      repairPriority: dmg.repairPriority || 'FLOODING',
      pumpTripped: !!dmg.pumpTripped,
      crewFatigue: dmg.crewFatigue ?? 0,
      compartments: dmg.compartments || {}
    },
    campaign: {
      patrolArea: camp.patrolArea,
      patrolNumber: camp.patrolNumber,
      scenarioSeed: camp.scenarioSeed,
      status: camp.status,
      missionStatus: camp.missionStatus,
      tonnageSunk: camp.tonnageSunk ?? 0,
      afterAction: camp.afterAction || null
    },
    time: {
      elapsedSeconds: time.elapsedSeconds ?? 0,
      timeScale: time.timeScale ?? 1
    },
    hud: hudVm ? {
      vitals: hudVm.vitals,
      fire: hudVm.fire,
      navigation: hudVm.navigation
    } : null
  };
}

export class ScenarioContext {
  constructor({ engine = null, page = null, profile = null } = {}) {
    this.engine = engine;
    this.page = page;
    this.profile = profile;
    this.metrics = {
      dispatchedCommands: 0,
      assertionsPassed: 0,
      assertionsFailed: 0,
      timeAdvancedSec: 0
    };
  }

  async getSnapshot() {
    const layout = this.profile?.expectedLayout || 'desk';
    if (this.page) {
      return await this.page.evaluate(({ extractorFnText, lay }) => {
        const game = globalThis.game;
        if (!game) return null;
        const snap = game.getSnapshot();
        const extractor = new Function('rawSnap', 'layout', `${extractorFnText}; return extractScenarioSnapshot(rawSnap, layout);`);
        return extractor(snap, lay);
      }, { extractorFnText: extractScenarioSnapshot.toString(), lay: layout });
    }

    if (this.engine) {
      const snap = this.engine.getSnapshot ? this.engine.getSnapshot() : this.engine.state;
      return extractScenarioSnapshot(snap, layout);
    }

    return null;
  }

  async dispatch(command, { step = true } = {}) {
    this.metrics.dispatchedCommands++;
    if (this.page) {
      return await this.page.evaluate(({ cmd, shouldStep }) => {
        if (!globalThis.game?.dispatch) {
          throw new Error('globalThis.game.dispatch is not available');
        }
        const res = globalThis.game.dispatch(cmd);
        if (shouldStep && globalThis.game.engine?.processCommands) {
          globalThis.game.engine.processCommands();
        }
        return res;
      }, { cmd: command, shouldStep: step });
    }

    if (this.engine) {
      if (this.engine.dispatch) {
        const res = this.engine.dispatch(command);
        if (step && this.engine.engine?.processCommands) {
          this.engine.engine.processCommands();
        }
        return res;
      }
      return this.engine.applyCmd(command);
    }
    throw new Error('No execution target attached to context');
  }

  async click(selector) {
    if (this.page) {
      await this.page.waitForSelector(selector, { timeout: 4000 });
      await this.page.click(selector);
      return;
    }
    throw new Error('click() requires a browser page context');
  }

  async tap(selector) {
    if (this.page) {
      await this.page.waitForSelector(selector, { timeout: 4000 });
      if (this.profile?.hasTouch) {
        await this.page.tap(selector);
      } else {
        await this.page.click(selector);
      }
      return;
    }
    throw new Error('tap() requires a browser page context');
  }

  // Deterministic simulation stepping: always using the canonical 10 Hz fixed delta
  async advanceTime(seconds, timeScale = 1) {
    const fdt = 0.10; // Canonical 10 Hz simulation step
    const steps = Math.max(1, Math.round(seconds / fdt));
    this.metrics.timeAdvancedSec += steps * fdt;

    if (this.page) {
      return await this.page.evaluate(({ count, dt, scale }) => {
        const game = globalThis.game;
        if (!game) throw new Error('Game instance not found on page');
        for (let i = 0; i < count; i++) {
          game.update(dt * scale);
        }
        // Force presentation effect refresh for DOM/HUD sync
        if (typeof globalThis.processPresentationEffects === 'function') {
          globalThis.processPresentationEffects();
        }
        // Sync HUD presenter and DOM views
        if (globalThis.gameLoop?.hud) {
          globalThis.gameLoop.hud.acc = 999;
          globalThis.gameLoop.hud.tick(0.001);
        }
      }, { count: steps, dt: fdt, scale: timeScale });
    }

    if (this.engine) {
      for (let i = 0; i < steps; i++) {
        this.engine.update(fdt * timeScale);
      }
      return;
    }

    throw new Error('advanceTime() requires engine or page context');
  }

  assert(condition, message = 'Assertion failed') {
    if (!condition) {
      this.metrics.assertionsFailed++;
      throw new Error(`[ASSERTION FAILED] ${message}`);
    }
    this.metrics.assertionsPassed++;
  }

  assertEqual(actual, expected, message = 'Values not equal') {
    if (actual !== expected) {
      this.metrics.assertionsFailed++;
      throw new Error(`[ASSERTION FAILED] ${message}: expected '${expected}', got '${actual}'`);
    }
    this.metrics.assertionsPassed++;
  }

  async assertLayout(expectedLayout) {
    if (!this.page) return;
    const actual = await this.page.evaluate(() => document.documentElement.dataset.lay);
    this.assertEqual(actual, expectedLayout, `Layout mode check (${expectedLayout})`);
  }

  async assertVisible(selector, message = null) {
    if (!this.page) return;
    const isVis = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }, selector);
    this.assert(isVis, message || `Element '${selector}' must be visible`);
  }

  async assertHidden(selector, message = null) {
    if (!this.page) return;
    const isHid = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    }, selector);
    this.assert(isHid, message || `Element '${selector}' must be hidden`);
  }

  async assertModalOpen(selector, message = null) {
    if (!this.page) return;
    const isOpen = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const isClassOpen = el.classList.contains('open');
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      return isClassOpen || isVisible;
    }, selector);
    this.assert(isOpen, message || `Modal '${selector}' must be open`);
  }

  async assertModalClosed(selector, message = null) {
    if (!this.page) return;
    const isClosed = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const style = window.getComputedStyle(el);
      const isClassOpen = el.classList.contains('open');
      const isHidden = style.display === 'none' || style.visibility === 'hidden';
      return !isClassOpen || isHidden;
    }, selector);
    this.assert(isClosed, message || `Modal '${selector}' must be closed`);
  }

  async getTubesState() {
    const snap = await this.getSnapshot();
    return snap?.tubes || [];
  }

  async getDamageState() {
    const snap = await this.getSnapshot();
    return snap?.damage || {};
  }

  async waitForCondition(predicate, { timeoutSec = 10, stepSec = 0.5 } = {}) {
    let elapsed = 0;
    while (elapsed < timeoutSec) {
      const snap = await this.getSnapshot();
      if (await predicate(snap)) return true;
      await this.advanceTime(stepSec);
      elapsed += stepSec;
    }
    const snap = await this.getSnapshot();
    if (await predicate(snap)) return true;
    throw new Error(`[TIMEOUT] Condition not met within ${timeoutSec}s`);
  }

  async getMemoryMetrics() {
    if (!this.page) return null;
    try {
      const inPage = await this.page.evaluate(() => {
        return {
          domElements: document.getElementsByTagName('*').length,
          usedJSHeapSize: window.performance?.memory?.usedJSHeapSize || 0,
          totalJSHeapSize: window.performance?.memory?.totalJSHeapSize || 0
        };
      });

      let cdpMetrics = null;
      try {
        if (!this._cdpSession) {
          this._cdpSession = await this.page.context().newCDPSession(this.page);
          await this._cdpSession.send('Performance.enable');
        }
        const perf = await this._cdpSession.send('Performance.getMetrics');
        cdpMetrics = Object.fromEntries(perf.metrics.map(m => [m.name, m.value]));
      } catch {
        // CDP fallback
      }

      const heapUsedBytes = cdpMetrics?.JSHeapUsedSize || inPage.usedJSHeapSize;
      const heapTotalBytes = cdpMetrics?.JSHeapTotalSize || inPage.totalJSHeapSize;

      return {
        heapUsedMB: +(heapUsedBytes / (1024 * 1024)).toFixed(2),
        heapTotalMB: +(heapTotalBytes / (1024 * 1024)).toFixed(2),
        domElements: inPage.domElements,
        cdpNodes: cdpMetrics?.Nodes ?? inPage.domElements,
        eventListeners: cdpMetrics?.JSEventListeners ?? null
      };
    } catch {
      return null;
    }
  }

  async startNewPatrol(areaKey) {
    if (this.page) {
      await this.page.evaluate((area) => {
        const game = globalThis.game;
        game.engine.startNewPatrol(area);
        if (typeof globalThis.processPresentationEffects === 'function') {
          globalThis.processPresentationEffects();
        }
        if (typeof globalThis.domView?.render === 'function') {
          const snap = game.getSnapshot();
          const layout = globalThis.LayoutService?.get?.() || 'desk';
          globalThis.domView.render(snap, layout);
        }
      }, areaKey);
    }
  }
}

export class ScenarioRunner {
  constructor({ name = 'Anonymous Scenario', profile, steps = [] } = {}) {
    this.name = name;
    this.profile = profile;
    this.steps = steps;
  }

  addStep(name, actionFn, assertFn = null) {
    this.steps.push({ name, action: actionFn, assert: assertFn });
    return this;
  }

  async run(context) {
    const startTime = performance.now();
    const result = {
      scenarioName: this.name,
      deviceProfile: this.profile?.id || 'DEFAULT',
      success: true,
      stepsTotal: this.steps.length,
      stepsPassed: 0,
      stepResults: [],
      error: null,
      durationMs: 0
    };

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      const stepStart = performance.now();
      const stepResult = {
        index: i + 1,
        name: step.name,
        success: false,
        durationMs: 0,
        error: null,
        snapshot: null
      };

      try {
        if (step.action) {
          await step.action(context);
        }
        if (step.assert) {
          await step.assert(context);
        }
        stepResult.snapshot = await context.getSnapshot();
        stepResult.success = true;
        result.stepsPassed++;
      } catch (err) {
        stepResult.error = err.message;
        stepResult.success = false;
        result.success = false;
        result.error = `Step ${i + 1} ('${step.name}') failed: ${err.message}`;
        stepResult.durationMs = Math.round(performance.now() - stepStart);
        result.stepResults.push(stepResult);
        break;
      }

      stepResult.durationMs = Math.round(performance.now() - stepStart);
      result.stepResults.push(stepResult);
    }

    result.durationMs = Math.round(performance.now() - startTime);
    result.metrics = { ...context.metrics };
    return result;
  }
}
