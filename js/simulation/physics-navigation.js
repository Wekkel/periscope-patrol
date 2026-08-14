class SimEngine extends SimEngineCareer {
  snapshotWatch(){
    const s=this.state,tracks=s.world.contactTracks||{},contacts=s.world.contacts||[],now=s.time.elapsedSeconds;
    const ids=Object.keys(tracks),byId=new Map(contacts.map(c=>[c.id,c]));
    const visualIds=ids.filter(id=>{const tr=tracks[id],age=now-(Number.isFinite(tr.hullConfirmedAt)?tr.hullConfirmedAt:-999);return !!tr.visualHullConfirmed&&age<6;});
    const mainTrackIds=ids.filter(id=>byId.get(id)?.convoyId==='MAIN');
    const visualMainIds=visualIds.filter(id=>{const c=byId.get(id);return c?.convoyId==='MAIN'&&!isASWCombatant(c);});
    const visualAswIds=visualIds.filter(id=>isASWCombatant(byId.get(id)));
    const aswBands={};
    for(const id of ids){const c=byId.get(id),tr=tracks[id];if(!c||!isASWCombatant(c)||!tr||tr.confidence<=.02)continue;const r=tr.rangeEstimateNm??99;aswBands[id]=r<=1.5?3:r<=3?2:r<=6?1:0;}
    s.time._watch={
      trackIds:ids,mainTrackIds,visualIds,visualMainIds,visualAswIds,aswBands,
      alert:s.world.enemy.alertState,
      hull:s.playerSub.damage.hullIntegrity,
      air:(s.world.aircraft||[]).filter(a=>a.side!=='FRIENDLY'&&a.seenBySub).length,
      // Attack state is safety-critical even when the aeroplane was already
      // known before transit began (or the lookout/radar has not yet promoted
      // it to a fresh contact count). This is a deliberate arcade safety net.
      airDanger:(s.world.aircraft||[]).filter(a=>a.side!=='FRIENDLY'&&!a.shotDown&&(a.state==='ATTACKING'||a.state==='STRAFING')).length,
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
    const authored=this.state.world?.chartBounds;
    if(authored&&Number.isFinite(authored.x0)&&Number.isFinite(authored.y0)&&Number.isFinite(authored.x1)&&Number.isFinite(authored.y1))return{x0:authored.x0,y0:authored.y0,x1:authored.x1,y1:authored.y1};
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
    /* Contact changes are judged by tactical SALIENCE, not just count. During
       a convoy chase we should stop for the first convoy sighting, a new escort
       or an escort crossing a dangerous range band — not for merchant #4, #5
       and #6 becoming visual one after another. */
    const tracks=s.world.contactTracks||{},contacts=s.world.contacts||[],byId=new Map(contacts.map(c=>[c.id,c])),ids=Object.keys(tracks),oldIds=new Set(w.trackIds||[]);
    const newIds=ids.filter(id=>!oldIds.has(id));
    if(newIds.some(id=>isASWCombatant(byId.get(id)))) return 'a new escort contact';
    if(newIds.length){
      const oldMain=(w.mainTrackIds||[]).length>0;
      const newMain=newIds.filter(id=>byId.get(id)?.convoyId==='MAIN');
      if(newMain.length&&!oldMain) return 'convoy contact';
      if(newIds.some(id=>byId.get(id)?.convoyId!=='MAIN')) return 'a new contact';
    }
    const now=s.time.elapsedSeconds,visualIds=ids.filter(id=>{const tr=tracks[id],age=now-(Number.isFinite(tr.hullConfirmedAt)?tr.hullConfirmedAt:-999);return !!tr.visualHullConfirmed&&age<6;}),oldVisual=new Set(w.visualIds||[]);
    const newVisual=visualIds.filter(id=>!oldVisual.has(id));
    if(newVisual.some(id=>isASWCombatant(byId.get(id)))) return 'escort now in sight';
    const visualMain=visualIds.filter(id=>byId.get(id)?.convoyId==='MAIN'&&!isASWCombatant(byId.get(id)));
    if(!(w.visualMainIds||[]).length&&visualMain.length) return 'convoy sighted';
    if(newVisual.some(id=>byId.get(id)?.convoyId!=='MAIN')) return 'contact now visual';
    for(const id of ids){const c=byId.get(id),tr=tracks[id];if(!c||!isASWCombatant(c)||!tr||tr.confidence<=.02)continue;const r=tr.rangeEstimateNm??99,band=r<=1.5?3:r<=3?2:r<=6?1:0;if(band>(w.aswBands?.[id]??band))return band>=3?'escort inside 1.5 nm':band>=2?'escort inside 3 nm':'escort inside 6 nm';}
    if((s.world.aircraft||[]).filter(a=>a.side!=='FRIENDLY'&&a.seenBySub).length>w.air) return 'aircraft';
    if((s.world.aircraft||[]).filter(a=>a.side!=='FRIENDLY'&&!a.shotDown&&(a.state==='ATTACKING'||a.state==='STRAFING')).length>(w.airDanger||0)) return 'aircraft attack';
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
    if(this.state.campaign?.missionStatus==='TRAINING'||this.state.campaign?.missionStatus==='MENU')return;
    // Patch 6 owns objectives for configured missions. If the mission module is
    // absent (old isolated tests/builds), the legacy convoy contract below remains.
    if(this.checkPrimaryMission?.()) return;
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
    const merchants=this.state.world.contacts.filter(c=>!isSurfaceCombatant(c)&&!c.sunk&&!c.harborTarget);
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
    const sub=this.state.playerSub,sunk=sub.mode==='SUNK';
    if(!sunk){
      this.captureCollisionFrame();this.updateBridgeDiveSequence?.(dt);this.updateHeading(sub,dt);this.updateDepth(sub,dt);this.updatePropulsion(sub,dt);this.updatePosition(sub,dt);this.applyTerrainEffects(sub,dt);
    }else{
      // The battle may continue after loss for observation/AAR purposes, but a
      // destroyed boat is not an invisible 9-knot powered object in that world.
      sub.propulsion.orderedRpm=0;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.propulsion.chargeRate=0;sub.verticalSpeedFps=0;sub.maneuveringThrust=0;sub.rudder=0;
    }
    this.updateWeather?.(dt);
    this.updateTrafficDirector?.(dt);
    this.updateWorld(dt); this.updateVesselCollisions(dt); this.updateSigs(sub); this.updateHarbor(dt);
    this.updateDetection(dt); this.updateSoundRadar?.(dt); this.updateHarborKnowledge(dt); this.updateTdc(); this.updateTorpedoes(dt); this.updateDeckGun(dt);
    this.updateEnemyAI(dt); this.updateAircraft(dt); this.updateAAGun(dt); this.updateRadio(dt); this.updateMapState(dt);
    this.updateBattleAtmosphere?.(dt);
    this.updateMissionFramework?.(dt);
    if(!sunk&&this.state.map.autoFollowPlot&&this.state.map.plottedCourse.length)this.steerWaypoint(false);
    if(!sunk){this.updateDmg(sub,dt);this.updateDmgCtrl(sub,dt);this.checkMissionObjectives();this.checkPortArrival(dt);this.updateModeAfter(sub);}
    this.updateWarnings(sub);
    this.updateAfterActionRecorder?.(dt);
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
    sub.maneuveringThrust=sub.propulsion.speedKnots<.45&&Math.abs(d)>1?clamp(Math.abs(d)/45,0,1)*.055:0;
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
    if(sub.diveDelay>0){sub.diveDelay=Math.max(0,sub.diveDelay-dt);sub.verticalSpeedFps=Math.min(sub.verticalSpeedFps,0);}
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
    else{
      p.chargeRate=0;
      /* BATTERY ENDURANCE. Express every load as percentage-points per
         simulated hour. The old per-second constants unintentionally made a
         stopped boat consume 54% of a full battery each hour. Fleet boats
         could remain submerged for many hours at very low power, while high
         motor power exhausted the cells quickly. This curve preserves that
         characteristic without making quiet waiting unplayable:
             STOP                         ~80 h from full
             120 rpm / ~4 kn              ~13 h
             250 rpm / ~6.5 kn            ~3.3 h
             450 rpm / ~8 kn              ~1 h
         Silent running trims non-essential hotel load; dewatering pumps add a
         small real electrical cost. Electrical casualties increase all load. */
      const motorLoad=clamp(rl,0,1);
      const hotelPerHour=sub.stealth.silentRunning?0.90:1.25;
      const propulsionPerHour=98.75*Math.pow(motorLoad,2.06);
      const pumpPerHour=(dmg.pumpActive&&!dmg.pumpTripped)?1.0:0;
      const electricalFactor=1+(dmg.electricalDamage||0)*0.35;
      const drainPerHour=(hotelPerHour+propulsionPerHour+pumpPerHour)*electricalFactor;
      p.battery=clamp(p.battery-drainPerHour*dt/3600,0,100);
      if(p.battery<=0){p.speedKnots*=0.05;p.actualRpm*=0.1;}
    }
  }

  updatePosition(sub,dt){
    if(sub.bottomed||sub.mode==='SUNK')return;
    const d=knotsNmSec(sub.propulsion.speedKnots)*dt; const r=degToRad(sub.heading);
    sub.position.xNm+=Math.sin(r)*d; sub.position.yNm-=Math.cos(r)*d;
  }

  // A warship cannot flick its bow around. Rudder and engine orders are
  // rate-limited: an escort works up to about 4°/s, a loaded merchant 1.3°/s.
  steerShip(c,dt){
    const D=ensureShipDamage(c);
    const base=SHIP_TURN_RATE[c.type]||1.2;
    const rate=base*clamp(c.speedKnots/10,0.22,1.0)*shipDamageTurnFactor(c); // damaged rudder loses authority
    const ordered=c.desiredHeading===undefined?c.heading:c.desiredHeading;
    const biased=normDeg(ordered+(D?.rudderBiasDeg||0));
    const d=shortDelta(c.heading,biased);
    let targetRate=clamp(d*.55,-rate,rate);             // ease out near the ordered course
    // A badly jammed rudder is a persistent casualty, not random steering
    // noise. The ship circles one way until the damage state changes.
    if(D&&Math.abs(D.rudderJam)>.15&&D.steering>.80)targetRate=D.rudderJam*rate;
    const angAcc=(SHIP_TURN_ACCEL[c.type]||.7)*clamp(c.speedKnots/6,.35,1)*clamp(.35+shipDamageTurnFactor(c),.25,1);
    c.turnRateDegSec=Number.isFinite(c.turnRateDegSec)?c.turnRateDegSec:0;
    c.turnRateDegSec+=clamp(targetRate-c.turnRateDegSec,-angAcc*dt,angAcc*dt);
    let turn=c.turnRateDegSec*dt;
    if(!(D&&Math.abs(D.rudderJam)>.15&&D.steering>.80)&&Math.abs(turn)>Math.abs(d)){turn=d;c.turnRateDegSec=0;}
    c.heading=normDeg(c.heading+turn);
    if(!(D&&Math.abs(D.rudderJam)>.15)&&Math.abs(d)<.08&&Math.abs(c.turnRateDegSec)<.08)c.turnRateDegSec=0;
    const acc=SHIP_ACCEL[c.type]||0.10;
    let want=c.desiredSpeed===undefined?c.speedKnots:c.desiredSpeed;
    if(D){const cap=(c.baseSpeed??Math.max(c.speedKnots,want))*shipDamageSpeedFactor(c);want=Math.min(want,cap);}
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
    // A cripple is no longer allowed to drag the entire convoy down to three
    // knots merely because it used to be the lead ship. The healthy body keeps
    // its lane and the casualty becomes a genuine straggler.
    const core=merchants.filter(c=>!shipIsStraggler(c));
    const lead=(core.length?core:merchants)[0],pr=routeProject(path,lead.position);
    // The primary convoy is a mission object, not ambient scenery. Keep it on
    // a one-way voyage so an abstracted convoy cannot reverse to the opposite
    // side of the chart while the player follows an old intelligence report.
    W.convoyLeg=1;
    const aim=routeAdvanceOneWay(path,pr.s,1.25);W.convoyRouteS=pr.s;W.primaryRouteEnded=!!aim.ended;
    if(!lead.scattering){
      lead.desiredHeading=aim.ended?lead.heading:bearingBetween(lead.position,aim.pos);
      lead.desiredSpeed=aim.ended?0:(lead.baseSpeed||lead.speedKnots);
    }
    const hdg=lead.desiredHeading===undefined?lead.heading:lead.desiredHeading;
    const r=degToRad(hdg),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
    const lf=lead.formationFwd||0,ls=lead.formationSide||0;
    for(const c of merchants){
      if(c===lead||c.scattering)continue;
      if(shipIsStraggler(c)){
        const cp=routeProject(path,c.position),ca=routeAdvanceOneWay(path,cp.s,1.0);
        c.desiredHeading=bearingBetween(c.position,ca.pos);c.desiredSpeed=c.baseSpeed||c.speedKnots;
        continue;
      }
      const f=(c.formationFwd??(-(c.formationIndex||1)*1.2))-lf,side=(c.formationSide||0)-ls;
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
      updateShipDamage(this,c,dt);
      if(c.sunk) continue;
      if(c.stationary){c.speedKnots=0;c.desiredSpeed=0;continue;}
      // Apply scatter behaviour if a convoy merchant was alerted. Harbour
      // targets never scatter: they are moored prizes, not convoy traffic.
      if(c.scattering&&!isSurfaceCombatant(c)&&!c.harborTarget){
        const scatterAge=elapsed-(c.alertedAt||0),scatterDuration=Math.max(30,Number(c.scatterDurationSec)||90);
        if(scatterAge<scatterDuration){
          c.desiredHeading=c.scatterHeading;
          c.desiredSpeed=c.scatterSpeed;
        } else {
          c.scattering=false;c.scatterDurationSec=0;
          c.desiredSpeed=c.baseSpeed||c.speedKnots*0.75;
        }
      }
      this.steerShip(c,dt);
      const d=knotsNmSec(c.speedKnots)*dt; const r=degToRad(c.heading);
      const prev={...c.position};
      c.position.xNm+=Math.sin(r)*d; c.position.yNm-=Math.cos(r)*d;
      // No surface ship is allowed to cut a corner through an island. Bathy is
      // deliberately coarse for speed and can miss Kii Suido's narrow rendered
      // islands, so exact terrain polygons are authoritative for local contacts.
      // Tactical contact counts are bounded; this one point test stays cheap.
      const exactLand=this.checkTerrainCollision?.(c)?.collision===true;
      const mid={position:{xNm:(prev.xNm+c.position.xNm)/2,yNm:(prev.yNm+c.position.yNm)/2}};
      const crossedLand=this.checkTerrainCollision?.(mid)?.collision===true;
      if(exactLand||crossedLand||Bathy.feet(c.position.xNm,c.position.yNm)<24){
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
      const T=this.state.tactical;
      // Arcade-readable visual doctrine: at the surface/periscope depth the
      // watch is assumed to scan 360°. MAP therefore knows a hull whenever the
      // same visibility/range rules say that hull could be resolved through the
      // periscope, regardless of which station the player currently occupies.
      const crewVisual=crewCanSeeSurfaceHull(this.state,c);
      const scopeVisual=T.activeStation==='PERISCOPE'&&scopeCanResolveHull(this.state,c);
      const visualHeld=crewVisual;
      const acousticHeld=aco.score>0.12;
      const held=visualHeld||acousticHeld;
      const sc=visualHeld?Math.max(Number.isFinite(vis.score)?vis.score:0,Number.isFinite(aco.score)?aco.score:0,0.18):(Number.isFinite(aco.score)?aco.score:0);
      const src=visualHeld?'VISUAL':'HYDROPHONE';
      const aobs=src==='HYDROPHONE'?passiveSoundObservation(this.state,c,sc):{bearing:bear,rangeNm:rng};
      const obsBear=aobs.bearing,obsRng=aobs.rangeNm;
      const key=c.id;
      let ex=W.contactTracks[key];
      if(!ex&&!held) continue;
      ex=ex||{id:key,typeEstimate:'UNKNOWN',bearing:obsBear,rangeEstimateNm:obsRng,
        courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:0,source:src,
        lastUpdated:now,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards};
      // Never carry a crisp-hull flag past the instant the crew can actually
      // resolve the hull. The stale paper plot may persist, but it is uncertain.
      if(!crewVisual) ex.visualHullConfirmed=false;

      if(held){
        ex.confidence=clamp(ex.confidence+clamp((sc-0.10)*dt*0.34,0.006,0.12),0,1);
        // A hull actually resolved through the scope is a strong navigation
        // fix, not merely one more weak sensor sample. In particular 6x optics
        // should pin position/course quickly enough that the chart agrees with
        // what the skipper can plainly see through the glass.
        if(visualHeld){
          const visualFloor=scopeVisual?(T.periscopeZoom===1?.72:.86):.70;
          ex.confidence=Math.max(Number.isFinite(ex.confidence)?ex.confidence:0,visualFloor);
        }
        ex.lastUpdated=now; ex.staleSeconds=0; ex.lastSensorSource=src;
        ex.lengthYards=c.lengthYards;
        const prevCourseEstimate=ex.courseEstimate;
        if(src==='VISUAL'){
          /* Arcade-readable visual tracking: if the hull is genuinely in sight,
             its map symbol must move like the ship being watched. Heading and
             speed therefore follow the observed hull directly instead of
             lagging behind while position snaps to the visual line of sight. */
          ex.courseEstimate=c.heading;ex.speedEstimateKnots=c.speedKnots;
        }else{
          ex.courseEstimate=lerpAngle(ex.courseEstimate,c.heading,clamp(0.08+ex.confidence*0.18,0,0.35));
          ex.speedEstimateKnots=lerp(ex.speedEstimateKnots,c.speedKnots,clamp(0.08+ex.confidence*0.18,0,0.35));
        }
        const observedTurn=shortDelta(prevCourseEstimate,ex.courseEstimate)/Math.max(dt,.1);
        ex.turnRateEstimateDegSec=lerp(ex.turnRateEstimateDegSec||0,observedTurn,clamp(.18+ex.confidence*.22,.18,.4));
        const knownType=c.displayType||c.type;
        const smokeOnly=false;
        /* Hard visual split: a hull is either currently resolvable by the crew
           and therefore exact on MAP, or it is not and must use the uncertain
           sensor plot. There is deliberately no visual-memory grace period. */
        if(crewVisual){ex.visualHullConfirmed=true;ex.hullConfirmedAt=now;}
        else ex.visualHullConfirmed=false;
        // The Truk heavy unit is deliberately reported only as HEAVY UNIT.
        // Hydrophones may build a good positional track, but they do not hand
        // the player a magical carrier/cruiser classification. Exact identity
        // requires the visual source consumed by updateHarborKnowledge().
        if(smokeOnly||(c.harborTarget&&c.id==='H-04'&&src!=='VISUAL'))
          ex.typeEstimate=ex.confidence>0.35?'SURFACE SHIP':'UNKNOWN';
        else ex.typeEstimate=ex.confidence>0.65?knownType:ex.confidence>0.35?'SURFACE SHIP':'UNKNOWN';
        ex.contactType=c.type;
        if(src==='VISUAL'&&ex.visualHullConfirmed&&ex.confidence>=.65)ex.affiliation=c.side||'ENEMY';
        if(src==='VISUAL'&&shipDamageSeverity(c)>.10){
          ex.damageEstimate=shipDamageCondition(c);ex.damageSeverity=shipDamageSeverity(c);ex.damageObservedAt=now;
        }
        // The raw sensor observation is NOT the map position.  Predict the
        // existing paper plot with estimated course/speed and let this sensor
        // pull it toward the new observation at a bounded rate.  Hydrophone
        // noise can therefore change by hundreds of metres without the ship
        // icon teleporting by hundreds of metres.
        const rawPos=aobs.position||{xNm:sub.position.xNm+Math.sin(degToRad(obsBear))*obsRng,
                                     yNm:sub.position.yNm-Math.cos(degToRad(obsBear))*obsRng};
        updateStableContactPlot(this.state,ex,rawPos,src,sc,dt);
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
        ex.plotUpdatedAt=now;
        ex.positionConfidence=clamp((Number.isFinite(ex.positionConfidence)?ex.positionConfidence:ex.confidence)-dt*.0007,0,1);
        ex.positionUncertaintyNm=Math.min(4,(Number.isFinite(ex.positionUncertaintyNm)?ex.positionUncertaintyNm:.25)+dt*.0008);
        ex.bearing=bearingBetween(sub.position,ex.plotPosition);
        ex.rangeEstimateNm=distNm(sub.position,ex.plotPosition);
        delete ex.truePosition;
        if(ex.confidence>0.02) W.contactTracks[key]=ex;
        else delete W.contactTracks[key];
      }
    }
  }

  updateTdc(force=false){
    const tdc=this.state.tdc;
    if(!tdc.targetId){tdc.status='NO TARGET';tdc.solutionQuality=0;tdc._lastSolvedTargetId=null;return;}
    const now=this.state.time.elapsedSeconds||0,scale=Math.max(1,this.state.time.timeScale||1);
    // TDC 2.0 solves real tube/gyro geometry and is intentionally more involved
    // than the old ideal-line calculation. The display does not need a fresh
    // solve at 60 Hz. At high time compression use a wider SIM-time interval;
    // explicit target/manual changes and FIRE always pass force=true below.
    const minInterval=scale>=8?2:.14;
    if(!force&&tdc._lastSolvedTargetId===tdc.targetId&&Number.isFinite(tdc._lastSolveAt)&&now-tdc._lastSolveAt<minInterval)return;
    const tr=this.state.world.contactTracks[tdc.targetId];
    const manual=tdc.targetId==='MANUAL'||tdc.autoTrack===false;
    if(!manual&&(!tr||tr.confidence<=0.02)){tdc.status='TRACK LOST';tdc.solutionQuality=0;return;}
    const sub=this.state.playerSub,d=sub.damage,bias=d.instrumentBias||damageBiasesFor(this.state);
    const autoTrack=!manual&&tdc.autoTrack!==false;
    // A selected contact is a continuously worked TDC track in arcade mode.
    // Previously the first bearing/range/course/speed were frozen forever,
    // although the UI said "tracking"; a steady merchant could therefore
    // walk out of an apparently excellent solution before the player fired.
    let bear=manual?tdc.bearing:(autoTrack?tr.bearing:(tdc.bearing??tr.bearing));
    let rng=manual?tdc.rangeNm:(autoTrack?tr.rangeEstimateNm:(tdc.rangeNm??tr.rangeEstimateNm));
    // A live scope-fed track still carries the optical instrument's fixed
    // calibration error; continuous tracking must not magically bypass
    // periscope damage introduced by Phase 3.
    if(!manual&&autoTrack&&tdc.trackSource==='SCOPE'){
      bear=scopeMeasuredBearing(this.state,bear);rng=scopeMeasuredRangeNm(this.state,rng);
    }
    const crs=manual?tdc.targetCourse:(autoTrack?tr.courseEstimate:(tdc.targetCourse??tr.courseEstimate));
    const spd=manual?tdc.targetSpeedKnots:(autoTrack?tr.speedEstimateKnots:(tdc.targetSpeedKnots??tr.speedEstimateKnots));
    // A damaged TDC is wrong in a repeatable way, not a dice roll each tick.
    // The stored observations remain what the crew entered; only the machine's
    // internal calculation carries its calibration errors.
    const calcBear=normDeg(bear+(bias.tdcBearingDeg||0));
    const calcRng=Math.max(.05,rng*(1+(bias.tdcRangePct||0)));
    const calcCrs=normDeg(crs+(bias.tdcCourseDeg||0));
    const calcSpd=Math.max(0,spd+(bias.tdcSpeedKnots||0));
    const res=calcTdc({ownPosition:sub.position,ownHeading:sub.heading,bearing:calcBear,
      rangeNm:calcRng,targetCourse:calcCrs,targetSpeedKnots:calcSpd,
      torpedoSpeedKnots:tdc.torpedoSpeedKnots,confidence:manual?0.65:Math.min(tr.confidence,
        Number.isFinite(tr.positionConfidence)?tr.positionConfidence:tr.confidence)});
    tdc.bearing=bear;tdc.rangeNm=rng;tdc.targetCourse=crs;tdc.targetSpeedKnots=spd;
    // TDC 2.0 returns the same settling-run + gyro-turn geometry used by the
    // physical torpedo. Gyro damage is applied to the final course, then all
    // displayed launch angles are derived from that same erroneous course.
    const machineCourse=res.solutionCourse==null?null:normDeg(res.solutionCourse+(bias.gyroDeg||0));
    tdc.solutionCourse=machineCourse;tdc.launchBank=res.launchBank||null;tdc.launchGeometry=res.launchGeometry||null;
    tdc.gyroAngle=machineCourse==null?null:shortDelta(sub.heading,machineCourse);
    const tubeAxis=tdc.launchBank==='AFT'?normDeg(sub.heading+180):sub.heading;
    tdc.tubeTurnDeg=machineCourse==null?null:shortDelta(tubeAxis,machineCourse);
    tdc.interceptRunNm=res.interceptRunNm??null;tdc.predictedMissNm=res.predictedMissNm??null;tdc.angleOnBow=res.angleOnBow;
    tdc.timeToImpactSec=res.timeToImpactSec;
    tdc.solutionQuality=clamp(res.solutionQuality*(1-(d.tdcDamage||0)*.18-(d.gyroDamage||0)*.10),0,1);
    tdc.status=res.valid?'SOLUTION':'NO SOLUTION';
    tdc._lastSolveAt=now;tdc._lastSolvedTargetId=tdc.targetId;
  }

  calcVis(sub,c,rng,env){
    const lookout = sub.depthFeet<8 ? 1.0 : sub.depthFeet<=65 ? 0.85 : 0;
    if(lookout<=0) return{score:0};
    const wx=weatherBetween(this.state,sub.position,c.position);
    const rf=clamp(1-rng/Math.max(.35,wx.visibilityNm),0,1);
    const df=clamp(env.daylight+.18*wx.moonFactor,.10,1.0);
    const sm=clamp(1-wx.seaState*.35,.40,1);
    const D=c.shipDamage?ensureShipDamage(c):null,damageSmoke=D?1+clamp(D.fire*.40+D.propulsion*.10,0,.48):1;
    return{score:rf*df*sm*c.visualProfile*lookout*wx.visualFactor*damageSmoke};
  }

  calcAco(sub,c,rng,env){
    const cn=c.acousticBase+Math.pow(c.speedKnots/18,2)*0.65;
    const on=clamp(sub.stealth.acousticSignature*0.55,0,0.75);
    const wx=weatherBetween(this.state,sub.position,c.position);
    const sp=wx.seaState*0.25+(1-wx.hydrophoneFactor)*.12; const rf=1+Math.pow(rng/9,1.65);
    return{score:clamp((cn-on-sp)/rf*wx.hydrophoneFactor,0,1)};
  }

  updateSigs(sub){
    const sf=sub.depthFeet<8?1:0; const pf=sub.depthFeet>=8&&sub.depthFeet<=65?0.16:0;
    const wx=weatherAtPosition(this.state,sub.position);
    sub.stealth.visualProfile=(sf+pf)*wx.subVisualFactor;
    const rn=sub.propulsion.actualRpm/450; const sn=Math.pow(sub.propulsion.speedKnots/18,2);
    const sm=sub.stealth.silentRunning?0.38:1; const dm=sub.depthFeet>65?0.85:1;
    const pn=sub.damage.pumpActive?0.12:0; const fn=sub.damage.flooding*0.15;const mn=sub.maneuveringThrust||0;
    sub.stealth.acousticSignature=clamp((rn*0.6+sn*0.8)*sm*dm+pn+fn+mn,0,1.5);
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

    /* The old chart painted explored 5-nm squares. They looked like literal
       square eyesight. Keep exploredCells for save/backwards compatibility,
       but expose a cheap current optical footprint for the renderer instead.
       Surface lookouts are 360° arcade watch; a submerged scope is a narrow
       weather-limited wedge. Directional range samples the actual moving
       weather field, so a squall can shorten one side without shortening all. */
    if(!map.visibilityFootprint||t-(map.visibilityFootprint.at||-99)>=1){
      const env=this.state.world.environment||{},surf=sub.depthFeet<8,scope=sub.depthFeet>=8&&sub.depthFeet<=65&&this.state.tactical.activeStation==='PERISCOPE';
      const pts=[];
      if(surf||scope){
        const fov=scope?(typeof SCOPE_OPTICS!=='undefined'?SCOPE_OPTICS[this.state.tactical.periscopeZoom===1?0:1].fov:(this.state.tactical.periscopeZoom===1?32:8)):360;
        const n=surf?18:9,base=clamp((env.visibilityNm||8)*(surf?1.08:.86),.45,18),centre=scope?this.state.tactical.periscopeBearing:0;
        for(let i=0;i<n;i++){
          const br=surf?i*360/n:normDeg(centre-fov*.5+i*fov/(n-1));
          const r0=degToRad(br),probe={xNm:sub.position.xNm+Math.sin(r0)*base,yNm:sub.position.yNm-Math.cos(r0)*base};
          const local=Math.max(.35,weatherVisibilityBetween(this.state,sub.position,probe)*(surf?1.0:.86));
          const rr=Math.min(base,local),r=degToRad(br);
          pts.push({xNm:sub.position.xNm+Math.sin(r)*rr,yNm:sub.position.yNm-Math.cos(r)*rr});
        }
      }
      map.visibilityFootprint={at:t,mode:surf?'LOOKOUT':scope?'SCOPE':'NONE',points:pts,origin:{...sub.position}};
    }
    if(map.plottedCourse.length&&distNm(sub.position,map.plottedCourse[0])<0.22){
      map.plottedCourse.shift(); this.log('Waypoint reached.'); audio.event?.('WAYPOINT_REACHED');
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
    if(d.oxygen<8) W.push({level:'critical',text:'AIR CRITICAL'});
    else if(d.oxygen<20) W.push({level:'critical',text:'AIR FOUL'});
    else if(d.oxygen<45) W.push({level:'warn',text:'AIR QUALITY FALLING'});
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
    const friendlyRv=this.friendlyPortNav();
    if(camp.missionStatus!=='RETURN TO BASE'&&friendlyRv&&friendlyRv.rngNm<=1.5){
      if(camp._portServiceLock) W.push({level:'normal',text:`${friendlyRv.port.name.toUpperCase()} FRIENDLY RV — SERVICED`});
      else if(friendlyRv.rngNm<=0.30&&sub.depthFeet>=8) W.push({level:'warn',text:`${friendlyRv.port.name.toUpperCase()} RV — SURFACE TO SERVICE`});
      else if(friendlyRv.rngNm<=0.30&&(sub.propulsion.speedKnots||0)>.45&&(sub.propulsion.orderedRpm||0)>0) W.push({level:'warn',text:`${friendlyRv.port.name.toUpperCase()} RV — ORDER STOP`});
      else if(friendlyRv.rngNm<=0.30) W.push({level:'normal',text:`${friendlyRv.port.name.toUpperCase()} FRIENDLY RV — STOP FOR SERVICE`});
      else W.push({level:'normal',text:`${friendlyRv.port.name.toUpperCase()} FRIENDLY RV — ${friendlyRv.rngNm.toFixed(1)} NM`});
    }
    if(camp.missionStatus==='RETURN TO BASE'){
      const r=friendlyRv;
      if(r&&r.rngNm<=0.30&&sub.depthFeet>=8) W.push({level:'warn',text:`${r.port.name.toUpperCase()} RV — SURFACE`});
      else if(r&&r.rngNm<=0.30&&(sub.propulsion.speedKnots||0)>.45&&(sub.propulsion.orderedRpm||0)>0) W.push({level:'warn',text:`${r.port.name.toUpperCase()} RV — ORDER STOP`});
      else if(r&&r.rngNm<=0.30) W.push({level:'normal',text:`${r.port.name.toUpperCase()} FINAL RETURN — STOP TO COMPLETE PATROL`});
      else if(r&&r.rngNm<=1.5) W.push({level:'warn',text:`${r.port.name.toUpperCase()} APPROACH — ${r.rngNm.toFixed(1)} NM · SURFACE · STOP IN HARBOR`});
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

  confirmScopeVisualContact(trackId){
    const s=this.state,T=s.tactical,W=s.world,now=s.time.elapsedSeconds||0;
    if(T.activeStation!=='PERISCOPE')return null;
    const c=(W.contacts||[]).find(q=>q.id===trackId&&!q.sunk);if(!c)return null;
    const obs=scopeHullObservation(s,c);if(!obs)return null;
    let tr=W.contactTracks[trackId];
    if(!tr){
      tr={id:c.id,typeEstimate:'UNKNOWN',bearing:obs.bearing,rangeEstimateNm:obs.rangeNm,
        courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:0,source:'VISUAL',
        lastUpdated:now,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards};
      W.contactTracks[trackId]=tr;
    }
    tr.confidence=Math.max(tr.confidence||0,obs.confidenceFloor);
    tr.bearing=obs.bearing;tr.rangeEstimateNm=obs.rangeNm;
    tr.courseEstimate=obs.courseDeg;tr.speedEstimateKnots=obs.speedKnots;tr.contactType=c.type;tr.lengthYards=c.lengthYards;
    tr.typeEstimate=obs.typeEstimate;tr.affiliation=obs.affiliation;tr.visualHullConfirmed=true;tr.hullConfirmedAt=now;tr.visualLastSeenAt=now;
    tr.source='VISUAL';tr.lastSensorSource='VISUAL';tr.observer='PERISCOPE';tr.lastUpdated=now;tr.staleSeconds=0;
    tr.positionSource='VISUAL';tr.positionFixAt=now;tr.positionConfidence=obs.positionConfidence;tr.positionUncertaintyNm=obs.positionUncertaintyNm;
    updateStableContactPlot(s,tr,obs.position,'VISUAL',obs.quality,.1);
    return tr;
  }

  selectScopeContact(){
    const c=this.nearestScopeTrack();
    if(!c){this.log('No contact near periscope centreline.','warn');return;}
    this.confirmScopeVisualContact(c.id);
    this.state.tactical.selectedTrackId=c.id; this.state.tdc.targetId=c.id;
    this.log(`Selected ${c.id} for TDC tracking.`); this.updateTdc(true);
  }

  sendScopeToTdc(){
    const sid=this.state.tactical.selectedTrackId||this.state.tdc.targetId;
    if(!sid){this.log('No selected contact.','warn');return;}
    this.confirmScopeVisualContact(sid);
    const tr=this.state.world.contactTracks[sid];
    if(!tr){this.log('Track lost.','warn');return;}
    const tdc=this.state.tdc;
    const mb=scopeMeasuredBearing(this.state,tr.bearing),mr=scopeMeasuredRangeNm(this.state,tr.rangeEstimateNm);
    tdc.targetId=sid;tdc.autoTrack=true;tdc.trackSource='SCOPE';tdc.bearing=mb;tdc.rangeNm=mr;
    tdc.targetCourse=tr.courseEstimate;tdc.targetSpeedKnots=tr.speedEstimateKnots;
    this.updateTdc(true);audio.playTdcSolution?.();
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
