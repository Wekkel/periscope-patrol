class SimEngineEnemyAI extends SimEngineCore {
  markEscortAlerted(esc){
    if(!esc?.id)return false;const e=this.state.world.enemy;
    const ids=new Set(Array.isArray(e.alertedEscortIds)?e.alertedEscortIds:[]);ids.add(esc.id);e.alertedEscortIds=[...ids];return true;
  }

  startMerchantEvasion(c,threatPos,reason='ATTACK',direct=false){
    if(!c||c.sunk||c.stationary||c.harborTarget||isSurfaceCombatant(c)||(c.side&&c.side!=='ENEMY'))return false;
    const now=this.state.time.elapsedSeconds||0,base=Math.max(3.5,Number(c.baseSpeed??c.speedKnots)||8);
    const parity=String(c.id||c.name||'merchant').split('').reduce((n,ch)=>n+ch.charCodeAt(0),0)%2?1:-1;
    let hdg;
    // A ship that is itself hit, or that sees a torpedo wake almost on top of
    // her, knows the threat axis but not the submarine's exact position. Give
    // her a hard deterministic jink rather than magical perfect turn-away data.
    if(direct||!threatPos||distNm(c.position,threatPos)<.08)hdg=normDeg((c.heading||0)+parity*(reason==='TORPEDO_SIGHTED'?58:72));
    else hdg=normDeg(bearingBetween(threatPos,c.position)+parity*18);
    c.alertedAt=now;c.scattering=true;c.scatterDurationSec=direct?150:110;c.scatterHeading=hdg;
    c.scatterSpeed=clamp(base*(direct?1.33:1.24),Math.min(base,5),15);
    c.surfaceAlarmReason=reason;c.surfaceAlarmAt=now;
    if(now-(c.surfaceAlarmLogAt||-999)>24){
      c.surfaceAlarmLogAt=now;
      this.log(`${c.name} ${direct?'under direct attack':'has seen the attack'} — emergency turn and speed.`);
    }
    return true;
  }

  surfaceAttackObservers(reason,pos,meta={}){
    const s=this.state,W=s.world,now=s.time.elapsedSeconds||0,out=[];
    const actionable=['SHIP_HIT','TORPEDO_DUD','DECK_GUN','TORPEDO_SIGHTED'];if(!actionable.includes(reason))return out;
    for(const c of W.contacts||[]){
      if(!c||c.sunk||c.stationary||c.harborTarget||isSurfaceCombatant(c)||(c.side&&c.side!=='ENEMY'))continue;
      if(meta.sourceShipId&&c.id===meta.sourceShipId){out.push({ship:c,direct:true});continue;}
      const rng=distNm(c.position,pos),wx=weatherBetween(s,c.position,pos),day=clamp(W.environment.daylight??1,0,1);
      const visual=Math.min(6,Math.max(.55,(wx.visibilityNm||.5)*(.30+day*.32)));
      const direct=reason==='SHIP_HIT'&&rng<=.14;
      const limit=reason==='SHIP_HIT'?Math.min(4.5,visual*1.15+(day<.28?.6:0))
        :reason==='TORPEDO_DUD'?Math.min(2.1,visual*.55+.25)
        :reason==='DECK_GUN'?Math.min(5.5,visual)
        :.12;
      if(!direct&&rng>limit)continue;
      this.startMerchantEvasion(c,pos,reason,direct);out.push({ship:c,direct});
      c.surfaceAlarmSeenAt=now;
    }
    return out;
  }

  surfaceAlarmRelayType(from,esc,reason){
    if(!from?.convoyId||!esc?.convoyId||from.convoyId!==esc.convoyId)return null;
    const s=this.state,W=s.world,rng=distNm(from.position,esc.position);if(rng>14)return null;
    const wx=weatherBetween(s,from.position,esc.position),day=clamp(W.environment.daylight??1,0,1);
    const visual=Math.min(5.5,Math.max(.7,(wx.visibilityNm||.5)*(.34+day*.28)));
    if(rng<=visual)return 'VISUAL';
    // Radio silence matters until there is something worth betraying it for.
    // An actual hit, dud/wake sighting or deck-gun attack is such an emergency;
    // routine suspicion never gets this long-range shortcut.
    if(['SHIP_HIT','TORPEDO_DUD','TORPEDO_SIGHTED','DECK_GUN'].includes(reason))return 'RADIO';
    return null;
  }

  escortDirectlyNotices(reason,esc,pos,conf){
    const rng=distNm(esc.position,pos);
    if(['ACTIVE_ECHO','ACTIVE_QC','NOISE','EMERGENCY_BLOW','COLLISION','AIR_ATTACK','RADIO_BEARING'].includes(reason))return rng<=18;
    const s=this.state,W=s.world,wx=weatherBetween(s,esc.position,pos),day=clamp(W.environment.daylight??1,0,1),visual=Math.max(.8,(wx.visibilityNm||.5)*(.35+day*.30));
    const limit=reason==='SHIP_HIT'?Math.min(7,visual*1.25+1)
      :reason==='DECK_GUN'?Math.min(7.5,visual*1.1)
      :reason==='TORPEDO_DUD'?Math.min(4,visual*.7+.5)
      :reason==='TORPEDO_SIGHTED'?Math.min(2.5,visual*.45+.25)
      :reason==='TORPEDO_LAUNCH'?Math.min(4.5,2.2+(conf||0)*2.5):18;
    return rng<=limit;
  }

  maybeMerchantSpotTorpedo(t,c,gap){
    if(!t||!c||c.sunk||c.stationary||c.harborTarget||isSurfaceCombatant(c)||(c.side&&c.side!=='ENEMY')||t.isElectric)return false;
    if(gap>.42)return false;
    t.wakeNoticeChecked=t.wakeNoticeChecked||{};if(t.wakeNoticeChecked[c.id])return false;
    const toShip=bearingBetween(t.position,c.position);if(Math.abs(shortDelta(t.heading,toShip))>34)return false;
    t.wakeNoticeChecked[c.id]=true;
    const s=this.state,W=s.world,wx=weatherBetween(s,t.position,c.position),day=clamp(W.environment.daylight??1,0,1);
    if(day<.20)return false;
    const vis=clamp((wx.visibilityNm||.5)/8,0,1),sea=clamp(wx.seaState||0,0,1);
    const p=clamp(.10+.42*day*vis*(1-sea*.72),.08,.55);if(Math.random()>=p)return false;
    this.startMerchantEvasion(c,t.position,'TORPEDO_SIGHTED',true);
    this.alertEscorts('TORPEDO_SIGHTED',{...c.position},.72,{sourceShipId:c.id});
    return true;
  }

  alertEscorts(reason,pos,conf,meta={}){
    const W=this.state.world,e=W.enemy;this.sys.aswBrain.ensureASWState?.();
    // First let surface ships react to what THEY can plausibly perceive. This
    // must happen before the escort early-return: a lone freighter still takes
    // evasive action after being hit even when no ASW ship is nearby.
    const observers=this.surfaceAttackObservers(reason,pos,meta);
    const escorts=(W.contacts||[]).filter(c=>isASWCombatant(c));
    const direct=escorts.filter(c=>this.escortDirectlyNotices(reason,c,pos,conf));
    const relayed=[];
    for(const esc of escorts){
      if(direct.includes(esc))continue;
      for(const o of observers){
        const via=this.surfaceAlarmRelayType(o.ship,esc,reason);if(!via)continue;
        relayed.push(esc);esc.lastAlarmVia=via;esc.lastAlarmFrom=o.ship.id;esc.lastAlarmAt=this.state.time.elapsedSeconds||0;
        if(via==='VISUAL')this.noteTacticalSignal?.(o.ship,esc,true);
        break;
      }
    }
    const localEscorts=[...new Map([...direct,...relayed].map(c=>[c.id,c])).values()];
    if(!localEscorts.length){
      if(['SHIP_HIT','TORPEDO_DUD','TORPEDO_LAUNCH','TORPEDO_SIGHTED','DECK_GUN'].includes(reason))
        this.log(`Local shipping alarm — ${reason.replaceAll('_',' ').toLowerCase()}, but no escort received the warning.`);
      return false;
    }
    for(const esc of localEscorts)this.markEscortAlerted(esc);
    const wasUnaware=e.alertState==='UNAWARE',newState=conf>.75?'ATTACKING':'SEARCHING';if(!(e.alertState==='ATTACKING'&&newState==='SEARCHING'))e.alertState=newState;
    const timers={TORPEDO_LAUNCH:360,TORPEDO_SIGHTED:300,SHIP_HIT:600,EMERGENCY_BLOW:260,TORPEDO_DUD:210,COLLISION:320,DECK_GUN:340,AIR_ATTACK:240,NOISE:180,ACTIVE_ECHO:280,ACTIVE_QC:280,RADIO_BEARING:240};
    e.alertTimerSec=Math.max(e.alertTimerSec,timers[reason]||200);
    const q=this.sys.aswBrain.noteASWCue?this.sys.aswBrain.noteASWCue(pos,conf,reason):{xNm:pos.xNm,yNm:pos.yNm};
    this.sys.aswBrain.armASWProsecution?.(reason,wasUnaware);
    e.lastKnownSubPosition={xNm:q.xNm,yNm:q.yNm};e.searchCenter={xNm:q.xNm,yNm:q.yNm};
    e.searchPattern=reason==='SHIP_HIT'?'COORDINATED':['TORPEDO_LAUNCH','TORPEDO_SIGHTED'].includes(reason)?'CONVERGE':'CREEPING';e.searchPhase=0;
    const via=relayed.length&&!direct.length?(relayed[0].lastAlarmVia||'signal'):'local observation';
    this.aarEnemyResponse?.(reason,{...q,confidence:conf,source:reason},localEscorts,via);
    this.log(`Escort screen alerted by ${reason} via ${via}; datum uncertainty about ${Math.round((q.errNm||.1)*2025)} yd.`);
    return true;
  }


  updateEnemyAI(dt){
    const W=this.state.world,e=W.enemy,sub=this.state.playerSub,A=this.sys.aswBrain.ensureASWState?.();
    const budgetExpiry=this.sys.aswBrain.aswProsecutionExpiry?.();
    if(budgetExpiry)e.alertTimerSec=0;
    if(e.alertTimerSec>0){
      // Quiet/deep running reduces SENSOR quality; it should not make a destroyer
      // forget a torpedo explosion twice as fast. Search persistence now decays
      // mostly with time, with only a modest bonus when contact is truly lost.
      let decay=dt;if(!e.contactHeld)decay+=dt*.08;if(!e.contactHeld&&sub.depthFeet>(W.environment.layerDepthFt||200)+15)decay+=dt*.10;
      e.alertTimerSec=Math.max(0,e.alertTimerSec-decay);
    }
    if(e.alertTimerSec<=0&&e.alertState!=='UNAWARE'){
      e.alertState='UNAWARE';e.lastKnownConfidence=0;e.contactHeld=false;e.solution=null;e.alertedEscortIds=[];this.sys.aswBrain.assignASWRoles?.(null,true);
      this.log(budgetExpiry==='HARD_LIMIT'?'Escort commander breaks off the prolonged hunt; convoy screen reforming.':'Escort search abandoned; convoy screen reforming.');
      this.sys.aswBrain.resetASWProsecution?.();
      if(this.state.campaign._depthChargeAttackSeen){this.captainLog?.('DEPTH_CHARGE_ATTACK_SURVIVED','Depth-charge attack survived.',{},`dc-survived:${Math.floor((this.state.time.elapsedSeconds||0)/60)}`);this.state.campaign._depthChargeAttackSeen=false;}
      const camp=this.state.campaign,evade=camp.objectives?.find?.(o=>o.id==='evade')||(!camp.missionType?camp.objectives?.[2]:null);
      if(evade)evade.done=true;
    }
    e.searchPhase=(e.searchPhase||0)+dt;this.sys.aswBrain.updateASWBrain?.(dt);this.updateSonar(dt);
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
        const passiveWasUnaware=e.alertState==='UNAWARE';this.markEscortAlerted(esc);e.alertState='SEARCHING';e.alertTimerSec=Math.max(e.alertTimerSec,det>.35?180:120);e.lastKnownConfidence=Math.max(e.lastKnownConfidence||0,det);
        const A=this.sys.aswBrain.ensureASWState?.();if(A){A.datum={...est,errNm:clamp(rng*rangeFactor,.16,.9),source:'PASSIVE'};A.datumAt=this.state.time.elapsedSeconds;A.searchStartedAt=this.state.time.elapsedSeconds;A.searchRadiusNm=clamp(.5+rng*rangeFactor,.6,1.8);}
        this.sys.aswBrain.armASWProsecution?.('PASSIVE',passiveWasUnaware);
        e.lastKnownSubPosition={...est};e.searchCenter={...est};this.sys.aswBrain.assignASWRoles?.(esc.id,true);
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
        particles.spawnExplosion?.(impact.xNm,impact.yNm,.26,false);PresentationBridge.audio(this.state).playHit?.();
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
