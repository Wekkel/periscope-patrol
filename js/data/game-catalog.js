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

const PP_CATALOG_VERSION=6;

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
       code consumes generic capability IDs instead. Dated availability and
       performance live on the campaign historical model below. */
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

/* Historical campaign data belongs to the campaign profile, not to the
   generic simulation. These are deliberately broad gameplay bands inherited
   from the existing Pacific implementation; they are not a claim of exact
   per-boat refit dates. A future Atlantic campaign must provide its own model
   rather than adding German/Allied exceptions to historical-campaign.js. */
const US_PACIFIC_HISTORICAL_MODEL=Object.freeze({
  id:'us-pacific-history-v1',
  defaultDate:'1943-08-17',
  eraBands:Object.freeze([
    Object.freeze({before:19430101,label:'EARLY WAR'}),
    Object.freeze({before:19440101,label:'MID WAR'}),
    Object.freeze({label:'LATE WAR'})
  ]),
  torpedoDudBands:Object.freeze([
    Object.freeze({before:19430101,value:1.00}),
    Object.freeze({before:19430901,value:.78}),
    Object.freeze({before:19440101,value:.48}),
    Object.freeze({value:.26})
  ]),
  equipment:Object.freeze({
    sensors:Object.freeze({
      AIR_WARNING_RADAR:Object.freeze({
        availableFrom:19420401,
        refitMessage:'REFIT COMPLETE — SD air-warning radar fitted.'
      }),
      SURFACE_SEARCH_RADAR:Object.freeze({
        availableFrom:19420701,
        refitMessage:'REFIT COMPLETE — SJ surface-search radar fitted.',
        mastUpgradeMessage:'REFIT COMPLETE — improved SJ radar mast and display fitted.',
        performanceBands:Object.freeze([
          Object.freeze({before:19430101,rangeNm:5.4,errorFactor:1.35,sweepSec:2.8,mastDepthFt:12}),
          Object.freeze({before:19440101,rangeNm:6.8,errorFactor:1.00,sweepSec:2.2,mastDepthFt:12}),
          Object.freeze({rangeNm:8.5,errorFactor:.72,sweepSec:1.7,mastDepthFt:48})
        ])
      })
    }),
    radarFitLabelBands:Object.freeze([
      Object.freeze({before:19420401,label:'NO RADAR FIT'}),
      Object.freeze({before:19420701,label:'SD AIR WARNING'}),
      Object.freeze({before:19430101,label:'SD + EARLY SJ'}),
      Object.freeze({before:19440101,label:'SD + SJ'}),
      Object.freeze({label:'SD + IMPROVED SJ'})
    ]),
    torpedoes:Object.freeze([
      Object.freeze({specKey:'mk14fast'}),
      Object.freeze({specKey:'mk14slow'}),
      Object.freeze({specKey:'mk10'}),
      Object.freeze({specKey:'mk18',availableFrom:19430901,availabilityLabel:'MARK 18 AVAILABLE',refitMessage:'REFIT COMPLETE — Mark 18 electric torpedoes now available.'})
    ]),
    defaultTorpedoLoadLabel:'STEAM TORPEDO LOAD'
  }),
  /* These factors describe the existing broad war-progression model: player
     sound effectiveness, enemy ASW/air response and traffic composition. They
     are evaluated once when a patrol historical profile is materialized. */
  progressionBands:Object.freeze([
    Object.freeze({before:19430101,values:Object.freeze({
      soundFactor:.92,aswSkill:.76,sonarIntervalFactor:1.18,sonarErrorFactor:1.22,depthChargeErrorFactor:1.28,
      airThreatFactor:.72,trafficDensityFactor:1.12,merchantTonnageFactor:.92,merchantSpeedBonus:-.45,
      primaryMerchantCountFactor:1.08,surfaceOpportunity:1.22
    })}),
    Object.freeze({before:19440101,values:Object.freeze({
      soundFactor:1.00,aswSkill:1.00,sonarIntervalFactor:1.00,sonarErrorFactor:1.00,depthChargeErrorFactor:1.00,
      airThreatFactor:1.00,trafficDensityFactor:1.00,merchantTonnageFactor:1.00,merchantSpeedBonus:0,
      primaryMerchantCountFactor:1.00,surfaceOpportunity:1.00
    })}),
    Object.freeze({values:Object.freeze({
      soundFactor:1.08,aswSkill:1.18,sonarIntervalFactor:.86,sonarErrorFactor:.82,depthChargeErrorFactor:.82,
      airThreatFactor:1.28,trafficDensityFactor:.74,merchantTonnageFactor:1.14,merchantSpeedBonus:.65,
      primaryMerchantCountFactor:.82,surfaceOpportunity:.80
    })})
  ]),
  areaProgression:Object.freeze({
    'Truk Approaches':Object.freeze([
      Object.freeze({from:19440101,multiply:Object.freeze({airThreatFactor:1.16,aswSkill:1.08})}),
      Object.freeze({multiply:Object.freeze({airThreatFactor:1.05,aswSkill:1.08})})
    ]),
    'Luzon Strait':Object.freeze([
      Object.freeze({from:19440101,multiply:Object.freeze({aswSkill:1.08,merchantTonnageFactor:1.08,trafficDensityFactor:.92})})
    ]),
    'Java Sea':Object.freeze([
      Object.freeze({before:19430101,multiply:Object.freeze({surfaceOpportunity:1.12,airThreatFactor:.88})})
    ]),
    'Solomon Sea':Object.freeze([
      Object.freeze({before:19430101,multiply:Object.freeze({trafficDensityFactor:1.08})})
    ])
  })
});

