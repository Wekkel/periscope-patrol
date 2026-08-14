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

const PP_CATALOG_VERSION=12;

/* Geography has one canonical owner. A family groups campaigns for navigation
   and presentation, but never causes its terrain to be loaded. In particular,
   Baltic is a European theater of its own: it is not copied into Pacific or
   Atlantic data merely because Soviet, German or British forces may appear. */
const THEATER_FAMILIES=Object.freeze({
  pacific:Object.freeze({id:'pacific',displayName:'Pacific family'}),
  europe:Object.freeze({id:'europe',displayName:'European waters'}),
  'indian-ocean':Object.freeze({id:'indian-ocean',displayName:'Indian Ocean family'})
});

const THEATER_PROFILES=Object.freeze({
  pacific:Object.freeze({
    id:'pacific',
    displayName:'The Pacific',
    familyId:'pacific',
    terrainProvider:'pacific',
    defaultCampaignId:'us-pacific'
  }),
  atlantic:Object.freeze({
    id:'atlantic',
    displayName:'The Atlantic',
    familyId:'europe',
    terrainProvider:'open-ocean',
    defaultCampaignId:'german-atlantic-1941'
  }),
  baltic:Object.freeze({id:'baltic',displayName:'The Baltic Sea',familyId:'europe',terrainProvider:'reserved',defaultCampaignId:null,status:'REFERENCE_ONLY'}),
  mediterranean:Object.freeze({id:'mediterranean',displayName:'The Mediterranean',familyId:'europe',terrainProvider:'reserved',defaultCampaignId:null,status:'REFERENCE_ONLY'}),
  'indian-ocean':Object.freeze({id:'indian-ocean',displayName:'The Indian Ocean',familyId:'indian-ocean',terrainProvider:'reserved',defaultCampaignId:null,status:'REFERENCE_ONLY'})
});

const REGION_PROFILES=Object.freeze({
  'pacific-ocean':Object.freeze({id:'pacific-ocean',theaterId:'pacific'}),
  'north-atlantic':Object.freeze({id:'north-atlantic',theaterId:'atlantic'}),
  'norwegian-arctic':Object.freeze({id:'norwegian-arctic',theaterId:'atlantic',presentationFamily:'atlantic'}),
  'baltic-sea':Object.freeze({id:'baltic-sea',theaterId:'baltic',canonicalTerrainOwner:true}),
  mediterranean:Object.freeze({id:'mediterranean',theaterId:'mediterranean'}),
  'indian-ocean':Object.freeze({id:'indian-ocean',theaterId:'indian-ocean'})
});

const FACTION_PROFILES=Object.freeze({
  usa:Object.freeze({id:'usa',displayName:'United States Navy',shortName:'USN'}),
  japan:Object.freeze({id:'japan',displayName:'Imperial Japanese Navy',shortName:'IJN'}),
  germany:Object.freeze({id:'germany',displayName:'Kriegsmarine',shortName:'KM'}),
  britain:Object.freeze({id:'britain',displayName:'Royal Navy',shortName:'RN'}),
  canada:Object.freeze({id:'canada',displayName:'Royal Canadian Navy',shortName:'RCN'}),
  soviet:Object.freeze({id:'soviet',displayName:'Soviet Navy',shortName:'VMF'})
});

/* Station presentation is intentionally data, not a theater switch. The
   selected profile is copied into patrol state once at the lifecycle boundary;
   renderers can then read cheap strings/numbers without resolving identity or
   walking the catalog every frame. Simulation remains in feet, knots and RPM. */
const STATION_PRESENTATION_PROFILES=Object.freeze({
  'us-fleet-submarine':Object.freeze({
    id:'us-fleet-submarine',theme:'us-fleet',language:'en-US',
    palette:Object.freeze({faceInner:'#0d2029',faceOuter:'#050f13',bezel:'#2f5f56',ink:'#dfeee8',muted:'#8fb3a8',order:'#f5c65c'}),
    depth:Object.freeze({factor:1,suffix:'ft',unit:'FEET',fine:'FINE',deep:'DEEP',scopeFeet:55,detentsDisplay:Object.freeze([0,55,100,150,200,250])}),
    gauges:Object.freeze({course:'Course',depth:'Depth',power:'Power',courseLegends:Object.freeze(['GYRO','REPEATER']),powerSurface:'DIESEL',powerSubmerged:'BATTERY',rpm:'RPM',speed:'KNOTS'}),
    orders:Object.freeze({heading:'Heading',depth:'Depth',power:'RPM',speed:'Speed',engine:'Engine',ballast:'Ballast',silent:'Silent',alarm:'ALARM'}),
    tubes:Object.freeze({prefix:'T',forward:'FWD',aft:'AFT',forwardTitle:'Fwd Tubes',aftTitle:'Aft Tubes',flood:'Flood',fire:'Fire',roomTitle:'Tubes'}),
    sensors:Object.freeze({room:'Sound Room',operator:'sound operator'}),
    roles:Object.freeze({captain:'Skipper',executive:'Executive Officer',engineer:'Chief of the Boat',radio:'Radioman'}),
    engineOrders:Object.freeze(['STOP','SLOW','2/3','STD','FULL','FLANK'])
  }),
  'km-type-vii':Object.freeze({
    id:'km-type-vii',theme:'km-bakelite',language:'de-DE',
    palette:Object.freeze({faceInner:'#171712',faceOuter:'#070806',bezel:'#5d5543',ink:'#e7e0c7',muted:'#aaa185',order:'#d6a84a'}),
    depth:Object.freeze({factor:.3048,suffix:'m',unit:'METER',fine:'FEIN',deep:'TIEF',scopeFeet:55,detentsDisplay:Object.freeze([0,20,40,60,80,100,120,140])}),
    gauges:Object.freeze({course:'Kurs',depth:'Tiefe',power:'Fahrt',courseLegends:Object.freeze(['KREISEL','KOMPASS']),powerSurface:'DIESEL',powerSubmerged:'E-MOTOR',rpm:'U/MIN',speed:'KNOTEN'}),
    orders:Object.freeze({heading:'Kurs',depth:'Tiefe',power:'U/min',speed:'Fahrt',engine:'Maschine',ballast:'Tauchzellen',silent:'Schleichfahrt',alarm:'ALARM'}),
    tubes:Object.freeze({prefix:'Rohr ',forward:'BUG',aft:'HECK',forwardTitle:'Bugrohre',aftTitle:'Heckrohr',flood:'Fluten',fire:'Los',roomTitle:'Torpedoraum'}),
    sensors:Object.freeze({room:'Horchraum',operator:'Horchoperator'}),
    roles:Object.freeze({captain:'Kaleu',executive:'I WO',engineer:'LI',radio:'Funker'}),
    engineOrders:Object.freeze(['STOP','LANGSAM','HALBE','GROSSE','VOLLE','ÄUSSERSTE'])
  })
});

const SUBMARINE_PROFILES=Object.freeze({
  'gato-silversides':Object.freeze({
    id:'gato-silversides',
    displayName:'USS Silversides',
    className:'Gato class',
    hullNumber:'SS-236',
    factionId:'usa',
    theaterId:'pacific',
    stationPresentationId:'us-fleet-submarine',

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
      deckGun:Object.freeze({ammo:120,label:'3-inch/50 deck gun',shortLabel:'3-IN/50',muzzleVelocityMS:820,maxRangeNm:14600/2025,reloadSec:1.35,audioPower:1}),
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
    /* These values are the existing lightweight gameplay model for Silversides,
       not a detailed diesel/electric plant simulation. They live on the boat
       profile so a Type VII does not inherit Gato speed/endurance by accident. */
    propulsion:Object.freeze({
      dieselCutoffFt:12,dieselRestartFt:8,maxSurfaceSpeedKn:18,maxSubmergedSpeedKn:8.5,interceptFlankSpeedKn:17.5,
      normalizedMaxRpm:450,rpmResponse:170,driveBankRpmCap:320,silentRpmCap:120,crashDiveRpmCap:220,
      driveBankSpeedFactor:.72,silentSpeedFactor:.72,
      fuel:Object.freeze({idlePctPerHour:.08,loadPctPerHour:3.0,generatorExtraPctPerHour:.35,emptySpeedFactor:.1}),
      battery:Object.freeze({
        chargeBasePctPerSec:.009,chargeLoadSquaredFactor:1.15,taperPower:3,taperWeight:.75,taperMin:.22,
        silentHotelPctPerHour:.90,hotelPctPerHour:1.25,propulsionPctPerHour:98.75,propulsionExponent:2.06,
        pumpPctPerHour:1.0,electricalDamageLoadFactor:.35,emptySpeedFactor:.05,emptyRpmFactor:.1
      })
    }),
    audio:Object.freeze({key:'US_FLEET_BOAT',electricPitch:1,dieselPitch:1,dieselLevel:1,hullMass:1,commandPitch:1}),
    damage:Object.freeze({crushDepthFeet:420})
  }),

  /* Phase 2 vertical-slice foundation. Technical dimensions, tube arrangement,
     maximum torpedo load and gun ammunition are sourced from contemporary
     Type VIIC handbooks / Allied examinations. Propulsion response, fuel and
     battery coefficients remain intentionally lightweight gameplay parameters;
     they are isolated here so later calibration cannot leak into the Gato.

     The German handbook states 100 m construction depth and a 105 m pressure-
     dock test, but does not publish one universal operational failure depth.
     `crushDepthFeet` therefore remains an explicit provisional gameplay limit,
     not a claim of a historically exact collapse depth. */
  'type-viic-1941':Object.freeze({
    id:'type-viic-1941',
    displayName:'Type VIIC U-boat',
    className:'Type VIIC',
    hullNumber:null,
    factionId:'germany',
    theaterId:'atlantic',
    stationPresentationId:'km-type-vii',
    // Renderer-facing identity only; simulation geometry continues to use the
    // authored dimensions above. This avoids teaching shared bridge/gun code
    // that `germany` implies one particular submarine hull.
    visualModelKey:'TYPE_VIIC_1941',
    dimensions:Object.freeze({lengthFt:220,beamFt:20,verticalHalfFeet:7.5,massTons:883}),
    weapons:Object.freeze({
      defaultTorpedoSpecKey:'g7e-t2',
      // Five loaded tubes + nine reserve weapons = the documented maximum 14.
      torpedoInventory:9,
      tubes:Object.freeze([
        Object.freeze({id:1,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:2,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:3,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:4,pos:'FWD',gyroAngle:0}),
        Object.freeze({id:5,pos:'AFT',gyroAngle:180})
      ]),
      deckGun:Object.freeze({ammo:205,label:'8.8 cm SK C/35 deck gun',shortLabel:'8.8 CM SK C/35',muzzleVelocityMS:700,maxRangeNm:12350/1852,reloadSec:1.5,audioPower:.96}),
      aaGun:Object.freeze({ammo:1500})
    }),
    sensors:Object.freeze({
      passiveSound:Object.freeze({capabilityId:'PASSIVE_SOUND',label:'GHG Hydrophones',shortLabel:'GHG'})
    }),
    propulsion:Object.freeze({
      dieselCutoffFt:12,dieselRestartFt:8,maxSurfaceSpeedKn:17.8,maxSubmergedSpeedKn:8.0,interceptFlankSpeedKn:17.2,
      normalizedMaxRpm:480,rpmResponse:180,driveBankRpmCap:340,silentRpmCap:120,crashDiveRpmCap:220,
      driveBankSpeedFactor:.72,silentSpeedFactor:.72,
      fuel:Object.freeze({idlePctPerHour:.08,loadPctPerHour:3.0,generatorExtraPctPerHour:.35,emptySpeedFactor:.1}),
      battery:Object.freeze({
        chargeBasePctPerSec:.009,chargeLoadSquaredFactor:1.15,taperPower:3,taperWeight:.75,taperMin:.22,
        silentHotelPctPerHour:.90,hotelPctPerHour:1.25,propulsionPctPerHour:98.75,propulsionExponent:2.06,
        pumpPctPerHour:1.0,electricalDamageLoadFactor:.35,emptySpeedFactor:.05,emptyRpmFactor:.1
      })
    }),
    audio:Object.freeze({key:'TYPE_VII',electricPitch:1.08,dieselPitch:1.13,dieselLevel:.92,hullMass:.88,commandPitch:1.08}),
    damage:Object.freeze({
      constructionDepthFeet:328,pressureDockTestDepthFeet:344,
      crushDepthFeet:500,crushDepthProvisional:true
    })
  })
});

