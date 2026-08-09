// ═══════════════════════════════════════════════════ STATE
function createState(areaKey){
  const area=PATROL_AREAS[areaKey];
  return{
    time:{elapsedSeconds:0,timeScale:1,campaignDate:'1943-08-17'},
    log:[{t:0,level:'info',message:`Patrol commenced. Area: ${areaKey}. Good hunting.`}],
    tactical:{activeStation:'TACTICAL',periscopeBearing:90,periscopeZoom:1,bridgeBearing:90,bridgeBinoculars:false,soundBearing:90,soundDisplay:'PASSIVE',selectedTrackId:null},
    tdc:{targetId:null,bearing:null,rangeNm:null,targetCourse:null,targetSpeedKnots:null,
      torpedoSpecKey:'mk14fast',
      torpedoType:'Mark 14 Fast',torpedoSpeedKnots:46,torpedoMaxRangeNm:4.9,
      torpedoRunDepthFt:10,
      dudMode:'reduced',
      autoTrack:true,trackSource:'PLOT',
      gyroAngle:null,angleOnBow:null,timeToImpactSec:null,solutionQuality:0,status:'NO TARGET',
      manualBearing:90,manualRange:5,manualCourse:270,manualSpeed:8},
    weapons:{
      tubes:[
        // Forward tubes 1-4
        {id:1,pos:'FWD',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:0,reloadProgress:1,spreadOffsetDeg:0},
        {id:2,pos:'FWD',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:0,reloadProgress:1,spreadOffsetDeg:0},
        {id:3,pos:'FWD',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:0,reloadProgress:1,spreadOffsetDeg:0},
        {id:4,pos:'FWD',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:0,reloadProgress:1,spreadOffsetDeg:0},
        // Aft tubes 5-6 (fire 180° from heading)
        {id:5,pos:'AFT',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:180,reloadProgress:1,spreadOffsetDeg:0},
        {id:6,pos:'AFT',status:'LOADED_DRY',specKey:'mk14fast',flooded:false,gyroAngle:180,reloadProgress:1,spreadOffsetDeg:0}
      ],
      torpedoInventory:16,activeTorpedoes:[],nextTorpedoId:1,hits:[],duds:[],explosions:[],
      deckGun:{manned:false,ammo:120,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1}
    },
    campaign:{
      patrolArea:areaKey,score:0,scenarioSeed:1,missionStatus:'PATROL',
      patrolNumber:1,totalScore:0,startDate:'1943-08-17',
      historyId:`p1-${Date.now().toString(36)}-${Math.floor(Math.random()*1e9).toString(36)}`,
      _careerStartDate:'1943-08-17 06:00',_historyRecorded:false,_historyRecordId:null,
      importantEvents:[],_captainEventSeq:0,
      objectives:[
        {text:'Locate enemy convoy',done:false},
        {text:'Attack merchant shipping',done:false},
        {text:'Evade escort vessels',done:false},
        {text:'Return to friendly port',done:false}
      ],
      optionalObjectives:[],
      friendlyPort:area.ports.find(p=>p.side==='FRIENDLY'),
      tonnageSunk:0,escortsSunk:0,patrolDuration:0,alongside:0,_rvSeen:false,_approachReached:false,portApproach:null,portRangeNm:null
    },
    map:{cellSizeNm:5,exploredCells:{},ownshipTrail:[],plottedCourse:[],
      estimatedPosition:{xNm:0,yNm:0},lastTrailSampleTime:-999,autoFollowPlot:true,
      recenterSeq:0},
    world:{
      contacts:[],contactTracks:{},aircraft:[],knuckles:[],collisionEvents:[],lastCollision:null,_collisionCooldowns:{},
      aaManned:false,aaAmmo:1200,aaKills:0,aaHurt:0,
      airThreat:{level:area.environment.airThreat===undefined?0.55:area.environment.airThreat,alarmedAt:-999,sdOn:true,nextCheck:120},
      sound:{bearingMarks:{},lastOperatorAt:-999,lastOperatorReport:null,qcLastAt:-999,_tick:0},
      radar:null,weatherSystem:null,
      traffic:{version:1,enabled:false,groups:[],nextId:1,clock:0,generated:false},
      radio:{pending:null,inbox:[],unread:0,nextBroadcast:300,copying:0},
      environment:{...area.environment},
      enemy:{alertState:'UNAWARE',alertTimerSec:0,lastKnownSubPosition:null,lastKnownConfidence:0,
        searchPattern:'RANDOM',searchCenter:{xNm:0,yNm:0},searchAngle:0},
      depthCharges:[],
      harbor:null,harborInitialized:false,harborIntel:null,
      terrain:area.terrain,
      ports:area.ports,
      convoyRoutes:area.convoyRoutes,
      shallowZones:area.terrain.filter(t=>t.depth==='SHALLOW'||t.type==='REEF')
    },
    playerSub:{
      mode:'SURFACED',position:{...(area.start||{xNm:0,yNm:0})},heading:90,orderedHeading:90,rudder:0,
      depthFeet:0,orderedDepthFeet:0,verticalSpeedFps:0,ballastState:'NEUTRAL',trim:0,
      propulsion:{engineMode:'DIESEL',orderedRpm:250,actualRpm:0,speedKnots:0,fuel:100,battery:100,chargeRate:0},
      stealth:{silentRunning:false,acousticSignature:0,visualProfile:1},
      damage:{hullIntegrity:100,crushDepthFeet:420,flooding:0,ballastDamage:0,motorDamage:0,
        rudderDamage:0,periscopeDamage:0,tdcDamage:0,gyroDamage:0,pumpDamage:0,electricalDamage:0,
        pumpActive:false,pumpTripped:false,pumpLoadSec:0,damageControlActive:false,repairPriority:'FLOODING',
        driveBankOffline:false,damageEventSeq:0,repairFloor:{},instrumentBias:{},
        crewFatigue:0,oxygen:100,warnings:[]},
      inShallowWater:false,groundingRisk:false,diveDelay:0,
      seabedFeet:3000,keelClearanceFeet:3000,bottomType:'DEEP',bottomed:false,suction:0
    }
  };
}

