// ═══════════════════════════════════════════════════ TORPEDO SPECS
const TORPEDO_SPECS = {
  mk14fast: {
    name:'Mark 14 Fast', speedKnots:46, maxRangeNm:4.9,
    warheadKg:292, reliability:0.73, acousticPenalty:0.08,
    dudChanceBase:0.25, // historical early-war dud rate
    note:'High speed, shorter range. Magnetic exploder unreliable.'
  },
  mk14slow: {
    name:'Mark 14 Slow', speedKnots:31, maxRangeNm:9,
    warheadKg:292, reliability:0.76, acousticPenalty:0.05,
    dudChanceBase:0.22,
    note:'Long range, slower. Better for distant shots.'
  },
  mk10: {
    name:'Mark 10', speedKnots:36, maxRangeNm:3.5,
    warheadKg:227, reliability:0.92, acousticPenalty:0.06,
    dudChanceBase:0.08, // older but more reliable
    note:'Reliable contact exploder. Shorter range.'
  },
  mk18: {
    name:'Mark 18 Electric', speedKnots:29, maxRangeNm:4,
    warheadKg:272, reliability:0.88, acousticPenalty:0.01, // nearly silent
    dudChanceBase:0.12,
    note:'Electric — near-silent. No wake. Slow.'
  }
};

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
  return ({mk14fast:'MK14F',mk14slow:'MK14S',mk10:'MK10',mk18:'MK18'})[specKey]||String(specKey||'TORP').toUpperCase();
}
function torpedoStoresStatus(state){
  const W=state?.weapons||{},tubes=Array.isArray(W.tubes)?W.tubes:[];
  const loaded=tubes.filter(t=>t.status!=='EMPTY');
  const ready=tubes.filter(t=>t.status==='READY').length;
  const byType={};
  for(const t of loaded){const k=t.specKey||state?.tdc?.torpedoSpecKey||'mk14fast';byType[k]=(byType[k]||0)+1;}
  const reserve=Math.max(0,Number(W.torpedoInventory)||0),total=reserve+loaded.length;
  const loadKey=state?.tdc?.torpedoSpecKey||'mk14fast';
  return{total,reserve,loaded:loaded.length,ready,byType,loadKey,loadShort:torpedoShortName(loadKey),
    loadedText:Object.entries(byType).map(([k,n])=>`${n}× ${torpedoShortName(k)}`).join(' · ')||'none'};
}