/* Recognition/reference variants are deliberately separate from selectable
   boat profiles. P29 can therefore record real Type VII development without
   pretending that an unimplemented hull is already player-ready. Dates are
   capability gates, not cosmetic labels. */
const SUBMARINE_VARIANT_CATALOG=Object.freeze({
  'type-viib':Object.freeze({id:'type-viib',factionId:'germany',availableFrom:19380801,availableUntil:19440101,lengthFt:218.2,beamFt:20.3,surfaceSpeedKn:17.9,submergedSpeedKn:8,recognition:'Shorter saddle tanks; single stern tube; compact early Type VII tower',status:'REFERENCE_ONLY'}),
  'type-viic':Object.freeze({id:'type-viic',factionId:'germany',availableFrom:19400801,lengthFt:220.2,beamFt:20.3,surfaceSpeedKn:17.7,submergedSpeedKn:7.6,recognition:'Raised casing, saddle tanks and one external stern tube; 4+1 tubes',status:'PLAYABLE',submarineProfileId:'type-viic-1941'}),
  'type-viic-41':Object.freeze({id:'type-viic-41',factionId:'germany',availableFrom:19430801,lengthFt:220.2,beamFt:20.3,surfaceSpeedKn:17.7,submergedSpeedKn:7.6,recognition:'VIIC hull with strengthened pressure hull and late-war tower fits',status:'REFERENCE_ONLY'})
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
  'us-life-raft':Object.freeze({id:'us-life-raft',factionId:'usa',gameplayType:'RAFT',modelKey:'RAFT'}),

  // Phase-2 Atlantic visual identities. Gameplay class stays separate from
  // silhouette selection so later British/Canadian escort classes can share
  // ESCORT behaviour without sharing one hull.
  'uk-merchant-1941':Object.freeze({id:'uk-merchant-1941',factionId:'britain',gameplayType:'MERCHANT',modelKey:'ATLANTIC_FREIGHTER',availableFrom:19390903,speedKnots:Object.freeze([7,11]),dimensionsFt:Object.freeze({length:410,beam:56}),rarity:'COMMON',recognition:'Raised forecastle, aft island, two cargo holds'}),
  'uk-tramp-1941':Object.freeze({id:'uk-tramp-1941',factionId:'britain',gameplayType:'MERCHANT',modelKey:'ATLANTIC_TRAMP',availableFrom:19390903,speedKnots:Object.freeze([6,9]),dimensionsFt:Object.freeze({length:350,beam:50}),rarity:'COMMON',recognition:'Small aft bridge, single funnel, low cargo well'}),
  'uk-cargo-liner-1941':Object.freeze({id:'uk-cargo-liner-1941',factionId:'britain',gameplayType:'MERCHANT',modelKey:'ATLANTIC_CARGO_LINER',availableFrom:19390903,speedKnots:Object.freeze([10,16]),dimensionsFt:Object.freeze({length:455,beam:61}),rarity:'UNCOMMON',recognition:'Longer hull, central island and paired funnels'}),
  'uk-coaster-1941':Object.freeze({id:'uk-coaster-1941',factionId:'britain',gameplayType:'MERCHANT',modelKey:'ATLANTIC_COASTER',availableFrom:19390903,speedKnots:Object.freeze([6,9]),dimensionsFt:Object.freeze({length:260,beam:41}),rarity:'COMMON',recognition:'Short hull, single hold and low aft house'}),
  'uk-tanker-1941':Object.freeze({id:'uk-tanker-1941',factionId:'britain',gameplayType:'TANKER',modelKey:'ATLANTIC_TANKER',availableFrom:19390903,speedKnots:Object.freeze([7,12]),dimensionsFt:Object.freeze({length:485,beam:63}),rarity:'UNCOMMON',recognition:'Aft machinery island and exposed midships pipe deck'}),
  'uk-flower-corvette-1941':Object.freeze({id:'uk-flower-corvette-1941',factionId:'britain',gameplayType:'ESCORT',modelKey:'FLOWER_CORVETTE_1941',availableFrom:19400401,speedKnots:Object.freeze([12,16]),dimensionsFt:Object.freeze({length:205,beam:33}),rarity:'COMMON',armament:'1×4-in, light AA, depth charges',sensors:Object.freeze(['ASDIC']),recognition:'Short whaler hull, raised forecastle, single funnel and mast'}),
  'ca-flower-corvette-1941':Object.freeze({id:'ca-flower-corvette-1941',factionId:'canada',gameplayType:'ESCORT',modelKey:'FLOWER_CORVETTE_1941',availableFrom:19401101,speedKnots:Object.freeze([12,16]),dimensionsFt:Object.freeze({length:205,beam:33}),rarity:'COMMON',armament:'1×4-in, light AA, depth charges',sensors:Object.freeze(['ASDIC']),recognition:'RCN Flower-class; compact whaler hull and single funnel'}),
  'uk-town-destroyer-1941':Object.freeze({id:'uk-town-destroyer-1941',factionId:'britain',gameplayType:'DESTROYER',modelKey:'DESTROYER',availableFrom:19400909,speedKnots:Object.freeze([20,35]),dimensionsFt:Object.freeze({length:314,beam:31}),rarity:'UNCOMMON',armament:'4×4-in, torpedoes, depth charges',sensors:Object.freeze(['ASDIC']),recognition:'Flush deck, four funnels and narrow Great War destroyer hull'}),
  'uk-black-swan-sloop':Object.freeze({id:'uk-black-swan-sloop',factionId:'britain',gameplayType:'ESCORT',modelKey:'BLACK_SWAN_SLOOP',availableFrom:19390701,speedKnots:Object.freeze([15,20]),dimensionsFt:Object.freeze({length:299,beam:38.5}),rarity:'RARE',armament:'6×4-in dual-purpose, AA, depth charges',sensors:Object.freeze(['ASDIC']),recognition:'Long high forecastle, twin funnels and three enclosed twin mounts'}),
  'uk-river-frigate-1942':Object.freeze({id:'uk-river-frigate-1942',factionId:'britain',gameplayType:'ESCORT',modelKey:'RIVER_FRIGATE_1942',availableFrom:19420401,speedKnots:Object.freeze([15,20]),dimensionsFt:Object.freeze({length:301,beam:36.5}),rarity:'UNCOMMON',armament:'2×4-in, AA, depth charges',sensors:Object.freeze(['ASDIC','TYPE_271_RADAR']),recognition:'Long forecastle, two widely spaced guns and compact funnel'}),
  'uk-armed-trawler':Object.freeze({id:'uk-armed-trawler',factionId:'britain',gameplayType:'PATROL_CRAFT',modelKey:'ARMED_TRAWLER',availableFrom:19390903,speedKnots:Object.freeze([8,12]),dimensionsFt:Object.freeze({length:150,beam:27}),rarity:'UNCOMMON',armament:'1×4-in or 12-pdr, depth charges',sensors:Object.freeze(['ASDIC_OPTIONAL']),recognition:'Deep fishing hull, high bow and small aft working deck'})
});

/* Aircraft identity is shared by spawning, audio and the cheap vector model.
   The IWM catalogue confirms Hudson operations from Northern Ireland in May
   1941, Catalina service in Scotland in March 1941, and VLR Liberator Atlantic
   operations by 1943. No aircraft profile is selected outside its date band. */
