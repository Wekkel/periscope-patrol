// ═══════════════════════════════════════════════════ TDC MATH — PACIFIC 1.0
/*
   The TDC and the fish MUST describe the same launch geometry.

   A previous solver treated the torpedo as if it instantly left the boat on
   its final gyro course. The weapon simulation, correctly, sends it straight
   out of the tube for a short settling run and then swings it at a finite turn
   rate. Close shots with a large gyro angle could therefore miss by more than
   a ship length even while the TDC showed an excellent solution.

   This module is the single source of truth for that geometry. It solves the
   straight settling run + circular gyro turn + straight intercept leg and is
   shared by the TDC display, range checks and firing code. Do not reintroduce
   a separate "ideal straight line" solution elsewhere. */
const TDC_LAUNCH_REACH_NM=0.04;
const TDC_TURN_RATE_DEG=8.0;
const TDC_MAX_TUBE_TURN_DEG=90;

function _tdcUnit(headingDeg){const r=degToRad(headingDeg);return{x:Math.sin(r),y:-Math.cos(r)};}
function _tdcTargetTruth(inp){
  const b=degToRad(inp.bearing),own=inp.ownPosition;
  const p={xNm:own.xNm+Math.sin(b)*inp.rangeNm,yNm:own.yNm-Math.cos(b)*inp.rangeNm};
  const u=_tdcUnit(inp.targetCourse),v=knotsNmSec(inp.targetSpeedKnots||0);
  return{position:p,velocity:{x:u.x*v,y:u.y*v}};
}

/* Evaluate one final gyro course for one tube bank. The turn displacement is
   analytic, not frame stepped, so the solution is deterministic and cheap on
   the Helios G88 even while the TDC is continuously tracking. */
function _tdcEvaluateCourse(inp,bank,finalCourse){
  const own=inp.ownPosition,target=_tdcTargetTruth(inp),ts=knotsNmSec(inp.torpedoSpeedKnots||46);
  if(ts<=1e-8)return null;
  const axis=normDeg(inp.ownHeading+(bank==='AFT'?180:0)),turnDeg=shortDelta(axis,finalCourse);
  if(Math.abs(turnDeg)>TDC_MAX_TUBE_TURN_DEG+.001)return null;
  const axisU=_tdcUnit(axis),reach=TDC_LAUNCH_REACH_NM,settleSec=reach/ts;
  let tx=own.xNm+axisU.x*reach,ty=own.yNm+axisU.y*reach;
  const omegaAbs=degToRad(TDC_TURN_RATE_DEG),turnRad=degToRad(turnDeg),turnSec=Math.abs(turnRad)/omegaAbs;
  if(Math.abs(turnRad)>1e-8){
    const a0=degToRad(axis),a1=degToRad(finalCourse),omega=turnRad<0?-omegaAbs:omegaAbs,r=ts/omega;
    // Heading increases clockwise in the game's x-east/y-south coordinates.
    tx+=r*(Math.cos(a0)-Math.cos(a1));
    ty+=r*(Math.sin(a0)-Math.sin(a1));
  }
  const preSec=settleSec+turnSec;
  const targetAtTurn={x:target.position.xNm+target.velocity.x*preSec,y:target.position.yNm+target.velocity.y*preSec};
  const f=_tdcUnit(finalCourse),tvx=target.velocity.x-f.x*ts,tvy=target.velocity.y-f.y*ts;
  const rx=targetAtTurn.x-tx,ry=targetAtTurn.y-ty,vv=tvx*tvx+tvy*tvy;
  let straightSec=vv>1e-12?Math.max(0,-(rx*tvx+ry*tvy)/vv):0;
  let mx=rx+tvx*straightSec,my=ry+tvy*straightSec,miss=Math.hypot(mx,my);
  let hitTime=preSec+straightSec;

  /* Very close targets can be crossed during the settling/gyro arc before the
     straight-leg CPA. Sample that short phase only; it is at most ~11 s and
     therefore costs almost nothing compared with a frame render. */
  // The settling/gyro arc occupies only a small circle around the bow. It can
  // physically cross a target only at point-blank range. Sampling that arc for
  // every candidate course made the continuously worked TDC needlessly costly
  // on low-end mobile CPUs; normal-range solutions use the exact analytic CPA.
  if(inp.rangeNm<.36){
    const sampleN=Math.max(1,Math.ceil(preSec/.5));
    for(let i=0;i<=sampleN;i++){
      const t=preSec*i/sampleN;let px,py;
      if(t<=settleSec||Math.abs(turnRad)<1e-8){
        const d=ts*Math.min(t,settleSec);px=own.xNm+axisU.x*d;py=own.yNm+axisU.y*d;
        if(t>settleSec){const q=ts*(t-settleSec),fu=_tdcUnit(finalCourse);px+=fu.x*q;py+=fu.y*q;}
      }else{
        const tr=t-settleSec,sgn=turnRad<0?-1:1,a0=degToRad(axis),a=a0+sgn*omegaAbs*Math.min(tr,turnSec),omega=sgn*omegaAbs,r=ts/omega;
        px=own.xNm+axisU.x*reach+r*(Math.cos(a0)-Math.cos(a));
        py=own.yNm+axisU.y*reach+r*(Math.sin(a0)-Math.sin(a));
      }
      const qx=target.position.xNm+target.velocity.x*t,qy=target.position.yNm+target.velocity.y*t,d=Math.hypot(qx-px,qy-py);
      if(d<miss){miss=d;hitTime=t;straightSec=Math.max(0,t-preSec);}
    }
  }
  return{bank,axis,finalCourse:normDeg(finalCourse),turnDeg,missNm:miss,timeToImpactSec:hitTime,
    runNm:Math.max(.001,ts*hitTime),preTurnSec:preSec,straightSec};
}

