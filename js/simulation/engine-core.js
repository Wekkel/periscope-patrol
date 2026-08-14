// ═══════════════════════════════════════════════════ SIMULATION ENGINE
// Exact coast polygons are authoritative for collision, but some patrols carry
// hundreds of polygon vertices. Cache a tiny bounding box per live terrain
// feature so repeated ship/sub collision probes reject almost every feature
// before point-in-polygon. WeakMap keeps this runtime-only: no save bloat and
// old terrain arrays are collectible when a patrol area is replaced.
const _terrainBoundsCache=new WeakMap();
class SimEngineCore{
  constructor(state,bus){this.state=state;this.bus=bus;this._impactTimer=null;this._impactAudioTimer=null;this._impactSeq=0;}

  captureImpactShipState(c){
    if(!c)return null;const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    return{heading:c.heading||0,speedKnots:c.speedKnots||0,shipDamage:clone(c.shipDamage||null),sunk:!!c.sunk,
      sinkingProgress:c.sinkingProgress||0,sinkStyle:c.sinkStyle||0,hitFrac:Number.isFinite(c.hitFrac)?c.hitFrac:0,hitSide:c.hitSide||1};
  }
  impactObservationSnapshot(c,meta={}){
    if(!c?.position)return null;const sub=this.state.playerSub;
    const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    const T=this.state.tactical,originStation=T.activeStation,targetPosition=meta.targetPosition||c.position;
    const targetHeading=Number.isFinite(meta.targetHeading)?normDeg(meta.targetHeading):(c.heading||0);
    const targetBearing=bearingBetween(sub.position,targetPosition);
    const viewBearing=originStation==='PERISCOPE'?(T.periscopeBearing??targetBearing):originStation==='BRIDGE'?(T.bridgeBearing??targetBearing):targetBearing;
    const originFov=originStation==='PERISCOPE'
      ?((typeof SCOPE_OPTICS!=='undefined'?SCOPE_OPTICS[T.periscopeZoom===1?0:1]?.fov:null)||(T.periscopeZoom===1?32:8))
      :(originStation==='BRIDGE'&&typeof bridgeFovDeg==='function'?bridgeFovDeg(this.state):82);
    return{
      token:++this._impactSeq,contactId:c.id,name:c.name||c.id,type:c.type,displayType:c.displayType||c.type,
      lengthYards:c.lengthYards,tonsFactor:c.tonsFactor||0,heading:targetHeading,speedKnots:c.speedKnots||0,
      position:{...targetPosition},shipDamage:clone(c.shipDamage||null),sunk:!!c.sunk,sinkingProgress:c.sinkingProgress||0,sinkStyle:c.sinkStyle||0,
      hitFrac:Number.isFinite(c.hitFrac)?c.hitFrac:0,hitSide:c.hitSide||1,stationary:!!c.stationary,beforeShip:clone(meta.beforeShip||null),
      impactPosition:clone(meta.impactPosition||null),viewerPos:{...sub.position},viewerDepth:sub.depthFeet||0,viewerHeading:sub.heading||0,
      originStation,viewBearing,originFov,targetBearing,weapon:meta.weapon||'TORPEDO',location:meta.location||null,
      condition:meta.condition||null,rangeNm:distNm(sub.position,targetPosition),preImpactMs:1500,durationMs:9000,
      torpedoHeading:Number.isFinite(meta.torpedoHeading)?normDeg(meta.torpedoHeading):null,
      impactSide:meta.impactSide===-1?-1:1,incidenceDeg:Number.isFinite(meta.incidenceDeg)?meta.incidenceDeg:null,warheadKg:Number(meta.warheadKg)||null,
      torpedoWakePath:clone(meta.torpedoWakePath||[]),torpedoWakeNm:Number.isFinite(meta.torpedoWakeNm)?Math.max(0,meta.torpedoWakeNm):0,torpedoWakeVisible:!!meta.torpedoWakeVisible
    };
  }
  startImpactObservation(snapshot){
    if(!snapshot||this.state.tactical.impactObservation)return false;
    const s=this.state,restoreScale=s.time.timeScale,token=snapshot.token||++this._impactSeq;
    if(this._impactTimer)clearTimeout(this._impactTimer);if(this._impactAudioTimer)clearTimeout(this._impactAudioTimer);
    s.tactical.impactObservation={...snapshot,token,startedWall:(typeof performance!=='undefined'?performance.now():Date.now()),restoreScale};s.time.timeScale=0;
    this._impactAudioTimer=setTimeout(()=>{const cur=s.tactical.impactObservation;if(cur?.token===token){if(String(cur.weapon||'').toUpperCase()==='TORPEDO')audio.playTorpedoHit?.();else audio.playHit?.();}this._impactAudioTimer=null;},Math.max(0,snapshot.preImpactMs||0));
    this._impactTimer=setTimeout(()=>{const cur=s.tactical.impactObservation;if(!cur||cur.token!==token)return;s.tactical.impactObservation=null;this._impactTimer=null;if(this._impactAudioTimer){clearTimeout(this._impactAudioTimer);this._impactAudioTimer=null;}if(s.time.timeScale===0)s.time.timeScale=restoreScale;},snapshot.durationMs||2350);
    return true;
  }
  offerImpactObservation(c,meta={}){
    const snap=this.impactObservationSnapshot(c,meta);if(!snap)return false;
    const station=this.state.tactical.activeStation;
    if(station==='PERISCOPE'||station==='BRIDGE')return this.startImpactObservation(snap);
    const msg=`${String(meta.weapon||'TORPEDO').replace(/_/g,' ')} HIT — ${c.name||c.id}${meta.location?` ${String(meta.location).toLowerCase()}`:''}.`;
    if(typeof Toast!=='undefined'&&Toast.impactAction){Toast.impactAction(msg,()=>this.startImpactObservation(snap));return true;}
    if(typeof Toast!=='undefined'&&Toast.action){Toast.action(msg,'VIEW IMPACT',()=>this.startImpactObservation(snap),18000,'ok');return true;}
    return false;
  }

  offerLossAar(record){
    const c=this.state.campaign;if(!record||c._lossAarOffered)return false;c._lossAarOffered=true;
    try{SaveSystem.autoClear?.();}catch(_){ }
    setTimeout(()=>{if(typeof Toast==='undefined'||!globalThis.aarController?.open)return;Toast.action('BOAT LOST — After Action Report ready.','VIEW AAR',()=>globalThis.aarController.open(record,{completed:false}),10000,'bad');},0);return true;
  }

  /* Open-ended transit is intentionally CPU-bounded so a budget phone does
     not freeze its UI. In genuinely empty deep water we can safely integrate
     in three-second slices instead of one-second slices: no torpedo or depth-
     charge geometry can be skipped, and the moment traffic/air/shore becomes
     relevant the engine falls back to normal precision before the event. */
  canUseOpenSeaTransitStep(){
    const s=this.state,t=s.time,sub=s.playerSub,W=s.world||{},wep=s.weapons||{};
    if(!t.transitUntil||sub.mode==='SUNK'||sub.inShallowWater||(sub.keelClearanceFeet??3000)<120)return false;
    if(Math.abs((sub.propulsion?.actualRpm||0)-(sub.propulsion?.orderedRpm||0))>20||Math.abs(shortDelta(sub.heading,sub.orderedHeading))>3||Math.abs(sub.depthFeet-sub.orderedDepthFeet)>5)return false;
    if(W.enemy?.alertState&&W.enemy.alertState!=='UNAWARE')return false;
    if((wep.activeTorpedoes||[]).length||(W.depthCharges||[]).length)return false;
    if((s.campaign?.portRangeNm??99)<2.5||(W.harbor?.alert||0)>0)return false;
    for(const c of W.contacts||[]){if(!c?.sunk&&c.position&&distNm(sub.position,c.position)<6)return false;}
    for(const a of W.aircraft||[]){if(a?.side==='FRIENDLY'||a?.shotDown||!a?.position)continue;if(a.seenBySub||a.state==='ATTACKING'||a.state==='STRAFING'||distNm(sub.position,a.position)<12)return false;}
    return true;
  }

