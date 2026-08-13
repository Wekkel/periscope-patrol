class SimEngineASW extends SimEngineASWBrain {
  updateEscortBeh(esc,e,sub,W,idx,total,dt){
    this.ensureASWState();
    const role=esc.aswRole||'SCREEN';
    const noFullPattern=(esc.dcRemaining!==undefined&&esc.dcRemaining<SONAR.patternSize);
    if(noFullPattern&&e.alertState!=='UNAWARE'&&role!=='DAMAGED_GUARD'&&role!=='CONVOY_GUARD'){
      esc.aswExpended=true;esc.aswRole='CONVOY_GUARD';
      const tgt=this.screenTarget(esc);if(tgt){esc.desiredHeading=bearingBetween(esc.position,tgt);esc.desiredSpeed=clamp((this.convoyFrame()?.speedKn||9)+2.5,8,17);}return;
    }
    if(role==='DAMAGED_GUARD'){
      const casualty=W.contacts.find(c=>c.id===esc.guardShipId&&!c.sunk);
      if(casualty){
        const tgt=this.damagedGuardTarget(esc,casualty),err=tgt?distNm(esc.position,tgt):0;
        if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);
        esc.desiredSpeed=clamp((casualty.speedKnots||0)+1.5+err*.7,4,13);
        return;
      }
      this.assignASWRoles(null,true);
    }
    const informedIds=Array.isArray(e.alertedEscortIds)?e.alertedEscortIds:[];
    const locallyInformed=!informedIds.length||informedIds.includes(esc.id);
    if(e.alertState==='UNAWARE'||!locallyInformed){
      // Enemy knowledge is local. An escort that has not observed the attack
      // and has not received a convoy signal/radio report keeps screening; it
      // must not inherit the shared ASW datum merely because another escort did.
      const tgt=this.screenTarget(esc);
      if(tgt){
        const err=distNm(esc.position,tgt);esc.desiredHeading=bearingBetween(esc.position,tgt);
        const frame=this.convoyFrame();esc.desiredSpeed=clamp((frame?.speedKn||9)+2.2+err*.55,7,17);
      }
      return;
    }

    // A guard remains with the merchant body even during an attack.  Everyone
    // else works from the common ASW datum/solution; no course order below uses
    // ownship's true coordinates.
    if(role==='CONVOY_GUARD'){
      const tgt=this.screenTarget(esc);if(tgt){esc.desiredHeading=bearingBetween(esc.position,tgt);esc.desiredSpeed=clamp((this.convoyFrame()?.speedKn||9)+2,7,16);}return;
    }

    if(e.alertState==='SEARCHING'){
      const A=this.ensureASWState(),now=this.state.time.elapsedSeconds,cueAge=now-(A.datumAt||-999);
      const hotCue=['SHIP_HIT','TORPEDO_LAUNCH','TORPEDO_SIGHTED','TORPEDO_DUD','DECK_GUN'].includes(A.lastCue);
      const canSpeculate=role==='PROSECUTOR'&&hotCue&&cueAge<420&&(esc.dcRemaining===undefined||esc.dcRemaining>=SONAR.patternSize)
        &&esc.speculativeCueGeneration!==A.cueGeneration;
      const tgt=(canSpeculate?this.aswDatum(18):null)||this.searchTarget(esc)||this.screenTarget(esc);
      if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);
      esc.desiredSpeed=role==='PROSECUTOR'?(canSpeculate?17:11):role==='CONTAINMENT'?13:12;
      if(canSpeculate&&tgt){
        const rr=distNm(esc.position,tgt),prev=esc.lastSpecRange??Infinity,recent=W.depthCharges.some(dc=>dc.ownerId===esc.id&&dc.ageSec<14);
        esc.lastSpecRange=rr;
        if((rr<.08||(rr>prev-1e-7&&rr<.18))&&!recent){
          // One deliberate "try the datum" decision per weapon cue. Above the
          // layer it is common enough to make an escort on your tail frightening;
          // below the layer it becomes an occasional, usually inaccurate pattern.
          esc.speculativeCueGeneration=A.cueGeneration;
          const below=sub.depthFeet>(W.environment.layerDepthFt||200)+15,pTry=below?.18:.46;
          if(Math.random()<pTry)this.dropDC(esc,sub,{...esc.position},{speculative:true});
        }
      }else esc.lastSpecRange=undefined;
      this.surfaceAction(esc,e,sub,W,dt);
      return;
    }

    // ATTACKING. Only the prosecutor presses the datum for a depth-charge run;
    // containment and sweep ships keep their assigned geometry and can take
    // over if they obtain the next firm echo.
    if(role!=='PROSECUTOR'){
      const tgt=this.searchTarget(esc)||this.aswDatum(35)||this.screenTarget(esc);
      if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);
      esc.desiredSpeed=role==='CONTAINMENT'?16:13;
      this.surfaceAction(esc,e,sub,W,dt);
      return;
    }

    if(esc.dcRemaining!==undefined&&esc.dcRemaining<SONAR.patternSize){
      this.assignASWRoles(null,true);
      const tgt=this.screenTarget(esc)||this.aswDatum();if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);esc.desiredSpeed=12;return;
    }

    const sol=e.solution&&!e.solution.decoy?e.solution:null,raw=this.aswDatum();
    if(!raw){const tgt=this.searchTarget(esc)||this.screenTarget(esc);if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);esc.desiredSpeed=12;return;}

    // A visual solution can lead a surfaced run, but even then the helm follows
    // the plotted solution rather than a hidden direct reference to ownship.
    if(e.visualOnSub&&(sol?.depthFt??999)<30){
      const aim=this.aswDatum(18)||raw;esc.desiredHeading=bearingBetween(esc.position,aim);esc.desiredSpeed=24;esc.lastAimRange=undefined;
      this.surfaceAction(esc,e,sub,W,dt);return;
    }

    const lr=degToRad(sol?.courseDeg??this.ensureASWState().estimatedCourseDeg??0),spd=sol?.speedKn??this.ensureASWState().estimatedSpeedKn??0;
    const sinkT=clamp((sol?.depthFt??130)/SONAR.sinkFps,4,55);let drop={...raw};
    for(let it=0;it<2;it++){
      const toGo=Math.min(300,distNm(esc.position,drop)/Math.max(esc.speedKnots,8)*3600),lead=spd*((toGo+sinkT)/3600);
      drop={xNm:raw.xNm+Math.sin(lr)*lead,yNm:raw.yNm-Math.cos(lr)*lead};
    }
    esc.attackPoint=drop;
    const bearToAim=bearingBetween(esc.position,drop),rngToAim=distNm(esc.position,drop);
    esc.zigzagPhase=(esc.zigzagPhase||0)+(dt*.18);
    const zigAmp=rngToAim>2.2?7:rngToAim>1.2?3:0;
    esc.desiredHeading=normDeg(bearToAim+Math.sin(esc.zigzagPhase)*zigAmp);esc.desiredSpeed=rngToAim<.9?18:22;
    const prevR=esc.lastAimRange===undefined?Infinity:esc.lastAimRange;esc.lastAimRange=rngToAim;
    const passingOver=rngToAim>prevR-1e-7&&rngToAim<.20,recent=W.depthCharges.some(dc=>dc.ownerId===esc.id&&dc.ageSec<12);
    if((rngToAim<.05||passingOver)&&!recent&&e.alertState==='ATTACKING')this.dropDC(esc,sub,{xNm:esc.position.xNm,yNm:esc.position.yNm});
    this.surfaceAction(esc,e,sub,W,dt);
  }

  /* Gunfire is allowed only from an actual visual hold. The fire-control range
     comes from the noisy enemy solution; true range is used only by the hidden
     hit/impact model after a shot has legitimately been taken. */
  surfaceAction(esc,e,sub,W,dt){
    const env=W.environment,day=clamp(env.daylight,0,1),lit=this.state.time.elapsedSeconds<(e.starShellUntil||0),sol=e.solution;
    const shallowEstimate=(sol?.depthFt??999)<30;
    if(e.alertState==='ATTACKING'&&e.visualOnSub&&shallowEstimate&&sub.mode!=='SUNK'&&sol){
      const estRng=distNm(esc.position,sol),trueRng=distNm(esc.position,sub.position),gunRange=day>.3?4.0:(lit?3.0:1.5);
      esc.gunTimer=(esc.gunTimer||0)+dt;
      if(estRng<gunRange&&esc.gunTimer>8){
        esc.gunTimer=0;
        const pHit=clamp(1-trueRng/gunRange,0,1)**1.6*(day>.3?.62:lit?.5:.34)*(1-clamp(env.seaState,0,1)*.3);
        const hit=Math.random()<pHit;this.noteSurfaceGunfire?.(esc,sub,hit);
        if(hit){
          const dmg=4+Math.random()*11;this.applyShock(dmg);this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHELL HIT'});
          this.log(`${esc.name} has the range — shell hit, ${dmg.toFixed(0)}% damage. TAKE HER DOWN!`,'bad');audio.playShellImpact?.(bearingBetween(sub.position,esc.position),sub.heading,.9);
        }else{this.log(`${esc.name} is firing — splashes ${estRng>gunRange*.6?'short':'close aboard'}.`);audio.playShellSplash?.(clamp(trueRng/gunRange,0,1));}
      }
    }else esc.gunTimer=0;
  }

  /* A depth-charge setting is made from the enemy solution. Actual ownship
     depth is consulted only later by updateDCs(), when the physical explosion
     is resolved. */
  dropDC(esc,sub,aim,opts={}){
    const W=this.state.world,e=W.enemy,env=W.environment,sol=e.solution&&!e.solution.decoy?e.solution:null;
    const speculative=!!opts.speculative;
    const estDepth=clamp(sol?.depthFt??(70+(env.layerDepthFt||190)*.34),15,420);if(estDepth<25)return;
    const layer=env.layerDepthFt||200,belowLayer=estDepth>layer+15,base=(20+estDepth*.10+(belowLayer?58:0))*(speculative?1.45:1);
    let skill=clamp(1-(esc.attacksMade||0)*.11,.45,1);if(e.contactHeld)skill*=.55;
    const hist=this.state.campaign?.historicalProfile||null,err=base*skill*(.35+Math.random()*1.15)*(hist?.depthChargeErrorFactor||1);let guess=clamp(estDepth+err*(Math.random()<.5?-1:1),45,400);
    esc.attacksMade=(esc.attacksMade||0)+1;esc.dcRemaining=Math.max(0,(esc.dcRemaining===undefined?28:esc.dcRemaining)-SONAR.patternSize);
    const hdg=degToRad(esc.heading),patternId=`DCP-${W.nextDcPatternId=(W.nextDcPatternId||0)+1}`;
    for(let i=0;i<SONAR.patternSize;i++){
      const along=(i<3?-(i*.012):-.008),across=(i<3?0:((i%2?1:-1)*.028*(i<5?1:1.7)));
      const px=(aim?aim.xNm:esc.position.xNm)+Math.sin(hdg)*along+Math.cos(hdg)*across,py=(aim?aim.yNm:esc.position.yNm)-Math.cos(hdg)*along+Math.sin(hdg)*across;
      W.depthCharges.push({id:`DC-${W.nextDcId=(W.nextDcId||0)+1}`,patternId,patternIndex:i,patternCount:SONAR.patternSize,ownerId:esc.id,position:{xNm:px,yNm:py},ageSec:-i*.9,
        // Do not clamp deep settings to a 34 s arcade wait. The audible gap
        // between splash and detonation now corresponds to the same sink-rate
        // model used for the enemy's predicted attack point.
        fuseSec:clamp(guess/SONAR.sinkFps,4,55),targetDepthFeet:guess,status:'SINKING'});
    }
    e.sonarBlindUntil=this.state.time.elapsedSeconds+38+Math.random()*22;e.contactHeld=false;
    for(const x of W.contacts.filter(c=>isASWCombatant(c)))x.sonarContact=false;
    // The player is not in the destroyer's plotting room. Keep the exact depth
    // setting internal; SOUND can infer only broad shallow/deep intent from the
    // later splash-to-burst interval.
    this.log(speculative?`DEPTH CHARGES — ${esc.name} is trying the last datum with a ${SONAR.patternSize}-charge pattern.`:`DEPTH CHARGES — ${esc.name} is beginning a ${SONAR.patternSize}-charge attack run.`,'bad');
    this.aarRecordEvent?.('DEPTH_CHARGE_ATTACK',`${esc.name} depth-charge attack.`,{escortId:esc.id,count:SONAR.patternSize,depthFt:guess},esc.position,aim||sub.position);
    this.ensureASWState().searchStartedAt=this.state.time.elapsedSeconds;
    if(esc.dcRemaining<SONAR.patternSize){esc.aswExpended=true;if(!esc.dcExhaustedNoted){esc.dcExhaustedNoted=true;this.log(`${esc.name} has expended her usable depth-charge patterns and is returning to the convoy screen.`);}this.assignASWRoles(null,true);}
  }

  updateDCs(dt){
    const W=this.state.world; const sub=this.state.playerSub;
    for(const dc of W.depthCharges){
      dc.ageSec+=dt;
      if(dc.status!=='SINKING'||dc.ageSec<0) continue;
      if(!dc.waterEntryPlayed){
        dc.waterEntryPlayed=true;const splashRange=distNm(dc.position,sub.position),hearRange=sub.depthFeet>10?1.45:2.2;
        // Real audibility gate: a distant attack on a stale datum must be silent,
        // not reduced to a minimum-volume rhythmic tick that betrays hidden action.
        if(splashRange<hearRange)audio.event?.('DEPTH_CHARGE_SPLASH',{distanceFactor:clamp(splashRange/hearRange,0,1)});
        // Only the first charge in a pattern speaks for the group. The report is
        // qualitative and range-limited; it does not reveal the destroyer's set depth.
        if((dc.patternIndex??0)===0&&splashRange<hearRange){
          const closeness=splashRange<.28?'close aboard':splashRange<.75?'nearby':'distant';
          this.log(`${sub.depthFeet>10?'SOUND':'LOOKOUTS'} — multiple depth-charge splashes in the water, ${closeness}.`,'bad');
        }
      }
      if(dc.ageSec>=dc.fuseSec){
        dc.status='DETONATED';
        const hNm=distNm(dc.position,sub.position);
        const dD=Math.abs(dc.targetDepthFeet-sub.depthFeet);
        // Loudness follows the listener-to-burst slant distance, including the
        // vertical separation in the water column. Damage remains its own
        // pressure model; it is no longer (incorrectly) used as a volume knob.
        const acousticNm=Math.hypot(hNm,dD/6076.12),audibleNm=1.6;
        // Ship patterns and aerial charges share the same physical depth
        // timing, but an aircraft's single ASW charge is intentionally less
        // lethal and much less accurately set than a destroyer's close pattern.
        const hS=Math.exp(-hNm/0.017);
        const dS=clamp(1-dD/75,0,1);
        const air=dc.source==='AIR',strength=air?(dc.strength||28):62;
        const dmg=strength*hS*dS;
        this.state.campaign._depthChargeAttackSeen=true;
        this.state.weapons.explosions.push({position:{...dc.position},ageSec:0,maxAgeSec:10,label:dmg>4?`DC -${Math.round(dmg)}`:'DC'});
        if(dmg<=1&&hNm<0.5) this.shake(clamp(2.2-hNm*4,0.2,2.2));   // felt, not damaging
        if(!air&&(dc.patternIndex??0)===0&&hNm<1.45){
          // Crew inference comes only from elapsed sink time. We intentionally
          // report only the extremes; a precise feet setting would be arcade information.
          if(dc.fuseSec>=25)this.log('SOUND — long sink time; the charges were set deep.','warn');
          else if(dc.fuseSec<=11)this.log('SOUND — short sink time; the charges were set shallow.','warn');
        }
        if(dmg>1){this.applyShock(dmg);this.log(`${air?'Aerial depth charge':'Depth charge'}! Hull/system damage ${dmg.toFixed(0)}%.`,dmg>15?'bad':'warn');if(acousticNm<audibleNm)audio.playDepthCharge(clamp(acousticNm/audibleNm,0,1));particles.spawnExplosion(dc.position.xNm,dc.position.yNm,0.9,false);}
        else{if(air||(dc.patternIndex??0)===0)this.log(`${air?'Aerial depth charge':'Depth-charge pattern'} detonating nearby.`,'warn');if(acousticNm<audibleNm)audio.playDepthCharge(clamp(acousticNm/audibleNm,0,1));particles.spawnExplosion(dc.position.xNm,dc.position.yNm,0.5,false);}
      }
    }
    W.depthCharges=W.depthCharges.filter(dc=>dc.status==='SINKING'||dc.ageSec<dc.fuseSec+6);
  }

  /* Remember what the world looked like, so a transit can be broken off the
     instant anything changes that the skipper would want to know about. */
}
