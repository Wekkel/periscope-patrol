import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');

const context={
  console,
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  RegExp,
  Set,
  Map
};
context.globalThis=context;
vm.createContext(context);

const scriptFiles=[
  'js/core/utilities.js',
  'js/data/torpedo-data.js',
  'js/data/campaign-data.js',
  'js/data/pacific-terrain-data.js',
  'js/data/game-catalog.js',
  'js/data/multi-theater-campaigns.js',
  'js/data/historical-scenarios.js'
];

for(const f of scriptFiles){
  const code=await readFile(path.join(root,f),'utf8');
  vm.runInContext(code,context,{filename:f});
}

const evalCtx=(expr)=>vm.runInContext(expr,context);

console.log('[TEST] Validating campaign resolution and patrol areas...');

// 1. Check US Pacific Campaign Profile
const usPacific=evalCtx('getCampaignProfile("us-pacific")');
assert.ok(usPacific,'getCampaignProfile("us-pacific") must return a profile');
assert.equal(usPacific.id,'us-pacific');
assert.equal(usPacific.commandName,'COMSUBPAC');
assert.equal(usPacific.patrolAreaIds.length,10,'us-pacific must have all 10 patrol areas');

const expectedPacificAreas=[
  'Solomon Sea','Bismarck Sea','Luzon Strait','Truk Approaches','Java Sea',
  'Yellow Sea','Kii Suido / Honshu Approaches','East China Sea / Formosa Approaches',
  'Sulu Sea / Tawi-Tawi','Kurile / Hokkaido Approaches'
];
for(const area of expectedPacificAreas){
  assert.ok(usPacific.patrolAreaIds.includes(area),`us-pacific missing area: ${area}`);
}

// 2. Check US Pacific Mission Profile & Harbor Strike isolation
assert.ok(usPacific.missionProfile,'us-pacific missionProfile must exist');
assert.ok(usPacific.missionProfile.missionPoolsByArea,'missionPoolsByArea must exist');
const trukPool=usPacific.missionProfile.missionPoolsByArea['Truk Approaches'];
assert.ok(trukPool&&trukPool.includes('HARBOR_STRIKE'),'Truk Approaches must have HARBOR_STRIKE');

const nonHarborAreas=['Yellow Sea','Kii Suido / Honshu Approaches','East China Sea / Formosa Approaches','Sulu Sea / Tawi-Tawi'];
for(const a of nonHarborAreas){
  const pool=usPacific.missionProfile.missionPoolsByArea[a];
  assert.ok(pool,`mission pool must exist for ${a}`);
  assert.ok(!pool.includes('HARBOR_STRIKE'),`Area ${a} must NOT have HARBOR_STRIKE`);
}

// 3. Check German Atlantic Campaign Profile
const gerAtlantic=evalCtx('getCampaignProfile("german-atlantic-1941")');
assert.ok(gerAtlantic,'getCampaignProfile("german-atlantic-1941") must return a profile');
assert.equal(gerAtlantic.id,'german-atlantic-1941');
assert.equal(gerAtlantic.commandName,'B.d.U.');
assert.equal(gerAtlantic.patrolAreaIds.length,4,'german-atlantic-1941 must have all 4 patrol areas');
assert.ok(gerAtlantic.patrolAreaIds.includes('Greenland–Iceland Gap'),'german-atlantic-1941 must include Greenland–Iceland Gap');

// 4. Validate all 6 Historical Scenarios reference valid patrol areas for their campaign
console.log('[TEST] Validating historical scenarios launch requirements...');
const scenarios=evalCtx('HISTORICAL_SCENARIOS');
assert.equal(scenarios.length,6,'HISTORICAL_SCENARIOS must have 6 scenarios');

const defaultGameIdentity=evalCtx('DEFAULT_GAME_IDENTITY');
const patrolAreas=evalCtx('PATROL_AREAS');

