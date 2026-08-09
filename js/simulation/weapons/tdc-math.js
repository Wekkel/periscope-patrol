// ═══════════════════════════════════════════════════ TDC MATH
function calcTdc(inp){
  const bRad=degToRad(inp.bearing);
  const own=inp.ownPosition;
  const tPos={xNm:own.xNm+Math.sin(bRad)*inp.rangeNm,yNm:own.yNm-Math.cos(bRad)*inp.rangeNm};
  const tSpd=knotsNmSec(inp.targetSpeedKnots);
  const cRad=degToRad(inp.targetCourse);
  const tVel={x:Math.sin(cRad)*tSpd,y:-Math.cos(cRad)*tSpd};
  const r={x:tPos.xNm-own.xNm,y:tPos.yNm-own.yNm};
  const ts=knotsNmSec(inp.torpedoSpeedKnots);
  const a=tVel.x*tVel.x+tVel.y*tVel.y-ts*ts;
  const b=2*(r.x*tVel.x+r.y*tVel.y);
  const c=r.x*r.x+r.y*r.y;
  const disc=b*b-4*a*c;
  if(disc<0||Math.abs(a)<1e-9)return{valid:false,gyroAngle:null,angleOnBow:null,timeToImpactSec:null,solutionQuality:0};
  const sq=Math.sqrt(disc);
  const t=[(-b-sq)/(2*a),(-b+sq)/(2*a)].filter(t=>t>0).sort((x,y)=>x-y)[0];
  if(!t||!Number.isFinite(t))return{valid:false,gyroAngle:null,angleOnBow:null,timeToImpactSec:null,solutionQuality:0};
  const ipt={xNm:tPos.xNm+tVel.x*t,yNm:tPos.yNm+tVel.y*t};
  const iBear=bearingBetween(own,ipt);
  const gyro=shortDelta(inp.ownHeading,iBear);
  const l2s=bearingBetween(tPos,own);
  const aob=Math.abs(shortDelta(inp.targetCourse,l2s));
  const rQ=clamp(1-inp.rangeNm/18,0.15,1);
  const gQ=clamp(1-Math.abs(gyro)/90,0.1,1);
  return{valid:true,gyroAngle:gyro,angleOnBow:aob,timeToImpactSec:t,
    solutionQuality:clamp(inp.confidence*(0.55+rQ*0.25+gQ*0.2),0,1)};
}

/* One range calculation for weapons, map and scope. The important distance is
   the run to the INTERCEPT, not just the present slant range. Keeping this in
   one helper prevents the UI saying "in range" while the firing code says no. */
function torpedoInterceptRunNm(tdc,spec){
  const r0=Number(tdc&&tdc.rangeNm)||0;
  const tv=Number(tdc&&tdc.targetSpeedKnots)||0, sv=Number(spec&&spec.speedKnots)||46;
  if(!tv||tdc.targetCourse==null||tdc.bearing==null) return r0;
  const away=Math.cos(degToRad(shortDelta(tdc.targetCourse,tdc.bearing)));
  let run=r0;
  for(let i=0;i<3;i++){
    const hours=run/Math.max(sv,0.1);              // nm / kn = hours
    run=Math.max(0.05,r0+tv*away*hours);
  }
  return run;
}

function torpedoRangeInfo(state,preferredId){
  if(!state||!state.playerSub||!state.tdc) return null;
  const tdc=state.tdc;
  const spec=TORPEDO_SPECS[tdc.torpedoSpecKey]||TORPEDO_SPECS.mk14fast;
  if(!spec) return null;
  const id=preferredId||state.tactical?.selectedTrackId||tdc.targetId;
  if(!id) return null;
  const sub=state.playerSub;
  const tr=state.world?.contactTracks?.[id];
  let pos=null,bearing=tdc.bearing,rangeNm=tdc.rangeNm,course=tdc.targetCourse,speed=tdc.targetSpeedKnots;
  if(tr){
    const br=degToRad(tr.bearing||0);
    pos=tr.plotPosition||tr.lastFixPosition||{
      xNm:sub.position.xNm+Math.sin(br)*(tr.rangeEstimateNm||0),
      yNm:sub.position.yNm-Math.cos(br)*(tr.rangeEstimateNm||0)
    };
    rangeNm=distNm(sub.position,pos);
    bearing=bearingBetween(sub.position,pos);
    course=tr.courseEstimate;
    speed=tr.speedEstimateKnots;
  }
  if(!(rangeNm>=0)) return null;
  const runNm=torpedoInterceptRunNm({rangeNm,bearing,targetCourse:course,targetSpeedKnots:speed},spec);
  const marginNm=spec.maxRangeNm-runNm;
  const band=marginNm<0?'OUT':runNm>spec.maxRangeNm*0.85?'BORDERLINE':'IN';
  return{id,pos,spec,rangeNm,runNm,maxNm:spec.maxRangeNm,marginNm,band,
    label:band==='IN'?'IN RANGE':band==='BORDERLINE'?'BORDERLINE':`LONG BY ${(-marginNm).toFixed(1)} NM`};
}