  update(dt){
    this.ensureTacticalExtensions();
    this.ensureWorldExtensions();
    this.ensureCareerPatrolState?.();
    this.ensureHistoricalCampaignProfile?.();
    this.ensureMissionFramework?.();
    const total=dt*this.state.time.timeScale;
    this.processCommands();
    if(this.state.campaign.missionStatus==='LOST'){const rec=this.finalizePatrol?.('LOST',{reason:'boat lost'});this.offerLossAar?.(rec);}
    // Manual 8x/16x/32x hands the conn back before a predicted vessel collision.
    // Transit/skip uses transitInterrupt(), which reports the same hull-aware CPA.
    if(!this.state.time.transitUntil&&(this.state.time.timeScale||1)>1&&this.compressedCollisionWatch?.()) return;
    if(total<=0) return;
    // Tactical simulation stays at one-second maximum integration: a torpedo
    // at 46 knots can otherwise step over a target. Only verified quiet open-
    // sea transit is allowed the coarse three-second slice described above.
    const maxStep=(this.state.time.transitUntil&&this.canUseOpenSeaTransitStep())?3.0:1.0;
    const steps=Math.min(64,Math.max(1,Math.ceil(total/maxStep)));
    const sdt=total/steps;
    for(let i=0;i<steps;i++){
      this.updateSub(sdt);
      this.state.time.elapsedSeconds+=sdt;
      this.state.campaign.patrolDuration+=sdt;
      // A cinematic impact freezes time from the hit onward. At high time
      // compression `steps` was calculated before the hit, so without this
      // guard the engine could still execute several already-scheduled slices
      // after startImpactObservation() had set timeScale to zero.
      if(this.state.tactical?.impactObservation&&this.state.time.timeScale===0)break;
    }
    if(this.state.campaign.missionStatus==='LOST'){const rec=this.finalizePatrol?.('LOST',{reason:'boat lost'});this.offerLossAar?.(rec);}
  }

  processCommands(){for(const c of this.bus.drain())this.applyCmd(c);}

