// ═══════════════════════════════════════════════════ SIMULATION ENGINE
class SimEngineCore{
  constructor(state,bus){this.state=state;this.bus=bus;}

  update(dt){
    this.ensureWorldExtensions();
    const total=dt*this.state.time.timeScale;
    this.processCommands();
    // Manual 8x/16x/32x hands the conn back before a predicted vessel collision.
    // Transit/skip uses transitInterrupt(), which reports the same hull-aware CPA.
    if(!this.state.time.transitUntil&&(this.state.time.timeScale||1)>1&&this.compressedCollisionWatch?.()) return;
    if(total<=0) return;
    // Never integrate more than a second at a time, whatever the time scale:
    // a torpedo at 46 knots covers 24 m per second and the hit test would
    // start stepping straight over ships.
    const steps=Math.min(64,Math.max(1,Math.ceil(total/1.0)));
    const sdt=total/steps;
    for(let i=0;i<steps;i++){
      this.updateSub(sdt);
      this.state.time.elapsedSeconds+=sdt;
      this.state.campaign.patrolDuration+=sdt;
    }
  }

  processCommands(){for(const c of this.bus.drain())this.applyCmd(c);}

  /* A refusal that only reaches the log on another tab reads, to the player,
     as a button that does nothing. Anything the boat says NO to — or any
     order it accepts that has no visible consequence for a few seconds —
     goes through here, and the UI raises it as a toast wherever he is. */
  notify(msg,kind='warn'){
    this.log(msg,kind);
    const u=this.state.ui=this.state.ui||{};
    u.toasts=u.toasts||[];
    u.toasts.push({msg,kind,seq:(u.toastSeq=(u.toastSeq||0)+1)});
    if(u.toasts.length>40) u.toasts.shift();
  }

  clearDeckForDive(label='Dive'){
    const sub=this.state.playerSub, W=this.state.world, G=this.state.weapons.deckGun;
    let delay=0; const crews=[];
    if(G?.manned){
      G.manned=false;delay=Math.max(delay,18);crews.push('deck-gun crew');
      if(this.state.tactical.activeStation==='DECK_GUN') this.state.tactical.activeStation='MAP';
    }
    if(W.aaManned){
      W.aaManned=false;delay=Math.max(delay,14);crews.push('AA crew');
    }
    if(delay>0){
      sub.diveDelay=Math.max(sub.diveDelay||0,delay);
      this.notify(`${label}: ${crews.join(' and ')} clearing the deck automatically — dive held about ${delay} seconds until the hatch is shut.`,'bad');
    }
    return delay;
  }

  tryAutoManDeckGun(){
    const sub=this.state.playerSub, W=this.state.world, G=this.state.weapons.deckGun, env=W.environment;
    if(!G) return false;
    if(G.manned) return true;
    if(W.aaManned){this.notify('Deck gun unavailable while the automatic AA crew is engaged. Clear the air threat or dive.','warn');return false;}
    if(sub.depthFeet>8){this.notify(`Deck gun unavailable at ${sub.depthFeet.toFixed(0)} ft — surface first.`,'warn');return false;}
    if(env.seaState>0.82){this.notify('Green water is sweeping the foredeck — the deck gun cannot be worked in this sea.','warn');return false;}
    if(G.ammo<=0){this.notify('Deck gun magazine is empty.','warn');return false;}
    G.manned=true;G.trainDeg=clamp(G.trainDeg||0,-140,140);G.elevationDeg=clamp(G.elevationDeg||1,0,22);
    this.notify(`Deck gun crew topside automatically — ${G.ammo} rounds ready. Any dive order will clear the deck first.`,'warn');
    return true;
  }

  secureDeckGunAuto(){
    const G=this.state.weapons.deckGun;
    if(!G?.manned) return;
    G.manned=false;
    this.log('Deck gun secured — crew below automatically.');
  }