/* Mission-critical convoy composition is campaign data. The simulation owns
   formation motion, ASW roles and tactical LOD; it must not know that the
   current enemy happens to use Marus, kaibokan or Japanese subchasers. Keep
   these templates immutable and materialize ordinary runtime contacts once
   when a patrol starts. */
const US_PACIFIC_PRIMARY_CONVOY_PROFILE=Object.freeze({
  id:'us-pacific-primary-convoy-v1',
  merchantTemplates:Object.freeze([
    Object.freeze({id:'M-01',name:'Merchant Maru',type:'MERCHANT',vesselProfileId:'jp-merchant',lengthYards:420,visualProfile:0.95,acousticBase:0.35,tonsFactor:4200}),
    Object.freeze({id:'M-02',name:'Tanker',type:'TANKER',vesselProfileId:'jp-tanker',lengthYards:520,visualProfile:1.1,acousticBase:0.45,tonsFactor:7800}),
    Object.freeze({id:'M-03',name:'Cargo Maru',type:'MERCHANT',vesselProfileId:'jp-merchant',lengthYards:380,visualProfile:0.9,acousticBase:0.32,tonsFactor:3800}),
    Object.freeze({id:'M-04',name:'Transport',type:'MERCHANT',vesselProfileId:'jp-transport',lengthYards:460,visualProfile:1.0,acousticBase:0.38,tonsFactor:5200})
  ]),
  escortTemplates:Object.freeze([
    Object.freeze({id:'E-01',name:'Escort Destroyer',type:'DESTROYER',vesselProfileId:'jp-destroyer',displayType:'DESTROYER',lengthYards:350,visualProfile:0.75,acousticBase:0.65,tonsFactor:1900,hasSonar:true}),
    Object.freeze({id:'E-02',name:'Kaibokan Escort',type:'KAIBOKAN',vesselProfileId:'jp-kaibokan',displayType:'KAIBOKAN ESCORT',lengthYards:280,visualProfile:0.65,acousticBase:0.55,tonsFactor:950,hasSonar:true}),
    Object.freeze({id:'E-03',name:'Escort Destroyer',type:'DESTROYER',vesselProfileId:'jp-destroyer',displayType:'DESTROYER',lengthYards:306,visualProfile:0.70,acousticBase:0.60,tonsFactor:1550,hasSonar:true}),
    Object.freeze({id:'E-04',name:'Subchaser',type:'PATROL_CRAFT',vesselProfileId:'jp-patrol-craft',displayType:'SUBCHASER',lengthYards:185,visualProfile:0.55,acousticBase:0.50,tonsFactor:480,hasSonar:true})
  ]),
  formationOffsets:Object.freeze([
    Object.freeze({fwd:0,side:0}),
    Object.freeze({fwd:-1.2,side:-0.8}),Object.freeze({fwd:-1.2,side:0.8}),
    Object.freeze({fwd:-2.4,side:-1.6}),Object.freeze({fwd:-2.4,side:1.6}),
    Object.freeze({fwd:-3.6,side:0})
  ])
});


/* Ambient/distant-world traffic is authored by the active campaign. The
   traffic director owns cheap abstract motion and tactical materialization;
   it must not know Pacific area names, Japanese vessel names, faction sides,
   base speeds or lane preferences. Manifest `style` values are deliberately
   small engine primitives, not a general-purpose content language. */
