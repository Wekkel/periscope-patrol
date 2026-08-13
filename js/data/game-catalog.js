// ═══════════════════════════════════════════════════ GAME / THEATER CATALOG
/* Phase 1 foundation — explicit identity without changing Pacific gameplay.

   Periscope Patrol originally encoded "US fleet submarine in the Pacific"
   implicitly across state, missions, sensors and UI. Atlantic work needs an
   explicit identity boundary first, but this catalog must stay configuration
   data rather than becoming a per-frame object graph.

   IMPORTANT:
   - `side` remains the cheap FRIENDLY/ENEMY relationship used by tactical AI.
   - faction/profile IDs describe historical identity and presentation.
   - hot runtime values are materialized into ordinary state once per patrol.
   - do not add Atlantic entries until the Pacific golden-master gate passes.
   - legacy saves may omit these additive IDs; resolveGameIdentity() deliberately
     falls back to the current Pacific defaults until the formal save migration. */

const PP_CATALOG_VERSION=2;

const THEATER_PROFILES=Object.freeze({
  pacific:Object.freeze({
    id:'pacific',
    displayName:'The Pacific',
    terrainProvider:'pacific',
    defaultCampaignId:'us-pacific'
  })
});

const FACTION_PROFILES=Object.freeze({
  usa:Object.freeze({id:'usa',displayName:'United States Navy',shortName:'USN'}),
  japan:Object.freeze({id:'japan',displayName:'Imperial Japanese Navy',shortName:'IJN'})
});

const SUBMARINE_PROFILES=Object.freeze({
  'gato-silversides':Object.freeze({
    id:'gato-silversides',
    displayName:'USS Silversides',
    className:'Gato class',
    hullNumber:'SS-236',
    factionId:'usa',
    theaterId:'pacific',

    // Static boat facts only. Mutable quantities such as current ammunition,
    // damage, RPM, battery and flooded-tube state always belong in runtime state.
    dimensions:Object.freeze({
      lengthFt:311.75,
      beamFt:27.3,
      verticalHalfFeet:9,
      massTons:2424
    }),
    weapons:Object.freeze({
      defaultTorpedoSpecKey:'mk14fast',
      torpedoInventory:16,
      tubes:Object.freeze([
        Object.freeze({id:1,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:2,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:3,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:4,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:5,pos:'AFT',gyroAngle:180}),
        Object.freeze({id:6,pos:'AFT',gyroAngle:180})
      ]),
      deckGun:Object.freeze({ammo:120}),
      aaGun:Object.freeze({ammo:1200})
    }),

    /* Presentation belongs to the historical boat/equipment profile; simulation
       code consumes generic capability IDs instead.  This is intentionally a
       tiny boundary: date/fit doctrine remains in historical-campaign.js until
       that later Phase-1 step has its own Pacific regression gate. */
    sensors:Object.freeze({
      passiveSound:Object.freeze({capabilityId:'PASSIVE_SOUND',label:'Passive Sound'}),
      activeEcho:Object.freeze({capabilityId:'ACTIVE_ECHO',label:'Active QC',shortLabel:'QC',fixLabel:'QC ECHO'}),
      surfaceSearchRadar:Object.freeze({
        capabilityId:'SURFACE_SEARCH_RADAR',label:'SJ Radar',shortLabel:'SJ',fixLabel:'SJ RADAR',statusLabel:'SJ surface-search radar',
        plotTitle:'SJ SURFACE-SEARCH RADAR',mastLabel:'SJ MAST'
      }),
      airWarningRadar:Object.freeze({capabilityId:'AIR_WARNING_RADAR',label:'SD Radar',shortLabel:'SD',crewManagedLabel:'SD air-search radar',statusLabel:'SD air-warning radar'})
    }),
    damage:Object.freeze({crushDepthFeet:420})
  })
});

/* Surface-vessel identity boundary. Runtime contacts historically used `type`
   for four different jobs at once: tactical class, historical identity, model
   selection and (indirectly) faction. Keep `type` as a save-compatible alias,
   but new architecture should ask for the specific field it actually needs.

   These profiles intentionally contain identity/presentation only. Existing
   authored speed, tonnage, sonar, damage and manoeuvre values stay where they
   are until those systems get their own regression-gated refactor. */
