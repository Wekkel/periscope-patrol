class SimEngineAircraft extends SimEngineEnemyAI {
  updateAircraft(dt){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment;
    const now=this.state.time.elapsedSeconds;
    W.aircraft=W.aircraft||[];
    W.airThreat=W.airThreat||{level:env.airThreat===undefined?0.5:env.airThreat,alarmedAt:-999,sdOn:true};
    const air=W.airThreat;
    // Crew-managed arcade assist: SD is not a player toggle.  Whether the
    // boat actually has the set is determined by patrol date in sound-radar.js.
    this.ensureSoundRadarState?.();
    air.sdOn=!!W.radar?.sdAvailable;

    // ── does a patrol turn up? ──
    air.nextCheck=(air.nextCheck||0)-dt;
    if(air.nextCheck<=0){
      air.nextCheck=90;
      const nearLand=W.terrain.some(f=>f.points&&f.points.some(p=>distNm(sub.position,p)<26));
      const day=clamp(env.daylight,0,1);
      // hunters are sent out after an attack, and they fly by day near land
      const stirred=W.enemy.alertState!=='UNAWARE'?1.7:1;
      const surfaced=sub.depthFeet<10?1.5:1;
      let chance=0.020*air.level*stirred*surfaced*(0.35+day*0.85)*(nearLand?1.8:0.55);
      const localWx=weatherAtPosition(this.state,sub.position);
      chance*=(1-clamp(localWx.seaState,0,1)*0.35)*localWx.aircraftFactor;
      if(W.aircraft.length>=2) chance=0;
      if(Math.random()<chance){
        const bear=Math.random()*360, rng=11+Math.random()*9;
        const r=degToRad(bear);
        W.aircraft.push({
          id:`AIR-${(W.nextAirId=(W.nextAirId||0)+1)}`,
          ...(()=>{const r=Math.random();
            /* Keep the game-readable split simple rather than inventing a
               per-squadron loadout database: large maritime patrol flying boats
               carry aerial depth charges; the bomber/floatplane contacts use
               ordinary bombs. The ordnance changes warning/timing, not spawn
               frequency. */
            return r<0.42?{name:'Type 97 flying boat',kind:'FLYING_BOAT',ordnance:'DEPTH_CHARGE'}
                 :r<0.72?{name:'Nakajima B5N',kind:'BOMBER',ordnance:'BOMB'}
                        :{name:'Aichi E13A',kind:'FLOATPLANE',ordnance:'BOMB'};})(),
          position:{xNm:sub.position.xNm+Math.sin(r)*rng,yNm:sub.position.yNm-Math.cos(r)*rng},
          heading:normDeg(bear+180+(Math.random()-0.5)*40),
          speedKnots:115+Math.random()*70, state:'SEARCHING',
          bombs:2+Math.floor(Math.random()*3), runTimer:0, spotted:false, seenBySub:false,
          bornAt:now
        });
      }
    }

    for(const a of W.aircraft){
      const rng=distNm(a.position,sub.position);

      // ── the aircraft looking for us ──
      if(a.state==='SEARCHING'){
        // Each state has its own horizon: a surfaced boat trailing a white
        // wake is visible for miles from the air, a boat at periscope depth
        // only in clear water fairly close, and below a hundred feet not at all.
        let p=0,maxR=0;
        if(sub.depthFeet<10){p=0.55;maxR=11;}                // fully surfaced
        else if(sub.depthFeet<45){p=0.34;maxR=4.0;}          // decks awash / diving
        else if(sub.depthFeet<70){p=0.20;maxR=2.2;}          // scope up in clear water
        else if(sub.depthFeet<110){p=0.10;maxR=0.8;}         // a shadow, straight below
        if(sub.propulsion.speedKnots>10&&sub.depthFeet<20) maxR*=1.3;   // the wake
        const wx=weatherBetween(this.state,a.position,sub.position);
        maxR=Math.min(maxR,Math.max(.55,wx.visibilityNm*1.15));
        p*=clamp(wx.visibilityNm/12,0.12,1.4)*clamp(env.daylight*1.3+.10*wx.moonFactor,0.08,1.2);
        p*=Math.pow(clamp(1-rng/Math.max(.1,maxR),0,1),1.7);
        p*=(1-clamp(wx.seaState,0,1)*0.3)*wx.aircraftFactor;
        if(Math.random()<p*dt*0.5){
          a.state='ATTACKING'; a.spotted=true; a.runTimer=0;
          this.log(`${a.name} has sighted the boat and is turning in!`,'bad');
          audio.playAlarm();
        }
      }

      // ── us looking for the aircraft ──
      if(!a.seenBySub){
        const surfaced=sub.depthFeet<12;
        let seen=false, how='';
        const airBear=bearingBetween(sub.position,a.position);
        if(surfaced&&this.state.tactical.activeStation==='BRIDGE'){
          const wx=weatherBetween(this.state,sub.position,a.position),off=Math.abs(shortDelta(this.state.tactical.bridgeBearing,airBear));
          const inGlass=off<=bridgeFovDeg(this.state)*.52;
          const attack=a.state==='ATTACKING'||a.state==='STRAFING';
          const bridgeAirRange=Math.min(12,Math.max(1.4,wx.visibilityNm*(attack?1.05:.82)));
          // An aeroplane actually boring in on the boat cannot remain an
          // invisible world object while the player is looking straight at it
          // from an open bridge. Routine distant searches remain probabilistic.
          if(inGlass&&rng<=bridgeAirRange&&((attack&&rng<=6)||Math.random()<dt*(.18+.28*env.daylight))){
            seen=true;how=`Bridge lookouts: ${attack?'ATTACKING ':''}AIRCRAFT bearing ${fmtDeg(airBear)}, range ${rng.toFixed(1)} nm`;
          }
        }
        if(!seen&&surfaced&&air.sdOn&&rng<18&&Math.random()<dt*0.30){
          seen=true; how=`SD RADAR — air contact, range ${rng.toFixed(0)} miles, no bearing`;
        }else if(!seen&&surfaced&&env.daylight>0.25&&rng<clamp(env.visibilityNm*0.7,4,12)&&Math.random()<dt*0.22){
          seen=true; how=`Lookouts: AIRCRAFT bearing ${fmtDeg(airBear)}, range ${rng.toFixed(1)} nm`;
        }else if(!seen&&!surfaced&&sub.depthFeet<70&&this.state.tactical.activeStation==='PERISCOPE'
                 &&Math.abs(shortDelta(this.state.tactical.periscopeBearing,airBear))<16
                 &&rng<6&&Math.random()<dt*0.12){
          seen=true; how=`Periscope: aircraft in the field, bearing ${fmtDeg(airBear)}`;
        }
        if(seen){
          a.seenBySub=true; air.alarmedAt=now;
          const diveUnderway=(sub.orderedDepthFeet||0)>Math.max(12,(sub.depthFeet||0)+4)||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING';
          const airAction=sub.depthFeet<8&&!diveUnderway?'CLEAR THE BRIDGE!':sub.depthFeet<18&&diveUnderway?'CONTINUE THE DIVE!':'REMAIN SUBMERGED.';
          this.log(`⚠ AIR ALARM — ${how}. ${airAction}`,'bad');
          audio.playAlarm();
        }
      }

      // ── flying ──
      // An aircraft flies a pattern: a creeping search with regular turns, a
      // straight run in to bomb, then a pull-off and a circuit to come round
      // again or to watch the swirl. She rolls into her turns — about six
      // degrees a second, a comfortable rate one turn.
      const TURN=6.0;
      let want=a.heading;
      if(a.state==='ATTACKING'){
        const attackWx=weatherBetween(this.state,a.position,sub.position);
        if(attackWx.precipitation>.62&&rng>Math.max(.75,attackWx.visibilityNm*.8)){
          a.state='ORBIT';a.spotted=false;a.orbitAt={...sub.position};a.orbitTimer=75;
          this.log(`${a.name} lost the boat in the rain — circling the last sighting.`,'warn');
        }
        a.speedKnots=Math.min(a.speedKnots+dt*6,190);
        if(a.runTimer>0){
          // pulling off after a drop: swing wide, then come round for another run
          a.orbitSign=a.orbitSign||(Math.random()<0.5?1:-1);
          want=normDeg(bearingBetween(a.position,sub.position)+a.orbitSign*(rng<0.6?115:70));
        }else{
          want=bearingBetween(a.position,sub.position);
        }
        if(rng<0.35&&a.bombs>0&&a.runTimer<=0){
          a.runTimer=30; a.bombs--;
          this.airAttack(a,sub);
          if(a.bombs<=0){
            /* Empty of bombs, she can still strafe — and a submarine with
               men standing at an open gun is exactly the target a pilot
               will come back for. If the deck is clear she goes home. */
            if(W.aaManned&&sub.depthFeet<10&&env.daylight>0.25&&(a.rattled||0)<0.7&&Math.random()<0.5){
              a.state='STRAFING';a.passes=0;a.runTimer=18;
              this.log(`${a.name} has no bombs left — she is coming back with her guns. CLEAR THE DECK!`,'bad');
            }else{
              a.state='DEPARTING';this.log(`${a.name} has expended her bombs and is turning away.`,'warn');
            }
          }
        }
        if(sub.depthFeet>120&&Math.random()<dt*0.10){
          a.state='ORBIT'; a.spotted=false; a.orbitAt={...sub.position}; a.orbitTimer=120;
          this.log(`${a.name} has lost you in the depths — she is circling the swirl.`,'warn');
        }
      }else if(a.state==='STRAFING'){
        a.speedKnots=Math.min(a.speedKnots+dt*6,200);
        if(a.runTimer>0){
          a.orbitSign=a.orbitSign||(Math.random()<0.5?1:-1);
          want=normDeg(bearingBetween(a.position,sub.position)+a.orbitSign*(rng<0.6?115:70));
        }else want=bearingBetween(a.position,sub.position);
        if(!W.aaManned||sub.depthFeet>10){
          a.state='DEPARTING';
          this.log(`${a.name} finds the deck empty and turns for home.`,'warn');
        }else if(rng<0.20&&a.runTimer<=0){
          a.runTimer=22;a.passes=(a.passes||0)+1;
          const rat=clamp(a.rattled||0,0,1);
          this.log(`${a.name} is strafing — bullets all over the deck!`,'bad');
          this.shake(2.4); audio.playDepthCharge(0.9);
          if(Math.random()<0.42*(1-rat*0.5)) this.aaCasualty('Machine-gun fire raking the bridge.');
          else this.log('The burst went into the water alongside. The gun is still firing.','warn');
          if(a.passes>=2+Math.floor(Math.random()*2)){
            a.state='DEPARTING';this.log(`${a.name} is out of ammunition and turning away.`,'warn');
          }
        }
      }else if(a.state==='ORBIT'){
        // a tight circuit over the last known position, hoping you come back up
        a.speedKnots=Math.max(a.speedKnots-dt*4,120);
        a.orbitSign=a.orbitSign||1;
        const b=bearingBetween(a.position,a.orbitAt||sub.position);
        const r2=distNm(a.position,a.orbitAt||sub.position);
        want=normDeg(b+a.orbitSign*(r2>1.1?35:r2<0.5?115:80));
        a.orbitTimer=(a.orbitTimer||0)-dt;
        if(a.orbitTimer<=0){a.state='SEARCHING';a.legTimer=0;}
      }else if(a.state==='DEPARTING'){
        a.speedKnots=Math.min(a.speedKnots+dt*4,170);
      }else{                                       // SEARCHING — creeping line ahead
        a.legTimer=(a.legTimer||0)-dt;
        if(a.legTimer<=0){
          a.legTimer=70+Math.random()*70;
          a.legSign=-(a.legSign||1);
          a.searchAxis=(a.searchAxis===undefined?a.heading:a.searchAxis);
          a.legTarget=normDeg(a.searchAxis+a.legSign*55);
        }
        want=a.legTarget===undefined?a.heading:a.legTarget;
      }
      const dh=shortDelta(a.heading,want);
      a.heading=normDeg(a.heading+clamp(dh,-TURN*dt,TURN*dt));
      a.runTimer=Math.max(0,(a.runTimer||0)-dt);
      const d=knotsNmSec(a.speedKnots)*dt, r=degToRad(a.heading);
      a.position.xNm+=Math.sin(r)*d; a.position.yNm-=Math.cos(r)*d;
    }
    // patrols go home
    W.aircraft=W.aircraft.filter(a=>{
      const life=a.state==='ATTACKING'||a.state==='STRAFING'?600:a.state==='ORBIT'?420:a.bombs<=0?150:420;
      const gone=(now-a.bornAt>life)||distNm(a.position,sub.position)>18
                 ||(a.state==='DEPARTING'&&distNm(a.position,sub.position)>6);
      if(gone&&a.seenBySub&&!a.shotDown) this.log(`${a.name} has left the area.`);
      return !gone;
    });
  }

  /* ══════════ 3\"/50 DECK GUN ════════════════════════════════════════
     A surface weapon, not a button that spends hit points. The sight is laid
     in bearing and elevation; each round then flies a real ballistic arc. */
}
