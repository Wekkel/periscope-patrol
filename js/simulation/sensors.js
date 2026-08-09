// ═══════════════════════════════════════════════════ CONTACT PLOT FUSION
// Sensor measurements are observations, not vessel positions.  Keep the map
// plot kinematic and let new observations pull it toward a solution at a
// source-appropriate rate.  This prevents a new hydrophone/radar noise sample
// from making a 10-knot merchant appear to teleport hundreds of metres.
const CONTACT_PLOT_PROFILE={
  VISUAL:{rank:5,holdSec:10,tauSec:.01,maxCorrectionNmSec:9,posConf:.97,uncertaintyNm:.018},
  'QC ECHO':{rank:5,holdSec:12,tauSec:.7,maxCorrectionNmSec:.055,posConf:.92,uncertaintyNm:.030},
  'SJ RADAR':{rank:4,holdSec:6,tauSec:3.0,maxCorrectionNmSec:.0025,posConf:.78,uncertaintyNm:.075},
  'SOUND TRIANGULATION':{rank:3,holdSec:24,tauSec:7,maxCorrectionNmSec:.004,posConf:.66,uncertaintyNm:.22},
  'SOUND BEARING':{rank:2,holdSec:0,tauSec:30,maxCorrectionNmSec:0,posConf:.28,uncertaintyNm:.8},
  HYDROPHONE:{rank:1,holdSec:0,tauSec:30,maxCorrectionNmSec:.0035,posConf:.30,uncertaintyNm:.75}
};
function contactPlotProfile(source){return CONTACT_PLOT_PROFILE[source]||CONTACT_PLOT_PROFILE.HYDROPHONE;}
function contactPlotPredicted(tr,now){
  const base=tr.plotPosition||tr.lastFixPosition;if(!base)return null;
  const at=Number.isFinite(tr.plotUpdatedAt)?tr.plotUpdatedAt:(Number.isFinite(tr.lastFixTime)?tr.lastFixTime:now);
  const age=clamp(now-at,0,180),run=knotsNmSec(tr.speedEstimateKnots||0)*age,r=degToRad(tr.courseEstimate||0);
  return{xNm:base.xNm+Math.sin(r)*run,yNm:base.yNm-Math.cos(r)*run};
}
function updateStableContactPlot(state,tr,measurement,source,quality,dt){
  const now=state.time?.elapsedSeconds||0,q=clamp(Number(quality)||0,.02,1),incoming=contactPlotProfile(source);
  const oldSource=tr.positionSource||tr.source||source,old=contactPlotProfile(oldSource);
  const oldFixAt=Number.isFinite(tr.positionFixAt)?tr.positionFixAt:(Number.isFinite(tr.lastFixTime)?tr.lastFixTime:-999);
  const lowerSourceHeld=!!tr.plotPosition&&incoming.rank<old.rank&&(now-oldFixAt)<old.holdSec;
  let pos=contactPlotPredicted(tr,now)||{...measurement};
  tr.rawObservationPosition={...measurement};tr.rawObservationAt=now;tr.lastSensorSource=source;

  /* A visual hull is not a paper bearing plot. Once lookouts can actually see
     the ship, the map swaps the uncertainty symbol for a kinematic hull at the
     observed position. We deliberately do NOT drag the old hydrophone/radar
     plot sideways into place: that made a 10-knot merchant appear to crab at
     100+ knots. The old paper solution is retained briefly only as a fading
     acquisition ghost for the renderer. */
  if(source==='VISUAL'){
    const wasVisual=tr.positionSource==='VISUAL'&&Number.isFinite(tr.visualLastSeenAt)&&(now-tr.visualLastSeenAt)<2;
    if(!wasVisual&&tr.plotPosition){
      tr.visualTransitionFrom={...tr.plotPosition};
      tr.visualTransitionAt=now;tr.visualTransitionSource=oldSource;
      tr.visualTransitionUncertaintyNm=Number.isFinite(tr.positionUncertaintyNm)?tr.positionUncertaintyNm:.35;
    }
    pos={...measurement};
    tr.positionSource='VISUAL';tr.source='VISUAL';tr.positionFixAt=now;
    tr.visualLastSeenAt=now;tr.visualKinematic=true;
    tr.positionConfidence=clamp(.94+q*.04,.94,.985);
    tr.positionUncertaintyNm=lerp(.032,.012,q);
  }else if(!lowerSourceHeld){
    const err=distNm(pos,measurement),stepTime=clamp(Number(dt)||.1,.05,2.5);
    const alpha=1-Math.exp(-stepTime/Math.max(.25,incoming.tauSec));
    const maxStep=incoming.maxCorrectionNmSec*stepTime,step=Math.min(err,err*alpha,maxStep);
    if(err>1e-9&&step>0){const k=step/err;pos={xNm:pos.xNm+(measurement.xNm-pos.xNm)*k,yNm:pos.yNm+(measurement.yNm-pos.yNm)*k};}
    tr.positionSource=source;tr.source=source;tr.positionFixAt=now;tr.visualKinematic=false;
    const targetConf=clamp(incoming.posConf+(q-.5)*(source==='HYDROPHONE'?.16:.08),.08,.98);
    tr.positionConfidence=Number.isFinite(tr.positionConfidence)?lerp(tr.positionConfidence,targetConf,.16):targetConf;
    let targetUnc=incoming.uncertaintyNm;
    if(source==='HYDROPHONE')targetUnc*=lerp(1.8,.65,q);
    else if(source==='SJ RADAR')targetUnc*=lerp(1.45,.72,q);
    tr.positionUncertaintyNm=Number.isFinite(tr.positionUncertaintyNm)?lerp(tr.positionUncertaintyNm,targetUnc,.20):targetUnc;
  }
  tr.plotPosition={...pos};tr.plotUpdatedAt=now;
  // lastFixPosition remains the current best paper solution. positionFixAt above
  // separately records the age of the sensor fix that is steering that plot.
  tr.lastFixPosition={...pos};tr.lastFixTime=now;
  tr.bearing=bearingBetween(state.playerSub.position,pos);tr.rangeEstimateNm=distNm(state.playerSub.position,pos);
  delete tr.truePosition;
  return tr;
}

