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
      navigation:{mode:sub.mode||'',position:sub.position?{x:n(sub.position.x),y:n(sub.position.y)}:null,autopilotTarget:s.map?.plottedCourse?.[0]||null,trackCount:Object.keys(s.world?.contactTracks||{}).length,torpedoStatus:tdc.status||'',weather:String(env.weather||'CLEAR'),mapStatus:s.map?.autoFollowPlot?'AUTO':'MANUAL',quick:{depth:depthText(s,depth),heading:typeof fmtDeg==='function'?fmtDeg(sub.heading):`${round(sub.heading)}°`,speed:`${fixed(p.speedKnots,1)}kn`,hull:`${fixed(hull,0)}%`,fuel:`${fixed(fuel,0)}%`,torpedoes:`${torp.total??0}·${torp.loadShort||'—'}`,batteryState:battery>=99.5?'FULL':p.engineMode==='DIESEL'?'CHG':p.engineMode==='ELECTRIC'?'DRAIN':'HOLD',orderedDepth:depthText(s,sub.orderedDepthFeet),orderedDepthVisible:Math.abs(n(sub.orderedDepthFeet)-depth)>=2?depthText(s,sub.orderedDepthFeet):'',orderedHeading:typeof fmtDeg==='function'?fmtDeg(sub.orderedHeading):`${round(sub.orderedHeading)}°`,orderedRpm:`${fixed(p.orderedRpm,0)} rpm`,actualRpm:fixed(p.actualRpm,0),silent:!!sub.stealth?.silentRunning,keel:sub.seabedFeet>=3000?'deep':depthText(s,Math.max(0,keel-depth)),bottom:sub.bottomed?'ON BOTTOM':sub.seabedFeet>=3000?'':`${depthText(s,sub.seabedFeet)} ${(sub.bottomType||'').toLowerCase()}`}},
      log:{captain:[...(mission.importantEvents||[])].slice(-30),patrol:[...(s.log||[])].slice(-30)},
      time:{campaignDate: s.time?.campaignDateTime||'',elapsed:n(s.time?.elapsedSeconds),scale:n(s.time?.timeScale,1),transit:!!(n(s.time?.transitUntil)>n(s.time?.elapsedSeconds)),timeText:timeText(s.time?.elapsedSeconds)},
      warnings:warnings.map(x=>({level:x.level,text:x.text}))
    };
  }
  globalThis.buildHudViewModel=buildHudViewModel;
  globalThis.hudRound=round;
  globalThis.hudFixed=fixed;
})();
