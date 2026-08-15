const AAGunSystem={
  standDownAA(why,quiet=false){
    if(!this.state.world.aaManned) return;
    this.state.world.aaManned=false;
    quiet?this.log(why,'warn'):this.notify(why,'warn');
  },

  manageAutomaticAA(){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment, G=this.state.weapons.deckGun;
    const aaDefault=getSubmarineProfile(sub.profileId).weapons.aaGun.ammo;
    const aircraft=W.aircraft||[];
    const active=aircraft.filter(a=>a.side!=='FRIENDLY'&&a.seenBySub&&!a.shotDown&&(a.state==='ATTACKING'||a.state==='STRAFING'));
    const close=active.some(a=>distNm(a.position,sub.position)<=1.25);
    const diveOrdered=sub.orderedDepthFeet>10||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING'||sub.mode==='PERISCOPE_DEPTH'||sub.mode==='SUBMERGED';

    if(W.aaManned){
      if(diveOrdered){this.sys.deckOperations.clearForDive('Dive order');return;}
      if(!active.length){this.sys.aaGun.standDownAA('Air attack passed — AA crew below automatically.',true);return;}
      return;
    }
    // Doctrine remains DIVE. The gun is only an automatic last-ditch fallback
    // if the skipper has stayed on the surface until an attacker is close.
    if(!close||diveOrdered||G?.manned||sub.depthFeet>8||env.seaState>0.82||(W.aaAmmo??aaDefault)<=0) return;
    W.aaManned=true;
    this.notify('Air attack close — AA crew manning the 20 mm automatically. A dive ordered now will pause briefly while they clear the hatch.','warn');
  },

  aaCasualty(what){
    const sub=this.state.playerSub, W=this.state.world;
    W.aaManned=false;
    W.aaHurt=(W.aaHurt||0)+1;
    sub.damage.crewFatigue=clamp(sub.damage.crewFatigue+0.24,0,1);
    this.notify(`${what} Men down on the cigarette deck — gun abandoned, wounded passed below.`,'bad');
    PresentationBridge.audio(this.state).event?.('AIRCRAFT_ATTACK');
  },

  updateAAGun(dt){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment;
    if(W.aaAmmo===undefined) W.aaAmmo=getSubmarineProfile(sub.profileId).weapons.aaGun.ammo; // legacy-save migration
    this.sys.aaGun.manageAutomaticAA();
    if(!W.aaManned) return;
    if(sub.mode==='SUNK'){W.aaManned=false;return;}
    if(sub.depthFeet>10){this.sys.aaGun.standDownAA('Deck going under — gun crew driven below.');return;}
    if(env.seaState>0.86){this.sys.aaGun.standDownAA('Sea breaking clean over the gun — crew below before we lose them.');return;}
    if(W.aaAmmo<=0){this.sys.aaGun.standDownAA('Ready-use lockers empty — gun crew below.');return;}

    for(const a of W.aircraft){
      if(a.side==='FRIENDLY'||!a.seenBySub) continue;
      const rng=distNm(a.position,sub.position);
      const engaging=(a.state==='ATTACKING'||a.state==='STRAFING');
      if(rng>(engaging?1.05:0.6)) continue;
      // effectiveness: range band, light, how much the deck is moving, fatigue
      const band = rng<0.11?1 : clamp(1-(rng-0.11)/0.85,0.05,1);
      const light= clamp(env.daylight*1.7,0.08,1)*(env.weather==='FOG'?0.5:1);
      const deck = 1-clamp(env.seaState,0,1)*0.55;
      const tired= 1-sub.damage.crewFatigue*0.45;
      const eff  = band*light*deck*tired;
      W.aaAmmo=Math.max(0,W.aaAmmo-dt*7.5);              // ~450 rounds a minute
      a.aaDamage=(a.aaDamage||0)+eff*dt*0.014;
      a.rattled =clamp((a.rattled||0)+eff*dt*0.055,0,1);
      if(!a.underFire){a.underFire=true;this.log(`20 mm opening up on ${a.name}!`,'warn');}
      if(!this._aaSnd||this.state.time.elapsedSeconds-this._aaSnd>1.6){
        this._aaSnd=this.state.time.elapsedSeconds; PresentationBridge.audio(this.state).playDeckGun?.(0.5);
      }
      // she has had enough and sheers off
      if(a.state!=='DEPARTING'&&Math.random()<clamp(a.aaDamage-0.10,0,1)*0.085*dt){
        a.state='DEPARTING';a.bombs=0;
        this.log(`${a.name} has been hit and is sheering off — the gun drove her away!`,'warn');
        continue;
      }
      // rare, and remembered for the rest of the war
      if(Math.random()<clamp(a.aaDamage-0.06,0,1)*0.011*dt){
        this.log(`SPLASH ONE! ${a.name} is going in — she is burning on the water.`,'warn');
        this.state.weapons.explosions.push({position:{...a.position},ageSec:0,maxAgeSec:9,label:'SPLASH'});
        particles.spawnExplosion(a.position.xNm,a.position.yNm,1.0,false);
        a.state='DEPARTING';a.bombs=0;a.shotDown=true;a.bornAt=-9999;
        W.aaKills=(W.aaKills||0)+1;
        PresentationBridge.audio(this.state).playHit?.();
      }
    }
  },

  airDepthChargeAttack(a,sub,aim=null){
    const W=this.state.world,rat=clamp(a.rattled||0,0,1),wx=weatherBetween(this.state,a.position,sub.position);
    /* Aerial ASW charges deliberately trade immediacy for warning. Their
       horizontal placement and depth setting are substantially rougher than a
       destroyer's sonar-led pattern, and their explosive weight is reduced in
       the damage solver below. That preserves the current gameplay rule that
       getting to ~100 ft is usually a very good answer to an aircraft attack. */
    const err=(0.045+Math.random()*0.075+rat*0.055)/Math.max(.35,wx.aircraftAttackFactor),datum=aim||a.attackDatum||sub.position;
    const pos={xNm:datum.xNm+(Math.random()-0.5)*2*err,
               yNm:datum.yNm+(Math.random()-0.5)*2*err};
    // The pilot cannot read actual submerged depth. Estimate it from how long
    // ago the visual/wake datum was made; the physical damage solver later uses
    // the boat's true position/depth. A prompt deep dive therefore matters.
    const datumAge=Math.max(0,this.state.time.elapsedSeconds-(a.attackDatum?.at??this.state.time.elapsedSeconds));
    let band=clamp(65+datumAge*1.55,60,190);
    const depthErr=(Math.random()-0.5)*180+(rat*50*(Math.random()<.5?-1:1));
    const guess=clamp(band+depthErr,45,280),sinkFps=8.5;
    const dc={id:`ADC-${W.nextDcId=(W.nextDcId||0)+1}`,ownerId:a.id,source:'AIR',position:pos,ageSec:0,
      fuseSec:clamp(guess/sinkFps,5,33),targetDepthFeet:guess,status:'SINKING',strength:28};
    W.depthCharges.push(dc);
    const b=bearingBetween(sub.position,pos);
    PresentationBridge.audio(this.state).event?.('DEPTH_CHARGE_SPLASH',{distanceFactor:.75});dc.waterEntryPlayed=true;
    this.log(`${sub.depthFeet<12?'LOOKOUTS':'SOUND'} — AERIAL DEPTH CHARGE IN THE WATER, bearing ${fmtDeg(b)}. It is still sinking.`,'bad');
    this.aar.recordEvent('AIRCRAFT_DEPTH_CHARGE',`${a.name} dropped an aerial depth charge.`,{aircraftId:a.id,depthFt:guess},a.position,pos);
    this.sys.escorts.alert('AIR_ATTACK',{...pos},0.6);
  },

  airAttack(a,sub,aim=null){
    const W=this.state.world;
    const ordnance=a.ordnance||(a.kind==='FLYING_BOAT'?'DEPTH_CHARGE':'BOMB');
    if(ordnance==='DEPTH_CHARGE') return this.sys.aaGun.airDepthChargeAttack(a,sub,aim);
    // Ordinary bombs are surface weapons here. Once the hull is submerged they
    // may burst spectacularly on the last visible datum, but they cannot acquire
    // or damage an underwater boat; ASW-capable flying boats use depth charges.
    const datum=aim||a.attackDatum||sub.position,rat=clamp(a.rattled||0,0,1),wx=weatherBetween(this.state,a.position,datum);
    const err=(0.012+Math.random()*.05+rat*.058)/Math.max(.35,wx.aircraftAttackFactor);
    if(rat>.25)this.log(`${a.name} is being hosed by the 20 mm — she drops high and wide.`,'warn');
    const pos={xNm:datum.xNm+(Math.random()-.5)*2*err,yNm:datum.yNm+(Math.random()-.5)*2*err};
    const submerged=sub.depthFeet>12,hNm=distNm(pos,sub.position),dmg=submerged?0:52*Math.exp(-hNm/.020);
    this.state.weapons.explosions.push({position:{...pos},ageSec:0,maxAgeSec:8,label:dmg>4?`AIR BOMB -${Math.round(dmg)}`:'AIR BOMB'});
    if(W.aaManned&&!submerged&&hNm<.035&&Math.random()<.34)this.sys.aaGun.aaCasualty('Bomb burst close aboard.');
    if(dmg>1.5){this.sys.damage.applyShock(dmg);PresentationBridge.audio(this.state).event?.('AIR_BOMB',{distanceFactor:clamp(1-dmg/52,0,1)});particles.spawnExplosion(pos.xNm,pos.yNm,.9,false);this.log(`AIR BOMB — ${dmg.toFixed(0)}% damage. Get her down!`,'bad');}
    else{PresentationBridge.audio(this.state).event?.('AIR_BOMB',{distanceFactor:.85});particles.spawnExplosion(pos.xNm,pos.yNm,.55,false);this.log(submerged?`${a.name} bombs the last surface datum — the boat is already under.`:`${a.name} dropped ordinary bombs — near miss.`,'warn');}
    this.sys.escorts.alert('AIR_ATTACK',{...pos},0.6);
  },

  /* ══════════ RADIO ══════════
     Boats copied the shore broadcast — the "fox schedule" — with the antenna
     out of the water, normally on the surface at night while charging. Traffic
     included ULTRA: decrypts of Japanese routing signals that put a boat right
     across a convoy's track. It is why the patrols worked. */
};