for(const s of scenarios){
  const campaignId=s.campaignProfileId||defaultGameIdentity.campaignProfileId;
  const campaign=evalCtx(`getCampaignProfile(${JSON.stringify(campaignId)})`);
  assert.ok(campaign,`Scenario ${s.id} campaign ${campaignId} missing`);
  assert.ok(patrolAreas[s.area],`Scenario ${s.id} area ${s.area} missing in PATROL_AREAS`);
  assert.ok(campaign.patrolAreaIds.includes(s.area),
    `Scenario ${s.id} area "${s.area}" does not belong to campaign "${campaign.id}". This would cause startNewPatrol() crash!`);
}

// 5. Validate Campaign Catalog completeness
console.log('[TEST] Validating campaign catalog...');
const catalogValidation=evalCtx('validateCampaignCatalog()');
assert.equal(catalogValidation.ok,true,`validateCampaignCatalog failed: ${catalogValidation.errors?.join('; ')}`);

// 6. Validate Selectable Campaign Definitions (Unbuilt theaters are PLANNED)
console.log('[TEST] Validating campaign selectable definitions...');
const selectableCampaigns=evalCtx('getSelectableCampaignDefinitions()');
const selectableIds=selectableCampaigns.map(c=>c.id);
assert.ok(selectableIds.includes('pacific-submarine-war'),'Pacific war must be playable');
assert.ok(selectableIds.includes('battle-atlantic'),'Battle of the Atlantic must be playable');
assert.ok(!selectableIds.includes('mediterranean-war'),'Mediterranean war must NOT be playable yet (PLANNED)');
assert.ok(!selectableIds.includes('baltic-war'),'Baltic war must NOT be playable yet (PLANNED)');
assert.ok(!selectableIds.includes('indian-ocean-war'),'Indian Ocean war must NOT be playable yet (PLANNED)');

// 7. Validate 6 National Station Presentation Profiles & Themes
console.log('[TEST] Validating 6 national station presentation profiles, palettes, and depth units...');
const nationalProfiles = [
  { id: 'us-fleet-submarine', theme: 'us-fleet', unit: 'FEET', suffix: 'ft', factor: 1 },
  { id: 'km-type-vii', theme: 'km-bakelite', unit: 'METER', suffix: 'm', factor: 0.3048 },
  { id: 'rn-submarine', theme: 'rn-admiralty', unit: 'FEET', suffix: 'ft', factor: 1 },
  { id: 'ijn-fleet-sub', theme: 'ijn-fleet', unit: 'METER', suffix: 'm', factor: 0.3048 },
  { id: 'rm-submarine', theme: 'rm-brass', unit: 'METRI', suffix: 'm', factor: 0.3048 },
  { id: 'vmf-submarine', theme: 'vmf-red', unit: 'METERS', suffix: 'm', factor: 0.3048 }
];

