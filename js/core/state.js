// ═══════════════════════════════════════════════════ STATE
function materializeSubmarinePropulsionCharacteristics(profileId=DEFAULT_GAME_IDENTITY.submarineProfileId){
  const profile=getSubmarineProfile(profileId);
  if(!profile)throw new Error(`Unknown submarine profile: ${profileId}`);
  const x=profile.propulsion;
  if(!x)throw new Error(`Submarine ${profile.id} has no propulsion profile.`);
  return{...x,fuel:{...x.fuel},battery:{...x.battery}};
}

function materializeFreshSubmarine(profileId=DEFAULT_GAME_IDENTITY.submarineProfileId,torpedoSpecOverride=null){
  const profile=getSubmarineProfile(profileId);
  if(!profile)throw new Error(`Unknown submarine profile: ${profileId}`);
  const weapons=profile.weapons;
  const torpedoSpecKey=torpedoSpecOverride&&TORPEDO_SPECS[torpedoSpecOverride]
    ?torpedoSpecOverride:weapons.defaultTorpedoSpecKey;
  const torpedoSpec=TORPEDO_SPECS[torpedoSpecKey];
  if(!torpedoSpec)throw new Error(`Submarine ${profile.id} references unknown torpedo spec: ${torpedoSpecKey}`);
  const tubes=weapons.tubes.map(t=>({
    id:t.id,pos:t.pos,status:'LOADED_DRY',specKey:torpedoSpecKey,flooded:false,
    gyroAngle:t.gyroAngle,reloadProgress:1,spreadOffsetDeg:0
  }));
  return{profile,weapons,propulsionProfile:materializeSubmarinePropulsionCharacteristics(profile.id),torpedoSpecKey,torpedoSpec,tubes};
}

