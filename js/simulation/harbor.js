const HarborSystem={
  /* ══ ENEMY HARBOUR / SPECIAL OPERATION ══════════════════════════════
     The campaign authors the location, geometry, targets and presentation. This
     engine owns only the reusable defended-harbour mechanics: persistent mines,
     swept approach, torpedo net, hydrophones, searchlights and coastal batteries. */
  ensureHarborWorldState(){
    const W=this.state.world, G=this.state.weapons, C=this.state.campaign;
    if(!Array.isArray(W.portScenes))W.portScenes=materializePortScenes(PATROL_AREAS[C.patrolArea]);
    if(!Array.isArray(C.optionalObjectives)) C.optionalObjectives=[]; // migrate pre-Phase-2 saves
    if(W.harborInitialized===undefined) W.harborInitialized=false; // migrate old saves
    const subProfile=getSubmarineProfile(this.state.playerSub?.profileId);
    if(!G.deckGun) G.deckGun={manned:false,ammo:subProfile.weapons.deckGun.ammo,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1};
    G.deckGun.shells=G.deckGun.shells||[];G.deckGun.splashes=G.deckGun.splashes||[];
    if(!W.harborInitialized) this.setupHarbor(C.patrolArea);
    if(W.harbor) this.ensureHarborIntel();
    else if(W.harborIntel===undefined) W.harborIntel=null;
  },

  harborOperationProfile(){
    return getCampaignHarborOperationProfile(this.state.campaign?.campaignProfileId);
  },

  validateHarborApproachWater(H){
    if(!H||typeof this.isNavigableMapPoint!=='function')return{ok:true,lastSafeNm:H?.mineOuterNm||0};
    const valid=(bearing,maxAlong)=>{const r=degToRad(bearing),edge=H.channelHalfWidthNm+.70,inner=.75,steps=Math.max(2,Math.ceil((maxAlong-inner)/.2));for(let i=0;i<=steps;i++){const a=inner+(maxAlong-inner)*i/steps;for(const side of [-edge,0,edge]){const p={xNm:H.center.xNm+Math.sin(r)*a+Math.cos(r)*side,yNm:H.center.yNm-Math.cos(r)*a+Math.sin(r)*side};if(!this.isNavigableMapPoint(p,30))return false;}}return true;};
    const outer=H.mineOuterNm+.55;if(valid(H.channelBearing,outer))return{ok:true,lastSafeNm:outer};
    for(let delta=8;delta<=88;delta+=8)for(const sign of [-1,1]){const b=normDeg(H.channelBearing+delta*sign);if(valid(b,outer)){H.channelBearing=b;return{ok:true,lastSafeNm:outer};}}
    let last=.75;for(let a=.95;a<=outer;a+=.2){if(valid(H.channelBearing,a))last=a;else break;}return{ok:false,lastSafeNm:last};
  },

  setupHarbor(areaKey){
    const W=this.state.world, area=PATROL_AREAS[areaKey], op=this.harborOperationProfile();
    W.harborInitialized=true; W.harbor=null;
    if(!area||!op||areaKey!==op.areaKey) return;
    const port=(area.ports||[]).find(p=>p.side==='ENEMY'&&p.name===op.portName);
    if(!port) return;
    const g=op.geometry||{};
    const H=W.harbor={
      name:port.name,shortName:op.shortName||port.name,operationId:op.id,optionalObjectiveId:op.optionalObjectiveId,heavyTargetId:op.targets?.heavy?.id||null,
      center:{...port.pos},outerRadiusNm:g.outerRadiusNm,innerRadiusNm:g.innerRadiusNm,
      channelBearing:g.channelBearing,channelHalfWidthNm:g.channelHalfWidthNm,channelSafeHalfWidthNm:g.channelSafeHalfWidthNm,channelDepthFeet:g.channelDepthFeet,innerBasinDepthFeet:g.innerBasinDepthFeet,
      mineInnerNm:g.mineInnerNm,mineOuterNm:g.mineOuterNm,
      netRangeNm:g.netRangeNm,netHalfSpanNm:g.netHalfSpanNm,netGapHalfNm:g.netGapHalfNm,netMaxDepthFt:g.netMaxDepthFt,
      hydrophoneRangeNm:g.hydrophoneRangeNm,batteryRangeNm:g.batteryRangeNm,
      suspicion:0,alert:0,entered:false,inside:false,lastGunAt:-999,lastSweepAt:-999,
      mines:[]
    };
    const approach=this.validateHarborApproachWater(H);
    if(!approach.ok){H.approachStatus='LIMITED';H.approachLimitNm=approach.lastSafeNm;H.mineOuterNm=Math.min(H.mineOuterNm,Math.max(H.mineInnerNm+.4,approach.lastSafeNm-.55));}
    else H.approachStatus='CLEAR';
    // Physical mines: positions are randomised ONCE, not rerolled as the player
    // approaches. The chart only shows the belt and swept channel, never the
    // individual mines.
    const mineSpec=op.mines||{};let tries=0;
    while(H.mines.length<(mineSpec.count||0)&&tries++<(mineSpec.maxPlacementAttempts||0)){
      const a=Math.random()*360;
      if(Math.abs(shortDelta(H.channelBearing,a))<(mineSpec.channelExclusionDeg||0)) continue;
      const rr=H.mineInnerNm+Math.random()*(H.mineOuterNm-H.mineInnerNm);
      const r=degToRad(a);
      H.mines.push({xNm:H.center.xNm+Math.sin(r)*rr,
                    yNm:H.center.yNm-Math.cos(r)*rr,triggered:false});
    }

    if(!W.contacts.some(c=>c.harborTarget)){
      const put=spec=>{
        const r=degToRad(spec.bearing);
        W.contacts.push(materializeVesselIdentity({id:spec.id,name:spec.name,type:spec.type,vesselProfileId:spec.vesselProfileId,displayType:spec.displayType,lengthYards:spec.lengthYards,visualProfile:spec.visualProfile,
          acousticBase:0.05,tonsFactor:spec.tonsFactor,harborValue:spec.harborValue,harborTarget:true,stationary:true,
          position:{xNm:H.center.xNm+Math.sin(r)*spec.rangeNm,yNm:H.center.yNm-Math.cos(r)*spec.rangeNm},
          heading:normDeg(spec.bearing+85),speedKnots:0,desiredSpeed:0,baseSpeed:0,convoyRole:'HARBOR'},this.state));
      };
      for(const spec of op.targets?.fixed||[])put(spec);
      // The high-value identity is deliberately uncertain. It is decided at patrol
      // creation and never respawned or moved later.
      const heavy=op.targets?.heavy;
      if(heavy){const variant=Math.random()<heavy.chance?heavy.high:heavy.low;put({...variant,id:heavy.id});}
    }

    this.ensureHarborIntel(true);
  },

  /* ══ HARBOR KNOWLEDGE — truth stays in world.harbor / contacts ════════
     Phase 2 makes the chart a record of what the boat actually knows. The
     physical mine points, net geometry and moored ships above remain the
     authoritative world truth; this object stores only reports and observations. */
  ensureHarborIntel(fresh=false){
    const W=this.state.world,H=W.harbor,C=this.state.campaign,op=this.harborOperationProfile();
    if(!H||!op) return null;
    const g=op.geometry||{};
    // Additive save migration: old Pacific patrols predate the explicit special-
    // operation identity but already contain the authoritative harbor truth.
    if(H.operationId==null)H.operationId=op.id;
    if(H.optionalObjectiveId==null)H.optionalObjectiveId=op.optionalObjectiveId;
    if(H.heavyTargetId==null)H.heavyTargetId=op.targets?.heavy?.id||null;
    if(H.shortName==null)H.shortName=op.shortName||H.name;
    if(H.channelSafeHalfWidthNm==null)H.channelSafeHalfWidthNm=g.channelSafeHalfWidthNm;
    if(H.channelDepthFeet==null)H.channelDepthFeet=g.channelDepthFeet;
    if(H.innerBasinDepthFeet==null)H.innerBasinDepthFeet=g.innerBasinDepthFeet;
    if(H.netMaxDepthFt==null)H.netMaxDepthFt=g.netMaxDepthFt;
    if(!Array.isArray(C.optionalObjectives)) C.optionalObjectives=[];
    let I=W.harborIntel;
    if(!I||fresh){
      I=W.harborIntel={
        harborName:H.name,
        specialSignal:{eligibleAt:(op.intel?.eligibleBaseSec||0)+Math.random()*(op.intel?.eligibleSpreadSec||0),broadcast:false,copied:false,broadcastAt:null,copiedAt:null},
        minefield:{level:'NONE',
          reportCenterDx:(Math.random()-.5)*.55,reportCenterDy:(Math.random()-.5)*.55,
          reportedInnerNm:Math.max(.8,H.mineInnerNm-.45+Math.random()*.35),
          reportedOuterNm:H.mineOuterNm+.55+Math.random()*.65,
          observedInnerNm:Math.max(.8,H.mineInnerNm-.10+Math.random()*.20),
          observedOuterNm:H.mineOuterNm-.08+Math.random()*.16},
        channel:{level:'NONE',
          reportedBearing:normDeg(H.channelBearing+(Math.random()-.5)*16),reportedHalfWidthNm:H.channelHalfWidthNm+.70,
          /* Observed geometry is now a confirmed visual fix. The reported
             plot keeps uncertainty; the observed plot must match the physical
             channel so every point shown as observed remains waypointable. */
          observedBearing:normDeg(H.channelBearing),observedHalfWidthNm:H.channelHalfWidthNm},
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
  },

  harborOptionalObjective(){
    const C=this.state.campaign,H=this.state.world.harbor;
    C.optionalObjectives=Array.isArray(C.optionalObjectives)?C.optionalObjectives:[];
    return H?.optionalObjectiveId?C.optionalObjectives.find(o=>o.id===H.optionalObjectiveId)||null:null;
  },

  harborIdentityLabel(identity){
    const raw=String(identity||'HEAVY UNIT').trim().toLowerCase();
    return raw?raw[0].toUpperCase()+raw.slice(1):'Heavy unit';
  },

  refreshHarborOptionalObjective(){
    const I=this.ensureHarborIntel();if(!I||!I.specialSignal.copied) return null;
    const C=this.state.campaign,H=this.state.world.harbor;
    let O=this.harborOptionalObjective();
    if(!O){
      O={id:H.optionalObjectiveId,text:`Investigate ${H.name}`,done:false,failed:false,optional:true,result:I.raid.result};
      C.optionalObjectives.push(O);
    }
    const label=I.heavyUnit.identified?this.harborIdentityLabel(I.heavyUnit.identity):null;
    if(I.raid.reconComplete) O.text=`Intelligence complete — ${label||'heavy unit'} identified inside ${H.name}`;
    else if(I.raid.gateCrossed) O.text=label?`Confirm ${label.toLowerCase()} inside ${H.name}`:`Identify the reported heavy unit inside ${H.name}`;
    else O.text=`Penetrate ${H.name} through the swept approach and identify the reported heavy unit`;
    O.result=I.raid.result;
    O.done=!!I.raid.reconComplete;
    O.failed=false; // Optional means exactly that: ignoring it is never a patrol failure.
    return O;
  },

  grantHarborSpecialIntel(){
    const I=this.ensureHarborIntel();if(!I||I.specialSignal.copied) return false;
    const now=this.state.time.elapsedSeconds;
    I.specialSignal.copied=true;I.specialSignal.copiedAt=now;I.heavyUnit.reported=true;
    if(I.minefield.level==='NONE') I.minefield.level='REPORTED';
    if(I.channel.level==='NONE') I.channel.level='REPORTED';
    this.refreshHarborOptionalObjective();
    const H=this.state.world.harbor;
    this.notify(`OPTIONAL OBJECTIVE — Penetrate ${H.name} through the swept approach and identify the reported heavy unit. Visual sightings from outside the torpedo net do not complete the intelligence objective. No penalty if you decline.`,'warn', 'KRITIEK');
    this.notify('CHART UPDATED — Reported mine belt and swept approach plotted. Keep near the centerline; the passage is charted deep enough for submerged approach. The intelligence objective requires entry inside the torpedo net. Gate not yet located.','warn', 'KRITIEK');
    return true;
  },

  revealHarborNet(source='VISUAL'){
    const I=this.ensureHarborIntel();if(!I||I.net.known) return false;
    I.net.known=true;I.net.discoveredAt=this.state.time.elapsedSeconds;I.net.source=source;
    const H=this.state.world.harbor;this.notify(`MAP UPDATED — torpedo net identified at the ${H.shortName} entrance${source==='CONTACT'?' by close contact':''}. The observed gate is now marked separately from the swept mine approach.`,'warn', 'KRITIEK');
    return true;
  },

  recordHarborBatteryFire(H){
    const I=this.ensureHarborIntel();if(!I||!H) return;
    const now=this.state.time.elapsedSeconds;
    if(I.batteries.some(b=>now-(b.seenAt||0)<45)) return;
    const sub=this.state.playerSub;
    const br=normDeg(bearingBetween(H.center,sub.position)+(Math.random()-.5)*24),r=degToRad(br);
    const rr=.65+Math.random()*.65;
    I.batteries.push({xNm:H.center.xNm+Math.sin(r)*rr,yNm:H.center.yNm-Math.cos(r)*rr,seenAt:now,confidence:'POSSIBLE'});
    if(I.batteries.length>3) I.batteries.shift();
  },

  noteHarborAttack(contact){
    if(!contact?.harborTarget) return;
    const I=this.ensureHarborIntel();if(!I) return;
    I.raid.attempted=true;I.raid.enteredAt=I.raid.enteredAt??this.state.time.elapsedSeconds;
    const H=this.state.world.harbor;if(contact.id===H?.heavyTargetId){
      if(contact.sunk) I.raid.result='sunk';
      else if(shipDamageSeverity(contact)>.05||(contact.gunDamage||0)>0) I.raid.result='damaged';
    }
    this.refreshHarborOptionalObjective();
  },

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
      this.notify(`CHART REFINED — swept approach observed. Follow the MAP best-estimate centerline toward ${H.name}; corridor limits remain approximate${I.net.known?', and the net gate is marked separately':'. Net/gate still requires visual reconnaissance'}.`,'warn', 'NUTTIG');
    }

    const segs=this.harborNetSegments(H);
    const netDist=segs.length?Math.min(...segs.map(seg=>this.pointSegNm(sub.position,seg.a,seg.b))):99;
    if((visual&&netDist<.65)||netDist<.075) this.revealHarborNet(netDist<.075?'CONTACT':'VISUAL');

    // Identity comes only from the boat's own visual track. A radio report says
    // HEAVY UNIT and nothing more; hydrophones cannot turn that into a carrier.
    const tr=W.contactTracks[H.heavyTargetId];
    if(!I.heavyUnit.identified&&tr&&tr.source==='VISUAL'&&tr.confidence>=.65
       &&tr.typeEstimate&&tr.typeEstimate!=='UNKNOWN'&&tr.typeEstimate!=='SURFACE SHIP'){
      I.heavyUnit.identified=true;I.heavyUnit.identity=tr.typeEstimate;I.heavyUnit.identifiedAt=now;
      this.refreshHarborOptionalObjective();
      const label=this.harborIdentityLabel(tr.typeEstimate),events=this.harborOperationProfile()?.events||{};
      this.captainLog?.(events.visualIdentifiedId||'HEAVY_UNIT_IDENTIFIED',`${label} identified at ${H.name}.`,{identity:tr.typeEstimate},events.visualIdentifiedKey||'heavy-unit-identified');
      this.notify(`${events.visualBanner||'VISUAL IDENTIFICATION'} — ${label.toUpperCase()} at anchor.`,'ok', 'NUTTIG');
    }

    this.updateHarborGateProgress(I,H,sub);
    if(I.heavyUnit.identified&&!I.raid.gateCrossed&&!I.raid._outsideIdWarned){
      I.raid._outsideIdWarned=true;
      this.notify('VISUAL IDENTIFICATION MADE — but the intelligence objective still requires penetration inside the torpedo net through the swept approach.','warn', 'KRITIEK');
    }

    const heavy=W.contacts.find(c=>c.id===H.heavyTargetId&&c.harborTarget);
    if(heavy?.sunk) I.raid.result='sunk';
    else if((heavy&&shipDamageSeverity(heavy)>.05)||(heavy?.gunDamage||0)>0) I.raid.result='damaged';
    if(rng<H.innerRadiusNm&&!I.raid.attempted){I.raid.attempted=true;I.raid.enteredAt=now;}
    if(I.raid.attempted&&I.raid.result==='not_attempted'&&rng>H.outerRadiusNm+.5){I.raid.result='abandoned';I.raid.leftAt=now;}
    this.refreshHarborOptionalObjective();
  },

  harborChannelFrame(H,pos){
    if(!H||!pos)return{along:99,lateral:99};
    const r=degToRad(H.channelBearing),dx=pos.xNm-H.center.xNm,dy=pos.yNm-H.center.yNm;
    return{along:dx*Math.sin(r)-dy*Math.cos(r),lateral:dx*Math.cos(r)+dy*Math.sin(r)};
  },

  updateHarborGateProgress(I,H,sub){
    if(!I||!H||!sub)return;
    const f=this.harborChannelFrame(H,sub.position),prev=Number(I.raid.lastChannelAlongNm);
    if(!I.raid.gateCrossed&&Number.isFinite(prev)
       &&prev>H.netRangeNm+.025&&f.along<H.netRangeNm-.025
       &&Math.abs(f.lateral)<=H.netGapHalfNm*.92){
      I.raid.gateCrossed=true;I.raid.gateCrossedAt=this.state.time.elapsedSeconds;
      if(!I.raid.attempted){I.raid.attempted=true;I.raid.enteredAt=this.state.time.elapsedSeconds;}
      this.notify('TORPEDO-NET GATE PASSED — inside the defended anchorage. Intelligence objective now requires a firm visual identification of the reported heavy unit.','ok', 'KRITIEK');
    }
    I.raid.lastChannelAlongNm=f.along;
    if(I.raid.gateCrossed&&I.heavyUnit.identified&&!I.raid.reconComplete){
      I.raid.reconComplete=true;if(I.raid.result==='not_attempted'||I.raid.result==='abandoned')I.raid.result='recon_complete';
      const events=this.harborOperationProfile()?.events||{};
      this.captainLog?.(events.reconCompleteId||'HARBOR_RECON_COMPLETE',`${this.harborIdentityLabel(I.heavyUnit.identity)} identified after penetrating the ${H.shortName} torpedo-net gate.`,{identity:I.heavyUnit.identity},events.reconCompleteKey||'harbor-recon-complete');
      this.notify(`INTELLIGENCE OBJECTIVE COMPLETE — ${this.harborIdentityLabel(I.heavyUnit.identity).toUpperCase()} positively identified inside ${H.name}.`,'ok', 'KRITIEK');
    }
  },

  harborNetSegments(H){
    if(!H) return [];
    // Defensive boom/net is a ring around the inner anchorage with one opening
    // aligned to the swept approach. The previous two short straight segments
    // could simply be sailed around, making the charted gate optional.
    const segs=[],step=6,gapHalfDeg=radToDeg(Math.asin(clamp(H.netGapHalfNm/Math.max(.1,H.netRangeNm),0,.95)));
    const at=b=>{const r=degToRad(b);return{xNm:H.center.xNm+Math.sin(r)*H.netRangeNm,yNm:H.center.yNm-Math.cos(r)*H.netRangeNm};};
    for(let a=0;a<360;a+=step){const b=a+step,mid=normDeg(a+step*.5);if(Math.abs(shortDelta(H.channelBearing,mid))<=gapHalfDeg)continue;segs.push({a:at(a),b:at(b)});}
    return segs;
  },

  pointSegNm(p,a,b){
    const vx=b.xNm-a.xNm,vy=b.yNm-a.yNm,wx=p.xNm-a.xNm,wy=p.yNm-a.yNm;
    const vv=vx*vx+vy*vy||1e-9,t=clamp((wx*vx+wy*vy)/vv,0,1);
    return Math.hypot(p.xNm-(a.xNm+vx*t),p.yNm-(a.yNm+vy*t));
  },

  harborTorpedoNetHit(pos){
    const H=this.state.world.harbor;if(!H) return false;
    return this.harborNetSegments(H).some(seg=>this.pointSegNm(pos,seg.a,seg.b)<0.024);
  },

  updateHarbor(dt){
    const W=this.state.world,H=W.harbor,sub=this.state.playerSub;
    if(!H||sub.mode==='SUNK') return;
    const now=this.state.time.elapsedSeconds,rng=distNm(sub.position,H.center);
    if(rng<H.outerRadiusNm&&!H.entered){
      H.entered=true;
      const I=this.ensureHarborIntel();
      this.notify(I&&(I.minefield.level!=='NONE'||I.channel.level!=='NONE')
        ?`ENEMY HARBOUR WATERS — ${H.name}. Work from the chart: keep near the swept-approach centerline, treat its limits as approximate, and do not assume the torpedo-net gate is known.`
        :`ENEMY HARBOUR WATERS — ${H.name}. Defences are not charted. Proceed carefully and build the picture yourself.`,'warn', 'NUTTIG');
    }
    if(rng<H.innerRadiusNm&&!H.inside){
      H.inside=true;
      const I=this.ensureHarborIntel();
      this.notify(`INSIDE ${H.name.toUpperCase()} — silhouettes at anchor. High-value targets are close${I?.net?.known?', and the observed net opening is still your way out':'; your exit remains only as good as your reconnaissance'}.`,'ok', 'NUTTIG');
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
      this.notify(`${H.name}: harbour hydrophones have a possible contact. Searchlights and batteries are standing by.`,'warn', 'KRITIEK');
    }
    if(H.suspicion>46&&H.alert<2){
      H.alert=2;
      this.notify(`HARBOR ALARM — ${H.name} has your approximate position. Searchlights sweeping; coastal batteries ready.`,'bad', 'KRITIEK');
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
      if(!H.searchlightSweepWarned){H.searchlightSweepWarned=true;this.notify('SEARCHLIGHTS SWEEPING THE HARBOUR ENTRANCE — stay below periscope depth or clear the defended approach.','warn', 'KRITIEK');}
      else this.log('Harbour searchlights continue sweeping the entrance.','warn');
      H.suspicion=clamp(H.suspicion+5,0,100);
    }
    if(H.alert>=2&&sub.depthFeet<12&&rng<H.batteryRangeNm&&now-H.lastGunAt>11){
      H.lastGunAt=now;
      this.sys.harbor.recordHarborBatteryFire(H);
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
          this.sys.damage.applyShock(dmg);
          this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHORE BATTERY'});
          this.notify(`COASTAL BATTERY HIT — ${dmg.toFixed(0)}% damage. Get below the searchlights!`,'bad', 'KRITIEK');
          PresentationBridge.audio(this.state).playShellImpact?.(bearingBetween(sub.position,H.center),sub.heading,.9);
        }else{
          this.notify('Coastal battery firing — shell splashes close aboard.','bad', 'KRITIEK');
          PresentationBridge.audio(this.state).playShellSplash?.(.35);
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
        this.sys.damage.applyShock(dmg);
        this.state.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:12,label:'MINE'});
        this.captainLog?.('MINE_STRUCK','Mine struck.',{damage:Math.round(dmg)},`mine:${m.xNm.toFixed(4)}:${m.yNm.toFixed(4)}`);
        this.notify(`MINE! Underwater explosion — ${dmg.toFixed(0)}% damage. You are in mined water; get clear of the field.`,'bad', 'KRITIEK');
        PresentationBridge.audio(this.state).playMineStrike?.();particles.spawnExplosion(sub.position.xNm,sub.position.yNm,1.25,false);
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
        this.notify('TORPEDO NET — screws fouled and way off the boat. Back clear and find the gate in the swept channel.','bad', 'KRITIEK');
        H.suspicion=clamp(H.suspicion+18,0,100);
        break;
      }
    }
  },

  // ── WEAPONS ──
  startHarborSearchlightSweep(H){
    if(!H)return null;const now=this.state.time.elapsedSeconds,W=this.state.world,sub=this.state.playerSub;
    const datum=W.enemy?.searchCenter||sub.position,center=bearingBetween(H.center,datum),span=H.alert>=2?32:44;
    H.searchlightSweep={startedAt:now,duration:H.alert>=2?13:16,centerBearing:center,spanDeg:span,phase:Math.random()<.5?0:1};
    H.searchlightActiveUntil=now+H.searchlightSweep.duration;H.searchlightBearing=normDeg(center-span);
    H.searchlightContactUntil=Math.min(H.searchlightContactUntil||-1,now);
    return H.searchlightSweep;
  },

  scheduleCoastalBatteryShot(H,harborWx){
    const A=this.ensureBattleAtmosphereState(),s=this.state,sub=s.playerSub,now=s.time.elapsedSeconds;if(!H)return null;
    const sites=H.batterySites||[H.center],site=sites[(H._batterySiteCursor=(H._batterySiteCursor||0)+1)%sites.length],rng=distNm(site,sub.position);
    const flight=clamp(1.5+rng*1.25,2.0,8.5),lit=now<(H.searchlightContactUntil||-1),day=clamp(s.world.environment.daylight||0,0,1);
    const predicted=battlePredictPosition(sub.position,sub.heading,sub.propulsion.speedKnots,flight);
    let correction=clamp(H.batteryCorrection||1,.32,1.25);
    if(!lit)correction=Math.max(correction,.85);
    const baseErr=(lit?.012:.065)+(1-harborWx.searchlightFactor)*.08+harborWx.seaState*.025+(1-day)*.012;
    const err=baseErr*correction,ang=Math.random()*Math.PI*2,rad=err*(.25+Math.sqrt(Math.random())*.95);
    const impact={xNm:predicted.xNm+Math.cos(ang)*rad,yNm:predicted.yNm+Math.sin(ang)*rad};
    const id=`CB-${A.nextId++}`,ev={id,kind:'COASTAL',sourceId:'SHORE BATTERY',origin:{...site},targetAtFire:{...sub.position},impactPosition:impact,
      fireAt:now,impactAt:now+flight,damage:5+Math.random()*12,litAtFire:lit,resolved:false};
    A.shells.push(ev);if(A.shells.length>20)A.shells.shift();
    A.muzzleFlashes.push({id:`MF-${id}`,position:{...site},at:now,until:now+.34,power:1.0,kind:'COASTAL'});if(A.muzzleFlashes.length>BATTLE_MAX_FLASHES)A.muzzleFlashes.shift();
    const br=bearingBetween(sub.position,site);PresentationBridge.audio(this.state).playDistantGunfire?.(br,sub.heading,clamp(1-rng/7,.25,1));
    this.aar.recordEvent('COASTAL_GUNFIRE','Coastal battery opened fire.',{batteryShot:id,illuminated:lit},site,impact);
    return ev;
  },

};