for (const spec of nationalProfiles) {
  const profile = evalCtx(`getStationPresentation(${JSON.stringify(spec.id)})`);
  assert.ok(profile, `Station presentation profile ${spec.id} must exist`);
  assert.equal(profile.theme, spec.theme, `Theme mismatch for ${spec.id}`);
  assert.equal(profile.depth?.unit, spec.unit, `Unit mismatch for ${spec.id}`);
  assert.equal(profile.depth?.suffix, spec.suffix, `Depth suffix mismatch for ${spec.id}`);
  assert.equal(profile.depth?.factor, spec.factor, `Depth factor mismatch for ${spec.id}`);

  // Validate palette tokens
  const pal = profile.palette;
  assert.ok(pal, `Palette missing for ${spec.id}`);
  for (const token of ['faceInner', 'faceOuter', 'bezel', 'ink', 'muted', 'dim', 'order', 'ok']) {
    assert.ok(pal[token], `Palette token ${token} missing for ${spec.id}`);
    assert.match(pal[token], /^#[0-9a-fA-F]{6}$/, `Invalid hex color for ${spec.id}.${token}: ${pal[token]}`);
  }

  // Validate formatting via playerDepthDisplay
  const mockState = { playerSub: { profileId: 'gato-silversides', presentation: profile } };
  const formatted = evalCtx(`playerDepthDisplay(${JSON.stringify(mockState)}, 100, 0)`);
  if (spec.factor === 1) {
    assert.equal(formatted, '100 ft', `Depth display mismatch for ${spec.id}`);
  } else {
    assert.equal(formatted, '30 m', `Depth display mismatch for ${spec.id}`);
  }

  // Validate Fase 3.2: Maritime terminology & multilingual orders
  assert.ok(profile.language, `Language code missing for ${spec.id}`);
  assert.ok(Array.isArray(profile.engineOrders), `engineOrders must be an array for ${spec.id}`);
  assert.equal(profile.engineOrders.length, 6, `engineOrders must contain exactly 6 bells for ${spec.id}`);
  profile.engineOrders.forEach((b, i) => assert.ok(b && typeof b === 'string', `engineOrder[${i}] invalid for ${spec.id}`));

  assert.ok(profile.gauges, `Gauges missing for ${spec.id}`);
  for (const gKey of ['course', 'depth', 'power', 'speed', 'rpm']) {
    assert.ok(profile.gauges[gKey], `Gauge label ${gKey} missing for ${spec.id}`);
  }
  assert.ok(Array.isArray(profile.gauges.courseLegends) && profile.gauges.courseLegends.length >= 2, `courseLegends missing for ${spec.id}`);

  assert.ok(profile.orders, `Orders missing for ${spec.id}`);
  for (const oKey of ['heading', 'depth', 'power', 'speed', 'engine', 'ballast', 'silent', 'alarm', 'surface', 'dive', 'crashDive', 'blow', 'bottom']) {
    assert.ok(profile.orders[oKey], `Order label ${oKey} missing for ${spec.id}`);
  }

  assert.ok(profile.roles, `Roles missing for ${spec.id}`);
  for (const rKey of ['captain', 'executive', 'engineer', 'radio']) {
    assert.ok(profile.roles[rKey], `Role label ${rKey} missing for ${spec.id}`);
  }

  assert.ok(profile.sensors, `Sensors missing for ${spec.id}`);
  assert.ok(profile.sensors.room && profile.sensors.operator, `Sensors labels missing for ${spec.id}`);

  assert.ok(profile.tubes, `Tubes missing for ${spec.id}`);
  for (const tKey of ['prefix', 'forward', 'aft', 'forwardTitle', 'aftTitle', 'flood', 'fire', 'roomTitle']) {
    assert.ok(profile.tubes[tKey], `Tube label ${tKey} missing for ${spec.id}`);
  }

  assert.ok(Array.isArray(profile.confirmations) && profile.confirmations.length >= 2, `Confirmations missing for ${spec.id}`);
}

// Distinct nationality verification: ensure no German bleed-through on Italian, Soviet or Japanese profiles
const rm = evalCtx(`getStationPresentation('rm-submarine')`);
assert.equal(rm.gauges.course, 'Rotta');
assert.equal(rm.gauges.depth, 'Profondità');
assert.equal(rm.engineOrders[0], 'ALT');
assert.equal(rm.engineOrders[4], 'AVANTI TUTTA');

const vmf = evalCtx(`getStationPresentation('vmf-submarine')`);
assert.equal(vmf.gauges.depth, 'Glubina');
assert.equal(vmf.gauges.power, 'Khod');
assert.equal(vmf.engineOrders[4], 'POLNYY');

const ijn = evalCtx(`getStationPresentation('ijn-fleet-sub')`);
assert.equal(ijn.gauges.course, 'Shinro');
assert.equal(ijn.gauges.depth, 'Shinkou');
assert.equal(ijn.engineOrders[0], 'TEISHI');
assert.equal(ijn.engineOrders[4], 'KAISHIN');

console.log('All campaign, mission profile, historical scenario, and national station presentation checks passed successfully!');
