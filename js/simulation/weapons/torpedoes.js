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
    const dudChance=spec.dudChanceBase*dudMode;

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
      runDepthFt:tdc.torpedoRunDepthFt??10
    });
    this.aarTorpedoLaunch?.(W.activeTorpedoes[W.activeTorpedoes.length-1]);
    t.status='EMPTY'; t.flooded=false; t.reloadProgress=0;
    // the reserve is only drawn down when the tube is reloaded
    // Electric torps make less noise
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.35*(1-spec.acousticPenalty*2),0,1.5);
    this.log(`Tube ${id} (${t.pos}) fired ${spec.name}. ${tid} gyro ${turn.toFixed(0)}° → course ${fmtDeg(courseSet)}. Reserve: ${W.torpedoInventory}.`,'warn');
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
      const d=knotsNmSec(t.speedKnots)*dt; const r=degToRad(t.heading);
      t.position.xNm+=Math.sin(r)*d; t.position.yNm-=Math.cos(r)*d;
      t.rangeRunNm+=d; t.ageSec+=dt;
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
        const lenNm=(c.lengthYards||400)*0.9144/1852;
        let halfL=lenNm*0.5, halfB=lenNm/(c.type==='ESCORT'?11:7.2)*0.5;
        // A few metres of integration/fuze tolerance on the intended target
        // prevents a mathematically excellent shot missing by one pixel-step
        // or by the short post-launch gyro transient. It is intentionally far
        // smaller than the ship's beam and applies only to a good TDC track.
        if(c.id===t.targetId){
          const aq=clamp(((t.launchSolutionQuality??0)-.55)/.40,0,1),pad=.0022*aq;
          halfL+=pad;halfB+=pad;
        }
        const hRad=degToRad(c.heading);
        const fx=Math.sin(hRad), fy=-Math.cos(hRad);          // ship forward unit
        const px=-fy, py=fx;                                   // ship starboard unit
        const dx=t.position.xNm-c.position.xNm, dy=t.position.yNm-c.position.yNm;
        const along=dx*fx+dy*fy, lateral=dx*px+dy*py;
        const gap=Math.hypot(Math.max(0,Math.abs(along)-halfL),
                             Math.max(0,Math.abs(lateral)-halfB));
        if(!near||gap<near.gap) near={c,gap,along,lateral,halfL,halfB,fx,fy,px,py,lenNm};
        if(gap>0) continue;
        {
          const hitPos={xNm:c.position.xNm+fx*along+px*Math.sign(lateral||1)*halfB,
                        yNm:c.position.yNm+fy*along+py*Math.sign(lateral||1)*halfB};
          t.position={...hitPos};
          /* ── IMPACT MODEL ──────────────────────────────────────────────
             Where along the hull did she strike, and at what angle?
             The impact point is the torpedo position projected onto the
             ship's fore-and-aft line; the track angle decides whether the
             fish detonates, glances off, or crushes her own exploder.   */
          const hitFrac=clamp(along/lenNm,-0.5,0.5);        // -0.5 stern … +0.5 bow
          const angOff=Math.abs(shortDelta(t.heading,c.heading));
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
            if(!c.sunk){
              const speedCap=Math.max(0,(c.baseSpeed??c.speedKnots??0)*shipDamageSpeedFactor(c));
              const condition=shipDamageCondition(c),sum=shipDamageSummary(c);
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
