class SimEngineHarbor extends SimEngineCore {
  /* ══ ENEMY HARBOUR — first full prototype: TRUK ════════════════════
     Enemy ports used to be red squares on the chart and nothing more. Truk is
     now a place the player can deliberately penetrate: a persistent mine belt
     with a swept channel, a torpedo-net gate, harbour hydrophones, searchlights
     and coastal batteries, plus moored high-value targets that are generated
     once per patrol and then stay where they are. */
  ensureWorldExtensions(){
    const W=this.state.world, G=this.state.weapons, C=this.state.campaign;
    if(!Array.isArray(C.optionalObjectives)) C.optionalObjectives=[]; // migrate pre-Phase-2 saves
    if(W.harborInitialized===undefined) W.harborInitialized=false; // migrate old saves
    const subProfile=getSubmarineProfile(this.state.playerSub?.profileId);
    if(!G.deckGun) G.deckGun={manned:false,ammo:subProfile.weapons.deckGun.ammo,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1};
    G.deckGun.shells=G.deckGun.shells||[];G.deckGun.splashes=G.deckGun.splashes||[];
    if(!W.harborInitialized) this.setupHarbor(C.patrolArea);
    if(W.harbor) this.ensureHarborIntel();
    else if(W.harborIntel===undefined) W.harborIntel=null;
  }

  setupHarbor(areaKey){
    const W=this.state.world, area=PATROL_AREAS[areaKey];
    W.harborInitialized=true; W.harbor=null;
    if(!area||areaKey!=='Truk Approaches') return;
    const port=(area.ports||[]).find(p=>p.side==='ENEMY'&&/Truk/i.test(p.name));
    if(!port) return;
    const H=W.harbor={
      name:port.name,center:{...port.pos},outerRadiusNm:5.6,innerRadiusNm:1.25,
      channelBearing:68,channelHalfWidthNm:0.42,channelSafeHalfWidthNm:0.34,channelDepthFeet:120,innerBasinDepthFeet:110,
      mineInnerNm:2.15,mineOuterNm:4.75,
      netRangeNm:1.82,netHalfSpanNm:1.18,netGapHalfNm:0.28,netMaxDepthFt:320,
      hydrophoneRangeNm:4.6,batteryRangeNm:5.1,
      suspicion:0,alert:0,entered:false,inside:false,lastGunAt:-999,lastSweepAt:-999,
      mines:[]
    };
    // Physical mines: positions are randomised ONCE, not rerolled as the player
    // approaches. The chart only shows the belt and swept channel, never the
    // individual mines.
    let tries=0;
    while(H.mines.length<30&&tries++<300){
      const a=Math.random()*360;
      if(Math.abs(shortDelta(H.channelBearing,a))<13) continue; // swept approach
      const rr=H.mineInnerNm+Math.random()*(H.mineOuterNm-H.mineInnerNm);
      const r=degToRad(a);
      H.mines.push({xNm:H.center.xNm+Math.sin(r)*rr,
                    yNm:H.center.yNm-Math.cos(r)*rr,triggered:false});
    }

    if(!W.contacts.some(c=>c.harborTarget)){
      const put=(id,name,type,displayType,brg,rng,length,tons,value,profile=1)=>{
        const r=degToRad(brg);
        W.contacts.push({id,name,type,displayType,lengthYards:length,visualProfile:profile,
          acousticBase:0.05,tonsFactor:tons,harborValue:value,harborTarget:true,stationary:true,
          position:{xNm:H.center.xNm+Math.sin(r)*rng,yNm:H.center.yNm-Math.cos(r)*rng},
          heading:normDeg(brg+85),speedKnots:0,desiredSpeed:0,baseSpeed:0,convoyRole:'HARBOR'});
      };
      put('H-01','Fleet Oiler','TANKER','FLEET OILER',205,0.72,560,10500,2600,1.12);
      put('H-02','Army Transport','MERCHANT','TROOP TRANSPORT',318,0.62,500,7600,2200,1.02);
      put('H-03','Cargo Vessel','MERCHANT','CARGO SHIP',112,0.92,430,4800,1800,0.96);
      // The jackpot is deliberately uncertain. It is decided at patrol creation
      // and never respawned or moved later.
      if(Math.random()<0.38)
        put('H-04','Japanese Fleet Carrier','CARRIER','FLEET CARRIER',28,0.46,820,26000,9000,1.45);
      else
        put('H-04','Heavy Cruiser','HEAVY_CRUISER','HEAVY CRUISER',28,0.46,660,13500,5200,1.22);
    }

    this.ensureHarborIntel(true);
  }