const AIRCRAFT_PROFILES=Object.freeze({
  'raf-sunderland':Object.freeze({id:'raf-sunderland',factionId:'britain',name:'Short Sunderland',kind:'FLYING_BOAT',availableFrom:19390601,engines:4,spanM:34.4,lengthM:26.0,speedKnots:Object.freeze([145,183]),ordnance:'DEPTH_CHARGE',recognition:'High parasol wing, boat hull and four engines'}),
  'raf-hudson':Object.freeze({id:'raf-hudson',factionId:'britain',name:'Lockheed Hudson',kind:'BOMBER',availableFrom:19391201,engines:2,spanM:19.96,lengthM:13.51,speedKnots:Object.freeze([175,215]),ordnance:'DEPTH_CHARGE',recognition:'Twin-engine low wing with glazed nose and twin tail'}),
  'raf-catalina':Object.freeze({id:'raf-catalina',factionId:'britain',name:'Consolidated Catalina',kind:'FLYING_BOAT',availableFrom:19410301,engines:2,spanM:31.7,lengthM:19.5,speedKnots:Object.freeze([105,170]),ordnance:'DEPTH_CHARGE',recognition:'High wing, boat hull and retracting wingtip floats'}),
  'raf-wellington-leigh':Object.freeze({id:'raf-wellington-leigh',factionId:'britain',name:'Vickers Wellington',kind:'BOMBER',availableFrom:19420601,engines:2,spanM:26.3,lengthM:19.7,speedKnots:Object.freeze([180,220]),ordnance:'DEPTH_CHARGE',recognition:'Twin-engine mid-wing bomber; radar/Leigh Light fit'}),
  'raf-vlr-liberator':Object.freeze({id:'raf-vlr-liberator',factionId:'britain',name:'Very Long Range Liberator',kind:'BOMBER',availableFrom:19430301,engines:4,spanM:33.5,lengthM:20.6,speedKnots:Object.freeze([190,250]),ordnance:'DEPTH_CHARGE',recognition:'Four engines, Davis wing and twin oval tail fins'}),
  'luftwaffe-fw200':Object.freeze({id:'luftwaffe-fw200',factionId:'germany',name:'Focke-Wulf Fw 200',kind:'BOMBER',availableFrom:19400601,engines:4,spanM:32.9,lengthM:23.5,speedKnots:Object.freeze([180,225]),ordnance:'BOMB',recognition:'Long four-engine airliner-derived maritime patrol aircraft'}),
  'luftwaffe-ju88':Object.freeze({id:'luftwaffe-ju88',factionId:'germany',name:'Junkers Ju 88',kind:'BOMBER',availableFrom:19390901,engines:2,spanM:20.0,lengthM:14.4,speedKnots:Object.freeze([220,270]),ordnance:'BOMB',recognition:'Twin-engine bomber with glazed nose and single fin'})
});
function getAircraftProfile(profileId){return profileId?AIRCRAFT_PROFILES[profileId]||null:null;}
function historicalDateKey(value){return Number(String(value||'').replace(/[^0-9]/g,'').slice(0,8).padEnd(8,'0'))||0;}
function historicalTemplateAvailable(template,date){const key=historicalDateKey(date),profile=getVesselProfile(template?.vesselProfileId)||getAircraftProfile(template?.aircraftProfileId);return(!template?.availableFrom||key>=template.availableFrom)&&(!template?.availableUntil||key<template.availableUntil)&&(!profile?.availableFrom||key>=profile.availableFrom)&&(!profile?.availableUntil||key<profile.availableUntil);}

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
    return campaign?.opposingFactionIds?.[0]||null;
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

/* First Atlantic historical slice: deliberately narrow, late 1941. This is
   enough to prove a German campaign/boat can materialize without borrowing US
   equipment. Convoy doctrine, Allied escorts and aircraft are authored in later
   Phase-2 patches rather than guessed here. */