  applyCmd(cmd){
    const sub=this.state.playerSub;
    // a lost boat takes no more orders — only the menus stay live
    if(sub.mode==='SUNK'&&!['NEW_PATROL','SET_ACTIVE_STATION','CYCLE_TIME_SCALE','SET_TIME_SCALE',
        'MAP_CLEAR_PLOT','SET_TORPEDO_TYPE','SET_DUD_MODE'].includes(cmd.type)){
      /* She is gone. Silently swallowing the order is the cruellest thing the
         interface can do — the player sits there working the controls of a
         wreck. Say it, once every few seconds, in plain words. */
      const now=this.state.time.elapsedSeconds;
      if(now-(this._sunkNagAt||-99)>3){
        this._sunkNagAt=now;
        this.notify('THE BOAT IS LOST. There is nobody left to pass the order to — start a new patrol from the menu.','bad');
      }
      return;
    }
    switch(cmd.type){
      case'SET_ORDERED_HEADING':
        sub.orderedHeading=normDeg(cmd.heading);
        if(cmd.auto!==true&&this.state.map.autoFollowPlot&&this.state.map.plottedCourse.length){
          this.state.map.autoFollowPlot=false;
          this.log('Helm taken manually — autopilot disengaged.','warn');
        }
        break;
      case'SET_ENGINE_RPM': sub.propulsion.orderedRpm=clamp(cmd.rpm,0,450); break;
      case'SET_ORDERED_DEPTH':
        if(+cmd.depthFeet>10) this.clearDeckForDive('Dive order');
        sub.orderedDepthFeet=clamp(cmd.depthFeet,0,300); this.derivMode(); break;
      case'SURFACE': sub.orderedDepthFeet=0; sub.mode=sub.depthFeet>5?'SURFACING':'SURFACED'; this.log('Surface order received.'); audio.playSurface(); break;
      case'DIVE':
        this.clearDeckForDive('Dive order');
        sub.orderedDepthFeet=Math.max(sub.orderedDepthFeet,100); sub.mode=sub.depthFeet<10?'DIVING':'SUBMERGED'; this.log('Dive ordered. 100 ft.'); audio.playDive(); break;
      case'PERISCOPE_DEPTH':
        this.clearDeckForDive('Periscope-depth order');
        sub.orderedDepthFeet=55; sub.mode='PERISCOPE_DEPTH'; this.log('Periscope depth ordered.'); audio.playDive(); break;
      case'CRASH_DIVE':
        this.clearDeckForDive('Crash dive');
        sub.orderedDepthFeet=150; sub.mode='CRASH_DIVING'; sub.ballastState='FLOODING';
        // Fix H: auto-set RPM for faster dive if nearly stopped
        if(sub.propulsion.speedKnots<5) sub.propulsion.orderedRpm=350;
        this.log('CRASH DIVE! Flooding ballast tanks.','warn'); audio.playCrashDive(); break;
      case'TOGGLE_SD_RADAR':{
        const a=this.state.world.airThreat;a.sdOn=true;
        this.notify('SD air-search radar is crew-managed automatically whenever it can be used.','ok');break;}
      case'BOTTOM_OUT':{
        if(sub.bottomed){this.unbottom(sub);break;}
        const sea=this.seabedFeet(sub.position);
        if(sea>=3000){this.notify('Blue water — there is no bottom here to lie on.','warn');break;}
        if(sub.propulsion.speedKnots>1.5){this.notify('Take the way off her first — you do not put a boat on the bottom at speed.','warn');break;}
        this.clearDeckForDive('Bottoming order');
        sub.orderedDepthFeet=Math.round(sea-2);
        this.bottomOut(sub,sea,true);
        break;}
      case'TOGGLE_AA_GUN':
        this.notify('AA is automatic now — the 20 mm crew man the gun only when an air attack gets close, and clear the deck automatically for any dive order.','ok');
        break;
      case'TOGGLE_DECK_GUN':{
        const G=this.state.weapons.deckGun;
        if(G?.manned){this.secureDeckGunAuto();if(this.state.tactical.activeStation==='DECK_GUN')this.state.tactical.activeStation='MAP';break;}
        if(this.tryAutoManDeckGun()) this.state.tactical.activeStation='DECK_GUN';
        break;}
      case'ADJUST_DECK_GUN':{
        const G=this.state.weapons.deckGun;
        G.trainDeg=clamp((G.trainDeg||0)+(cmd.deltaTrainDeg||0),-140,140);
        G.elevationDeg=clamp((G.elevationDeg||0)+(cmd.deltaElevDeg||0),0,22);
        break;}
      case'LAY_DECK_GUN': this.layDeckGun(); break;
      case'FIRE_DECK_GUN': this.fireDeckGun(); break;
      case'TOGGLE_SILENT_RUNNING': sub.stealth.silentRunning=!sub.stealth.silentRunning; this.log(sub.stealth.silentRunning?'Silent running ENABLED.':'Silent running disabled.'); break;
      case'EMERGENCY_BLOW': sub.orderedDepthFeet=0; sub.mode='EMERGENCY_SURFACING'; sub.ballastState='EMERGENCY_BLOW';
        sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.55,0,1.5);
        this.alertEscorts('EMERGENCY_BLOW',{...sub.position},0.72); this.log('Emergency blow! High noise signature.','bad'); audio.playSurface(); break;
      case'TOGGLE_DAMAGE_CONTROL':
        this.notify('Damage control is automatic — repair parties deploy whenever there is repairable damage.','ok'); break;
      case'TOGGLE_PUMPS': sub.damage.pumpActive=!sub.damage.pumpActive;
        this.log(sub.damage.pumpActive?'Pumps running — noise increases.':'Pumps stopped.'); break;
      case'START_TRANSIT':{
        const t=this.state.time;
        if(sub.mode==='SUNK') break;
        /* seconds:0 means "no clock" — she runs on until something actually
           happens. The old eight-hour ceiling was arbitrary; a patrol can
           spend a day and a half getting to its billet and there is nothing
           to be gained by making the player press the button four times. */
        t.transitOpen=!cmd.seconds;
        t.transitUntil=cmd.seconds?t.elapsedSeconds+cmd.seconds:Infinity;
        t.transitFrom=t.elapsedSeconds;
        t.transitReason=null;
        this.snapshotWatch();
        this.log(`Transit — running ahead up to ${Math.round((cmd.seconds||3600)/60)} minutes. Any contact stops her.`,'warn');
        break;}
      case'STOP_TRANSIT':{
        const t=this.state.time;
        if(t.transitUntil){t.transitUntil=0;t.transitOpen=false;this.log('Transit ended.','warn');}
        break;}
      case'SET_TIME_SCALE':{
        const v=[0,1,8,16,32].includes(+cmd.scale)?+cmd.scale:1;
        this.state.time.timeScale=v;
        this.log(v===0?'Simulation paused.':`Time scale: ${v}x.`);break;}
      case'CYCLE_TIME_SCALE':{
        const opts=[0,1,8,16,32]; const i=opts.indexOf(this.state.time.timeScale);
        this.state.time.timeScale=opts[(i+1)%opts.length];
        this.log(this.state.time.timeScale===0?'Simulation paused.':`Time scale: ${this.state.time.timeScale}x.`); break;}
      case'SET_ACTIVE_STATION':{
        if(cmd.station==='DECK_GUN'){
          if(this.tryAutoManDeckGun()) this.state.tactical.activeStation='DECK_GUN';
          break;
        }
        if(this.state.tactical.activeStation==='DECK_GUN') this.secureDeckGunAuto();
        this.state.tactical.activeStation=cmd.station;
        if(cmd.station==='PERISCOPE') this.state.tactical.periscopeBearing=sub.heading;
        break;}
      case'ROTATE_PERISCOPE': this.state.tactical.periscopeBearing=normDeg(this.state.tactical.periscopeBearing+cmd.deltaDeg); break;
      case'TOGGLE_PERISCOPE_ZOOM': this.state.tactical.periscopeZoom=this.state.tactical.periscopeZoom===1?2.5:1; break;
      case'PERISCOPE_SELECT_CENTER_CONTACT': this.selectScopeContact(); break;
      case'SELECT_TRACK':{
        const tr=this.state.world.contactTracks[cmd.trackId];
        if(tr&&tr.sunk){this.log(`${tr.id} is already on the bottom.`,'warn');break;}
        if(tr){this.state.tactical.selectedTrackId=tr.id;this.state.tdc.targetId=tr.id;
          this.updateTdc();this.log(`Selected ${tr.id} for TDC tracking.`);}
        else this.log('Track lost.','warn');
        break;}
      case'TDC_SEND_SCOPE_OBSERVATION': this.sendScopeToTdc(); break;
      case'FLOOD_TUBE': this.floodTube(cmd.tubeId); break;
      case'FIRE_TORPEDO': this.fireTorpedo(cmd.tubeId); break;
      case'FLOOD_ALL_TUBES': for(const t of this.state.weapons.tubes) this.floodTube(t.id,false); this.log('All tubes flooded and ready.'); break;
      case'FIRE_READY_SPREAD': this.fireSpread(); break;
      case'SET_TORPEDO_TYPE':{
        const spec=TORPEDO_SPECS[cmd.specKey];
        if(!spec) break;
        this.state.tdc.torpedoSpecKey=cmd.specKey;
        this.state.tdc.torpedoType=spec.name;
        this.state.tdc.torpedoSpeedKnots=spec.speedKnots;
        this.state.tdc.torpedoMaxRangeNm=spec.maxRangeNm;
        // Update all loaded tubes
        for(const t of this.state.weapons.tubes) if(t.status==='LOADED_DRY') t.specKey=cmd.specKey;
        this.log(`Torpedo loaded: ${spec.name}. Speed ${spec.speedKnots}kn, range ${spec.maxRangeNm}nm. Dud risk: ${Math.round(spec.dudChanceBase*100*DUD_MODES[this.state.tdc.dudMode])}%`);
        this.updateTdc(); break;}
      case'SET_DUD_MODE': this.state.tdc.dudMode=cmd.mode; this.log(`Dud mode: ${cmd.mode}.`); break;
      case'SET_TORPEDO_DEPTH':
        this.state.tdc.torpedoRunDepthFt=clamp(cmd.depthFt,5,45);
        this.log(`Torpedo run depth: ${this.state.tdc.torpedoRunDepthFt} ft.`); break;
      case'SET_TDC_MANUAL':
        this.state.tdc.manualBearing=cmd.bearing??this.state.tdc.manualBearing;
        this.state.tdc.manualRange=cmd.range??this.state.tdc.manualRange;
        this.state.tdc.manualCourse=cmd.course??this.state.tdc.manualCourse;
        this.state.tdc.manualSpeed=cmd.speed??this.state.tdc.manualSpeed; break;
      case'APPLY_TDC_MANUAL':{
        const tdc=this.state.tdc;
        tdc.bearing=tdc.manualBearing; tdc.rangeNm=tdc.manualRange;
        tdc.targetCourse=tdc.manualCourse; tdc.targetSpeedKnots=tdc.manualSpeed;
        if(!tdc.targetId) tdc.targetId='MANUAL';
        this.updateTdc();
        this.log(`TDC manual: B${fmtDeg(tdc.bearing)} R${tdc.rangeNm.toFixed(1)}nm C${fmtDeg(tdc.targetCourse)} S${tdc.targetSpeedKnots}kn → ${tdc.status} sol${Math.round(tdc.solutionQuality*100)}%`);
        break;}
      case'FLOOD_AFT_TUBES':
        for(const t of this.state.weapons.tubes.filter(t=>t.pos==='AFT')) this.floodTube(t.id,false);
        this.log('Aft tubes flooded.'); break;
      case'FIRE_AFT_SPREAD': this.fireSpreadByPos('AFT'); break;
      case'MAP_ADD_WAYPOINT':
        this.state.map.plottedCourse.push({xNm:cmd.xNm,yNm:cmd.yNm});
        this.state.map.autoFollowPlot=true;
        this.log(`Waypoint ${this.state.map.plottedCourse.length} plotted.`);
        break;
      case'MAP_REMOVE_WAYPOINT':{
        const plot=this.state.map.plottedCourse;
        const i=cmd.index;
        if(i>=0&&i<plot.length){
          plot.splice(i,1);
          this.log(`Waypoint ${i+1} removed. ${plot.length} left.`);
          if(!plot.length) this.state.map.autoFollowPlot=false;
        }
        break;}
      case'TOGGLE_AUTOPILOT':
        this.state.map.autoFollowPlot=!this.state.map.autoFollowPlot;
        this.log(this.state.map.autoFollowPlot?'Autopilot engaged — following the plot.':'Autopilot off — manual helm.','warn');
        if(this.state.map.autoFollowPlot) this.steerWaypoint(true);
        break;
      case'MAP_CLEAR_PLOT':
        this.state.map.plottedCourse=[];this.state.map.autoFollowPlot=false;
        this.log('Map plot cleared — manual helm.');break;
      case'MAP_STEER_TO_NEXT_WAYPOINT': this.state.map.autoFollowPlot=true; this.steerWaypoint(true); break;
      case'HEAD_TO_PORT': this.headToPort(); break;
      case'NEW_PATROL': this.startNewPatrol(cmd.areaKey); break;
    }
  }

  // ── TERRAIN / SHALLOW WATER ──
  pointInPolygon(pt,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i].xNm,yi=poly[i].yNm,xj=poly[j].xNm,yj=poly[j].yNm;
      if((yi>pt.yNm)!==(yj>pt.yNm)&&pt.xNm<(xj-xi)*(pt.yNm-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  }

  checkTerrainCollision(sub){
    const pos=sub.position;
    let inShallow=false,collision=false;
    for(const feat of this.state.world.terrain){
      if(!feat.points||feat.points.length<3) continue;
      if(this.pointInPolygon(pos,feat.points)){
        if(feat.type==='ISLAND'||feat.type==='COAST'){collision=true;break;}
        if(feat.type==='REEF'||feat.depth==='SHALLOW') inShallow=true;
      }
    }
    return{collision,inShallow};
  }

  /* ══ THE BOTTOM ═══════════════════════════════════════════════════════
     Until now the sea floor was a colour on the chart. The boat could dive
     to three hundred feet in ninety feet of water and nothing happened.
     Now the depth under the keel is read from the same grid the chart is
     drawn from, and it governs three things: how deep she is ALLOWED to go,
     what happens when she touches, and whether she can be laid on the
     bottom and shut down.

     Keel clearance of 25 ft is what a careful officer of the deck kept.
     Below that the fathometer is the only thing between you and a very
     expensive noise. */
  seabedFeet(pos){
    Bathy.ensure(this.state.world.terrain);
    return Bathy.feet(pos.xNm,pos.yNm);
  }

  /* ══ SHOAL WATCH ══════════════════════════════════════════════════════
     Running the clock forward is the player saying "nothing is happening";
     it is not the player saying "drive her aground". A skipper with the
     fathometer running does not need to be told to slow down when the bottom
     comes up, and neither should the game. Whenever time is compressed at
     all — a transit OR any scale above 1× — genuinely dangerous or rapidly
     shoaling water hands the conn back at real time. Only immediate grounding
     danger takes the way off her; ordinary coastal shallows do not. */
  shoalWatch(sub){
    const t=this.state.time;
    const compressed=!!t.transitUntil||(t.timeScale||1)>1;
    if(!compressed||sub.mode==='SUNK'||sub.bottomed) return;
    const clr=sub.keelClearanceFeet??3000;
    const surfaced=sub.depthFeet<12;                    // effectively on the roof / awash
    const closing=Math.max(0,sub._keelClosingFps||0);  // ft of clearance lost per ship-second

    /* Shallow water is not itself an emergency. A surfaced fleet boat can
       legitimately con through twenty-something feet of water. Compression is
       surrendered only when the margin gets genuinely tight, or the bottom is
       rising quickly under a submerged boat. */
    const handConnAt=surfaced?18:45;
    const trendDanger=!surfaced&&clr<70&&closing>1.2;
    if(clr>=handConnAt&&!trendDanger) return;
    const now=t.elapsedSeconds;
    if(now-(this._shoalAt||-99)<20) return;
    this._shoalAt=now;
    t.transitUntil=0;t.transitOpen=false;t.timeScale=1;

    const hard=surfaced?10:18;
    if(clr<hard){
      t.stopReason='dangerously little water under the keel';t.stopReasonAt=now;
      sub.propulsion.orderedRpm=0;
      this.notify(`ALL STOP — only ${Math.max(0,clr).toFixed(0)} ft under the keel. Clock back to real time; con her clear by hand.`,'bad');
    }else{
      t.stopReason='shoaling water — take the conn';t.stopReasonAt=now;
      if(!surfaced&&sub.orderedDepthFeet>Math.max(0,(sub.seabedFeet??3000)-60))
        sub.orderedDepthFeet=Math.max(0,Math.round((sub.seabedFeet??3000)-60));
      this.notify(`SHOALING WATER — ${Math.max(0,clr).toFixed(0)} ft under the keel. Clock back to real time; you still have way on the boat.`,'warn');
    }
  }

  updateSeabed(sub,dt){
    const sea=this.seabedFeet(sub.position);
    sub.seabedFeet=sea;
    sub.bottomType=Bathy.bottomType(sub.position.xNm,sub.position.yNm);
    const prevClr=sub.keelClearanceFeet??(sea-sub.depthFeet);
    sub.keelClearanceFeet=sea-sub.depthFeet;
    sub._keelClosingFps=dt>0?(prevClr-sub.keelClearanceFeet)/dt:0;
    const safe=Math.max(0,sea-25);

    // an order that would put her into the mud is trimmed, and said aloud
    if(!sub.bottomed&&sub.orderedDepthFeet>safe&&sea<3000){
      sub.orderedDepthFeet=Math.round(safe);
      const now=this.state.time.elapsedSeconds;
      if(now-(this._depthLimAt||-99)>8){
        this._depthLimAt=now;
        this.notify(`Fathometer reads ${sea.toFixed(0)} ft under the keel line — depth restricted to ${Math.round(safe)} ft.`,'warn');
      }
    }

    /* Touching. How badly depends almost entirely on how fast she was
       going: a boat easing onto sand at one knot settles; the same boat at
       twelve knots opens her forward trim tank on the coral. */
    if(sub.depthFeet>=sea-2&&sea<3000&&!sub.bottomed){
      const spd=sub.propulsion.speedKnots;
      const hard=(sub.bottomType==='CORAL'||sub.bottomType==='ROCK')?2.0:1.0;
      if(spd>1.2||hard>1.5){
        const dmg=clamp((0.8+spd*1.5)*hard,1,45);
        sub.depthFeet=Math.max(0,sea-3);
        sub.verticalSpeedFps=0;
        sub.propulsion.speedKnots*=0.25;
        this.applyShock(dmg);
        sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.7,0,1.5);
        this.alertEscorts('NOISE',{...sub.position},0.8);
        this.notify(`SHE IS ON THE BOTTOM — ${sub.bottomType.toLowerCase()} at ${sea.toFixed(0)} ft, ${spd.toFixed(1)} kn. Hull damage ${dmg.toFixed(0)}%. Every escort in the sea heard that.`,'bad');
      }else{
        this.bottomOut(sub,sea,false);
      }
    }
    if(sub.bottomed) this.updateBottomed(sub,dt,sea);
    this.shoalWatch(sub);
  }

  /* ══ LYING ON THE BOTTOM ══════════════════════════════════════════════
     The oldest trick in shallow water: stop everything, let her settle, and
     become part of the sea floor. A stopped boat on the bottom makes no
     screw noise, no plane noise, and gives an echo-ranging set nothing to
     separate from the bottom return — which is why it worked. It is also a
     confession that you have run out of other ideas: you cannot see, you
     cannot shoot, and if they do find you there is nowhere left to go.

     Sand and mud only. Coral and rock tear the tanks. And soft mud takes
     hold: the longer she sits the more of her buoyancy the suction eats,
     and blowing free is loud. */
  bottomOut(sub,sea,ordered){
    if(sub.bottomed) return;
    Bathy.ensure(this.state.world.terrain);
    const kind=Bathy.bottomType(sub.position.xNm,sub.position.yNm);
    sub.bottomType=kind;
    if(!Bathy.restable(kind)){
      this.notify(`Bottom here is ${kind.toLowerCase()} — she cannot be laid on that without opening her tanks.`,'warn');
      return;
    }
    if(sea>210){
      this.notify(`${sea.toFixed(0)} ft of water — too deep to bottom her with any margin.`,'warn');
      return;
    }
    sub.bottomed=true;
    sub.bottomedAt=this.state.time.elapsedSeconds;
    sub.bottomType=kind;
    sub.suction=0;
    sub.depthFeet=sea-2;
    sub.verticalSpeedFps=0;
    sub.propulsion.orderedRpm=0;
    sub.orderedDepthFeet=Math.round(sea-2);
    this.notify(`ON THE BOTTOM — ${sea.toFixed(0)} ft, ${kind.toLowerCase()}. All stop, everything shut down. She is part of the sea floor now.`,'ok');
  }

  updateBottomed(sub,dt,sea){
    // she stays put
    sub.propulsion.speedKnots=0; sub.propulsion.actualRpm=0;
    sub.verticalSpeedFps=0; sub.depthFeet=sea-2;
    /* Suction. Mud takes hold of a hull that sits in it; sand barely does.
       Past about a third she needs a hard blow to break free, and that is
       a noise every set within miles will hear. */
    const grip=sub.bottomType==='MUD'?1:0.28;
    sub.suction=clamp((sub.suction||0)+dt/900*grip,0,1);
    if(sub.suction>0.34&&!sub._suctWarn){
      sub._suctWarn=true;
      this.notify('She is settling into the mud. Breaking free now will take a blow — and a blow can be heard.','warn');
    }
    // the order to get up again
    if(sub.propulsion.orderedRpm>0||sub.orderedDepthFeet<sea-30||sub.mode==='EMERGENCY_SURFACING'){
      this.unbottom(sub);
    }
  }

  unbottom(sub){
    if(!sub.bottomed) return;
    const s=sub.suction||0;
    sub.bottomed=false; sub._suctWarn=false;
    if(s>0.34){
      this.notify('Blowing her off the bottom — she comes free with a rush of air. That was heard.','bad');
      sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.55+s*0.5,0,1.5);
      this.alertEscorts('NOISE',{...sub.position},0.55+s*0.4);
    }else{
      this.notify('Off the bottom, quietly. Planes and screws answering again.','ok');
    }
    sub.suction=0;
    sub.orderedDepthFeet=Math.min(sub.orderedDepthFeet,Math.max(0,sub.seabedFeet-40));
  }

  applyTerrainEffects(sub,dt){
    const {collision,inShallow}=this.checkTerrainCollision(sub);
    sub.inShallowWater=inShallow;
    sub.groundingRisk=collision;
    this.updateSeabed(sub,dt);

    if(collision){
      // Push back and damage
      const backRad=degToRad(normDeg(sub.heading+180));
      sub.position.xNm+=Math.sin(backRad)*0.02;
      sub.position.yNm-=Math.cos(backRad)*0.02;
      sub.propulsion.speedKnots*=0.1;
      if(sub.depthFeet>10){
        const dmg=8+Math.random()*12;
        this.applyShock(dmg);
        this.log(`GROUNDING — hull impact! Damage ${dmg.toFixed(0)}%.`,'bad');
      } else {
        const dmg=2+Math.random()*4;
        this.applyShock(dmg);
        this.log('Keel contact with terrain.','warn');
      }
    }

    if(inShallow){
      sub.groundingRisk=true;
      // (depth is no longer capped by a flat 80 ft rule — updateSeabed reads
      //  the actual water under her and trims the order to fit)
      // Increased acoustic risk
      sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.05,0,1.5);
      if(!sub.inShallowWarned){
        sub.inShallowWarned=true;
        this.log('Entered shallow water — reduced depth capability, higher noise.','warn');
      }
    } else {
      sub.inShallowWarned=false;
    }
  }

  // ── CAMPAIGN ──
  friendlyPortApproach(port){
    if(!port) return null;
    const camp=this.state.campaign;
    if(camp.portApproach&&camp.portApproach.portName===port.name) return camp.portApproach;
    Bathy.ensure(this.state.world.terrain);

    const candidates=[];
    const sample=(requireDeep,allowShallow)=>{
      for(let r=0.12;r<=2.4;r+=0.12){
        for(let a=0;a<360;a+=12){
          const q={xNm:port.pos.xNm+Math.sin(degToRad(a))*r,
                   yNm:port.pos.yNm-Math.cos(degToRad(a))*r};
          const sea=this.seabedFeet(q);
          const terr=this.checkTerrainCollision({position:q});
          if(terr.collision||(!allowShallow&&terr.inShallow)||sea<requireDeep) continue;
          candidates.push({pos:q,seabedFeet:sea,r,score:r+Math.abs(Math.min(sea,220)-150)*0.0008});
        }
        if(candidates.length) break;
      }
    };
    sample(100,false);               // first choice: proper open-water rendezvous
    if(!candidates.length) sample(70,true);
    if(!candidates.length) sample(35,true);

    let best=candidates.sort((a,b)=>a.score-b.score)[0];
    if(!best){
      /* Extreme fallback for an awkward synthetic coastline: keep searching
         farther out and remember the deepest navigable water we can find.
         The geographic port symbol may sit on land; the autopilot never should. */
      let deepest=null;
      for(let r=2.5;r<=5.0;r+=0.25){
        for(let a=0;a<360;a+=15){
          const q={xNm:port.pos.xNm+Math.sin(degToRad(a))*r,
                   yNm:port.pos.yNm-Math.cos(degToRad(a))*r};
          const sea=this.seabedFeet(q),terr=this.checkTerrainCollision({position:q});
          if(terr.collision||sea<8) continue;
          const cand={pos:q,seabedFeet:sea,r,score:r};
          if(!deepest||sea>deepest.seabedFeet) deepest=cand;
          if(sea>=35){best=cand;break;}
        }
        if(best) break;
      }
      best=best||deepest;
    }
    if(!best){
      /* Should only be possible with corrupt terrain. Leave no automatic plot
         rather than silently steering the boat onto a land-valued port cell. */
      this.notify(`${port.name}: no safe-water rendezvous could be charted. Take the conn and approach manually.`,'bad');
      camp.portApproach={portName:port.name,pos:{...this.state.playerSub.position},seabedFeet:this.seabedFeet(this.state.playerSub.position),unavailable:true};
      return camp.portApproach;
    }
    camp.portApproach={portName:port.name,pos:{...best.pos},seabedFeet:best.seabedFeet};
    return camp.portApproach;
  }

  friendlyPortNav(){
    const fp=this.state.campaign.friendlyPort;
    if(!fp) return null;
    const ap=this.friendlyPortApproach(fp);
    const sub=this.state.playerSub;
    return{port:fp,approach:ap,
      portRangeNm:distNm(sub.position,fp.pos),
      rngNm:distNm(sub.position,ap.pos),
      brg:bearingBetween(sub.position,ap.pos)};
  }

  headToPort(){
    const r=this.friendlyPortNav();
    if(!r){this.log('No friendly port in this area.','warn');return;}
    this.state.map.plottedCourse=[{...r.approach.pos,navKind:'FRIENDLY_APPROACH',portName:r.port.name}];
    this.state.map.autoFollowPlot=true;
    this.state.campaign._headingHome=true;
    this.steerWaypoint(true);
    this.notify(`Course set for ${r.port.name} rendezvous — ${r.rngNm.toFixed(1)} nm on ${fmtDeg(r.brg)}. The marker is in safe water; compressed time will hand the conn back near the approach.`,'warn');
  }

  nearestFriendlyPort(){
    const sub=this.state.playerSub;
    let best=null;
    for(const port of this.state.world.ports||[]){
      if(port.side!=='FRIENDLY') continue;
      const rngNm=distNm(sub.position,port.pos);
      if(!best||rngNm<best.rngNm) best={port,rngNm,brg:bearingBetween(sub.position,port.pos)};
    }
    return best;
  }

  /* The green port symbol is geography; the rendezvous marker is seamanship.
     We steer to the latter, in surveyed water. 1.5 nm is the approach station,
     not "alongside". The transfer only starts when the boat is genuinely
     close, surfaced and slow. */
  checkPortArrival(dt){
    const sub=this.state.playerSub,camp=this.state.campaign;
    if(camp.missionStatus!=='RETURN TO BASE'&&camp.missionStatus!=='PATROL'){
      camp.alongside=0;return;
    }
    const r=this.friendlyPortNav();
    const ALONGSIDE_SEC=180,APPROACH_NM=1.5,CLOSE_NM=0.30,SLOW_KN=3.0;
    if(!r){camp.alongside=0;return;}
    camp.portRangeNm=r.rngNm;

    if(r.rngNm<4&&r.rngNm>APPROACH_NM&&!camp._rvSeen){
      camp._rvSeen=true;
      this.notify(`${r.port.name.toUpperCase()} IN SIGHT — ${r.rngNm.toFixed(1)} nm to the rendezvous. Continue to the green approach ring.`,'warn');
    }
    if(r.rngNm<=APPROACH_NM&&!camp._approachReached){
      camp._approachReached=true;
      if((this.state.time.timeScale||1)>1||this.state.time.transitUntil){
        this.state.time.timeScale=1;this.state.time.transitUntil=0;this.state.time.transitOpen=false;
        this.state.time.stopReason='friendly port approach';this.state.time.stopReasonAt=this.state.time.elapsedSeconds;
      }
      this.notify(`${r.port.name.toUpperCase()} — APPROACH STATION. Surface, slow below ${SLOW_KN.toFixed(0)} kn and bring her inside 0.3 nm of the green rendezvous marker.`,'warn');
    }
    if(r.rngNm>APPROACH_NM*1.25) camp._approachReached=false;
    if(r.rngNm>4.5) camp._rvSeen=false;

    const surfaced=sub.depthFeet<8,slow=sub.propulsion.speedKnots<=SLOW_KN,close=r.rngNm<=CLOSE_NM;
    if(!close||!surfaced||!slow||sub.mode==='SUNK'){
      if((camp.alongside||0)>0.5){
        const why=!close?'she has drawn off':!surfaced?'she has gone under':'she is making too much way';
        this.notify(`Lost the ${r.port.name} rendezvous — ${why}. Transfer stopped.`,'warn');
      }
      camp.alongside=0;
      return;
    }

    const was=camp.alongside||0;
    camp.alongside=was+dt;
    if(was<=0){
      this.notify(`${r.port.name.toUpperCase()} — ALONGSIDE. Hoses across; fuel and torpedoes coming aboard. Hold position.`,'ok');
      audio.playWaypoint();
    }else for(const mark of [60,120]) if(was<mark&&camp.alongside>=mark)
      this.notify(`${r.port.name} transfer ${Math.round(camp.alongside/ALONGSIDE_SEC*100)}% — hold her here.`,'ok');
    if(camp.alongside>=ALONGSIDE_SEC){camp.alongside=0;this.completeMission(r.port.name);}
  }

  completeMission(portName){
    const camp=this.state.campaign;
    const W=this.state.weapons;
    camp.missionStatus='COMPLETED';
    if(camp.objectives[3]) camp.objectives[3].done=true;
    // Score bonus for fuel/torps remaining, hull condition
    const sub=this.state.playerSub;
    const fuelBonus=Math.floor(sub.propulsion.fuel*8);
    const hullBonus=Math.floor(sub.damage.hullIntegrity*5);
    const torpBonus=(W.torpedoInventory)*50;
    const bonus=fuelBonus+hullBonus+torpBonus;
    camp.score+=bonus;
    const patrolScore=camp.score;
    camp.totalScore+=patrolScore;
    camp.score=0;                       // banked — startNewPatrol would count it twice
    this.notify(`PATROL COMPLETE at ${portName} — bonus +${bonus} points for fuel, hull and torpedoes remaining. Patrol score ${patrolScore}, career ${camp.totalScore}.`,'ok');
    Toast.show(`PATROL COMPLETE — ${portName.toUpperCase()} · rearmed and refuelled`,'ok',5200,true);
    this.log(`Patrol score: ${patrolScore} | Career total: ${camp.totalScore}`,'warn');
    audio.playMissionComplete();
    SaveSystem.updateCareer(camp);
    // Rearm and refuel
    sub.propulsion.fuel=100; sub.propulsion.battery=100;sub.propulsion.chargeRate=0;sub.cannotHoldDepth=false;sub._nhdWarned=false;
    W.torpedoInventory=16;
    for(const t of W.tubes){t.status='LOADED_DRY';t.reloadProgress=1;}
    sub.damage.hullIntegrity=clamp(sub.damage.hullIntegrity+25,0,100);
    sub.damage.flooding=0;
    camp.patrolNumber++;
    setTimeout(()=>this.log(`Rearmed and refueled. Ready for patrol #${camp.patrolNumber}.`)  ,3000);
  }

  startNewPatrol(areaKey){
    const keys=Object.keys(PATROL_AREAS);
    const key=areaKey||keys[Math.floor(Math.random()*keys.length)];
    const area=PATROL_AREAS[key];
    const s=this.state;
    const prevTotal=s.campaign.totalScore+(s.campaign.score||0);
    const prevPatrol=s.campaign.patrolNumber||1;
    // Reset world
    s.world.contacts=[]; s.world.contactTracks={}; s.world.depthCharges=[];
    s.world.collisionEvents=[];s.world.lastCollision=null;s.world._collisionCooldowns={};
    s.weapons.activeTorpedoes=[]; s.weapons.explosions=[]; s.weapons.hits=[];
    s.world.enemy={alertState:'UNAWARE',alertTimerSec:0,lastKnownSubPosition:null,lastKnownConfidence:0,
      searchPattern:'RANDOM',searchCenter:{xNm:0,yNm:0},searchAngle:0};
    s.world.terrain=area.terrain; s.world.ports=area.ports;
    s.world.convoyRoutes=area.convoyRoutes;
    s.world.shallowZones=area.terrain.filter(t=>t.depth==='SHALLOW'||t.type==='REEF');
    s.world.environment={...area.environment};
    s.map.plottedCourse=[]; s.map.exploredCells={}; s.map.ownshipTrail=[];
    // A fresh patrol always gets a fresh chart origin.  The renderer consumes
    // this sequence once, so a map that was panned/free on the previous patrol
    // cannot strand the new boat off-screen.  Undefined in old saves is fine.
    s.map.recenterSeq=(s.map.recenterSeq||0)+1;
    s.tactical.selectedTrackId=null; s.tdc.targetId=null; s.tdc.solutionQuality=0;
    s.campaign={
      patrolArea:key,score:0,scenarioSeed:Math.floor(Math.random()*9999),
      missionStatus:'PATROL',patrolNumber:prevPatrol+1,totalScore:prevTotal,
      objectives:[
        {text:'Locate enemy convoy',done:false},{text:'Attack merchant shipping',done:false},
        {text:'Evade escort vessels',done:false},{text:'Return to friendly port',done:false}
      ],
      optionalObjectives:[],
      friendlyPort:area.ports.find(p=>p.side==='FRIENDLY'),
      tonnageSunk:0,escortsSunk:0,patrolDuration:0,alongside:0,_rvSeen:false,_approachReached:false,portApproach:null,portRangeNm:null
    };
    // fresh boat for a fresh patrol — otherwise you inherit a wrecked, empty
    // (or sunk) submarine from the previous one
    const sub=s.playerSub;
    sub.position=area.start?{...area.start}:{xNm:0,yNm:0};
    sub.mode='SURFACED';sub.heading=90;sub.orderedHeading=90;sub.rudder=0;
    sub.depthFeet=0;sub.orderedDepthFeet=0;sub.verticalSpeedFps=0;sub.ballastState='NEUTRAL';
    sub.propulsion.orderedRpm=250;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;
    sub.propulsion.fuel=100;sub.propulsion.battery=100;sub.propulsion.engineMode='DIESEL';sub.propulsion.chargeRate=0;sub.cannotHoldDepth=false;sub._nhdWarned=false;
    sub.stealth.silentRunning=false;sub.stealth.acousticSignature=0;
    Object.assign(sub.damage,{hullIntegrity:100,flooding:0,ballastDamage:0,motorDamage:0,
      rudderDamage:0,periscopeDamage:0,crewFatigue:0,oxygen:100,
      pumpActive:false,damageControlActive:false,warnings:[]});
    sub.inShallowWater=false;sub.groundingRisk=false;sub.inShallowWarned=false;
    sub.bottomed=false;sub.suction=0;sub._suctWarn=false;sub.seabedFeet=3000;sub.bottomType='DEEP';
    s.weapons.torpedoInventory=16;s.weapons.duds=[];s.weapons.nextTorpedoId=1;
    s.weapons.deckGun={manned:false,ammo:120,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1};
    for(const t of s.weapons.tubes){t.status='LOADED_DRY';t.flooded=false;t.reloadProgress=1;t.specKey=s.tdc.torpedoSpecKey;}
    s.tactical.periscopeBearing=90;s.tactical.periscopeZoom=1;
    s.world.aircraft=[];s.world.knuckles=[];
    s.world.airThreat={level:area.environment.airThreat===undefined?0.55:area.environment.airThreat,
      alarmedAt:-999,sdOn:true,nextCheck:120};
    s.world.radio={pending:null,inbox:[],unread:0,nextBroadcast:300,copying:0};
    s.world.contacts=this.makeConvoy(area);
    s.world.harbor=null;s.world.harborInitialized=false;s.world.harborIntel=null;
    this.setupHarbor(key);
    this.log(`=== PATROL #${prevPatrol+1} — ${key} ===`,'warn');
    this.log(`${area.description}`);
    showBriefing(key,s);
  }

  /* Nothing may be plotted outside the charted box — an ULTRA fix or a
     contact drawn out in the blank was the clearest way of telling a player
     to go somewhere that does not exist. */
  clampToArea(pos){
    const A=this.areaBounds(); if(!A) return pos;
    return {xNm:clamp(pos.xNm,A.x0+1,A.x1-1),yNm:clamp(pos.yNm,A.y0+1,A.y1-1)};
  }

  /* Build a shipping lane through water, once per patrol area. The bathymetry
     grid is already available for depth/grounding, so use that same truth for
     traffic. A* is paid once; ships then follow the resulting light polyline. */
  ensureWaterRoute(route){
    if(!route) return[];
    if(route.waterPath&&route.waterPath.length>1) return route.waterPath;
    const B=Bathy.ensure(this.state.world.terrain);
    if(!B){route.waterPath=[{...route.from},{...route.to}];return route.waterPath;}
    const {grid,nx,ny,x0,y0,cell}=B;
    const valid=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&grid[j*nx+i]>=5; // >=30 ft
    const nearest=(p)=>{
      const ci=Math.round((p.xNm-x0)/cell),cj=Math.round((p.yNm-y0)/cell);
      if(valid(ci,cj))return[ci,cj];
      for(let r=1;r<12;r++) for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){
        if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;
        if(valid(ci+di,cj+dj))return[ci+di,cj+dj];
      }
      return null;
    };
    const S=nearest(route.from),G=nearest(route.to);
    if(!S||!G){route.waterPath=[{...route.from},{...route.to}];return route.waterPath;}
    const N=nx*ny,INF=1e30,g=new Float64Array(N),parent=new Int32Array(N),closed=new Uint8Array(N);
    g.fill(INF);parent.fill(-1);
    const idx=(i,j)=>j*nx+i, gi=idx(G[0],G[1]), si=idx(S[0],S[1]);g[si]=0;
    const heap=[];
    const push=(node,f)=>{heap.push([f,node]);let k=heap.length-1;while(k){const p=(k-1)>>1;if(heap[p][0]<=f)break;heap[k]=heap[p];k=p;}heap[k]=[f,node];};
    const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length&&last){let k=0;while(true){let l=k*2+1,r=l+1;if(l>=heap.length)break;let c=r<heap.length&&heap[r][0]<heap[l][0]?r:l;if(heap[c][0]>=last[0])break;heap[k]=heap[c];k=c;}heap[k]=last;}return root;};
    const h=(i,j)=>Math.hypot(i-G[0],j-G[1]);push(si,h(S[0],S[1]));
    const D=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(heap.length){
      const [,u]=pop();if(closed[u])continue;closed[u]=1;if(u===gi)break;
      const ui=u%nx,uj=(u/nx)|0;
      for(const [di,dj] of D){const vi=ui+di,vj=uj+dj;if(!valid(vi,vj))continue;
        if(di&&dj&&(!valid(ui+di,uj)||!valid(ui,uj+dj)))continue; // no corner cutting through land
        const v=idx(vi,vj);if(closed[v])continue;
        const fm=grid[v],shallow=fm<12?(12-fm)*0.18:0;
        let coast=0;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if((xx||yy)&&!valid(vi+xx,vj+yy))coast+=0.20;
        const step=(di&&dj?1.41421356:1)*(1+shallow+coast),ng=g[u]+step;
        if(ng<g[v]){g[v]=ng;parent[v]=u;push(v,ng+h(vi,vj));}
      }
    }
    if(parent[gi]<0&&gi!==si){route.waterPath=[{...route.from},{...route.to}];return route.waterPath;}
    const raw=[];let u=gi;raw.push(u);while(u!==si&&u>=0){u=parent[u];if(u>=0)raw.push(u);}raw.reverse();
    let pts=raw.map(k=>({xNm:x0+(k%nx)*cell,yNm:y0+((k/nx)|0)*cell}));
    const waterLine=(a,b)=>{const L=distNm(a,b),n=Math.max(1,Math.ceil(L/Math.max(.25,cell*.20)));for(let q=0;q<=n;q++){const t=q/n;if(Bathy.feet(lerp(a.xNm,b.xNm,t),lerp(a.yNm,b.yNm,t))<30)return false;}return true;};
    if(Bathy.feet(route.from.xNm,route.from.yNm)>=30&&waterLine(route.from,pts[0]))pts[0]={...route.from};
    if(Bathy.feet(route.to.xNm,route.to.yNm)>=30&&waterLine(pts[pts.length-1],route.to))pts[pts.length-1]={...route.to};
    // Line-of-sight simplification removes A* stair-steps but never replaces a
    // water bend by a chord that cuts across an island.
    const simple=[];let i=0;simple.push(pts[0]);
    while(i<pts.length-1){let j=pts.length-1;while(j>i+1&&!waterLine(pts[i],pts[j]))j--;simple.push(pts[j]);i=j;}
    route.waterPath=simple;return route.waterPath;
  }

  makeConvoy(area){
    const cr=area.convoyRoutes[0];
    const path=this.ensureWaterRoute(cr);
    const spawn=path[0]||cr.from, next=path[1]||cr.to;
    const spd=area.convoySpeedRange[0]+Math.random()*(area.convoySpeedRange[1]-area.convoySpeedRange[0]);
    const count=Math.floor(area.convoyCountRange[0]+Math.random()*(area.convoyCountRange[1]-area.convoyCountRange[0]+1));
    const crs=bearingBetween(spawn,next);
    const crsRad=degToRad(crs);
    const perpRad=degToRad(crs+90);
    const contacts=[];

    // V-formation: lead ship, two columns behind
    const merchantTemplates=[
      {id:'M-01',name:'Merchant Maru',type:'MERCHANT',lengthYards:420,visualProfile:0.95,acousticBase:0.35,tonsFactor:4200},
      {id:'M-02',name:'Tanker',type:'TANKER',lengthYards:520,visualProfile:1.1,acousticBase:0.45,tonsFactor:7800},
      {id:'M-03',name:'Cargo Maru',type:'MERCHANT',lengthYards:380,visualProfile:0.9,acousticBase:0.32,tonsFactor:3800},
      {id:'M-04',name:'Transport',type:'MERCHANT',lengthYards:460,visualProfile:1.0,acousticBase:0.38,tonsFactor:5200},
    ];
    const escortTemplates=[
      {id:'E-01',name:'Escort Destroyer',type:'ESCORT',lengthYards:350,visualProfile:0.75,acousticBase:0.65,tonsFactor:0},
      {id:'E-02',name:'Patrol Vessel',type:'ESCORT',lengthYards:280,visualProfile:0.65,acousticBase:0.55,tonsFactor:0},
    ];

    // Formation offsets: col ahead, then staggered behind, alternating sides
    const formationOffsets=[
      {fwd:0,  side:0},   // lead
      {fwd:-1.2,side:-0.8},{fwd:-1.2,side:0.8},
      {fwd:-2.4,side:-1.6},{fwd:-2.4,side:1.6},
      {fwd:-3.6,side:0},
    ];

    const numMerchants=Math.min(count,merchantTemplates.length);
    for(let i=0;i<numMerchants;i++){
      const off=formationOffsets[i]||{fwd:-i*1.2,side:(i%2===0?-1:1)*(i*0.5)};
      const t=merchantTemplates[i];
      contacts.push({...t,
        position:{
          xNm:spawn.xNm+Math.sin(crsRad)*off.fwd+Math.cos(crsRad)*off.side,
          yNm:spawn.yNm-Math.cos(crsRad)*off.fwd+Math.sin(crsRad)*off.side
        },
        heading:crs+(Math.random()-0.5)*8,
        speedKnots:spd+(Math.random()-0.5)*0.5, baseSpeed:spd,
        convoyRole:'MERCHANT', convoyId:'MAIN', formationIndex:i, formationFwd:off.fwd, formationSide:off.side
      });
    }

    // Escorts: one ahead, one behind, one on each flank
    const escortPositions=[
      {fwd:1.5,side:0},      // vanguard
      {fwd:-0.5,side:-2.5},  // port flank
      {fwd:-0.5,side:2.5},   // starboard flank
      {fwd:-4.0,side:0},     // rear guard
    ];
    const numEscorts=Math.min(2,escortTemplates.length);
    for(let i=0;i<numEscorts;i++){
      const off=escortPositions[i]||{fwd:0,side:0};
      const t=escortTemplates[i];
      contacts.push({...t,
        position:{
          xNm:spawn.xNm+Math.sin(crsRad)*off.fwd+Math.cos(crsRad)*off.side,
          yNm:spawn.yNm-Math.cos(crsRad)*off.fwd+Math.sin(crsRad)*off.side
        },
        heading:crs+(Math.random()-0.5)*5,
        speedKnots:spd+4+(Math.random()-0.5)*1,
        convoyRole:'ESCORT_FWD', convoyId:'MAIN', formationIndex:i,
        zigzagPhase:Math.random()*Math.PI*2, zigzagTimer:0
      });
    }
    return contacts;
  }

}
