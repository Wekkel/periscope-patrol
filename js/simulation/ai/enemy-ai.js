class SimEngineEnemyAI extends SimEngineTorpedoes {
  alertEscorts(reason,pos,conf){
    const e=this.state.world.enemy;
    const newState=conf>0.75?'ATTACKING':'SEARCHING';
    if(!(e.alertState==='ATTACKING'&&newState==='SEARCHING')) e.alertState=newState;
    const timers={TORPEDO_LAUNCH:280,SHIP_HIT:480,EMERGENCY_BLOW:240,TORPEDO_DUD:160};
    e.alertTimerSec=Math.max(e.alertTimerSec,timers[reason]||200);
    e.lastKnownSubPosition={...pos};
    e.lastKnownConfidence=Math.max(e.lastKnownConfidence,conf);
    e.searchCenter={...pos};
    e.searchPattern=reason==='SHIP_HIT'?'EXPANDING_SQUARE':reason==='TORPEDO_LAUNCH'?'CONVERGE':'CREEPING';
    e.searchPhase=0;
    this.log(`Escorts alerted: ${reason}. State: ${e.alertState}. Pattern: ${e.searchPattern}.`,'warn');

    // Merchants react: speed up, scatter — only on actual hit, not mere launch
    if(reason==='SHIP_HIT'||reason==='TORPEDO_DUD'){
      for(const c of this.state.world.contacts){
        if(c.type==='ESCORT'||c.sunk||c.harborTarget) continue;
        const wasAlerted=c.alertedAt&&(this.state.time.elapsedSeconds-c.alertedAt)<120;
        if(!wasAlerted){
          c.alertedAt=this.state.time.elapsedSeconds;
          // Each merchant picks a random scatter heading away from attack
          const awayBear=bearingBetween(pos,c.position);
          c.scatterHeading=normDeg(awayBear+(Math.random()-0.5)*60);
          c.scatterSpeed=c.speedKnots*1.4; // emergency speed
          c.scattering=true;
          this.log(`${c.name} emergency speed — scattering!`,'warn');
        }
      }
    }
  }

  updateEnemyAI(dt){
    const W=this.state.world; const e=W.enemy; const sub=this.state.playerSub;
    // Alert decay — silent + deep helps
    if(e.alertTimerSec>0){
      let decay=dt;
      if(sub.stealth.silentRunning) decay+=dt*0.5;
      if(sub.depthFeet>120) decay+=dt*0.3;
      if(sub.depthFeet>(this.state.world.environment.layerDepthFt||200)+15) decay+=dt*0.5;
      if(sub.propulsion.speedKnots<3) decay+=dt*0.4;
      if(!e.contactHeld) decay+=dt*0.3;
      e.alertTimerSec=Math.max(0,e.alertTimerSec-decay);
    } else if(e.alertState!=='UNAWARE'){
      e.alertState='UNAWARE'; e.lastKnownConfidence=0;
      this.log('Escorts lost contact. Alert: UNAWARE.');
      if(this.state.campaign.objectives[2]) this.state.campaign.objectives[2].done=true;
    }
    e.searchPhase=(e.searchPhase||0)+dt;

    this.updateSonar(dt);

    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk);
    escorts.forEach((esc,i)=>this.updateEscortBeh(esc,e,sub,W,i,escorts.length,dt));

    this.updateLookouts(dt);

    // Passive sonar by all escorts
    const layerD=W.environment.layerDepthFt||200;
    for(const esc of escorts){
      const rng=distNm(esc.position,sub.position);
      const depthMod=sub.depthFeet>layerD+15?0.32:sub.depthFeet>100?0.6:1.0;
      const det=clamp((sub.stealth.acousticSignature*1.4-0.08)*depthMod/(1+rng*2.2),0,1);
      if(det>0.35&&e.alertState!=='ATTACKING'){
        e.alertState='ATTACKING'; e.alertTimerSec=Math.max(e.alertTimerSec,200);
        e.lastKnownSubPosition={...sub.position};
        this.log(`${esc.name}: passive sonar contact! ATTACKING.`,'bad');
      } else if(det>0.18&&e.alertState==='UNAWARE'){
        e.alertState='SEARCHING'; e.alertTimerSec=Math.max(e.alertTimerSec,120);
        e.searchCenter={...sub.position};
        this.log(`${esc.name}: faint contact. SEARCHING.`,'warn');
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