  /* ══ HARBOR KNOWLEDGE — truth stays in world.harbor / contacts ════════
     Phase 2 makes the chart a record of what the boat actually knows. The
     physical mine points, net geometry and moored ships above remain the
     authoritative world truth; this object stores only reports and observations. */
  ensureHarborIntel(fresh=false){
    const W=this.state.world,H=W.harbor,C=this.state.campaign;
    if(!H) return null;
    // Save migration for patrols created before the navigable swept-channel and
    // closed defensive-net model were introduced.
    if(H.channelSafeHalfWidthNm==null)H.channelSafeHalfWidthNm=.34;
    if(H.channelDepthFeet==null)H.channelDepthFeet=120;
    if(H.innerBasinDepthFeet==null)H.innerBasinDepthFeet=110;
    if(H.netMaxDepthFt==null)H.netMaxDepthFt=320;
    if(!Array.isArray(C.optionalObjectives)) C.optionalObjectives=[];
    let I=W.harborIntel;
    if(!I||fresh){
      I=W.harborIntel={
        harborName:H.name,
        specialSignal:{eligibleAt:480+Math.random()*420,broadcast:false,copied:false,broadcastAt:null,copiedAt:null},
        minefield:{level:'NONE',
          reportCenterDx:(Math.random()-.5)*.55,reportCenterDy:(Math.random()-.5)*.55,
          reportedInnerNm:Math.max(.8,H.mineInnerNm-.45+Math.random()*.35),
          reportedOuterNm:H.mineOuterNm+.55+Math.random()*.65,
          observedInnerNm:Math.max(.8,H.mineInnerNm-.10+Math.random()*.20),
          observedOuterNm:H.mineOuterNm-.08+Math.random()*.16},
        channel:{level:'NONE',
          reportedBearing:normDeg(H.channelBearing+(Math.random()-.5)*16),reportedHalfWidthNm:H.channelHalfWidthNm+.70,
          observedBearing:normDeg(H.channelBearing+(Math.random()-.5)*4),observedHalfWidthNm:H.channelHalfWidthNm+.18},
        net:{known:false,discoveredAt:null,source:null},
        batteries:[],
        heavyUnit:{reported:false,identified:false,identity:null,identifiedAt:null},
        raid:{attempted:false,enteredAt:null,leftAt:null,result:'not_attempted',gateCrossed:false,gateCrossedAt:null,reconComplete:false,lastChannelAlongNm:null}
      };
      return I;
    }
    I.specialSignal=I.specialSignal||{eligibleAt:this.state.time.elapsedSeconds+120,broadcast:false,copied:false,broadcastAt:null,copiedAt:null};
    if(I.specialSignal.eligibleAt==null) I.specialSignal.eligibleAt=this.state.time.elapsedSeconds+120;
    I.minefield=Object.assign({level:'NONE',reportCenterDx:0,reportCenterDy:0,reportedInnerNm:H.mineInnerNm-.2,reportedOuterNm:H.mineOuterNm+.8,observedInnerNm:H.mineInnerNm,observedOuterNm:H.mineOuterNm},I.minefield||{});
    I.channel=Object.assign({level:'NONE',reportedBearing:H.channelBearing+6,reportedHalfWidthNm:H.channelHalfWidthNm+.7,observedBearing:H.channelBearing,observedHalfWidthNm:H.channelHalfWidthNm+.18},I.channel||{});
    I.net=Object.assign({known:false,discoveredAt:null,source:null},I.net||{});
    I.batteries=Array.isArray(I.batteries)?I.batteries:[];
    I.heavyUnit=Object.assign({reported:false,identified:false,identity:null,identifiedAt:null},I.heavyUnit||{});
    I.raid=Object.assign({attempted:false,enteredAt:null,leftAt:null,result:'not_attempted',gateCrossed:false,gateCrossedAt:null,reconComplete:false,lastChannelAlongNm:null},I.raid||{});
    return I;
  }

