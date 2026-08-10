class SimEngineTorpedoes extends SimEngineHarbor {
  floodTube(id,doLog=true){
    const t=this.state.weapons.tubes.find(t=>t.id===id);
    if(!t||t.status!=='LOADED_DRY'){if(doLog)this.log(`Tube ${id} cannot flood.`,'warn');return;}
    t.status='READY'; t.flooded=true;
    const isAft=t.pos==='AFT';
    // Aft tubes fire backward: gyro is opposite bearing delta
    if(isAft){
      t.gyroAngle=normDeg(180+(this.state.tdc.gyroAngle??0));
    } else {
      t.gyroAngle=(this.state.tdc.gyroAngle??0);
    }
    if(doLog)this.log(`Tube ${id} (${t.pos}) flooded and ready. TDC gyro currently ${t.gyroAngle.toFixed(1)}°.`);
  }

  /* How far the fish actually has to swim: the target keeps moving while it
     runs, so the intercept is further out than the present range whenever
     she is opening. Solved by iteration — three passes is plenty. */
  interceptRunNm(tdc,spec){ return torpedoInterceptRunNm(tdc,spec); }

  fireTorpedo(id,spreadOffsetDeg=0){
    // Refresh a live selected track at the instant of firing. Manual TDC entry
    // remains frozen by design.
    {const live=this.state.tdc?.targetId&&this.state.world?.contactTracks?.[this.state.tdc.targetId];
    if(this.state.tdc?.targetId&&this.state.tdc.targetId!=='MANUAL'&&this.state.tdc.autoTrack!==false&&live&&
      Number.isFinite(live.bearing)&&Number.isFinite(live.rangeEstimateNm)&&Number.isFinite(live.courseEstimate)&&Number.isFinite(live.speedEstimateKnots))this.updateTdc?.();}
    const t=this.state.weapons.tubes.find(t=>t.id===id);
    const tdc=this.state.tdc; const sub=this.state.playerSub;
    const W=this.state.weapons;
    if(!t||t.status!=='READY'){this.log(`Tube ${id} not ready.`,'warn');return;}
    if(!tdc.targetId||tdc.gyroAngle===null||tdc.solutionQuality<0.25){this.log(`TDC solution too weak (${Math.round(tdc.solutionQuality*100)}%). Need 25%+ — send scope to TDC.`,'warn');return;}
    if(sub.depthFeet>160){this.log('Too deep to fire.','warn');return;}

    const spec=TORPEDO_SPECS[tdc.torpedoSpecKey]||TORPEDO_SPECS['mk14fast'];
    /* CAN SHE EVEN GET THERE? A torpedo has a finite run. The distance that
       matters is not the range to the target now but the distance to the
       intercept point, which is further whenever she is drawing away from
       you — so work out the run and refuse the shot that cannot reach. */
    if(tdc.rangeNm!=null){
      const runNm=this.interceptRunNm(tdc,spec);
      if(runNm>spec.maxRangeNm){
        const longBy=runNm-spec.maxRangeNm;
        this.notify(`Tube ${id}: intercept run ${runNm.toFixed(1)} nm; ${spec.name} max ${spec.maxRangeNm.toFixed(1)} nm — long by ${longBy.toFixed(1)} nm (${Math.round(longBy*2025)} yd). Close the range.`,'warn');
        return;
      }
      if(runNm>spec.maxRangeNm*0.85)
        this.notify(`Long shot — intercept run ${runNm.toFixed(1)} nm of ${spec.maxRangeNm.toFixed(1)} nm max. Little margin if she zigs.`,'warn');
    }
    const dudMode=DUD_MODES[tdc.dudMode]??1;
    const dudChance=typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(this.state,tdc.torpedoSpecKey,tdc.dudMode):spec.dudChanceBase*dudMode;

    // A torpedo leaves the tube along the tube's axis. The gyro then swings it
    // onto the set course over a turning circle — it cannot simply point
    // wherever it likes. Beyond 90° the gyro cannot be set at all and the boat
    // has to be swung round.
    const tubeAxis=t.pos==='AFT'?normDeg(sub.heading+180):sub.heading;
    // A single tube always aims at the centre of the TDC solution. Spread is
    // a salvo command, not a permanent tube bias. The old -2/+2/+4 degree
    // tube offsets made individually fired tubes miss a good solution by
    // design at ordinary attack ranges.
    const courseSet=normDeg(sub.heading+(tdc.gyroAngle??0)+(Number(spreadOffsetDeg)||0));
    const turn=shortDelta(tubeAxis,courseSet);
    if(Math.abs(turn)>90){
      this.log(`Tube ${id}: gyro angle ${turn.toFixed(0)}° is beyond the setting limits — swing the boat onto the target.`,'warn');
      return;
    }
    if(Math.abs(turn)>50) this.log(`Wide gyro ${turn.toFixed(0)}° — she will wander on the turn.`,'warn');
    const launchBear=tubeAxis;
    const tid=`T-${W.nextTorpedoId++}`;

    // Dud check — happens at detonation, but we flag it now for suspense
    const willDud=Math.random()<dudChance;

    W.activeTorpedoes.push({
      id:tid, specKey:tdc.torpedoSpecKey, specName:spec.name,
      position:{...sub.position}, heading:launchBear,
      // Fire-control error now scales with the quality shown to the player.
      // A green solution should usually put a fish through a steady merchant;
      // a marginal plot still has enough angular error to make misses normal.
      courseSet:normDeg(courseSet+(Math.random()*2-1)*(lerp(1.15,0.16,clamp(tdc.solutionQuality,0,1))+Math.max(0,Math.abs(turn)-45)*0.006)),
      turnRateDeg:8.0, reachNm:0.04,                 // short settling run, then gyro turn
      gyroTurn:turn, launchSolutionQuality:tdc.solutionQuality,
      speedKnots:spec.speedKnots, rangeRunNm:0, maxRangeNm:spec.maxRangeNm,
      armedAfterNm:0.08,                 // arms after ~150 m
      targetId:tdc.targetId, status:'RUNNING', ageSec:0,
      willDud, dudRoll:Math.random(), glanceRoll:Math.random(),
      dudChance, isElectric:tdc.torpedoSpecKey==='mk18',
      acousticPenalty:spec.acousticPenalty,
      runDepthFt:tdc.torpedoRunDepthFt??10,
      // Keep a short real world-space trail for cinematic presentation and
      // diagnostics. It is sampled sparsely and capped, so even a full salvo is
      // negligible compared with the rest of the simulation state.
      wakeTrail:tdc.torpedoSpecKey==='mk18'?[]:[{...sub.position}]
    });
    this.aarTorpedoLaunch?.(W.activeTorpedoes[W.activeTorpedoes.length-1]);
    t.status='EMPTY'; t.flooded=false; t.reloadProgress=0;
    // the reserve is only drawn down when the tube is reloaded
    // Electric torps make less noise
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.35*(1-spec.acousticPenalty*2),0,1.5);
    this.log(`Tube ${id} (${t.pos}) fired ${spec.name}. ${tid} gyro ${turn.toFixed(0)}° → course ${fmtDeg(courseSet)}. Reserve: ${W.torpedoInventory}.`,'warn');
    this.notify?.(`TORPEDO AWAY — Tube ${id} (${t.pos}), ${spec.name}.`,'ok');
    audio.playTorpedoLaunch();
    if(t.pos==='FWD') this.alertEscorts('TORPEDO_LAUNCH',{...sub.position},spec.acousticPenalty<0.03?0.55:0.85);
    else this.alertEscorts('TORPEDO_LAUNCH',{...sub.position},0.7);
  }

  fireSpread(){this.fireSpreadByPos('FWD');}

  fireSpreadByPos(pos){
    const ready=this.state.weapons.tubes.filter(t=>t.status==='READY'&&t.pos===pos);
    if(!ready.length){this.log(`No ready ${pos} tubes.`,'warn');return;}
    const before=this.state.weapons.activeTorpedoes.length;
    // A compact arcade spread brackets small errors without deliberately
    // throwing the outer fish hundreds of metres away from a good solution.
    const separationDeg=.80;
    ready.forEach((t,i)=>this.fireTorpedo(t.id,(i-(ready.length-1)/2)*separationDeg));
    const fired=this.state.weapons.activeTorpedoes.length-before;
    if(fired>0) this.log(`${pos} spread fired: ${fired} torpedo(es).`,'warn');
  }

  /* How near did she come? Reported in yards, with the side and whether she
     crossed ahead of the stem or astern of the rudder — the two corrections
     a skipper can actually act on. */
  reportMiss(t,endOfRun){
    if(t.cpaReported){ if(endOfRun) this.log(`${t.id} end of run.`,'warn'); return; }
    t.cpaReported=true;
    const c=t.cpa;
    if(!c||c.gap>0.45){ this.log(`${t.id} end of run — no target.`,'warn'); return; }
    const yards=Math.round(c.gap*2025);
    const ahead=c.along>c.halfL, astern=c.along<-c.halfL;
    const where=ahead?'ahead of her stem':astern?'astern of her rudder':'clear down her side';
    const side=c.lateral>0?'to starboard':'to port';
    this.notify(`MISS — ${t.id} ran past ${c.name}, ${yards} yards ${side}, passing ${where}.`+
      (ahead?' Aim further astern — you led her too much.':astern?' Aim further ahead — you did not lead her enough.':''),'warn');
  }


  sampleTorpedoWake(t,force=false){
    if(t.isElectric)return;
    const trail=t.wakeTrail||(t.wakeTrail=[]),last=trail[trail.length-1];
    if(force||!last||distNm(last,t.position)>=.012){
      trail.push({...t.position});
      if(trail.length>72)trail.splice(0,trail.length-72);
    }
  }

  torpedoWakeForImpact(t,maxNm=.48){
    if(t.isElectric)return[];
    this.sampleTorpedoWake(t,true);
    const src=t.wakeTrail||[];if(src.length<2)return src.map(p=>({...p}));
    const out=[{...src[src.length-1]}];let acc=0;
    for(let i=src.length-2;i>=0;i--){
      acc+=distNm(src[i],src[i+1]);out.push({...src[i]});
      if(acc>=maxNm)break;
    }
    return out.reverse();
  }

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
  }

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
      t.rangeRunNm+=d; t.ageSec+=dt;this.sampleTorpedoWake(t);
      if(t.rangeRunNm>=t.maxRangeNm){t.status='EXPIRED';this.aarTorpedoFinish?.(t,'EXPIRED');this.reportMiss(t,true);continue;}
      if(t.rangeRunNm<t.armedAfterNm) continue;
      if(this.harborTorpedoNetHit(t.position)){
        this.revealHarborNet?.('CONTACT');
        t.status='NETTED';this.aarTorpedoFinish?.(t,'NETTED');
        W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:5,label:'NET',kind:'dud'});
        this.notify(`${t.id} caught in the harbour torpedo net — warhead spent against the boom.`,'warn');
        audio.playDud();
        const H=this.state.world.harbor;if(H){H.alert=2;H.suspicion=100;}
        continue;
      }
      /* CLOSEST APPROACH — a torpedo either strikes the plating or it does
         not. The old test was a circle 240 m across drawn round the ship's
         centre, so a fish crossing her beam "hit" while it was still a
         furlong clear of her side, and the column of water went up in open
         sea. A ship is a box: about seven times as long as she is wide. */
      let near=null;
      for(const c of this.state.world.contacts){
        if(c.sunk) continue;
        const H=shipHull(c),hRad=degToRad(c.heading||0),fx=Math.sin(hRad),fy=-Math.cos(hRad),px=-fy,py=fx;
        const dx=t.position.xNm-c.position.xNm,dy=t.position.yNm-c.position.yNm;
        const alongNow=dx*fx+dy*fy,lateralNow=dx*px+dy*py;
        const gap=Math.hypot(Math.max(0,Math.abs(alongNow)-H.halfLengthNm),Math.max(0,Math.abs(lateralNow)-H.halfBeamNm));
        if(!near||gap<near.gap)near={c,gap,along:alongNow,lateral:lateralNow,halfL:H.halfLengthNm,halfB:H.halfBeamNm};
        const swept=this.torpedoShipSweepHit(t,prevPos,c);if(!swept)continue;
        {
          const {impactPosition,shipPosition,shipHeading,along,lateral,lenNm}=swept;
          t.position={...impactPosition};this.sampleTorpedoWake(t,true);
          /* ── IMPACT MODEL ──────────────────────────────────────────────
             Where along the hull did she strike, and at what angle?
             The impact point is the torpedo position projected onto the
             ship's fore-and-aft line; the track angle decides whether the
             fish detonates, glances off, or crushes her own exploder.   */
          const hitFrac=clamp(along/lenNm,-0.5,0.5);        // -0.5 stern … +0.5 bow
          const angOff=Math.abs(shortDelta(t.heading,shipHeading));
          const incidence=Math.min(angOff,180-angOff);      // 90° = square hit on the beam
          const where=hitFrac>0.22?'bow':hitFrac<-0.22?'stern':'amidships';
          if(c.harborTarget) this.noteHarborAttack?.(c);

          // A very shallow track angle and the warhead simply glances off the
          // plating — the exploder never gets a square blow.
          if(incidence<22){
            const pGlance=clamp((22-incidence)/22,0,1)*0.85;
            if(t.glanceRoll<pGlance){
              t.status='DEFLECTED';this.aarTorpedoFinish?.(t,'DEFLECTED',c.id);
              W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:5,label:'GLANCED OFF',kind:'dud'});
              this.log(`${t.id} struck ${c.name} at ${incidence.toFixed(0)}° and GLANCED OFF the hull — no detonation. Fire nearer the beam.`,'bad');
              this.alertEscorts('TORPEDO_DUD',{...t.position},0.5);
              audio.playDud();
              break;
            }
          }
          // The Mark 14's contact exploder was crushed by its own inertia on a
          // square hit — oblique shots actually fired more reliably. That is
          // modelled here: perpendicular impacts raise the dud chance.
          const spec=TORPEDO_SPECS[t.specKey]||{};
          const angleFactor=(spec.dudChanceBase>=0.2)
            ? 0.7+0.9*Math.pow(incidence/90,2)              // Mk14/23 family
            : 0.9+0.2*Math.pow(incidence/90,2);
          const pDud=clamp((t.dudChance??0.2)*angleFactor,0,0.97);
          if(t.dudRoll<pDud){
            t.status='DUD';this.aarTorpedoFinish?.(t,'DUD',c.id);
            W.duds.push({torpedoId:t.id,contactId:c.id,t:this.state.time.elapsedSeconds});
            W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:6,label:'DUD',kind:'dud'});
            const why=incidence>70&&spec.dudChanceBase>=0.2
              ? 'Contact exploder crushed — a square hit. Oblique tracks fire more reliably.'
              : `${t.specName} exploder failure.`;
            this.log(`${t.id} — DUD against ${c.name}'s ${where}! No detonation. (${why})`,'bad');
            this.alertEscorts('TORPEDO_DUD',{...t.position},0.5);
            audio.playDud();
          } else {
            t.status='HIT';this.aarTorpedoFinish?.(t,'HIT',c.id);
            const beforeShip=this.captureImpactShipState?.(c);if(beforeShip)beforeShip.heading=shipHeading;
            c.hitFrac=hitFrac;c.hitSide=lateral>=0?1:-1;
            const dmg=applyTorpedoShipDamage(this,c,{hitFrac,hitSide:c.hitSide,incidence,
              warheadKg:spec.warheadKg||292,torpedoId:t.id,specKey:t.specKey});
            W.hits.push({weapon:'TORPEDO',torpedoId:t.id,contactId:c.id,t:this.state.time.elapsedSeconds,
              location:dmg.location});
            W.explosions.push({position:{...t.position},ageSec:0,maxAgeSec:14,label:`HIT — ${dmg.location}`,big:dmg.location==='MIDSHIPS'});
            particles.spawnExplosion(t.position.xNm,t.position.yNm,1.8,true);audio.playHit();
            if(c.harborTarget)this.noteHarborAttack?.(c);
            this.alertEscorts('SHIP_HIT',{...t.position},1);

            // Resolve a catastrophic structural opening immediately; otherwise
            // the four subsystem states continue evolving in updateWorld().
            updateShipDamage(this,c,0);
            const condition=shipDamageCondition(c);
            this.aarRecordEvent?.('TORPEDO_HIT',`${t.id} hit ${c.name} ${dmg.location.toLowerCase()}.`,
              {torpedoId:t.id,contactId:c.id,type:c.displayType||c.type,tons:c.tonsFactor||0,location:dmg.location,
               incidenceDeg:Math.round(incidence),condition,weapon:'TORPEDO'},this.state.playerSub.position,shipPosition);
            this.offerImpactObservation?.(c,{weapon:'TORPEDO',location:dmg.location,condition,beforeShip,impactPosition:{...t.position},
              targetPosition:{...shipPosition},targetHeading:shipHeading,torpedoHeading:t.heading,
              torpedoWakePath:this.torpedoWakeForImpact(t,.48),torpedoWakeNm:Math.min(.48,Math.max(.10,t.rangeRunNm||0)),torpedoWakeVisible:!t.isElectric});
            if(!c.sunk){
              const speedCap=Math.max(0,(c.baseSpeed??c.speedKnots??0)*shipDamageSpeedFactor(c));
              const sum=shipDamageSummary(c);
              this.log(`${t.id} HIT ${c.name} ${dmg.location.toLowerCase()} (track ${incidence.toFixed(0)}°) — ${condition}. ${sum}.`,'bad');
              this.notify(`TORPEDO HIT — ${c.name}: ${condition}${speedCap>0?` · estimated max ${speedCap.toFixed(1)} kn`:''}.`,'bad');
            }
            this.checkMissionObjectives();
          }
          break;
        }
      }
      /* MISS REPORTING. A miss is a miss — no column of water beside the
         ship, which is what the circular hit test used to produce. But the
         boat did learn something: sonar hears the fish run past, and the
         plot tells you by how much. Report it once, the moment she is
         drawing away again, so the next shot can be corrected. */
      if(t.status==='RUNNING'&&near){
        if(!t.cpa||near.gap<t.cpa.gap){
          t.cpa={gap:near.gap,name:near.c.name,along:near.along,lateral:near.lateral,halfL:near.halfL};
        }else if(!t.cpaReported&&t.cpa.gap<0.45&&near.gap>t.cpa.gap+0.035){
          this.reportMiss(t,false);      // reportMiss sets the flag itself
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
  }

  // ── ENEMY AI v2: sonar, search patterns, coordination ──
}
