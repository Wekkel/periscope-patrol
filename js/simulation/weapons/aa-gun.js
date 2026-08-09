class SimEngineAAGun extends SimEngineDeckGun {
  standDownAA(why,quiet=false){
    if(!this.state.world.aaManned) return;
    this.state.world.aaManned=false;
    quiet?this.log(why,'warn'):this.notify(why,'warn');
  }

  manageAutomaticAA(){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment, G=this.state.weapons.deckGun;
    const aircraft=W.aircraft||[];
    const active=aircraft.filter(a=>a.seenBySub&&!a.shotDown&&(a.state==='ATTACKING'||a.state==='STRAFING'));
    const close=active.some(a=>distNm(a.position,sub.position)<=1.25);
    const diveOrdered=sub.orderedDepthFeet>10||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING'||sub.mode==='PERISCOPE_DEPTH'||sub.mode==='SUBMERGED';

    if(W.aaManned){
      if(diveOrdered){this.clearDeckForDive('Dive order');return;}
      if(!active.length){this.standDownAA('Air attack passed — AA crew below automatically.',true);return;}
      return;
    }
    // Doctrine remains DIVE. The gun is only an automatic last-ditch fallback
    // if the skipper has stayed on the surface until an attacker is close.
    if(!close||diveOrdered||G?.manned||sub.depthFeet>8||env.seaState>0.82||(W.aaAmmo??1200)<=0) return;
    W.aaManned=true;
    this.notify('Air attack close — AA crew manning the 20 mm automatically. A dive ordered now will pause briefly while they clear the hatch.','warn');
  }

  aaCasualty(what){
    const sub=this.state.playerSub, W=this.state.world;
    W.aaManned=false;
    W.aaHurt=(W.aaHurt||0)+1;
    sub.damage.crewFatigue=clamp(sub.damage.crewFatigue+0.24,0,1);
    this.notify(`${what} Men down on the cigarette deck — gun abandoned, wounded passed below.`,'bad');
    audio.playAlarm();
  }

  updateAAGun(dt){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment;
    if(W.aaAmmo===undefined) W.aaAmmo=1200;              // ready-use lockers, rounds
    this.manageAutomaticAA();
    if(!W.aaManned) return;
    if(sub.mode==='SUNK'){W.aaManned=false;return;}
    if(sub.depthFeet>10){this.standDownAA('Deck going under — gun crew driven below.');return;}
    if(env.seaState>0.86){this.standDownAA('Sea breaking clean over the gun — crew below before we lose them.');return;}
    if(W.aaAmmo<=0){this.standDownAA('Ready-use lockers empty — gun crew below.');return;}

    for(const a of W.aircraft){
      if(!a.seenBySub) continue;
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
        this._aaSnd=this.state.time.elapsedSeconds; audio.playDeckGun?.(0.5);
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
        audio.playHit?.();
      }
    }
  }

  airAttack(a,sub){
    const W=this.state.world;
    // bombs are aimed at where she sees the boat; depth is everything
    /* This is where the gun earns its keep. A pilot being hosed with 20 mm
       does not fly a copybook run: he comes in higher, releases early and
       jinks. The bombs go in the sea. Since damage falls off exponentially
       with miss distance, a hundred yards of extra error is very nearly the
       whole difference between a scratched hull and a lost boat. */
    const rat=clamp(a.rattled||0,0,1),wx=weatherBetween(this.state,a.position,sub.position);
    const err=(0.012+Math.random()*0.05+(sub.depthFeet>30?0.03:0)+rat*0.058)/wx.aircraftAttackFactor;
    if(rat>0.25) this.log(`${a.name} is being hosed by the 20 mm — she drops high and wide.`,'warn');
    const pos={xNm:sub.position.xNm+(Math.random()-0.5)*2*err,
               yNm:sub.position.yNm+(Math.random()-0.5)*2*err};
    const hNm=distNm(pos,sub.position);
    let depthFactor;
    if(sub.depthFeet<12)      depthFactor=1.0;              // caught on the surface
    else if(sub.depthFeet<45) depthFactor=0.75;             // still going down
    else if(sub.depthFeet<90) depthFactor=0.35;
    else if(sub.depthFeet<150)depthFactor=0.10;
    else                      depthFactor=0.02;
    const dmg=52*Math.exp(-hNm/0.020)*depthFactor;
    this.state.weapons.explosions.push({position:{...pos},ageSec:0,maxAgeSec:8,
      label:dmg>4?`BOMB -${Math.round(dmg)}`:'BOMB'});
    // Men standing at an open gun with bombs going off alongside.
    if(W.aaManned&&sub.depthFeet<10&&hNm<0.035&&Math.random()<0.34){
      this.aaCasualty('Bomb burst close aboard.');
    }
    if(dmg>1.5){
      this.applyShock(dmg);
      audio.playDepthCharge(clamp(1-dmg/52,0,1));
      particles.spawnExplosion(pos.xNm,pos.yNm,0.9,false);
      this.log(`Bombs! ${dmg.toFixed(0)}% damage.${sub.depthFeet<45?' Get her down!':''}`,'bad');
    }else{
      audio.playDepthCharge(0.85);
      this.log(`${a.name} dropped — near miss.`,'warn');
    }
    this.alertEscorts('AIR_ATTACK',{...sub.position},0.6);
  }

  /* ══════════ RADIO ══════════
     Boats copied the shore broadcast — the "fox schedule" — with the antenna
     out of the water, normally on the surface at night while charging. Traffic
     included ULTRA: decrypts of Japanese routing signals that put a boat right
     across a convoy's track. It is why the patrols worked. */
}