const VESSEL_PROFILES=Object.freeze({
  'jp-merchant':Object.freeze({id:'jp-merchant',factionId:'japan',gameplayType:'MERCHANT'}),
  'jp-coastal-merchant':Object.freeze({id:'jp-coastal-merchant',factionId:'japan',gameplayType:'MERCHANT',modelKey:'MERCHANT_COASTAL'}),
  'jp-transport':Object.freeze({id:'jp-transport',factionId:'japan',gameplayType:'MERCHANT',modelKey:'MERCHANT_ISLAND'}),
  'jp-tanker':Object.freeze({id:'jp-tanker',factionId:'japan',gameplayType:'TANKER',modelKey:'TANKER'}),
  'jp-destroyer':Object.freeze({id:'jp-destroyer',factionId:'japan',gameplayType:'DESTROYER',modelKey:'DESTROYER'}),
  'jp-legacy-escort':Object.freeze({id:'jp-legacy-escort',factionId:'japan',gameplayType:'ESCORT'}),
  'jp-legacy-warship':Object.freeze({id:'jp-legacy-warship',factionId:'japan',gameplayType:'WARSHIP'}),
  'jp-kaibokan':Object.freeze({id:'jp-kaibokan',factionId:'japan',gameplayType:'KAIBOKAN',modelKey:'KAIBOKAN'}),
  'jp-patrol-craft':Object.freeze({id:'jp-patrol-craft',factionId:'japan',gameplayType:'PATROL_CRAFT',modelKey:'PATROL_CRAFT'}),
  'jp-heavy-cruiser':Object.freeze({id:'jp-heavy-cruiser',factionId:'japan',gameplayType:'HEAVY_CRUISER',modelKey:'HEAVY_CRUISER'}),
  'jp-carrier':Object.freeze({id:'jp-carrier',factionId:'japan',gameplayType:'CARRIER',modelKey:'CARRIER'}),
  'jp-fishing-craft':Object.freeze({id:'jp-fishing-craft',factionId:null,gameplayType:'JUNK',modelKey:'JUNK'}),
  'us-coastal-transport':Object.freeze({id:'us-coastal-transport',factionId:'usa',gameplayType:'MERCHANT',modelKey:'MERCHANT_COASTAL'}),
  'us-life-raft':Object.freeze({id:'us-life-raft',factionId:'usa',gameplayType:'RAFT',modelKey:'RAFT'})
});

function getVesselProfile(profileId){return profileId?VESSEL_PROFILES[profileId]||null:null;}
function vesselGameplayType(v){return String(v?.gameplayType||v?.type||'MERCHANT').toUpperCase();}

function _legacyVesselModelKey(v){
  if(!v)return'MERCHANT';const type=vesselGameplayType(v);
  if(!['MERCHANT','TROOP'].includes(type))return type;
  const d=String(v.displayType||'').toUpperCase();
  if(d.includes('COASTAL'))return'MERCHANT_COASTAL';
  if(d.includes('TRANSPORT')||d.includes('TROOP'))return'MERCHANT_ISLAND';
  let h=0;for(const ch of String(v.id||v.name||''))h=(h*33+ch.charCodeAt(0))>>>0;
  return['MERCHANT','MERCHANT_FORECASTLE','MERCHANT_ISLAND'][h%3];
}
function vesselModelKey(v){
  const profile=getVesselProfile(v?.vesselProfileId);
  return v?.modelKey||profile?.modelKey||_legacyVesselModelKey(v);
}
function inferVesselFactionId(v,state=null){
  if(v?.factionId!==undefined)return v.factionId;
  const profile=getVesselProfile(v?.vesselProfileId);if(profile)return profile.factionId??null;
  if(v?.side==='FRIENDLY')return state?.campaign?.playerFactionId||DEFAULT_GAME_IDENTITY.playerFactionId;
  if(v?.side==='ENEMY'||v?.side==null){
    const campaign=getCampaignProfile(state?.campaign?.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId);
    return campaign?.opposingFactionIds?.[0]||'japan';
  }
  return null;
}
function inferVesselProfileId(v,state=null){
  if(v?.vesselProfileId)return v.vesselProfileId;
  const faction=inferVesselFactionId(v,state),type=vesselGameplayType(v),d=String(v?.displayType||v?.name||'').toUpperCase();
  if(type==='RAFT'&&faction==='usa')return'us-life-raft';
  if(faction==='usa'&&type==='MERCHANT')return'us-coastal-transport';
  if(type==='JUNK')return'jp-fishing-craft';
  if(faction!=='japan')return null;
  if(type==='CARRIER')return'jp-carrier';
  if(type==='HEAVY_CRUISER')return'jp-heavy-cruiser';
  if(type==='DESTROYER')return'jp-destroyer';
  if(type==='ESCORT')return'jp-legacy-escort';
  if(type==='WARSHIP')return'jp-legacy-warship';
  if(type==='KAIBOKAN')return'jp-kaibokan';
  if(type==='PATROL_CRAFT')return'jp-patrol-craft';
  if(type==='TANKER')return'jp-tanker';
  if(type==='MERCHANT'&&(d.includes('TRANSPORT')||d.includes('TROOP')))return'jp-transport';
  if(type==='MERCHANT'&&d.includes('COASTAL'))return'jp-coastal-merchant';
  if(type==='MERCHANT')return'jp-merchant';
  return null;
}
function materializeVesselIdentity(v,state=null,overrides=null){
  if(!v||typeof v!=='object')return v;const o=overrides||{},explicitProfile=getVesselProfile(o.vesselProfileId||v.vesselProfileId);
  const gameplayType=String(o.gameplayType||v.gameplayType||explicitProfile?.gameplayType||v.type||'MERCHANT').toUpperCase();
  if(!v.type)v.type=gameplayType; // legacy compatibility: existing systems still read this field.
  v.gameplayType=gameplayType;
  if(o.factionId!==undefined)v.factionId=o.factionId;
  else if(v.factionId===undefined)v.factionId=inferVesselFactionId(v,state);
  v.vesselProfileId=o.vesselProfileId||v.vesselProfileId||inferVesselProfileId(v,state);
  const profile=getVesselProfile(v.vesselProfileId);
  if(v.factionId===undefined)v.factionId=profile?.factionId??null;
  v.modelKey=o.modelKey||v.modelKey||profile?.modelKey||_legacyVesselModelKey(v);
  return v;
}

