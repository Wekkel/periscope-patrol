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
  ctx.captainLog=(...args)=>engine.captainLog(...args);
  ctx.notify=(...args)=>engine.notify(...args);
  ctx.aar={
    torpedoLaunch:(...args)=>engine.aarTorpedoLaunch?.(...args),
    torpedoFinish:(...args)=>engine.aarTorpedoFinish?.(...args),
    gunRound:(...args)=>engine.aarGunRound?.(...args),
    gunFinish:(...args)=>engine.aarGunFinish?.(...args),
    recordEvent:(...args)=>engine.aarRecordEvent?.(...args)
  };
  ctx.ensureBattleAtmosphereState=(...args)=>engine.ensureBattleAtmosphereState(...args);
  ctx.shake=(...args)=>engine.shake(...args);
  // Temporary service: ensureWorldExtensions is removed in STAP 8.
  ctx.ensureWorldExtensions=(...args)=>HarborSystem.ensureWorldExtensions.call(ctx,...args);
  ctx._ensureTacticalExtensions=(...args)=>engine.ensureTacticalExtensions(...args);
  ctx._ensureWorldExtensions=(...args)=>engine.ensureWorldExtensions(...args);
  ctx.isNavigableMapPoint=(...args)=>engine.isNavigableMapPoint(...args);
  const api=(system,names)=>Object.fromEntries(names.map(name=>[name,(...args)=>system[name].call(ctx,...args)]));
  ctx.sys.harbor={
    update:(_ctx,dt)=>HarborSystem.update(ctx,dt),
    ...api(HarborSystem,['harborTorpedoNetHit','revealHarborNet','noteHarborAttack'])
  };
  ctx.sys.weather=WeatherSystem;
  ctx.sys.soundRadar={update:(_ctx,dt)=>SoundRadarSystem.update(ctx,dt),...api(SoundRadarSystem,['markSoundBearing','echoRange'])};
  // Temporary adapters point at classes that are converted in later STEP 7 parts.
  ctx.sys.navigation={updateTdc:(...args)=>engine.updateTdc(...args)};
  ctx.sys.impact={captureShipState:(...args)=>engine.captureImpactShipState?.(...args),offerObservation:(...args)=>engine.offerImpactObservation?.(...args)};
  ctx.sys.enemyAI={maybeMerchantSpotTorpedo:(...args)=>engine.maybeMerchantSpotTorpedo?.(...args)};
  ctx.sys.escorts={alert:(...args)=>engine.alertEscorts(...args)};
  ctx.sys.damage={applyShock:(...args)=>engine.applyShock(...args)};
  ctx.sys.deckOperations={clearForDive:(...args)=>engine.clearDeckForDive(...args)};
  ctx.sys.mission={checkObjectives:(...args)=>engine.checkMissionObjectives(...args)};
  ctx.sys.torpedoes={update:(_ctx,dt)=>TorpedoSystem.updateTorpedoes.call(ctx,dt),...api(TorpedoSystem,['floodTube','interceptRunNm','fireTorpedo','fireSpread','fireSpreadByPos','reportMiss','sampleTorpedoWake','torpedoWakeForImpact','torpedoWakeForPreImpact','torpedoShipSweepHit'])};
  ctx.sys.deckGun={update:(_ctx,dt)=>DeckGunSystem.updateDeckGun.call(ctx,dt),...api(DeckGunSystem,['deckGunTarget','deckGunBallisticSolution','deckGunElevationFor','layDeckGun','fireDeckGun','segmentShipGunHit','deckGunFallText','damageShipByDeckGun'])};
  ctx.sys.aaGun={update:(_ctx,dt)=>AAGunSystem.updateAAGun.call(ctx,dt),...api(AAGunSystem,['standDownAA','manageAutomaticAA','aaCasualty','airDepthChargeAttack','airAttack'])};
  for(const name of ['setupHarbor','ensureHarborApproachWater','ensureHarborIntel','harborOperationProfile','harborOptionalObjective','harborIdentityLabel','refreshHarborOptionalObjective','harborNetSegments','pointSegNm','revealHarborNet','updateHarborGateProgress','harborChannelFrame','ensureWorldExtensions','startHarborSearchlightSweep','scheduleCoastalBatteryShot','recordHarborBatteryFire','updateHarborKnowledge','updateHarbor','grantHarborSpecialIntel','noteHarborAttack','harborTorpedoNetHit'])bindLeafMethod(ctx,HarborSystem,name);
  for(const name of ['ensureWeatherSystem','_spawnWeatherCell','_syncLocalWeather','updateWeather'])bindLeafMethod(ctx,WeatherSystem,name);
  for(const name of ['ensureSoundRadarState','currentSoundSignal','_soundOperatorReport','markSoundBearing','echoRange','_updateSurfaceSearchRadar','updateSoundRadar'])bindLeafMethod(ctx,SoundRadarSystem,name);
  return ctx;
}