  harborOptionalObjective(){
    const C=this.state.campaign;
    C.optionalObjectives=Array.isArray(C.optionalObjectives)?C.optionalObjectives:[];
    return C.optionalObjectives.find(o=>o.id==='truk-raid')||null;
  }

  harborIdentityLabel(identity){
    if(/FLEET CARRIER/i.test(identity||'')) return 'Fleet carrier';
    if(/HEAVY CRUISER/i.test(identity||'')) return 'Heavy cruiser';
    return 'Heavy unit';
  }

  refreshHarborOptionalObjective(){
    const I=this.ensureHarborIntel();if(!I||!I.specialSignal.copied) return null;
    const C=this.state.campaign;
    let O=this.harborOptionalObjective();
    if(!O){
      O={id:'truk-raid',text:'Investigate Truk Anchorage',done:false,failed:false,optional:true,result:I.raid.result};
      C.optionalObjectives.push(O);
    }
    const label=I.heavyUnit.identified?this.harborIdentityLabel(I.heavyUnit.identity):null;
    if(I.raid.reconComplete) O.text=`Intelligence complete — ${label||'heavy unit'} identified inside Truk Anchorage`;
    else if(I.raid.gateCrossed) O.text=label?`Confirm ${label.toLowerCase()} inside Truk Anchorage`:'Identify the reported heavy unit inside Truk Anchorage';
    else O.text='Penetrate Truk Anchorage through the swept approach and identify the reported heavy unit';
    O.result=I.raid.result;
    O.done=!!I.raid.reconComplete;
    O.failed=false; // Optional means exactly that: ignoring it is never a patrol failure.
    return O;
  }

  grantHarborSpecialIntel(){
    const I=this.ensureHarborIntel();if(!I||I.specialSignal.copied) return false;
    const now=this.state.time.elapsedSeconds;
    I.specialSignal.copied=true;I.specialSignal.copiedAt=now;I.heavyUnit.reported=true;
    if(I.minefield.level==='NONE') I.minefield.level='REPORTED';
    if(I.channel.level==='NONE') I.channel.level='REPORTED';
    this.refreshHarborOptionalObjective();
    this.notify('OPTIONAL OBJECTIVE — Penetrate Truk Anchorage through the swept approach and identify the reported heavy unit. Visual sightings from outside the torpedo net do not complete the intelligence objective. No penalty if you decline.','warn');
    this.notify('CHART UPDATED — Reported mine belt and swept approach plotted. Keep near the centerline; the passage is charted deep enough for submerged approach. The intelligence objective requires entry inside the torpedo net. Gate not yet located.','warn');
    return true;
  }

  revealHarborNet(source='VISUAL'){
    const I=this.ensureHarborIntel();if(!I||I.net.known) return false;
    I.net.known=true;I.net.discoveredAt=this.state.time.elapsedSeconds;I.net.source=source;
    this.notify(`MAP UPDATED — torpedo net identified at the Truk entrance${source==='CONTACT'?' by close contact':''}. The observed gate is now marked separately from the swept mine approach.`,'warn');
    return true;
  }

