// Pure HUD projection.  Presenters consume this object; they do not own game
// calculations or unit conversions.
(function(){
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const round=(v,d=0)=>{const p=10**d;return Math.round(n(v)*p)/p;};
  const fixed=(v,d=0)=>round(v,d).toFixed(d);
  const pct=(v)=>round(n(v),0);
  const stateFor=(v,caution,critical)=>n(v)>=critical?'critical':n(v)>=caution?'caution':'normal';
  const vital=(value,unit,state='normal',actionable=false,raw=null)=>({value,unit,state,actionable,raw});
  const depthText=(state,v)=>typeof playerDepthDisplay==='function'?playerDepthDisplay(state,n(v),0):`${round(v)} ft`;
  const timeText=(v)=>typeof DayNightCycle!=='undefined'&&DayNightCycle.getTimeString?DayNightCycle.getTimeString(n(v)):fmtTime(n(v));
  const targetLabel=(state,id)=>{
    if(!id)return '';
    const t=state.world?.contactTracks?.[id]||state.world?.contacts?.find?.(x=>x.id===id);
    return t?.name||t?.label||id;
  };
  function buildHudViewModel(state,layout){
    const s=state||{},sub=s.playerSub||{},p=sub.propulsion||{},d=sub.damage||{},tdc=s.tdc||{},w=s.weapons||{},env=s.world?.environment||{},enemy=s.world?.enemy||{};
    const keel=n(sub.keelClearanceFeet), depth=n(sub.depthFeet), battery=n(p.battery), fuel=n(p.fuel), hull=n(d.hullIntegrity);
    const shallowDepth=depth<12?18:70;
    const tubes=Array.isArray(w.tubes)?w.tubes:[], ready=tubes.filter(t=>t.status==='READY').length;
    const range=typeof torpedoRangeInfo==='function'?torpedoRangeInfo(s,tdc.targetId):null;
    const canFire=!!tdc.targetId&&n(tdc.solutionQuality)>=.25&&ready>0;
    let reason='';
    if(!tdc.targetId)reason='No target selected.';
    else if(!ready)reason='No torpedo tube is ready.';
    else if(n(tdc.solutionQuality)<.25)reason=range?.band==='OUT'?'Target is outside torpedo range.':'No firing solution is ready.';
    const torp=typeof torpedoStoresStatus==='function'?torpedoStoresStatus(s):{total:tubes.length,loadShort:'—'};
    const threat=enemy.alertState==='UNAWARE'?'clear':String(enemy.alertState||'clear');
    const warnings=d.warnings||[];
    const mission=s.campaign||{};
    const objectives=(mission.objectives||[]).map(o=>({text:String(o.text||''),status:o.done?'done':(o.result||'pending')}));
    const damageFields=['flooding','ballastDamage','motorDamage','electricalDamage','rudderDamage','periscopeDamage','tdcDamage','gyroDamage','pumpDamage'];
    const damage={hull:vital(pct(hull),'%',hull<30?'critical':hull<60?'caution':'normal'),subsystems:{}};
    for(const key of damageFields){const value=n(d[key]);damage.subsystems[key]=vital(pct(value),'%',value>.65?'critical':value>.3?'caution':'normal');}
    const navPosition=s.map?.plottedCourse?.[0], auto=s.map?.autoFollowPlot&&!!navPosition;
    const nav={mode:sub.mode||'',position:sub.position?{x:n(sub.position.x),y:n(sub.position.y)}:null,autopilotTarget:navPosition||null,trackCount:Object.keys(s.world?.contactTracks||{}).length,torpedoStatus:tdc.status||'',weather:String(env.weather||'CLEAR'),mapStatus:auto?'AUTO':'MANUAL',quick:{depth:depthText(s,depth),heading:typeof fmtDeg==='function'?fmtDeg(sub.heading):`${round(sub.heading)}°`,speed:`${fixed(p.speedKnots,1)}kn`,hull:`${fixed(hull,0)}%`,fuel:`${fixed(fuel,0)}%`,torpedoes:`${torp.total??0}·${torp.loadShort||'—'}`,batteryState:battery>=99.5?'FULL':p.engineMode==='DIESEL'?'CHG':p.engineMode==='ELECTRIC'?'DRAIN':'HOLD',orderedDepth:depthText(s,sub.orderedDepthFeet),orderedDepthVisible:Math.abs(n(sub.orderedDepthFeet)-depth)>=2?depthText(s,sub.orderedDepthFeet):'',orderedHeading:typeof fmtDeg==='function'?fmtDeg(sub.orderedHeading):`${round(sub.orderedHeading)}°`,orderedRpm:`${fixed(p.orderedRpm,0)} rpm`,actualRpm:fixed(p.actualRpm,0),silent:!!sub.stealth?.silentRunning,keel:sub.seabedFeet>=3000?'deep':depthText(s,Math.max(0,keel-depth)),bottom:sub.bottomed?'ON BOTTOM':sub.seabedFeet>=3000?'':`${depthText(s,sub.seabedFeet)} ${(sub.bottomType||'').toLowerCase()}`}};
    nav.orders={heading:typeof fmtDeg==='function'?fmtDeg(sub.heading):`${round(sub.heading)}°`,orderedHeading:typeof fmtDeg==='function'?fmtDeg(sub.orderedHeading):`${round(sub.orderedHeading)}°`,depth:depthText(s,depth),orderedDepth:depthText(s,sub.orderedDepthFeet),actualRpm:fixed(p.actualRpm,0),orderedRpm:fixed(p.orderedRpm,0),speed:fixed(p.speedKnots,1),mode:sub.mode||'',engine:p.engineMode||'',silent:sub.stealth?.silentRunning?'ON':'OFF'};
    nav.positionText=nav.position?`${nav.position.x.toFixed(2)} / ${nav.position.y.toFixed(2)} nm`:'—';
    nav.autopilotText=navPosition?`${s.map.plottedCourse.length} waypoint(s) · WP1 ${distNm(sub.position,navPosition).toFixed(1)}nm on ${fmtDeg(bearingBetween(sub.position,navPosition))} · ${auto?'autopilot steering':'autopilot off — manual helm'}`:'No waypoints. Tap open water on the map to plot one, tap a waypoint to delete it.';
    const time={campaignDate:s.time?.campaignDateTime||'',elapsed:n(s.time?.elapsedSeconds),scale:n(s.time?.timeScale,1),transit:!!(n(s.time?.transitUntil)>n(s.time?.elapsedSeconds)),timeText:timeText(s.time?.elapsedSeconds)};
    const done=n(s.time?.elapsedSeconds)-(n(s.time?.transitFrom)),left=n(s.time?.transitUntil)-n(s.time?.elapsedSeconds),planned=n(s.time?.transitUntil)-n(s.time?.transitFrom);
    time.scaleText=time.scale===0?'PAUSED':`${time.scale}x`;time.transitText=time.transit?(Number.isFinite(left)?`⏩ TRANSIT — start ${timeText(s.time?.transitFrom||0)} · ${fmtTime(planned)} planned · ${fmtTime(done)} run · ${fmtTime(left)} left · ends ${timeText(s.time?.transitUntil)}`:`⏩ TRANSIT — ${fmtTime(done)} run · until something happens`):'';
    const dl=n(env.daylight),icon=dl>.6?'☀':dl>.25?'🌅':'🌙',vis=n(env.visibilityNm),quality=vis>=8?'GOOD VIS':vis>=4?'FAIR VIS':'POOR VIS';time.clockText=`${icon} ${timeText(s.time?.elapsedSeconds)}`;time.desktopClockText=timeText(s.time?.elapsedSeconds);time.touchClockText=time.clockText;time.conditionsText=`${String(env.weather||'CLEAR').replace(/_/g,' ')} · ${quality} VIS`;time.touchConditionsText=time.conditionsText;time.desktopConditionsText=`${icon} ${timeText(s.time?.elapsedSeconds)} · ${String(env.weather||'CLEAR').replace(/_/g,' ')} · ${vis.toFixed(1)} NM ${quality}`;
    const sea=sub.seabedFeet??3000;
    const operation={depthValue:depthText(s,sub.orderedDepthFeet),speedRpm:`${fixed(p.orderedRpm,0)} rpm`,nowDepth:`now ${depthText(s,depth)} · ${sub.verticalSpeedFps>0.05?'going down':sub.verticalSpeedFps<-0.05?'coming up':'steady'}`,nowSpeed:`now ${fixed(p.speedKnots,1)} kn · ${(p.engineMode||'').toLowerCase()}`,orderedSpeedNote:`about ${fixed(p.speedKnots,1)} kn ordered · ${p.engineMode==='DIESEL'?'diesels — charging fastest at low revs':'battery '+fixed(battery,0)+'% — flank drains it fast'}`,
      depthNote:sub.bottomed?`Lying on the bottom in ${depthText(s,sea)} of ${(sub.bottomType||'').toLowerCase()}. Order revs or a shallower depth to come off her.`:sub.cannotHoldDepth?'SHE WILL NOT ANSWER THE PLANES — blow main ballast, pumps on, get way on her.':(s.world?.aaManned||s.weapons?.deckGun?.manned)?`${s.weapons?.deckGun?.manned?'Deck-gun':'AA'} crew topside — a dive order will clear the deck automatically and wait briefly for the hatch.`:sea<3000?`Fathometer ${depthText(s,sea)}, ${(sub.bottomType||'').toLowerCase()} — safe to ${depthText(s,Math.max(0,sea-25))}. Crush depth ${depthText(s,d.crushDepthFeet)}.`:`Deep water. Periscope depth ${depthText(s,55)}. Crush depth ${depthText(s,d.crushDepthFeet)}.`};
    nav.operation=operation;
    return {
      layout:layout||null,
      vitals:{
        depth:vital(depthText(s,depth),'',depth>n(d.crushDepthFeet)*.8?'critical':sub.inShallowWater?'caution':'normal',true),
        underKeel:vital(`${fixed(keel,0)} ft`,`${fixed(keel-depth,0)} ft gap`,keel<shallowDepth?'critical':keel<shallowDepth+40?'caution':'normal',false),
        heading:vital(typeof fmtDeg==='function'?fmtDeg(sub.heading):`${round(sub.heading)}°`,'', 'normal',false),
        speed:vital(`${fixed(p.speedKnots,1)} kn`,'kn','normal',true),
        torpedoes:vital(layout?.shell==='touch'?`${torp.total??0}·${torp.loadShort||'—'}`:`${torp.total??0} aboard · ${torp.reserve??0} reserve · ${torp.loadShort||'—'}`,'','normal',false),
        battery:vital(`${fixed(battery,0)}%`,battery>=99.5?'full':p.engineMode==='DIESEL'?'charging':'discharging',battery<12?'critical':battery<25?'caution':'normal',false,battery),
        fuel:vital(`${fixed(fuel,0)}%`,'%',fuel<12?'critical':fuel<25?'caution':'normal',false,fuel),
        threat:vital(threat,'',enemy.alertState==='ATTACKING'?'critical':enemy.alertState==='UNAWARE'?'normal':'caution',false),
        hull:vital(`${fixed(hull,0)}%`,'%',hull<35?'critical':hull<70?'caution':'normal',false,hull)
      },
      fire:{available:canFire,reason,tubesReady:ready,targetLabel:targetLabel(s,tdc.targetId)},
      mission:{title:mission.primaryMission?.title||mission.missionName||mission.missionStatus||'Assigned patrol',objectives,tonnage:n(mission.tonnageSunk),patrolNumber:mission.patrolNumber},
      damage:{...damage,repairPriority:d.repairPriority||'FLOODING'},
      systems:{contacts:Object.keys(s.world?.contactTracks||{}).length,visibility:n(env.visibilityNm),weather:String(env.weather||'CLEAR'),seaState:n(env.seaState),alertLevel:enemy.alertState||'UNAWARE',activeDepthCharges:(s.world?.depthCharges||[]).length,noise:n(sub.stealth?.acousticSignature),shallowZone:!!sub.inShallowWater,radar:s.world?.radar?.fitLabel||'—',score:n(mission.score),area:mission.patrolArea||''},
      navigation:nav,
      log:{captain:[...(mission.importantEvents||[])].slice(-30),patrol:[...(s.log||[])].slice(-30)},
      time,
      warnings:warnings.map(x=>({level:x.level,text:x.text}))
    };
  }
  globalThis.buildHudViewModel=buildHudViewModel;
  globalThis.hudRound=round;
  globalThis.hudFixed=fixed;
})();
