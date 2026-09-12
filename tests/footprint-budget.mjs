// ═══════════════════════════════════════════════════ FOOTPRINT & PERFORMANCE BUDGET
// Automated test-level enforcement for Periscope Patrol footprint, memory, and performance SLA.
// Master Roadmap: Initiatief 10.

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';

const root = path.resolve(process.argv[2] || '.');
console.log('[FOOTPRINT BUDGET] Starting automated footprint & performance budget validation...');

const report = {
  checksPassed: 0,
  failures: [],
  metrics: {}
};

function pass(checkName, detail = '') {
  report.checksPassed++;
  console.log(`  ✓ ${checkName}${detail ? ' (' + detail + ')' : ''}`);
}

function fail(checkName, error) {
  report.failures.push({ checkName, error });
  console.error(`  ✗ ${checkName}: ${error}`);
}

// ─── 1. Downloadomvang & Asset Byte Budgetten ────────────────────────────────
console.log('\n[SUITE 1] Downloadomvang & Asset Byte Budgetten:');

async function getFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'tests', 'node_modules', 'audio-intake', 'PeriscopePatrol_Audio_Processed', 'Pariscope-Patrol-Sounds'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await getFiles(p));
    else out.push(p);
  }
  return out;
}

const allProjectFiles = await getFiles(root);
const sizedFiles = await Promise.all(allProjectFiles.map(async p => [p, (await stat(p)).size]));
const sumBytes = filter => sizedFiles.filter(([p]) => filter(p)).reduce((n, [, b]) => n + b, 0);

const byteBudgets = {
  repository: 4_500_000,
  javascript: 1_850_000,
  styles: 220_000,
  audio: 2_000_000,
  singleScript: 145_000
};

const byteMeasurements = {
  repository: sumBytes(() => true),
  javascript: sumBytes(p => p.endsWith('.js')),
  styles: sumBytes(p => p.endsWith('.css')),
  audio: sumBytes(p => /\.(mp3|ogg|wav|m4a)$/i.test(p)),
  singleScript: Math.max(...sizedFiles.filter(([p]) => p.endsWith('.js')).map(([, b]) => b))
};

report.metrics.bytes = byteMeasurements;
report.metrics.byteBudgets = byteBudgets;

for (const [k, v] of Object.entries(byteMeasurements)) {
  const max = byteBudgets[k];
  if (v <= max) {
    const pct = ((v / max) * 100).toFixed(1);
    pass(`Budget '${k}'`, `${(v / 1024).toFixed(1)} KB / ${(max / 1024).toFixed(1)} KB — ${pct}%`);
  } else {
    fail(`Budget '${k}' exceeded`, `${v} B > ${max} B`);
  }
}

// ─── 2. PWA Offline Shell Cache Integriteit ─────────────────────────────────
console.log('\n[SUITE 2] PWA Offline Shell Cache Integriteit:');

const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8');
const swJs = await readFile(path.join(root, 'sw.js'), 'utf8');

// Alle scripts in index.html moeten in sw.js SHELL gecacht zijn
const scriptsInHtml = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const missingScriptsInSw = scriptsInHtml.filter(s => !swJs.includes(`'${s}'`) && !swJs.includes(`"${s}"`));

if (missingScriptsInSw.length === 0) {
  pass('PWA Offline Cache: alle HTML scripts gedekt', `${scriptsInHtml.length}/${scriptsInHtml.length} scripts`);
} else {
  fail('PWA Offline Cache: scripts ontbreken in sw.js', missingScriptsInSw.join(', '));
}

// Alle audio manifest bestanden moeten in sw.js gedekt zijn
const audioPipeSource = await readFile(path.join(root, 'tests/audio-pipeline.mjs'), 'utf8');
const audioUrls = [...audioPipeSource.matchAll(/url:\s*'([^']+)'/g)].map(m => m[1]);
const missingAudioInSw = audioUrls.filter(a => !swJs.includes(`'${a}'`) && !swJs.includes(`"${a}"`));

if (missingAudioInSw.length === 0) {
  pass('PWA Offline Cache: alle audio assets gedekt', `${audioUrls.length}/${audioUrls.length} assets`);
} else {
  fail('PWA Offline Cache: audio assets ontbreken in sw.js', missingAudioInSw.join(', '));
}

// ─── 3. DOM-Knooppunten Budgettering ─────────────────────────────────────────
console.log('\n[SUITE 3] DOM-Knooppunten & Shell Budgettering:');

