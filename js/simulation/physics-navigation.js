class SimEngine extends SimEngineCareer {
  snapshotWatch(){
    const s=this.state;
    s.time._watch={
      tracks:Object.keys(s.world.contactTracks).length,
      alert:s.world.enemy.alertState,
      hull:s.playerSub.damage.hullIntegrity,
      air:(s.world.aircraft||[]).filter(a=>a.seenBySub).length,
      ultra:!!s.world.ultra,
      wp:s.map.plottedCourse.length,
      status:s.campaign.missionStatus,
      // A flat battery and foul air are STATES, not events. The skipper is
      // told once; after that he knows, and the clock is his to run on with.
      batLow:s.playerSub.propulsion.battery<12,
      airLow:s.playerSub.damage.oxygen<30,
      fuelLow:s.playerSub.propulsion.fuel<20,
      atEdge:this.headingOutOfArea(),
      harborAlert:(s.world.harbor&&s.world.harbor.alert)||0,
      portApproachNear:(()=>{const r=this.friendlyPortNav();return !!(r&&r.rngNm<=1.5);})()
    };
  }
  /* The chart has an edge, and running off it during an open-ended transit
     would take the boat somewhere there is no sea floor, no traffic and no
     way home. The bathymetry box is the chart, so that is the boundary. */
  /* The patrol area is the charted box. Everything else keys off this: the
     boundary drawn on the map, the transit interrupt, where contacts are
     allowed to be, and where an ULTRA plot may fall. */
  areaBounds(){
    const B=Bathy.ensure(this.state.world.terrain);
    if(!B) return null;
    return {x0:B.x0,y0:B.y0,x1:B.x0+(B.nx-1)*B.cell,y1:B.y0+(B.ny-1)*B.cell};
  }

  nearChartEdge(margin){
    const A=this.areaBounds(); if(!A) return false;
    const p=this.state.playerSub.position, m=margin??6;
    return p.xNm<A.x0+m||p.yNm<A.y0+m||p.xNm>A.x1-m||p.yNm>A.y1-m;
  }

  /* Standing INTO the edge is worth stopping for. Standing out of it is not
     — that used to re-fire the moment you set a course away from it and made
     the boundary impossible to leave under time compression. */
  headingOutOfArea(){
    const A=this.areaBounds(); if(!A) return false;
    const sub=this.state.playerSub, p=sub.position, m=6;
    const r=degToRad(sub.heading), vx=Math.sin(r), vy=-Math.cos(r);
    if(p.xNm<A.x0+m&&vx<-0.05) return true;
    if(p.xNm>A.x1-m&&vx> 0.05) return true;
    if(p.yNm<A.y0+m&&vy<-0.05) return true;
    if(p.yNm>A.y1-m&&vy> 0.05) return true;
    return false;
  }

  transitInterrupt(){
    const s=this.state, w=s.time._watch;
    if(!w) return 'ok';
    if(s.playerSub.mode==='SUNK') return 'the boat is lost';
    const collisionRisk=this.collisionRiskAhead(90);
    if(collisionRisk) return this.collisionRiskText(collisionRisk);
    if(s.playerSub.damage.hullIntegrity<w.hull-0.5) return 'the boat has taken damage';
    if(s.world.enemy.alertState!==w.alert&&s.world.enemy.alertState!=='UNAWARE') return 'the escorts are stirring';
    if(Object.keys(s.world.contactTracks).length>w.tracks) return 'a new contact';
    if((s.world.aircraft||[]).filter(a=>a.seenBySub).length>w.air) return 'aircraft';
    if(s.world.ultra&&!w.ultra) return 'an ULTRA intercept';
    if(s.map.plottedCourse.length<w.wp) return 'a waypoint reached';
    if(s.campaign.missionStatus!==w.status) return 'new orders';
    if(s.playerSub.propulsion.battery<12&&!w.batLow) return 'the battery is low';
    if(s.playerSub.damage.oxygen<30&&!w.airLow) return 'the air is going bad';
    const portNav=this.friendlyPortNav();
    if(portNav&&portNav.rngNm<=1.5&&!w.portApproachNear) return 'friendly port approach';
    const surfaced=s.playerSub.depthFeet<12,clr=s.playerSub.keelClearanceFeet??3000;
    if(s.playerSub.inShallowWater&&!surfaced) return 'shoal water ahead';
    if(clr<(surfaced?18:70)) return 'shoaling water under the keel';
    if(this.headingOutOfArea()&&!w.atEdge) return 'she is standing out of the patrol area';
    if(s.playerSub.propulsion.fuel<20&&!w.fuelLow) return 'the fuel is running low';
    if(((s.world.harbor&&s.world.harbor.alert)||0)>w.harborAlert) return 'enemy harbour defenses are stirring';
    return null;
  }

  shake(mag){
    const W=this.state.world;
    W.shakeMag=Math.min((W.shakeMag||0)+mag,9);
  }

  // Subsystem damage and damage-control doctrine live in damage-control.js.

  checkMissionObjectives(){
    const camp=this.state.campaign;
    // Convoy objectives are about the patrol convoy, not optional harbour prizes.
    const convoyIds=new Set(this.state.world.contacts.filter(c=>c.convoyId==='MAIN').map(c=>c.id));
    const convoyLocated=Object.keys(this.state.world.contactTracks).some(id=>convoyIds.has(id));
    if(convoyLocated&&camp.objectives[0]&&!camp.objectives[0].done){
      camp.objectives[0].done=true;
      this.captainLog?.('CONVOY_SIGHTED','Enemy convoy sighted.',{},'convoy-sighted');
    }
    const anyConvoyHit=this.state.weapons.hits.some(h=>convoyIds.has(h.contactId));
    if(anyConvoyHit&&camp.objectives[1]) camp.objectives[1].done=true;
    // All merchants sunk → head home
    const merchants=this.state.world.contacts.filter(c=>c.type!=='ESCORT'&&!c.sunk&&!c.harborTarget);
    if(merchants.length===0&&camp.missionStatus==='PATROL'){
      camp.missionStatus='RETURN TO BASE';
      const r=this.friendlyPortNav();
      this.notify(r
        ? `PATROL OBJECTIVE COMPLETE — every merchant accounted for. Make for ${r.port.name}: rendezvous ${r.rngNm.toFixed(1)} nm on ${fmtDeg(r.brg)}. Use HEAD TO PORT to plot the safe-water approach.`
        : 'PATROL OBJECTIVE COMPLETE — every merchant accounted for. Return to a friendly port.','ok');
    }
  }

  // ── CORE PHYSICS ──
  updateSub(dt){
    const sub=this.state.playerSub;
    this.captureCollisionFrame();
    this.updateHeading(sub,dt); this.updateDepth(sub,dt); this.updatePropulsion(sub,dt);
    this.updatePosition(sub,dt);
    this.applyTerrainEffects(sub,dt);
    this.updateWorld(dt); this.updateVesselCollisions(dt); this.updateSigs(sub); this.updateHarbor(dt);
    this.updateDetection(dt); this.updateHarborKnowledge(dt); this.updateTdc(); this.updateTorpedoes(dt); this.updateDeckGun(dt);
    this.updateEnemyAI(dt); this.updateAircraft(dt); this.updateAAGun(dt); this.updateRadio(dt); this.updateMapState(dt);
    if(this.state.map.autoFollowPlot&&this.state.map.plottedCourse.length) this.steerWaypoint(false);
    this.updateDmg(sub,dt); this.updateDmgCtrl(sub,dt); this.updateWarnings(sub);
    this.checkMissionObjectives(); this.checkPortArrival(dt);
    this.updateModeAfter(sub);
    if(this.state.tactical.activeStation==='BRIDGE'&&!bridgeCanUse(this.state)){
      this.state.tactical.activeStation='MAP';this.state.tactical.bridgeBinoculars=false;
    }
    particles.update(dt);
    this.state.world.shakeMag=Math.max(0,(this.state.world.shakeMag||0)*Math.exp(-dt*1.9)-dt*0.25);
  }

  updateHeading(sub,dt){
    const re=1-sub.damage.rudderDamage*0.75;
    const mx=clamp((1.2+sub.propulsion.speedKnots*0.18)*re,0.15,4.5);
    const d=shortDelta(sub.heading,sub.orderedHeading);
    sub.heading=normDeg(sub.heading+clamp(d,-mx*dt,mx*dt));
    sub.rudder=clamp(d/45,-1,1);
  }

  updateDepth(sub,dt){
    const de=sub.orderedDepthFeet-sub.depthFeet;
    const em=sub.mode==='CRASH_DIVING'||sub.mode==='EMERGENCY_SURFACING';
    const be=1-sub.damage.ballastDamage*0.65; const fp=sub.damage.flooding*1.25;
    const mv=em?6.5*be:2.4*be;
    const cv=clamp(de*0.045,-mv,mv);
    const sp=em?clamp(sub.propulsion.speedKnots/12,0.5,1.2):clamp(sub.propulsion.speedKnots/12,0.15,1.2); // Fix B: crash dive works at low speed
    // Damaged ballast gear gives the boat a persistent trim tendency. It is
    // deliberately stable for the patrol seed, so the skipper can learn and
    // compensate for it instead of chasing per-frame random noise.
    const trimBias=(sub.damage.instrumentBias?.ballastTrimFps??damageBiasesFor(this.state).ballastTrimFps)*(em?.35:1);
    sub.verticalSpeedFps=lerp(sub.verticalSpeedFps,cv*sp+fp+trimBias,clamp(dt*0.8,0,1));
    if(sub.diveDelay>0){sub.diveDelay-=dt;sub.verticalSpeedFps=Math.min(sub.verticalSpeedFps,0);}
    sub.depthFeet=clamp(sub.depthFeet+sub.verticalSpeedFps*dt,0,sub.damage.crushDepthFeet+80);
    if(Math.abs(de)<2&&Math.abs(sub.verticalSpeedFps)<0.25) sub.verticalSpeedFps=0;
    // at the surface only the UPWARD component is cancelled — Math.min() here
    // killed every downward rate, which made the boat unable to dive at all
    if(sub.depthFeet<=0){sub.depthFeet=0;sub.verticalSpeedFps=Math.max(0,sub.verticalSpeedFps);}
    /* Can she still be brought up at all? The planes bite on the water flowing
       past them, so a stopped boat has nothing to lift with; damaged ballast
       tanks cut what the air can do; and the sea coming in through a split
       seam pulls the other way the whole time. When the water wins, say so —
       and say what to do about it, because there is a way out and it is not
       the one a frightened man reaches for. */
    const wantUp=sub.orderedDepthFeet<sub.depthFeet-3;
    sub.cannotHoldDepth=wantUp&&!em&&(mv*sp<fp+0.02);
    if(sub.cannotHoldDepth&&!sub._nhdWarned){
      sub._nhdWarned=true;
      this.log('SHE WILL NOT ANSWER THE PLANES — water is coming in faster than we can rise. Blow main ballast (emergency surface), pumps on, damage control to the leak, and get way on her: the planes need speed to bite.','bad');
    }
    if(!sub.cannotHoldDepth&&sub._nhdWarned&&(!wantUp||mv*sp>fp*1.4)){
      sub._nhdWarned=false;
      if(wantUp) this.log('She has her nose up again — the planes are biting.','warn');
    }
    if(sub.mode==='EMERGENCY_SURFACING') sub.ballastState='EMERGENCY_BLOW';
    else if(sub.orderedDepthFeet>sub.depthFeet+3) sub.ballastState='FLOODING';
    else if(sub.orderedDepthFeet<sub.depthFeet-3) sub.ballastState=em?'EMERGENCY_BLOW':'BLOWING';
    else sub.ballastState='NEUTRAL';
  }

  updatePropulsion(sub,dt){
    const p=sub.propulsion;
    /* A fleet boat has no snorkel. The main induction — the great mushroom
       valve abaft the conning tower — is the only way the diesels can breathe,
       and it shuts the instant she goes under. The Dutch had already built the
       thing (Wichers' snuiver, on the O-21 class, 1938); the Germans found it
       on the boats they took at Rotterdam, shrugged, and only fitted the
       Schnorchel in 1944 when Allied aircraft made surfacing suicide. The
       American boats fought the whole Pacific war without one. So: down is
       batteries, and only the surface charges them.
       A little hysteresis so she does not chatter at the changeover depth. */
    const wasSub=p.engineMode==='ELECTRIC';
    /* Gameplay tolerance: Silversides still has no snorkel, but a boat that is
       effectively awash must not be stranded because the depth controller is
       hovering a few feet below zero. Diesels stay on down to 12 ft and, once
       secured, come back by 8 ft. Periscope depth remains battery-only. */
    const subm=wasSub?sub.depthFeet>DIESEL_RESTART_FT:sub.depthFeet>DIESEL_CUTOFF_FT;
    p.engineMode=subm?'ELECTRIC':'DIESEL';
    if(subm&&!wasSub) this.log('Main induction closed — diesels secured, answering on the motors. No snorkel in this boat: she cannot charge until she is on the roof.','warn');
    else if(!subm&&wasSub) this.log('Surfaced — induction open, diesels on line. Battery charging.','warn');
    const dmg=sub.damage, me=1-dmg.motorDamage*0.8, ee=1-(dmg.electricalDamage||0)*0.34;
    let rpm=p.orderedRpm;
    if(dmg.driveBankOffline) rpm=Math.min(rpm,320);
    if(sub.stealth.silentRunning) rpm=Math.min(rpm,120);
    if(sub.mode==='CRASH_DIVING') rpm=Math.min(rpm,220);
    p.actualRpm=lerp(p.actualRpm,rpm,clamp(dt*0.7,0,1));
    const ms=subm?8.5:18, bank=dmg.driveBankOffline?.72:1, rc=1-Math.exp(-p.actualRpm/170);
    p.speedKnots=ms*rc*(sub.stealth.silentRunning?0.72:1)*me*ee*bank;
    const rl=p.actualRpm/450;
    if(p.engineMode==='DIESEL'){
      /* FUEL. The old rule burned linearly with revolutions and emptied the
         bunkers in twelve and a half hours of cruising — you could not cross
         a patrol area without limping home, which is nothing like a fleet
         boat. A Gato carried 94,000 gallons and had a designed radius of
         11,000 miles at 10 knots; she was away for six weeks.
         Resistance goes as the square of speed and power as the cube, so
         that is the law used here, scaled so a patrol is comfortable but
         flank speed is a decision rather than a default:
             ~0.6 %/h at a 10-knot cruise   → about 170 hours
             ~3.1 %/h at flank              → about 32 hours
         Fast transit is now what it should be: expensive, not forbidden. */
      p.fuel=clamp(p.fuel-(0.08+Math.pow(rl,3)*3.0)*dt/3600,0,100);
      /* Four diesels, and the screws have first call on them. Whatever is left
         over goes to the generators — which is why a boat charges fastest
         loafing along on two engines and hardly at all at flank, and why the
         last of the charge crawls in as the cells gas up. From flat it was the
         best part of four hours on the roof under the moon. Every skipper in
         the Pacific hated that arithmetic. */
      const share=clamp(1-rl*rl*1.15,0,1);
      const taper=clamp(1-Math.pow(p.battery/100,3)*0.75,0.22,1);
      const chg=p.fuel>0?0.009*share*taper*clamp(1-(dmg.electricalDamage||0)*.55,.32,1):0;
      if(chg>0&&p.battery<100){
        p.battery=clamp(p.battery+chg*dt,0,100);
        p.fuel=clamp(p.fuel-share*0.35*dt/3600,0,100);  // the generators drink too — ~1.4% for a full charge
      }
      p.chargeRate=chg;
      if(p.fuel<=0)p.speedKnots*=0.1;
    }
    else{p.chargeRate=0;const bd=(0.015+rl*rl*0.12)*dt*(1+(dmg.electricalDamage||0)*.28);p.battery=clamp(p.battery-bd,0,100);if(p.battery<=0){p.speedKnots*=0.05;p.actualRpm*=0.1;}}
  }

  updatePosition(sub,dt){
    const d=knotsNmSec(sub.propulsion.speedKnots)*dt; const r=degToRad(sub.heading);
    sub.position.xNm+=Math.sin(r)*d; sub.position.yNm-=Math.cos(r)*d;
  }

  // A warship cannot flick its bow around. Rudder and engine orders are
  // rate-limited: an escort works up to about 4°/s, a loaded merchant 1.3°/s.
  steerShip(c,dt){
    const base=SHIP_TURN_RATE[c.type]||1.2;
    const rate=base*clamp(c.speedKnots/10,0.22,1.0);      // little steerage way when slow
    const d=shortDelta(c.heading,c.desiredHeading===undefined?c.heading:c.desiredHeading);
    c.heading=normDeg(c.heading+clamp(d,-rate*dt,rate*dt));
    const acc=SHIP_ACCEL[c.type]||0.10;
    const want=c.desiredSpeed===undefined?c.speedKnots:c.desiredSpeed;
    const ds=want-c.speedKnots;
    c.speedKnots=clamp(c.speedKnots+clamp(ds,-acc*1.7*dt,acc*dt),0,42);
  }

  updateConvoyNavigation(){
    const W=this.state.world, route=(W.convoyRoutes||[])[0];
    if(!route) return;
    const path=this.ensureWaterRoute(route);if(path.length<2)return;
    const merchants=W.contacts.filter(c=>c.convoyId==='MAIN'&&c.convoyRole==='MERCHANT'&&!c.sunk);
    if(!merchants.length) return;
    merchants.sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0));
    const lead=merchants[0],pr=routeProject(path,lead.position);
    W.convoyLeg=W.convoyLeg===-1?-1:1;
    const C=routeCum(path),L=C[C.length-1];
    if((W.convoyLeg>0&&L-pr.s<1.6)||(W.convoyLeg<0&&pr.s<1.6)) W.convoyLeg*=-1;
    const aim=routeAdvance(path,pr.s,W.convoyLeg,1.25);W.convoyLeg=aim.dir;W.convoyRouteS=pr.s;
    if(!lead.scattering){
      lead.desiredHeading=bearingBetween(lead.position,aim.pos);
      lead.desiredSpeed=lead.baseSpeed||lead.speedKnots;
    }
    // Followers keep stations relative to the tangent of the shared water lane.
    const hdg=lead.desiredHeading===undefined?lead.heading:lead.desiredHeading;
    const r=degToRad(hdg),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
    for(const c of merchants.slice(1)){
      if(c.scattering) continue;
      const f=c.formationFwd??(-(c.formationIndex||1)*1.2),side=c.formationSide||0;
      const tgt={xNm:lead.position.xNm+fx*f+sx*side,yNm:lead.position.yNm+fy*f+sy*side};
      const err=distNm(c.position,tgt);c.desiredHeading=bearingBetween(c.position,tgt);
      c.desiredSpeed=clamp((lead.baseSpeed||lead.speedKnots)+err*0.55,3,16);
    }
  }

  updateWorld(dt){
    const elapsed=this.state.time.elapsedSeconds;
    this.updateConvoyNavigation();
    this.surfaceAvoidance();
    for(const c of this.state.world.contacts){
      if(c.sunk) continue;
      if(c.stationary){c.speedKnots=0;c.desiredSpeed=0;continue;}
      // Apply scatter behaviour if a convoy merchant was alerted. Harbour
      // targets never scatter: they are moored prizes, not convoy traffic.
      if(c.scattering&&c.type!=='ESCORT'&&!c.harborTarget){
        const scatterAge=elapsed-(c.alertedAt||0);
        if(scatterAge<90){
          c.desiredHeading=c.scatterHeading;
          c.desiredSpeed=c.scatterSpeed;
        } else {
          c.scattering=false;
          c.desiredSpeed=c.baseSpeed||c.speedKnots*0.75;
        }
      }
      this.steerShip(c,dt);
      const d=knotsNmSec(c.speedKnots)*dt; const r=degToRad(c.heading);
      const prev={...c.position};
      c.position.xNm+=Math.sin(r)*d; c.position.yNm-=Math.cos(r)*d;
      // No surface ship is allowed to cut a corner through an island. This is
      // a last safety net behind the water-route steering, including escorts.
      if(Bathy.feet(c.position.xNm,c.position.yNm)<24){
        c.position=prev;c.speedKnots*=0.72;
        const route=(this.state.world.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route);
        if(path&&path.length>1){const pr=routeProject(path,prev),aim=routeAdvance(path,pr.s,this.state.world.convoyLeg||1,1.0);c.desiredHeading=bearingBetween(prev,aim.pos);}
      }
      this.keepInArea(c);
      if(this.state.tactical.activeStation==='MAP') particles.spawnWake(c.position.xNm,c.position.yNm,c.heading,c.speedKnots);
    }
  }

  /* Safety net only. Convoy turns are coordinated above; this just prevents a
     damaged/scattered independent ship from sailing into uncharted nothing. */
  keepInArea(c){
    const A=this.areaBounds(); if(!A||c.sunk||c.stationary) return;
    const p=c.position,m=2;
    if(p.xNm>A.x0+m&&p.xNm<A.x1-m&&p.yNm>A.y0+m&&p.yNm<A.y1-m) return;
    const target={xNm:(A.x0+A.x1)/2,yNm:(A.y0+A.y1)/2};
    c.desiredHeading=bearingBetween(p,target);
  }

  updateDetection(dt){
    const sub=this.state.playerSub; const W=this.state.world; const env=W.environment;
    const now=this.state.time.elapsedSeconds;
    for(const c of W.contacts){
      if(c.sunk){
        // A wreck is a genuine fixed position. Keep its last plot briefly, then
        // drop the paper track once the hull is gone below the surface.
        const tr=W.contactTracks[c.id];
        if(tr){
          tr.sunk=true;tr.speedEstimateKnots=0;tr.staleSeconds+=dt;
          tr.lastFixPosition={...c.position};tr.plotPosition={...c.position};tr.lastFixTime=now;
          delete tr.truePosition;
          if((c.sinkingProgress??0)>=1&&tr.staleSeconds>90) delete W.contactTracks[c.id];
        }
        continue;
      }
      const rng=distNm(sub.position,c.position);
      const bear=bearingBetween(sub.position,c.position);
      const vis=this.calcVis(sub,c,rng,env); const aco=this.calcAco(sub,c,rng,env);
      /* A ship that is genuinely in visual range must not evaporate merely
         because the generic confidence score is a little below 0.12. The 3-D
         renderer can show ships near the visibility limit; give those weak but
         real visual observations a floor instead of letting the plot decay. */
      const visualHeld=sub.depthFeet<=65&&rng<=bridgeVisualLimitNm(this.state,c);
      const acousticHeld=aco.score>0.12;
      const held=visualHeld||acousticHeld;
      const sc=visualHeld?Math.max(vis.score,aco.score,0.18):aco.score;
      const src=visualHeld?'VISUAL':'HYDROPHONE';
      const key=c.id;
      let ex=W.contactTracks[key];
      if(!ex&&!held) continue;
      ex=ex||{id:key,typeEstimate:'UNKNOWN',bearing:bear,rangeEstimateNm:rng,
        courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:0,source:src,
        lastUpdated:now,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards};

      if(held){
        ex.confidence=clamp(ex.confidence+clamp((sc-0.10)*dt*0.34,0.006,0.12),0,1);
        ex.lastUpdated=now; ex.staleSeconds=0; ex.source=src;
        ex.lengthYards=c.lengthYards;
        ex.bearing=lerpAngle(ex.bearing,bear,clamp(0.25+sc*0.35,0,0.85));
        ex.rangeEstimateNm=lerp(ex.rangeEstimateNm,rng,clamp(0.18+sc*0.28,0,0.7));
        ex.courseEstimate=lerpAngle(ex.courseEstimate,c.heading,clamp(0.08+ex.confidence*0.18,0,0.35));
        ex.speedEstimateKnots=lerp(ex.speedEstimateKnots,c.speedKnots,clamp(0.08+ex.confidence*0.18,0,0.35));
        const knownType=c.displayType||c.type;
        const smokeOnly=sub.depthFeet<8&&rng>env.visibilityNm*1.02;
        // The Truk heavy unit is deliberately reported only as HEAVY UNIT.
        // Hydrophones may build a good positional track, but they do not hand
        // the player a magical carrier/cruiser classification. Exact identity
        // requires the visual source consumed by updateHarborKnowledge().
        if(smokeOnly||(c.harborTarget&&c.id==='H-04'&&src!=='VISUAL'))
          ex.typeEstimate=ex.confidence>0.35?'SURFACE SHIP':'UNKNOWN';
        else ex.typeEstimate=ex.confidence>0.65?knownType:ex.confidence>0.35?'SURFACE SHIP':'UNKNOWN';
        ex.contactType=c.type;
        // Store the fix in WORLD coordinates. This is the important bit: an old
        // bearing/range pair is relative to where ownship USED to be, so it may
        // never be re-projected from ownship's new position.
        const br=degToRad(ex.bearing);
        ex.lastFixPosition={xNm:sub.position.xNm+Math.sin(br)*ex.rangeEstimateNm,
                            yNm:sub.position.yNm-Math.cos(br)*ex.rangeEstimateNm};
        ex.lastFixTime=now;
        ex.plotPosition={...ex.lastFixPosition};
        delete ex.truePosition;                    // legacy saves must not leak omniscient truth
        W.contactTracks[key]=ex;
      } else {
        // Paper plots persist and grow stale instead of vanishing in a minute.
        // Dead-reckon the LAST FIX along the estimated course and speed.
        ex.confidence=clamp(ex.confidence-dt*0.0018,0,1); ex.staleSeconds+=dt;
        if(!ex.lastFixPosition){
          const br=degToRad(ex.bearing||bear), rg=ex.rangeEstimateNm||rng;
          ex.lastFixPosition={xNm:sub.position.xNm+Math.sin(br)*rg,
                              yNm:sub.position.yNm-Math.cos(br)*rg};
          ex.lastFixTime=now-ex.staleSeconds;
        }
        const age=Math.max(0,now-(ex.lastFixTime??now));
        const run=knotsNmSec(ex.speedEstimateKnots||0)*age;
        const rr=degToRad(ex.courseEstimate||0);
        ex.plotPosition={xNm:ex.lastFixPosition.xNm+Math.sin(rr)*run,
                         yNm:ex.lastFixPosition.yNm-Math.cos(rr)*run};
        ex.bearing=bearingBetween(sub.position,ex.plotPosition);
        ex.rangeEstimateNm=distNm(sub.position,ex.plotPosition);
        delete ex.truePosition;
        if(ex.confidence>0.02) W.contactTracks[key]=ex;
        else delete W.contactTracks[key];
      }
    }
  }

  updateTdc(){
    const tdc=this.state.tdc;
    if(!tdc.targetId){tdc.status='NO TARGET';tdc.solutionQuality=0;return;}
    const tr=this.state.world.contactTracks[tdc.targetId];
    const manual=tdc.targetId==='MANUAL';
    if(!manual&&(!tr||tr.confidence<=0.02)){tdc.status='TRACK LOST';tdc.solutionQuality=0;return;}
    const sub=this.state.playerSub,d=sub.damage,bias=d.instrumentBias||damageBiasesFor(this.state);
    const bear=manual?tdc.bearing:(tdc.bearing??tr.bearing);
    const rng=manual?tdc.rangeNm:(tdc.rangeNm??tr.rangeEstimateNm);
    const crs=manual?tdc.targetCourse:(tdc.targetCourse??tr.courseEstimate);
    const spd=manual?tdc.targetSpeedKnots:(tdc.targetSpeedKnots??tr.speedEstimateKnots);
    // A damaged TDC is wrong in a repeatable way, not a dice roll each tick.
    // The stored observations remain what the crew entered; only the machine's
    // internal calculation carries its calibration errors.
    const calcBear=normDeg(bear+(bias.tdcBearingDeg||0));
    const calcRng=Math.max(.05,rng*(1+(bias.tdcRangePct||0)));
    const calcCrs=normDeg(crs+(bias.tdcCourseDeg||0));
    const calcSpd=Math.max(0,spd+(bias.tdcSpeedKnots||0));
    const res=calcTdc({ownPosition:sub.position,ownHeading:sub.heading,bearing:calcBear,
      rangeNm:calcRng,targetCourse:calcCrs,targetSpeedKnots:calcSpd,
      torpedoSpeedKnots:tdc.torpedoSpeedKnots,confidence:manual?0.55:tr.confidence});
    tdc.bearing=bear;tdc.rangeNm=rng;tdc.targetCourse=crs;tdc.targetSpeedKnots=spd;
    tdc.gyroAngle=res.gyroAngle===null?null:res.gyroAngle+(bias.gyroDeg||0);tdc.angleOnBow=res.angleOnBow;
    tdc.timeToImpactSec=res.timeToImpactSec;
    tdc.solutionQuality=clamp(res.solutionQuality*(1-(d.tdcDamage||0)*.18-(d.gyroDamage||0)*.10),0,1);
    tdc.status=res.valid?'SOLUTION':'NO SOLUTION';
  }

  calcVis(sub,c,rng,env){
    // Lookout capability: how well can the sub observe?
    const lookout = sub.depthFeet<8  ? 1.0   // surfaced bridge watch — full view
                  : sub.depthFeet<=65 ? 0.85  // periscope up — nearly as good
                  : 0;                         // submerged — no visual at all
    if(lookout<=0) return{score:0};
    // Range factor: linear falloff (not squared — squared was too harsh)
    const rf = clamp(1 - rng/env.visibilityNm, 0, 1);
    // Daylight: minimum 0.18 = moonlight/starlight — night isn't completely blind
    const df = clamp(env.daylight + 0.18, 0.18, 1.0);
    const sm = clamp(1 - env.seaState*0.35, 0.45, 1);
    return{score: rf * df * sm * c.visualProfile * lookout};
  }

  calcAco(sub,c,rng,env){
    const cn=c.acousticBase+Math.pow(c.speedKnots/18,2)*0.65;
    const on=clamp(sub.stealth.acousticSignature*0.55,0,0.75);
    const sp=env.seaState*0.25; const rf=1+Math.pow(rng/9,1.65);
    return{score:clamp((cn-on-sp)/rf,0,1)};
  }

  updateSigs(sub){
    const sf=sub.depthFeet<8?1:0; const pf=sub.depthFeet>=8&&sub.depthFeet<=65?0.16:0;
    sub.stealth.visualProfile=sf+pf;
    const rn=sub.propulsion.actualRpm/450; const sn=Math.pow(sub.propulsion.speedKnots/18,2);
    const sm=sub.stealth.silentRunning?0.38:1; const dm=sub.depthFeet>65?0.85:1;
    const pn=sub.damage.pumpActive?0.12:0; const fn=sub.damage.flooding*0.15;
    sub.stealth.acousticSignature=clamp((rn*0.6+sn*0.8)*sm*dm+pn+fn,0,1.5);
    /* On the bottom nothing turns and nothing moves, and an echo-ranging set
       cannot pull her out of the bottom return. Only the pumps and any water
       she is taking give her away. */
    if(sub.bottomed) sub.stealth.acousticSignature=clamp(pn*0.5+fn*0.6,0,0.14);
  }

  updateMapState(dt){
    const sub=this.state.playerSub; const map=this.state.map; const t=this.state.time.elapsedSeconds;
    map.estimatedPosition.xNm=sub.position.xNm; map.estimatedPosition.yNm=sub.position.yNm;
    const lt=map.ownshipTrail[0];
    if(!lt||distNm(sub.position,lt)>0.05||t-map.lastTrailSampleTime>20){
      map.ownshipTrail.unshift({xNm:sub.position.xNm,yNm:sub.position.yNm,t});
      map.ownshipTrail=map.ownshipTrail.slice(0,400); map.lastTrailSampleTime=t;
    }
    const cx=Math.floor(sub.position.xNm/map.cellSizeNm);
    const cy=Math.floor(sub.position.yNm/map.cellSizeNm);
    const sr=sub.depthFeet<8?2:sub.depthFeet<=65?1:0;
    for(let y=-sr;y<=sr;y++) for(let x=-sr;x<=sr;x++)
      if(Math.hypot(x,y)<=sr+0.1) map.exploredCells[`${cx+x},${cy+y}`]={lastSeenTime:t,confidence:1};
    if(map.plottedCourse.length&&distNm(sub.position,map.plottedCourse[0])<0.22){
      map.plottedCourse.shift(); this.log('Waypoint reached.'); audio.playWaypoint();
    }
  }

  updateDmg(sub,dt){
    const d=sub.damage;
    if(sub.depthFeet>d.crushDepthFeet){
      d.hullIntegrity=clamp(d.hullIntegrity-(sub.depthFeet-d.crushDepthFeet)*0.02*dt,0,100);
      if(d.hullIntegrity<=0&&sub.mode!=='SUNK'){
        sub.mode='SUNK';this.state.campaign.missionStatus='LOST';
        this.log('Hull collapse — boat lost.','bad');
      }
    }
  }

  updateWarnings(sub){
    const d=sub.damage; const e=this.state.world.enemy; const W=[];
    if(sub.mode==='SUNK') W.push({level:'critical',text:'BOAT LOST'});
    if(d.hullIntegrity<30) W.push({level:'critical',text:'HULL CRITICAL'});
    else if(d.hullIntegrity<60) W.push({level:'warn',text:'HULL DAMAGED'});
    if(d.flooding>0.65) W.push({level:'critical',text:'FLOODING CRITICAL'});
    else if(d.flooding>0.25) W.push({level:'warn',text:'FLOODING'});
    if(d.oxygen<20) W.push({level:'critical',text:'LOW OXYGEN'});
    else if(d.oxygen<45) W.push({level:'warn',text:'OXYGEN FALLING'});
    if(e.alertState==='ATTACKING') W.push({level:'critical',text:'ESCORT ATTACK RUN'});
    else if(e.alertState==='SEARCHING') W.push({level:'warn',text:'ESCORTS SEARCHING'});
    const H=this.state.world.harbor;
    if(H&&H.alert>=2) W.push({level:'critical',text:'HARBOR DEFENSES ALERT'});
    else if(H&&H.alert===1) W.push({level:'warn',text:'HARBOR DEFENSES LISTENING'});
    if(this.state.world.depthCharges.some(dc=>dc.status==='SINKING')) W.push({level:'critical',text:'DEPTH CHARGES IN WATER'});
    if(d.periscopeDamage>0.72) W.push({level:'warn',text:'PERISCOPE OPTICS BADLY DAMAGED'});
    else if(d.periscopeDamage>0.28) W.push({level:'warn',text:'PERISCOPE OPTICS DEGRADED'});
    if(d.motorDamage>0.5) W.push({level:'warn',text:'MOTOR DAMAGE'});
    if(d.electricalDamage>0.5) W.push({level:'warn',text:'ELECTRICAL DAMAGE'});
    if(d.driveBankOffline) W.push({level:'critical',text:'ONE DRIVE BANK OFFLINE'});
    if(d.ballastDamage>0.5) W.push({level:'warn',text:'BALLAST DAMAGE'});
    if(d.rudderDamage>0.55) W.push({level:'warn',text:'STEERING DAMAGE'});
    if(d.tdcDamage>0.45||d.gyroDamage>0.45) W.push({level:'warn',text:'FIRE CONTROL CALIBRATION OFF'});
    if(d.pumpTripped) W.push({level:'critical',text:'DEWATERING PUMP TRIPPED'});
    else if(d.pumpDamage>0.5) W.push({level:'warn',text:'PUMP CAPACITY REDUCED'});
    if(sub.cannotHoldDepth) W.push({level:'critical',text:'WILL NOT HOLD DEPTH'});
    if(this.state.world.aaManned) W.push({level:'warn',text:'AA CREW TOPSIDE — DIVE WILL AUTO-CLEAR DECK'});
    if(this.state.weapons.deckGun?.manned) W.push({level:'warn',text:'DECK GUN CREW TOPSIDE — DIVE WILL AUTO-CLEAR DECK'});
    const camp=this.state.campaign;
    if(camp.missionStatus==='RETURN TO BASE'){
      const r=this.friendlyPortNav();
      if(camp.alongside>0) W.push({level:'normal',text:`${r?.port.name||'RENDEZVOUS'} TRANSFER — ${Math.round(camp.alongside/180*100)}%`});
      else if(r&&r.rngNm<=0.30&&sub.depthFeet>=8) W.push({level:'warn',text:`${r.port.name.toUpperCase()} RV — SURFACE`});
      else if(r&&r.rngNm<=0.30&&sub.propulsion.speedKnots>3) W.push({level:'warn',text:`${r.port.name.toUpperCase()} RV — SLOW BELOW 3 KN`});
      else if(r&&r.rngNm<=1.5) W.push({level:'warn',text:`${r.port.name.toUpperCase()} APPROACH — ${r.rngNm.toFixed(1)} NM`});
      else if(r) W.push({level:'warn',text:`RTB ${r.port.name.toUpperCase()} — ${r.rngNm.toFixed(1)} NM`});
      else W.push({level:'warn',text:'OBJECTIVE DONE — RETURN TO BASE'});
    }
    const T2=this.state.time;
    if(T2.stopReason&&T2.elapsedSeconds-(T2.stopReasonAt||0)<90)
      W.push({level:'warn',text:'STOPPED: '+T2.stopReason.toUpperCase()});
    if(sub.propulsion.fuel<12) W.push({level:'critical',text:'FUEL LOW'});
    else if(sub.propulsion.fuel<25) W.push({level:'warn',text:'FUEL 25%'});
    const clr=sub.keelClearanceFeet??3000;
    if(sub.groundingRisk&&!sub.inShallowWater) W.push({level:'critical',text:'TERRAIN COLLISION'});
    if(sub.bottomed) W.push({level:'warn',text:`ON THE BOTTOM${(sub.suction||0)>0.34?' — SETTLING IN':''}`});
    else if(sub.depthFeet<12){
      if(clr<15) W.push({level:'critical',text:`VERY LITTLE WATER — ${Math.max(0,clr).toFixed(0)} FT UNDER KEEL`});
      else if(clr<35) W.push({level:'warn',text:`${clr.toFixed(0)} FT UNDER KEEL`});
      else if(sub.inShallowWater) W.push({level:'warn',text:'SHALLOW WATER'});
    }else{
      if(clr<25) W.push({level:'critical',text:`SHOAL WATER — ${Math.max(0,clr).toFixed(0)} FT UNDER KEEL`});
      else if(clr<60) W.push({level:'warn',text:`SHOALING — ${clr.toFixed(0)} FT UNDER KEEL`});
      else if(sub.inShallowWater) W.push({level:'warn',text:'SHALLOW WATER'});
    }
    if(!W.length) W.push({level:'normal',text:'SYSTEMS NOMINAL'});
    d.warnings=W;
  }

  selectScopeContact(){
    const c=this.nearestScopeTrack();
    if(!c){this.log('No contact near periscope centreline.','warn');return;}
    this.state.tactical.selectedTrackId=c.id; this.state.tdc.targetId=c.id;
    this.log(`Selected ${c.id} for TDC tracking.`); this.updateTdc();
  }

  sendScopeToTdc(){
    const sid=this.state.tactical.selectedTrackId||this.state.tdc.targetId;
    if(!sid){this.log('No selected contact.','warn');return;}
    const tr=this.state.world.contactTracks[sid];
    if(!tr){this.log('Track lost.','warn');return;}
    const tdc=this.state.tdc;
    const mb=scopeMeasuredBearing(this.state,tr.bearing),mr=scopeMeasuredRangeNm(this.state,tr.rangeEstimateNm);
    tdc.targetId=sid;tdc.bearing=mb;tdc.rangeNm=mr;
    tdc.targetCourse=tr.courseEstimate;tdc.targetSpeedKnots=tr.speedEstimateKnots;
    this.updateTdc();
    this.log(`TDC: ${sid} B${fmtDeg(mb)} R${mr.toFixed(1)}nm C${fmtDeg(tr.courseEstimate)} S${tr.speedEstimateKnots.toFixed(1)}kn${this.state.playerSub.damage.periscopeDamage>.12?' — optical measurement degraded':''}`);
  }

  nearestScopeTrack(){
    const tact=this.state.tactical; const fov=SCOPE_OPTICS[tact.periscopeZoom===1?0:1].fov;
    let best=null;
    for(const tr of Object.values(this.state.world.contactTracks)){
      if(tr.confidence<0.15||tr.sunk) continue;
      const d=Math.abs(shortDelta(tact.periscopeBearing,tr.bearing));
      if(d>fov/2) continue;
      const sc=d-tr.confidence*8;
      if(!best||sc<best.score) best={...tr,score:sc};
    }
    return best;
  }

  steerWaypoint(doLog=false){
    const sub=this.state.playerSub; const map=this.state.map;
    if(!map.plottedCourse.length){
      map.autoFollowPlot=false;
      if(doLog)this.log('No waypoint plotted.','warn');return;}
    while(map.plottedCourse.length&&distNm(sub.position,map.plottedCourse[0])<0.22) map.plottedCourse.shift();
    if(!map.plottedCourse.length){
      map.autoFollowPlot=false;
      this.log('Course complete — holding this heading.','warn');return;}
    sub.orderedHeading=bearingBetween(sub.position,map.plottedCourse[0]);
    if(doLog) this.log(`Steering to waypoint. Hdg ${fmtDeg(sub.orderedHeading)}.`);
  }

  derivMode(){
    const sub=this.state.playerSub;
    if(sub.orderedDepthFeet<=2) sub.mode=sub.depthFeet<=5?'SURFACED':'SURFACING';
    else if(sub.orderedDepthFeet<=65) sub.mode='PERISCOPE_DEPTH';
    else if(sub.depthFeet<sub.orderedDepthFeet) sub.mode='DIVING';
    else sub.mode='SUBMERGED';
  }

  updateModeAfter(sub){
    if(sub.mode==='SUNK') return;
    if(sub.mode==='EMERGENCY_SURFACING'&&sub.depthFeet>3) return;
    if(sub.depthFeet<=1&&sub.orderedDepthFeet<=2) sub.mode='SURFACED';
    else if(sub.depthFeet>8&&sub.depthFeet<=65&&sub.orderedDepthFeet<=65) sub.mode='PERISCOPE_DEPTH';
    else if(Math.abs(sub.depthFeet-sub.orderedDepthFeet)<3&&sub.depthFeet>65) sub.mode='SUBMERGED';
    else if(sub.depthFeet<sub.orderedDepthFeet) sub.mode=sub.mode==='CRASH_DIVING'?'CRASH_DIVING':'DIVING';
    else if(sub.depthFeet>sub.orderedDepthFeet) sub.mode='SURFACING';
  }

  log(msg,level='info'){
    this.state.log.unshift({t:this.state.time.elapsedSeconds,level,message:msg});
    this.state.log=this.state.log.slice(0,100);
  }
}
