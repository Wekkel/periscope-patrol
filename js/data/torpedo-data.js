// ═══════════════════════════════════════════════════ TORPEDO SPECS
const TORPEDO_SPECS = {
  mk14fast: {
    shortName:'MK14F', name:'Mark 14 Fast', speedKnots:46, maxRangeNm:4.9,
    warheadKg:292, reliability:0.73, acousticPenalty:0.08,
    dudChanceBase:0.25, contactExploderSquareHitPenalty:true, // historical early-war dud rate
    note:'High speed, shorter range. Magnetic exploder unreliable.'
  },
  mk14slow: {
    shortName:'MK14S', name:'Mark 14 Slow', speedKnots:31, maxRangeNm:9,
    warheadKg:292, reliability:0.76, acousticPenalty:0.05,
    dudChanceBase:0.22, contactExploderSquareHitPenalty:true,
    note:'Long range, slower. Better for distant shots.'
  },
  mk10: {
    shortName:'MK10', name:'Mark 10', speedKnots:36, maxRangeNm:3.5,
    warheadKg:227, reliability:0.92, acousticPenalty:0.06,
    dudChanceBase:0.08, // older but more reliable
    note:'Reliable contact exploder. Shorter range.'
  },
  mk18: {
    shortName:'MK18', name:'Mark 18 Electric', speedKnots:29, maxRangeNm:4,
    warheadKg:272, reliability:0.88, acousticPenalty:0.01, // nearly silent
    dudChanceBase:0.12, isElectric:true, visibleWake:false,
    note:'Electric — near-silent. No wake. Slow.'
  },
  /* Type VIIC 1941 vertical-slice weapons. Wartime British technical summaries
     give G7e ~30 kn / 5,400 yd and G7a fast setting ~44 kn / 6,500 yd. The
     ~280 kg warhead figure varies by source/definition; reliability/dud values
     below are provisional gameplay baselines pending the dedicated torpedo pass. */
  'g7e-t2': {
    shortName:'G7E', name:'G7e T2 Electric', speedKnots:30, maxRangeNm:2.67,
    warheadKg:280, reliability:0.86, acousticPenalty:0.01,
    dudChanceBase:0.14, isElectric:true, visibleWake:false,
    note:'Electric, trackless torpedo. 1941 Atlantic baseline.'
  },
  'g7a-t1-fast': {
    shortName:'G7A', name:'G7a T1 Fast', speedKnots:44, maxRangeNm:3.21,
    warheadKg:280, reliability:0.86, acousticPenalty:0.07,
    dudChanceBase:0.14, visibleWake:true,
    note:'Steam torpedo, fast setting. Visible track.'
  },
  'g7e-t3': {
    shortName:'T3', name:'G7e T3 Electric', speedKnots:30, maxRangeNm:2.70,
    warheadKg:280, reliability:0.91, acousticPenalty:0.01,
    dudChanceBase:0.09, isElectric:true, visibleWake:false,
    note:'Improved electric torpedo available from 1942.'
  }
};

function torpedoSpecKeysForState(state){
  const campaignId=state?.campaign?.campaignProfileId;
  const model=typeof getCampaignHistoricalModel==='function'?getCampaignHistoricalModel(campaignId):null;
  const keys=(model?.equipment?.torpedoes||[]).map(x=>x.specKey).filter(k=>TORPEDO_SPECS[k]);
  return keys.length?keys:Object.keys(TORPEDO_SPECS);
}
function torpedoOptionLabel(specKey){
  const sp=TORPEDO_SPECS[specKey];if(!sp)return String(specKey||'TORPEDO');
  return `${sp.name} — ${sp.speedKnots}kn / ${Number(sp.maxRangeNm).toFixed(sp.maxRangeNm%1?2:0)}nm`;
}


const DUD_MODES = {
  historical: 1.0,  // full historical dud rate
  reduced:    0.4,
  none:       0.0
};


// Compact stores readout used by the MAP HUD and touch/desktop attack panels.
// The game deliberately keeps reserve reloads as an arcade pool rather than a
// historically exact rack-by-rack magazine. Loaded tubes still retain their
// current specKey, so the player can always see what is actually in the boat.
function torpedoShortName(specKey){
  return TORPEDO_SPECS[specKey]?.shortName||String(specKey||'TORP').toUpperCase();
}
function torpedoStoresStatus(state){
  const W=state?.weapons||{},tubes=Array.isArray(W.tubes)?W.tubes:[];
  const loaded=tubes.filter(t=>t.status!=='EMPTY');
  const ready=tubes.filter(t=>t.status==='READY').length;
  const profile=typeof getSubmarineProfile==='function'?getSubmarineProfile(state?.playerSub?.profileId):null;
  const profileDefault=profile?.weapons?.defaultTorpedoSpecKey;
  const fallbackKey=state?.tdc?.torpedoSpecKey||(profileDefault&&TORPEDO_SPECS[profileDefault]?profileDefault:null);
  const byType={};
  for(const t of loaded){const k=t.specKey||fallbackKey;if(k)byType[k]=(byType[k]||0)+1;}
  const reserve=Math.max(0,Number(W.torpedoInventory)||0),total=reserve+loaded.length;
  const loadKey=fallbackKey;
  return{total,reserve,loaded:loaded.length,ready,byType,loadKey,loadShort:torpedoShortName(loadKey),
    loadedText:Object.entries(byType).map(([k,n])=>`${n}× ${torpedoShortName(k)}`).join(' · ')||'none'};
}
