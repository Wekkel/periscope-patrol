class SimEngineIntel extends SimEngineAAGun {
  updateRadio(dt){
    const W=this.state.world, sub=this.state.playerSub;
    const now=this.state.time.elapsedSeconds;
    W.radio=W.radio||{pending:null,inbox:[],unread:0,nextBroadcast:240,copying:0};
    const R=W.radio;

    if(!R.pending){
      // Truk's special report is a broadcast like any other: knowing that the
      // transmitter is up is not the same as copying the message. Once its
      // window opens, give it a near-term radio slot but never create mission
      // knowledge until applySignal() is reached after 40 seconds of copy.
      const HI=this.ensureHarborIntel?.();
      if(HI&&!HI.specialSignal.copied&&!HI.specialSignal.broadcast
         &&now>=HI.specialSignal.eligibleAt&&R.nextBroadcast>30) R.nextBroadcast=30;
      /* If the boat has held nothing for a long while, the trail is cold and
         another eight hours of empty sea is not a game. Fleet sends an
         amplifying report: the same convoy, freshly fixed. You still have to
         run the intercept — you just are not searching a blank ocean. */
      const held=Object.values(W.contactTracks||{}).some(t=>t&&!t.sunk&&t.contactType!=='ESCORT'&&(t.staleSeconds||0)<600);
      if(held) R.coldFor=0; else R.coldFor=(R.coldFor||0)+dt;
      if(R.coldFor>1500&&R.nextBroadcast>90){ R.nextBroadcast=90; R.forceUltra=true; }
      R.nextBroadcast-=dt;
      if(R.nextBroadcast<=0){
        R.nextBroadcast=900+Math.random()*700;
        R.pending=this.composeSignal();
        this.log('Radio room: shore broadcast is up. Antenna depth to copy it.','warn');
      }
      return;
    }
    // antenna needs to be at or near the surface
    const canCopy=sub.depthFeet<42&&sub.damage.hullIntegrity>5;
    if(canCopy){
      R.copying+=dt;
      if(R.copying>40){
        const m=R.pending;R.pending=null;R.copying=0;
        m.time=now;m.seq=(R.seq=(R.seq||0)+1);R.inbox.unshift(m);R.unread++;
        if(R.inbox.length>12) R.inbox.pop();
        this.applySignal(m);
        audio.playWaypoint();
      }
    }else if(R.copying>0){
      R.copying=Math.max(0,R.copying-dt*2);
    }
  }

  composeSignal(){
    const W=this.state.world, camp=this.state.campaign;
    const HI=this.ensureHarborIntel?.();
    if(HI&&!HI.specialSignal.copied&&!HI.specialSignal.broadcast
       &&this.state.time.elapsedSeconds>=HI.specialSignal.eligibleAt){
      HI.specialSignal.broadcast=true;HI.specialSignal.broadcastAt=this.state.time.elapsedSeconds;
      return{type:'SPECIAL INTELLIGENCE',subject:'TRUK ANCHORAGE',harborSpecial:true,
        text:`HEAVY UNIT REPORTED AT TRUK ANCHORAGE. DEPARTURE UNKNOWN. ATTACK AT COMMANDING OFFICER'S DISCRETION.`};
    }
    const alive=W.contacts.filter(c=>!c.sunk&&c.type!=='ESCORT'&&!c.harborTarget);
    const R=W.radio||{};
    const forced=!!R.forceUltra; R.forceUltra=false;
    if(forced) R.coldFor=0;
    const roll=forced?0:Math.random();
    if(alive.length&&roll<0.5){
      const t=alive[Math.floor(Math.random()*alive.length)];
      // the intelligence is a few hours old and carries an error, as it did
      /* An amplifying report is fresher and tighter than a routine decrypt —
         that is the whole point of asking for one. */
      const err=forced?(0.4+Math.random()*0.8):(0.8+Math.random()*2.2);
      const ageSec=forced?(600+Math.random()*1800):(1800+Math.random()*7200);
      const back=knotsNmSec(t.speedKnots)*ageSec;
      const route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route);
      let pos,courseDeg=t.heading,routeS=null,routeDir=null;
      if(t.convoyId==='MAIN'&&path&&path.length>1){
        const cur=routeProject(path,t.position);
        // Walk backwards along the actual shipping lane, then put the reporting
        // error mostly along that lane. The fix remains plausible water, never land.
        const hist=routeAdvance(path,cur.s,W.convoyLeg||1,-back);
        const noisy=routeAdvance(path,hist.s,hist.dir,(Math.random()-0.5)*2*err);
        pos=noisy.pos;courseDeg=noisy.heading;routeS=noisy.s;routeDir=noisy.dir;
      }else{
        const br=degToRad(t.heading);
        pos={xNm:t.position.xNm-Math.sin(br)*back,yNm:t.position.yNm+Math.cos(br)*back};
      }
      return{type:'ULTRA',subject:forced?'CONVOY ROUTING — AMPLIFYING REPORT':'CONVOY ROUTING',
        text:`ULTRA. Convoy of ${alive.length} in ${camp.patrolArea}. Position at ${(ageSec/3600).toFixed(1)} hours ago: ${pos.xNm.toFixed(1)}E ${(-pos.yNm).toFixed(1)}N, course ${fmtDeg(courseDeg)}, speed ${t.speedKnots.toFixed(0)} knots. Run ahead of her track and intercept.`,
        intel:{pos,courseDeg,speedKn:t.speedKnots,ageSec,routeS,routeDir,uncBaseNm:err}};
    }
    if(roll<0.68){
      return{type:'WARNING',subject:'AIR ACTIVITY',
        text:`Enemy air patrols reported over ${camp.patrolArea}. Remain submerged during daylight where practicable.`,
        airThreat:0.5+Math.random()*0.7};
    }
    if(roll<0.82){
      return{type:'ORDERS',subject:'LIFEGUARD STATION',
        text:`Carrier strike scheduled. Take lifeguard station and report. Any airman recovered counts toward the patrol.`,
        score:250};
    }
    return{type:'INFO',subject:'WEATHER',
      text:`Front moving through the area within the next twelve hours. Expect reduced visibility and rising sea.`,
      weather:true};
  }

  /* ── WHAT DO I ACTUALLY KNOW? ──────────────────────────────────────
     A signal log answers the wrong question. What a skipper wants off the
     radio is: where is the nearest thing worth shooting, how stale is that
     information, and which way do I steer. This works that out from the
     ULTRA plot and from every contact the boat has held itself, and hands
     back one ranked list — nearest first, with the age of each fix. */
  intelSummary(){
    const s=this.state, sub=s.playerSub, W=s.world, now=s.time.elapsedSeconds;
    const out=[];
    const U=W.ultra;
    if(U){
      const age=now-U.reportedAt;
      if(age<=6*3600){
        const run=knotsNmSec(U.speedKn)*age;
        const route=(W.convoyRoutes||[])[0],path=route?.waterPath;
        const routed=path&&path.length>1&&U.routeS!=null&&U.routeDir!=null;
        const nowFix=routed?routeAdvance(path,U.routeS,U.routeDir,run):null;
        const dr=routed?nowFix.pos:(()=>{const r=degToRad(U.courseDeg);return{xNm:U.reportPos.xNm+Math.sin(r)*run,yNm:U.reportPos.yNm-Math.cos(r)*run};})();
        const rng=distNm(sub.position,dr);
        // is she opening or closing? compare with where the lane puts her in ten minutes
        const fwd=routed?routeAdvance(path,nowFix.s,nowFix.dir,knotsNmSec(U.speedKn)*600).pos
                         :(()=>{const r=degToRad(U.courseDeg),r2=knotsNmSec(U.speedKn)*600;return{xNm:dr.xNm+Math.sin(r)*r2,yNm:dr.yNm-Math.cos(r)*r2};})();
        /* Two solutions: one at the speed she is making now, one at flank on
           the roof. If only the second exists, the answer to "why can I never
           find them" is: you have to surface and run. */
        const now2=sub.propulsion.speedKnots;
        out.push({kind:'ULTRA',name:'Convoy (ULTRA estimate)',pos:dr,rngNm:rng,
          brg:bearingBetween(sub.position,dr),ageSec:age,courseDeg:(nowFix?.heading??U.courseDeg),speedKn:U.speedKn,
          closing:distNm(sub.position,fwd)<rng,
          icptNow:this.interceptSolution(dr,U.courseDeg,U.speedKn,now2),
          icptFlank:this.interceptSolution(dr,U.courseDeg,U.speedKn,17.5),
          uncNm:clamp((U.uncBaseNm||0.8)+U.speedKn*age/3600*0.10,0.8,9)});
      }
    }
    for(const tr of Object.values(W.contactTracks||{})){
      if(!tr||tr.sunk||tr.confidence<=0.05||tr.id==='ULTRA') continue;
      const br=degToRad(tr.bearing), rg=tr.rangeEstimateNm||0;
      const pos=tr.plotPosition||{xNm:sub.position.xNm+Math.sin(br)*rg,yNm:sub.position.yNm-Math.cos(br)*rg};
      out.push({kind:tr.contactType==='ESCORT'?'ESCORT':'CONTACT',
        name:tr.typeEstimate==='UNKNOWN'?`Unknown contact ${tr.id}`:`${tr.typeEstimate} ${tr.id}`,
        pos,rngNm:rg,brg:tr.bearing,ageSec:tr.staleSeconds||0,
        courseDeg:tr.courseEstimate,speedKn:tr.speedEstimateKnots,
        icptNow:tr.courseEstimate!=null?this.interceptSolution(pos,tr.courseEstimate,tr.speedEstimateKnots||0,sub.propulsion.speedKnots):null,
        icptFlank:tr.courseEstimate!=null?this.interceptSolution(pos,tr.courseEstimate,tr.speedEstimateKnots||0,17.5):null,
        confidence:tr.confidence,source:tr.source});
    }
    out.sort((a,b)=>a.rngNm-b.rngNm);
    return out;
  }

  /* ══ CAN I CUT HER OFF, AND ON WHAT COURSE? ═══════════════════════════
     Steering at the bearing to a moving convoy is a PURSUIT curve: you end
     up in her wake doing her speed, and you never arrive. What you want is
     the collision course — the heading that holds her on a constant bearing
     while the range closes. It is a quadratic, and it has no solution when
     she is faster than you on the geometry you have; knowing THAT is worth
     as much as the answer, because it tells you to surface and run, or to
     give her up and look elsewhere.

     Returns {courseDeg, timeSec, point} or null if she cannot be caught. */
  interceptSolution(tgtPos,tgtCourseDeg,tgtSpeedKn,ownSpeedKn){
    const sub=this.state.playerSub;
    if(!(ownSpeedKn>0.1)) return null;
    const px=tgtPos.xNm-sub.position.xNm, py=tgtPos.yNm-sub.position.yNm;
    const tr=degToRad(tgtCourseDeg||0);
    const vx=Math.sin(tr)*tgtSpeedKn, vy=-Math.cos(tr)*tgtSpeedKn;   // nm per hour
    const a=vx*vx+vy*vy-ownSpeedKn*ownSpeedKn;
    const b=2*(px*vx+py*vy);
    const c=px*px+py*py;
    let t=null;
    if(Math.abs(a)<1e-6){ if(b<-1e-9) t=-c/b; }
    else{
      const disc=b*b-4*a*c;
      if(disc>=0){
        const rt=Math.sqrt(disc);
        const t1=(-b+rt)/(2*a), t2=(-b-rt)/(2*a);
        const cands=[t1,t2].filter(x=>x>1e-6).sort((x,y)=>x-y);
        if(cands.length) t=cands[0];
      }
    }
    if(t===null||!isFinite(t)) return null;
    const point={xNm:tgtPos.xNm+vx*t,yNm:tgtPos.yNm+vy*t};
    return {courseDeg:bearingBetween(sub.position,point),timeSec:t*3600,point};
  }

  applySignal(m){
    const W=this.state.world;
    if(m.harborSpecial) this.log(`SPECIAL INTELLIGENCE — ${m.text}`,'warn');
    else this.log(`RADIO — ${m.subject}: ${m.text}`,'warn');
    if(m.harborSpecial) this.grantHarborSpecialIntel?.();
    if(m.intel){
      // An ULTRA signal is a position report that is already some hours old.
      // It is plotted where the convoy WAS, and dead-reckoned forward from the
      // reported course and speed — that estimate is what you steer to
      // intercept. It is a fixed plot in the sea, not a marker on your boat.
      W.ultra={reportPos:this.clampToArea(m.intel.pos),courseDeg:m.intel.courseDeg,speedKn:m.intel.speedKn,
        routeS:m.intel.routeS??null,routeDir:m.intel.routeDir??null,uncBaseNm:m.intel.uncBaseNm??0.8,
        reportedAt:this.state.time.elapsedSeconds-(m.intel.ageSec||0),
        receivedAt:this.state.time.elapsedSeconds,label:m.subject};
      delete W.contactTracks['ULTRA'];
      Toast.ok('ULTRA intercept plotted — steer to cut her off');
    }
    if(m.airThreat){W.airThreat=W.airThreat||{};W.airThreat.level=m.airThreat;}
    if(m.score) this.state.campaign.score+=m.score;
    if(m.weather){
      const env=W.environment;
      env.seaState=clamp(env.seaState+0.2,0,1);
      env.visibilityNm=clamp(env.visibilityNm*0.75,3,20);
      env.weather=env.seaState>0.6?'STORM':'OVERCAST';
    }
  }

  /* ── THEIR LOOKOUTS ────────────────────────────────────────────────
     A submarine is a very small mark: three metres of freeboard and a black
     hull. A destroyer is a hundred metres with a thirty-metre mast. That size
     difference is why the boat almost always sights the escort first, and why
     the night surface attack worked at all. A periscope is smaller again —
     an inch of tube and a feather of wake if you are moving.              */
}