  recordHarborBatteryFire(H){
    const I=this.ensureHarborIntel();if(!I||!H) return;
    const now=this.state.time.elapsedSeconds;
    if(I.batteries.some(b=>now-(b.seenAt||0)<45)) return;
    const sub=this.state.playerSub;
    const br=normDeg(bearingBetween(H.center,sub.position)+(Math.random()-.5)*24),r=degToRad(br);
    const rr=.65+Math.random()*.65;
    I.batteries.push({xNm:H.center.xNm+Math.sin(r)*rr,yNm:H.center.yNm-Math.cos(r)*rr,seenAt:now,confidence:'POSSIBLE'});
    if(I.batteries.length>3) I.batteries.shift();
  }

  noteHarborAttack(contact){
    if(!contact?.harborTarget) return;
    const I=this.ensureHarborIntel();if(!I) return;
    I.raid.attempted=true;I.raid.enteredAt=I.raid.enteredAt??this.state.time.elapsedSeconds;
    if(contact.id==='H-04'){
      if(contact.sunk) I.raid.result='sunk';
      else if(shipDamageSeverity(contact)>.05||(contact.gunDamage||0)>0) I.raid.result='damaged';
    }
    this.refreshHarborOptionalObjective();
  }

  updateHarborKnowledge(dt){
    const W=this.state.world,H=W.harbor,sub=this.state.playerSub;if(!H) return;
    const I=this.ensureHarborIntel(),now=this.state.time.elapsedSeconds,env=W.environment;
    const rng=distNm(sub.position,H.center);
    const visual=sub.depthFeet<=65&&rng<=Math.max(.8,Math.min(6,env.visibilityNm*.85));

    // Close reconnaissance can improve or create a defensive plot even without
    // Fleet's special signal; it never creates the optional mission by itself.
    if(visual&&rng<H.mineOuterNm+1.0){
      if(I.minefield.level==='NONE') I.minefield.level='OBSERVED';
      else if(I.minefield.level==='REPORTED') I.minefield.level='OBSERVED';
    }
    if(visual&&rng<H.mineOuterNm+.45&&I.channel.level!=='OBSERVED'){
      I.channel.level='OBSERVED';
      this.notify(`CHART REFINED — swept approach observed. Follow the MAP best-estimate centerline toward ${H.name}; corridor limits remain approximate${I.net.known?', and the net gate is marked separately':'. Net/gate still requires visual reconnaissance'}.`,'warn');
    }

    const segs=this.harborNetSegments(H);
    const netDist=segs.length?Math.min(...segs.map(seg=>this.pointSegNm(sub.position,seg.a,seg.b))):99;
    if((visual&&netDist<.65)||netDist<.075) this.revealHarborNet(netDist<.075?'CONTACT':'VISUAL');

    // Identity comes only from the boat's own visual track. A radio report says
    // HEAVY UNIT and nothing more; hydrophones cannot turn that into a carrier.
    const tr=W.contactTracks['H-04'];
    if(!I.heavyUnit.identified&&tr&&tr.source==='VISUAL'&&tr.confidence>=.65
       &&tr.typeEstimate&&tr.typeEstimate!=='UNKNOWN'&&tr.typeEstimate!=='SURFACE SHIP'){
      I.heavyUnit.identified=true;I.heavyUnit.identity=tr.typeEstimate;I.heavyUnit.identifiedAt=now;
      this.refreshHarborOptionalObjective();
      const label=this.harborIdentityLabel(tr.typeEstimate);
      this.captainLog?.('HEAVY_UNIT_IDENTIFIED',`${label} identified at Truk Anchorage.`,{identity:tr.typeEstimate},'truk-heavy-identified');
      this.notify(`TRUK VISUAL IDENTIFICATION — ${label.toUpperCase()} at anchor.`,'ok');
    }

    this.updateHarborGateProgress(I,H,sub);
    if(I.heavyUnit.identified&&!I.raid.gateCrossed&&!I.raid._outsideIdWarned){
      I.raid._outsideIdWarned=true;
      this.notify('VISUAL IDENTIFICATION MADE — but the intelligence objective still requires penetration inside the torpedo net through the swept approach.','warn');
    }

    const heavy=W.contacts.find(c=>c.id==='H-04'&&c.harborTarget);
    if(heavy?.sunk) I.raid.result='sunk';
    else if((heavy&&shipDamageSeverity(heavy)>.05)||(heavy?.gunDamage||0)>0) I.raid.result='damaged';
    if(rng<H.innerRadiusNm&&!I.raid.attempted){I.raid.attempted=true;I.raid.enteredAt=now;}
    if(I.raid.attempted&&I.raid.result==='not_attempted'&&rng>H.outerRadiusNm+.5){I.raid.result='abandoned';I.raid.leftAt=now;}
    this.refreshHarborOptionalObjective();
  }

