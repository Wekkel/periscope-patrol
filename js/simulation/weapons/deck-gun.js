// USN OP 811 (1943) gives 14,600 yd as the 3-inch/50's maximum range.
// Keep this as one authoritative gameplay limit so LAY, FIRE, HUD and shell
// lifetime cannot disagree and silently lose rounds at extreme range.
const DECK_GUN_MAX_RANGE_NM=14600/2025;
function deckGunSpecForState(state){
  const authored=typeof getSubmarineProfile==='function'?getSubmarineProfile(state?.playerSub?.profileId)?.weapons?.deckGun:null;
  return Object.assign({label:'3-inch/50 deck gun',shortLabel:'3-IN/50',muzzleVelocityMS:820,maxRangeNm:DECK_GUN_MAX_RANGE_NM,reloadSec:1.35,audioPower:1},authored||{});
}

const DeckGunSystem={
  deckGunTarget(){
    const id=this.state.tactical.selectedTrackId||this.state.tdc.targetId;
    return id?this.state.world.contacts.find(c=>c.id===id&&!c.sunk):null;
  },

  deckGunBallisticSolution(rangeM,v=null,targetZM=3){
    v=Number(v)||deckGunSpecForState(this.state).muzzleVelocityMS;
    if(rangeM<20)return{elevation:0,timeSec:rangeM/Math.max(1,v)};
    // LAY must use the same light-drag model as the live shell. The previous
    // vacuum formula was increasingly short at long range (about 0.35 nm at
    // 4.9 nm), so the sight could say LAY while every correctly aimed round
    // fell well short. Solve the low-angle branch numerically; LAY is an
    // occasional command, so this small calculation is cheap even on mobile.
    const sample=elev=>{
      const dt=.05,er=degToRad(elev),barrelM=5.6;
      let x=0,z=5.6+Math.sin(er)*barrelM,vx=v*Math.cos(er),vz=v*Math.sin(er),t=0;
      let px=x,pz=z;
      while(t<26&&z>-120){
        px=x;pz=z;
        const drag=Math.exp(-dt*.012);vx*=drag;vz=vz*drag-9.80665*dt;
        x+=vx*dt;z+=vz*dt;t+=dt;
        if(x>=rangeM){
          const f=clamp((rangeM-px)/Math.max(.001,x-px),0,1);
          return{height:lerp(pz,z,f),timeSec:t-dt+dt*f};
        }
        if(z<0&&x<rangeM)return{height:-999,timeSec:t};
      }
      return{height:-999,timeSec:t};
    };
    const hiTest=sample(22);if(hiTest.height<targetZM)return null;
    let lo=0,hi=22,mid=0,sol=hiTest;
    for(let i=0;i<18;i++){
      mid=(lo+hi)/2;const q=sample(mid);
      if(q.height>=targetZM){hi=mid;sol=q;}else lo=mid;
    }
    const elevation=(lo+hi)/2,final=sample(elevation);
    return{elevation,timeSec:final.timeSec};
  },

  deckGunElevationFor(rangeM,v=null,y=3){
    return this.sys.deckGun.deckGunBallisticSolution(rangeM,v,y)?.elevation??null;
  },

  layDeckGun(){
    const G=this.state.weapons.deckGun, sub=this.state.playerSub, c=this.sys.deckGun.deckGunTarget();
    if(!G.manned){this.notify('Deck gun is not manned.','warn');return;}
    if(!c){this.notify('No selected surface target for the gun. Tap a visible ship first.','warn');return;}
    const r0=distNm(sub.position,c.position),gun=deckGunSpecForState(this.state),maxRange=gun.maxRangeNm;
    if(r0>maxRange){
      this.notify(`Target ${c.id} at ${r0.toFixed(1)} nm — beyond ${gun.shortLabel} maximum range (${maxRange.toFixed(1)} nm).`,'warn');return;
    }
    const usefulVisualRange=Math.min(maxRange,Math.max(5,this.state.world.environment.visibilityNm*1.05));
    if(r0>usefulVisualRange){this.notify('Target is beyond useful visual gun range.','warn');return;}
    // Iterate flight time and target motion. This is a crew estimate, not magic
    // aim assist: sea state and dispersion still have to be bracketed by eye.
    let pred={...c.position},tof=r0*NM_M/gun.muzzleVelocityMS,ballistic=null;
    for(let i=0;i<3;i++){
      const d=knotsNmSec(c.speedKnots||0)*tof,rr=degToRad(c.heading||0);
      pred={xNm:c.position.xNm+Math.sin(rr)*d,yNm:c.position.yNm-Math.cos(rr)*d};
      ballistic=this.sys.deckGun.deckGunBallisticSolution(distNm(sub.position,pred)*NM_M,gun.muzzleVelocityMS,3);
      if(!ballistic)break;
      tof=ballistic.timeSec;
    }
    const br=bearingBetween(sub.position,pred), rel=shortDelta(sub.heading,br);
    if(Math.abs(rel)>140){this.notify(`Target bears ${fmtDeg(br)} — outside the deck gun's training arc. Turn the boat.`,'warn');return;}
    const rangeM=distNm(sub.position,pred)*NM_M;
    ballistic=this.sys.deckGun.deckGunBallisticSolution(rangeM,gun.muzzleVelocityMS,3);
    const el=ballistic?.elevation??null;
    if(el==null||el>22){this.notify('No practical deck-gun elevation solution at this range.','warn');return;}
    G.trainDeg=clamp(rel,-140,140);G.elevationDeg=clamp(el,0,22);
    this.notify(`Gun laid on ${c.id}: bearing ${fmtDeg(br)}, range ${r0.toFixed(1)} nm. Fire and watch the fall of shot.`,'ok');
  },

  fireDeckGun(){
    const G=this.state.weapons.deckGun, sub=this.state.playerSub, now=this.state.time.elapsedSeconds;
    if(!G.manned){this.notify('Deck gun is not manned.','warn');return;}
    if(this.state.time.timeScale===0){this.notify('Simulation is paused — resume time before firing.','warn');return;}
    if(sub.depthFeet>8){G.manned=false;this.notify('Deck awash — gun crew driven below.','warn');return;}
    if(G.ammo<=0){this.notify('Deck gun magazine empty.','warn');return;}
    const gun=deckGunSpecForState(this.state);
    if(now-(G.lastFireAt??-999)<gun.reloadSec){this.notify('Gun crew still loading.','warn');return;}
    const tgt=this.sys.deckGun.deckGunTarget();
    if(tgt){
      const r=distNm(sub.position,tgt.position);
      if(r>gun.maxRangeNm){this.notify(`Target ${tgt.id} at ${r.toFixed(1)} nm — beyond ${gun.shortLabel} maximum range (${gun.maxRangeNm.toFixed(1)} nm).`,'warn');return;}
    }
    const sea=clamp(this.state.world.environment.seaState||0,0,1);
    const fatigue=clamp(sub.damage.crewFatigue||0,0,1);
    const wx=weatherAtPosition(this.state,sub.position);
    const sig=(0.055+sea*0.12+fatigue*0.05)*wx.deckGunDispersionFactor; // rain + deck motion widen the pattern
    const bearing=normDeg(sub.heading+(G.trainDeg||0)+(Math.random()-0.5)*sig*2);
    const elev=clamp((G.elevationDeg||0)+(Math.random()-0.5)*sig*1.5,0,22);
    const v=gun.muzzleVelocityMS, er=degToRad(elev), br=degToRad(bearing),hr=degToRad(sub.heading);
    const vh=v*Math.cos(er);
    // Start at the physical forward mount and then at the end of the barrel,
    // rather than at the submarine origin. The first tracer frame now emerges
    // from the muzzle the player just saw flash.
    const mountForwardM=12,barrelM=5.6;
    const mx=sub.position.xNm+(Math.sin(hr)*mountForwardM+Math.sin(br)*barrelM)/NM_M;
    const my=sub.position.yNm+(-Math.cos(hr)*mountForwardM-Math.cos(br)*barrelM)/NM_M;
    const shell={
      id:`DG-${++G.shots}`,xNm:mx,yNm:my,zM:5.6+Math.sin(er)*barrelM,
      vxM:Math.sin(br)*vh,vyM:-Math.cos(br)*vh,vzM:v*Math.sin(er),
      age:0,bearing,elevation:elev,prev:null,weaponLabel:gun.shortLabel,muzzleVelocityMS:v
    };G.shells.push(shell);this.aar.gunRound(shell);
    G.ammo--;G.lastFireAt=now;G.flashStartedAt=now;G.flashUntil=now+0.30;G.ammoFlashUntil=now+gun.reloadSec;G.ammoFlashCount=G.ammo;G.lastFall=null;
    if(now-(G._aarLastAttackAt??-999)>45){G._aarLastAttackAt=now;this.aar.recordEvent('DECK_GUN_ATTACK','Deck-gun engagement opened.',{},sub.position); }
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.16,0,1.5);
    this.sys.escorts.alert('DECK_GUN',{...sub.position},0.88);
    PresentationBridge.audio(this.state).playDeckGun?.(gun.audioPower);
    this.shake(0.45);
  },

  segmentShipGunHit(a,b,c){
    const hit=HullGeometry.segmentHullIntersection(a,b,shipHull(c));
    if(!hit)return null;
    const z=a.zM+(b.zM-a.zM)*hit.u;
    const tall=/CARRIER/i.test(c.displayType||'')?32:/CRUISER/i.test(c.displayType||'')?24:isSurfaceCombatant(c)?15:c.type==='TANKER'?22:19;
    if(z<-1||z>tall)return null;
    return{...hit,z};
  },

  deckGunFallText(pos,bearing){
    const c=this.sys.deckGun.deckGunTarget();if(!c)return 'SPLASH';
    const sub=this.state.playerSub, rr=degToRad(bearing);
    const along=q=>{const dx=q.xNm-sub.position.xNm,dy=q.yNm-sub.position.yNm;return dx*Math.sin(rr)-dy*Math.cos(rr);};
    const diff=(along(pos)-along(c.position))*2025;
    if(Math.abs(diff)<35)return `SPLASH — close aboard ${c.id}`;
    return `SPLASH — ${Math.round(Math.abs(diff))} yd ${diff<0?'SHORT':'OVER'}`;
  },

  damageShipByDeckGun(c,hit,shell=null){
    const G=this.state.weapons.deckGun,W=this.state.weapons;
    // gunDamage survives only as backwards-compatible evidence that shells have
    // hit this ship. It is no longer a health pool or a sinking threshold.
    const heavy=/CARRIER|CRUISER/i.test(c.displayType||'');
    const legacyStep=(heavy ? .34 : isSurfaceCombatant(c) ? .58 : c.type==='TANKER' ? .78 : 1)*.20;
    c.gunDamage=clamp((c.gunDamage||0)+legacyStep,0,4);
    const dmg=applyDeckGunShipDamage(this,c,hit);
    if(c.harborTarget)this.sys.harbor.noteHarborAttack(c);
    G.hits++;
    W.hits.push({weapon:'DECK_GUN',contactId:c.id,t:this.state.time.elapsedSeconds,location:dmg.location});
    G.lastFall={text:`HIT — ${c.id} · ${dmg.material} / ${dmg.location} · ${shipDamageCondition(c)}`,until:this.state.time.elapsedSeconds+4};
    // Preserve the actual shell/hull intersection for perspective-correct light.
    // The old effect always exploded at the ship centre/waterline, which made a
    // close hit look like a flat full-screen flash rather than light blooming
    // outward from the point the player had just struck.
    const hr=degToRad(c.heading||0),fx=Math.sin(hr),fy=-Math.cos(hr),sx=Math.cos(hr),sy=Math.sin(hr);
    const impactPos={xNm:c.position.xNm+fx*(hit.along||0)+sx*(hit.lateral||0),yNm:c.position.yNm+fy*(hit.along||0)+sy*(hit.lateral||0)};
    const impactZ=Math.max(.2,hit.z||3.5),now=this.state.time.elapsedSeconds;
    this.aar.gunFinish(shell,'HIT',impactPos,c,dmg.material);
    G.impactFlash={position:{...impactPos},zM:impactZ,startedAt:now,until:now+0.72,power:.72};
    this.state.weapons.explosions.push({position:{...impactPos},zM:impactZ,ageSec:0,maxAgeSec:5,label:'GUN HIT'});
    particles.spawnExplosion(impactPos.xNm,impactPos.yNm,0.38,false);PresentationBridge.audio(this.state).playDeckGunImpact?.(clamp(distNm(this.state.playerSub.position,impactPos)/deckGunSpecForState(this.state).maxRangeNm,0,1));
    this.sys.escorts.alert('SHIP_HIT',{...c.position},1);
    updateShipDamage(this,c,0);
    const condition=shipDamageCondition(c);
    this.aar.recordEvent('DECK_GUN_HIT',`Deck gun hit ${c.name} ${dmg.location.toLowerCase()}.`,
      {contactId:c.id,type:c.displayType||c.type,tons:c.tonsFactor||0,location:dmg.location,material:dmg.material,condition,weapon:'DECK_GUN'},
      this.state.playerSub.position,c.position);
    if(c.sunk){
      G.lastFall={text:`SUNK — ${c.id} +${ensureShipDamage(c).killPoints||0}`,until:this.state.time.elapsedSeconds+6};
      return;
    }
    const cap=(c.baseSpeed??c.speedKnots??0)*shipDamageSpeedFactor(c);
    this.log(`Deck gun hit ${c.name} ${dmg.location.toLowerCase()} — ${condition}; ${shipDamageSummary(c)}${cap>0?`; max about ${cap.toFixed(1)} kn`:''}.`,'warn');
  },

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
      // The old 12 s expiry deleted legitimate long-range rounds before they
      // reached the sea. Keep enough lifetime for every allowed 3-inch shot.
      if(sh.age>24)continue;
      const prev={xNm:sh.xNm,yNm:sh.yNm,zM:sh.zM};
      // light drag: enough to make long shots require a little more elevation,
      // without turning this into an artillery computer.
      const drag=Math.exp(-dt*0.012);sh.vxM*=drag;sh.vyM*=drag;sh.vzM=sh.vzM*drag-9.80665*dt;
      sh.xNm+=sh.vxM*dt/NM_M;sh.yNm+=sh.vyM*dt/NM_M;sh.zM+=sh.vzM*dt;sh.age+=dt;sh.prev=prev;
      let struck=null;
      for(const c of this.state.world.contacts){
        if(c.sunk)continue;const hit=this.sys.deckGun.segmentShipGunHit(prev,sh,c);if(hit){struck={c,hit};break;}
      }
      if(struck){this.sys.deckGun.damageShipByDeckGun(struck.c,struck.hit,sh);continue;}
      if(sh.zM<=0){
        const f=clamp(prev.zM/(prev.zM-sh.zM||1),0,1),pos={xNm:prev.xNm+(sh.xNm-prev.xNm)*f,yNm:prev.yNm+(sh.yNm-prev.yNm)*f};
        G.splashes.push({position:pos,age:0});G.lastFall={text:this.sys.deckGun.deckGunFallText(pos,sh.bearing),until:this.state.time.elapsedSeconds+3.5};
        this.aar.gunFinish(sh,'SPLASH',pos,null,null);
        PresentationBridge.audio(this.state).playShellSplash?.(clamp(distNm(sub.position,pos)/deckGunSpecForState(this.state).maxRangeNm,0,1));
        continue;
      }
      alive.push(sh);
    }
    G.shells=alive;
  },

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
};
