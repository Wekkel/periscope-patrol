class SimEngineDeckGun extends SimEngineAircraft {
  deckGunTarget(){
    const id=this.state.tactical.selectedTrackId||this.state.tdc.targetId;
    return id?this.state.world.contacts.find(c=>c.id===id&&!c.sunk):null;
  }

  deckGunElevationFor(rangeM,v=820,y=2){
    if(rangeM<20) return 0;
    const g=9.80665,v2=v*v;
    const disc=v2*v2-g*(g*rangeM*rangeM+2*y*v2);
    if(disc<=0) return null;
    return radToDeg(Math.atan((v2-Math.sqrt(disc))/(g*rangeM)));
  }

  layDeckGun(){
    const G=this.state.weapons.deckGun, sub=this.state.playerSub, c=this.deckGunTarget();
    if(!G.manned){this.notify('Deck gun is not manned.','warn');return;}
    if(!c){this.notify('No selected surface target for the gun. Tap a visible ship first.','warn');return;}
    const r0=distNm(sub.position,c.position);
    if(r0>Math.max(5,this.state.world.environment.visibilityNm*1.05)){this.notify('Target is beyond useful visual gun range.','warn');return;}
    // Iterate flight time and target motion. This is a crew estimate, not magic
    // aim assist: sea state and dispersion still have to be bracketed by eye.
    let pred={...c.position}, tof=r0*NM_M/820;
    for(let i=0;i<3;i++){
      const d=knotsNmSec(c.speedKnots||0)*tof, rr=degToRad(c.heading||0);
      pred={xNm:c.position.xNm+Math.sin(rr)*d,yNm:c.position.yNm-Math.cos(rr)*d};
      tof=distNm(sub.position,pred)*NM_M/820;
    }
    const br=bearingBetween(sub.position,pred), rel=shortDelta(sub.heading,br);
    if(Math.abs(rel)>140){this.notify(`Target bears ${fmtDeg(br)} — outside the deck gun's training arc. Turn the boat.`,'warn');return;}
    const rangeM=distNm(sub.position,pred)*NM_M;
    const el=this.deckGunElevationFor(rangeM,820,3);
    if(el==null||el>22){this.notify('No practical deck-gun elevation solution at this range.','warn');return;}
    G.trainDeg=clamp(rel,-140,140);G.elevationDeg=clamp(el,0,22);
    this.notify(`Gun laid on ${c.id}: bearing ${fmtDeg(br)}, range ${r0.toFixed(1)} nm. Fire and watch the fall of shot.`,'ok');
  }

  fireDeckGun(){
    const G=this.state.weapons.deckGun, sub=this.state.playerSub, now=this.state.time.elapsedSeconds;
    if(!G.manned){this.notify('Deck gun is not manned.','warn');return;}
    if(this.state.time.timeScale===0){this.notify('Simulation is paused — resume time before firing.','warn');return;}
    if(sub.depthFeet>8){G.manned=false;this.notify('Deck awash — gun crew driven below.','warn');return;}
    if(G.ammo<=0){this.notify('Deck gun magazine empty.','warn');return;}
    if(now-(G.lastFireAt??-999)<1.35){this.notify('Gun crew still loading.','warn');return;}
    const sea=clamp(this.state.world.environment.seaState||0,0,1);
    const fatigue=clamp(sub.damage.crewFatigue||0,0,1);
    const sig=(0.055+sea*0.12+fatigue*0.05);       // degrees, 1-sigma-ish gameplay dispersion
    const bearing=normDeg(sub.heading+(G.trainDeg||0)+(Math.random()-0.5)*sig*2);
    const elev=clamp((G.elevationDeg||0)+(Math.random()-0.5)*sig*1.5,0,22);
    const v=820, er=degToRad(elev), br=degToRad(bearing);
    const vh=v*Math.cos(er);
    G.shells.push({
      id:`DG-${++G.shots}`,xNm:sub.position.xNm,yNm:sub.position.yNm,zM:5.6,
      vxM:Math.sin(br)*vh,vyM:-Math.cos(br)*vh,vzM:v*Math.sin(er),
      age:0,bearing,elevation:elev,prev:null
    });
    G.ammo--;G.lastFireAt=now;G.flashUntil=now+0.16;G.lastFall=null;
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.16,0,1.5);
    this.alertEscorts('DECK_GUN',{...sub.position},0.88);
    audio.playDeckGun?.(1);
    this.shake(0.45);
  }

  segmentShipGunHit(a,b,c){
    const hit=HullGeometry.segmentHullIntersection(a,b,shipHull(c));
    if(!hit)return null;
    const z=a.zM+(b.zM-a.zM)*hit.u;
    const tall=/CARRIER/i.test(c.displayType||'')?32:/CRUISER/i.test(c.displayType||'')?24:c.type==='ESCORT'?15:c.type==='TANKER'?22:19;
    if(z<-1||z>tall)return null;
    return{...hit,z};
  }

  deckGunFallText(pos,bearing){
    const c=this.deckGunTarget();if(!c)return 'SPLASH';
    const sub=this.state.playerSub, rr=degToRad(bearing);
    const along=q=>{const dx=q.xNm-sub.position.xNm,dy=q.yNm-sub.position.yNm;return dx*Math.sin(rr)-dy*Math.cos(rr);};
    const diff=(along(pos)-along(c.position))*2025;
    if(Math.abs(diff)<35)return `SPLASH — close aboard ${c.id}`;
    return `SPLASH — ${Math.round(Math.abs(diff))} yd ${diff<0?'SHORT':'OVER'}`;
  }

  damageShipByDeckGun(c,hit){
    const G=this.state.weapons.deckGun, W=this.state.weapons;
    const heavy=/CARRIER|CRUISER/i.test(c.displayType||'');
    const mult=heavy?0.34:c.type==='ESCORT'?0.58:c.type==='TANKER'?0.78:1;
    const d=(0.20+Math.random()*0.13)*mult;
    c.gunDamage=clamp((c.gunDamage||0)+d,0,4);
    if(c.harborTarget) this.noteHarborAttack?.(c);
    c.baseSpeed=c.baseSpeed??c.speedKnots;
    c.speedKnots=Math.min(c.speedKnots,c.baseSpeed*clamp(1-c.gunDamage*0.48,0.18,1));
    c.desiredSpeed=Math.min(c.desiredSpeed??c.speedKnots,c.speedKnots);
    G.hits++;G.lastFall={text:`HIT — ${c.id} · ${Math.round(c.gunDamage*100)}% gun damage`,until:this.state.time.elapsedSeconds+4};
    this.state.weapons.explosions.push({position:{...c.position},ageSec:0,maxAgeSec:5,label:'GUN HIT'});
    particles.spawnExplosion(c.position.xNm,c.position.yNm,0.38,false);audio.playHit?.();
    const threshold=heavy?2.7:c.type==='ESCORT'?1.55:c.type==='TANKER'?1.25:1.0;
    if(c.gunDamage<threshold){
      this.log(`Deck gun hit ${c.name} — visible damage, speed falling.`,'warn');
      return;
    }
    c.sunk=true;c.sinkingProgress=0;c.speedKnots=0;c.hitFrac=clamp(hit.along/(hit.lenNm||1),-0.5,0.5);
    if(c.harborTarget) this.noteHarborAttack?.(c);c.hitSide=hit.lateral>=0?1:-1;
    c.sinkStyle=Math.abs(c.hitFrac)>0.22?(c.hitFrac>0?0:1):(Math.random()<0.35?2:3);
    c.sinkDurationSec=c.sinkStyle===2?35+Math.random()*18:55+Math.random()*35;c.sunkAt=this.state.time.elapsedSeconds;
    const tr=this.state.world.contactTracks[c.id];if(tr){tr.sunk=true;tr.lastFixPosition={...c.position};tr.plotPosition={...c.position};delete tr.truePosition;}
    const camp=this.state.campaign,pts=Math.round((c.harborValue||(c.type==='ESCORT'?1800:1000))*0.85);
    camp.score+=pts;camp.tonnageSunk+=(c.tonsFactor||3000);if(c.type==='ESCORT')camp.escortsSunk++;
    W.hits.push({weapon:'DECK_GUN',contactId:c.id,t:this.state.time.elapsedSeconds});
    G.lastFall={text:`SUNK — ${c.id} +${pts}`,until:this.state.time.elapsedSeconds+6};
    this.notify(`DECK GUN — ${c.name} is going down. +${pts} pts.`,'ok');
    this.alertEscorts('SHIP_HIT',{...c.position},1);this.checkMissionObjectives();
  }

  updateDeckGun(dt){
    const G=this.state.weapons.deckGun, sub=this.state.playerSub;
    if(!G)return;
    if(G.manned&&(sub.mode==='SUNK'||sub.depthFeet>10||this.state.world.environment.seaState>0.88)){
      G.manned=false;if(this.state.tactical.activeStation==='DECK_GUN')this.state.tactical.activeStation='TACTICAL';
      this.notify(sub.depthFeet>10?'Deck going under — deck gun crew below.':'Deck gun secured — conditions no longer permit firing.','warn');
    }
    for(const sp of G.splashes||[])sp.age+=dt;
    G.splashes=(G.splashes||[]).filter(sp=>sp.age<4);
    const alive=[];
    for(const sh of G.shells||[]){
      if(sh.age>12)continue;
      const prev={xNm:sh.xNm,yNm:sh.yNm,zM:sh.zM};
      // light drag: enough to make long shots require a little more elevation,
      // without turning this into an artillery computer.
      const drag=Math.exp(-dt*0.012);sh.vxM*=drag;sh.vyM*=drag;sh.vzM=sh.vzM*drag-9.80665*dt;
      sh.xNm+=sh.vxM*dt/NM_M;sh.yNm+=sh.vyM*dt/NM_M;sh.zM+=sh.vzM*dt;sh.age+=dt;sh.prev=prev;
      let struck=null;
      for(const c of this.state.world.contacts){
        if(c.sunk)continue;const hit=this.segmentShipGunHit(prev,sh,c);if(hit){struck={c,hit};break;}
      }
      if(struck){this.damageShipByDeckGun(struck.c,struck.hit);continue;}
      if(sh.zM<=0){
        const f=clamp(prev.zM/(prev.zM-sh.zM||1),0,1),pos={xNm:prev.xNm+(sh.xNm-prev.xNm)*f,yNm:prev.yNm+(sh.yNm-prev.yNm)*f};
        G.splashes.push({position:pos,age:0});G.lastFall={text:this.deckGunFallText(pos,sh.bearing),until:this.state.time.elapsedSeconds+3.5};
        continue;
      }
      alive.push(sh);
    }
    G.shells=alive;
  }

  /* ══════════ THE 20 MM ══════════
     What a submarine's anti-aircraft gun actually did was not shoot aeroplanes
     down. It very rarely did that. What it did was make the pilot flinch:
     press his attack from higher, release early, and put his bombs in the sea
     a hundred yards out instead of on the pressure hull. That is the whole
     value of the thing, and it is worth a great deal — a near miss at 100 m
     does almost nothing where a near miss at 20 m can open her up.

     Against that stands the price. Four men and an open hatch mean she cannot
     dive, and an aeroplane that has spent its bombs may come back with guns
     to sweep the deck. Doctrine in the Pacific was unambiguous: dive. The gun
     was for the times you had left it too late to do anything else.

     The Oerlikon is aimed over an iron ring by a man on a pitching deck. So
     the model is: murderous inside 200 yards, hopeful to about 1000, useless
     in the dark, and worse with every foot of sea running. */
}
