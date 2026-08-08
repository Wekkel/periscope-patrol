class SimEngineSensors extends SimEngineIntel {
  updateLookouts(dt){
    const W=this.state.world, e=W.enemy, sub=this.state.playerSub, env=W.environment;
    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk);
    const day=clamp(env.daylight,0,1);
    const sea=clamp(env.seaState,0,1);
    let anySeen=false, nearestSeen=null;
    for(const esc of escorts){
      const rng=distNm(esc.position,sub.position);
      // how big a mark are we?
      let size, what;
      if(sub.depthFeet<12){size=1.0;what='surfaced submarine';}
      else if(sub.depthFeet<30){size=0.45;what='diving submarine';}
      else if(sub.depthFeet<70){                       // periscope, plus its feather
        size=(sub.propulsion.speedKnots>4?0.16:0.07)*(sub.damage.periscopeDamage>0.75?0:1);
        what='periscope';
      }else{size=0;what='';}
      if(size<=0) continue;
      // effective sighting range, in nm
      let reach=7.0*size*clamp(day*1.15+(e.starShellUntil>this.state.time.elapsedSeconds?0.55:0.12),0.10,1.2);
      reach*=clamp(env.visibilityNm/12,0.35,1.35)*(1-sea*0.40);
      if(rng>reach) continue;
      const p=clamp(1-rng/reach,0,1)*dt*0.55;
      if(Math.random()<p){
        anySeen=true;
        if(!nearestSeen||rng<nearestSeen.r) nearestSeen={esc,r:rng,what};
      }
    }
    const now=this.state.time.elapsedSeconds;
    if(anySeen) e.visualHoldUntil=now+25;
    // "visual contact" for gunnery means the hull, not a stick of periscope
    e.visualOnSub=now<(e.visualHoldUntil||0)&&sub.depthFeet<30;
    e.periscopeSighted=now<(e.visualHoldUntil||0)&&sub.depthFeet>=30;
    if(anySeen){
      const {esc,r,what}=nearestSeen;
      const hull=sub.depthFeet<30;
      e.lastKnownSubPosition={...sub.position};
      // a hull in plain sight is an exact fix; a feather of periscope is not
      const err=hull?0.02:0.055;
      e.solution={xNm:sub.position.xNm+(Math.random()-0.5)*2*err,
                  yNm:sub.position.yNm+(Math.random()-0.5)*2*err,
                  courseDeg:sub.heading+(hull?0:(Math.random()-0.5)*40),
                  speedKn:sub.propulsion.speedKnots,
                  depthFt:hull?sub.depthFeet:sub.depthFeet+(Math.random()-0.5)*50,
                  errNm:err,ageSec:0};
      e.alertTimerSec=Math.max(e.alertTimerSec,hull?240:150);
      if(e.alertState!=='ATTACKING'){
        e.alertState='ATTACKING';
        this.log(`${esc.name} LOOKOUTS HAVE SIGHTED YOU — ${what} at ${(r*2025).toFixed(0)} yards!`,'bad');
        audio.playAlarm();
      }
      if(hull) e.contactHeld=true;   // a periscope sighting is not a firm echo
    }
    // star shell at night once she knows roughly where you are
    if(day<0.25&&e.alertState==='ATTACKING'&&sub.depthFeet<30
       &&this.state.time.elapsedSeconds>(e.starShellUntil||0)+70&&Math.random()<dt*0.06){
      e.starShellUntil=this.state.time.elapsedSeconds+45;
      this.log('STAR SHELL — the sea around you is lit up like day.','bad');
    }
  }

  /* ── ECHO RANGING ──────────────────────────────────────────────────
     The escorts do not know where you are. They hold a *solution*: a
     position, a course, a speed and a guessed depth, each with an error that
     grows every second they cannot get an echo. Everything the player does —
     depth, speed, the layer, hard turns, silent running — feeds into whether
     the next ping produces a fix or a miss.                              */
  updateSonar(dt){
    const W=this.state.world, e=W.enemy, sub=this.state.playerSub, env=W.environment;
    const now=this.state.time.elapsedSeconds;
    if(e.alertState==='UNAWARE') return;
    const layer=env.layerDepthFt||200;
    const belowLayer=sub.depthFeet>layer+15;
    e.belowLayer=belowLayer;

    // the held solution drifts on dead reckoning and decays
    if(e.solution){
      const s=e.solution;
      const r=degToRad(s.courseDeg||0);
      const d=knotsNmSec(s.speedKn||0)*dt;
      s.xNm+=Math.sin(r)*d; s.yNm-=Math.cos(r)*d;
      s.errNm=(s.errNm||0.03)+dt*0.0055;
      s.ageSec=(s.ageSec||0)+dt;
    }

    const escorts=W.contacts.filter(c=>c.type==='ESCORT'&&!c.sunk);
    const blind=now<(e.sonarBlindUntil||0);
    let anyFix=false;
    for(const esc of escorts){
      esc.pingTimer=(esc.pingTimer||Math.random()*8)-dt;
      if(esc.pingTimer>0) continue;
      esc.pingTimer=12+Math.random()*8;
      const rng=distNm(esc.position,sub.position);
      const dead=rng<SONAR.deadZoneNm;
      let p=0;
      if(!blind&&!dead&&rng<SONAR.maxRangeNm){
        p=0.88
          *clamp(1-(rng-SONAR.deadZoneNm)/(SONAR.maxRangeNm-SONAR.deadZoneNm),0,1)
          *(belowLayer?0.26:1)
          *(0.5+0.5*clamp(sub.propulsion.speedKnots/6,0,1))
          *(1-clamp(env.seaState,0,1)*0.3)
          *(sub.stealth.silentRunning?0.85:1);
      }
      audio.playSonarPing();
      // a knuckle — the churned water left by a hard turn — can take the echo
      const kn=(W.knuckles||[]).find(k=>{
        const kr=distNm(esc.position,k.pos);
        return kr<rng&&kr<SONAR.maxRangeNm&&Math.abs(shortDelta(bearingBetween(esc.position,k.pos),
          bearingBetween(esc.position,sub.position)))<14;
      });
      if(kn&&Math.random()<0.5&&p>0){
        e.solution={xNm:kn.pos.xNm,yNm:kn.pos.yNm,courseDeg:0,speedKn:0,
          depthFt:sub.depthFeet+(Math.random()-0.5)*80,errNm:0.04,ageSec:0,decoy:true};
        e.contactHeld=true;e.misses=0;anyFix=true;
        this.log(`${esc.name} is echo-ranging on your knuckle.`,'warn');
        continue;
      }
      if(Math.random()<p){
        const err=0.006+rng*0.030+Math.random()*0.012+(belowLayer?0.022:0);
        const prev=e.solution;
        const nx=sub.position.xNm+(Math.random()-0.5)*2*err;
        const ny=sub.position.yNm+(Math.random()-0.5)*2*err;
        // The plot is built up over successive fixes: a steady target is solved
        // quickly, a boat that keeps altering course keeps breaking the solution.
        let crs=sub.heading+(Math.random()-0.5)*40, spd=sub.propulsion.speedKnots*(0.6+Math.random()*0.8);
        if(prev&&!prev.decoy&&prev.ageSec<70&&prev.ageSec>1){
          const rawC=bearingBetween({xNm:prev.xNm,yNm:prev.yNm},{xNm:nx,yNm:ny});
          const rawS=distNm({xNm:prev.xNm,yNm:prev.yNm},{xNm:nx,yNm:ny})/prev.ageSec*3600;
          crs=prev.courseDeg===undefined?rawC:normDeg(prev.courseDeg+shortDelta(prev.courseDeg,rawC)*0.5);
          spd=prev.speedKn===undefined?rawS:lerp(prev.speedKn,rawS,0.5);
        }
        e.solution={xNm:nx,yNm:ny,courseDeg:normDeg(crs),speedKn:clamp(spd,0,12),
          depthFt:sub.depthFeet+(Math.random()-0.5)*2*(16+(belowLayer?58:0)),
          errNm:err,ageSec:0};
        e.lastKnownSubPosition={xNm:nx,yNm:ny};
        e.alertTimerSec=Math.max(e.alertTimerSec,190);
        if(e.alertState!=='ATTACKING'){
          e.alertState='ATTACKING';
          this.log(`${esc.name} has a firm echo — ATTACKING.`,'bad');
        } else if(!e.contactHeld){
          this.log(`${esc.name} has regained contact.`,'warn');
        }
        e.contactHeld=true;e.misses=0;anyFix=true;
      }else{
        e.misses=(e.misses||0)+1;
        if(e.contactHeld){
          e.contactHeld=false;
          if(dead) this.log(`${esc.name} lost you in her sonar dead zone — she is attacking blind.`,'warn');
          else if(blind) this.log('Their sonar is still deaf from the last pattern.','warn');
          else if(belowLayer) this.log('Echo lost — you are under the layer.','warn');
          else this.log(`${esc.name} lost contact.`,'warn');
        }
      }
    }
    if(!anyFix&&(e.misses||0)>=5&&e.alertState==='ATTACKING'){
      e.alertState='SEARCHING';e.misses=0;
      e.searchPattern='EXPANDING_SQUARE';e.searchPhase=0;
      e.searchCenter=e.solution?{xNm:e.solution.xNm,yNm:e.solution.yNm}:{...sub.position};
      this.log('Escorts have lost the contact — they are searching.','warn');
    }
    // a hard turn at speed leaves a knuckle of churned water astern
    W.knuckles=(W.knuckles||[]).filter(k=>now-k.t<150);
    if(sub.propulsion.speedKnots>4.2&&Math.abs(shortDelta(sub.heading,sub.orderedHeading))>32
       &&now-(e.lastKnuckle||-99)>22){
      e.lastKnuckle=now;
      W.knuckles.push({pos:{...sub.position},t:now});
    }
  }

}
