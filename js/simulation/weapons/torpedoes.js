const TorpedoSystem={
  floodTube(id,doLog=true){
    const t=this.state.weapons.tubes.find(t=>t.id===id);
    if(!t||t.status!=='LOADED_DRY'){if(doLog)this.log(`Tube ${id} cannot flood.`,'warn');return;}
    t.status='READY'; t.flooded=true;
    // Tube flooding does not freeze a stale gyro setting. The TDC is worked
    // continuously and the physical course is read again at FIRE. Keep this
    // field as a human-readable snapshot for old saves/UI only.
    const axis=t.pos==='AFT'?normDeg(this.state.playerSub.heading+180):this.state.playerSub.heading;
    t.gyroAngle=this.state.tdc.solutionCourse==null?0:shortDelta(axis,this.state.tdc.solutionCourse);
    if(doLog){this.log(`Tube ${id} (${t.pos}) flooded and ready. TDC tube turn currently ${t.gyroAngle.toFixed(1)}°.`);PresentationBridge.audio(this.state).playTubeFlood?.();PresentationBridge.delayedAudio(this.state,620,'playTubeReady');}
  },

  /* How far the fish actually has to swim: the target keeps moving while it
     runs, so the intercept is further out than the present range whenever
     she is opening. Solved by iteration — three passes is plenty. */
  interceptRunNm(tdc,spec){ return torpedoInterceptRunNm(tdc,spec); },

  fireTorpedo(id,spreadOffsetDeg=0){
    // Refresh a live selected track at the instant of firing. Manual TDC entry
    // remains frozen by design.
    {const live=this.state.tdc?.targetId&&this.state.world?.contactTracks?.[this.state.tdc.targetId];
    if(this.state.tdc?.targetId&&this.state.tdc.targetId!=='MANUAL'&&this.state.tdc.autoTrack!==false&&live&&
      Number.isFinite(live.bearing)&&Number.isFinite(live.rangeEstimateNm)&&Number.isFinite(live.courseEstimate)&&Number.isFinite(live.speedEstimateKnots))this.sys.navigation.updateTdc(true);}
    const t=this.state.weapons.tubes.find(t=>t.id===id);
    const tdc=this.state.tdc; const sub=this.state.playerSub;
    const W=this.state.weapons;
    if(!t||t.status!=='READY'){this.notify(`Tube ${id} is not ready — flood a loaded tube or wait for reload.`,'warn');return;}
    if(!tdc.targetId||tdc.gyroAngle===null||tdc.solutionQuality<0.25){this.notify(`TDC solution ${Math.round((tdc.solutionQuality||0)*100)}% — obtain a bearing/range plot and build at least 25% before firing.`,'warn');return;}
    if(sub.depthFeet>160){this.notify(`Too deep to fire at ${Math.round(sub.depthFeet)} ft — come above 160 ft.`,'warn');return;}

    const spec=TORPEDO_SPECS[tdc.torpedoSpecKey];
    if(!spec){this.log(`Unknown torpedo specification: ${tdc.torpedoSpecKey||'NONE'}.`,'bad');return;}
    /* CAN SHE EVEN GET THERE? TDC 2.0 already includes the settling run and
       gyro arc in interceptRunNm. Do not replace it with present slant range:
       that was the source of contradictory UI/firing decisions. */
    if(tdc.rangeNm!=null){
      const runNm=this.sys.torpedoes.interceptRunNm(tdc,spec);
      if(runNm>spec.maxRangeNm){
        const longBy=runNm-spec.maxRangeNm;
        this.notify(`Tube ${id}: intercept run ${runNm.toFixed(1)} nm; ${spec.name} max ${spec.maxRangeNm.toFixed(1)} nm — long by ${longBy.toFixed(1)} nm (${Math.round(longBy*2025)} yd). Close the range.`,'warn');
        return;
      }
      if(runNm>spec.maxRangeNm*0.85)this.notify(`Long shot — intercept run ${runNm.toFixed(1)} nm of ${spec.maxRangeNm.toFixed(1)} nm max. Little margin if she zigs.`,'warn');
    }
    const dudMode=DUD_MODES[tdc.dudMode]??1;
    const dudChance=typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(this.state,tdc.torpedoSpecKey,tdc.dudMode):spec.dudChanceBase*dudMode;

    // The displayed solution belongs to one tube bank. A forward solution
    // cannot be silently fired from an aft tube (or vice versa): that would
    // again make the physical weapon diverge from the TDC. Quick-fire prefers
    // this bank; a manual wrong-bank click gets an actionable warning.
    const tubeAxis=t.pos==='AFT'?normDeg(sub.heading+180):sub.heading;
    if(tdc.launchBank&&t.pos!==tdc.launchBank){
      this.notify(`TDC launch solution is for ${tdc.launchBank} tubes — use that bank or swing the boat for a new solution.`,'warn');
      return;
    }
    const courseSet=normDeg((tdc.solutionCourse??normDeg(sub.heading+(tdc.gyroAngle??0)))+(Number(spreadOffsetDeg)||0));
    const turn=shortDelta(tubeAxis,courseSet);
    if(Math.abs(turn)>TDC_MAX_TUBE_TURN_DEG){this.notify(`Tube ${id}: gyro ${turn.toFixed(0)}° exceeds the setting limit — swing the boat toward the target and rebuild the solution.`,'warn');return;}
    if(Math.abs(turn)>62)this.log(`Very wide gyro ${turn.toFixed(0)}° — TDC geometry is valid, but swinging the boat will improve the attack.`,'warn');
    else if(Math.abs(turn)>38)this.log(`Wide gyro ${turn.toFixed(0)}° — TDC is accounting for the turn.`,'warn');
    const launchBear=tubeAxis;
    const tid=`T-${W.nextTorpedoId++}`;

    // Dud check — happens at detonation, but we flag it now for suspense
    const willDud=Math.random()<dudChance;

    W.activeTorpedoes.push({
      id:tid,tubeId:t.id,tubePos:t.pos,specKey:tdc.torpedoSpecKey, specName:spec.name,
      position:{...sub.position}, heading:launchBear,
      // Observation/TDC uncertainty belongs in solutionQuality; the gyro arc
      // itself is deterministic and already solved above. At 100% solution a
      // steady target should normally be hit, so retain only a small mechanical
      // course-setting error instead of adding a second wide-gyro punishment.
      courseSet:normDeg(courseSet+(Math.random()*2-1)*lerp(.85,.07,clamp(tdc.solutionQuality,0,1))),
      turnRateDeg:TDC_TURN_RATE_DEG, reachNm:TDC_LAUNCH_REACH_NM,
      gyroTurn:turn, launchSolutionQuality:tdc.solutionQuality,
      speedKnots:spec.speedKnots, rangeRunNm:0, maxRangeNm:spec.maxRangeNm,
      armedAfterNm:0.08,                 // arms after ~150 m
      targetId:tdc.targetId,
      // Miss coaching belongs only to the ship the skipper actually solved
      // against. Other ships still have real hull collisions, but may not
      // silently replace the intended target in the closest-approach report.
      intendedTargetId:tdc.targetId==='MANUAL'?null:tdc.targetId,
      status:'RUNNING', ageSec:0,
      willDud, dudRoll:Math.random(), glanceRoll:Math.random(),
      dudChance, isElectric:!!spec.isElectric,
      acousticPenalty:spec.acousticPenalty,
      runDepthFt:tdc.torpedoRunDepthFt??10,
      // Keep a short real world-space trail for cinematic presentation and
      // diagnostics. It is sampled sparsely and capped, so even a full salvo is
      // negligible compared with the rest of the simulation state.
      wakeTrail:spec.visibleWake===false?[]:[{...sub.position}]
    });
    this.aar.torpedoLaunch(W.activeTorpedoes[W.activeTorpedoes.length-1]);
    t.status='EMPTY'; t.flooded=false; t.reloadProgress=0;
    // the reserve is only drawn down when the tube is reloaded
    // Electric torps make less noise
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.35*(1-spec.acousticPenalty*2),0,1.5);
    this.log(`Tube ${id} (${t.pos}) fired ${spec.name}. ${tid} gyro ${turn.toFixed(0)}° → course ${fmtDeg(courseSet)}. Reserve: ${W.torpedoInventory}.`,'warn');
    this.notify?.(`TORPEDO AWAY — Tube ${id} (${t.pos}), ${spec.name}.`,'ok');
    PresentationBridge.audio(this.state).playTorpedoLaunch();
    if(t.pos==='FWD') this.sys.escorts.alert('TORPEDO_LAUNCH',{...sub.position},spec.acousticPenalty<0.03?0.55:0.85);
    else this.sys.escorts.alert('TORPEDO_LAUNCH',{...sub.position},0.7);
  },

  fireSpread(){this.sys.torpedoes.fireSpreadByPos(this.state.tdc?.launchBank||'FWD');},

  fireSpreadByPos(pos){
    const ready=this.state.weapons.tubes.filter(t=>t.status==='READY'&&t.pos===pos);
    if(!ready.length){this.notify(`No ready ${pos} tubes — flood a loaded ${pos} tube or wait for reload.`,'warn');return;}
    const before=this.state.weapons.activeTorpedoes.length;
    // A compact arcade spread brackets small errors without deliberately
    // throwing the outer fish hundreds of metres away from a good solution.
    const separationDeg=.80;
    ready.forEach((t,i)=>this.sys.torpedoes.fireTorpedo(t.id,(i-(ready.length-1)/2)*separationDeg));
    const fired=this.state.weapons.activeTorpedoes.length-before;
    if(fired>0) this.log(`${pos} spread fired: ${fired} torpedo(es).`,'warn');
  },

  /* How near did she come? Reported in yards, with the side and whether she
     crossed ahead of the stem or astern of the rudder — the two corrections
     a skipper can actually act on. */
  reportMiss(t,endOfRun){
    if(t.cpaReported){ if(endOfRun) this.log(`${t.id} end of run.`,'warn'); return; }
    t.cpaReported=true;
    const c=t.cpa;
    if(!t.intendedTargetId||!c||c.targetId!==t.intendedTargetId||c.gap>0.45){ this.log(`${t.id} end of run — no reportable target passage.`,'warn'); return; }
    const yards=Math.round(c.gap*2025);
    const ahead=c.along>c.halfL, astern=c.along<-c.halfL;
    const where=ahead?'ahead of her stem':astern?'astern of her rudder':'clear down her side';
    const side=c.lateral>0?'to starboard':'to port';
    this.notify(`MISS — ${t.id} ran past ${c.name}, ${yards} yards ${side}, passing ${where}.`+
      (ahead?' Aim further astern — you led her too much.':astern?' Aim further ahead — you did not lead her enough.':''),'warn');
  },


  sampleTorpedoWake(t,force=false){
    if(t.isElectric)return;
    const trail=t.wakeTrail||(t.wakeTrail=[]),last=trail[trail.length-1];
    if(force||!last||distNm(last,t.position)>=.012){
      trail.push({...t.position});
      if(trail.length>72)trail.splice(0,trail.length-72);
    }
  },

  torpedoWakeForImpact(t,maxNm=.48){
    if(t.isElectric)return[];
    this.sys.torpedoes.sampleTorpedoWake(t,true);
    const src=t.wakeTrail||[];if(src.length<2)return src.map(p=>({...p}));
    const out=[{...src[src.length-1]}];let acc=0;
    for(let i=src.length-2;i>=0;i--){
      acc+=distNm(src[i],src[i+1]);out.push({...src[i]});
      if(acc>=maxNm)break;
    }
    return out.reverse();
  },

  torpedoWakeForPreImpact(t,maxNm=.48,leadSec=1.5){
    if(t.isElectric)return[];
    const leadNm=knotsNmSec(t.speedKnots||46)*leadSec,src=this.sys.torpedoes.torpedoWakeForImpact(t,maxNm+leadNm+.04);
    if(src.length<2)return src;
    // Trim the newest part of the already-laid wake so the cinematic opens on
    // the physical situation ~1.5 s before impact: the bubble track is already
    // present, but its head still stops short of the hull. Nothing is animated
    // forward during the anticipation beat.
    let remain=leadNm,cut=src.length-1,head={...src[cut]};
    while(cut>0&&remain>0){const a=src[cut-1],b=src[cut],seg=distNm(a,b);if(seg>=remain&&seg>1e-9){const f=clamp((seg-remain)/seg,0,1);head={xNm:lerp(a.xNm,b.xNm,f),yNm:lerp(a.yNm,b.yNm,f)};break;}remain-=seg;cut--;head={...src[cut]};}
    const trimmed=src.slice(0,Math.max(1,cut));trimmed.push(head);
    let acc=0,out=[trimmed[trimmed.length-1]];for(let i=trimmed.length-2;i>=0;i--){acc+=distNm(trimmed[i],trimmed[i+1]);out.push(trimmed[i]);if(acc>=maxNm)break;}return out.reverse();
  },

  torpedoShipSweepHit(t,prevPos,c){
    const prev=c._collisionPrev||{},ship0=prev.position||c.position,ship1=c.position;
    const h0=Number.isFinite(prev.heading)?prev.heading:(c.heading||0),h1=c.heading||h0;
    const midH=normDeg(h0+shortDelta(h0,h1)*.5),H=shipHull(c,c.position,midH);
    if(c.id===t.targetId){
      const aq=clamp(((t.launchSolutionQuality??0)-.55)/.40,0,1),pad=.0022*aq;
      H.halfLengthNm+=pad;H.halfBeamNm+=pad;
    }
    // Convert the fish's world segment into ship-relative motion. This catches
    // a 46-knot torpedo crossing a narrow beam between one-second integration
    // samples and keeps a hard-turning target's moving hull in the equation.
    const a={xNm:c.position.xNm+(prevPos.xNm-ship0.xNm),yNm:c.position.yNm+(prevPos.yNm-ship0.yNm)};
    const b={xNm:c.position.xNm+(t.position.xNm-ship1.xNm),yNm:c.position.yNm+(t.position.yNm-ship1.yNm)};
    const hit=HullGeometry.segmentHullIntersection(a,b,H);if(!hit)return null;
    const u=clamp(hit.u,0,1),shipPos={xNm:lerp(ship0.xNm,ship1.xNm,u),yNm:lerp(ship0.yNm,ship1.yNm,u)};
    const shipHeading=normDeg(h0+shortDelta(h0,h1)*u),hr=degToRad(shipHeading),fx=Math.sin(hr),fy=-Math.cos(hr),px=-fy,py=fx;
    const fish={xNm:lerp(prevPos.xNm,t.position.xNm,u),yNm:lerp(prevPos.yNm,t.position.yNm,u)};
    let along=(fish.xNm-shipPos.xNm)*fx+(fish.yNm-shipPos.yNm)*fy;
    let lateral=(fish.xNm-shipPos.xNm)*px+(fish.yNm-shipPos.yNm)*py;
    const base=shipHull(c,shipPos,shipHeading),halfL=H.halfLengthNm,halfB=H.halfBeamNm;
    // Snap the presentation point to the nearest physical plating boundary.
    // Padding may have been used for a high-quality intended shot, but the
    // visible detonation itself must still sit on the real hull, never metres
    // ahead of the bow or clear of the beam.
    along=clamp(along,-base.halfLengthNm,base.halfLengthNm);
    lateral=clamp(lateral,-base.halfBeamNm,base.halfBeamNm);
    const endGap=base.halfLengthNm-Math.abs(along),sideGap=base.halfBeamNm-Math.abs(lateral);
    if(endGap<sideGap)along=(along<0?-1:1)*base.halfLengthNm;
    else lateral=(lateral<0?-1:1)*base.halfBeamNm;
    const impactPosition={xNm:shipPos.xNm+fx*along+px*lateral,yNm:shipPos.yNm+fy*along+py*lateral};
    return{u,shipPosition:shipPos,shipHeading,impactPosition,along,lateral,lenNm:base.halfLengthNm*2,halfL,halfB};
  },

  updateTorpedoes(dt){
    const W=this.state.weapons;
    for(const t of W.activeTorpedoes){
      if(t.status!=='RUNNING') continue;
      // straight out of the tube, then round onto the set course
      if(t.courseSet!==undefined&&t.rangeRunNm>=(t.reachNm||0)){
        const dd=shortDelta(t.heading,t.courseSet);
        const lim=(t.turnRateDeg||5.4)*dt;
        t.heading=normDeg(t.heading+clamp(dd,-lim,lim));
      }
      const prevPos={...t.position};
      const d=knotsNmSec(t.speedKnots)*dt; const r=degToRad(t.heading);
      t.position.xNm+=Math.sin(r)*d; t.position.yNm-=Math.cos(r)*d;
      t.rangeRunNm+=d; t.ageSec+=dt;this.sys.torpedoes.sampleTorpedoWake(t);
      if(t.rangeRunNm>=t.maxRangeNm){t.status='EXPIRED';this.aar.torpedoFinish(t,'EXPIRED');this.sys.torpedoes.reportMiss(t,true);continue;}
      if(t.rangeRunNm<t.armedAfterNm) continue;
      if(this.sys.harbor.harborTorpedoNetHit(t.position)){
        this.sys.harbor.revealHarborNet('CONTACT');
        t.status='NETTED';this.aar.torpedoFinish(t,'NETTED');
        W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:5,label:'NET',kind:'dud'});
        this.notify(`${t.id} caught in the harbour torpedo net — warhead spent against the boom.`,'warn');
        PresentationBridge.audio(this.state).playDud();
        const H=this.state.world.harbor;if(H){H.alert=2;H.suspicion=100;}
        continue;
      }
      /* CLOSEST APPROACH — a torpedo either strikes the plating or it does
         not. The old test was a circle 240 m across drawn round the ship's
         centre, so a fish crossing her beam "hit" while it was still a
         furlong clear of her side, and the column of water went up in open
         sea. A ship is a box: about seven times as long as she is wide. */
      // Old saves used targetId only. Preserve their intended-target semantics
      // while keeping manual solutions deliberately unassigned.
      if(t.intendedTargetId===undefined)t.intendedTargetId=t.targetId&&t.targetId!=='MANUAL'?t.targetId:null;
      let intendedNear=null;
      for(const c of this.state.world.contacts){
        if(c.sunk) continue;
        const H=shipHull(c),hRad=degToRad(c.heading||0),fx=Math.sin(hRad),fy=-Math.cos(hRad),px=-fy,py=fx;
        const dx=t.position.xNm-c.position.xNm,dy=t.position.yNm-c.position.yNm;
        const alongNow=dx*fx+dy*fy,lateralNow=dx*px+dy*py;
        const gap=Math.hypot(Math.max(0,Math.abs(alongNow)-H.halfLengthNm),Math.max(0,Math.abs(lateralNow)-H.halfBeamNm));
        if(c.id===t.intendedTargetId)intendedNear={c,gap,along:alongNow,lateral:lateralNow,halfL:H.halfLengthNm,halfB:H.halfBeamNm};
        // Steam-torpedo wakes are not invisible. A merchant lookout in good
        // daylight may occasionally spot an approaching bubble track close
        // enough to order a last-moment evasive turn. Electric fish do not get
        // this visual giveaway. The AI helper owns probability/knowledge rules.
        this.sys.enemyAI.maybeMerchantSpotTorpedo(t,c,gap);
        const swept=this.sys.torpedoes.torpedoShipSweepHit(t,prevPos,c);if(!swept)continue;
        {
          const {impactPosition,shipPosition,shipHeading,along,lateral,lenNm}=swept;
          t.position={...impactPosition};this.sys.torpedoes.sampleTorpedoWake(t,true);
          /* ── IMPACT MODEL ──────────────────────────────────────────────
             Where along the hull did she strike, and at what angle?
             The impact point is the torpedo position projected onto the
             ship's fore-and-aft line; the track angle decides whether the
             fish detonates, glances off, or crushes her own exploder.   */
          const hitFrac=clamp(along/lenNm,-0.5,0.5);        // -0.5 stern … +0.5 bow
          const angOff=Math.abs(shortDelta(t.heading,shipHeading));
          const incidence=Math.min(angOff,180-angOff);      // 90° = square hit on the beam
          const where=hitFrac>0.22?'bow':hitFrac<-0.22?'stern':'amidships';
          const spec=TORPEDO_SPECS[t.specKey]||{};
          if(c.harborTarget) this.sys.harbor.noteHarborAttack(c);

          // A very shallow track angle and the warhead simply glances off the
          // plating — the exploder never gets a square blow.
          if(incidence<22){
            const pGlance=clamp((22-incidence)/22,0,1)*0.85;
            if(t.glanceRoll<pGlance){
              t.status='DEFLECTED';this.aar.torpedoFinish(t,'DEFLECTED',c.id);
              W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:5,label:'GLANCED OFF',kind:'dud',targetId:c.id,impactSide:lateral>=0?1:-1,incidenceDeg:incidence,warheadKg:spec.warheadKg||292});
              this.log(`${t.id} struck ${c.name} at ${incidence.toFixed(0)}° and GLANCED OFF the hull — no detonation. Fire nearer the beam.`,'bad');
              this.sys.escorts.alert('TORPEDO_DUD',{...t.position},0.5);
              PresentationBridge.audio(this.state).playDud();
              break;
            }
          }
          // Some authored torpedoes may carry a historically specific contact-
          // exploder penalty on square impacts. Do not infer that mechanism from
          // nationality, dud rate or the current Pacific weapon family.
          const squareHitPenalty=!!spec.contactExploderSquareHitPenalty;
          const angleFactor=squareHitPenalty
            ? 0.7+0.9*Math.pow(incidence/90,2)
            : 0.9+0.2*Math.pow(incidence/90,2);
          const pDud=clamp((t.dudChance??0.2)*angleFactor,0,0.97);
          if(t.dudRoll<pDud){
            t.status='DUD';this.aar.torpedoFinish(t,'DUD',c.id);
            W.duds.push({torpedoId:t.id,contactId:c.id,t:this.state.time.elapsedSeconds});
            W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:6,label:'DUD',kind:'dud',targetId:c.id,impactSide:lateral>=0?1:-1,incidenceDeg:incidence,warheadKg:spec.warheadKg||292});
            const why=incidence>70&&squareHitPenalty
              ? 'Contact exploder crushed — a square hit. Oblique tracks fire more reliably.'
              : `${t.specName} exploder failure.`;
            this.log(`${t.id} — DUD against ${c.name}'s ${where}! No detonation. (${why})`,'bad');
            this.sys.escorts.alert('TORPEDO_DUD',{...t.position},0.5);
            PresentationBridge.audio(this.state).playDud();
          } else {
            t.status='HIT';this.aar.torpedoFinish(t,'HIT',c.id);
            const beforeShip=this.sys.impact.captureShipState(c);if(beforeShip)beforeShip.heading=shipHeading;
            c.hitFrac=hitFrac;c.hitSide=lateral>=0?1:-1;
            const dmg=applyTorpedoShipDamage(this,c,{hitFrac,hitSide:c.hitSide,incidence,
              warheadKg:spec.warheadKg||292,torpedoId:t.id,specKey:t.specKey});
            W.hits.push({weapon:'TORPEDO',torpedoId:t.id,contactId:c.id,t:this.state.time.elapsedSeconds,
              location:dmg.location});
            W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:14,label:`HIT — ${dmg.location}`,big:true,targetId:c.id,targetLengthFeet:Number(c.lengthYards)||300,impactSide:c.hitSide,incidenceDeg:incidence,warheadKg:spec.warheadKg||292});
            particles.spawnExplosion(t.position.xNm,t.position.yNm,2.35,true);
            const automaticImpactView=['PERISCOPE','BRIDGE'].includes(this.state.tactical.activeStation);if(!automaticImpactView)PresentationBridge.audio(this.state).playTorpedoHit?.();
            if(c.harborTarget)this.sys.harbor.noteHarborAttack(c);
            this.sys.escorts.alert('SHIP_HIT',{...t.position},1);

            // Resolve a catastrophic structural opening immediately; otherwise
            // the four subsystem states continue evolving in updateWorld().
            updateShipDamage(this,c,0);
            const condition=shipDamageCondition(c);
            this.aar.recordEvent('TORPEDO_HIT',`${t.id} hit ${c.name} ${dmg.location.toLowerCase()}.`,
              {torpedoId:t.id,contactId:c.id,type:c.displayType||c.type,tons:c.tonsFactor||0,location:dmg.location,
               incidenceDeg:Math.round(incidence),condition,weapon:'TORPEDO'},this.state.playerSub.position,shipPosition);
            this.sys.impact.offerObservation(c,{weapon:'TORPEDO',location:dmg.location,condition,beforeShip,impactPosition:{...t.position},
              targetPosition:{...shipPosition},targetHeading:shipHeading,torpedoHeading:t.heading,impactSide:c.hitSide,incidenceDeg:incidence,warheadKg:spec.warheadKg||292,
              torpedoWakePath:this.sys.torpedoes.torpedoWakeForPreImpact(t,.48,1.5),torpedoWakeNm:Math.min(.48,Math.max(.10,t.rangeRunNm||0)),torpedoWakeVisible:!t.isElectric});
            if(!c.sunk){
              const speedCap=Math.max(0,(c.baseSpeed??c.speedKnots??0)*shipDamageSpeedFactor(c));
              const sum=shipDamageSummary(c);
              this.log(`${t.id} HIT ${c.name} ${dmg.location.toLowerCase()} (track ${incidence.toFixed(0)}°) — ${condition}. ${sum}.`,'bad');
              this.notify(`TORPEDO HIT — ${c.name}: ${condition}${speedCap>0?` · estimated max ${speedCap.toFixed(1)} kn`:''}.`,'bad');
            }
            this.sys.mission.checkObjectives();
          }
          break;
        }
      }
      /* MISS REPORTING. A miss is a miss — no column of water beside the
         ship, which is what the circular hit test used to produce. But the
         boat did learn something: sonar hears the fish run past, and the
         plot tells you by how much. Report it once, the moment she is
         drawing away again, so the next shot can be corrected. */
      if(t.status==='RUNNING'&&intendedNear){
        if(!t.cpa||intendedNear.gap<t.cpa.gap){
          t.cpa={targetId:intendedNear.c.id,gap:intendedNear.gap,name:intendedNear.c.name,along:intendedNear.along,lateral:intendedNear.lateral,halfL:intendedNear.halfL};
        }else if(!t.cpaReported&&t.cpa.gap<0.45&&intendedNear.gap>t.cpa.gap+0.035){
          this.sys.torpedoes.reportMiss(t,false);      // reportMiss sets the flag itself
        }
      }
    }
    W.activeTorpedoes=W.activeTorpedoes.filter(t=>t.status==='RUNNING'||t.ageSec<8);
    for(const e of W.explosions) e.ageSec+=dt;
    W.explosions=W.explosions.filter(e=>e.ageSec<e.maxAgeSec);
    for(const c of this.state.world.contacts)
      if(c.sunk) c.sinkingProgress=clamp((c.sinkingProgress??0)+dt/(c.sinkDurationSec||45),0,1);
    for(const tube of W.tubes){
      if(tube.status==='EMPTY'){
        tube.reloadProgress=clamp(tube.reloadProgress+dt/120,0,1);
        if(tube.reloadProgress>=1&&W.torpedoInventory>0){
          tube.status='LOADED_DRY';
          tube.specKey=this.state.tdc.torpedoSpecKey;
          W.torpedoInventory--;
          this.log(`Tube ${tube.id} (${tube.pos}) reloaded: ${TORPEDO_SPECS[tube.specKey].name}. ${W.torpedoInventory} in reserve.`);
        }
      }
    }
  },

  // ── ENEMY AI v2: sonar, search patterns, coordination ──
};