function createState(areaKey=null,requestedIdentity=DEFAULT_GAME_IDENTITY){
  const validation=validateGameIdentity(requestedIdentity);
  if(!validation.ok)throw new Error(`Invalid game identity: ${validation.errors.join('; ')}`);
  const identity=Object.freeze({...validation.identity});
  const campaignProfile=getCampaignProfile(identity.campaignProfileId);
  const resolvedAreaKey=areaKey||campaignProfile.defaultArea;
  if(Array.isArray(campaignProfile.patrolAreaIds)&&!campaignProfile.patrolAreaIds.includes(resolvedAreaKey))
    throw new Error(`Patrol area ${resolvedAreaKey} does not belong to campaign ${campaignProfile.id}.`);
  const area=PATROL_AREAS[resolvedAreaKey];
  if(!area)throw new Error(`Patrol area data missing: ${resolvedAreaKey}`);
  const fresh=materializeFreshSubmarine(identity.submarineProfileId);
  const subProfile=fresh.profile,weaponProfile=fresh.weapons;
  const startDate=campaignProfile.defaultStartDate;
  // Terrain remains lazy: Pacific expands only its selected chart, while an
  // explicitly terrain-less open-ocean area materializes no coastline at all.
  // Never rebuild a whole theater catalogue here on low-memory devices.
  const terrain=area.terrainKey?getPatrolTerrain(area.terrainKey):[];
  return{
    time:{elapsedSeconds:0,timeScale:1,campaignDate:startDate},
    log:[{t:0,level:'info',message:`Patrol commenced. Area: ${resolvedAreaKey}. Good hunting.`}],
    tactical:{activeStation:'TACTICAL',periscopeBearing:90,periscopeZoom:1,bridgeBearing:90,bridgeBinoculars:false,soundBearing:90,soundDisplay:'PASSIVE',selectedTrackId:null,impactObservation:null},
    tdc:{targetId:null,bearing:null,rangeNm:null,targetCourse:null,targetSpeedKnots:null,
      torpedoSpecKey:fresh.torpedoSpecKey,
      torpedoType:fresh.torpedoSpec.name,torpedoSpeedKnots:fresh.torpedoSpec.speedKnots,torpedoMaxRangeNm:fresh.torpedoSpec.maxRangeNm,
      torpedoRunDepthFt:10,
      dudMode:'reduced',
      autoTrack:true,trackSource:'PLOT',
      gyroAngle:null,tubeTurnDeg:null,launchBank:null,launchGeometry:null,solutionCourse:null,interceptRunNm:null,predictedMissNm:null,angleOnBow:null,timeToImpactSec:null,solutionQuality:0,status:'NO TARGET',
      manualBearing:90,manualRange:5,manualCourse:270,manualSpeed:8},
    weapons:{
      tubes:fresh.tubes,
      torpedoInventory:weaponProfile.torpedoInventory,activeTorpedoes:[],nextTorpedoId:1,hits:[],duds:[],explosions:[],
      deckGun:{manned:false,ammo:weaponProfile.deckGun.ammo,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1}
    },
    campaign:{
      // New patrols carry explicit identity. Legacy saves are stamped and
      // validated once by SaveSystem/materializeGameIdentity().
      theaterId:identity.theaterId,playerFactionId:identity.playerFactionId,
      campaignProfileId:identity.campaignProfileId,
      patrolArea:resolvedAreaKey,score:0,scenarioSeed:1,missionStatus:'PATROL',
      patrolNumber:1,totalScore:0,startDate:startDate,
      historyId:`p1-${Date.now().toString(36)}-${Math.floor(Math.random()*1e9).toString(36)}`,
      _careerStartDate:`${startDate} 06:00`,_historyRecorded:false,_historyRecordId:null,
      importantEvents:[],_captainEventSeq:0,
      objectives:[
        {text:'Locate enemy convoy',done:false},
        {text:'Attack merchant shipping',done:false},
        {text:'Evade escort vessels',done:false},
        {text:'Return to friendly port',done:false}
      ],
      optionalObjectives:[],
      friendlyPort:area.ports.find(p=>p.side==='FRIENDLY'),
      tonnageSunk:0,escortsSunk:0,patrolDuration:0,alongside:0,portService:0,_portServiceLock:false,lastPortServiceAt:-999,_rvSeen:false,_approachReached:false,portApproach:null,portRangeNm:null
    },
    map:{cellSizeNm:5,exploredCells:{},ownshipTrail:[],plottedCourse:[],
      estimatedPosition:{xNm:0,yNm:0},lastTrailSampleTime:-999,autoFollowPlot:true,
      recenterSeq:0,weatherOverlay:false},
    world:{
      contacts:[],contactTracks:{},aircraft:[],knuckles:[],collisionEvents:[],lastCollision:null,_collisionCooldowns:{},
      aaManned:false,aaAmmo:weaponProfile.aaGun.ammo,aaKills:0,aaHurt:0,
      airThreat:{level:area.environment.airThreat===undefined?0.55:area.environment.airThreat,alarmedAt:-999,airWarningOn:!!subProfile.sensors.airWarningRadar,sdOn:!!subProfile.sensors.airWarningRadar,nextCheck:120},
      sound:{bearingMarks:{},lastOperatorAt:-999,lastOperatorReport:null,activeEchoLastAt:-999,qcLastAt:-999,_tick:0},
      radar:null,weatherSystem:null,
      traffic:{version:2,enabled:false,groups:[],nextId:1,clock:0,generated:false},
      radio:{pending:null,inbox:[],unread:0,nextBroadcast:getCampaignRadioIntelProfile(identity.campaignProfileId)?.initialBroadcastSec??300,copying:0},
      environment:makePatrolEnvironment(area.environment),
      enemy:{alertState:'UNAWARE',alertTimerSec:0,lastKnownSubPosition:null,lastKnownConfidence:0,
        searchPattern:'RANDOM',searchCenter:{xNm:0,yNm:0},searchAngle:0},
      depthCharges:[],
      harbor:null,harborInitialized:false,harborIntel:null,
      terrain,
      portScenes:materializePortScenes(area),
      ports:area.ports,
      convoyRoutes:area.convoyRoutes,
      shallowZones:terrain.filter(t=>t.depth==='SHALLOW'||t.type==='REEF')
    },
    playerSub:{
      profileId:subProfile.id,presentation:materializeSubmarinePresentation(subProfile.id),dimensions:{...subProfile.dimensions},
      mode:'SURFACED',position:{...(area.start||{xNm:0,yNm:0})},heading:90,orderedHeading:90,rudder:0,
      depthFeet:0,orderedDepthFeet:0,verticalSpeedFps:0,ballastState:'NEUTRAL',trim:0,
      propulsion:{characteristics:fresh.propulsionProfile,engineMode:'DIESEL',orderedRpm:250,actualRpm:0,speedKnots:0,fuel:100,battery:100,chargeRate:0},
      stealth:{silentRunning:false,acousticSignature:0,visualProfile:1},
      damage:{hullIntegrity:100,crushDepthFeet:subProfile.damage.crushDepthFeet,flooding:0,ballastDamage:0,motorDamage:0,
        rudderDamage:0,periscopeDamage:0,tdcDamage:0,gyroDamage:0,pumpDamage:0,electricalDamage:0,
        pumpActive:false,pumpTripped:false,pumpLoadSec:0,damageControlActive:false,repairPriority:'FLOODING',
        driveBankOffline:false,damageEventSeq:0,repairFloor:{},instrumentBias:{},
        crewFatigue:0,oxygen:100,warnings:[]},
      inShallowWater:false,groundingRisk:false,diveDelay:0,
      seabedFeet:3000,keelClearanceFeet:3000,bottomType:'DEEP',bottomed:false,suction:0
    }
  };
}