const GERMAN_ATLANTIC_1941_HISTORICAL_MODEL=Object.freeze({
  id:'german-atlantic-1941-history-v1',
  defaultDate:'1941-09-01',
  eraBands:Object.freeze([
    Object.freeze({before:19420101,label:'ATLANTIC 1941'}),
    Object.freeze({from:19420101,before:19430101,label:'ATLANTIC 1942'}),
    Object.freeze({from:19430101,before:19440101,label:'ATLANTIC 1943'}),
    Object.freeze({from:19440101,label:'ATLANTIC 1944'})
  ]),
  // Reliability calibration remains a later research/gameplay task. The model
  // keeps the neutral factor so individual torpedo specs own the current baseline.
  torpedoDudBands:Object.freeze([Object.freeze({value:1.00})]),
  equipment:Object.freeze({
    sensors:Object.freeze({}),
    radarFitLabelBands:Object.freeze([Object.freeze({label:'NO RADAR FIT'})]),
    torpedoes:Object.freeze([
      Object.freeze({specKey:'g7e-t2'}),
      Object.freeze({specKey:'g7a-t1-fast'}),
      Object.freeze({specKey:'g7e-t3',availableFrom:19420101,availabilityLabel:'G7E T3 AVAILABLE',refitMessage:'TORPEDO REFIT — improved G7e T3 electric torpedoes are now available.'})
    ]),
    defaultTorpedoLoadLabel:'G7E / G7A LOAD'
  }),
  progressionBands:Object.freeze([
    Object.freeze({before:19420101,values:Object.freeze({soundFactor:1.00,aswSkill:.88,sonarIntervalFactor:1.12,sonarErrorFactor:1.12,depthChargeErrorFactor:1.16,airThreatFactor:.48,trafficDensityFactor:1.04,merchantTonnageFactor:.96,merchantSpeedBonus:-.15,primaryMerchantCountFactor:1.00,surfaceOpportunity:1.18,hfdfRisk:.06})}),
    Object.freeze({from:19420101,before:19430101,values:Object.freeze({soundFactor:1.00,aswSkill:1.00,sonarIntervalFactor:1.00,sonarErrorFactor:1.00,depthChargeErrorFactor:1.00,airThreatFactor:.72,trafficDensityFactor:1.00,merchantTonnageFactor:1.00,merchantSpeedBonus:0,primaryMerchantCountFactor:1.00,surfaceOpportunity:1.00,hfdfRisk:.16})}),
    Object.freeze({from:19430101,before:19440101,values:Object.freeze({soundFactor:1.00,aswSkill:1.12,sonarIntervalFactor:.88,sonarErrorFactor:.88,depthChargeErrorFactor:.88,airThreatFactor:1.18,trafficDensityFactor:.92,merchantTonnageFactor:1.04,merchantSpeedBonus:.18,primaryMerchantCountFactor:1.00,surfaceOpportunity:.78,hfdfRisk:.32})}),
    Object.freeze({from:19440101,values:Object.freeze({soundFactor:1.00,aswSkill:1.20,sonarIntervalFactor:.80,sonarErrorFactor:.80,depthChargeErrorFactor:.80,airThreatFactor:1.34,trafficDensityFactor:.82,merchantTonnageFactor:1.08,merchantSpeedBonus:.35,primaryMerchantCountFactor:.92,surfaceOpportunity:.62,hfdfRisk:.45})})
  ]),
  areaProgression:Object.freeze({})
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


/* First playable-world Atlantic content. The 1941 slice is intentionally a
   representative convoy rather than a reconstruction of one named HX/SC
   sailing. U-boat KTBs repeatedly record convoy speeds around 8 knots; the
   Flower class is documented as a core Atlantic close escort. Exact merchant
   hull mix and escort-group composition remain gameplay-authored until a later
   named-convoy scenario needs stricter historical reconstruction. */
const GERMAN_ATLANTIC_1941_PRIMARY_CONVOY_PROFILE=Object.freeze({
  id:'german-atlantic-1941-primary-convoy-v1',
  merchantTemplates:Object.freeze([
    Object.freeze({id:'AM-01',name:'British Freighter',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_FREIGHTER',side:'ENEMY',displayType:'FREIGHTER',lengthYards:410,visualProfile:.94,acousticBase:.34,tonsFactor:4800}),
    Object.freeze({id:'AM-02',name:'Atlantic Tanker',type:'TANKER',vesselProfileId:'uk-tanker-1941',modelKey:'ATLANTIC_TANKER',side:'ENEMY',displayType:'TANKER',lengthYards:500,visualProfile:1.08,acousticBase:.44,tonsFactor:7200}),
    Object.freeze({id:'AM-03',name:'Tramp Steamer',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_TRAMP',side:'ENEMY',displayType:'FREIGHTER',lengthYards:350,visualProfile:.86,acousticBase:.30,tonsFactor:3300}),
    Object.freeze({id:'AM-04',name:'Cargo Liner',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_CARGO_LINER',side:'ENEMY',displayType:'CARGO SHIP',lengthYards:455,visualProfile:1.00,acousticBase:.37,tonsFactor:5900}),
    Object.freeze({id:'AM-05',name:'British Freighter',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_FREIGHTER',side:'ENEMY',displayType:'FREIGHTER',lengthYards:390,visualProfile:.91,acousticBase:.33,tonsFactor:4200}),
    Object.freeze({id:'AM-06',name:'Atlantic Tanker',type:'TANKER',vesselProfileId:'uk-tanker-1941',modelKey:'ATLANTIC_TANKER',side:'ENEMY',displayType:'TANKER',lengthYards:470,visualProfile:1.04,acousticBase:.42,tonsFactor:6400}),
    Object.freeze({id:'AM-07',name:'Coaster in Convoy',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_COASTER',side:'ENEMY',displayType:'SMALL FREIGHTER',lengthYards:325,visualProfile:.80,acousticBase:.27,tonsFactor:2700}),
    Object.freeze({id:'AM-08',name:'Cargo Steamer',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_TRAMP',side:'ENEMY',displayType:'CARGO SHIP',lengthYards:405,visualProfile:.93,acousticBase:.34,tonsFactor:4600}),
    Object.freeze({id:'AM-09',name:'British Freighter',type:'MERCHANT',vesselProfileId:'uk-merchant-1941',modelKey:'ATLANTIC_FREIGHTER',side:'ENEMY',displayType:'FREIGHTER',lengthYards:435,visualProfile:.97,acousticBase:.36,tonsFactor:5300})
  ]),
  escortTemplates:Object.freeze([
    Object.freeze({id:'AE-01',name:'Flower-class Corvette',type:'ESCORT',vesselProfileId:'uk-flower-corvette-1941',side:'ENEMY',displayType:'FLOWER-CLASS CORVETTE',lengthYards:205,visualProfile:.58,acousticBase:.52,tonsFactor:925,hasSonar:true}),
    Object.freeze({id:'AE-02',name:'RCN Flower-class Corvette',type:'ESCORT',vesselProfileId:'ca-flower-corvette-1941',side:'ENEMY',displayType:'RCN FLOWER-CLASS CORVETTE',lengthYards:205,visualProfile:.58,acousticBase:.52,tonsFactor:925,hasSonar:true}),
    Object.freeze({id:'AE-03',name:'Town-class Destroyer',type:'DESTROYER',vesselProfileId:'uk-town-destroyer-1941',side:'ENEMY',displayType:'TOWN-CLASS DESTROYER',lengthYards:314,visualProfile:.72,acousticBase:.68,tonsFactor:1200,hasSonar:true}),
    Object.freeze({id:'AE-04',name:'Black Swan-class Sloop',type:'ESCORT',vesselProfileId:'uk-black-swan-sloop',side:'ENEMY',displayType:'BLACK SWAN-CLASS SLOOP',lengthYards:299,visualProfile:.69,acousticBase:.57,tonsFactor:1250,hasSonar:true}),
    Object.freeze({id:'AE-05',name:'Armed Trawler',type:'PATROL_CRAFT',vesselProfileId:'uk-armed-trawler',side:'ENEMY',displayType:'ARMED TRAWLER',lengthYards:150,visualProfile:.44,acousticBase:.42,tonsFactor:520,hasSonar:true}),
    Object.freeze({id:'AE-06',name:'River-class Frigate',type:'ESCORT',vesselProfileId:'uk-river-frigate-1942',side:'ENEMY',displayType:'RIVER-CLASS FRIGATE',lengthYards:301,visualProfile:.70,acousticBase:.60,tonsFactor:1370,hasSonar:true})
  ]),
  formationOffsets:Object.freeze([
    Object.freeze({fwd:0,side:0}),
    Object.freeze({fwd:0,side:-.92}),Object.freeze({fwd:0,side:.92}),
    Object.freeze({fwd:-1.05,side:-.92}),Object.freeze({fwd:-1.05,side:0}),Object.freeze({fwd:-1.05,side:.92}),
    Object.freeze({fwd:-2.10,side:-.92}),Object.freeze({fwd:-2.10,side:0}),Object.freeze({fwd:-2.10,side:.92})
  ]),
  /* Atlantic convoy character is authored here, not hidden in shared motion.
     Jitter is materialized once per patrol so saves remain stable and the hot
     loop only reads ordinary numeric state.  One slow aft merchant may become
     a natural straggler; damage can still create additional stragglers through
     the existing shared ship-damage thresholds. */
  worldDynamics:Object.freeze({
    stationJitterFwdNm:.10,stationJitterSideNm:.075,
    stationKeepingMin:.72,stationKeepingSpread:.24,
    headingWanderDeg:2.4,headingWanderPeriodSec:150,
    naturalStraggler:Object.freeze({eligibleIndices:Object.freeze([6,7,8]),chance:.72,initialLagNm:.52,speedBiasKn:-.38}),
    escortGuardNaturalStragglers:true
  })
});

/* Atlantic independents and minor groups remain cheap abstract route records
   until they enter the tactical bubble. */
const GERMAN_ATLANTIC_1941_AMBIENT_TRAFFIC_PROFILE=Object.freeze({
  id:'german-atlantic-ambient-traffic-v2',defaultDensity:5,minDensity:3,maxDensity:7,
  densityByArea:Object.freeze({'North Atlantic Convoy Lanes':5,'Western Approaches':7,'Greenland–Iceland Gap':4}),
  baseKinds:Object.freeze(['LONE_FREIGHTER','INDEPENDENT_TANKER','SLOW_STRAGGLER','SMALL_CONVOY','LONE_FREIGHTER']),
  kinds:Object.freeze({
    LONE_FREIGHTER:Object.freeze({label:'independent freighter',side:'ENEMY',speedBase:8,laneBase:1.6,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Independent Freighter',type:'MERCHANT',vesselProfileId:'uk-tramp-1941',displayType:'TRAMP STEAMER',length:Object.freeze({base:330,spread:105,hash:'len'}),tons:Object.freeze({base:2700,spread:2600,hash:'tons'})})})}),
    INDEPENDENT_TANKER:Object.freeze({label:'independent tanker',side:'ENEMY',speedBase:8.2,laneBase:-2.0,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Independent Tanker',type:'TANKER',vesselProfileId:'uk-tanker-1941',displayType:'ATLANTIC TANKER',length:Object.freeze({base:405,spread:95,hash:'len'}),tons:Object.freeze({base:5200,spread:2700,hash:'tons'})})})}),
    SLOW_STRAGGLER:Object.freeze({label:'unescorted slow freighter',side:'ENEMY',speedBase:6.4,laneBase:2.8,historicalMerchantSpeed:true,manifest:Object.freeze({style:'SINGLE',member:Object.freeze({name:'Slow Straggler',type:'MERCHANT',vesselProfileId:'uk-coaster-1941',displayType:'SMALL FREIGHTER',length:Object.freeze({base:245,spread:95,hash:'len'}),tons:Object.freeze({base:1500,spread:1900,hash:'tons'})})})}),
    SMALL_CONVOY:Object.freeze({label:'small dispersed convoy',side:'ENEMY',speedBase:7.6,laneBase:-1.1,historicalMerchantSpeed:true,manifest:Object.freeze({
      style:'SMALL_CONVOY',countBase:2,countExtraHash:'count',countExtraAbove:.50,
      merchant:Object.freeze({namePrefix:'Convoy Freighter ',type:'MERCHANT',vesselProfileId:'uk-cargo-liner-1941',displayType:'CARGO SHIP',length:Object.freeze({base:320,spread:120}),tons:Object.freeze({base:2600,spread:3200})}),
      tanker:Object.freeze({name:'Convoy Tanker',type:'TANKER',vesselProfileId:'uk-tanker-1941',displayType:'TANKER',length:455,tons:6100,speedBias:-.2}),tankerIndex:1,tankerHash:'tanker',tankerAbove:.56,
      guardHash:'guard',guardAbove:.62,guardTypeHash:'guardType',guardTypeAbove:.46,
      guardHigh:Object.freeze({name:'Flower-class Escort',type:'ESCORT',vesselProfileId:'uk-flower-corvette-1941',displayType:'FLOWER-CLASS CORVETTE',length:205,tons:925,speedBias:2.8,hasSonar:true}),
      guardLow:Object.freeze({name:'Flower-class Escort',type:'ESCORT',vesselProfileId:'uk-flower-corvette-1941',displayType:'FLOWER-CLASS CORVETTE',length:205,tons:925,speedBias:2.8,hasSonar:true})
    })})
  })
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
  defaultMissionPool:Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD','SPECIAL_TRANSPORT','MINELAYING','SHADOW_REPORT','ESCORT_HUNT','RECON_INSERTION','RECON_EXTRACTION','WEATHER_AMBUSH']),

  /* Concrete mission actors belong to campaign content, not mission mechanics.
     Keep these specs deliberately literal: Phase 1 is moving existing Pacific
     authorship behind a campaign boundary, not inventing a generic scenario DSL. */
  content:Object.freeze({
    highValueIntercept:Object.freeze({
      variants:Object.freeze([
        Object.freeze({below:.46,kind:'TANKER',vessel:Object.freeze({name:'Fleet Oiler',type:'TANKER',gameplayType:'TANKER',vesselProfileId:'jp-tanker',modelKey:'TANKER',displayType:'FLEET OILER',lengthYards:560,tonsFactor:9200,visualProfile:1.16})}),
        Object.freeze({below:.82,kind:'TRANSPORT',vessel:Object.freeze({name:'Army Transport',type:'MERCHANT',gameplayType:'MERCHANT',vesselProfileId:'jp-transport',modelKey:'MERCHANT_ISLAND',displayType:'TROOP TRANSPORT',lengthYards:500,tonsFactor:7600,visualProfile:1.04})}),
        Object.freeze({kind:'CARRIER',vessel:Object.freeze({name:'Light Carrier',type:'CARRIER',gameplayType:'CARRIER',vesselProfileId:'jp-carrier',modelKey:'CARRIER',displayType:'LIGHT CARRIER',lengthYards:680,tonsFactor:18000,visualProfile:1.34,hasSonar:false})})
      ])
    }),
    reconnaissance:Object.freeze({
      preferredExistingIdsByArea:Object.freeze({'Truk Approaches':Object.freeze(['H-02','H-03'])}),
      fallbackTargets:Object.freeze([
        Object.freeze({id:'REC-01',name:'Naval Auxiliary',type:'MERCHANT',vesselProfileId:'jp-merchant',displayType:'NAVAL AUXILIARY',lengthYards:430,tonsFactor:4700,visualProfile:.95,acousticBase:.08}),
        Object.freeze({id:'REC-02',name:'Army Transport',type:'MERCHANT',vesselProfileId:'jp-transport',displayType:'TROOP TRANSPORT',lengthYards:490,tonsFactor:7100,visualProfile:.95,acousticBase:.08})
      ])
    }),
    escortHunt:Object.freeze({
      preferredGameplayTypes:Object.freeze(['DESTROYER']),
      fallbackTarget:Object.freeze({id:'EH-01',name:'Named Fleet Destroyer',type:'DESTROYER',vesselProfileId:'jp-destroyer',displayType:'DESTROYER',lengthYards:350,tonsFactor:1900,visualProfile:.75,acousticBase:.68,hasSonar:true,side:'ENEMY',speedKnots:18,baseSpeed:18,desiredSpeed:18,convoyId:'MAIN',convoyRole:'ESCORT',formationIndex:99,screenRole:'ROAMING_SCOUT',aswRole:'SCREEN',dcRemaining:38}),
      targetNamesByGameplayType:Object.freeze({DESTROYER:'Named Fleet Destroyer',default:'Named Kaibokan Escort'})
    }),
    harborStrike:Object.freeze({
      preferredGameplayTypes:Object.freeze(['CARRIER','HEAVY_CRUISER']),
      fallbackTarget:Object.freeze({id:'HS-01',name:'Anchorage Naval Auxiliary',type:'MERCHANT',vesselProfileId:'jp-merchant',displayType:'NAVAL AUXILIARY',lengthYards:455,tonsFactor:5600,visualProfile:1.0,acousticBase:.05,side:'ENEMY',speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyRole:'ANCHORAGE',convoyId:'HARBOR_STRIKE'})
    }),
    lifeguard:Object.freeze({
      survivor:Object.freeze({name:'Downed Airman',type:'RAFT',vesselProfileId:'us-life-raft',displayType:'LIFE RAFT',lengthYards:7,tonsFactor:0,visualProfile:.12,acousticBase:0,side:'FRIENDLY',speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyId:'LIFEGUARD',convoyRole:'SURVIVOR',missionRole:'SURVIVOR'}),
      airmanDownLog:'Carrier strike reports an airman down in the lifeguard sector.',
      airmanDownNotice:'LIFEGUARD — AIRMAN DOWN. Search the assigned sector by bridge watch or SJ radar.',
      locatedNotice:'LIFEGUARD — LIFE RAFT LOCATED. Close surfaced and slow for recovery.',
      stationPrefix:'LIFEGUARD STATION — on station. Carrier strike expected in about ',
      stationSuffix:' minutes.'
    })
  })
});


/* First Atlantic gameplay loop: the player acts as contact keeper rather than
   immediately treating every convoy sighting as a torpedo solution. The
   mechanics remain shared in mission-framework.js; this profile only authors
   B.d.U. wording, confidence/hold thresholds and the lightweight abstract
   response from other U-boats. No tactical wolfpack boats are spawned. */
const GERMAN_ATLANTIC_1941_MISSION_PROFILE=Object.freeze({
  id:'german-atlantic-1941-missions-v1',
  defaultMissionType:'SHADOW_REPORT',
  autoDescription:'B.d.U. orders: find the convoy, develop course and speed, keep contact without drawing the escort screen, then transmit a contact report.',
  definitions:Object.freeze({
    CONVOY_INTERDICTION:Object.freeze({title:'CONVOY ATTACK',reward:2100,
      briefing:'B.d.U. has assigned a reported Allied convoy. Develop the intercept, break into the formation, neutralize a meaningful share of shipping and survive the escort response.'}),
    HIGH_VALUE_INTERCEPT:Object.freeze({title:'PRIORITY SHIPPING',reward:2200,
      briefing:'B.d.U. has an uncertain report of valuable Allied shipping. Intercept the estimate, identify the vessel before committing weapons, then break contact and return.'}),
    MINELAYING:Object.freeze({title:'ARCTIC MINE OPERATION',reward:2050,
      briefing:'Carry the TMB load through the confined Arctic approach, lay the complete pattern in the ordered channel and return without advertising the field.'}),
    SHADOW_REPORT:Object.freeze({title:'CONTACT KEEPER',reward:1800,
      briefing:'B.d.U. reports an Allied convoy crossing the North Atlantic. Find it, develop a reliable movement picture, shadow without provoking the escorts and transmit a contact report so other U-boats can be directed toward the convoy.'}),
    WEATHER_AMBUSH:Object.freeze({title:'FRONT-LINE AMBUSH',reward:1900,
      briefing:'A weather front is crossing the reported convoy route. Use darkness, rain or a squall to close unseen and score a torpedo hit under genuine visual cover.'})
  }),
  missionPoolsByArea:Object.freeze({
    'North Atlantic Convoy Lanes':Object.freeze(['SHADOW_REPORT','SHADOW_REPORT','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','WEATHER_AMBUSH']),
    'Western Approaches':Object.freeze(['WEATHER_AMBUSH','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','SHADOW_REPORT']),
    'Greenland–Iceland Gap':Object.freeze(['SHADOW_REPORT','WEATHER_AMBUSH','HIGH_VALUE_INTERCEPT','CONVOY_INTERDICTION']),
    'Norwegian Arctic Fjord Approaches':Object.freeze(['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','MINELAYING','WEATHER_AMBUSH'])
  }),
  missionPoolsByEra:Object.freeze({
    'ATLANTIC 1941':Object.freeze(['SHADOW_REPORT','SHADOW_REPORT','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','WEATHER_AMBUSH']),
    'ATLANTIC 1942':Object.freeze(['SHADOW_REPORT','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','WEATHER_AMBUSH']),
    'ATLANTIC 1943':Object.freeze(['WEATHER_AMBUSH','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','MINELAYING','SHADOW_REPORT']),
    'ATLANTIC 1944':Object.freeze(['WEATHER_AMBUSH','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','MINELAYING'])
  }),
  defaultMissionPool:Object.freeze(['SHADOW_REPORT','CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','WEATHER_AMBUSH']),
  content:Object.freeze({
    highValueIntercept:Object.freeze({
      variants:Object.freeze([
        Object.freeze({below:.52,kind:'TANKER',vessel:Object.freeze({name:'Allied Ocean Tanker',type:'TANKER',gameplayType:'TANKER',vesselProfileId:'uk-tanker-1941',modelKey:'ATLANTIC_TANKER',displayType:'OCEAN TANKER',lengthYards:485,tonsFactor:9100,visualProfile:1.14})}),
        Object.freeze({kind:'FAST_CARGO_LINER',vessel:Object.freeze({name:'Allied Fast Cargo Liner',type:'MERCHANT',gameplayType:'MERCHANT',vesselProfileId:'uk-cargo-liner-1941',modelKey:'ATLANTIC_CARGO_LINER',displayType:'FAST CARGO LINER',lengthYards:455,tonsFactor:7900,visualProfile:1.08})})
      ])
    }),
    shadowReport:Object.freeze({
      mode:'CONTACT_KEEPER',
      objectiveTexts:Object.freeze({
        locate:'Find the reported convoy',develop:'Develop convoy course and speed',
        shadow:'Maintain contact without firm escort prosecution',report:'Transmit contact report to B.d.U.',
        release:'Copy B.d.U. attack order',approach:'Gain a night surface attack position',
        attack:'Launch the torpedo attack',evade:'Break clear of escort prosecution',withdraw:'Withdraw clear of the convoy screen',return:'Return to base'
      }),
      locateConfidence:.08,developConfidence:.42,developRequiredSec:90,
      shadowRequiredSec:360,shadowMinNm:2.8,shadowMaxNm:8.5,
      reportTransmitSec:25,reportMaxDepthFt:12,
      attackOrderDelaySec:45,attackOrderCommand:'CONTACT_KEEPER_ATTACK_RELEASE',
      attackOrderType:'B.D.U.',attackOrderSubject:'ATTACK ORDER',
      attackOrderText:'Contact report received. Maintain contact. Boats in position are released to attack after dark.',
      attackOrderAnnounce:'Radio room: priority B.d.U. signal is up. Antenna depth to copy the attack order.',
      // Gameplay tuning for the 1941 slice, not literal Kriegsmarine regulation distances/timings.
      nightApproachMaxDaylight:.18,nightApproachSurfaceDepthFt:12,
      nightApproachMinNm:.8,nightApproachMaxNm:3.5,nightApproachForwardMinNm:.15,nightApproachLateralMaxNm:2.6,
      nightApproachHoldSec:30,
      // Post-attack values are gameplay tuning. Existing enemy knowledge/ASW
      // mechanics decide whether an escort ever acquires a firm contact; the
      // mission never grants them telepathic knowledge merely because we fired.
      evasionQuietHoldSec:45,evasionNoAlarmRangeNm:3.8,withdrawMinNm:6.0,withdrawQuietHoldSec:60,
      briefingSuffix:' A useful report requires a developed track and several minutes of safe shadowing. When the report is ready, come to the surface/antenna depth long enough to transmit. After B.d.U. replies, preserve contact until darkness and work ahead of the convoy for a surfaced attack approach.',
      developedNotice:'CONTACT DEVELOPED — course and speed are reliable enough to begin the shadow report.',
      reportReadyNotice:'CONTACT REPORT READY — come to the surface and hold the antenna up to transmit to B.d.U.',
      reportSentNotice:'CONTACT REPORT TRANSMITTED — other U-boats are being directed toward the convoy. Stand by for B.d.U. orders.',
      reportLog:'Convoy contact report transmitted to B.d.U.',
      attackOrderCopiedNotice:'B.D.U. ATTACK ORDER COPIED — maintain contact and attack after dark.',
      attackOrderLog:'B.d.U. attack order copied. Contact keeper released to attack after dark.',
      nightApproachNotice:'NIGHT SURFACE ATTACK POSITION — ahead of the convoy and inside the screen. Attack at discretion.',
      nightApproachLog:'Night surface attack position gained ahead of the convoy.',
      attackNotice:'TORPEDO ATTACK UNDERWAY — clear the convoy screen before the escorts can pin you down.',
      attackLog:'Torpedo attack launched from the released night surface position.',
      escortReactionNotice:'CONVOY ALARM — escort screen reacting. Break firm contact: dive or run dark.',
      escortReactionLog:'Convoy alarm observed after the torpedo attack; escort screen reacting.',
      evasionNotice:'FIRM CONTACT BROKEN — keep opening the range from the convoy.',
      evasionLog:'Firm escort contact broken after the convoy attack.',
      withdrawalNotice:'ATTACK COMPLETE — clear of the convoy screen. Return to base when ready.',
      withdrawalLog:'Boat withdrew clear of the convoy screen after the attack.',
      supportMinBoats:1,supportMaxBoats:3,supportEtaMin:35,supportEtaSpreadMin:55,
      /* Abstract support boats can create one or two observable attack events.
         They never become tactical submarine contacts and never write a datum
         about the player.  The mission layer only materializes their effects
         while the convoy is in the player's tactical bubble. */
      supportAttack:Object.freeze({firstDelaySec:360,delaySpreadSec:420,repeatDelaySec:540,
        maxEvents:2,escortDiversionSec:300,damageMin:.18,damageSpread:.18,
        observedNotice:'DISTANT TORPEDO HIT — another U-boat has struck the convoy. Escort screen is splitting.'}),
      radioExposure:Object.freeze({reason:'RADIO_BEARING',confidence:.28,
        warning:'RADIO ROOM — prolonged transmission. Enemy D/F stations may have obtained a rough bearing.'})
    })
  })
});


/* Theater-specific special operations remain authored campaign content even
   when their mechanics (mines, nets, harbor hydrophones, searchlights and
   coastal batteries) are reusable engine systems. Keep this profile literal:
   it describes the current Truk operation without creating a generic scenario
   language that Atlantic does not yet need. */
const US_PACIFIC_SPECIAL_OPERATIONS_PROFILE=Object.freeze({
  id:'us-pacific-special-operations-v1',
  harborRaid:Object.freeze({
    id:'truk-raid',
    areaKey:'Truk Approaches',
    portName:'Truk Anchorage',
    shortName:'Truk',
    optionalObjectiveId:'truk-raid',
    geometry:Object.freeze({
      outerRadiusNm:5.6,innerRadiusNm:1.25,
      channelBearing:68,channelHalfWidthNm:.42,channelSafeHalfWidthNm:.34,channelDepthFeet:120,innerBasinDepthFeet:110,
      mineInnerNm:2.15,mineOuterNm:4.75,
      netRangeNm:1.82,netHalfSpanNm:1.18,netGapHalfNm:.28,netMaxDepthFt:320,
      hydrophoneRangeNm:4.6,batteryRangeNm:5.1
    }),
    mines:Object.freeze({count:30,maxPlacementAttempts:300,channelExclusionDeg:13}),
    targets:Object.freeze({
      fixed:Object.freeze([
        Object.freeze({id:'H-01',name:'Fleet Oiler',type:'TANKER',vesselProfileId:'jp-tanker',displayType:'FLEET OILER',bearing:205,rangeNm:.72,lengthYards:560,tonsFactor:10500,harborValue:2600,visualProfile:1.12}),
        Object.freeze({id:'H-02',name:'Army Transport',type:'MERCHANT',vesselProfileId:'jp-transport',displayType:'TROOP TRANSPORT',bearing:318,rangeNm:.62,lengthYards:500,tonsFactor:7600,harborValue:2200,visualProfile:1.02}),
        Object.freeze({id:'H-03',name:'Cargo Vessel',type:'MERCHANT',vesselProfileId:'jp-merchant',displayType:'CARGO SHIP',bearing:112,rangeNm:.92,lengthYards:430,tonsFactor:4800,harborValue:1800,visualProfile:.96})
      ]),
      heavy:Object.freeze({
        id:'H-04',chance:.38,
        high:Object.freeze({name:'Japanese Fleet Carrier',type:'CARRIER',vesselProfileId:'jp-carrier',displayType:'FLEET CARRIER',bearing:28,rangeNm:.46,lengthYards:820,tonsFactor:26000,harborValue:9000,visualProfile:1.45}),
        low:Object.freeze({name:'Heavy Cruiser',type:'HEAVY_CRUISER',vesselProfileId:'jp-heavy-cruiser',displayType:'HEAVY CRUISER',bearing:28,rangeNm:.46,lengthYards:660,tonsFactor:13500,harborValue:5200,visualProfile:1.22})
      })
    }),
    intel:Object.freeze({eligibleBaseSec:480,eligibleSpreadSec:420}),
    careerAward:Object.freeze({id:'truk-penetration',title:'Successful Truk penetration'}),
    radioSignal:Object.freeze({
      type:'SPECIAL INTELLIGENCE',subject:'TRUK ANCHORAGE',
      text:"HEAVY UNIT REPORTED AT TRUK ANCHORAGE. DEPARTURE UNKNOWN. ATTACK AT COMMANDING OFFICER'S DISCRETION."
    }),
    events:Object.freeze({
      visualIdentifiedId:'HEAVY_UNIT_IDENTIFIED',visualIdentifiedKey:'truk-heavy-identified',visualBanner:'TRUK VISUAL IDENTIFICATION',
      reconCompleteId:'TRUK_RECON_COMPLETE',reconCompleteKey:'truk-recon-complete',
      penetrationId:'TRUK_PENETRATION',penetrationText:'Entered the Truk anchorage defenses.'
    })
  })
});


/* Campaign doctrine owns theater-specific force posture and aircraft rosters.
   The AI still owns detection, pursuit, attack and formation mechanics; these
   values only answer questions such as how heavily an area is screened and
   which patrol aircraft can appear there. Keeping the authored Pacific names
   here prevents future Atlantic work from teaching generic AI about Japan. */
const US_PACIFIC_DOCTRINE_PROFILE=Object.freeze({
  id:'us-pacific-doctrine-v1',
  asw:Object.freeze({
    areaRisk:Object.freeze({'Truk Approaches':1,'Luzon Strait':1,'Java Sea':-1}),
    escortCount:Object.freeze({
      merchantBands:Object.freeze([
        Object.freeze({max:2,count:1}),Object.freeze({max:4,count:2}),Object.freeze({count:3})
      ]),
      yearModifiers:Object.freeze([
        Object.freeze({through:1942,add:-1}),Object.freeze({from:1944,add:1})
      ]),
      difficultyModifiers:Object.freeze({EASY:-1,HARD:1}),
      min:1,max:4
    }),
    screenRoles:Object.freeze({
      1:Object.freeze(['FORWARD_SCREEN']),
      2:Object.freeze(['FORWARD_SCREEN','REAR_GUARD']),
      3:Object.freeze(['FORWARD_SCREEN','PORT_FLANK','STARBOARD_FLANK']),
      4:Object.freeze(['FORWARD_SCREEN','PORT_FLANK','STARBOARD_FLANK','REAR_GUARD'])
    }),
    roamingScout:Object.freeze({minAreaRisk:1,difficulty:'HARD',fromYear:1944,role:'ROAMING_SCOUT',replaceIndex:3})
  }),
  air:Object.freeze({
    hostile:Object.freeze({
      checkSec:90,baseChance:.020,alertedFactor:1.7,surfacedFactor:1.5,dayBase:.35,dayFactor:.85,
      nearLandRadiusNm:26,nearLandFactor:1.8,openWaterFactor:.55,maxConcurrent:2,
      spawnRangeMinNm:12,spawnRangeSpreadNm:6,headingJitterDeg:40,speedMinKn:115,speedSpreadKn:70,
      bombMin:2,bombExtraExclusive:3,
      friendlyPort:Object.freeze({unawareBlockNm:6,unawareInnerNm:12,unawareInnerFactor:.18,unawareOuterNm:18,unawareOuterFactor:.55,alertedInnerNm:6,alertedInnerFactor:.35}),
      roster:Object.freeze([
        Object.freeze({before:.42,name:'Type 97 flying boat',kind:'FLYING_BOAT',ordnance:'DEPTH_CHARGE'}),
        Object.freeze({before:.72,name:'Nakajima B5N',kind:'BOMBER',ordnance:'BOMB'}),
        Object.freeze({name:'Aichi E13A',kind:'FLOATPLANE',ordnance:'BOMB'})
      ])
    }),
    friendly:Object.freeze({
      initialCheckBaseSec:240,initialCheckSpreadSec:180,repeatCheckBaseSec:300,repeatCheckSpreadSec:240,
      blockedAreas:Object.freeze(['Truk Approaches','Kii Suido / Honshu Approaches','Yellow Sea']),
      minDaylight:.18,spawnChance:.32,spawnRangeMinNm:7,spawnRangeSpreadNm:6,headingOffsetDeg:135,headingJitterDeg:70,
      legBaseSec:55,legSpreadSec:80,reportPrefix:'FOX SCHEDULE',reportActor:'Allied patrol aircraft',
      roster:Object.freeze([
        Object.freeze({before:.62,name:'Allied PBY Catalina',kind:'FLYING_BOAT',speed:115}),
        Object.freeze({name:'Allied fighter patrol',kind:'FIGHTER',speed:175})
      ])
    })
  })
});

/* Minimal 1941 Atlantic close-escort doctrine for the convoy slice. This is a
   gameplay-readable representative screen, not a claim that every September
   1941 convoy sailed with this exact escort-group strength. Flower corvettes
   are historically appropriate close escorts; aircraft and later radar/HF-DF
   layers are intentionally absent from this first slice. */
const GERMAN_ATLANTIC_1941_DOCTRINE_PROFILE=Object.freeze({
  id:'german-atlantic-1941-doctrine-v1',
  asw:Object.freeze({
    areaRisk:Object.freeze({'North Atlantic Convoy Lanes':0,'Western Approaches':1,'Greenland–Iceland Gap':1}),
    escortCount:Object.freeze({
      merchantBands:Object.freeze([
        Object.freeze({max:5,count:2}),Object.freeze({max:7,count:2}),Object.freeze({count:3})
      ]),
      yearModifiers:Object.freeze([Object.freeze({from:1943,add:1})]),difficultyModifiers:Object.freeze({EASY:-1,HARD:0}),min:1,max:4
    }),
    screenRoles:Object.freeze({
      1:Object.freeze(['FORWARD_SCREEN']),
      2:Object.freeze(['FORWARD_SCREEN','REAR_GUARD']),
      3:Object.freeze(['FORWARD_SCREEN','PORT_FLANK','STARBOARD_FLANK']),
      4:Object.freeze(['FORWARD_SCREEN','PORT_FLANK','STARBOARD_FLANK','REAR_GUARD'])
    })
  }),
  air:Object.freeze({
    hostile:Object.freeze({
      checkSec:90,baseChance:.018,alertedFactor:1.65,surfacedFactor:1.55,dayBase:.24,dayFactor:.92,
      nearLandRadiusNm:18,nearLandFactor:1.15,openWaterFactor:1,maxConcurrent:2,
      spawnRangeMinNm:13,spawnRangeSpreadNm:7,headingJitterDeg:42,speedMinKn:115,speedSpreadKn:65,
      bombMin:3,bombExtraExclusive:3,
      friendlyPort:Object.freeze({unawareBlockNm:5,unawareInnerNm:9,unawareInnerFactor:.25,unawareOuterNm:15,unawareOuterFactor:.62,alertedInnerNm:5,alertedInnerFactor:.45}),
      coverage:Object.freeze({gapCenterXNm:0,gapHalfWidthNm:48,edgeBlendNm:28,gapFactorByYear:Object.freeze({'1941':.10,'1942':.18,'1943':.52,'1944':.78})}),
      roster:Object.freeze([
        Object.freeze({before:.28,aircraftProfileId:'raf-sunderland'}),
        Object.freeze({throughYear:1942,before:.62,aircraftProfileId:'raf-hudson'}),
        Object.freeze({fromYear:1941,before:.72,aircraftProfileId:'raf-catalina'}),
        Object.freeze({fromYear:1942,before:.84,aircraftProfileId:'raf-wellington-leigh'}),
        Object.freeze({fromYear:1943,aircraftProfileId:'raf-vlr-liberator'})
      ])
    }),
    // No friendly tactical air umbrella for a mid-ocean U-boat. The shared
    // aircraft engine requires an explicit authored friendly boundary.
    friendly:Object.freeze({initialCheckBaseSec:360,initialCheckSpreadSec:120,repeatCheckBaseSec:600,repeatCheckSpreadSec:180,blockedAreas:Object.freeze(['North Atlantic Convoy Lanes']),minDaylight:1,spawnChance:0,spawnRangeMinNm:8,spawnRangeSpreadNm:1,headingOffsetDeg:135,headingJitterDeg:0,legBaseSec:60,legSpreadSec:1,reportPrefix:'LUFTWAFFE',reportActor:'German aircraft',roster:Object.freeze([])})
  })
});

/* Routine radio traffic is campaign presentation layered over generic
   receive/copy/intelligence mechanics. Internal `world.ultra` naming remains a
   Phase-1 save/runtime compatibility detail; player-facing terminology comes
   from this profile so another theater never inherits US Pacific wording. */
const US_PACIFIC_RADIO_INTEL_PROFILE=Object.freeze({
  id:'us-pacific-radio-intel-v1',
  routine:Object.freeze({shippingCeiling:.50,airCeiling:.68,lifeguardCeiling:.82}),
  shipping:Object.freeze({
    type:'ULTRA',sourceLabel:'ULTRA',estimateLabel:'ULTRA estimate',mapFixLabel:'ULTRA fix',mapEstimateLabel:'ULTRA — ESTIMATED CONVOY',
    subject:'ENEMY SHIPPING REPORTED',amplifyingSubject:'ENEMY SHIPPING — AMPLIFYING REPORT',
    missionQualification:' This is the assigned patrol convoy.',
    ambientQualification:" This report is not guaranteed to be the patrol's primary target.",
    transitStopText:'an ULTRA intercept',toastTag:'ULTRA_INTERCEPT',
    toastSingle:'ULTRA intercept plotted — steer to cut her off',
    toastPluralNoun:'ULTRA intercepts plotted — latest plot shown on MAP',
    noContactsPrompt:'NO CURRENT CONTACTS — work the ULTRA plot'
  }),
  air:Object.freeze({
    type:'WARNING',subject:'AIR ACTIVITY',
    textPrefix:'Enemy air patrols reported over ',
    textSuffix:'. Remain submerged during daylight where practicable.'
  }),
  lifeguard:Object.freeze({
    type:'ORDERS',subject:'LIFEGUARD STATION',
    text:'Carrier strike scheduled. Take lifeguard station and report. Any airman recovered counts toward the patrol.',
    score:250
  }),
  weather:Object.freeze({
    type:'INFO',subject:'WEATHER',
    text:'Front moving through the area within the next twelve hours. Expect reduced visibility and rising sea.'
  })
});


/* Late-1941 B.d.U. traffic uses the existing lightweight receive/copy and
   dead-reckoning mechanics but never exposes Pacific ULTRA terminology. Other
   U-boats generated by CONTACT KEEPER are mission events only; they are not
   inserted into the tactical contact list. */
const GERMAN_ATLANTIC_1941_RADIO_INTEL_PROFILE=Object.freeze({
  id:'german-atlantic-1941-radio-v2',initialBroadcastSec:120,baseCopySec:42,enigmaWorkloadFactor:.10,
  routine:Object.freeze({shippingCeiling:.72,airCeiling:.72,lifeguardCeiling:.72}),
  shipping:Object.freeze({
    type:'B.D.U.',sourceLabel:'B.d.U. convoy report',estimateLabel:'B.d.U. estimate',
    mapFixLabel:'B.d.U. report',mapEstimateLabel:'B.D.U. — ESTIMATED CONVOY',
    subject:'CONVOY REPORT',amplifyingSubject:'CONVOY REPORT — AMPLIFYING',
    missionQualification:' This report concerns the convoy assigned to your patrol group.',
    ambientQualification:' This is general shipping intelligence, not a confirmed patrol target.',
    transitStopText:'a B.d.U. convoy signal',toastTag:'BDU_CONVOY_REPORT',
    toastSingle:'B.d.U. convoy report plotted — work the intercept',
    toastPluralNoun:'B.d.U. convoy reports plotted — latest estimate shown on MAP',
    noContactsPrompt:'NO CURRENT CONTACTS — work the B.d.U. convoy estimate'
  }),
  weather:Object.freeze({type:'B.D.U.',subject:'WEATHER',text:'Atlantic weather report: deteriorating visibility and rising sea expected in the patrol area.'})
});

/* A future campaign is planning data, never selectable content. It moves into
   CAMPAIGN_PROFILES only after every gate below is backed by real data and an
   acceptance result. Module hints describe the intended lazy boundary; they
   are not loaded, imported or added to the PWA shell while status is PLANNED. */
const VERTICAL_SLICE_REQUIREMENTS=Object.freeze([
  'factionIdentity','submarineAndPresentation','equipmentByDate','vesselRosters',
  'aircraftAndAswDoctrine','patrolGeography','threeMissionVariants',
  'radioAndCommandTerms','tutorials','aarContent','saveLoadAndPerformance'
]);

const FUTURE_VERTICAL_SLICE_BLUEPRINTS=Object.freeze({
  'us-pacific-next':Object.freeze({id:'us-pacific-next',status:'PLANNED',theaterId:'pacific',regionId:'pacific-ocean',playerFactionId:'usa',boatFamilies:Object.freeze(['Balao','Tench']),campaignModule:'campaigns/us-pacific-next',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'japanese-pacific':Object.freeze({id:'japanese-pacific',status:'PLANNED',theaterId:'pacific',regionId:'pacific-ocean',playerFactionId:'japan',boatFamilies:Object.freeze(['I-class']),requiresDistinctDoctrine:true,campaignModule:'campaigns/japanese-pacific',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'british-atlantic':Object.freeze({id:'british-atlantic',status:'PLANNED',theaterId:'atlantic',regionId:'north-atlantic',playerFactionId:'britain',boatFamilies:Object.freeze(['T-class','S-class','U-class']),campaignModule:'campaigns/british-atlantic',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'british-mediterranean':Object.freeze({id:'british-mediterranean',status:'PLANNED',theaterId:'mediterranean',regionId:'mediterranean',playerFactionId:'britain',boatFamilies:Object.freeze(['T-class','U-class']),campaignModule:'campaigns/british-mediterranean',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'soviet-arctic':Object.freeze({id:'soviet-arctic',status:'PLANNED',theaterId:'atlantic',regionId:'norwegian-arctic',playerFactionId:'soviet',boatFamilies:Object.freeze(['S-class','K-class']),campaignModule:'campaigns/soviet-arctic',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'soviet-baltic':Object.freeze({id:'soviet-baltic',status:'PLANNED',theaterId:'baltic',regionId:'baltic-sea',playerFactionId:'soviet',boatFamilies:Object.freeze(['S-class','Shchuka']),campaignModule:'campaigns/soviet-baltic',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'german-baltic-late':Object.freeze({id:'german-baltic-late',status:'PLANNED',theaterId:'baltic',regionId:'baltic-sea',playerFactionId:'germany',boatFamilies:Object.freeze(['Type VII','Type XXIII']),campaignModule:'campaigns/german-baltic-late',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'german-atlantic-late':Object.freeze({id:'german-atlantic-late',status:'PLANNED',theaterId:'atlantic',regionId:'north-atlantic',playerFactionId:'germany',boatFamilies:Object.freeze(['Type VIIC/41','Type IX','Type XXI']),campaignModule:'campaigns/german-atlantic-late',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'}),
  'british-indian-ocean':Object.freeze({id:'british-indian-ocean',status:'PLANNED',theaterId:'indian-ocean',regionId:'indian-ocean',playerFactionId:'britain',boatFamilies:Object.freeze(['T-class']),campaignModule:'campaigns/british-indian-ocean',terrainBoundary:'ONE_ACTIVE_PATROL_AREA'})
});

const CAMPAIGN_LOAD_BOUNDARIES=Object.freeze({
  'us-pacific':Object.freeze({catalogPartition:'us-pacific',terrainStrategy:'PATROL_SCOPED',maximumResidentLargeAreas:1}),
  'german-atlantic-1941':Object.freeze({catalogPartition:'german-atlantic-1941',terrainStrategy:'PATROL_SCOPED',maximumResidentLargeAreas:1})
});

const VERTICAL_SLICE_ACCEPTED=Object.freeze(Object.fromEntries(VERTICAL_SLICE_REQUIREMENTS.map(key=>[key,true])));

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
    patrolAreaIds:Object.freeze([
      'Solomon Sea','Bismarck Sea','Luzon Strait','Truk Approaches','Java Sea',
      'Yellow Sea','Kii Suido / Honshu Approaches','East China Sea / Formosa Approaches',
      'Sulu Sea / Tawi-Tawi','Kurile / Hokkaido Approaches'
    ]),
    defaultStartDate:'1943-08-17',
    historicalModel:US_PACIFIC_HISTORICAL_MODEL,
    primaryConvoyProfile:US_PACIFIC_PRIMARY_CONVOY_PROFILE,
    ambientTrafficProfile:US_PACIFIC_AMBIENT_TRAFFIC_PROFILE,
    missionProfile:US_PACIFIC_MISSION_PROFILE,
    specialOperationsProfile:US_PACIFIC_SPECIAL_OPERATIONS_PROFILE,
    doctrineProfile:US_PACIFIC_DOCTRINE_PROFILE,
    radioIntelProfile:US_PACIFIC_RADIO_INTEL_PROFILE,
    verticalSliceAcceptance:VERTICAL_SLICE_ACCEPTED
  }),
  'german-atlantic-1941':Object.freeze({
    id:'german-atlantic-1941',
    displayName:'German North Atlantic — 1941–44',
    theaterId:'atlantic',
    playerFactionId:'germany',
    opposingFactionIds:Object.freeze(['britain']),
    submarineProfileId:'type-viic-1941',
    commandName:'B.d.U.',
    defaultArea:'North Atlantic Convoy Lanes',
    patrolAreaIds:Object.freeze(['North Atlantic Convoy Lanes','Western Approaches','Greenland–Iceland Gap','Norwegian Arctic Fjord Approaches']),
    defaultStartDate:'1941-09-01',
    historicalModel:GERMAN_ATLANTIC_1941_HISTORICAL_MODEL,
    primaryConvoyProfile:GERMAN_ATLANTIC_1941_PRIMARY_CONVOY_PROFILE,
    ambientTrafficProfile:GERMAN_ATLANTIC_1941_AMBIENT_TRAFFIC_PROFILE,
    missionProfile:GERMAN_ATLANTIC_1941_MISSION_PROFILE,
    doctrineProfile:GERMAN_ATLANTIC_1941_DOCTRINE_PROFILE,
    radioIntelProfile:GERMAN_ATLANTIC_1941_RADIO_INTEL_PROFILE,
    verticalSliceAcceptance:VERTICAL_SLICE_ACCEPTED,
    devSelectable:true,developmentStage:'ATLANTIC_CAMPAIGN_COMPLETE'
  })
});

const DEFAULT_GAME_IDENTITY=Object.freeze({
  theaterId:'pacific',
  playerFactionId:'usa',
  campaignProfileId:'us-pacific',
  submarineProfileId:'gato-silversides'
});

// Explicit opt-in identity for deterministic Phase-2 tests. It is intentionally
// not wired into the public scenario selector until the Atlantic loop exists.
const ATLANTIC_1941_GAME_IDENTITY=Object.freeze({
  theaterId:'atlantic',
  playerFactionId:'germany',
  campaignProfileId:'german-atlantic-1941',
  submarineProfileId:'type-viic-1941'
});

function getCampaignProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  // Omitted ID means the current default; an explicit unknown ID is an authoring
  // or save-compatibility error and must never masquerade as the Pacific campaign.
  return CAMPAIGN_PROFILES[profileId]||null;
}

function getCampaignLoadBoundary(profileId){return CAMPAIGN_LOAD_BOUNDARIES[profileId]||null;}
function getFutureVerticalSliceBlueprint(profileId){return FUTURE_VERTICAL_SLICE_BLUEPRINTS[profileId]||null;}
function verticalSliceReadiness(profileId){
  const campaign=getCampaignProfile(profileId),missing=[];
  if(!campaign)return Object.freeze({ready:false,missing:Object.freeze(['registeredPlayableCampaign'])});
  const theater=THEATER_PROFILES[campaign.theaterId],faction=FACTION_PROFILES[campaign.playerFactionId],sub=SUBMARINE_PROFILES[campaign.submarineProfileId];
  const checks={
    factionIdentity:!!(theater&&faction),
    submarineAndPresentation:!!(sub&&STATION_PRESENTATION_PROFILES[sub.stationPresentationId]),
    equipmentByDate:!!campaign.historicalModel,
    vesselRosters:!!(campaign.primaryConvoyProfile&&campaign.ambientTrafficProfile),
    aircraftAndAswDoctrine:!!campaign.doctrineProfile,
    patrolGeography:Array.isArray(campaign.patrolAreaIds)&&campaign.patrolAreaIds.length>0,
    threeMissionVariants:Object.keys(campaign.missionProfile?.definitions||{}).length>=3,
    radioAndCommandTerms:!!(campaign.commandName&&campaign.radioIntelProfile),
    tutorials:campaign.verticalSliceAcceptance?.tutorials===true,
    aarContent:campaign.verticalSliceAcceptance?.aarContent===true,
    saveLoadAndPerformance:campaign.verticalSliceAcceptance?.saveLoadAndPerformance===true
  };
  for(const requirement of VERTICAL_SLICE_REQUIREMENTS){
    if(checks[requirement]!==true||campaign.verticalSliceAcceptance?.[requirement]!==true)missing.push(requirement);
  }
  if(!getCampaignLoadBoundary(profileId))missing.push('lazyCampaignBoundary');
  return Object.freeze({ready:missing.length===0,missing:Object.freeze([...new Set(missing)])});
}
function getSelectableCampaignProfiles(){
  return Object.freeze(Object.values(CAMPAIGN_PROFILES).filter(c=>c.id===DEFAULT_GAME_IDENTITY.campaignProfileId||(c.devSelectable&&verticalSliceReadiness(c.id).ready)));
}

function getCampaignMissionProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  /* Deliberately no Pacific fallback for a known future campaign. A missing
     mission profile is an authoring error and must not leak COMSUBPAC orders
     or Pacific area selection into another theater. */
  return CAMPAIGN_PROFILES[profileId]?.missionProfile||null;
}

function getCampaignSpecialOperationsProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return CAMPAIGN_PROFILES[profileId]?.specialOperationsProfile||null;
}

function getCampaignDoctrineProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  /* Doctrine is campaign-authored. Do not hide an incomplete future theater by
     silently borrowing Pacific escort posture or Japanese aircraft rosters. */
  return CAMPAIGN_PROFILES[profileId]?.doctrineProfile||null;
}

function getCampaignRadioIntelProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return CAMPAIGN_PROFILES[profileId]?.radioIntelProfile||null;
}

function getCampaignHarborOperationProfile(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return getCampaignSpecialOperationsProfile(profileId)?.harborRaid||null;
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
  // As with campaigns, an explicit future/unknown boat must fail closed rather
  // than silently materializing Silversides with the wrong historical identity.
  return SUBMARINE_PROFILES[profileId]||null;
}

function getStationPresentation(profileId){
  return STATION_PRESENTATION_PROFILES[profileId]||null;
}

function materializeSubmarinePresentation(submarineProfileId=DEFAULT_GAME_IDENTITY.submarineProfileId){
  const sub=getSubmarineProfile(submarineProfileId),profile=getStationPresentation(sub?.stationPresentationId);
  if(!sub)throw new Error(`Unknown submarine profile: ${submarineProfileId}`);
  if(!profile)throw new Error(`Submarine ${sub.id} has no station presentation profile.`);
  return JSON.parse(JSON.stringify(profile));
}

function getPlayerStationPresentation(state=null){
  const materialized=state?.playerSub?.presentation;
  return materialized||materializeSubmarinePresentation(state?.playerSub?.profileId||DEFAULT_GAME_IDENTITY.submarineProfileId);
}

function playerDepthDisplay(state,feet,decimals=0){
  const d=getPlayerStationPresentation(state).depth,f=Number(d.factor)||1;
  return`${(Number(feet||0)*f).toFixed(decimals)} ${d.suffix||'ft'}`;
}

function playerDepthInternal(state,displayValue){
  const f=Number(getPlayerStationPresentation(state).depth.factor)||1;
  return Number(displayValue||0)/f;
}


function getSubmarineSensorPresentation(profileId=DEFAULT_GAME_IDENTITY.submarineProfileId){
  const profile=getSubmarineProfile(profileId);
  if(!profile)throw new Error(`Unknown submarine profile: ${profileId}`);
  return profile.sensors;
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

function materializeGameIdentity(state){
  /* Lifecycle/save boundary for the Phase-1 identity migration. Legacy Pacific
     saves may omit all four IDs, so resolve them once to the historical default
     and stamp them into state. Explicit invalid/mismatched IDs fail here instead
     of leaking Pacific/Silversides data through a fallback getter. */
  if(!state?.campaign||!state?.playerSub)throw new Error('Game state has no campaign/submarine identity boundary.');
  const identity=resolveGameIdentity(state),validation=validateGameIdentity(identity);
  if(!validation.ok)throw new Error(`Invalid game identity: ${validation.errors.join('; ')}`);
  const campaign=getCampaignProfile(identity.campaignProfileId);
  state.campaign.theaterId=identity.theaterId;
  state.campaign.playerFactionId=identity.playerFactionId;
  state.campaign.campaignProfileId=identity.campaignProfileId;
  state.playerSub.profileId=identity.submarineProfileId;
  const expectedPresentationId=getSubmarineProfile(identity.submarineProfileId).stationPresentationId;
  if(state.playerSub.presentation?.id!==expectedPresentationId)
    state.playerSub.presentation=materializeSubmarinePresentation(identity.submarineProfileId);
  if(!state.campaign.patrolArea)state.campaign.patrolArea=campaign.defaultArea;
  if(Array.isArray(campaign.patrolAreaIds)&&!campaign.patrolAreaIds.includes(state.campaign.patrolArea))
    throw new Error(`Patrol area ${state.campaign.patrolArea} does not belong to campaign ${campaign.id}.`);
  return identity;
}
