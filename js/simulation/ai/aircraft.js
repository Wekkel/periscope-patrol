class SimEngineAircraft extends SimEngineEnemyAI {
  /* Aircraft must not become an omniscient anti-submarine sensor after the
     bridge clears.  We keep one short-lived WORLD-space surface trace: wake,
     foam and the last swirl left while the boat is diving.  Once the boat is
     deep, a pilot can attack that datum but not the invisible current position.
     This is also what makes an underwater turn away from the datum meaningful. */
  updateAirSurfaceTrace(){
    const W=this.state.world,sub=this.state.playerSub,env=W.environment,now=this.state.time.elapsedSeconds;
    W.airThreat=W.airThreat||{};const air=W.airThreat;
    const diving=(sub.orderedDepthFeet||0)>Math.max(12,(sub.depthFeet||0)+4)||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING';
    if((sub.depthFeet||0)<14||(diving&&(sub.depthFeet||0)<48)){
      air.surfaceTrace={position:{...sub.position},heading:sub.heading,speedKnots:sub.propulsion.speedKnots||0,
        at:now,strength:clamp(.42+(sub.propulsion.speedKnots||0)/18*.48+(sub.depthFeet<10?.24:0),.30,1.15),depthAtTrace:sub.depthFeet};
      return air.surfaceTrace;
    }
    const tr=air.surfaceTrace;if(!tr)return null;
    if(this.airSurfaceTraceStrength(tr)<=.015){delete air.surfaceTrace;return null;}
    return tr;
  }

  airSurfaceTraceStrength(tr){
    if(!tr?.position)return 0;
    const now=this.state.time.elapsedSeconds,age=Math.max(0,now-(tr.at||0)),wx=weatherAtPosition(this.state,tr.position);
    // Calm clear water preserves a useful wake longest; rain and a rough sea
    // erase it quickly.  This is visual persistence, not a magic submerged track.
    const life=clamp(118*(1-clamp(wx.seaState||0,0,1)*.42)*(1-clamp(wx.precipitation||0,0,1)*.52)*clamp(.78+(wx.visibilityNm||8)/28,.72,1.18),42,145);
    return clamp((tr.strength||.6)*Math.pow(clamp(1-age/life,0,1),1.35),0,1.2);
  }

  airAttackDatumPosition(a){
    const D=a?.attackDatum;if(!D||!Number.isFinite(D.xNm)||!Number.isFinite(D.yNm))return null;
    const age=clamp((this.state.time.elapsedSeconds-(D.at||0)),0,85),d=knotsNmSec(clamp(D.speedKnots||0,0,18))*age,r=degToRad(D.courseDeg||0);
    return{xNm:D.xNm+Math.sin(r)*d,yNm:D.yNm-Math.cos(r)*d};
  }

  wearAirState(){
    const W=this.state.world;W.airThreat=W.airThreat||{};
    return W.airThreat.wear||(W.airThreat.wear={learned:false,manualAircraftId:null,active:null});
  }

  /* WEAR = the long, otherwise routine homeward leg. This is intentionally a
     hard-and-fast gate over state the simulation already owns, not a new event
     director. If anything tactically interesting exists, the captain keeps the
     conn. */
  wearAirEligibility(requireCompressed=true){
    const s=this.state,W=s.world,sub=s.playerSub,c=s.campaign,T=s.time;
    const wp=s.map.plottedCourse?.[0],nav=this.friendlyPortNav?.();
    if(c.missionStatus!=='RETURN TO BASE'||!c._headingHome||!wp||wp.navKind!=='FRIENDLY_APPROACH')return{ok:false,why:'not on the homeward approach'};
    if(!nav||nav.rngNm<=12)return{ok:false,why:'inside the home approach'};
    if(requireCompressed&&!((T.timeScale||1)>1||T.transitUntil))return{ok:false,why:'the captain is manoeuvring at real time'};
    if(W.enemy?.alertState!=='UNAWARE')return{ok:false,why:'escort activity'};
    if((W.harbor?.alert||0)>0)return{ok:false,why:'harbor defenses'};
    if(sub.inShallowWater||(sub.seabedFeet??3000)<165||(sub.keelClearanceFeet??3000)<150)return{ok:false,why:'shoal water'};
    if(sub.damage.hullIntegrity<55||sub.damage.flooding>.20)return{ok:false,why:'damage'};
    if(sub.propulsion.battery<18)return{ok:false,why:'battery state'};
    if(sub.damage.oxygen<35)return{ok:false,why:'air state'};
    if(sub.propulsion.fuel<20)return{ok:false,why:'fuel state'};
    if((s.weapons.activeTorpedoes||[]).some(t=>t.status==='RUNNING'))return{ok:false,why:'torpedoes running'};
    if((W.depthCharges||[]).some(dc=>dc.status==='SINKING'))return{ok:false,why:'depth charges in the water'};
    if(W.aaManned||s.weapons.deckGun?.manned)return{ok:false,why:'gun crews are topside'};
    const hotTrack=Object.values(W.contactTracks||{}).find(tr=>tr&&!tr.sunk&&tr.confidence>=.08&&(tr.staleSeconds||0)<600);
    if(hotTrack)return{ok:false,why:'a sound or surface contact is being worked'};
    return{ok:true,why:''};
  }

  wearAirNotice(msg,kind='warn'){
    this.log(msg,kind);
    // Routine transit normally holds queued toasts. This hand-off message is
    // one of the rare things the player should see immediately even at 32x.
    if(typeof Toast!=='undefined'){
      const fn=kind==='bad'?'bad':kind==='ok'?'ok':'warn';Toast[fn]?.(msg);
    }
  }

  noteWearManualAircraft(a,wasCompressed=true){
    const wear=this.wearAirState();
    if(wear.learned||wear.manualAircraftId||!wasCompressed)return;
    if(!this.wearAirEligibility(false).ok)return;
    wear.manualAircraftId=a.id;wear.manualClear=false;
  }

  startWearAirRoutine(a){
    const wear=this.wearAirState(),elig=this.wearAirEligibility(true),sub=this.state.playerSub;
    if(!wear.learned||wear.active||!elig.ok||a.state!=='SEARCHING')return false;
    const safeDepth=120;
    wear.active={aircraftId:a.id,phase:sub.depthFeet>=105?'HIDE':'DIVE',safeDepth,
      saved:{orderedRpm:sub.propulsion.orderedRpm,orderedHeading:sub.orderedHeading,orderedDepthFeet:sub.orderedDepthFeet},startedAt:this.state.time.elapsedSeconds};
    a._wearManaged=true;
    this.clearDeckForDive('Routine air evasion');
    sub.orderedDepthFeet=safeDepth;
    sub.propulsion.orderedRpm=Math.min(sub.propulsion.orderedRpm||220,220);
    this.derivMode?.();
    this.wearAirNotice(`AIR CONTACT — ROUTINE EVASION. CREW HAS THE BOAT — diving to ${safeDepth} ft.`,'warn');
    return true;
  }

  abortWearAirRoutine(reason){
    const wear=this.wearAirState(),active=wear.active;if(!active)return;
    const a=(this.state.world.aircraft||[]).find(x=>x.id===active.aircraftId);if(a)a._wearManaged=false;
    wear.active=null;
    const T=this.state.time;T.timeScale=1;T.transitUntil=0;T.transitOpen=false;T.transitReason=reason;T.stopReason=reason;T.stopReasonAt=T.elapsedSeconds;
    // Deliberately do NOT restore depth/RPM/heading orders. The crew hands the
    // conn over; it does not cancel a safety manoeuvre halfway through it.
    this.wearAirNotice(`CAPTAIN REQUIRED — ${reason.toUpperCase()}. Routine air evasion disengaged; current orders remain in force.`,'bad');
  }

  updateWearAirRoutine(){
    const s=this.state,W=s.world,sub=s.playerSub,wear=this.wearAirState(),now=s.time.elapsedSeconds;

    // The first qualifying aeroplane stays a normal player problem. Once the
    // skipper has cleared it, surfaced and resumed the official compressed
    // homeward leg, the crew is trusted with repetitions for this patrol.
    if(!wear.learned&&wear.manualAircraftId){
      const a=(W.aircraft||[]).find(x=>x.id===wear.manualAircraftId);
      const clear=!a||a.shotDown||(a.state==='DEPARTING'&&distNm(a.position,sub.position)>=8.5);
      if(clear)wear.manualClear=true;
      if(wear.manualClear&&sub.depthFeet<12&&this.wearAirEligibility(true).ok){
        wear.learned=true;wear.manualAircraftId=null;wear.manualClear=false;
        this.wearAirNotice('AIR EVASION COMPLETE — crew has the routine for the homeward leg.','ok');
      }
    }

    const active=wear.active;if(!active)return;
    const a=(W.aircraft||[]).find(x=>x.id===active.aircraftId);
    const elig=this.wearAirEligibility(false);
    const otherAir=(W.aircraft||[]).find(x=>x.side!=='FRIENDLY'&&!x.shotDown&&x.id!==active.aircraftId&&x.seenBySub&&x.state!=='DEPARTING');
    if(!elig.ok){this.abortWearAirRoutine(elig.why);return;}
    if((s.time.timeScale||1)<=1&&!s.time.transitUntil){this.abortWearAirRoutine('the captain has slowed to real time');return;}
    if(otherAir){this.abortWearAirRoutine('a second air contact');return;}
    if(a&&(a.state==='ATTACKING'||a.state==='STRAFING')){this.abortWearAirRoutine('aircraft attack');return;}

    if(active.phase==='DIVE'){
      if(sub.depthFeet>=105)active.phase='HIDE';
      return;
    }
    if(active.phase==='HIDE'){
      const clear=!a||a.shotDown||(a.state==='DEPARTING'&&distNm(a.position,sub.position)>=9.5);
      if(!clear)return;
      active.phase='RECOVER';active.clearAt=now;
      sub.orderedDepthFeet=0;
      sub.orderedHeading=active.saved.orderedHeading;
      this.derivMode?.();
      return;
    }
    if(active.phase==='RECOVER'){
      // A fresh threat while climbing is never allowed to continue in the
      // background. Transfer the conn at 1x and retain the current safe orders.
      if(a&&!a.shotDown&&a.state!=='DEPARTING'){this.abortWearAirRoutine('air contact still active');return;}
      if(sub.depthFeet<=8){
        sub.orderedHeading=active.saved.orderedHeading;
        sub.propulsion.orderedRpm=active.saved.orderedRpm;
        if(a)a._wearManaged=false;
        wear.active=null;
        this.log('ROUTINE AIR EVASION COMPLETE — homeward course and power restored.','ok');
      }
    }
  }

  beginAircraftAttack(a,observed,source='VISUAL',motion=null){
    const s=this.state,now=s.time.elapsedSeconds,src=source==='WAKE'?'WAKE':'VISUAL';
    const unc=src==='WAKE'?clamp(.035+(1-(motion?.strength||.5))*.11,.035,.15):.012;
    const aa=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random())*unc;
    a.attackDatum={xNm:observed.xNm+Math.cos(aa)*rr,yNm:observed.yNm+Math.sin(aa)*rr,
      courseDeg:motion?.heading??s.playerSub.heading,speedKnots:motion?.speedKnots??s.playerSub.propulsion.speedKnots,at:now,source:src,uncertaintyNm:unc};
    a.state='ATTACKING';a.spotted=true;a.runTimer=0;a.orbitAt={xNm:a.attackDatum.xNm,yNm:a.attackDatum.yNm};
    // An attack run is never allowed to happen as an invisible 32x background
    // event.  Even if the original patrol was not spotted, the attack warning is
    // an intentional arcade hand-off of the conn to the player.
    a.seenBySub=true;s.world.airThreat.alarmedAt=now;
    const T=s.time,wasCompressed=!!(T.transitUntil||(T.timeScale||1)>1);this.noteWearManualAircraft(a,wasCompressed);
    if(wasCompressed){T.timeScale=1;T.transitUntil=0;T.transitOpen=false;T.transitReason='aircraft attack';T.stopReason='aircraft attack';T.stopReasonAt=now;}
    this.log(src==='WAKE'?`${a.name} has picked up the diving wake and is turning onto the last datum!`:`${a.name} has sighted the boat and is turning in!`,'bad');
    audio.event?.('AIRCRAFT_SPOTTED');
  }

  updateAircraft(dt){
    const W=this.state.world, sub=this.state.playerSub, env=W.environment;
    const now=this.state.time.elapsedSeconds,campaignProfileId=this.state.campaign?.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId;
    const airDoctrine=getCampaignDoctrineProfile(campaignProfileId)?.air;
    if(!airDoctrine?.hostile||!airDoctrine?.friendly)return;
    const hostileDoctrine=airDoctrine.hostile,friendlyDoctrine=airDoctrine.friendly;
    W.aircraft=W.aircraft||[];
    W.airThreat=W.airThreat||{level:env.airThreat===undefined?0.5:env.airThreat,alarmedAt:-999,airWarningOn:true,sdOn:true};
    const air=W.airThreat;
    const friendlyPorts=(W.ports||[]).filter(p=>p.side==='FRIENDLY'&&p.pos);
    const nearestFriendly=pos=>{let best=null;for(const port of friendlyPorts){const rngNm=distNm(pos,port.pos);if(!best||rngNm<best.rngNm)best={port,rngNm};}return best;};
    // Crew-managed arcade assist. Equipment presentation comes from the boat
    // profile; patrol-date availability is mapped to this generic capability by
    // sound-radar.js. `sdOn` remains only as a legacy save/debug alias.
    this.ensureSoundRadarState?.();
    air.airWarningOn=!!W.radar?.airWarningAvailable;air.sdOn=air.airWarningOn;

    // ── does a patrol turn up? ──
    air.nextCheck=(air.nextCheck||0)-dt;
    if(air.nextCheck<=0){
      const D=hostileDoctrine;air.nextCheck=D.checkSec;
      const nearLand=W.terrain.some(f=>f.points&&f.points.some(p=>distNm(sub.position,p)<D.nearLandRadiusNm));
      const day=clamp(env.daylight,0,1);
      // Campaign doctrine decides patrol pressure; detection/attack mechanics
      // remain shared and still depend on actual local conditions.
      const stirred=W.enemy.alertState!=='UNAWARE'?D.alertedFactor:1;
      const surfaced=sub.depthFeet<10?D.surfacedFactor:1;
      let chance=D.baseChance*air.level*stirred*surfaced*(D.dayBase+day*D.dayFactor)*(nearLand?D.nearLandFactor:D.openWaterFactor);
      const localWx=weatherAtPosition(this.state,sub.position),friendly=nearestFriendly(sub.position),P=D.friendlyPort;
      chance*=(1-clamp(localWx.seaState,0,1)*0.35)*localWx.aircraftFactor;
      /* A friendly service port represents a locally controlled anchorage, not
         a magic force field. Routine hostile reconnaissance/ASW searches are
         nevertheless much less likely in defended inner approaches. Aircraft
         already committed to an attack are not deleted or made harmless. */
      if(friendly&&W.enemy.alertState==='UNAWARE'){
        if(friendly.rngNm<=P.unawareBlockNm)chance=0;
        else if(friendly.rngNm<=P.unawareInnerNm)chance*=P.unawareInnerFactor;
        else if(friendly.rngNm<=P.unawareOuterNm)chance*=P.unawareOuterFactor;
      }else if(friendly&&friendly.rngNm<=P.alertedInnerNm)chance*=P.alertedInnerFactor;
      if(W.aircraft.filter(a=>a.side!=='FRIENDLY').length>=D.maxConcurrent) chance=0;
      if(Math.random()<chance){
        const bear=Math.random()*360, rng=D.spawnRangeMinNm+Math.random()*D.spawnRangeSpreadNm;
        const r=degToRad(bear),hunt=(W.enemy.alertState!=='UNAWARE'&&W.enemy.lastKnownSubPosition)?W.enemy.lastKnownSubPosition:sub.position;
        const rosterRoll=Math.random(),template=D.roster.find(x=>x.before===undefined||rosterRoll<x.before)||D.roster[D.roster.length-1];
        W.aircraft.push({
          id:`AIR-${(W.nextAirId=(W.nextAirId||0)+1)}`,side:'ENEMY',name:template.name,kind:template.kind,ordnance:template.ordnance,
          position:{xNm:hunt.xNm+Math.sin(r)*rng,yNm:hunt.yNm-Math.cos(r)*rng},
          heading:normDeg(bear+180+(Math.random()-0.5)*D.headingJitterDeg),
          speedKnots:D.speedMinKn+Math.random()*D.speedSpreadKn, state:'SEARCHING',
          bombs:D.bombMin+Math.floor(Math.random()*D.bombExtraExclusive), runTimer:0, spotted:false, seenBySub:false,
          bornAt:now
        });
      }
    }

    /* Friendly aircraft are deliberately a tiny ambient layer, not a second
       air-war simulation. One local patrol at most can cross the tactical
       bubble. This gives friendly-controlled waters life without multiplying
       update cost on the Helios G88 or granting the player permanent air cover. */
    const F=friendlyDoctrine;
    air.friendlyNextCheck=(air.friendlyNextCheck??(F.initialCheckBaseSec+Math.random()*F.initialCheckSpreadSec))-dt;
    if(air.friendlyNextCheck<=0){
      air.friendlyNextCheck=F.repeatCheckBaseSec+Math.random()*F.repeatCheckSpreadSec;
      const friendlyLocal=W.aircraft.some(a=>a.side==='FRIENDLY'&&!a.shotDown);
      const area=this.state.campaign?.patrolArea||'',deepEnemy=F.blockedAreas.includes(area);
      const day=clamp(env.daylight,0,1);
      if(!friendlyLocal&&!deepEnemy&&day>F.minDaylight&&Math.random()<F.spawnChance){
        const bear=Math.random()*360,rng=F.spawnRangeMinNm+Math.random()*F.spawnRangeSpreadNm,r=degToRad(bear);
        const rosterRoll=Math.random(),fp=F.roster.find(x=>x.before===undefined||rosterRoll<x.before)||F.roster[F.roster.length-1];
        W.aircraft.push({
          id:`FAIR-${(W.nextFriendlyAirId=(W.nextFriendlyAirId||0)+1)}`,side:'FRIENDLY',
          name:fp.name,kind:fp.kind,ordnance:'NONE',
          position:{xNm:sub.position.xNm+Math.sin(r)*rng,yNm:sub.position.yNm-Math.cos(r)*rng},
          heading:normDeg(bear+F.headingOffsetDeg+(Math.random()-.5)*F.headingJitterDeg),speedKnots:fp.speed,
          state:'FRIENDLY_PATROL',seenBySub:false,bornAt:now,legTimer:F.legBaseSec+Math.random()*F.legSpreadSec,
          contactReportAt:-999,interceptAt:-999
        });
      }
    }

    const surfaceTrace=this.updateAirSurfaceTrace();

    for(const a of W.aircraft){
      const rng=distNm(a.position,sub.position),friendly=nearestFriendly(a.position);
      if(a.side==='FRIENDLY'){
        // Friendly patrols never participate in the hostile aircraft state
        // machine below. Keeping this branch self-contained is an important
        // safety boundary: a new affiliation must never accidentally acquire
        // the player as an attack target simply because it shares a renderer.
        const wx=weatherBetween(this.state,sub.position,a.position);
        if(!a.seenBySub&&sub.depthFeet<12&&rng<Math.min(10,Math.max(2,wx.visibilityNm*.75))
           &&Math.random()<dt*(.10+.18*env.daylight)){
          a.seenBySub=true;
          this.log(`Lookouts identify ${a.name} — friendly aircraft, bearing ${fmtDeg(bearingBetween(sub.position,a.position))}.`,'ok');
        }
        // A fighter patrol can statistically drive off a nearby hostile
        // aircraft. No bullets/secondary physics are spawned offscreen.
        if(a.kind==='FIGHTER'&&now-(a.interceptAt||-999)>22){
          const hostile=W.aircraft.find(x=>x!==a&&x.side!=='FRIENDLY'&&!x.shotDown&&x.state!=='DEPARTING'&&distNm(a.position,x.position)<3.8);
          if(hostile&&Math.random()<dt*.025){
            a.interceptAt=now;hostile.state='DEPARTING';hostile.bombs=0;
            hostile.departBearing=bearingBetween(a.position,hostile.position);
            if(a.seenBySub||hostile.seenBySub)this.log(`${a.name} drives ${hostile.name} away from the area.`,'ok');
          }
        }
        // A patrol aircraft may pass a rough contact report, but it does not
        // create a magic exact MAP track. The report is flavour/intelligence;
        // the player's sensors still have to localise the target.
        if(now-(a.contactReportAt||-999)>180){
          const c=(W.contacts||[]).find(c=>!c.sunk&&c.side!=='FRIENDLY'&&isSurfaceCombatant(c)&&distNm(a.position,c.position)<6.5);
          if(c&&Math.random()<dt*.02){
            a.contactReportAt=now;
            const br=bearingBetween(sub.position,c.position),rr=distNm(sub.position,c.position);
            this.log(`${F.reportPrefix} — ${F.reportActor} reports enemy warship roughly ${rr.toFixed(0)} nm on bearing ${fmtDeg(br)}.`,'ok');
          }
        }
        const friendlyAge=now-(a.bornAt||now);
        if(a.state!=='DEPARTING'&&friendlyAge>350){a.state='DEPARTING';a.departBearing=bearingBetween(sub.position,a.position);a.departAt=now;}
        if(a.state==='DEPARTING'){
          const dh=shortDelta(a.heading,a.departBearing??bearingBetween(sub.position,a.position));a.heading=normDeg(a.heading+clamp(dh,-6*dt,6*dt));
        }else{
          a.legTimer=(a.legTimer||0)-dt;
          if(a.legTimer<=0){a.legTimer=65+Math.random()*95;a.legSign=-(a.legSign||1);a.heading=normDeg(a.heading+a.legSign*(18+Math.random()*30));}
        }
        const d=knotsNmSec(a.speedKnots)*dt,r=degToRad(a.heading);
        a.position.xNm+=Math.sin(r)*d;a.position.yNm-=Math.cos(r)*d;
        continue;
      }
      /* Migration/corrupt-state safety: every hostile attack state must already
         have handed the conn to the player. Normal attacks enter through
         beginAircraftAttack(), but an older save can contain ATTACKING with
         seenBySub=false. Never let that legacy state deliver an invisible 32x
         strike before the lookout/map warning is restored. */
      if((a.state==='ATTACKING'||a.state==='STRAFING')&&!a.seenBySub){
        a.seenBySub=true;air.alarmedAt=now;
        const T=this.state.time;if(T.transitUntil||(T.timeScale||1)>1){T.timeScale=1;T.transitUntil=0;T.transitOpen=false;T.transitReason='aircraft attack';T.stopReason='aircraft attack';T.stopReasonAt=now;}
        if(!a._attackHandoffLogged){a._attackHandoffLogged=true;this.log(`⚠ AIR ALARM — ${a.name} is already on an attack run!`,'bad');audio.event?.('AIRCRAFT_SPOTTED');}
      }
      if(a.state==='SEARCHING'&&!a.spotted&&friendly&&friendly.rngNm<5.5){
        a.state='DEPARTING';a.departBearing=bearingBetween(friendly.port.pos,a.position);
        if(a.seenBySub)this.log(`${a.name} turns away from ${friendly.port.name}'s defended airspace.`,'warn');
      }

      // ── the aircraft looking for us ──
      if(a.state==='SEARCHING'){
        // Direct visual detection ends around periscope depth. Once deeper, the
        // pilot may still find the recent surface trace, but never the boat's
        // hidden present position. This closes the old 70–110 ft "shadow oracle".
        let p=0,maxR=0;
        if(sub.depthFeet<10){p=.58;maxR=11;}
        else if(sub.depthFeet<42){p=.34;maxR=3.8;}
        else if(sub.depthFeet<66){p=.15;maxR=1.7;}
        const wx=weatherBetween(this.state,a.position,sub.position);
        if(sub.propulsion.speedKnots>10&&sub.depthFeet<20)maxR*=1.25;
        maxR=Math.min(maxR,Math.max(.45,wx.visibilityNm*1.10));
        p*=clamp(wx.visibilityNm/12,.12,1.35)*clamp(env.daylight*1.3+.10*wx.moonFactor,.08,1.2);
        p*=maxR>0?Math.pow(clamp(1-rng/Math.max(.1,maxR),0,1),1.7):0;
        p*=(1-clamp(wx.seaState,0,1)*.30)*wx.aircraftFactor;
        if(p>0&&Math.random()<p*dt*.5){this.beginAircraftAttack(a,sub.position,'VISUAL');}
        else if(surfaceTrace){
          const strength=this.airSurfaceTraceStrength(surfaceTrace),trRng=distNm(a.position,surfaceTrace.position),trBear=bearingBetween(a.position,surfaceTrace.position);
          const off=Math.abs(shortDelta(a.heading,trBear)),look=off<=55?1:off<=95?.42:.07;
          const twx=weatherBetween(this.state,a.position,surfaceTrace.position),traceRange=Math.min(8.5,Math.max(.5,twx.visibilityNm*.76))*strength*Math.sqrt(look);
          let tp=.31*strength*look*Math.pow(clamp(1-trRng/Math.max(.1,traceRange),0,1),1.35);
          tp*=clamp(env.daylight*1.25+.08*twx.moonFactor,.06,1.1)*(1-clamp(twx.seaState,0,1)*.38)*twx.aircraftFactor;
          if(traceRange>.2&&Math.random()<tp*dt*.52){
            if(a.ordnance==='DEPTH_CHARGE')this.beginAircraftAttack(a,surfaceTrace.position,'WAKE',{heading:surfaceTrace.heading,speedKnots:surfaceTrace.speedKnots,strength});
            else{
              // Bomb-only aircraft can find the swirl but have no useful
              // submerged weapon. They circle/report the datum instead of
              // performing a theatrical zero-damage bombing run through water.
              a.state='ORBIT';a.spotted=true;a.orbitAt={...surfaceTrace.position};a.orbitTimer=45+Math.random()*35;
              if(a.seenBySub)this.log(`${a.name} has seen the diving wake but is circling without ASW ordnance.`,'warn');
            }
          }
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
        if(!seen&&surfaced&&(air.airWarningOn??air.sdOn)&&rng<18&&Math.random()<dt*0.30){
          const airRadarName=(getPlayerSensorPresentation(this.state).airWarningRadar?.label||'AIR WARNING RADAR').toUpperCase();
          seen=true; how=`${airRadarName} — air contact, range ${rng.toFixed(0)} miles, no bearing`;
        }else if(!seen&&surfaced&&env.daylight>0.25&&rng<clamp(env.visibilityNm*0.7,4,12)&&Math.random()<dt*0.22){
          seen=true; how=`Lookouts: AIRCRAFT bearing ${fmtDeg(airBear)}, range ${rng.toFixed(1)} nm`;
        }else if(!seen&&!surfaced&&sub.depthFeet<70&&this.state.tactical.activeStation==='PERISCOPE'
                 &&Math.abs(shortDelta(this.state.tactical.periscopeBearing,airBear))<16
                 &&rng<6&&Math.random()<dt*0.12){
          seen=true; how=`Periscope: aircraft in the field, bearing ${fmtDeg(airBear)}`;
        }
        if(seen){
          a.seenBySub=true; air.alarmedAt=now;
          const managed=this.startWearAirRoutine(a);
          if(!managed){
            this.noteWearManualAircraft(a,!!(this.state.time.transitUntil||(this.state.time.timeScale||1)>1));
            const diveUnderway=(sub.orderedDepthFeet||0)>Math.max(12,(sub.depthFeet||0)+4)||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING';
            const airAction=sub.depthFeet<8&&!diveUnderway?'CLEAR THE BRIDGE!':sub.depthFeet<18&&diveUnderway?'CONTINUE THE DIVE!':'REMAIN SUBMERGED.';
            this.log(`⚠ AIR ALARM — ${how}. ${airAction}`,'bad');
            audio.event?.('AIRCRAFT_SPOTTED');
          }
        }
      }

      // Routine search time is not a despawn timer. Start the homeward leg
      // early enough to reach the outer tactical domain around the old lifetime;
      // only remove the aircraft once it is actually near that edge.
      const patrolAge=now-(a.bornAt||now);
      if((a.state==='SEARCHING'||a.state==='ORBIT')&&!a.spotted&&patrolAge>310){
        a.state='DEPARTING';a.departBearing=bearingBetween(sub.position,a.position);a.departAt=now;
      }

      // ── flying ──
      // An aircraft flies a pattern: a creeping search with regular turns, a
      // straight run in to bomb, then a pull-off and a circuit to come round
      // again or to watch the swirl. She rolls into her turns — about six
      // degrees a second, a comfortable rate one turn.
      const TURN=6.0;
      let want=a.heading;
      if(a.state==='ATTACKING'){
        // After releasing ordnance the pilot continues through the attack line
        // for a few seconds before breaking away. The old code turned instantly,
        // so a nominal low pass often never crossed the submarine at all. Apart
        // from looking wrong in BRIDGE/GUN it robbed the fly-by audio/geometry of
        // the phase where the aircraft is actually overhead. This timer changes
        // only steering presentation; it never grants another weapon release.
        if((a.overflightTimer||0)>0){
          a.overflightTimer=Math.max(0,a.overflightTimer-dt);
          want=Number.isFinite(a.attackRunHeading)?a.attackRunHeading:a.heading;
          if(a.overflightTimer<=0&&a.postAttackState){
            a.state=a.postAttackState;a.postAttackState=null;
            if(a.state==='ORBIT'){a.spotted=false;a.orbitTimer=a.postAttackOrbitTimer||55;a.postAttackOrbitTimer=null;}
            if(a.state==='STRAFING')a.runTimer=18;
            if(a.state==='DEPARTING'&&!Number.isFinite(a.departBearing))a.departBearing=bearingBetween(sub.position,a.position);
          }
        }else{
        // A shallow boat can still be visually tracked during the run. Once the
        // dive hides her, freeze the datum; subsequent underwater manoeuvring can
        // therefore move the boat away from the attack point.
        if(sub.depthFeet<42){
          const directWx=weatherBetween(this.state,a.position,sub.position),directR=distNm(a.position,sub.position);
          if(directR<Math.max(.7,directWx.visibilityNm*.7)){
            a.attackDatum={xNm:sub.position.xNm,yNm:sub.position.yNm,courseDeg:sub.heading,speedKnots:sub.propulsion.speedKnots,at:now,source:'VISUAL',uncertaintyNm:.012};
          }
        }
        const attackPoint=this.airAttackDatumPosition(a)||a.orbitAt||sub.position,attackRng=distNm(a.position,attackPoint);
        if(a.ordnance!=='DEPTH_CHARGE'&&sub.depthFeet>16&&a.runTimer<=0){
          a.state='ORBIT';a.spotted=false;a.orbitAt={...attackPoint};a.orbitTimer=35+Math.random()*30;a.runTimer=Math.max(a.runTimer||0,2);
          if(a.seenBySub)this.log(`${a.name} has lost a useful bomb target — circling the dive datum.`,'warn');
        }
        const attackWx=weatherBetween(this.state,a.position,attackPoint);
        if(attackWx.precipitation>.62&&attackRng>Math.max(.75,attackWx.visibilityNm*.8)){
          a.state='ORBIT';a.spotted=false;a.orbitAt={...attackPoint};a.orbitTimer=65;
          this.log(`${a.name} lost the datum in the rain — circling the last sighting.`,'warn');
        }
        a.speedKnots=Math.min(a.speedKnots+dt*6,190);
        if(a.runTimer>0){
          a.orbitSign=a.orbitSign||(Math.random()<0.5?1:-1);
          want=normDeg(bearingBetween(a.position,attackPoint)+a.orbitSign*(attackRng<.6?115:70));
        }else want=bearingBetween(a.position,attackPoint);
        if(attackRng<.35&&a.bombs>0&&a.runTimer<=0){
          a.runTimer=30;a.bombs--;this.airAttack(a,sub,attackPoint);
          a.attackRunHeading=a.heading;a.overflightTimer=6;
          // Decide what happens AFTER the straight-through pass. A submerged
          // target is never magically reacquired; subsequent orbiting uses only
          // the stale datum. Weapon state is already spent before this delay.
          if(sub.depthFeet>12&&a.bombs>0){a.postAttackState='ORBIT';a.orbitAt={...attackPoint};a.postAttackOrbitTimer=45+Math.random()*30;}
          else if(a.bombs<=0){
            if(W.aaManned&&sub.depthFeet<10&&env.daylight>0.25&&(a.rattled||0)<.7&&Math.random()<.5){a.postAttackState='STRAFING';a.passes=0;this.log(`${a.name} has no bombs left — she will come round with her guns. CLEAR THE DECK!`,'bad');}
            else{a.postAttackState='DEPARTING';a.departBearing=bearingBetween(sub.position,a.position);this.log(`${a.name} has expended her bombs and is continuing through before turning away.`,'warn');}
          }
        }
        } // normal pre-release ATTACKING steering
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
          this.shake(2.4); audio.playStrafe?.();
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
        want=Number.isFinite(a.departBearing)?a.departBearing:bearingBetween(sub.position,a.position);
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
    // Patrols leave through the edge of the local air domain rather than
    // vanishing in the middle because an arbitrary lifetime expired. A hard
    // ceiling remains only as a corrupt-state/performance safety valve.
    W.aircraft=W.aircraft.filter(a=>{
      const r=distNm(a.position,sub.position),age=now-(a.bornAt||now);
      const gone=(a.state==='DEPARTING'&&r>=16.0)||r>20.5||age>680||a.shotDown;
      if(gone&&a.seenBySub&&!a.shotDown)this.log(`${a.name} has left the area.`);
      return !gone;
    });
    this.updateWearAirRoutine();
  }

  /* ══════════ 3\"/50 DECK GUN ════════════════════════════════════════
     A surface weapon, not a button that spends hit points. The sight is laid
     in bearing and elevation; each round then flies a real ballistic arc. */
}