  ensureTacticalExtensions(){
    const T=this.state.tactical||(this.state.tactical={});
    if(!Number.isFinite(T.bridgeBearing))T.bridgeBearing=this.state.playerSub?.heading||0;
    if(T.bridgeBinoculars===undefined)T.bridgeBinoculars=false;
    if(!Number.isFinite(T.bridgeZoom))T.bridgeZoom=T.bridgeBinoculars?1:0;
    T.bridgeZoom=clamp(T.bridgeZoom,0,1);
    if(!['TACTICAL','PERISCOPE','MAP','DECK_GUN','BRIDGE','SOUND'].includes(T.activeStation))T.activeStation='TACTICAL';
    return T;
  }


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
    const sub=this.state.playerSub,W=this.state.world,G=this.state.weapons.deckGun,T=this.state.tactical;
    let delay=0;const crews=[];
    if(T.activeStation==='BRIDGE'){
      const crash=/crash/i.test(label),watchDelay=crash?5.5:9;
      if(!T.bridgeDiveSequence?.active){
        T.bridgeDiveSequence={active:true,elapsed:0,duration:watchDelay,crash,label,
          progress:0,lastManDown:false,hatchClosed:false,startedAt:this.state.time.elapsedSeconds};
        this.log(crash?'CRASH DIVE — bridge watch scrambling for the hatch.':'Bridge watch clearing below — last man will dog the hatch before the boat goes down.','warn');
      }
      delay=Math.max(delay,T.bridgeDiveSequence.duration-T.bridgeDiveSequence.elapsed);crews.push('bridge watch');
      // Stay on BRIDGE while the men clear. The actual dive is held by
      // diveDelay; the view changes only after the last man and hatch animation.
    }
    if(G?.manned){
      G.manned=false;delay=Math.max(delay,18);crews.push('deck-gun crew');
      if(T.activeStation==='DECK_GUN')T.activeStation='MAP';
    }
    if(W.aaManned){W.aaManned=false;delay=Math.max(delay,14);crews.push('AA crew');}
    if(delay>0){
      sub.diveDelay=Math.max(sub.diveDelay||0,delay);
      this.notify(`${label}: ${crews.join(' and ')} clearing the deck automatically — dive held about ${Math.ceil(delay)} seconds until the hatch is shut.`,'bad');
    }
    return delay;
  }

  updateBridgeDiveSequence(dt){
    const T=this.state.tactical,seq=T?.bridgeDiveSequence;if(!seq?.active)return;
    seq.elapsed=clamp((seq.elapsed||0)+dt,0,seq.duration);seq.progress=clamp(seq.elapsed/Math.max(.1,seq.duration),0,1);
    seq.lastManDown=seq.progress>=.78;seq.hatchClosed=seq.progress>=.92;
    if(seq.progress>=1){
      seq.active=false;seq.hatchClosed=true;seq.completedAt=this.state.time.elapsedSeconds;
      if(T.activeStation==='BRIDGE')T.activeStation='MAP';
      T.bridgeBinoculars=false;T.bridgeZoom=0;
      this.log('Bridge clear — last man below, hatch shut. Diving can commence.');
    }
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

  bridgeCenterContact(trackId=null){
    if(!bridgeCanUse(this.state))return null;
    const s=this.state,T=s.tactical,z=bridgeZoomAmount(s),bin=z>.55;
    const maxOff=lerp(9.0,4.5,z),limitPad=1.01;
    let best=null,bestScore=Infinity;
    for(const c of s.world.contacts){
      if(c.sunk&&(c.sinkingProgress??0)>=1)continue;
      if(trackId&&c.id!==trackId)continue;
      const rng=distNm(s.playerSub.position,c.position);if(rng>bridgeVisualLimitNm(s,c)*limitPad)continue;
      const off=Math.abs(shortDelta(T.bridgeBearing,bearingBetween(s.playerSub.position,c.position)));
      if(trackId||off<=maxOff){const score=trackId?0:off+rng*.015;if(score<bestScore){best=c;bestScore=score;}}
    }
    return best;
  }

  markBridgeContact(trackId=null,select=false){
    if(!bridgeCanUse(this.state)){this.notify('Bridge watch unavailable — the boat is below the surface.','warn');return null;}
    const c=this.bridgeCenterContact(trackId);
    if(!c){this.notify('Bridge watch: no visual contact on the centre bearing.','warn');return null;}
    const s=this.state,W=s.world,T=s.tactical,z=bridgeZoomAmount(s),bin=z>.55,now=s.time.elapsedSeconds;
    const obs=bridgeObservation(s,c,z),old=W.contactTracks[c.id];
    const baseConf=lerp(.52,.68,z),repeatGain=lerp(.08,.12,z);
    const conf=clamp(Math.max(old?.confidence||0,baseConf)+(old?repeatGain:0),0,1);
    const knownType=c.displayType||c.type;
    const hullVisible=distNm(s.playerSub.position,c.position)<=Math.max(.5,s.world.environment.visibilityNm||.5)*1.02;
    const tr=old||{id:c.id,typeEstimate:'UNKNOWN',courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,contactType:c.type,lengthYards:c.lengthYards};
    const mapPos=hullVisible?c.position:obs.position;
    Object.assign(tr,{bearing:obs.bearing,rangeEstimateNm:obs.rangeNm,confidence:conf,source:'VISUAL',observer:'BRIDGE',
      lastUpdated:now,staleSeconds:0,courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,contactType:c.type,lengthYards:c.lengthYards,
      lastFixPosition:{...mapPos},plotPosition:{...mapPos},lastFixTime:now,plotUpdatedAt:now,positionFixAt:now,
      positionSource:'VISUAL',positionConfidence:hullVisible?clamp(.94+z*.04,.94,.98):clamp(.55+z*.12,.55,.67),
      positionUncertaintyNm:hullVisible?lerp(.03,.012,z):lerp(.18,.08,z),visualHullConfirmed:hullVisible});
    if(hullVisible){tr.hullConfirmedAt=now;tr.visualLastSeenAt=now;tr.visualKinematic=true;}
    tr.typeEstimate=hullVisible&&conf>=.65?knownType:conf>=.35?'SURFACE SHIP':'UNKNOWN';
    if(hullVisible&&conf>=.65)tr.affiliation=c.side||'ENEMY';
    if(shipDamageSeverity(c)>.10){tr.damageEstimate=shipDamageCondition(c);tr.damageSeverity=shipDamageSeverity(c);tr.damageObservedAt=now;}
    delete tr.truePosition;W.contactTracks[c.id]=tr;
    T.bridgeMarkedId=c.id;
    this.log(`Bridge mark — ${c.id}, bearing ${fmtDeg(obs.bearing)}, range ${obs.rangeNm.toFixed(2)} nm${bin?' (binocular observation)':''}.`);
    if(select){T.selectedTrackId=c.id;s.tdc.targetId=c.id;s.tdc.autoTrack=true;s.tdc.trackSource='BRIDGE';this.updateTdc(true);this.log(`Target designated from bridge: ${c.id}.`);}
    return tr;
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
      case'SET_ENGINE_RPM':{
        const rpm=clamp(cmd.rpm,0,450);sub.propulsion.orderedRpm=rpm;
        /* Commands are still processed while the simulation is paused. Until
           now an ALL STOP issued in that state left the last integrated 13 kn
           speed and screw-noise value frozen on screen indefinitely. A paused
           player is not asking us to simulate coasting; make the stopped shaft
           state internally consistent without moving the boat or advancing time. */
        if(rpm===0&&this.state.time.timeScale===0){sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.maneuveringThrust=0;}
        break;}
      case'SET_ORDERED_DEPTH':
        if(+cmd.depthFeet>10) this.clearDeckForDive('Dive order');
        sub.orderedDepthFeet=clamp(cmd.depthFeet,0,300); this.derivMode(); break;
      case'SURFACE':{const q=this.state.tactical.bridgeDiveSequence;if(q?.active){q.active=false;q.cancelled=true;sub.diveDelay=0;this.log('Dive cancelled — bridge watch remains topside.','warn');}sub.orderedDepthFeet=0; sub.mode=sub.depthFeet>5?'SURFACING':'SURFACED'; this.log('Surface order received.'); audio.playSurface(); break;}
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
        this.ensureSoundRadarState?.();const a=this.state.world.airThreat,R=this.state.world.radar;a.sdOn=!!R?.sdAvailable;
        this.notify(R?.sdAvailable?'SD air-search radar is crew-managed automatically whenever it can be used.':'No SD air-warning radar is fitted on this patrol date.',R?.sdAvailable?'ok':'warn');break;}
      case'BOTTOM_OUT':{
        if(sub.bottomed){this.unbottom(sub);break;}
        const sea=this.seabedFeet(sub.position);Bathy.ensure(this.state.world.terrain);const kind=Bathy.bottomType(sub.position.xNm,sub.position.yNm);
        if(sea>=3000){this.notify('Blue water — there is no bottom here to lie on.','warn');break;}
        if(sea>210){this.notify(`${sea.toFixed(0)} ft of water — too deep to bottom her with any margin.`,'warn');break;}
        if(!Bathy.restable(kind)){this.notify(`Bottom here is ${kind.toLowerCase()} — she cannot be laid on that without opening her tanks.`,'warn');break;}
        if(sub.propulsion.speedKnots>1.5){this.notify('Take the way off her first — you do not put a boat on the bottom at speed.','warn');break;}
        this.clearDeckForDive('Bottoming order');sub.bottomingOrdered=true;sub.bottomingSeaFt=sea;sub.propulsion.orderedRpm=0;sub.orderedDepthFeet=Math.round(sea-2);this.derivMode?.();
        this.notify(`BOTTOMING ORDERED — ${sea.toFixed(0)} ft, ${kind.toLowerCase()}. All stop; easing her down to settle.`,'ok');
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
      case'SET_DECK_GUN_ELEVATION':{
        const G=this.state.weapons.deckGun;
        G.elevationDeg=clamp(cmd.elevationDeg??G.elevationDeg??0,0,22);
        break;}
      case'LAY_DECK_GUN': this.layDeckGun(); break;
      case'FIRE_DECK_GUN': this.fireDeckGun(); break;
      case'TOGGLE_SILENT_RUNNING': sub.stealth.silentRunning=!sub.stealth.silentRunning; this.log(sub.stealth.silentRunning?'Silent running ENABLED.':'Silent running disabled.'); break;
      case'EMERGENCY_BLOW': sub.orderedDepthFeet=0; sub.mode='EMERGENCY_SURFACING'; sub.ballastState='EMERGENCY_BLOW';
        sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.55,0,1.5);
        this.alertEscorts('EMERGENCY_BLOW',{...sub.position},0.72); this.log('Emergency blow! High noise signature.','bad'); audio.playSurface(); break;
      case'TOGGLE_DAMAGE_CONTROL':
        this.notify(`Damage control parties are automatic. Choose one repair priority instead — currently ${repairPriorityLabel(sub.damage.repairPriority)}.`,'ok'); break;
      case'SET_REPAIR_PRIORITY': this.setRepairPriority(cmd.priority); break;
      case'TOGGLE_PUMPS':
        this.ensureDamageState();
        if(sub.damage.pumpTripped){this.notify('Dewatering pump is tripped and cannot be restarted until damage control repairs it.','bad');break;}
        sub.damage.pumpActive=!sub.damage.pumpActive;
        this.log(sub.damage.pumpActive?`Pumps running at ${Math.round(clamp(1-sub.damage.pumpDamage*.78,.16,1)*100)}% capacity — noise increases.`:'Pumps stopped.'); break;
      case'START_TRANSIT':{
        const t=this.state.time;
        if(sub.mode==='SUNK') break;
        if(t.transitUntil>t.elapsedSeconds){
          this.notify('TRANSIT ALREADY RUNNING — stop the current run before choosing another.','warn');
          break;
        }
        const activeAir=(this.state.world.aircraft||[]).some(a=>a.side!=='FRIENDLY'&&!a.shotDown&&(a.state==='ATTACKING'||a.state==='STRAFING'));
        if(activeAir){t.timeScale=1;t.transitUntil=0;t.transitOpen=false;this.notify('Transit unavailable — aircraft attack in progress.','bad');break;}
        /* seconds:0 means "no clock" — she runs on until something actually
           happens. The old eight-hour ceiling was arbitrary; a patrol can
           spend a day and a half getting to its billet and there is nothing
           to be gained by making the player press the button four times. */
        t.transitOpen=!cmd.seconds;
        t.transitUntil=cmd.seconds?t.elapsedSeconds+cmd.seconds:Infinity;
        if(t.timeScale===0)t.timeScale=1; // transit selected from PAUSE must actually run
        t.transitFrom=t.elapsedSeconds;
        t.transitReason=null;
        this.snapshotWatch();
        this.log(`Transit — running ahead up to ${Math.round((cmd.seconds||3600)/60)} minutes. Any contact stops her.`,'warn');
        break;}
      case'STOP_TRANSIT':{
        const t=this.state.time;
        if(t.transitUntil){t.transitUntil=0;t.transitOpen=false;t.transitReason='stopped by player';t.stopReason='stopped by player';t.stopReasonAt=t.elapsedSeconds;this.log('Transit ended by player.','warn');}
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
        const prevStation=this.state.tactical.activeStation;
        if(prevStation==='PERISCOPE'&&cmd.station!=='PERISCOPE')this.refreshScopeVisualContacts?.();
        if(cmd.station==='DECK_GUN'){
          if(this.tryAutoManDeckGun()){this.state.tactical.activeStation='DECK_GUN';if(prevStation!=='DECK_GUN')audio.playStationSwitch?.();}
          break;
        }
        if(cmd.station==='BRIDGE'){
          if(!bridgeCanUse(this.state)){this.notify(`Bridge unavailable at ${sub.depthFeet.toFixed(0)} ft — surface or come awash first.`,'warn');break;}
          if(this.state.tactical.activeStation==='DECK_GUN')this.secureDeckGunAuto();
          this.state.tactical.activeStation='BRIDGE';this.state.tactical.bridgeBearing=sub.heading;this.state.tactical.bridgeBinoculars=false;this.state.tactical.bridgeZoom=0;if(prevStation!=='BRIDGE')audio.playStationSwitch?.();
          break;
        }
        if(this.state.tactical.activeStation==='DECK_GUN') this.secureDeckGunAuto();
        this.state.tactical.activeStation=cmd.station;
        if(cmd.station==='PERISCOPE'){
          // Arcade usability: if the skipper has already selected a plot, put
          // the glass on its estimated bearing. An uncertain plot may still
          // reveal empty water; it is not promoted to visual truth by this.
          const sid=this.state.tactical.selectedTrackId||this.state.tdc.targetId;
          const tr=sid?this.state.world.contactTracks[sid]:null;
          this.state.tactical.periscopeBearing=tr&&Number.isFinite(tr.bearing)?tr.bearing:sub.heading;
          this.refreshScopeVisualContacts?.();
        }
        if(cmd.station==='SOUND'){this.state.tactical.soundBearing=sub.heading;this.state.tactical.soundDisplay='PASSIVE';this.ensureSoundRadarState?.();}
        if(prevStation!==this.state.tactical.activeStation)audio.playStationSwitch?.();
        break;}
      case'ROTATE_SOUND': this.state.tactical.soundBearing=normDeg((this.state.tactical.soundBearing||sub.heading)+(cmd.deltaDeg||0)); break;
      case'SOUND_MARK_BEARING': this.markSoundBearing?.(); break;
      case'SOUND_ECHO_RANGE': this.echoRange?.(); break;
      case'TOGGLE_SOUND_DISPLAY':{
        this.ensureSoundRadarState?.();const R=this.state.world.radar;
        if(this.state.tactical.soundDisplay==='PASSIVE'){
          if(!R?.sjAvailable){this.notify('SJ surface-search radar is not fitted on this patrol date.','warn');break;}
          this.state.tactical.soundDisplay='RADAR';
        }else this.state.tactical.soundDisplay='PASSIVE';
        break;}
      case'ROTATE_BRIDGE': if(bridgeCanUse(this.state))this.state.tactical.bridgeBearing=normDeg(this.state.tactical.bridgeBearing+cmd.deltaDeg); break;
      case'TOGGLE_BRIDGE_BINOCULARS': if(bridgeCanUse(this.state)){const T=this.state.tactical,on=bridgeZoomAmount(this.state)<.55;T.bridgeZoom=on?1:0;T.bridgeBinoculars=on;} break;
      case'SET_BRIDGE_ZOOM': if(bridgeCanUse(this.state)){const T=this.state.tactical;T.bridgeZoom=clamp(Number(cmd.zoom)||0,0,1);T.bridgeBinoculars=T.bridgeZoom>=.55;} break;
      case'BRIDGE_MARK_CONTACT': this.markBridgeContact(cmd.trackId||null,false); break;
      case'BRIDGE_TARGET_CENTER': this.markBridgeContact(null,true); break;
      case'BRIDGE_TARGET_CONTACT': this.markBridgeContact(cmd.trackId||null,true); break;
      case'ROTATE_PERISCOPE': this.state.tactical.periscopeBearing=normDeg(this.state.tactical.periscopeBearing+cmd.deltaDeg);this.refreshScopeVisualContacts?.(); break;
      case'SET_PERISCOPE_ZOOM': this.state.tactical.periscopeZoom=Number(cmd.zoom)===2.5?2.5:1;this.refreshScopeVisualContacts?.(); break;
      case'TOGGLE_PERISCOPE_ZOOM': this.state.tactical.periscopeZoom=this.state.tactical.periscopeZoom===1?2.5:1;this.refreshScopeVisualContacts?.(); break;
      case'PERISCOPE_SELECT_CENTER_CONTACT': this.selectScopeContact(); break;
      case'DESELECT_TRACK':
        this.state.tactical.selectedTrackId=null;this.state.tdc.targetId=null;
        this.state.tdc.autoTrack=false;this.state.tdc.trackSource='MANUAL';
        this.log('Contact selection cleared.');break;
      case'SELECT_TRACK':{
        const tr=this.state.world.contactTracks[cmd.trackId];
        if(tr&&tr.sunk){this.log(`${tr.id} is already on the bottom.`,'warn');break;}
        if(tr){
          const same=this.state.tdc.targetId===tr.id,oldSource=this.state.tdc.trackSource;
          this.state.tactical.selectedTrackId=tr.id;this.state.tdc.targetId=tr.id;this.state.tdc.autoTrack=true;
          this.state.tdc.trackSource=(same&&oldSource==='SCOPE')?'SCOPE':(hasFreshVisualFix(this.state,tr)?'VISUAL':'PLOT');
          this.updateTdc(true);this.log(`Selected ${tr.id} for TDC tracking.`);}
        else this.log('Track lost.','warn');
        break;}
      case'TDC_SEND_SCOPE_OBSERVATION': this.sendScopeToTdc(); break;
      case'FLOOD_TUBE': this.floodTube(cmd.tubeId); break;
      case'FIRE_TORPEDO': this.fireTorpedo(cmd.tubeId); break;
      case'FLOOD_ALL_TUBES': for(const t of this.state.weapons.tubes.filter(t=>t.pos==='FWD')) this.floodTube(t.id,false); this.log('Forward tubes flooded and ready.');audio.playTubeFlood?.();setTimeout(()=>audio.playTubeReady?.(),680); break;
      case'FIRE_READY_SPREAD': this.fireSpread(); break;
      case'SET_TORPEDO_TYPE':{
        const spec=TORPEDO_SPECS[cmd.specKey];
        if(!spec) break;
        if(typeof isTorpedoAvailableForState==='function'&&!isTorpedoAvailableForState(this.state,cmd.specKey)){
          this.notify(`${spec.name} is not available on this patrol date. Refit availability follows the war calendar.`,'warn');break;
        }
        this.state.tdc.torpedoSpecKey=cmd.specKey;
        this.state.tdc.torpedoType=spec.name;
        this.state.tdc.torpedoSpeedKnots=spec.speedKnots;
        this.state.tdc.torpedoMaxRangeNm=spec.maxRangeNm;
        // Update all loaded tubes
        for(const t of this.state.weapons.tubes) if(t.status==='LOADED_DRY') t.specKey=cmd.specKey;
        this.log(`Torpedo loaded: ${spec.name}. Speed ${spec.speedKnots}kn, range ${spec.maxRangeNm}nm. Dud risk: ${Math.round(100*(typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(this.state,cmd.specKey,this.state.tdc.dudMode):spec.dudChanceBase*DUD_MODES[this.state.tdc.dudMode]))}%`);
        this.updateTdc(true); break;}
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
        tdc.autoTrack=false;tdc.trackSource='MANUAL';tdc.bearing=tdc.manualBearing; tdc.rangeNm=tdc.manualRange;
        tdc.targetCourse=tdc.manualCourse; tdc.targetSpeedKnots=tdc.manualSpeed;
        if(!tdc.targetId) tdc.targetId='MANUAL';
        this.updateTdc(true);audio.playTdcSolution?.();
        this.log(`TDC manual: B${fmtDeg(tdc.bearing)} R${tdc.rangeNm.toFixed(1)}nm C${fmtDeg(tdc.targetCourse)} S${tdc.targetSpeedKnots}kn → ${tdc.status} sol${Math.round(tdc.solutionQuality*100)}%`);
        break;}
      case'FLOOD_AFT_TUBES':
        for(const t of this.state.weapons.tubes.filter(t=>t.pos==='AFT')) this.floodTube(t.id,false);
        this.log('Aft tubes flooded.');audio.playTubeFlood?.();setTimeout(()=>audio.playTubeReady?.(),680); break;
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
      case'PLOT_INTERCEPT_ADVISORY':{
        const a=this.intelSummary?.().find(x=>x.kind==='ULTRA'),plan=a?.icptNow||a?.icptFlank;
        if(!a||!plan){this.notify('No usable shipping intercept is held. Copy radio traffic or develop a contact.','warn');break;}
        this.state.map.interceptPlot={point:{...plan.point},courseDeg:plan.courseDeg,timeSec:plan.timeSec,uncertaintyNm:a.uncNm,sourceReceivedAt:this.state.world.ultra?.receivedAt,createdAt:this.state.time.elapsedSeconds};
        this.notify(`Intercept advice plotted ${fmtDeg(plan.courseDeg)} — helm unchanged.`,'ok');
        this.log(`Navigator plotted an advisory intercept ${fmtDeg(plan.courseDeg)}; commanding officer retains the helm.`);break;}
      case'TOGGLE_MAP_WEATHER':
        this.state.map.weatherOverlay=!this.state.map.weatherOverlay;
        this.notify(this.state.map.weatherOverlay?'Weather overlay shown — shaded cells are moving squalls; local visibility is shown on the chart.':'Weather overlay hidden.','ok');break;
      case'MAP_STEER_TO_NEXT_WAYPOINT': this.state.map.autoFollowPlot=true; this.steerWaypoint(true); break;
      case'HEAD_TO_PORT': this.headToPort(); break;
      case'NEW_PATROL': this.startNewPatrol(cmd.areaKey,cmd); break;
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
      const P=feat.points;if(!P||P.length<3)continue;
      let b=_terrainBoundsCache.get(feat);
      if(!b){
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for(const q of P){if(q.xNm<minX)minX=q.xNm;if(q.xNm>maxX)maxX=q.xNm;if(q.yNm<minY)minY=q.yNm;if(q.yNm>maxY)maxY=q.yNm;}
        b={minX,minY,maxX,maxY};_terrainBoundsCache.set(feat,b);
      }
      if(pos.xNm<b.minX||pos.xNm>b.maxX||pos.yNm<b.minY||pos.yNm>b.maxY)continue;
      if(this.pointInPolygon(pos,P)){
        if(feat.type==='ISLAND'||feat.type==='COAST'){collision=true;break;}
        if(feat.type==='REEF'||feat.depth==='SHALLOW')inShallow=true;
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
    let feet=Bathy.feet(pos.xNm,pos.yNm);
    /* A green FRIENDLY RV is a gameplay contract: if we put a service ring on
       the chart, the whole ring is treated as surveyed/dredged safe water.
       Older saves can contain a rendezvous generated before that guarantee;
       friendlyPortApproach() revalidates those, while this floor prevents a
       single coarse bathymetry cell from turning the marked safe berth into a
       grounding trap. */
    const ap=this.state?.campaign?.portApproach;
    if(ap?.safeWater&&ap.pos&&distNm(pos,ap.pos)<=0.305) feet=Math.max(feet,ap.safeDepthFeet||90);

    /* Truk's swept approach is a gameplay-authored navigation channel laid on
       top of synthetic bathymetry. The raw coast-distance grid happens to put
       the official approach in ~24 ft while leaving uncharted sides much
       deeper, which inverts the intended risk/reward. Treat the central swept
       passage and inner anchorage as surveyed/dredged navigable water. The
       surrounding reef/shoal grid remains untouched, so leaving the plotted
       approach is still a real hazard. */
    const H=this.state?.world?.harbor;
    if(H&&pos){
      const r=degToRad(H.channelBearing),dx=pos.xNm-H.center.xNm,dy=pos.yNm-H.center.yNm;
      const along=dx*Math.sin(r)-dy*Math.cos(r),lateral=dx*Math.cos(r)+dy*Math.sin(r),rng=Math.hypot(dx,dy);
      if(along>=H.innerRadiusNm*.72&&along<=H.outerRadiusNm+.70&&Math.abs(lateral)<=Math.min(H.channelSafeHalfWidthNm||.34,H.channelHalfWidthNm||.42))
        feet=Math.max(feet,H.channelDepthFeet||120);
      if(rng<=H.innerRadiusNm+.20) feet=Math.max(feet,H.innerBasinDepthFeet||110);
    }
    return feet;
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

    // Ordinary depth orders keep 25 ft under the keel. A validated bottoming
    // evolution is the one deliberate exception: it is allowed to descend the
    // final 25 ft under continuous fathometer supervision.
    if(!sub.bottomed&&!sub.bottomingOrdered&&sub.orderedDepthFeet>safe&&sea<3000){
      sub.orderedDepthFeet=Math.round(safe);
      const now=this.state.time.elapsedSeconds;
      if(now-(this._depthLimAt||-99)>8){
        this._depthLimAt=now;
        this.notify(`Fathometer: bottom at ${sea.toFixed(0)} ft — depth restricted to ${Math.round(safe)} ft.`,'warn');
      }
    }

    if(sub.bottomingOrdered){
      const kind=sub.bottomType,changed=Math.abs(sea-(sub.bottomingSeaFt??sea))>18;
      if(changed||sea>210||!Bathy.restable(kind)||sub.propulsion.orderedRpm>0||sub.propulsion.speedKnots>1.8||sub.orderedDepthFeet<sea-8){
        sub.bottomingOrdered=false;sub.bottomingSeaFt=null;sub.orderedDepthFeet=Math.min(sub.orderedDepthFeet,Math.round(safe));
        this.notify('BOTTOMING CANCELLED — conditions or orders changed; holding safe depth.','warn');
      }
    }

    /* Touching. How badly depends almost entirely on how fast she was
       going: a boat easing onto sand at one knot settles; the same boat at
       twelve knots opens her forward trim tank on the coral. */
    // The ordinary collision threshold remains two feet from the charted
    // bottom. A deliberate bottoming evolution may settle once the keel is
    // within roughly three feet: at all stop the depth controller deliberately
    // damps the final foot and would otherwise asymptotically hover forever.
    const bottomContactDepth=sub.bottomingOrdered?sea-3:sea-2;
    if(sub.depthFeet>=bottomContactDepth&&sea<3000&&!sub.bottomed){
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
    if(sub.bottomed)return;Bathy.ensure(this.state.world.terrain);const kind=Bathy.bottomType(sub.position.xNm,sub.position.yNm);sub.bottomType=kind;
    // This function is now a CONTACT transition only. Command validation happens
    // before the descent is ordered, so refusing bottom conditions can never
    // leave a dangerous depth order behind or teleport the boat through water.
    if(sea>210||!Bathy.restable(kind)){sub.bottomingOrdered=false;sub.bottomingSeaFt=null;sub.orderedDepthFeet=Math.min(sub.orderedDepthFeet,Math.max(0,Math.round(sea-25)));return;}
    sub.bottomed=true;sub.bottomingOrdered=false;sub.bottomingSeaFt=null;sub.bottomedAt=this.state.time.elapsedSeconds;sub.suction=0;
    sub.depthFeet=Math.min(sea-2,Math.max(sub.depthFeet,sea-3));sub.verticalSpeedFps=0;sub.propulsion.orderedRpm=0;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.orderedDepthFeet=Math.round(sea-2);
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
    sub.bottomed=false;sub.bottomingOrdered=false;sub.bottomingSeaFt=null; sub._suctWarn=false;
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
    let {collision,inShallow}=this.checkTerrainCollision(sub);
    /* The marked green FRIENDLY RV is guaranteed safe manoeuvring water. This
       intentionally overrides coarse synthetic coastline/reef polygons only
       inside that tiny service circle; outside it the normal grounding model
       remains fully active. */
    if(this._insideFriendlyRv(sub.position)){collision=false;inShallow=false;}
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
  _friendlyRvInsideArea(pos,radiusNm=0.30,marginNm=6){
    /* A FRIENDLY RV is part of the playable patrol area, not an off-chart exit.
       Keep the entire service circle plus a navigation margin inside areaBounds.
       This also protects future patrol definitions from accidentally placing a
       rendezvous in the synthetic deep-water fallback beyond the bathymetry box. */
    const A=this.areaBounds?.();
    if(!A||!pos)return true;
    const m=Math.max(0,marginNm)+Math.max(0,radiusNm);
    return pos.xNm>=A.x0+m&&pos.xNm<=A.x1-m&&pos.yNm>=A.y0+m&&pos.yNm<=A.y1-m;
  }

  _friendlyRvAreaAnchor(pos,marginNm=8){
    const A=this.areaBounds?.();if(!A||!pos)return pos;
    const m=Math.max(0,marginNm),midX=(A.x0+A.x1)/2,midY=(A.y0+A.y1)/2;
    const loX=A.x0+m,hiX=A.x1-m,loY=A.y0+m,hiY=A.y1-m;
    return{xNm:loX<=hiX?clamp(pos.xNm,loX,hiX):midX,yNm:loY<=hiY?clamp(pos.yNm,loY,hiY):midY};
  }

  _friendlyRvDiskSafe(pos,minFeet=70,radiusNm=0.30){
    /* Validate the whole service circle, not merely its centre. A centre point
       in deep water is not enough if a synthetic coastline/reef clips one edge
       of the green ring. The chart boundary is part of the same contract: the
       rendezvous must remain inside the playable patrol area, not in Bathy's
       generous off-chart deep-water fallback. */
    if(!this._friendlyRvInsideArea(pos,radiusNm,6))return{safe:false,minFeet:0};
    const rings=[0,radiusNm*.5,radiusNm];
    let minSeen=3000;
    for(const rr of rings){
      const steps=rr===0?1:12;
      for(let i=0;i<steps;i++){
        const a=rr===0?0:degToRad(i*360/steps);
        const q={xNm:pos.xNm+Math.sin(a)*rr,yNm:pos.yNm-Math.cos(a)*rr};
        const raw=Bathy.feet(q.xNm,q.yNm),terr=this.checkTerrainCollision({position:q});
        minSeen=Math.min(minSeen,raw);
        if(terr.collision||terr.inShallow||raw<minFeet) return {safe:false,minFeet:minSeen};
      }
    }
    return {safe:true,minFeet:minSeen};
  }

  _insideFriendlyRv(pos){
    const ap=this.state?.campaign?.portApproach;
    return !!(ap?.safeWater&&ap.pos&&distNm(pos,ap.pos)<=0.305);
  }

  friendlyPortApproach(port){
    if(!port) return null;
    const camp=this.state.campaign;
    if(camp.portApproach&&camp.portApproach.portName===port.name&&typeof Bathy==='undefined') return camp.portApproach;
    Bathy.ensure(this.state.world.terrain);
    if(camp.portApproach&&camp.portApproach.portName===port.name){
      const cached=this._friendlyRvDiskSafe(camp.portApproach.pos,70,0.30);
      if(cached.safe){
        camp.portApproach.safeWater=true;camp.portApproach.safeDepthFeet=Math.max(90,cached.minFeet);
        camp.portApproach.seabedFeet=Math.max(camp.portApproach.seabedFeet||0,cached.minFeet);
        return camp.portApproach;
      }
      // Old saves may carry a centre-only RV in shoal water. Re-chart it now.
      camp.portApproach=null;
    }

    const candidates=[];
    /* Most friendly ports already sit inside the chart. If future data (or an
       older save) puts one outside, start the safe-water search from an anchor
       clamped well inside the patrol area rather than searching off-chart. */
    const rvSeed=this._friendlyRvAreaAnchor(port.pos,8);
    const sample=(requireDeep)=>{
      for(let r=0.18;r<=3.0;r+=0.12){
        for(let a=0;a<360;a+=12){
          const q={xNm:rvSeed.xNm+Math.sin(degToRad(a))*r,
                   yNm:rvSeed.yNm-Math.cos(degToRad(a))*r};
          const safe=this._friendlyRvDiskSafe(q,Math.max(70,requireDeep),0.30);
          if(!safe.safe) continue;
          const sea=Bathy.feet(q.xNm,q.yNm);
          candidates.push({pos:q,seabedFeet:sea,safeDepthFeet:Math.max(90,safe.minFeet),r,
            score:r+Math.abs(Math.min(sea,220)-150)*0.0008});
        }
        if(candidates.length) break;
      }
    };
    sample(100);                       // first choice: proper open-water rendezvous
    if(!candidates.length) sample(70);

    let best=candidates.sort((a,b)=>a.score-b.score)[0];
    if(!best){
      /* Extreme fallback for an awkward synthetic coastline: keep searching
         farther out and remember the deepest navigable water we can find.
         The geographic port symbol may sit on land; the autopilot never should. */
      let deepest=null;
      for(let r=3.0;r<=6.0;r+=0.25){
        for(let a=0;a<360;a+=15){
          const q={xNm:rvSeed.xNm+Math.sin(degToRad(a))*r,
                   yNm:rvSeed.yNm-Math.cos(degToRad(a))*r};
          const safe=this._friendlyRvDiskSafe(q,55,0.30);
          if(!safe.safe) continue;
          const sea=Bathy.feet(q.xNm,q.yNm),cand={pos:q,seabedFeet:sea,safeDepthFeet:Math.max(90,safe.minFeet),r,score:r};
          if(!deepest||sea>deepest.seabedFeet) deepest=cand;
          if(sea>=70){best=cand;break;}
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
    camp.portApproach={portName:port.name,pos:{...best.pos},seabedFeet:best.seabedFeet,
      safeWater:true,safeDepthFeet:best.safeDepthFeet||Math.max(90,best.seabedFeet)};
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
  performFriendlyPortService(portName){
    const s=this.state,sub=s.playerSub,W=s.weapons,d=sub.damage;
    sub.propulsion.fuel=100;sub.propulsion.battery=100;sub.propulsion.chargeRate=0;
    W.torpedoInventory=16;
    for(const t of W.tubes){t.status='LOADED_DRY';t.flooded=false;t.reloadProgress=1;t.specKey=s.tdc.torpedoSpecKey;}
    if(W.deckGun)W.deckGun.ammo=120;
    s.world.aaAmmo=1200;
    Object.assign(d,{hullIntegrity:100,flooding:0,ballastDamage:0,motorDamage:0,rudderDamage:0,
      periscopeDamage:0,tdcDamage:0,gyroDamage:0,pumpDamage:0,electricalDamage:0,
      pumpActive:false,pumpTripped:false,pumpLoadSec:0,damageControlActive:false,
      driveBankOffline:false,crewFatigue:0,oxygen:100,repairFloor:{},instrumentBias:{}});
    sub.cannotHoldDepth=false;sub._nhdWarned=false;
    this.notify(`${String(portName||'FRIENDLY PORT').toUpperCase()} — SERVICE COMPLETE. Fuel and battery 100%; torpedoes, gun ammunition and AA replenished; battle damage repaired.`,'ok');
    this.log(`${portName||'Friendly port'} service complete — rearmed, refuelled, batteries charged and battle damage repaired.`,'warn');
  }

  checkPortArrival(dt){
    const sub=this.state.playerSub,camp=this.state.campaign;
    if(camp.missionStatus==='COMPLETED'||sub.mode==='SUNK'){
      camp.alongside=0;camp.portService=0;return;
    }
    /* Save-compatibility recovery: older convoy builds could leave the primary
       mission marked SUCCESS while missionStatus was still PATROL. Without this
       bridge a player already sitting in the green ring only received the
       15-second service cycle forever and could never satisfy Return to port. */
    if(camp.missionStatus==='PATROL'&&camp.primaryMission?.result==='SUCCESS')camp.missionStatus='RETURN TO BASE';
    const returning=camp.missionStatus==='RETURN TO BASE';
    const r=this.friendlyPortNav();
    const APPROACH_NM=1.5,CLOSE_NM=0.30;
    if(!r){camp.alongside=0;camp.portService=0;return;}
    camp.portRangeNm=r.rngNm;

    // Friendly rendezvous points remain usable service stops throughout the
    // patrol, but the interaction is now simpler: enter the close ring,
    // surface, and stop the boat. No countdown and no special harbor bell.
    if(r.rngNm<4&&r.rngNm>APPROACH_NM&&!camp._rvSeen){
      camp._rvSeen=true;
      this.notify(`${r.port.name.toUpperCase()} FRIENDLY RV — ${r.rngNm.toFixed(1)} nm. Rearm, refuel, charge batteries and repair are available inside the green ring.`,'ok');
    }
    if(r.rngNm<=APPROACH_NM&&!camp._approachReached){
      camp._approachReached=true;
      if((this.state.time.timeScale||1)>1||this.state.time.transitUntil){
        this.state.time.timeScale=1;this.state.time.transitUntil=0;this.state.time.transitOpen=false;
        this.state.time.stopReason='friendly port approach';this.state.time.stopReasonAt=this.state.time.elapsedSeconds;
      }
      this.notify(returning
        ? `${r.port.name.toUpperCase()} — FINAL RETURN. Enter the 0.3 nm green ring surfaced and stop the boat to complete the patrol.`
        : `${r.port.name.toUpperCase()} — FRIENDLY RENDEZVOUS. Enter the 0.3 nm green ring surfaced and stop the boat for service.`,'ok');
    }
    if(r.rngNm>APPROACH_NM*1.25) camp._approachReached=false;
    if(r.rngNm>4.5) camp._rvSeen=false;
    if(r.rngNm>CLOSE_NM*1.55){camp._portServiceLock=false;camp.portService=0;camp.alongside=0;camp._portTouchActive=false;}

    const surfaced=sub.depthFeet<8,close=r.rngNm<=CLOSE_NM;
    const stopped=(sub.propulsion.speedKnots||0)<=0.45||(sub.propulsion.orderedRpm||0)<=0;
    if(!close||!surfaced||!stopped){
      camp.alongside=0;camp.portService=0;camp._portTouchActive=false;
      return;
    }

    if(!camp._portTouchActive){
      camp._portTouchActive=true;audio.event?.('HARBOR_REACHED');
      this.notify(returning
        ? `${r.port.name.toUpperCase()} — BOAT STOPPED IN HARBOR. Patrol complete.`
        : `${r.port.name.toUpperCase()} — BOAT STOPPED IN HARBOR. Taking on fuel, stores and repair parties.`,'ok');
    }
    sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.maneuveringThrust=0;
    if(returning){camp.alongside=0;this.completeMission(r.port.name);return;}
    if(camp._portServiceLock)return;
    camp.portService=0;camp._portServiceLock=true;camp.lastPortServiceAt=this.state.time.elapsedSeconds;
    this.performFriendlyPortService(r.port.name);
  }

  completeMission(portName){
    const camp=this.state.campaign;
    const W=this.state.weapons;
    camp.missionStatus='COMPLETED';
    const returnObj=camp.objectives?.find?.(o=>o.id==='return')||(!camp.missionType?camp.objectives?.[3]:null);
    if(returnObj) returnObj.done=true;
    // Score bonus for fuel/torps remaining, hull condition
    const sub=this.state.playerSub;
    const fuelBonus=Math.floor(sub.propulsion.fuel*8);
    const hullBonus=Math.floor(sub.damage.hullIntegrity*5);
    const torpBonus=(W.torpedoInventory)*50;
    const bonus=fuelBonus+hullBonus+torpBonus;
    camp.score+=bonus;
    const patrolScore=camp.score;
    camp.totalScore+=patrolScore;
    const hullAtReturn=sub.damage.hullIntegrity;
    this.captainLog?.('RETURNED_TO_PORT',`Returned to ${portName}.`,{portName,hull:hullAtReturn},'returned-to-port');
    this.updateAfterActionRecorder?.(999);
    const patrolRecord=this.finalizePatrol?.('COMPLETED',{portName,patrolScore,hullAtEnd:hullAtReturn});
    if(typeof historicalNextPatrolDate==='function'){
      const endDate=patrolRecord?.endDate||(typeof _careerStampFrom==='function'?_careerStampFrom(camp._careerStartDate,camp.patrolDuration):camp.startDate);
      camp.nextPatrolDate=historicalNextPatrolDate(endDate,camp.patrolNumber,camp.scenarioSeed);
    }
    if(patrolRecord&&globalThis.aarController?.open)setTimeout(()=>globalThis.aarController.open(patrolRecord,{completed:true}),0);
    camp.score=0;                       // banked — startNewPatrol would count it twice
    this.notify(`PATROL COMPLETE at ${portName} — bonus +${bonus} points for fuel, hull and torpedoes remaining. Patrol score ${patrolScore}, career ${camp.totalScore}.`,'ok');
    Toast.show(`PATROL COMPLETE — ${portName.toUpperCase()} · rearmed and refuelled`,'ok',5200,true);
    this.log(`Patrol score: ${patrolScore} | Career total: ${camp.totalScore}`,'warn');
    audio.event?.('PATROL_COMPLETE');
    // Rearm and refuel
    sub.propulsion.fuel=100; sub.propulsion.battery=100;sub.propulsion.chargeRate=0;sub.cannotHoldDepth=false;sub._nhdWarned=false;
    W.torpedoInventory=16;
    for(const t of W.tubes){t.status='LOADED_DRY';t.reloadProgress=1;}
    sub.damage.hullIntegrity=clamp(sub.damage.hullIntegrity+25,0,100);
    sub.damage.flooding=0;
    // Patrol number belongs to the completed patrol until a new patrol is
    // actually commissioned. startNewPatrol() advances it exactly once.
    setTimeout(()=>this.log(`Rearmed and refueled. Ready for patrol #${(camp.patrolNumber||1)+1}.`)  ,3000);
  }

  startNewPatrol(areaKey,options={}){
    const keys=Object.keys(PATROL_AREAS);
    const key=areaKey||keys[Math.floor(Math.random()*keys.length)];
    const area=PATROL_AREAS[key];
    const s=this.state;
    const prevTotal=Number(s.campaign.totalScore)||0;
    const prevPatrol=s.campaign.patrolNumber||1;
    const prevHistoricalProfile=s.campaign.historicalProfile||null;
    const pristineBootstrap=prevPatrol===1&&s.campaign.missionStatus==='PATROL'&&(s.time.elapsedSeconds||0)===0&&!s.campaign.primaryMission;
    const nextPatrol=pristineBootstrap?1:prevPatrol+1;
    const patrolStartDate=options.startDate||s.campaign.nextPatrolDate||s.campaign.startDate||s.time.campaignDate||'1943-08-17';
    const careerStart=`${patrolStartDate} 06:00`;

    // Patch 10.5: a patrol is a lifecycle boundary. No tactical clock, transit,
    // stale alarm or AAR-pause state may leak across it.
    Object.assign(s.time,{elapsedSeconds:0,timeScale:1,campaignDate:patrolStartDate,
      transitUntil:0,transitOpen:false,transitReason:null,stopReason:null,stopReasonAt:-999,_watch:null,_pre:null});
    s.log=[{t:0,level:'info',message:`Patrol commenced. Area: ${key}. Good hunting.`}];
    if(s.ui){s.ui.toasts=[];s.ui.toastSeq=0;}
    // Reset world
    s.world.contacts=[]; s.world.contactTracks={}; s.world.depthCharges=[];s.world.nextDcId=0;
    s.world.collisionEvents=[];s.world.lastCollision=null;s.world._collisionCooldowns={};s.world.shakeMag=0;s.world.ownHitVisual=null;
    s.world.aircraft=[];s.world.knuckles=[];s.world.atmosphere=null;s.world.missionObjects=[];
    s.world.aaManned=false;s.world.aaAmmo=1200;s.world.aaKills=0;s.world.aaHurt=0;
    delete s.world.ultra;delete s.world.ultraAt;
    s.weapons.activeTorpedoes=[]; s.weapons.explosions=[]; s.weapons.hits=[];
    s.world.enemy={alertState:'UNAWARE',alertTimerSec:0,lastKnownSubPosition:null,lastKnownConfidence:0,
      searchPattern:'RANDOM',searchCenter:{xNm:0,yNm:0},searchAngle:0};
    // Terrain is a patrol-scoped resource. getPatrolTerrain keeps one processed
    // Pacific chart alive at a time so adding areas does not multiply startup/RAM.
    const terrain=getPatrolTerrain(area.terrainKey||key);
    s.world.terrain=terrain; s.world.portScenes=materializePortScenes(area); s.world.ports=area.ports;
    s.world.convoyRoutes=area.convoyRoutes;
    s.world.shallowZones=terrain.filter(t=>t.depth==='SHALLOW'||t.type==='REEF');
    s.world.environment=makePatrolEnvironment(area.environment);s.world.weatherSystem=null;s.world.traffic=null;
    s.map.plottedCourse=[]; s.map.exploredCells={}; s.map.ownshipTrail=[];s.map.lastTrailSampleTime=-999;s.map.autoFollowPlot=true;s.map.weatherOverlay=false;
    // A fresh patrol always gets a fresh chart origin.  The renderer consumes
    // this sequence once, so a map that was panned/free on the previous patrol
    // cannot strand the new boat off-screen.  Undefined in old saves is fine.
    s.map.recenterSeq=(s.map.recenterSeq||0)+1;
    s.tactical.activeStation='MAP';s.tactical.selectedTrackId=null;s.tactical.bridgeDiveSequence=null;s.tactical.impactObservation=null;
    s.tdc.targetId=null;s.tdc.bearing=null;s.tdc.rangeNm=null;s.tdc.targetCourse=null;s.tdc.targetSpeedKnots=null;
    s.tdc.gyroAngle=null;s.tdc.tubeTurnDeg=null;s.tdc.launchBank=null;s.tdc.launchGeometry=null;s.tdc.solutionCourse=null;s.tdc.interceptRunNm=null;s.tdc.predictedMissNm=null;
    s.tdc.angleOnBow=null;s.tdc.timeToImpactSec=null;s.tdc.solutionQuality=0;s.tdc.status='NO TARGET';s.tdc.autoTrack=true;s.tdc.trackSource='PLOT';
    s.campaign={
      patrolArea:key,score:0,scenarioSeed:Math.floor(Math.random()*9999),
      missionStatus:'PATROL',patrolNumber:nextPatrol,totalScore:prevTotal,startDate:patrolStartDate,difficulty:options.difficulty||null,
      historyId:`p${nextPatrol}-${Date.now().toString(36)}-${Math.floor(Math.random()*1e9).toString(36)}`,
      _careerStartDate:careerStart,_historyRecorded:false,_historyRecordId:null,importantEvents:[],_captainEventSeq:0,
      objectives:[
        {text:'Locate enemy convoy',done:false},{text:'Attack merchant shipping',done:false},
        {text:'Evade escort vessels',done:false},{text:'Return to friendly port',done:false}
      ],
      optionalObjectives:[],
      friendlyPort:area.ports.find(p=>p.side==='FRIENDLY'),
      tonnageSunk:0,escortsSunk:0,patrolDuration:0,alongside:0,portService:0,_portServiceLock:false,lastPortServiceAt:-999,_rvSeen:false,_approachReached:false,portApproach:null,portRangeNm:null
    };
    // fresh boat for a fresh patrol — otherwise you inherit a wrecked, empty
    // (or sunk) submarine from the previous one
    const sub=s.playerSub;
    sub.position=area.start?{...area.start}:{xNm:0,yNm:0};
    sub.mode='SURFACED';sub.heading=90;sub.orderedHeading=90;sub.rudder=0;
    sub.depthFeet=0;sub.orderedDepthFeet=0;sub.verticalSpeedFps=0;sub.ballastState='NEUTRAL';sub.trim=0;sub.diveDelay=0;
    sub.propulsion.orderedRpm=250;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;
    sub.propulsion.fuel=100;sub.propulsion.battery=100;sub.propulsion.engineMode='DIESEL';sub.propulsion.chargeRate=0;sub.cannotHoldDepth=false;sub._nhdWarned=false;
    sub.stealth.silentRunning=false;sub.stealth.acousticSignature=0;
    Object.assign(sub.damage,{hullIntegrity:100,flooding:0,ballastDamage:0,motorDamage:0,
      rudderDamage:0,periscopeDamage:0,tdcDamage:0,gyroDamage:0,pumpDamage:0,electricalDamage:0,
      crewFatigue:0,oxygen:100,airCriticalSec:0,pumpActive:false,pumpTripped:false,pumpLoadSec:0,
      damageControlActive:false,repairPriority:'FLOODING',driveBankOffline:false,damageEventSeq:0,
      repairFloor:{},instrumentBias:{},warnings:[]});
    sub.inShallowWater=false;sub.groundingRisk=false;sub.inShallowWarned=false;
    s.map.estimatedPosition={...sub.position};
    sub.bottomed=false;sub.bottomingOrdered=false;sub.bottomingSeaFt=null;sub.suction=0;sub._suctWarn=false;sub.seabedFeet=3000;sub.bottomType='DEEP';
    s.weapons.torpedoInventory=16;s.weapons.duds=[];s.weapons.nextTorpedoId=1;
    s.weapons.deckGun={manned:false,ammo:120,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1};
    for(const t of s.weapons.tubes){t.status='LOADED_DRY';t.flooded=false;t.reloadProgress=1;t.specKey=s.tdc.torpedoSpecKey;}
    s.tactical.periscopeBearing=90;s.tactical.periscopeZoom=1;s.tactical.bridgeBearing=sub.heading;s.tactical.bridgeBinoculars=false;s.tactical.bridgeZoom=0;s.tactical.bridgeMarkedId=null;
    s.tactical.soundBearing=sub.heading;s.tactical.soundDisplay='PASSIVE';
    s.world.sound=null;s.world.radar=null;
    s.world.airThreat={level:area.environment.airThreat===undefined?0.55:area.environment.airThreat,
      alarmedAt:-999,sdOn:true,nextCheck:120};
    s.world.radio={pending:null,inbox:[],unread:0,nextBroadcast:300,copying:0};
    const historicalProfile=this.ensureHistoricalCampaignProfile?.(true,prevHistoricalProfile)||null;
    s.world.contacts=this.makeConvoy(area,{areaKey:key,startDate:patrolStartDate,difficulty:options.difficulty,historicalProfile});
    s.world.harbor=null;s.world.harborInitialized=false;s.world.harborIntel=null;
    this.setupHarbor(key);this.ensureSoundRadarState?.();this.ensureWeatherSystem?.(true);
    // Patch 6: mission setup happens only after world truth (convoy/harbor) exists,
    // but before the briefing is rendered. Historical scenarios can pin a type;
    // ordinary patrols may use AUTO or the player's explicit selection.
    this.ensureAfterActionReport?.(true);
    this.configureMission?.(options.missionType||'AUTO',options);
    this.ensureTrafficDirector?.(true);
    this.log(`=== PATROL #${nextPatrol} — ${key} ===`,'warn');
    this.log(`${area.description}`);
    for(const msg of s.campaign.refitMessages||[])this.log(msg,'warn');
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
    const valid=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&grid[j*nx+i]>=5&&
      !this.checkTerrainCollision({position:{xNm:x0+i*cell,yNm:y0+j*cell}}).collision; // >=30 ft and exact polygon water
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
    const waterLine=(a,b)=>{const L=distNm(a,b),n=Math.max(1,Math.ceil(L/Math.max(.25,cell*.20)));for(let q=0;q<=n;q++){const t=q/n,p={xNm:lerp(a.xNm,b.xNm,t),yNm:lerp(a.yNm,b.yNm,t)};if(Bathy.feet(p.xNm,p.yNm)<30||this.checkTerrainCollision({position:p}).collision)return false;}return true;};
    if(Bathy.feet(route.from.xNm,route.from.yNm)>=30&&waterLine(route.from,pts[0]))pts[0]={...route.from};
    if(Bathy.feet(route.to.xNm,route.to.yNm)>=30&&waterLine(pts[pts.length-1],route.to))pts[pts.length-1]={...route.to};
    // Line-of-sight simplification removes A* stair-steps but never replaces a
    // water bend by a chord that cuts across an island.
    const simple=[];let i=0;simple.push(pts[0]);
    while(i<pts.length-1){let j=pts.length-1;while(j>i+1&&!waterLine(pts[i],pts[j]))j--;simple.push(pts[j]);i=j;}
    route.waterPath=simple;return route.waterPath;
  }

  validateActiveWaterNetwork(minDepthFeet=30){
    const W=this.state.world,area=PATROL_AREAS[this.state.campaign.patrolArea],errors=[],B=Bathy.ensure(W.terrain),routes=[];let minimum=3000;
    const safePoint=(p,label)=>{if(!p)return;const d=B?Bathy.feet(p.xNm,p.yNm):3000,land=this.checkTerrainCollision({position:p}).collision;minimum=Math.min(minimum,d);if(land||d<minDepthFeet)errors.push(`${label} is ${land?'on land':`only ${d.toFixed(0)} ft deep`}`);};
    safePoint(area?.start,'start');
    for(const [i,route] of (W.convoyRoutes||[]).entries()){
      const path=this.ensureWaterRoute(route);if(path.length<2){errors.push(`route ${i} has no water path`);continue;}let length=0;
      let routeSafe=true;for(let n=0;n<path.length-1&&routeSafe;n++){length+=distNm(path[n],path[n+1]);const steps=Math.max(1,Math.ceil(distNm(path[n],path[n+1])/.25));for(let q=0;q<=steps;q++){const t=q/steps,p={xNm:lerp(path[n].xNm,path[n+1].xNm,t),yNm:lerp(path[n].yNm,path[n+1].yNm,t)},d=B?Bathy.feet(p.xNm,p.yNm):3000,land=this.checkTerrainCollision({position:p}).collision;minimum=Math.min(minimum,d);if(land||d<minDepthFeet){errors.push(`route ${i} leaves navigable water`);routeSafe=false;break;}}}
      routes.push({label:route.label,vertices:path.length,lengthNm:length});
    }
    for(const p of W.portScenes||[])safePoint(p.position,`port ${p.name}`);
    const rv=this.friendlyPortApproach?.(this.state.campaign.friendlyPort);if(rv?.pos)safePoint(rv.pos,'friendly return');
    return{ok:errors.length===0,errors,routes,terrainVertices:(W.terrain||[]).reduce((n,f)=>n+(f.points?.length||0),0),portScenes:(W.portScenes||[]).length,minDepthFeet:minimum};
  }

  makeConvoy(area,options={}){
    const cr=area.convoyRoutes[0];
    const path=this.ensureWaterRoute(cr);
    const spawn=path[0]||cr.from, next=path[1]||cr.to;
    const hp=options.historicalProfile||this.state.campaign?.historicalProfile||null;
    const spd=area.convoySpeedRange[0]+Math.random()*(area.convoySpeedRange[1]-area.convoySpeedRange[0])+(hp?.merchantSpeedBonus||0);
    const rawCount=Math.floor(area.convoyCountRange[0]+Math.random()*(area.convoyCountRange[1]-area.convoyCountRange[0]+1));
    const count=clamp(Math.round(rawCount*(hp?.primaryMerchantCountFactor||1)),area.convoyCountRange[0],area.convoyCountRange[1]);
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
      {id:'E-01',name:'Escort Destroyer',type:'DESTROYER',displayType:'DESTROYER',lengthYards:350,visualProfile:0.75,acousticBase:0.65,tonsFactor:1900,hasSonar:true},
      {id:'E-02',name:'Kaibokan Escort',type:'KAIBOKAN',displayType:'KAIBOKAN ESCORT',lengthYards:280,visualProfile:0.65,acousticBase:0.55,tonsFactor:950,hasSonar:true},
      {id:'E-03',name:'Escort Destroyer',type:'DESTROYER',displayType:'DESTROYER',lengthYards:306,visualProfile:0.70,acousticBase:0.60,tonsFactor:1550,hasSonar:true},
      {id:'E-04',name:'Subchaser',type:'PATROL_CRAFT',displayType:'SUBCHASER',lengthYards:185,visualProfile:0.55,acousticBase:0.50,tonsFactor:480,hasSonar:true},
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
      const merchantScale=hp?.merchantTonnageFactor||1;
      contacts.push({...t,tonsFactor:Math.round((t.tonsFactor||0)*merchantScale),lengthYards:Math.round((t.lengthYards||0)*(1+(merchantScale-1)*.28)),
        position:{
          xNm:spawn.xNm+Math.sin(crsRad)*off.fwd+Math.cos(crsRad)*off.side,
          yNm:spawn.yNm-Math.cos(crsRad)*off.fwd+Math.sin(crsRad)*off.side
        },
        heading:crs+(Math.random()-0.5)*8,
        speedKnots:spd+(Math.random()-0.5)*0.5, baseSpeed:spd,
        convoyRole:'MERCHANT', convoyId:'MAIN', formationIndex:i, formationFwd:off.fwd, formationSide:off.side
      });
    }

    // Escort strength is deliberately small and readable, but no longer fixed
    // at two ships. Area risk, convoy size, year and scenario difficulty can
    // move it between one and four. Their normal stations rotate with the
    // convoy frame; the ASW brain temporarily reassigns tactical roles later.
    const areaKey=options.areaKey||Object.keys(PATROL_AREAS).find(k=>PATROL_AREAS[k]===area)||this.state.campaign.patrolArea;
    const numEscorts=Math.min(escortTemplates.length,aswEscortCount(areaKey,numMerchants,options));
    const screenRoles=aswScreenRoles(numEscorts,areaKey,options);
    for(let i=0;i<numEscorts;i++){
      const role=screenRoles[i]||'REAR_GUARD',off=ASW_SCREEN_STATIONS[role]||{fwd:0,side:0},t=escortTemplates[i];
      contacts.push({...t,
        position:{xNm:spawn.xNm+Math.sin(crsRad)*off.fwd+Math.cos(crsRad)*off.side,
          yNm:spawn.yNm-Math.cos(crsRad)*off.fwd+Math.sin(crsRad)*off.side},
        heading:crs+(Math.random()-0.5)*5,speedKnots:spd+4+(Math.random()-0.5),baseSpeed:spd+3.5,
        convoyRole:'ESCORT',convoyId:'MAIN',formationIndex:i,screenRole:role,aswRole:'SCREEN',
        zigzagPhase:Math.random()*Math.PI*2,zigzagTimer:0,roamPhase:role==='ROAMING_SCOUT'?Math.PI/2:0,pingTimer:Math.random()*7,
        sonarContact:false,sonarContactUntil:-1,sonarMisses:0,dcRemaining:28+Math.floor(Math.random()*20)
      });
    }
    return contacts;
  }

}
