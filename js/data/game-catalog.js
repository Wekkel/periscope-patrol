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

const PP_CATALOG_VERSION=1;

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
    damage:Object.freeze({crushDepthFeet:420})
  })
});

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
