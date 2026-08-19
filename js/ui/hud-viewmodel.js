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
    const missionProgress=typeof missionProgressText==='function'?missionProgressText(s):'';
    const missionTitle=mission.primaryMission?.title||mission.missionName||mission.missionStatus||'Assigned patrol';
    const missionObjectives=(mission.objectives||[]).map(o=>({text:String(o.text||''),done:!!o.done}));
    const optionalObjectives=(mission.optionalObjectives||[]).map(o=>({text:String(o.text||''),done:!!o.done,result:o.result&&o.result!=='not_attempted'?String(o.result).toUpperCase():''}));
    const damageFields=['flooding','ballastDamage','motorDamage','electricalDamage','rudderDamage','periscopeDamage','tdcDamage','gyroDamage','pumpDamage'];
    const damage={hull:vital(pct(hull),'%',hull<30?'critical':hull<60?'caution':'normal'),subsystems:{}};
    for(const key of damageFields){const value=n(d[key]);damage.subsystems[key]=vital(pct(value),'%',value>.65?'critical':value>.3?'caution':'normal');}
    const damageRows=[['Flooding','flooding'],['Ballast','ballastDamage'],['Motor','motorDamage'],['Electrical','electricalDamage'],['Rudder','rudderDamage'],['Periscope','periscopeDamage'],['TDC','tdcDamage'],['Gyro','gyroDamage'],['Pumps','pumpDamage']];
    const damageHtml=(palette)=>{
      const bar=(label,key)=>{const value=n(d[key]),text=fixed(value*100,0)+'%',color=value>.65?palette.bad:value>.3?palette.warn:palette.ok;return `<div class="dmg-row"><span class="dmg-lbl">${label}</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${text};background:${color}"></div></div><span class="dmg-val">${text}</span></div>`;};
      const hv=fixed(hull,0)+'%',hc=hull<30?palette.bad:hull<60?palette.warn:palette.ok;
      const ov=fixed(n(d.oxygen),0)+'%',oc=n(d.oxygen)<25?palette.bad:n(d.oxygen)<50?palette.warn:palette.ok;
      const note=`DC priority: ${typeof repairPriorityLabel==='function'?repairPriorityLabel(d.repairPriority):d.repairPriority||'FLOODING'}${d.driveBankOffline?' · DRIVE BANK OFFLINE':''}${d.pumpTripped?' · PUMP TRIPPED':''}`;
      return `<div class="note" style="margin:0 0 7px;">Hull shows integrity remaining; subsystem rows show damage accumulated.</div><div class="dmg-row"><span class="dmg-lbl">Hull</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${hv};background:${hc}"></div></div><span class="dmg-val">${hv}</span></div>`+
        damageRows.map(([label,key])=>bar(label,key)).join('')+`<div class="note" style="margin:5px 0 8px;">${note}</div><div class="dmg-row"><span class="dmg-lbl">Air quality</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${ov};background:${oc}"></div></div><span class="dmg-val">${ov}</span></div>`;
    };
    damage.desktopHtml=damageHtml({bad:'#e36b5d',warn:'#f0c35a',ok:'#7be08f'});
    damage.touchHtml=damageHtml({bad:'#ef6a58',warn:'#f5c65c',ok:'#6fe08f'});
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
    const systems={contacts:Object.keys(s.world?.contactTracks||{}).length,visibility:n(env.visibilityNm),weather:String(env.weather||'CLEAR'),seaState:n(env.seaState),alertLevel:enemy.alertState||'UNAWARE',activeDepthCharges:(s.world?.depthCharges||[]).length,noise:n(sub.stealth?.acousticSignature),shallowZone:!!sub.inShallowWater,radar:s.world?.radar?.fitLabel||'—',score:n(mission.score),area:mission.patrolArea||''};
    systems.visibilityText=`${fixed(systems.visibility,1)} nm`;systems.seaStateText=fixed(systems.seaState,2);systems.noiseText=fixed(systems.noise,2);systems.noisePercentText=`${fixed(systems.noise*100,0)}%`;systems.scoreText=systems.score.toLocaleString();systems.depthChargesText=String(systems.activeDepthCharges);systems.areaText=(typeof PATROL_AREAS!=='undefined'&&PATROL_AREAS[systems.area]?.displayName)||systems.area;
    systems.desktopHtml=`<span>Contacts</span><strong>${systems.contacts}</strong><span>Visibility</span><strong>${systems.visibilityText}</strong><span>Weather</span><strong>${systems.weather}</strong><span>Sea state</span><strong>${systems.seaStateText}</strong><span>Enemy alert</span><strong>${systems.alertLevel}</strong><span>DCs active</span><strong>${systems.depthChargesText}</strong><span>Noise sig</span><strong>${systems.noiseText}</strong><span>Shallow zone</span><strong style="color:${systems.shallowZone?'var(--alert)':'var(--muted)'}">${systems.shallowZone?'YES':'NO'}</strong><span>Keel clearance</span><strong style="color:${keel<shallowDepth?'var(--alert)':'var(--ok)'}">${fixed(Math.max(0,keel),0)} ft</strong><span>Radar fit</span><strong>${systems.radar}</strong><span>Score</span><strong>${systems.scoreText}</strong><span>Area</span><strong>${systems.areaText}</strong>`;
    systems.touchHtml=`<span>Contacts</span><strong>${systems.contacts}</strong><span>Visibility</span><strong>${systems.visibilityText}</strong><span>Weather</span><strong>${systems.weather}</strong><span>Sea state</span><strong>${systems.seaStateText}</strong><span>Enemy alert</span><strong>${systems.alertLevel}</strong><span>Depth charges</span><strong>${systems.depthChargesText}</strong><span>Noise</span><strong>${systems.noiseText}</strong><span>Shallow zone</span><strong style="color:${systems.shallowZone?'var(--alert)':'var(--muted)'}">${systems.shallowZone?'YES':'NO'}</strong><span>Keel clearance</span><strong style="color:${keel<shallowDepth?'var(--alert)':'var(--ok)'}">${fixed(Math.max(0,keel),0)} ft</strong>`;
    const logCaptain=[...(mission.importantEvents||[])].slice(-30).reverse().map(e=>({date:e.date||`T+${fmtTime(e.t)}`,text:String(e.text||'')}));
    const logPatrol=[...(s.log||[])].slice(-30).map(e=>({time:`T+${fmtTime(e.t)}`,text:String(e.message||''),level:e.level||''}));
    const spec=(typeof TORPEDO_SPECS!=='undefined'&&TORPEDO_SPECS[tdc.torpedoSpecKey])||{};
    const dudMode=(typeof DUD_MODES!=='undefined'&&DUD_MODES[tdc.dudMode])??1;
    const dudChance=typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(s,tdc.torpedoSpecKey,tdc.dudMode):(spec.dudChanceBase||0.25)*dudMode;
    const fire={available:canFire,reason,tubesReady:ready,targetLabel:targetLabel(s,tdc.targetId),solutionNumber:Math.round(n(tdc.solutionQuality)*100),solutionText:`${Math.round(n(tdc.solutionQuality)*100)}%`,tubeTurnText:Number.isFinite(tdc.tubeTurnDeg)?`${tdc.tubeTurnDeg.toFixed(1)}°`:'--',gyroText:tdc.gyroAngle!==null&&tdc.gyroAngle!==undefined?`${tdc.gyroAngle.toFixed(1)}°`:'--',aobText:tdc.angleOnBow!==null&&tdc.angleOnBow!==undefined?`${tdc.angleOnBow.toFixed(0)}°`:'--',ttiText:tdc.timeToImpactSec?`${tdc.timeToImpactSec.toFixed(0)}s`:'--',dudText:`${Math.round(100*dudChance)}%`,rangeBand:range?.band||'',rangeText:range?`${range.label} · R ${range.rangeNm.toFixed(1)} nm · intercept ${range.runNm.toFixed(1)}/${range.maxNm.toFixed(1)} nm · `:''};
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
      fire,
      mission:{title:missionTitle,status:String(mission.missionStatus||''),progressText:missionProgress,objectives:missionObjectives,optionalObjectives,tonnageText:n(mission.tonnageSunk).toLocaleString(),scoreText:n(mission.totalScore??mission.score).toLocaleString(),patrolNumber:mission.patrolNumber},
      damage:{...damage,repairPriority:d.repairPriority||'FLOODING'},
      systems,
      navigation:nav,
      log:{captain:logCaptain,patrol:logPatrol},
      time,
      warnings:warnings.map(x=>({level:x.level,text:x.text}))
    };
  }
  globalThis.buildHudViewModel=buildHudViewModel;
  globalThis.hudRound=round;
  globalThis.hudFixed=fixed;
})();