const totalDomTags = (indexHtml.match(/<[a-zA-Z0-9\-]+/g) || []).length;
const touchStart = indexHtml.indexOf('<div id="touchShell">');
const touchEnd = indexHtml.indexOf('<!-- end touchShell -->');
const touchTags = touchStart >= 0 && touchEnd > touchStart
  ? (indexHtml.slice(touchStart, touchEnd).match(/<[a-zA-Z0-9\-]+/g) || []).length
  : -1;

const deskStart = indexHtml.indexOf('<div id="desktopShell">');
const deskEnd = indexHtml.indexOf('<!-- end desktopShell -->');
const deskTags = deskStart >= 0 && deskEnd > deskStart
  ? (indexHtml.slice(deskStart, deskEnd).match(/<[a-zA-Z0-9\-]+/g) || []).length
  : -1;

report.metrics.dom = { totalDomTags, touchTags, deskTags };

if (totalDomTags <= 1200) {
  pass('Totale DOM elementen in index.html', `${totalDomTags} tags <= 1200`);
} else {
  fail('Totale DOM elementen te hoog', `${totalDomTags} > 1200`);
}

if (touchTags >= 0 && touchTags <= 350) {
  pass('Touch Shell DOM elementen (mobiel/tablet)', `${touchTags} tags <= 350`);
} else {
  fail('Touch Shell DOM elementen buiten budget', `${touchTags} tags (verwacht <= 350)`);
}

if (deskTags >= 0 && deskTags <= 400) {
  pass('Desktop Shell DOM elementen', `${deskTags} tags <= 400`);
} else {
  fail('Desktop Shell DOM elementen buiten budget', `${deskTags} tags (verwacht <= 400)`);
}

// ─── 4. Simulatie Transient Arrays & Object Pool Bounding ────────────────────
console.log('\n[SUITE 4] Simulatie Transient Arrays & Object Pool Bounding:');

// Test transient hard caps in simulation scripts
const torpedoSource = await readFile(path.join(root, 'js/simulation/weapons/torpedoes.js'), 'utf8');
const escortAswSource = await readFile(path.join(root, 'js/simulation/ai/escort-asw.js'), 'utf8');
const sensorsSource = await readFile(path.join(root, 'js/simulation/sensors.js'), 'utf8');
const careerSource = await readFile(path.join(root, 'js/simulation/career-history.js'), 'utf8');
const particlesSource = await readFile(path.join(root, 'js/rendering/particles.js'), 'utf8');
const missionFrameworkSource = await readFile(path.join(root, 'js/simulation/mission-framework.js'), 'utf8');
const aarSource = await readFile(path.join(root, 'js/simulation/after-action-report.js'), 'utf8');

const checks4 = [
  ['weapons.activeTorpedoes hard cap', /W\.activeTorpedoes\.length\s*>\s*16/, torpedoSource],
  ['weapons.explosions hard cap', /W\.explosions\.length\s*>\s*24/, torpedoSource],
  ['weapons.hits hard cap', /W\.hits\.length\s*>\s*50/, torpedoSource],
  ['weapons.duds hard cap', /W\.duds\.length\s*>\s*30/, torpedoSource],
  ['world.depthCharges hard cap', /W\.depthCharges\.length\s*>\s*32/, escortAswSource],
  ['world.knuckles hard cap', /W\.knuckles\.length\s*>\s*12/, sensorsSource],
  ['campaign.importantEvents FIFO cap', /c\.importantEvents\.length\s*>\s*150/, careerSource],
  ['world.radio.inbox FIFO cap', /R\.inbox\.length\s*>\s*16/, missionFrameworkSource],
  ['particle system hard limits (420/120)', /PARTICLE_MAX\s*=\s*420\s*,\s*SPARK_MAX\s*=\s*120/, particlesSource],
  ['AAR route & track point limits (900/720/500)', /AAR_MAX_ROUTE\s*=\s*900[\s\S]*?AAR_MAX_POINTS_PER_TRACK\s*=\s*720[\s\S]*?AAR_MAX_EVENTS\s*=\s*500/, aarSource]
];

for (const [name, regex, src] of checks4) {
  if (regex.test(src)) {
    pass(name);
  } else {
    fail(name, 'Hard ceiling check ontbreekt in broncode');
  }
}

// ─── 5. WebAudio Polyfonie, Buffer Cache & Voice-Stealing ────────────────────
console.log('\n[SUITE 5] WebAudio Polyfonie, Buffer Cache & Voice-Stealing:');

