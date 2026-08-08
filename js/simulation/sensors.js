class SimEngineSensors extends SimEngineIntel {
  updateLookouts(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub,env=W.environment;
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
      reach*=clamp(env.visibilityNm/12,.35,1.35)*(1-sea*.40);if(rng>reach)continue;
      const p=clamp(1-rng/reach,0,1)*dt*.55;if(Math.random()<p){anySeen=true;if(!nearestSeen||rng<nearestSeen.r)nearestSeen={esc,r:rng,what};}
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
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub,env=W.environment,now=this.state.time.elapsedSeconds;
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
      const interval=ranging?clamp(3.2+estRng*.45+(1-q)*2.0,3.0,7.5):clamp(9.5+Math.random()*4.5+(esc.aswRole==='CONVOY_GUARD'?2:0),8.5,16);
      esc.pingTimer=interval;esc.lastPingAt=now;pinged++;audio.playSonarPing();
      A.pingEvents=A.pingEvents||[];A.pingEvents.push({t:now,escortId:esc.id,intervalSec:interval,mode:ranging?'RANGING':'SEARCH',role:esc.aswRole||'SCREEN'});if(A.pingEvents.length>80)A.pingEvents.shift();

      const rng=distNm(esc.position,sub.position),dead=rng<SONAR.deadZoneNm;let p=0;
      if(!blind&&!dead&&rng<SONAR.maxRangeNm){p=.88*clamp(1-(rng-SONAR.deadZoneNm)/(SONAR.maxRangeNm-SONAR.deadZoneNm),0,1)*(belowLayer?.26:1)
        *(.5+.5*clamp(sub.propulsion.speedKnots/6,0,1))*(1-clamp(env.seaState,0,1)*.3)*(sub.stealth.silentRunning?.85:1);}
      const kn=(W.knuckles||[]).find(k=>{const kr=distNm(esc.position,k.pos);return kr<rng&&kr<SONAR.maxRangeNm&&Math.abs(shortDelta(bearingBetween(esc.position,k.pos),bearingBetween(esc.position,sub.position)))<14;});
      if(kn&&Math.random()<.5&&p>0){
        e.solution={xNm:kn.pos.xNm,yNm:kn.pos.yNm,courseDeg:0,speedKn:0,depthFt:120+(Math.random()-.5)*100,errNm:.04,ageSec:0,decoy:true,sourceEscortId:esc.id};
        esc.sonarContact=true;esc.sonarContactUntil=now+interval*1.6;esc.sonarMisses=0;fixes++;this.noteASWFix?.(esc,'ACTIVE',.62);e.contactHeld=true;
        this.log(`${esc.name} is echo-ranging on a knuckle.`);continue;
      }
      if(Math.random()<p){
        const err=.006+rng*.030+Math.random()*.012+(belowLayer?.022:0),prev=e.solution&&!e.solution.decoy?e.solution:null;
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
