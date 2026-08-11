class SimEngineEnemyAI extends SimEngineTorpedoes {
  alertEscorts(reason,pos,conf){
    const W=this.state.world,e=W.enemy;this.ensureASWState?.();
    // Patch 7: an explosion beside a lone freighter must not telepathically
    // wake the primary convoy screen 80 nm away. The shared ASW brain is local
    // tactical state, so only a nearby real escort can receive this cue.
    const localEscorts=(W.contacts||[]).filter(c=>isASWCombatant(c)&&distNm(c.position,pos)<=18);
    if(!localEscorts.length){
      if(reason==='SHIP_HIT'||reason==='TORPEDO_DUD'||reason==='TORPEDO_LAUNCH'||reason==='DECK_GUN')
        this.log(`Distant shipping alarm — ${reason.replaceAll('_',' ').toLowerCase()}, but no escort screen is close enough to react.`);
      return false;
    }
    const newState=conf>.75?'ATTACKING':'SEARCHING';if(!(e.alertState==='ATTACKING'&&newState==='SEARCHING'))e.alertState=newState;
    const timers={TORPEDO_LAUNCH:360,SHIP_HIT:600,EMERGENCY_BLOW:260,TORPEDO_DUD:210,COLLISION:320,DECK_GUN:340,AIR_ATTACK:240,NOISE:180,ACTIVE_QC:280};
    e.alertTimerSec=Math.max(e.alertTimerSec,timers[reason]||200);
    const q=this.noteASWCue?this.noteASWCue(pos,conf,reason):{xNm:pos.xNm,yNm:pos.yNm};
    e.lastKnownSubPosition={xNm:q.xNm,yNm:q.yNm};e.searchCenter={xNm:q.xNm,yNm:q.yNm};
    e.searchPattern=reason==='SHIP_HIT'?'COORDINATED':reason==='TORPEDO_LAUNCH'?'CONVERGE':'CREEPING';e.searchPhase=0;
    // Important tactical alarms come from actual contact or weapons. A cue that
    // merely wakes the escort screen is patrol-log information, not a toast.
    this.log(`Escort screen alerted by ${reason}; datum uncertainty about ${Math.round((q.errNm||.1)*2025)} yd.`);

    if(reason==='SHIP_HIT'||reason==='TORPEDO_DUD'){
      for(const c of this.state.world.contacts){
        if(isSurfaceCombatant(c)||c.sunk||c.harborTarget||(c.side&&c.side!=='ENEMY'))continue;const wasAlerted=c.alertedAt&&(this.state.time.elapsedSeconds-c.alertedAt)<120;
        if(!wasAlerted){c.alertedAt=this.state.time.elapsedSeconds;const awayBear=bearingBetween(pos,c.position);c.scatterHeading=normDeg(awayBear+(Math.random()-.5)*60);c.scatterSpeed=c.speedKnots*1.4;c.scattering=true;this.log(`${c.name} emergency speed — scattering.`);}
      }
    }
    return true;
  }

  updateEnemyAI(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub;this.ensureASWState?.();
    if(e.alertTimerSec>0){
      // Quiet/deep running reduces SENSOR quality; it should not make a destroyer
      // forget a torpedo explosion twice as fast. Search persistence now decays
      // mostly with time, with only a modest bonus when contact is truly lost.
      let decay=dt;if(!e.contactHeld)decay+=dt*.08;if(!e.contactHeld&&sub.depthFeet>(W.environment.layerDepthFt||200)+15)decay+=dt*.10;
      e.alertTimerSec=Math.max(0,e.alertTimerSec-decay);
    }else if(e.alertState!=='UNAWARE'){
      e.alertState='UNAWARE';e.lastKnownConfidence=0;e.contactHeld=false;e.solution=null;this.assignASWRoles?.(null,true);this.log('Escort search abandoned; convoy screen reforming.');
      if(this.state.campaign._depthChargeAttackSeen){this.captainLog?.('DEPTH_CHARGE_ATTACK_SURVIVED','Depth-charge attack survived.',{},`dc-survived:${Math.floor((this.state.time.elapsedSeconds||0)/60)}`);this.state.campaign._depthChargeAttackSeen=false;}
      const camp=this.state.campaign,evade=camp.objectives?.find?.(o=>o.id==='evade')||(!camp.missionType?camp.objectives?.[2]:null);
      if(evade)evade.done=true;
    }
    e.searchPhase=(e.searchPhase||0)+dt;this.updateASWBrain?.(dt);this.updateSonar(dt);
    const escorts=W.contacts.filter(c=>isASWCombatant(c));escorts.forEach((esc,i)=>this.updateEscortBeh(esc,e,sub,W,i,escorts.length,dt));
    this.updateSurfaceTrafficCombat?.(dt);
    this.updateLookouts(dt);

    // Passive listening may wake the screen, but it creates a deliberately
    // rough bearing/range datum. It never writes ownship's exact position into
    // the enemy plot and it is not a firm active-sonar contact by itself.
    const layerD=W.environment.layerDepthFt||200;
    for(const esc of escorts){
      const rng=distNm(esc.position,sub.position),depthMod=sub.depthFeet>layerD+15?.30:sub.depthFeet>100?.62:1,
        ownship=escortSonarOwnshipFactor(esc,sub.position),
        det=clamp((sub.stealth.acousticSignature*1.4-.08)*depthMod*ownship/(1+rng*2.2),0,1);
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

  /* Local surface traffic combat. This is deliberately not a second naval
     warfare simulator: only already-materialised ships inside the player's
     tactical bubble participate. Friendly merchants run; enemy patrol craft,
     escorts and warships may intercept and fire if they are not prosecuting a
     firm submarine contact. Existing steering, damage and battle-atmosphere
     systems do the rest. */
  updateSurfaceTrafficCombat(dt){
    const s=this.state,W=s.world,e=W.enemy,sub=s.playerSub,now=s.time.elapsedSeconds||0;
    const friendlies=(W.contacts||[]).filter(c=>c&&!c.sunk&&!c.stationary&&c.side==='FRIENDLY'&&c.type!=='RAFT');
    const hostiles=(W.contacts||[]).filter(c=>c&&!c.sunk&&!c.stationary&&(c.side||'ENEMY')==='ENEMY'&&isSurfaceCombatant(c));
    if(!friendlies.length||!hostiles.length)return;

    // Merchants do not knowingly steam through an enemy patrol. A visual
    // threat makes them turn away and ring up emergency speed for a short run.
    for(const f of friendlies){
      let threat=null,best=Infinity;
      for(const h of hostiles){
        const rng=distNm(f.position,h.position),wx=weatherBetween(s,f.position,h.position),day=clamp(W.environment.daylight||0,0,1);
        const visualRange=Math.min(7.5,Math.max(1.4,wx.visibilityNm*(.50+day*.24)));
        if(rng<=visualRange&&rng<best){best=rng;threat=h;}
      }
      if(!threat)continue;
      const away=bearingBetween(threat.position,f.position),jink=((f.id||'').split('').reduce((n,ch)=>n+ch.charCodeAt(0),0)%2?1:-1)*14;
      f.alertedAt=now;f.scattering=true;f.scatterHeading=normDeg(away+jink);f.scatterSpeed=clamp(Math.max(f.baseSpeed||8,(f.baseSpeed||8)*1.38),6,13);
      if(!f.surfaceThreatId||now-(f.surfaceThreatNotedAt||-999)>75){
        f.surfaceThreatId=threat.id;f.surfaceThreatNotedAt=now;
        const tr=W.contactTracks?.[f.id];if((tr&&tr.confidence>.04)||distNm(sub.position,f.position)<9)
          this.log(`${f.name}: enemy ${String(threat.displayType||threat.type).toLowerCase()} sighted — turning away at emergency speed.`,'warn');
      }
    }

    for(const h of hostiles){
      // A destroyer with a firm submarine prosecution has the more dangerous
      // job and does not abandon it to chase a merchant. A screen with no firm
      // contact may engage nearby Allied traffic.
      const aswBusy=e.alertState==='ATTACKING'&&(e.contactHeld||h.aswRole==='PROSECUTOR');
      if(aswBusy){h.surfaceTrafficTargetId=null;h.surfaceTrafficGunTimer=0;continue;}
      let target=null,best=Infinity;
      for(const f of friendlies){
        const rng=distNm(h.position,f.position),wx=weatherBetween(s,h.position,f.position),day=clamp(W.environment.daylight||0,0,1);
        const visualRange=Math.min(7.5,Math.max(1.3,wx.visibilityNm*(.48+day*.26)));
        if(rng<=visualRange&&rng<best){best=rng;target=f;}
      }
      if(!target){h.surfaceTrafficTargetId=null;h.surfaceTrafficGunTimer=0;continue;}
      h.surfaceTrafficTargetId=target.id;
      h.desiredHeading=bearingBetween(h.position,target.position);
      h.desiredSpeed=clamp(Math.max(h.baseSpeed||h.speedKnots||12,15+best*.45),10,22);
      const wx=weatherBetween(s,h.position,target.position),day=clamp(W.environment.daylight||0,0,1),gunRange=day>.28?3.8:2.2;
      h.surfaceTrafficGunTimer=(h.surfaceTrafficGunTimer||0)+dt;
      if(best>gunRange||h.surfaceTrafficGunTimer<8.5)continue;
      h.surfaceTrafficGunTimer=0;
      const size=clamp(shipVisualLengthM(target,280)/120,.55,1.35),sea=clamp(wx.seaState||0,0,1);
      const pHit=Math.pow(clamp(1-best/gunRange,0,1),1.15)*(.34+.34*day)*size*(1-sea*.34)*clamp(wx.visibilityNm/8,.35,1.15);
      const hit=Math.random()<clamp(pHit,.025,.62);
      this.noteSurfaceGunfire?.(h,target,hit);
      if(hit){
        const lenNm=shipVisualLengthNm(target,280),along=(Math.random()-.5)*lenNm*.72;
        const dmg=applyDeckGunShipDamage(this,target,{lenNm,along,lateral:0,z:3+Math.random()*8,source:'NPC_SURFACE_GUN',attackerId:h.id,attackerSide:'ENEMY'});
        const hr=degToRad(target.heading||0),impact={xNm:target.position.xNm+Math.sin(hr)*along,yNm:target.position.yNm-Math.cos(hr)*along};
        s.weapons.explosions.push({position:impact,zM:4+Math.random()*7,ageSec:0,maxAgeSec:4,label:'SURFACE GUN HIT'});
        particles.spawnExplosion?.(impact.xNm,impact.yNm,.26,false);audio.playHit?.();
        updateShipDamage(this,target,0);
        const tr=W.contactTracks?.[target.id];if((tr&&tr.confidence>.04)||distNm(sub.position,target.position)<10)
          this.log(`${h.name} hit ${target.name} — ${dmg.location.toLowerCase()}, ${shipDamageCondition(target).toLowerCase()}.`,'warn');
      }
    }
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