  harborChannelFrame(H,pos){
    if(!H||!pos)return{along:99,lateral:99};
    const r=degToRad(H.channelBearing),dx=pos.xNm-H.center.xNm,dy=pos.yNm-H.center.yNm;
    return{along:dx*Math.sin(r)-dy*Math.cos(r),lateral:dx*Math.cos(r)+dy*Math.sin(r)};
  }

  updateHarborGateProgress(I,H,sub){
    if(!I||!H||!sub)return;
    const f=this.harborChannelFrame(H,sub.position),prev=Number(I.raid.lastChannelAlongNm);
    if(!I.raid.gateCrossed&&Number.isFinite(prev)
       &&prev>H.netRangeNm+.025&&f.along<H.netRangeNm-.025
       &&Math.abs(f.lateral)<=H.netGapHalfNm*.92){
      I.raid.gateCrossed=true;I.raid.gateCrossedAt=this.state.time.elapsedSeconds;
      if(!I.raid.attempted){I.raid.attempted=true;I.raid.enteredAt=this.state.time.elapsedSeconds;}
      this.notify('TORPEDO-NET GATE PASSED — inside the defended anchorage. Intelligence objective now requires a firm visual identification of the reported heavy unit.','ok');
    }
    I.raid.lastChannelAlongNm=f.along;
    if(I.raid.gateCrossed&&I.heavyUnit.identified&&!I.raid.reconComplete){
      I.raid.reconComplete=true;if(I.raid.result==='not_attempted'||I.raid.result==='abandoned')I.raid.result='recon_complete';
      this.captainLog?.('TRUK_RECON_COMPLETE',`${this.harborIdentityLabel(I.heavyUnit.identity)} identified after penetrating the Truk torpedo-net gate.`,{identity:I.heavyUnit.identity},'truk-recon-complete');
      this.notify(`INTELLIGENCE OBJECTIVE COMPLETE — ${this.harborIdentityLabel(I.heavyUnit.identity).toUpperCase()} positively identified inside Truk Anchorage.`,'ok');
    }
  }

  harborNetSegments(H){
    if(!H) return [];
    // Defensive boom/net is a ring around the inner anchorage with one opening
    // aligned to the swept approach. The previous two short straight segments
    // could simply be sailed around, making the charted gate optional.
    const segs=[],step=6,gapHalfDeg=radToDeg(Math.asin(clamp(H.netGapHalfNm/Math.max(.1,H.netRangeNm),0,.95)));
    const at=b=>{const r=degToRad(b);return{xNm:H.center.xNm+Math.sin(r)*H.netRangeNm,yNm:H.center.yNm-Math.cos(r)*H.netRangeNm};};
    for(let a=0;a<360;a+=step){const b=a+step,mid=normDeg(a+step*.5);if(Math.abs(shortDelta(H.channelBearing,mid))<=gapHalfDeg)continue;segs.push({a:at(a),b:at(b)});}
    return segs;
  }

  pointSegNm(p,a,b){
    const vx=b.xNm-a.xNm,vy=b.yNm-a.yNm,wx=p.xNm-a.xNm,wy=p.yNm-a.yNm;
    const vv=vx*vx+vy*vy||1e-9,t=clamp((wx*vx+wy*vy)/vv,0,1);
    return Math.hypot(p.xNm-(a.xNm+vx*t),p.yNm-(a.yNm+vy*t));
  }