function calcTdcForBank(inp,bank='FWD'){
  if(!inp||!inp.ownPosition||!Number.isFinite(inp.bearing)||!(inp.rangeNm>=0)||!Number.isFinite(inp.targetCourse)||!Number.isFinite(inp.targetSpeedKnots))return null;
  const axis=normDeg(inp.ownHeading+(bank==='AFT'?180:0));
  let best=null;
  const test=(turn)=>{
    const q=_tdcEvaluateCourse(inp,bank,normDeg(axis+turn));if(!q)return;
    // When two courses cross the target equally well, prefer the smaller gyro
    // turn. That makes bank selection stable instead of flickering by 180°.
    const score=q.missNm+Math.abs(q.turnDeg)*0.000002;
    if(!best||score<best.score)best={...q,score};
  };
  for(let a=-88;a<=88.001;a+=8)test(a);
  if(!best)return null;
  for(const [span,step] of [[8,2],[2,.5],[.5,.1]]){
    const centre=best.turnDeg;for(let a=centre-span;a<=centre+span+.0001;a+=step)if(Math.abs(a)<=89.5)test(a);
  }
  return best;
}

function _tdcGeometryLabel(sol,rangeNm){
  if(!sol)return'SWING BOAT';
  const a=Math.abs(sol.turnDeg);
  if(sol.missNm>.04)return'SWING BOAT';
  if(rangeNm<.30&&a>42)return'TOO CLOSE — SWING BOAT';
  if(a<=38)return'GOOD';
  if(a<=62)return'WIDE GYRO';
  if(a<=82)return'VERY WIDE GYRO';
  return'SWING BOAT';
}

