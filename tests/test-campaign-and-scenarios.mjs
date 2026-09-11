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

console.log('All campaign, mission profile, and historical scenario checks passed successfully!');
