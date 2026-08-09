class SimEngineASW extends SimEngineASWBrain {
  updateEscortBeh(esc,e,sub,W,idx,total,dt){
    this.ensureASWState();
    const role=esc.aswRole||'SCREEN';
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
    if(e.alertState==='UNAWARE'){
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
      const tgt=this.searchTarget(esc)||this.screenTarget(esc);
      if(tgt)esc.desiredHeading=bearingBetween(esc.position,tgt);
      esc.desiredSpeed=role==='PROSECUTOR'?10:role==='CONTAINMENT'?13:12;
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
    const sinkT=clamp((sol?.depthFt??130)/SONAR.sinkFps,4,34);let drop={...raw};
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
        if(Math.random()<pHit){
          const dmg=4+Math.random()*11;this.applyShock(dmg);this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHELL HIT'});
          this.log(`${esc.name} has the range — shell hit, ${dmg.toFixed(0)}% damage. TAKE HER DOWN!`,'bad');audio.playDepthCharge(.5);
        }else{this.log(`${esc.name} is firing — splashes ${estRng>gunRange*.6?'short':'close aboard'}.`);audio.playDepthCharge(.9);}
      }
    }else esc.gunTimer=0;
  }

  /* A depth-charge setting is made from the enemy solution. Actual ownship
     depth is consulted only later by updateDCs(), when the physical explosion
     is resolved. */
  dropDC(esc,sub,aim){
    const W=this.state.world,e=W.enemy,env=W.environment,sol=e.solution&&!e.solution.decoy?e.solution:null;
    const estDepth=clamp(sol?.depthFt??130,15,420);if(estDepth<25)return;
    const layer=env.layerDepthFt||200,belowLayer=estDepth>layer+15,base=20+estDepth*.10+(belowLayer?58:0);
    let skill=clamp(1-(esc.attacksMade||0)*.11,.45,1);if(e.contactHeld)skill*=.55;
    const err=base*skill*(.35+Math.random()*1.15);let guess=clamp(estDepth+err*(Math.random()<.5?-1:1),45,400);
    esc.attacksMade=(esc.attacksMade||0)+1;esc.dcRemaining=(esc.dcRemaining===undefined?28:esc.dcRemaining)-SONAR.patternSize;
    const hdg=degToRad(esc.heading);
    for(let i=0;i<SONAR.patternSize;i++){
      const along=(i<3?-(i*.012):-.008),across=(i<3?0:((i%2?1:-1)*.028*(i<5?1:1.7)));
      const px=(aim?aim.xNm:esc.position.xNm)+Math.sin(hdg)*along+Math.cos(hdg)*across,py=(aim?aim.yNm:esc.position.yNm)-Math.cos(hdg)*along+Math.sin(hdg)*across;
      W.depthCharges.push({id:`DC-${W.nextDcId=(W.nextDcId||0)+1}`,ownerId:esc.id,position:{xNm:px,yNm:py},ageSec:-i*.9,
        fuseSec:clamp(guess/SONAR.sinkFps,4,34),targetDepthFeet:guess,status:'SINKING'});
    }
    e.sonarBlindUntil=this.state.time.elapsedSeconds+38+Math.random()*22;e.contactHeld=false;
    for(const x of W.contacts.filter(c=>c.type==='ESCORT'))x.sonarContact=false;
    this.log(`DEPTH CHARGES — ${esc.name} rolling ${SONAR.patternSize}, set for ${guess.toFixed(0)} ft.`,'bad');
    this.aarRecordEvent?.('DEPTH_CHARGE_ATTACK',`${esc.name} depth-charge attack.`,{escortId:esc.id,count:SONAR.patternSize,depthFt:guess},esc.position,aim||sub.position);
    this.ensureASWState().searchStartedAt=this.state.time.elapsedSeconds;
    if(esc.dcRemaining<SONAR.patternSize){this.log(`${esc.name} has expended her depth charges and is falling back.`);this.assignASWRoles(null,true);}
  }

  updateDCs(dt){
    const W=this.state.world; const sub=this.state.playerSub;
    for(const dc of W.depthCharges){
      dc.ageSec+=dt;
      if(dc.status!=='SINKING'||dc.ageSec<0) continue;
      if(dc.ageSec>=dc.fuseSec){
        dc.status='DETONATED';
        const hNm=distNm(dc.position,sub.position);
        const dD=Math.abs(dc.targetDepthFeet-sub.depthFeet);
        // A 300-lb charge ruptures a pressure hull within ~20 m and shakes her
        // badly out to ~100 m. Sharp exponential falloff, and the fuse depth
        // has to be close or the blast passes harmlessly above or below.
        const hS=Math.exp(-hNm/0.017);
        const dS=clamp(1-dD/75,0,1);
        const dmg=62*hS*dS;
        this.state.campaign._depthChargeAttackSeen=true;
        this.state.weapons.explosions.push({position:{...dc.position},ageSec:0,maxAgeSec:10,label:dmg>4?`DC -${Math.round(dmg)}`:'DC'});
        if(dmg<=1&&hNm<0.5) this.shake(clamp(2.2-hNm*4,0.2,2.2));   // felt, not damaging
        if(dmg<=1&&dD>80&&hNm<0.25) this.log(`Charges detonated ${dc.targetDepthFeet<sub.depthFeet?'well above':'below'} you.`,'warn');
        if(dmg>1){this.applyShock(dmg);this.log(`Depth charge! Hull/system damage ${dmg.toFixed(0)}%.`,dmg>15?'bad':'warn');audio.playDepthCharge(clamp(1-dmg/42,0,1));particles.spawnExplosion(dc.position.xNm,dc.position.yNm,0.9,false);}
        else{this.log('Depth charge detonated nearby.','warn');audio.playDepthCharge(0.9);particles.spawnExplosion(dc.position.xNm,dc.position.yNm,0.5,false);}
      }
    }
    W.depthCharges=W.depthCharges.filter(dc=>dc.status==='SINKING'||dc.ageSec<dc.fuseSec+6);
  }

  /* Remember what the world looked like, so a transit can be broken off the
     instant anything changes that the skipper would want to know about. */
}
