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
  ctx.alertEscorts=(...args)=>engine.alertEscorts(...args);
  ctx.aarRecordEvent=(...args)=>engine.aarRecordEvent(...args);
  ctx.ensureBattleAtmosphereState=(...args)=>engine.ensureBattleAtmosphereState(...args);
  ctx.shake=(...args)=>engine.shake(...args);
  // Temporary service: ensureWorldExtensions is removed in STAP 8.
  ctx.ensureWorldExtensions=(...args)=>HarborSystem.ensureWorldExtensions.call(ctx,...args);
  ctx.damage={applyShock:(...args)=>engine.applyShock(...args)};
  ctx._ensureTacticalExtensions=(...args)=>engine.ensureTacticalExtensions(...args);
  ctx._ensureWorldExtensions=(...args)=>engine.ensureWorldExtensions(...args);
  ctx.isNavigableMapPoint=(...args)=>engine.isNavigableMapPoint(...args);
  ctx.sys.harbor=HarborSystem;ctx.sys.weather=WeatherSystem;ctx.sys.soundRadar=SoundRadarSystem;
  for(const name of ['setupHarbor','ensureHarborApproachWater','ensureHarborIntel','harborOperationProfile','harborOptionalObjective','harborIdentityLabel','refreshHarborOptionalObjective','harborNetSegments','pointSegNm','revealHarborNet','updateHarborGateProgress','harborChannelFrame','ensureWorldExtensions','startHarborSearchlightSweep','scheduleCoastalBatteryShot','updateHarborKnowledge','updateHarbor','grantHarborSpecialIntel','noteHarborAttack','harborTorpedoNetHit'])bindLeafMethod(ctx,HarborSystem,name);
  for(const name of ['ensureWeatherSystem','_spawnWeatherCell','_syncLocalWeather','updateWeather'])bindLeafMethod(ctx,WeatherSystem,name);
  for(const name of ['ensureSoundRadarState','currentSoundSignal','_soundOperatorReport','markSoundBearing','echoRange','_updateSurfaceSearchRadar','updateSoundRadar'])bindLeafMethod(ctx,SoundRadarSystem,name);
  return ctx;
}