const CAMPAIGN_PROFILES=Object.freeze({
  'us-pacific':Object.freeze({
    id:'us-pacific',
    displayName:'US Pacific Submarine Campaign',
    theaterId:'pacific',
    playerFactionId:'usa',
    opposingFactionIds:Object.freeze(['japan']),
    submarineProfileId:'gato-silversides',
    commandName:'COMSUBPAC',
    defaultArea:'Solomon Sea',
    defaultStartDate:'1943-08-17'
  })
});

const DEFAULT_GAME_IDENTITY=Object.freeze({
  theaterId:'pacific',
  playerFactionId:'usa',
  campaignProfileId:'us-pacific',
  submarineProfileId:'gato-silversides'
});

function getCampaignProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return CAMPAIGN_PROFILES[profileId]||CAMPAIGN_PROFILES[DEFAULT_GAME_IDENTITY.campaignProfileId];
}

function getSubmarineProfile(profileId=DEFAULT_GAME_IDENTITY.submarineProfileId){
  return SUBMARINE_PROFILES[profileId]||SUBMARINE_PROFILES[DEFAULT_GAME_IDENTITY.submarineProfileId];
}


function getSubmarineSensorPresentation(profileId=DEFAULT_GAME_IDENTITY.submarineProfileId){
  const profile=getSubmarineProfile(profileId);
  return profile.sensors||SUBMARINE_PROFILES[DEFAULT_GAME_IDENTITY.submarineProfileId].sensors;
}

function getPlayerSensorPresentation(state=null){
  return getSubmarineSensorPresentation(state?.playerSub?.profileId||DEFAULT_GAME_IDENTITY.submarineProfileId);
}

function resolveGameIdentity(state=null){
  const c=state?.campaign||{},sub=state?.playerSub||{};
  return Object.freeze({
    theaterId:c.theaterId||DEFAULT_GAME_IDENTITY.theaterId,
    playerFactionId:c.playerFactionId||DEFAULT_GAME_IDENTITY.playerFactionId,
    campaignProfileId:c.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId,
    submarineProfileId:sub.profileId||DEFAULT_GAME_IDENTITY.submarineProfileId
  });
}

function validateGameIdentity(identity){
  const x=identity||DEFAULT_GAME_IDENTITY,errors=[];
  const theater=THEATER_PROFILES[x.theaterId];
  const faction=FACTION_PROFILES[x.playerFactionId];
  const campaign=CAMPAIGN_PROFILES[x.campaignProfileId];
  const sub=SUBMARINE_PROFILES[x.submarineProfileId];

  if(!theater)errors.push(`Unknown theater profile: ${x.theaterId}`);
  if(!faction)errors.push(`Unknown player faction: ${x.playerFactionId}`);
  if(!campaign)errors.push(`Unknown campaign profile: ${x.campaignProfileId}`);
  if(!sub)errors.push(`Unknown submarine profile: ${x.submarineProfileId}`);

  if(campaign&&campaign.theaterId!==x.theaterId)
    errors.push(`Campaign ${campaign.id} belongs to ${campaign.theaterId}, not ${x.theaterId}`);
  if(campaign&&campaign.playerFactionId!==x.playerFactionId)
    errors.push(`Campaign ${campaign.id} belongs to ${campaign.playerFactionId}, not ${x.playerFactionId}`);
  if(sub&&sub.factionId!==x.playerFactionId)
    errors.push(`Submarine ${sub.id} belongs to ${sub.factionId}, not ${x.playerFactionId}`);
  if(sub&&sub.theaterId!==x.theaterId)
    errors.push(`Submarine ${sub.id} belongs to ${sub.theaterId}, not ${x.theaterId}`);

  return{ok:errors.length===0,errors,identity:{...x}};
}
