class SimEngineEnemyAI extends SimEngineTorpedoes {
  alertEscorts(reason,pos,conf){
    const e=this.state.world.enemy;this.ensureASWState?.();
    const newState=conf>.75?'ATTACKING':'SEARCHING';if(!(e.alertState==='ATTACKING'&&newState==='SEARCHING'))e.alertState=newState;
    const timers={TORPEDO_LAUNCH:280,SHIP_HIT:480,EMERGENCY_BLOW:240,TORPEDO_DUD:160,COLLISION:300,DECK_GUN:260,AIR_ATTACK:220,NOISE:160,ACTIVE_QC:260};
    e.alertTimerSec=Math.max(e.alertTimerSec,timers[reason]||200);
    const q=this.noteASWCue?this.noteASWCue(pos,conf,reason):{xNm:pos.xNm,yNm:pos.yNm};
    e.lastKnownSubPosition={xNm:q.xNm,yNm:q.yNm};e.searchCenter={xNm:q.xNm,yNm:q.yNm};
    e.searchPattern=reason==='SHIP_HIT'?'COORDINATED':reason==='TORPEDO_LAUNCH'?'CONVERGE':'CREEPING';e.searchPhase=0;
    // Important tactical alarms come from actual contact or weapons. A cue that
    // merely wakes the escort screen is patrol-log information, not a toast.
    this.log(`Escort screen alerted by ${reason}; datum uncertainty about ${Math.round((q.errNm||.1)*2025)} yd.`);

    if(reason==='SHIP_HIT'||reason==='TORPEDO_DUD'){
      for(const c of this.state.world.contacts){
        if(c.type==='ESCORT'||c.sunk||c.harborTarget)continue;const wasAlerted=c.alertedAt&&(this.state.time.elapsedSeconds-c.alertedAt)<120;
        if(!wasAlerted){c.alertedAt=this.state.time.elapsedSeconds;const awayBear=bearingBetween(pos,c.position);c.scatterHeading=normDeg(awayBear+(Math.random()-.5)*60);c.scatterSpeed=c.speedKnots*1.4;c.scattering=true;this.log(`${c.name} emergency speed — scattering.`);}
      }
    }
  }

  updateEnemyAI(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub;this.ensureASWState?.();
    if(e.alertTimerSec>0){
      let decay=dt;if(sub.stealth.silentRunning)decay+=dt*.5;if(sub.depthFeet>120)decay+=dt*.3;if(sub.depthFeet>(W.environment.layerDepthFt||200)+15)decay+=dt*.5;if(sub.propulsion.speedKnots<3)decay+=dt*.4;if(!e.contactHeld)decay+=dt*.3;
      e.alertTimerSec=Math.max(0,e.alertTimerSec-decay);
    }else if(e.alertState!=='UNAWARE'){
      e.alertState='UNAWARE';e.lastKnownConfidence=0;e.contactHeld=false;e.solution=null;this.assignASWRoles?.(null,true);this.log('Escort search abandoned; convoy screen reforming.');
      if(this.state.campaign._depthChargeAttackSeen){this.captainLog?.('DEPTH_CHARGE_ATTACK_SURVIVED','Depth-charge attack survived.',{},`dc-survived:${Math.floor((this.state.time.elapsedSeconds||0)/60)}`);this.state.campaign._depthChargeAttackSeen=false;}
      if(this.state.campaign.objectives[2])this.state.campaign.objectives[2].done=true;
    }
    e.searchPhase=(e.searchPhase||0)+dt;this.updateASWBrain?.(dt);this.updateSonar(dt);
    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk);escorts.forEach((esc,i)=>this.updateEscortBeh(esc,e,sub,W,i,escorts.length,dt));
    this.updateLookouts(dt);

    // Passive listening may wake the screen, but it creates a deliberately
    // rough bearing/range datum. It never writes ownship's exact position into
    // the enemy plot and it is not a firm active-sonar contact by itself.
    const layerD=W.environment.layerDepthFt||200;
    for(const esc of escorts){
      const rng=distNm(esc.position,sub.position),depthMod=sub.depthFeet>layerD+15?.32:sub.depthFeet>100?.6:1,
        det=clamp((sub.stealth.acousticSignature*1.4-.08)*depthMod/(1+rng*2.2),0,1);
      if(det>.18&&e.alertState==='UNAWARE'||det>.35&&e.alertState!=='ATTACKING'){
        const trueBear=bearingBetween(esc.position,sub.position),bearErr=(Math.random()-.5)*(det>.35?10:22),rangeFactor=det>.35?.22:.38,
          estRng=clamp(rng*(1+(Math.random()-.5)*2*rangeFactor),.1,SONAR.maxRangeNm*1.25),br=degToRad(normDeg(trueBear+bearErr)),
          est={xNm:esc.position.xNm+Math.sin(br)*estRng,yNm:esc.position.yNm-Math.cos(br)*estRng};
        e.alertState='SEARCHING';e.alertTimerSec=Math.max(e.alertTimerSec,det>.35?180:120);e.lastKnownConfidence=Math.max(e.lastKnownConfidence||0,det);
        const A=this.ensureASWState?.();if(A){A.datum={...est,errNm:clamp(rng*rangeFactor,.16,.9),source:'PASSIVE'};A.datumAt=this.state.time.elapsedSeconds;A.searchStartedAt=this.state.time.elapsedSeconds;A.searchRadiusNm=clamp(.5+rng*rangeFactor,.6,1.8);}
        e.lastKnownSubPosition={...est};e.searchCenter={...est};this.assignASWRoles?.(esc.id,true);
        this.log(`${esc.name}: passive hydrophone bearing — escort screen searching.`);
      }
    }
    this.updateDCs(dt);
  }

  /* ══════════ AIR THREAT ══════════
     How a fleet boat actually found out an aircraft was coming:
       · lookouts on the shears — the main means, daylight and surfaced
       · SD air-search radar — omnidirectional, gives RANGE but no bearing
       · the periscope — possible, but a 32° field pointed at the horizon
         hardly ever catches a plane in time
     And how the aircraft found the boat: a surfaced submarine is visible for
     miles; in the clear water of the tropics a boat at periscope depth could
     be seen from the air. Below about 100 feet you are effectively invisible. */
}