function calcTdc(inp){
  const fwd=calcTdcForBank(inp,'FWD'),aft=calcTdcForBank(inp,'AFT');
  const score=s=>s?(s.missNm+Math.abs(s.turnDeg)*0.000002):Infinity;
  const sol=score(fwd)<=score(aft)?fwd:aft;
  if(!sol)return{valid:false,gyroAngle:null,angleOnBow:null,timeToImpactSec:null,solutionQuality:0,launchBank:null,launchGeometry:'NO SOLUTION'};
  const tPos=_tdcTargetTruth(inp).position,l2s=bearingBetween(tPos,inp.ownPosition),aob=Math.abs(shortDelta(inp.targetCourse,l2s));
  const geometry=_tdcGeometryLabel(sol,inp.rangeNm),missQ=clamp(1-sol.missNm/.045,0,1),a=Math.abs(sol.turnDeg);
  const gyroQ=a<=38?1:a<=62?.92:a<=82?.78:.55,rQ=clamp(1-inp.rangeNm/20,.35,1);
  // A mathematically closest path is not automatically a fireable path. At
  // extreme gyro or point-blank geometry the best CPA can still be tens of
  // metres outside a merchant hull. Mark that as SWING BOAT and keep FIRE
  // inhibited instead of showing a misleading high-percentage solution.
  const usableGeometry=!geometry.includes('SWING BOAT');
  const conf=clamp(Number(inp.confidence)||0,0,1),valid=usableGeometry&&sol.missNm<=.04&&sol.timeToImpactSec>0&&Number.isFinite(sol.timeToImpactSec);
  const finalCourse=sol.finalCourse,gyro=shortDelta(inp.ownHeading,finalCourse);
  return{valid,gyroAngle:gyro,tubeTurnDeg:sol.turnDeg,launchBank:sol.bank,launchGeometry:geometry,
    solutionCourse:finalCourse,angleOnBow:aob,timeToImpactSec:sol.timeToImpactSec,interceptRunNm:sol.runNm,
    predictedMissNm:sol.missNm,solutionQuality:valid?clamp(conf*(.70+rQ*.16+gyroQ*.14)*(.72+.28*missQ),0,1):0};
}

/* One range calculation for weapons, map and scope. Prefer the exact launch
   geometry calculated by TDC 2.0; keep the old iterative fallback so older
   saved states and partially-entered manual solutions still render safely. */
function torpedoInterceptRunNm(tdc,spec){
  if(Number.isFinite(tdc?.interceptRunNm)&&tdc.interceptRunNm>0)return tdc.interceptRunNm;
  const r0=Number(tdc&&tdc.rangeNm)||0;
  const tv=Number(tdc&&tdc.targetSpeedKnots)||0, sv=Number(spec&&spec.speedKnots)||46;
  if(!tv||tdc.targetCourse==null||tdc.bearing==null) return r0;
  const away=Math.cos(degToRad(shortDelta(tdc.targetCourse,tdc.bearing)));
  let run=r0;for(let i=0;i<3;i++){const hours=run/Math.max(sv,.1);run=Math.max(.05,r0+tv*away*hours);}return run;
}

function torpedoRangeInfo(state,preferredId){
  if(!state||!state.playerSub||!state.tdc)return null;
  const tdc=state.tdc,spec=TORPEDO_SPECS[tdc.torpedoSpecKey];if(!spec)return null;
  const id=preferredId||state.tactical?.selectedTrackId||tdc.targetId;if(!id)return null;
  const sub=state.playerSub,tr=state.world?.contactTracks?.[id];
  let pos=null,bearing=tdc.bearing,rangeNm=tdc.rangeNm,course=tdc.targetCourse,speed=tdc.targetSpeedKnots,confidence=.65;
  if(tr){const br=degToRad(tr.bearing||0);pos=tr.plotPosition||tr.lastFixPosition||{xNm:sub.position.xNm+Math.sin(br)*(tr.rangeEstimateNm||0),yNm:sub.position.yNm-Math.cos(br)*(tr.rangeEstimateNm||0)};
    rangeNm=distNm(sub.position,pos);bearing=bearingBetween(sub.position,pos);course=tr.courseEstimate;speed=tr.speedEstimateKnots;confidence=tr.confidence||confidence;}
  if(!(rangeNm>=0))return null;
  const geom=Number.isFinite(course)&&Number.isFinite(speed)?calcTdc({ownPosition:sub.position,ownHeading:sub.heading,bearing,rangeNm,targetCourse:course,targetSpeedKnots:speed,torpedoSpeedKnots:spec.speedKnots,confidence}):null;
  const runNm=geom?.valid?geom.interceptRunNm:torpedoInterceptRunNm({rangeNm,bearing,targetCourse:course,targetSpeedKnots:speed},spec),marginNm=spec.maxRangeNm-runNm,band=marginNm<0?'OUT':runNm>spec.maxRangeNm*.85?'BORDERLINE':'IN';
  return{id,pos,spec,rangeNm,runNm,maxNm:spec.maxRangeNm,marginNm,band,geometry:geom,
    label:band==='IN'?'IN RANGE':band==='BORDERLINE'?'BORDERLINE':`LONG BY ${(-marginNm).toFixed(1)} NM`};
}
