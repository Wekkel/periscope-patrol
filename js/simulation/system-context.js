/* STAP 7 deelcommit 1: explicit composition context. The former leaf
   prototypes now live as HarborSystem, WeatherSystem and SoundRadarSystem in
   their original files. This file only wires their named dependencies. */
function bindLeafMethod(ctx,system,name){
  ctx[name]=(...args)=>system[name].call(ctx,...args);
}
HarborSystem.update=(ctx,dt)=>HarborSystem.updateHarbor.call(ctx,dt);
WeatherSystem.update=(ctx,dt)=>WeatherSystem.updateWeather.call(ctx,dt);
SoundRadarSystem.update=(ctx,dt)=>SoundRadarSystem.updateSoundRadar.call(ctx,dt);
function createLeafSystemContext(engine){
  const ctx={state:engine.state,bus:engine.bus,sys:{}};
  ctx.emit=(type,payload)=>engine.bus?.dispatch({type,payload});
  ctx.log=(...args)=>engine.log(...args);
  ctx.captainLog=(...args)=>CareerSystem.captainLog.call(ctx,...args);
  ctx.derivMode=(...args)=>engine.derivMode(...args);
  ctx.ensureRadioOperations=(...args)=>IntelSystem.ensureRadioOperations.call(ctx,...args);
  ctx.friendlyPortNav=(...args)=>engine.friendlyPortNav?.(...args);
  ctx.clearDeckForDive=(...args)=>engine.clearDeckForDive(...args);
  ctx.notify=(...args)=>engine.notify(...args);
  ctx.stopAutomaticTimeCompression=(...args)=>engine.stopAutomaticTimeCompression(...args);
  ctx.aar={
    torpedoLaunch:(...args)=>engine.aarTorpedoLaunch?.(...args),
    torpedoFinish:(...args)=>engine.aarTorpedoFinish?.(...args),
    gunRound:(...args)=>engine.aarGunRound?.(...args),
    gunFinish:(...args)=>engine.aarGunFinish?.(...args),
    recordEvent:(...args)=>engine.aarRecordEvent?.(...args),
    enemyResponse:(...args)=>engine.aarEnemyResponse?.(...args),
    buildReplay:(...args)=>engine.buildAfterActionReplay?.(...args)
  };
  ctx.ensureBattleAtmosphereState=(...args)=>engine.ensureBattleAtmosphereState(...args);
  ctx.shake=(...args)=>engine.shake(...args);
  ctx.isNavigableMapPoint=(...args)=>engine.isNavigableMapPoint(...args);
  const api=(system,names)=>Object.fromEntries(names.map(name=>[name,(...args)=>system[name].call(ctx,...args)]));
  ctx.sys.harbor={
    update:(_ctx,dt)=>HarborSystem.update(ctx,dt),
    ...api(HarborSystem,['ensureHarborWorldState','harborTorpedoNetHit','revealHarborNet','noteHarborAttack','updateHarborKnowledge','ensureHarborIntel','grantHarborSpecialIntel'])
  };
  ctx.sys.traffic={trafficIntelCandidates:(...args)=>engine.trafficIntelCandidates(...args)};
  ctx.sys.intel={update:(_ctx,dt)=>IntelSystem.updateRadio.call(ctx,dt),...api(IntelSystem,['threadShippingSignal','ensureRadioOperations','radioCopyRequirement','acceptPartialRadio','updateRadio','composeSignal','intelSummary','interceptSolution','applySignal'])};
  ctx.sys.weather={update:(_ctx,dt)=>WeatherSystem.update(ctx,dt),...api(WeatherSystem,['ensureWeatherSystem'])};
  ctx.sys.soundRadar={update:(_ctx,dt)=>SoundRadarSystem.update(ctx,dt),...api(SoundRadarSystem,['ensureSoundRadarState','markSoundBearing','echoRange'])};
  // Temporary adapters point at classes that are converted in later STEP 7 parts.
  ctx.sys.navigation={updateTdc:(...args)=>engine.updateTdc(...args)};
  ctx.sys.navigation.derivMode=(...args)=>engine.derivMode(...args);
  ctx.sys.navigation.ensureWaterRoute=(...args)=>engine.ensureWaterRoute(...args);
  ctx.sys.navigation.clampToArea=(...args)=>engine.clampToArea(...args);
  ctx.sys.navigation.checkTerrainCollision=(...args)=>engine.checkTerrainCollision(...args);
  ctx.sys.impact={captureShipState:(...args)=>engine.captureImpactShipState?.(...args),offerObservation:(...args)=>engine.offerImpactObservation?.(...args)};
  ctx.sys.enemyAI={
    update:(_ctx,dt)=>EnemyAISystem.updateEnemyAI.call(ctx,dt),
    ...api(EnemyAISystem,['markEscortAlerted','startMerchantEvasion','surfaceAttackObservers','surfaceAlarmRelayType','escortDirectlyNotices','maybeMerchantSpotTorpedo','alertEscorts','updateEnemyAI','updateSurfaceTrafficCombat'])
  };
  ctx.sys.sensors={
    updateSonar:(...args)=>SensorsSystem.updateSonar.call(ctx,...args),
    updateLookouts:(...args)=>SensorsSystem.updateLookouts.call(ctx,...args)
  };
  ctx.sys.escorts={alert:(...args)=>EnemyAISystem.alertEscorts.call(ctx,...args)};
  ctx.sys.collision=api(CollisionSystem,['ensureCollisionState','captureCollisionFrame','surfaceAvoidance','collisionRiskAhead','collisionRiskText','compressedCollisionWatch','vesselMotionVelocity','collisionImpact','resolveSubShipCollision','resolveShipShipCollision','updateVesselCollisions']);
  ctx.sys.damage=api(DamageSystem,['ensureDamageState','_fieldRepairFloor','applyShock','setRepairPriority','updateDmgCtrl']);
  ctx.sys.career=api(CareerSystem,['ensureCareerPatrolState','captainLog','buildPatrolRecord','finalizePatrol']);
  ctx.sys.battleAtmosphere={noteSurfaceGunfire:(...args)=>engine.noteSurfaceGunfire(...args),noteTacticalSignal:(...args)=>engine.noteTacticalSignal(...args)};
  ctx.sys.deckOperations={clearForDive:(...args)=>engine.clearDeckForDive(...args)};
  ctx.sys.mission={checkObjectives:(...args)=>engine.checkMissionObjectives(...args)};
  ctx.sys.torpedoes={update:(_ctx,dt)=>TorpedoSystem.updateTorpedoes.call(ctx,dt),...api(TorpedoSystem,['floodTube','interceptRunNm','fireTorpedo','fireSpread','fireSpreadByPos','reportMiss','sampleTorpedoWake','torpedoWakeForImpact','torpedoWakeForPreImpact','torpedoShipSweepHit'])};
  ctx.sys.deckGun={update:(_ctx,dt)=>DeckGunSystem.updateDeckGun.call(ctx,dt),...api(DeckGunSystem,['deckGunTarget','deckGunBallisticSolution','deckGunElevationFor','layDeckGun','fireDeckGun','segmentShipGunHit','deckGunFallText','damageShipByDeckGun'])};
  ctx.sys.aaGun={update:(_ctx,dt)=>AAGunSystem.updateAAGun.call(ctx,dt),...api(AAGunSystem,['standDownAA','manageAutomaticAA','aaCasualty','airDepthChargeAttack','airAttack'])};
  ctx.sys.aircraft={update:(_ctx,dt)=>AircraftSystem.updateAircraft.call(ctx,dt),...api(AircraftSystem,['updateAirSurfaceTrace','airSurfaceTraceStrength','airAttackDatumPosition','wearAirState','wearAirEligibility','wearAirNotice','noteWearManualAircraft','startWearAirRoutine','abortWearAirRoutine','updateWearAirRoutine','beginAircraftAttack'])};
  ctx.sys.aswBrain={update:(_ctx,dt)=>ASWBrainSystem.updateASWBrain.call(ctx,dt),...api(ASWBrainSystem,['ensureASWState','aswProsecutionLimits','armASWProsecution','aswProsecutionExpiry','resetASWProsecution','convoyFrame','damagedGuardShip','damagedGuardTarget','screenTarget','cueEstimate','noteASWCue','freshStrongASWCue','aswDatum','noteASWFix','loseASWContact','assignASWRoles','searchTarget'])};
  ctx.sys.asw={updateEscortBeh:(...args)=>ASWSystem.updateEscortBeh.call(ctx,...args),updateDCs:(...args)=>ASWSystem.updateDCs.call(ctx,...args)};
  for(const name of ['updateAirSurfaceTrace','airSurfaceTraceStrength','airAttackDatumPosition','wearAirState','wearAirEligibility','wearAirNotice','noteWearManualAircraft','startWearAirRoutine','abortWearAirRoutine','updateWearAirRoutine','beginAircraftAttack','updateAircraft'])bindLeafMethod(ctx,AircraftSystem,name);
  for(const name of ['ensureASWState','aswProsecutionLimits','armASWProsecution','aswProsecutionExpiry','resetASWProsecution','convoyFrame','damagedGuardShip','damagedGuardTarget','screenTarget','cueEstimate','noteASWCue','freshStrongASWCue','aswDatum','noteASWFix','loseASWContact','assignASWRoles','searchTarget','updateASWBrain'])bindLeafMethod(ctx,ASWBrainSystem,name);
  for(const name of ['updateEscortBeh','surfaceAction','dropDC','updateDCs'])bindLeafMethod(ctx,ASWSystem,name);
  for(const name of ['markEscortAlerted','startMerchantEvasion','surfaceAttackObservers','surfaceAlarmRelayType','escortDirectlyNotices','maybeMerchantSpotTorpedo','alertEscorts','updateEnemyAI','updateSurfaceTrafficCombat'])bindLeafMethod(ctx,EnemyAISystem,name);
  for(const name of ['setupHarbor','ensureHarborApproachWater','ensureHarborIntel','harborOperationProfile','harborOptionalObjective','harborIdentityLabel','refreshHarborOptionalObjective','harborNetSegments','pointSegNm','revealHarborNet','updateHarborGateProgress','harborChannelFrame','ensureHarborWorldState','startHarborSearchlightSweep','scheduleCoastalBatteryShot','recordHarborBatteryFire','updateHarborKnowledge','updateHarbor','grantHarborSpecialIntel','noteHarborAttack','harborTorpedoNetHit'])bindLeafMethod(ctx,HarborSystem,name);
  for(const name of ['ensureWeatherSystem','_spawnWeatherCell','_syncLocalWeather','updateWeather'])bindLeafMethod(ctx,WeatherSystem,name);
  for(const name of ['ensureSoundRadarState','currentSoundSignal','_soundOperatorReport','markSoundBearing','echoRange','_updateSurfaceSearchRadar','updateSoundRadar'])bindLeafMethod(ctx,SoundRadarSystem,name);
  for(const name of ['threadShippingSignal','ensureRadioOperations','radioCopyRequirement','acceptPartialRadio','updateRadio','composeSignal','intelSummary','interceptSolution','applySignal'])bindLeafMethod(ctx,IntelSystem,name);
  for(const name of ['updateLookouts','updateSonar'])bindLeafMethod(ctx,SensorsSystem,name);
  for(const name of ['ensureCollisionState','captureCollisionFrame','surfaceAvoidance','collisionRiskAhead','collisionRiskText','compressedCollisionWatch','vesselMotionVelocity','collisionImpact','resolveSubShipCollision','resolveShipShipCollision','updateVesselCollisions'])bindLeafMethod(ctx,CollisionSystem,name);
  for(const name of ['ensureDamageState','_fieldRepairFloor','applyShock','setRepairPriority','updateDmgCtrl'])bindLeafMethod(ctx,DamageSystem,name);
  for(const name of ['ensureCareerPatrolState','captainLog','buildPatrolRecord','finalizePatrol'])bindLeafMethod(ctx,CareerSystem,name);
  return ctx;
}
