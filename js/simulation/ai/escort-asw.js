class SimEngineASW extends SimEngineSensors {
  updateEscortBeh(esc,e,sub,W,idx,total,dt){
    if(e.alertState==='UNAWARE'){
      // Zigzag convoy screen patrol
      esc.zigzagTimer=(esc.zigzagTimer||0)+dt;
      esc.zigzagPhase=esc.zigzagPhase||0;
      const zigzagPeriod=40+idx*12;
      if(esc.zigzagTimer>zigzagPeriod){esc.zigzagTimer=0;esc.zigzagPhase+=Math.PI;}
      const merchants=W.contacts.filter(c=>c.type!=='ESCORT'&&!c.sunk&&!c.harborTarget);
      if(merchants.length){
        const cx=merchants.reduce((s,m)=>s+m.position.xNm,0)/merchants.length;
        const cy=merchants.reduce((s,m)=>s+m.position.yNm,0)/merchants.length;
        const convoyBear=merchants[0].heading||0;
        const perpRad=degToRad(convoyBear+90);
        const sideOff=Math.sin(esc.zigzagPhase)*(1.2+idx*0.6);
        const fwdOff=1.0+idx*0.3;
        const tgt={xNm:cx+Math.sin(degToRad(convoyBear))*fwdOff+Math.cos(perpRad)*sideOff,
                   yNm:cy-Math.cos(degToRad(convoyBear))*fwdOff+Math.sin(perpRad)*sideOff};
        esc.desiredHeading=bearingBetween(esc.position,tgt);
      }
      esc.desiredSpeed=10+Math.sin(esc.zigzagPhase)*2.5;
      return;
    }
    const sc=e.searchCenter||e.lastKnownSubPosition||sub.position;
    if(e.alertState==='SEARCHING'){
      if(e.searchPattern==='EXPANDING_SQUARE'){
        const legLen=0.8+Math.floor(e.searchPhase/60)*0.45;
        const leg=Math.floor(e.searchPhase/40)%4;
        const dirs=[0,90,180,270];
        const tgt={xNm:sc.xNm+Math.sin(degToRad(dirs[leg]))*legLen,
                   yNm:sc.yNm-Math.cos(degToRad(dirs[leg]))*legLen};
        esc.desiredHeading=bearingBetween(esc.position,tgt);
      } else if(e.searchPattern==='CREEPING'){
        // creeping attack: slow so her own screws do not blind the sonar
        const spread=(idx-(total-1)/2)*1.2;
        const aim=e.solution?{xNm:e.solution.xNm,yNm:e.solution.yNm}:sc;
        esc.desiredHeading=normDeg(bearingBetween(esc.position,aim)+spread*10);
      } else {
        esc.desiredHeading=bearingBetween(esc.position,sc);
      }
      esc.desiredSpeed=e.searchPattern==='CREEPING'?8:14;
    } else { // ATTACKING — run in on the plotted solution, not on the truth
      if(esc.dcRemaining!==undefined&&esc.dcRemaining<SONAR.patternSize){
        // out of charges: fall back on the convoy and stop pressing home
        esc.desiredHeading=bearingBetween(esc.position,e.searchCenter||sub.position);
        esc.desiredSpeed=12;
        return;
      }
      // if she can see the boat on the surface she simply drives at her,
      // opens fire, and tries to run her down
      if(sub.depthFeet<25&&(e.visualOnSub||distNm(esc.position,sub.position)<1.6)){
        esc.desiredHeading=bearingBetween(esc.position,sub.position);
        esc.desiredSpeed=24;
        esc.lastAimRange=undefined;
        this.surfaceAction(esc,e,sub,W,dt);
        return;
      }
      const sol=e.solution;
      const raw=sol?{xNm:sol.xNm,yNm:sol.yNm}:(e.lastKnownSubPosition||sub.position);
      // Aim where the boat will be when the charges get down to her: run-in time
      // plus sinking time. Two passes are enough to settle the lead.
      const lr=degToRad(sol?(sol.courseDeg||0):0);
      const spd=sol?(sol.speedKn||0):0;
      const sinkT=(sol&&sol.depthFt?sol.depthFt:130)/SONAR.sinkFps;
      let drop={...raw};
      for(let it=0;it<2;it++){
        const toGo=distNm(esc.position,drop)/Math.max(esc.speedKnots,8)*3600;
        const lead=spd*((toGo+sinkT)/3600);
        drop={xNm:raw.xNm+Math.sin(lr)*lead,yNm:raw.yNm-Math.cos(lr)*lead};
      }
      esc.attackPoint=drop;
      const bearToAim=bearingBetween(esc.position,drop);
      const rngToAim=distNm(esc.position,drop);
      esc.zigzagPhase=(esc.zigzagPhase||0)+(dt*0.18);
      // weave only on the long approach; the last stretch is a straight run
      const zigAmp=rngToAim>2.2?9:rngToAim>1.2?4:0;
      const offsetDeg=(idx-(total-1)/2)*6+Math.sin(esc.zigzagPhase)*zigAmp;
      esc.desiredHeading=normDeg(bearToAim+offsetDeg);
      esc.desiredSpeed=rngToAim<0.9?18:22;
      // Release as she passes over the plotted position — at the closest point
      // of approach, not on some arbitrary radius she may never reach.
      const prevR=esc.lastAimRange===undefined?Infinity:esc.lastAimRange;
      esc.lastAimRange=rngToAim;
      const passingOver=rngToAim>prevR-1e-7&&rngToAim<0.20;
      const recent=W.depthCharges.some(dc=>dc.ownerId===esc.id&&dc.ageSec<12);
      if((rngToAim<0.05||passingOver)&&!recent&&e.alertState==='ATTACKING'){
        this.dropDC(esc,sub,{xNm:esc.position.xNm,yNm:esc.position.yNm});
      }
    }
    const rng=distNm(esc.position,sub.position);
    this.surfaceAction(esc,e,sub,W,dt);
  }

  /* Depth charges are useless against a boat on the surface: they sink for
     seconds and burst far below her. The answer is the main battery, and if
     she can get close enough, the bow. */
  surfaceAction(esc,e,sub,W,dt){
    const rng=distNm(esc.position,sub.position);
    const env=W.environment;
    const day=clamp(env.daylight,0,1);
    const lit=this.state.time.elapsedSeconds<(e.starShellUntil||0);
    const shallow=sub.depthFeet<25;
    if(e.alertState==='ATTACKING'&&shallow&&sub.mode!=='SUNK'&&(e.visualOnSub||rng<1.6)){
      // 127 mm guns reach far, but hitting a low black hull with optical fire
      // control is another matter: by day about 4 nm, at night barely 1.5
      // unless she puts up a star shell.
      const gunRange=day>0.3?4.0:(lit?3.0:1.5);
      esc.gunTimer=(esc.gunTimer||0)+dt;
      if(rng<gunRange&&esc.gunTimer>8){
        esc.gunTimer=0;
        const pHit=clamp(1-rng/gunRange,0,1)**1.6*(day>0.3?0.62:lit?0.5:0.34)*(1-clamp(env.seaState,0,1)*0.3);
        if(Math.random()<pHit){
          const dmg=4+Math.random()*11;
          this.applyShock(dmg);
          this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHELL HIT'});
          this.log(`${esc.name} has the range — shell hit, ${dmg.toFixed(0)}% damage. TAKE HER DOWN!`,'bad');
          audio.playDepthCharge(0.5);
        }else{
          this.log(`${esc.name} is firing — splashes ${rng>gunRange*0.6?'short':'close aboard'}.`,'warn');
          audio.playDepthCharge(0.9);
        }
      }
      // ramming: she will run the boat down if you let her get alongside
      if(rng<0.12&&sub.depthFeet<20&&(esc.ramCooldown||0)<=0){
        esc.ramCooldown=90;
        const dmg=32+Math.random()*30;
        this.applyShock(dmg);
        this.log(`${esc.name} RAMMED THE BOAT — ${dmg.toFixed(0)}% damage!`,'bad');
        audio.playHit();
      }
    } else esc.gunTimer=0;
    esc.ramCooldown=Math.max(0,(esc.ramCooldown||0)-dt);
  }

  /* A pattern is rolled off the stern and thrown out by the K-guns, all fused
     for ONE guessed depth. Guessing that depth is the escort's hardest problem
     — and the player's best defence. */
  dropDC(esc,sub,aim){
    const W=this.state.world, e=W.enemy, env=W.environment;
    // A pattern rolled on a surfaced boat would burst a hundred feet beneath
    // her. She uses her guns for that.
    if(sub.depthFeet<25) return;
    const layer=env.layerDepthFt||200;
    const belowLayer=sub.depthFeet>layer+15;
    const sol=e.solution;
    // depth is estimated, never known: error grows with depth and doubles below the layer
    const base=20+sub.depthFeet*0.10+(belowLayer?58:0);
    let skill=clamp(1-(esc.attacksMade||0)*0.11,0.45,1);        // she brackets as she keeps at it
    if(e.contactHeld) skill*=0.55;                              // a firm echo at the moment of release
    const err=base*skill*(0.35+Math.random()*1.15);
    let guess=(sol&&sol.depthFt!==undefined?sol.depthFt:sub.depthFeet)+err*(Math.random()<0.5?-1:1);
    // "She's going down — roll them shallow!" — the quick attack on a diving boat
    const diving=sub.depthFeet<70&&sub.verticalSpeedFps>0.4;
    guess=diving?clamp(guess,30,110):clamp(guess,45,400);
    esc.attacksMade=(esc.attacksMade||0)+1;
    esc.dcRemaining=(esc.dcRemaining===undefined?28:esc.dcRemaining)-SONAR.patternSize;
    const hdg=degToRad(esc.heading);
    for(let i=0;i<SONAR.patternSize;i++){
      // three rolled astern, four thrown out to either beam
      const along=(i<3?-(i*0.012):-(0.008)), across=(i<3?0:((i%2?1:-1)*0.028*(i<5?1:1.7)));
      const px=(aim?aim.xNm:esc.position.xNm)+Math.sin(hdg)*along+Math.cos(hdg)*across;
      const py=(aim?aim.yNm:esc.position.yNm)-Math.cos(hdg)*along+Math.sin(hdg)*across;
      W.depthCharges.push({
        id:`DC-${W.nextDcId=(W.nextDcId||0)+1}`,ownerId:esc.id,
        position:{xNm:px,yNm:py},ageSec:-i*0.9,
        fuseSec:clamp(guess/SONAR.sinkFps,4,34),
        targetDepthFeet:guess,status:'SINKING'
      });
    }
    // her own explosions blind her sonar for a while — the sub's chance to slip away
    e.sonarBlindUntil=this.state.time.elapsedSeconds+38+Math.random()*22;
    e.contactHeld=false;
    this.log(`${esc.name} attacking — pattern of ${SONAR.patternSize} away, set for ${guess.toFixed(0)} ft.`,'bad');
    if(esc.dcRemaining<SONAR.patternSize){
      this.log(`${esc.name} has expended her depth charges and is falling back.`,'warn');
    }
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