  harborTorpedoNetHit(pos){
    const H=this.state.world.harbor;if(!H) return false;
    return this.harborNetSegments(H).some(seg=>this.pointSegNm(pos,seg.a,seg.b)<0.024);
  }

  updateHarbor(dt){
    this.ensureWorldExtensions();
    const W=this.state.world,H=W.harbor,sub=this.state.playerSub;
    if(!H||sub.mode==='SUNK') return;
    const now=this.state.time.elapsedSeconds,rng=distNm(sub.position,H.center);
    if(rng<H.outerRadiusNm&&!H.entered){
      H.entered=true;
      const I=this.ensureHarborIntel();
      this.notify(I&&(I.minefield.level!=='NONE'||I.channel.level!=='NONE')
        ?`ENEMY HARBOUR WATERS — ${H.name}. Work from the chart: keep near the swept-approach centerline, treat its limits as approximate, and do not assume the torpedo-net gate is known.`
        :`ENEMY HARBOUR WATERS — ${H.name}. Defences are not charted. Proceed carefully and build the picture yourself.`,'warn');
    }
    if(rng<H.innerRadiusNm&&!H.inside){
      H.inside=true;
      const I=this.ensureHarborIntel();
      this.notify(`INSIDE ${H.name.toUpperCase()} — silhouettes at anchor. High-value targets are close${I?.net?.known?', and the observed net opening is still your way out':'; your exit remains only as good as your reconnaissance'}.`,'ok');
    }else if(rng>H.innerRadiusNm*1.35) H.inside=false;

    // Harbour hydrophones / indicator loops: not magical truth, but sustained
    // screw noise inside the defensive ring builds a suspicion plot.
    const hydro=clamp(1-rng/H.hydrophoneRangeNm,0,1);
    const noise=clamp(sub.stealth.acousticSignature,0,1.5);
    if(hydro>0){
      const prop=Math.max(0,noise-0.035)+Math.max(0,sub.propulsion.speedKnots-3)*0.012;
      H.suspicion+=dt*hydro*prop*0.62;
      if(sub.depthFeet<12) H.suspicion+=dt*hydro*(0.025+W.environment.daylight*0.045);
    }
    const quiet=noise<0.16&&sub.propulsion.speedKnots<4;
    H.suspicion=clamp(H.suspicion-dt*(quiet?0.045:0.012),0,100);

    if(H.suspicion>18&&H.alert<1){
      H.alert=1;
      this.notify(`${H.name}: harbour hydrophones have a possible contact. Searchlights and batteries are standing by.`,'warn');
    }
    if(H.suspicion>46&&H.alert<2){
      H.alert=2;
      this.notify(`HARBOR ALARM — ${H.name} has your approximate position. Searchlights sweeping; coastal batteries ready.`,'bad');
      W.enemy.searchCenter={...sub.position};
    }
    if(H.alert===2&&H.suspicion<12) H.alert=1;
    if(H.alert===1&&H.suspicion<4){H.alert=0;H.searchlightSweepWarned=false;H.lastSearchlightContactAt=-999;}

    // Searchlight sweeps are warnings; the battery only has a useful target if
    // the boat is surfaced/awash. Diving under the beams is therefore real cover.
    const harborWx=weatherBetween(this.state,H.center,sub.position);
    if(H.alert>0&&sub.depthFeet<12&&rng<4.4*harborWx.searchlightFactor&&now-H.lastSweepAt>22){
      H.lastSweepAt=now;
      if(this.startHarborSearchlightSweep)this.startHarborSearchlightSweep(H);
      else{H.searchlightActiveUntil=now+8*harborWx.searchlightFactor;H.searchlightBearing=normDeg(bearingBetween(H.center,sub.position)+(Math.random()-.5)*12);H.searchlightWidthDeg=14;}
      if(!H.searchlightSweepWarned){H.searchlightSweepWarned=true;this.notify('SEARCHLIGHTS SWEEPING THE HARBOUR ENTRANCE — stay below periscope depth or clear the defended approach.','warn');}
      else this.log('Harbour searchlights continue sweeping the entrance.','warn');
      H.suspicion=clamp(H.suspicion+5,0,100);
    }
    if(H.alert>=2&&sub.depthFeet<12&&rng<H.batteryRangeNm&&now-H.lastGunAt>11){
      H.lastGunAt=now;
      this.recordHarborBatteryFire(H);
      if(this.scheduleCoastalBatteryShot){
        const shot=this.scheduleCoastalBatteryShot(H,harborWx);
        if(shot)this.log(`Coastal battery firing — muzzle flash, shell time of flight about ${(shot.impactAt-now).toFixed(1)} seconds.`,'warn');
      }else{
        // Compatibility fallback for builds/tests that do not load Patch 10.
        const env=W.environment;
        const rangeF=clamp(1-rng/H.batteryRangeNm,0,1);
        const light=clamp(env.daylight+(H.alert>=2?0.35:0),0.2,1)*harborWx.searchlightFactor;
        const pHit=rangeF*rangeF*0.42*light*(1-harborWx.seaState*0.28);
        if(Math.random()<pHit){
          const dmg=5+Math.random()*12;
          this.applyShock(dmg);
          this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHORE BATTERY'});
          this.notify(`COASTAL BATTERY HIT — ${dmg.toFixed(0)}% damage. Get below the searchlights!`,'bad');
          audio.playShellImpact?.(bearingBetween(sub.position,H.center),sub.heading,.9);
        }else{
          this.notify('Coastal battery firing — shell splashes close aboard.','bad');
          audio.playShellSplash?.(.35);
        }
      }
    }

    // Mines are actual persistent points. No dice are rolled merely because the
    // player entered a zone: either the hull intersects a mine or it does not.
    if(sub.depthFeet>=4&&sub.depthFeet<=105){
      for(const m of H.mines){
        if(m.triggered||distNm(sub.position,m)>0.042) continue;
        m.triggered=true;H.alert=2;H.suspicion=100;
        const I=this.ensureHarborIntel();if(I&&I.minefield.level==='NONE')I.minefield.level='OBSERVED';
        const dmg=38+Math.random()*28;
        this.applyShock(dmg);
        this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:12,label:'MINE'});
        this.captainLog?.('MINE_STRUCK','Mine struck.',{damage:Math.round(dmg)},`mine:${m.xNm.toFixed(4)}:${m.yNm.toFixed(4)}`);
        this.notify(`MINE! Underwater explosion — ${dmg.toFixed(0)}% damage. You are in mined water; get clear of the field.`,'bad');
        audio.playMineStrike?.();particles.spawnExplosion(sub.position.xNm,sub.position.yNm,1.25,false);
        break;
      }
    }

    // A submarine can foul a net just as a torpedo can. Stop and shove her back
    // rather than leaving the player irretrievably welded to the obstacle.
    if(sub.depthFeet>=4&&sub.depthFeet<=(H.netMaxDepthFt||320)&&now-(H.lastNetAt||-999)>8){
      for(const seg of this.harborNetSegments(H)){
        if(this.pointSegNm(sub.position,seg.a,seg.b)>=0.036) continue;
        H.lastNetAt=now;this.revealHarborNet('CONTACT');
        const back=degToRad(normDeg(sub.heading+180));
        sub.position.xNm+=Math.sin(back)*0.055;sub.position.yNm-=Math.cos(back)*0.055;
        sub.propulsion.actualRpm*=0.08;sub.propulsion.speedKnots*=0.05;
        sub.damage.rudderDamage=clamp(sub.damage.rudderDamage+0.04,0,1);
        this.notify('TORPEDO NET — screws fouled and way off the boat. Back clear and find the gate in the swept channel.','bad');
        H.suspicion=clamp(H.suspicion+18,0,100);
        break;
      }
    }
  }

  // ── WEAPONS ──
}