class SimEngineSensors extends SimEngineIntel {
  updateLookouts(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub,env=W.environment,hist=this.state.campaign?.historicalProfile||null;
    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk),day=clamp(env.daylight,0,1),sea=clamp(env.seaState,0,1);
    let anySeen=false,nearestSeen=null;
    for(const esc of escorts){
      const rng=distNm(esc.position,sub.position);let size,what;
      if(sub.depthFeet<12){size=1;what='surfaced submarine';}
      else if(sub.depthFeet<30){size=.45;what='diving submarine';}
      else if(sub.depthFeet<70){size=(sub.propulsion.speedKnots>4?.16:.07)*(sub.damage.periscopeDamage>.75?0:1);what='periscope';}
      else{size=0;what='';}
      if(size<=0)continue;
      let reach=7*size*clamp(day*1.15+(e.starShellUntil>this.state.time.elapsedSeconds?.55:.12),.10,1.2);
      /* Early-war doctrine/equipment leaves a little more room for bold surface
         running; late-war lookouts and supporting sensors punish it more.  This
         is deliberately a modest gameplay modifier, not a claim that eyesight
         itself changed with the calendar. */
      const surfaceWindow=hist?.surfaceOpportunity||1,enemyVisualFactor=1/Math.sqrt(surfaceWindow);
      reach*=clamp(env.visibilityNm/12,.35,1.35)*(1-sea*.40)*enemyVisualFactor;if(rng>reach)continue;
      const p=clamp(1-rng/reach,0,1)*dt*.55*enemyVisualFactor;if(Math.random()<p){anySeen=true;if(!nearestSeen||rng<nearestSeen.r)nearestSeen={esc,r:rng,what};}
    }
    const now=this.state.time.elapsedSeconds;if(anySeen)e.visualHoldUntil=now+25;
    e.visualOnSub=now<(e.visualHoldUntil||0)&&sub.depthFeet<30;e.periscopeSighted=now<(e.visualHoldUntil||0)&&sub.depthFeet>=30;
    if(anySeen){
      const {esc,r,what}=nearestSeen,hull=sub.depthFeet<30,err=hull?.02:.055;
      e.solution={xNm:sub.position.xNm+(Math.random()-.5)*2*err,yNm:sub.position.yNm+(Math.random()-.5)*2*err,
        courseDeg:normDeg(sub.heading+(hull?(Math.random()-.5)*5:(Math.random()-.5)*40)),speedKn:clamp(sub.propulsion.speedKnots*(.88+Math.random()*.24),0,12),
        depthFt:hull?clamp(sub.depthFeet+(Math.random()-.5)*8,0,40):sub.depthFeet+(Math.random()-.5)*50,errNm:err,ageSec:0,source:'VISUAL'};
      e.lastKnownSubPosition={xNm:e.solution.xNm,yNm:e.solution.yNm};e.searchCenter={xNm:e.solution.xNm,yNm:e.solution.yNm};
      e.alertTimerSec=Math.max(e.alertTimerSec,hull?240:150);e.alertState='ATTACKING';
      if(hull){this.noteASWFix?.(esc,'VISUAL',.96);e.contactHeld=true;esc.sonarContact=false;}
      else{
        const A=this.ensureASWState?.();if(A){A.datum={xNm:e.solution.xNm,yNm:e.solution.yNm,errNm:err,source:'VISUAL'};A.datumAt=now;A.estimatedCourseDeg=e.solution.courseDeg;A.estimatedSpeedKn=e.solution.speedKn;this.assignASWRoles?.(esc.id,true);}
        this.log(`${esc.name} lookouts sighted a ${what} at ${(r*2025).toFixed(0)} yards.`);
      }
      audio.playAlarm();
    }
    if(day<.25&&e.alertState==='ATTACKING'&&e.visualOnSub&&this.state.time.elapsedSeconds>(e.starShellUntil||0)+70&&Math.random()<dt*.06){
      e.starShellUntil=this.state.time.elapsedSeconds+45;this.log('STAR SHELL — the sea around you is lit up like day.','bad');
    }
  }

  /* Active sonar is a cycle, not a continuous oracle. Each escort owns its
     ping clock and short-lived local contact. The shared ASW plot is built from
     returned echoes and then consumed by the ASW brain. */
  updateSonar(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub,env=W.environment,now=this.state.time.elapsedSeconds,hist=this.state.campaign?.historicalProfile||null;
    if(e.alertState==='UNAWARE')return;
    const A=this.ensureASWState?.()||{},layer=env.layerDepthFt||200,belowLayer=sub.depthFeet>layer+15;e.belowLayer=belowLayer;
    if(e.solution){
      const s=e.solution,r=degToRad(s.courseDeg||0),d=knotsNmSec(s.speedKn||0)*dt;s.xNm+=Math.sin(r)*d;s.yNm-=Math.cos(r)*d;
      s.errNm=(s.errNm||.03)+dt*.0055;s.ageSec=(s.ageSec||0)+dt;
    }
    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk),blind=now<(e.sonarBlindUntil||0);let pinged=0,fixes=0;
    for(const esc of escorts){
      if(esc.sonarContact&&now>(esc.sonarContactUntil||-1))esc.sonarContact=false;
      esc.pingTimer=(Number.isFinite(esc.pingTimer)?esc.pingTimer:Math.random()*7)-dt;if(esc.pingTimer>0)continue;
      const plotted=this.aswDatum?.()||e.solution||e.searchCenter,estRng=plotted?distNm(esc.position,plotted):SONAR.maxRangeNm;
      const q=e.solution?clamp(1-(e.solution.errNm||.2)/.45,0,1):0;
      const ranging=!!(esc.sonarContact||e.contactHeld);
      const baseInterval=ranging?clamp(3.2+estRng*.45+(1-q)*2.0,3.0,7.5):clamp(9.5+Math.random()*4.5+(esc.aswRole==='CONVOY_GUARD'?2:0),8.5,16);
      const interval=baseInterval*(hist?.sonarIntervalFactor||1);
      esc.pingTimer=interval;esc.lastPingAt=now;pinged++;audio.playSonarPing(bearingBetween(sub.position,esc.position),sub.heading);
      A.pingEvents=A.pingEvents||[];A.pingEvents.push({t:now,escortId:esc.id,intervalSec:interval,mode:ranging?'RANGING':'SEARCH',role:esc.aswRole||'SCREEN'});if(A.pingEvents.length>80)A.pingEvents.shift();

      const rng=distNm(esc.position,sub.position),dead=rng<SONAR.deadZoneNm;let p=0;
      if(!blind&&!dead&&rng<SONAR.maxRangeNm){p=.88*clamp(1-(rng-SONAR.deadZoneNm)/(SONAR.maxRangeNm-SONAR.deadZoneNm),0,1)*(belowLayer?.26:1)
        *(.5+.5*clamp(sub.propulsion.speedKnots/6,0,1))*(1-clamp(env.seaState,0,1)*.3)*(sub.stealth.silentRunning?.85:1);}
      p=clamp(p*(hist?.aswSkill||1),0,.98);
      const kn=(W.knuckles||[]).find(k=>{const kr=distNm(esc.position,k.pos);return kr<rng&&kr<SONAR.maxRangeNm&&Math.abs(shortDelta(bearingBetween(esc.position,k.pos),bearingBetween(esc.position,sub.position)))<14;});
      if(kn&&Math.random()<.5&&p>0){
        e.solution={xNm:kn.pos.xNm,yNm:kn.pos.yNm,courseDeg:0,speedKn:0,depthFt:120+(Math.random()-.5)*100,errNm:.04,ageSec:0,decoy:true,sourceEscortId:esc.id};
        esc.sonarContact=true;esc.sonarContactUntil=now+interval*1.6;esc.sonarMisses=0;fixes++;this.noteASWFix?.(esc,'ACTIVE',.62);e.contactHeld=true;
        this.log(`${esc.name} is echo-ranging on a knuckle.`);continue;
      }
      if(Math.random()<p){
        const err=(.006+rng*.030+Math.random()*.012+(belowLayer?.022:0))*(hist?.sonarErrorFactor||1),prev=e.solution&&!e.solution.decoy?e.solution:null;
        const nx=sub.position.xNm+(Math.random()-.5)*2*err,ny=sub.position.yNm+(Math.random()-.5)*2*err;
        let crs=A.estimatedCourseDeg,spd=A.estimatedSpeedKn;
        if(prev&&prev.ageSec<70&&prev.ageSec>1){
          const rawC=bearingBetween({xNm:prev.xNm,yNm:prev.yNm},{xNm:nx,yNm:ny}),rawS=distNm({xNm:prev.xNm,yNm:prev.yNm},{xNm:nx,yNm:ny})/prev.ageSec*3600;
          crs=prev.courseDeg===undefined?rawC:normDeg(prev.courseDeg+shortDelta(prev.courseDeg,rawC)*.5);spd=prev.speedKn===undefined?rawS:lerp(prev.speedKn,rawS,.5);
        }
        if(!Number.isFinite(crs))crs=Math.random()*360;if(!Number.isFinite(spd))spd=1+Math.random()*6;
        e.solution={xNm:nx,yNm:ny,courseDeg:normDeg(crs),speedKn:clamp(spd,0,12),depthFt:clamp(sub.depthFeet+(Math.random()-.5)*2*(16+(belowLayer?58:0)),0,420),
          errNm:err,ageSec:0,sourceEscortId:esc.id};
        e.alertTimerSec=Math.max(e.alertTimerSec,190);e.alertState='ATTACKING';
        const wasHeld=!!e.contactHeld;esc.sonarContact=true;esc.sonarContactUntil=now+interval*1.7;esc.sonarMisses=0;this.noteASWFix?.(esc,'ACTIVE',clamp(p,0,1));e.contactHeld=true;fixes++;
        if(wasHeld)A.lastFixAt=now;
      }else{esc.sonarContact=false;esc.sonarMisses=(esc.sonarMisses||0)+1;}
    }
    const held=escorts.some(x=>x.sonarContact&&now<=(x.sonarContactUntil||-1))||!!e.visualOnSub;
    if(held)e.contactHeld=true;
    else if(e.contactHeld&&now-(A.lastFixAt||-999)>14)e.contactHeld=false;
    if(!e.contactHeld&&e.alertState==='ATTACKING'&&now-(A.lastFixAt||-999)>18){e.alertState='SEARCHING';e.searchPattern='COORDINATED';e.searchPhase=0;this.loseASWContact?.();}

    W.knuckles=(W.knuckles||[]).filter(k=>now-k.t<150);
    if(sub.propulsion.speedKnots>4.2&&Math.abs(shortDelta(sub.heading,sub.orderedHeading))>32&&now-(e.lastKnuckle||-99)>22){e.lastKnuckle=now;W.knuckles.push({pos:{...sub.position},t:now});}
    A.lastSonarCycle={t:now,pinged,fixes,held:!!e.contactHeld};
  }
}