const US_PACIFIC_AMBIENT_TRAFFIC_PROFILE=Object.freeze({
  id:'us-pacific-ambient-traffic-v1',
  defaultDensity:8,minDensity:6,maxDensity:12,
  densityByArea:Object.freeze({
    'Java Sea':10,'Luzon Strait':11,'Truk Approaches':9,'Solomon Sea':9,'Bismarck Sea':8,'Yellow Sea':11,
    'Kii Suido / Honshu Approaches':11,'East China Sea / Formosa Approaches':10,'Sulu Sea / Tawi-Tawi':9,'Kurile / Hokkaido Approaches':7
  }),
  baseKinds:Object.freeze(['LONE_FREIGHTER','COASTAL_MERCHANT','SMALL_TANKER','FISHING_CRAFT','PATROL_CRAFT','SMALL_CONVOY']),
  taskGroup:Object.freeze({kind:'TASK_GROUP',chance:.32,replaceFromEnd:2,hashSuffix:'task-group'}),
  friendlyTraffic:Object.freeze({kind:'FRIENDLY_TRAFFIC',chance:.28,replaceFromEnd:1,hashSuffix:'friendly',excludedAreas:Object.freeze(['Truk Approaches','Kii Suido / Honshu Approaches'])}),
  kinds:Object.freeze({
    LONE_FREIGHTER:Object.freeze({label:'lone freighter',side:'ENEMY',speedBase:8,laneBase:0,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Lone Freighter',type:'MERCHANT',vesselProfileId:'jp-merchant',displayType:'FREIGHTER',length:Object.freeze({base:330,spread:80,hash:'len'}),tons:Object.freeze({base:3000,spread:1700,hash:'tons'})})})}),
    COASTAL_MERCHANT:Object.freeze({label:'coastal merchant traffic',side:'ENEMY',speedBase:6.5,laneBase:1.25,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Coastal Maru',type:'MERCHANT',vesselProfileId:'jp-coastal-merchant',displayType:'COASTAL FREIGHTER',length:Object.freeze({base:230,spread:70,hash:'len'}),tons:Object.freeze({base:1700,spread:1200,hash:'tons'})})})}),
    SMALL_TANKER:Object.freeze({label:'small tanker',side:'ENEMY',speedBase:8,laneBase:0,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Small Tanker',type:'TANKER',vesselProfileId:'jp-tanker',displayType:'SMALL TANKER',length:Object.freeze({base:330,spread:60,hash:'len'}),tons:Object.freeze({base:4300,spread:1700,hash:'tons'})})})}),
    FISHING_CRAFT:Object.freeze({label:'local fishing craft',side:'NEUTRAL',speedBase:4.5,laneBase:2.2,historicalMerchantSpeed:false,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Fishing Sampan',type:'JUNK',vesselProfileId:'jp-fishing-craft',displayType:'FISHING SAMPAN',length:Object.freeze({base:45,spread:30,hash:'len'}),tons:Object.freeze({base:70,spread:80,hash:'tons'}),visualProfile:.24,acousticBase:.07})})}),
    PATROL_CRAFT:Object.freeze({label:'patrol craft',side:'ENEMY',speedBase:14,laneBase:-1,historicalMerchantSpeed:false,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Patrol Craft',type:'PATROL_CRAFT',vesselProfileId:'jp-patrol-craft',displayType:'PATROL CRAFT',length:Object.freeze({base:120,spread:45,hash:'len'}),tons:Object.freeze({base:420,spread:350,hash:'tons'}),visualProfile:.50,acousticBase:.48})})}),
    SMALL_CONVOY:Object.freeze({label:'small convoy',side:'ENEMY',speedBase:8,laneBase:0,historicalMerchantSpeed:true,manifest:Object.freeze({
      style:'SMALL_CONVOY',countBase:2,countExtraHash:'count',countExtraAbove:.55,
      merchant:Object.freeze({namePrefix:'Merchant ',type:'MERCHANT',vesselProfileId:'jp-merchant',displayType:'FREIGHTER',length:Object.freeze({base:300,spread:110}),tons:Object.freeze({base:2500,spread:2300})}),
      tanker:Object.freeze({name:'Coastal Tanker',type:'TANKER',vesselProfileId:'jp-tanker',displayType:'TANKER',length:350,tons:5000,speedBias:-.3}),tankerIndex:1,tankerHash:'tanker',tankerAbove:.56,
      guardHash:'guard',guardAbove:.68,guardTypeHash:'guardType',guardTypeAbove:.55,
      guardHigh:Object.freeze({name:'Kaibokan Escort',type:'KAIBOKAN',vesselProfileId:'jp-kaibokan',displayType:'KAIBOKAN ESCORT',length:255,tons:900,speedBias:2.5,hasSonar:true}),
      guardLow:Object.freeze({name:'Convoy Patrol Craft',type:'PATROL_CRAFT',vesselProfileId:'jp-patrol-craft',displayType:'PATROL CRAFT',length:135,tons:550,speedBias:3,hasSonar:true})
    })}),
    TASK_GROUP:Object.freeze({label:'naval task group',side:'ENEMY',speedBase:17,laneBase:0,historicalMerchantSpeed:false,manifest:Object.freeze({
      style:'TASK_GROUP',fixed:Object.freeze([
        Object.freeze({suffix:'A',name:'Task Group Destroyer',type:'DESTROYER',vesselProfileId:'jp-destroyer',displayType:'DESTROYER',length:335,tons:1900,speedBias:4,hasSonar:true}),
        Object.freeze({suffix:'B',name:'Task Group Kaibokan',type:'KAIBOKAN',vesselProfileId:'jp-kaibokan',displayType:'KAIBOKAN ESCORT',length:285,tons:1250,speedBias:3,hasSonar:true})
      ]),coreHash:'capital',heavyAbove:.90,carrierAbove:.82,
      heavy:Object.freeze({suffix:'C',name:'Heavy Cruiser',type:'HEAVY_CRUISER',vesselProfileId:'jp-heavy-cruiser',displayType:'HEAVY CRUISER',length:665,tons:13500,speedBias:2}),
      carrier:Object.freeze({suffix:'C',name:'Light Carrier',type:'CARRIER',vesselProfileId:'jp-carrier',displayType:'LIGHT CARRIER',length:680,tons:18000,speedBias:1.5}),
      transportHash:'transport',transportAbove:.5,transport:Object.freeze({suffix:'C',name:'Fast Transport',type:'MERCHANT',vesselProfileId:'jp-transport',displayType:'FAST TRANSPORT',length:360,tons:3600,speedBias:1})
    })}),
    FRIENDLY_TRAFFIC:Object.freeze({label:'friendly coastal traffic',side:'FRIENDLY',speedBase:8,laneBase:-1.5,historicalMerchantSpeed:false,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Allied Coastal Transport',type:'MERCHANT',vesselProfileId:'us-coastal-transport',displayType:'ALLIED COASTAL TRANSPORT',length:280,tons:2200,visualProfile:.75,acousticBase:.24})})})
  })
});



/* Mission assignment and player-facing orders belong to the campaign profile.
   The mission framework below this data owns mechanics (intercept, lifeguard,
   minelaying, shadowing, etc.); it must not know Pacific area names, COMSUBPAC
   wording or which mission mix is appropriate to a specific theater. */
const US_PACIFIC_MISSION_PROFILE=Object.freeze({
  id:'us-pacific-missions-v1',
  defaultMissionType:'CONVOY_INTERDICTION',
  autoDescription:'One primary mission per patrol. AUTO chooses orders that suit the selected Pacific area.',
  definitions:Object.freeze({
    CONVOY_INTERDICTION:Object.freeze({title:'CONVOY INTERDICTION',reward:900,
      briefing:'Hunt enemy merchant traffic in the assigned patrol area. Locate the convoy, neutralize a meaningful share of shipping, survive the escort response and return.'}),
    HIGH_VALUE_INTERCEPT:Object.freeze({title:'HIGH VALUE INTERCEPT',reward:1700,
      briefing:'Intelligence places a high-value ship on a known shipping route. Reports are imperfect but the target is persistent; intercept, identify and destroy or mission-kill it.'}),
    RECONNAISSANCE:Object.freeze({title:'ANCHORAGE RECONNAISSANCE',reward:1500,
      briefing:'Approach the enemy anchorage, visually identify the assigned targets and withdraw. Weapons are discretionary; opening fire will compromise the reconnaissance.'}),
    LIFEGUARD:Object.freeze({title:'LIFEGUARD',reward:1900,
      briefing:'Take station near a scheduled carrier strike. Locate a downed airman with bridge watch or SJ radar, recover him on the surface, then return.'}),
    SPECIAL_TRANSPORT:Object.freeze({title:'SPECIAL TRANSPORT / COASTWATCHERS',reward:1750,
      briefing:'Make a night rendezvous close to enemy-held coast, remain surfaced and nearly stopped while the coastwatcher party and supplies go ashore, then clear the area.'}),
    MINELAYING:Object.freeze({title:'MINELAYING',reward:1650,
      briefing:'Reach the assigned shipping lane or harbor approach and lay the complete pattern. Mine release is automatic once the boat is correctly positioned, submerged, slow and aligned.'}),
    SHADOW_REPORT:Object.freeze({title:'SHADOW & REPORT',reward:1550,
      briefing:'Find the assigned convoy and shadow it without provoking the escort screen. Build a useful movement report, transmit it automatically when complete, then return.'}),
    ESCORT_HUNT:Object.freeze({title:'ESCORT HUNT',reward:2100,
      briefing:'COMSUBPAC has prioritized a named Japanese destroyer or escort. Locate, identify and sink or mission-kill that warship.'}),
    HARBOR_STRIKE:Object.freeze({title:'HARBOR STRIKE',reward:2600,
      briefing:'Penetrate the enemy anchorage, neutralize the assigned high-value unit and withdraw outside the harbor defenses.'}),
    RECON_INSERTION:Object.freeze({title:'RECON PARTY INSERTION',reward:2050,
      briefing:'Land a reconnaissance party on an enemy-held coast at night. Surface nearly stopped at the rendezvous, complete the transfer, then clear the coast.'}),
    RECON_EXTRACTION:Object.freeze({title:'RECON PARTY EXTRACTION',reward:2200,
      briefing:'Recover an Allied reconnaissance/coastwatcher party from enemy-held coast. Make the night pickup surfaced and nearly stopped, then escape before the patrol response closes.'}),
    WEATHER_AMBUSH:Object.freeze({title:'SQUALL AMBUSH',reward:1800,
      briefing:'Use poor visibility as concealment. Locate the convoy and score a hit while rain, squall or darkness materially reduces visual range.'})
  }),
  missionPoolsByArea:Object.freeze({
    'Truk Approaches':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','HARBOR_STRIKE','MINELAYING','LIFEGUARD','SHADOW_REPORT','WEATHER_AMBUSH']),
    'Java Sea':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','SPECIAL_TRANSPORT','RECON_INSERTION','MINELAYING','RECONNAISSANCE','WEATHER_AMBUSH','SHADOW_REPORT']),
    'Yellow Sea':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH']),
    'Kii Suido / Honshu Approaches':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','RECONNAISSANCE','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH']),
    'East China Sea / Formosa Approaches':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','SHADOW_REPORT','WEATHER_AMBUSH','LIFEGUARD','MINELAYING']),
    'Sulu Sea / Tawi-Tawi':Object.freeze(['CONVOY_INTERDICTION','ESCORT_HUNT','RECON_INSERTION','RECON_EXTRACTION','SPECIAL_TRANSPORT','SHADOW_REPORT','WEATHER_AMBUSH']),
    'Kurile / Hokkaido Approaches':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','LIFEGUARD','WEATHER_AMBUSH','SHADOW_REPORT'])
  }),
  defaultMissionPool:Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD','SPECIAL_TRANSPORT','MINELAYING','SHADOW_REPORT','ESCORT_HUNT','RECON_INSERTION','RECON_EXTRACTION','WEATHER_AMBUSH'])
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
    defaultStartDate:'1943-08-17',
    historicalModel:US_PACIFIC_HISTORICAL_MODEL,
    primaryConvoyProfile:US_PACIFIC_PRIMARY_CONVOY_PROFILE,
    ambientTrafficProfile:US_PACIFIC_AMBIENT_TRAFFIC_PROFILE,
    missionProfile:US_PACIFIC_MISSION_PROFILE
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

function getCampaignMissionProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  /* Deliberately no Pacific fallback for a known future campaign. A missing
     mission profile is an authoring error and must not leak COMSUBPAC orders
     or Pacific area selection into another theater. */
  return CAMPAIGN_PROFILES[profileId]?.missionProfile||null;
}

function getCampaignHistoricalModel(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return CAMPAIGN_PROFILES[profileId]?.historicalModel||null;
}

function getPrimaryConvoyProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  /* Do not fall back to Pacific for a known future campaign that forgot to
     author convoy data: that would silently spawn Japanese shipping in the
     Atlantic. Unknown IDs are already rejected by the identity validator. */
  return CAMPAIGN_PROFILES[profileId]?.primaryConvoyProfile||null;
}

function getAmbientTrafficProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  /* As with primary convoys, a future campaign must author its own ambient
     world. Never disguise missing Atlantic content with Pacific traffic. */
  return CAMPAIGN_PROFILES[profileId]?.ambientTrafficProfile||null;
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