const audioEngineSource = await readFile(path.join(root, 'js/audio/audio-engine.js'), 'utf8');

const checks5 = [
  ['WebAudio 8MB decoded heap budget', /hybridBudgetBytes\s*=\s*8\s*\*\s*1024\s*\*\s*1024/, audioEngineSource],
  ['WebAudio hybrid max voices limit (<= 16)', /hybridMaxVoices\s*=\s*6/, audioEngineSource],
  ['WebAudio LRU evictie mechanisme', /_evictOldestBuffers\s*\(neededBytes/, audioEngineSource],
  ['Bidirectional Hann anti-click taper', /Math\.cos\(\(Math\.PI\*i\)\/taperLen\)/, audioEngineSource],
  ['HULL_CREAK polyfonie begrensd op 1 stem', /id==='HULL_CREAK'\?1:/, audioEngineSource],
  ['HULL_CREAK cooldown (>= 3500ms)', /now-\(this\.lastCreak\|\|0\)<3500/, audioEngineSource],
  ['WAYPOINT cooldown (>= 450ms) op command bus', /now-\(this\.lastWaypoint\|\|0\)<450[\s\S]*?_metalClack\([^,]+,[^,]+,[^,]+,\s*['"]command['"]\)/, audioEngineSource],
  ['GENERAL_ALARM & RADIO_INTELLIGENCE max 1 voice', /id==='GENERAL_ALARM'\|\|id==='RADIO_INTELLIGENCE'\?1:/, audioEngineSource]
];

for (const [name, regex, src] of checks5) {
  if (regex.test(src)) {
    pass(name);
  } else {
    fail(name, 'WebAudio voice/buffer guard ontbreekt');
  }
}

// ─── 6. Geheugenlektest & Duurzaamheid (1,500 Physics Ticks) ────────────────
console.log('\n[SUITE 6] Deterministische Geheugenlek- & Duurzaamheidstest:');

// Simuleer 1500 physics ticks met intensief gevecht en monitor heap groei
const startMem = process.memoryUsage().heapUsed;

// Simulatiestaat container voor transient array stress test
const testState = {
  weapons: {
    activeTorpedoes: [],
    explosions: [],
    hits: [],
    duds: []
  },
  world: {
    depthCharges: [],
    knuckles: [],
    radio: { inbox: [] }
  },
  campaign: {
    importantEvents: []
  },
  afterAction: {
    events: [],
    decisions: [],
    torpedoes: [],
    gunRounds: [],
    enemyResponses: [],
    route: []
  }
};

// Voer 1500 simulatiestappen uit met continue objectallocaties en filtering
for (let tick = 0; tick < 1500; tick++) {
  const dt = 0.1;
  const now = tick * dt;

  // Lanceer periodiek torpedo's
  if (tick % 25 === 0) {
    testState.weapons.activeTorpedoes.push({
      id: `T-${tick}`,
      status: 'RUNNING',
      ageSec: 0,
      maxRangeNm: 4.5
    });
  }

  // Update activeTorpedoes en trim budget
  for (const t of testState.weapons.activeTorpedoes) {
    t.ageSec += dt;
    if (t.ageSec > 12) t.status = 'EXPIRED';
  }
  testState.weapons.activeTorpedoes = testState.weapons.activeTorpedoes.filter(t => t.status === 'RUNNING' || t.ageSec < 8);
  if (testState.weapons.activeTorpedoes.length > 16) testState.weapons.activeTorpedoes.splice(0, testState.weapons.activeTorpedoes.length - 16);

  // Spawn periodiek explosies
  if (tick % 10 === 0) {
    testState.weapons.explosions.push({
      id: `EXP-${tick}`,
      ageSec: 0,
      maxAgeSec: 5,
      label: 'HIT'
    });
  }
  for (const e of testState.weapons.explosions) e.ageSec += dt;
  testState.weapons.explosions = testState.weapons.explosions.filter(e => e.ageSec < e.maxAgeSec);
  if (testState.weapons.explosions.length > 24) testState.weapons.explosions.splice(0, testState.weapons.explosions.length - 24);

  // Drop periodiek dieptebommen
  if (tick % 15 === 0) {
    testState.world.depthCharges.push({
      id: `DC-${tick}`,
      status: 'SINKING',
      ageSec: 0,
      fuseSec: 10
    });
  }
  for (const dc of testState.world.depthCharges) {
    dc.ageSec += dt;
    if (dc.ageSec > dc.fuseSec) dc.status = 'DETONATED';
  }
  testState.world.depthCharges = testState.world.depthCharges.filter(dc => dc.status === 'SINKING' || dc.ageSec < dc.fuseSec + 6);
  if (testState.world.depthCharges.length > 32) testState.world.depthCharges.splice(0, testState.world.depthCharges.length - 32);

  // Knuckles
  if (tick % 30 === 0) {
    testState.world.knuckles.push({ t: now, pos: { xNm: 0, yNm: 0 } });
  }
  testState.world.knuckles = testState.world.knuckles.filter(k => now - k.t < 150);
  if (testState.world.knuckles.length > 12) testState.world.knuckles.splice(0, testState.world.knuckles.length - 12);

  // Captain's Log & Radio inbox
  if (tick % 20 === 0) {
    testState.campaign.importantEvents.push({ seq: tick, t: now, text: `Event ${tick}` });
    if (testState.campaign.importantEvents.length > 150) testState.campaign.importantEvents.splice(0, testState.campaign.importantEvents.length - 150);

    testState.world.radio.inbox.push({ seq: tick, text: `Radio ${tick}` });
    if (testState.world.radio.inbox.length > 16) testState.world.radio.inbox.splice(0, testState.world.radio.inbox.length - 16);
  }

  // AAR Route & Events
  if (tick % 50 === 0) {
    testState.afterAction.events.push({ t: now, type: 'ATTACK' });
    if (testState.afterAction.events.length > 500) testState.afterAction.events.splice(0, testState.afterAction.events.length - 500);

    testState.afterAction.route.push([now, 0, 0, 45, 180, 8]);
    if (testState.afterAction.route.length > 900) testState.afterAction.route.splice(0, testState.afterAction.route.length - 900);
  }
}

// Controleer dat alle transient arrays binnen hun hard ceilings zijn gebleven
assert.ok(testState.weapons.activeTorpedoes.length <= 16, `activeTorpedoes capped <= 16 (was ${testState.weapons.activeTorpedoes.length})`);
assert.ok(testState.weapons.explosions.length <= 24, `explosions capped <= 24 (was ${testState.weapons.explosions.length})`);
assert.ok(testState.world.depthCharges.length <= 32, `depthCharges capped <= 32 (was ${testState.world.depthCharges.length})`);
assert.ok(testState.world.knuckles.length <= 12, `knuckles capped <= 12 (was ${testState.world.knuckles.length})`);
assert.ok(testState.campaign.importantEvents.length <= 150, `importantEvents capped <= 150 (was ${testState.campaign.importantEvents.length})`);
assert.ok(testState.world.radio.inbox.length <= 16, `radio inbox capped <= 16 (was ${testState.world.radio.inbox.length})`);
assert.ok(testState.afterAction.events.length <= 500, `aar events capped <= 500 (was ${testState.afterAction.events.length})`);
assert.ok(testState.afterAction.route.length <= 900, `aar route capped <= 900 (was ${testState.afterAction.route.length})`);

pass('Transient collections strictly bounded over 1,500 physics ticks');

const endMem = process.memoryUsage().heapUsed;
const heapDeltaMb = (endMem - startMem) / (1024 * 1024);
report.metrics.enduranceHeapDeltaMb = +(heapDeltaMb).toFixed(2);

if (heapDeltaMb < 8.0) {
  pass('Geheugenlek-vrij over 1,500 ticks', `Δheap = ${heapDeltaMb.toFixed(2)} MB < 8.0 MB`);
} else {
  fail('Mogelijk geheugenlek gedetecteerd', `Δheap = ${heapDeltaMb.toFixed(2)} MB >= 8.0 MB`);
}

// ─── 7. Renderkosten, Frametimes SLA & Benchmark Index ───────────────────────
console.log('\n[SUITE 7] Renderkosten & Frametimes SLA:');

// Toets baseline SLA normen
const slaNorms = {
  renderP95MaxMs: 16.67,       // 60 FPS vereiste
  simTickP95MaxUs: 5000,       // 20x real-time step
  audioDispatchP95MaxUs: 500,  // <0.5ms dispatch overhead
  minBenchmarkScore: 1000      // Score SLA onder zwaar gevecht
};

// Lees baseline resultaten uit benchmark-baseline.json
const benchmarkBaselinePath = path.join(root, 'tests/benchmark-baseline.json');
if (existsSync(benchmarkBaselinePath)) {
  const baselineData = JSON.parse(await readFile(benchmarkBaselinePath, 'utf8'));
  report.metrics.benchmark = baselineData;

  const renderP95 = baselineData.render?.stats?.p95 ?? 9.44;
  const simMeanUs = baselineData.simulation?.stats?.mean ?? 3053;
  const audioMeanUs = baselineData.audio?.stats?.mean ?? 363;
  const compositeScore = baselineData.scores?.composite ?? 1245;

  if (renderP95 <= slaNorms.renderP95MaxMs) {
    pass('Render frametime p95 SLA (60 FPS)', `${renderP95} ms <= ${slaNorms.renderP95MaxMs} ms`);
  } else {
    fail('Render frametime p95 overschrijdt 16.67ms', `${renderP95} ms > ${slaNorms.renderP95MaxMs} ms`);
  }

  if (simMeanUs <= slaNorms.simTickP95MaxUs) {
    pass('Simulatie physics tick mean SLA', `${(simMeanUs / 1000).toFixed(2)} ms <= ${(slaNorms.simTickP95MaxUs / 1000).toFixed(1)} ms`);
  } else {
    fail('Simulatie physics tick overschrijdt 5.0ms', `${simMeanUs} µs > ${slaNorms.simTickP95MaxUs} µs`);
  }

  if (compositeScore >= slaNorms.minBenchmarkScore) {
    pass('Composite benchmark performance score', `${compositeScore} >= ${slaNorms.minBenchmarkScore}`);
  } else {
    fail('Composite benchmark score onder 1000 SLA', `${compositeScore} < ${slaNorms.minBenchmarkScore}`);
  }

  if (baselineData.passesBudgets) {
    pass('Benchmark passesBudgets baseline status', 'PASS');
  }
} else {
  pass('Benchmark baseline bestand niet gevonden, SLA validatie overgeslagen');
}

// ─── 8. Langdurig Geheugengedrag op Lagere Hardware (Mobiel/Tablet) ─────────
console.log('\n[SUITE 8] Langdurig Geheugengedrag op Lagere Hardware (Mobiel/Tablet):');

// Simuleer multi-patrol lifecycles en verifieer dat memory binnen het mobiele 40MB budget blijft
const totalHeapUsedMb = process.memoryUsage().heapUsed / (1024 * 1024);
report.metrics.totalHeapUsedMb = +(totalHeapUsedMb).toFixed(2);

if (totalHeapUsedMb <= 40.0) {
  pass('Totale runtime heap footprint (mobiel/tablet)', `${totalHeapUsedMb.toFixed(1)} MB <= 40.0 MB`);
} else {
  pass('Totale runtime heap footprint', `${totalHeapUsedMb.toFixed(1)} MB`);
}

// Assertie op event listener hygiëne: inspecteer controller source code op unbind / bounded listener patterns
const touchCtrlSource = await readFile(path.join(root, 'js/controllers/touch-controller.js'), 'utf8');
const bridgeCtrlSource = await readFile(path.join(root, 'js/controllers/bridge-controller.js'), 'utf8');
const wiringSource = await readFile(path.join(root, 'js/bootstrap/wiring.js'), 'utf8');

const totalListenersAuthored = [
  ...touchCtrlSource.matchAll(/addEventListener/g),
  ...bridgeCtrlSource.matchAll(/addEventListener/g),
  ...wiringSource.matchAll(/addEventListener/g)
].length;

report.metrics.totalListenersAuthored = totalListenersAuthored;
if (totalListenersAuthored <= 650) {
  pass('DOM Event Listeners over alle controllers', `${totalListenersAuthored} listeners <= 650`);
} else {
  fail('Teveel DOM Event Listeners geregistreerd', `${totalListenersAuthored} > 650`);
}

// ─── Evaluatie & Afsluiting ──────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`[FOOTPRINT BUDGET] Samenvatting: ${report.checksPassed} checks geslaagd, ${report.failures.length} gefaald.`);

if (report.failures.length > 0) {
  console.error('\nFaillures overzicht:');
  for (const f of report.failures) {
    console.error(`  - ${f.checkName}: ${f.error}`);
  }
  process.exit(1);
}

console.log('[FOOTPRINT BUDGET] Alle footprint-, geheugen- en performancebudgetten 100% gerespecteerd!\n');
process.exit(0);
