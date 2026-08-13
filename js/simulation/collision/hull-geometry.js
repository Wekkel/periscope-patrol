// ═══════════════════════════════════════════════════ VESSEL HULL GEOMETRY
// Shared 2-D collision geometry for every surface-vessel interaction. The deck
// gun uses the same oriented hull rectangle as physical vessel collisions.
const HullGeometry=(()=>{
  // Historical contact schema calls the field `lengthYards`, but authored ship
  // lengths are feet (destroyer ~350, merchant ~420, tanker ~520). Rendering
  // already uses feet; collision geometry must use the same physical hull or
  // weapons/collisions can register well outside the visible ship.
  const NM_PER_FOOT=0.3048/1852;

  const axes=h=>{
    const r=degToRad(h.heading||0),fx=Math.sin(r),fy=-Math.cos(r);
    return[{x:fx,y:fy},{x:-fy,y:fx}];
  };
  const dot=(a,b)=>a.x*b.x+a.y*b.y;
  const support=(h,axis)=>{
    const [f,s]=axes(h);
    return Math.abs(dot(f,axis))*h.halfLengthNm+Math.abs(dot(s,axis))*h.halfBeamNm;
  };
  const centerAt=(h,t)=>({
    xNm:lerp(h.start.xNm,h.end.xNm,t),
    yNm:lerp(h.start.yNm,h.end.yNm,t)
  });
  const asMotionHull=(h)=>{
    if(h.start&&h.end)return h;
    const p=h.position||h.center||{xNm:0,yNm:0};
    return{...h,start:{...p},end:{...p}};
  };
  const gameplayType=c=>typeof vesselGameplayType==='function'?vesselGameplayType(c):String(c?.gameplayType||c?.type||'MERCHANT').toUpperCase();
  const beamRatio=c=>['ESCORT','WARSHIP','PATROL_CRAFT'].includes(gameplayType(c))?10.5:7.2;
  const draftFeet=c=>{
    if(c.draftFeet!=null)return c.draftFeet;
    if(/CARRIER/i.test(c.displayType||''))return 31;
    if(/CRUISER/i.test(c.displayType||''))return 23;
    if(['ESCORT','WARSHIP','PATROL_CRAFT'].includes(gameplayType(c)))return 15;
    if(gameplayType(c)==='TANKER')return 36;
    return clamp(24+((c.lengthYards||400)-350)*0.025,22,32);
  };
  const massTons=c=>{
    if(c.massTons!=null)return c.massTons;
    if(c.tonsFactor>0)return c.tonsFactor;
    if(['ESCORT','WARSHIP','PATROL_CRAFT'].includes(gameplayType(c)))return clamp((c.lengthYards||320)*6.4,420,2800);
    return clamp((c.lengthYards||400)*10,2200,8000);
  };

  function shipHull(c,position=c.position,heading=c.heading){
    const lenNm=(c.lengthYards||400)*NM_PER_FOOT;
    return{kind:'SHIP',id:c.id,position:{...position},heading:heading||0,
      halfLengthNm:lenNm*0.5,halfBeamNm:lenNm/beamRatio(c)*0.5,
      draftFeet:draftFeet(c),massTons:massTons(c),source:c};
  }
  function subHull(sub,position=sub.position,heading=sub.heading){
    // New patrols materialize dimensions on playerSub. Legacy v1 saves may not
    // have them, so fall back through the Pacific-default profile until the
    // formal save-schema migration stamps an explicit submarine identity.
    const profile=getSubmarineProfile(sub?.profileId),dims=sub?.dimensions||profile.dimensions;
    return{kind:'SUB',id:'OWN_SUB',position:{...position},heading:heading||0,
      halfLengthNm:dims.lengthFt*NM_PER_FOOT*0.5,
      halfBeamNm:dims.beamFt*NM_PER_FOOT*0.5,
      verticalHalfFeet:dims.verticalHalfFeet,massTons:dims.massTons,source:sub};
  }
  function motionHull(h,start,end,startHeading=h.heading,endHeading=startHeading){
    return{...h,start:{...start},end:{...end},heading:normDeg(startHeading+shortDelta(startHeading,endHeading)*0.5)};
  }
  function verticalOverlap(sub,ship){
    const sh=sub.kind==='SUB'?sub:subHull(sub);
    const vh=sh.verticalHalfFeet||9;
    const depth=sh.source?.depthFeet??sub.depthFeet??0;
    const top=depth-vh,bottom=depth+vh;
    const draft=ship.draftFeet??draftFeet(ship.source||ship);
    return bottom>0&&top<draft;
  }
  function rectOverlap(a,b){
    const A=asMotionHull(a),B=asMotionHull(b),ca=A.end||A.position,cb=B.end||B.position;
    const d={x:cb.xNm-ca.xNm,y:cb.yNm-ca.yNm};
    for(const ax of [...axes(A),...axes(B)]) if(Math.abs(dot(d,ax))>support(A,ax)+support(B,ax)+1e-12)return false;
    return true;
  }

  // Exact continuous SAT for linearly translated OBBs with fixed orientation.
  // In normal simulation turns are <= a few degrees per one-second substep; the
  // average heading therefore gives a stable swept test while preventing a fast
  // crossing from tunnelling through a narrow hull.
  function movingHullIntersection(aPrev,aNow,bPrev,bNow){
    const A=motionHull(aNow,aPrev.position||aPrev.start||aPrev,aNow.position||aNow.end||aNow,
      aPrev.heading??aNow.heading,aNow.heading??aPrev.heading);
    const B=motionHull(bNow,bPrev.position||bPrev.start||bPrev,bNow.position||bNow.end||bNow,
      bPrev.heading??bNow.heading,bNow.heading??bPrev.heading);
    const d0={x:B.start.xNm-A.start.xNm,y:B.start.yNm-A.start.yNm};
    const dv={x:(B.end.xNm-B.start.xNm)-(A.end.xNm-A.start.xNm),
              y:(B.end.yNm-B.start.yNm)-(A.end.yNm-A.start.yNm)};
    let enter=0,exit=1,hitAxis=null;
    for(const ax of [...axes(A),...axes(B)]){
      const r=support(A,ax)+support(B,ax),p=dot(d0,ax),v=dot(dv,ax);
      if(Math.abs(v)<1e-14){if(Math.abs(p)>r)return null;continue;}
      let t0=(-r-p)/v,t1=(r-p)/v;if(t0>t1)[t0,t1]=[t1,t0];
      if(t0>enter){enter=t0;hitAxis={...ax};}
      exit=Math.min(exit,t1);
      if(enter>exit||exit<0||enter>1)return null;
    }
    const t=clamp(enter,0,1),ca=centerAt(A,t),cb=centerAt(B,t);
    if(!hitAxis){const dx=cb.xNm-ca.xNm,dy=cb.yNm-ca.yNm,l=Math.hypot(dx,dy)||1;hitAxis={x:dx/l,y:dy/l};}
    const sep={x:cb.xNm-ca.xNm,y:cb.yNm-ca.yNm};
    if(dot(sep,hitAxis)<0){hitAxis.x*=-1;hitAxis.y*=-1;}
    return{t,normal:hitAxis,aCenter:ca,bCenter:cb};
  }

  function velocity(entity){
    const r=degToRad(entity.heading||0),s=knotsNmSec(entity.speedKnots??entity.propulsion?.speedKnots??0);
    return{x:Math.sin(r)*s,y:-Math.cos(r)*s};
  }
  function closestApproach(aEntity,bEntity,horizonSec=90,aHull=null,bHull=null){
    const ap=aEntity.position,bp=bEntity.position,av=velocity(aEntity),bv=velocity(bEntity);
    const rx=bp.xNm-ap.xNm,ry=bp.yNm-ap.yNm,vx=bv.x-av.x,vy=bv.y-av.y;
    const vv=vx*vx+vy*vy;
    const rawTimeSec=vv>1e-16?-(rx*vx+ry*vy)/vv:0;
    const t=clamp(rawTimeSec,0,horizonSec);
    const pa={xNm:ap.xNm+av.x*t,yNm:ap.yNm+av.y*t},pb={xNm:bp.xNm+bv.x*t,yNm:bp.yNm+bv.y*t};
    const dx=pb.xNm-pa.xNm,dy=pb.yNm-pa.yNm,centerNm=Math.hypot(dx,dy);
    const axis=centerNm>1e-10?{x:dx/centerNm,y:dy/centerNm}:{x:1,y:0};
    const A=aHull||(aEntity.playerSub||aEntity.propulsion?subHull(aEntity):shipHull(aEntity));
    const B=bHull||(bEntity.playerSub||bEntity.propulsion?subHull(bEntity):shipHull(bEntity));
    const clearanceNm=centerNm-support(A,axis)-support(B,axis);
    return{timeSec:t,rawTimeSec,centerNm,clearanceNm,positionA:pa,positionB:pb,relativeSpeedKnots:Math.hypot(vx,vy)*3600};
  }

  function segmentHullIntersection(a,b,hull){
    const H=hull, r=degToRad(H.heading||0),fx=Math.sin(r),fy=-Math.cos(r),px=-fy,py=fx;
    const local=q=>{const dx=q.xNm-H.position.xNm,dy=q.yNm-H.position.yNm;return{x:dx*fx+dy*fy,y:dx*px+dy*py};};
    const p0=local(a),p1=local(b),dx=p1.x-p0.x,dy=p1.y-p0.y;
    let u0=0,u1=1;
    const clip=(p,q)=>{if(Math.abs(p)<1e-12)return q>=0;const rr=q/p;if(p<0){if(rr>u1)return false;if(rr>u0)u0=rr;}else{if(rr<u0)return false;if(rr<u1)u1=rr;}return true;};
    if(!clip(-dx,p0.x+H.halfLengthNm)||!clip(dx,H.halfLengthNm-p0.x)||!clip(-dy,p0.y+H.halfBeamNm)||!clip(dy,H.halfBeamNm-p0.y))return null;
    return{u:u0,along:p0.x+dx*u0,lateral:p0.y+dy*u0,lenNm:H.halfLengthNm*2,halfB:H.halfBeamNm};
  }

  return{shipHull,subHull,motionHull,verticalOverlap,rectOverlap,movingHullIntersection,closestApproach,segmentHullIntersection,massTons,draftFeet,velocity};
})();
// Intentional short aliases: these are the general primitives future patches use.
const shipHull=HullGeometry.shipHull;
const subHull=HullGeometry.subHull;
const movingHullIntersection=HullGeometry.movingHullIntersection;
const closestApproach=HullGeometry.closestApproach;

// Patch 10.5 — combat capability helpers.
// Ship "type" is presentation/history; tactical AI should ask what a hull can do.
// This lets ambient patrol craft and destroyers participate in ASW without
// pretending that every surface combatant is the same class of escort.
const SURFACE_COMBATANT_TYPES=new Set(['ESCORT','WARSHIP','PATROL_CRAFT','DESTROYER','KAIBOKAN','HEAVY_CRUISER','CARRIER']);
const ASW_COMBATANT_TYPES=new Set(['ESCORT','WARSHIP','PATROL_CRAFT','DESTROYER','KAIBOKAN']);
function isSurfaceCombatant(c){
  return !!c&&!c.sunk&&(!c.side||c.side==='ENEMY')&&SURFACE_COMBATANT_TYPES.has(vesselGameplayType(c));
}
function hasSonar(c){
  if(!isSurfaceCombatant(c))return false;
  if(c.hasSonar!==undefined)return !!c.hasSonar;
  // Heavy cruisers/carriers may fight on the surface but are not silently
  // promoted into destroyer-grade ASW searchers just because they are armed.
  return ASW_COMBATANT_TYPES.has(vesselGameplayType(c));
}
function canProsecuteSubmarine(c){
  if(!isSurfaceCombatant(c)||!hasSonar(c))return false;
  return (c.dcRemaining===undefined?28:c.dcRemaining)>0;
}
function isASWCombatant(c){return isSurfaceCombatant(c)&&hasSonar(c);}
function isEscortLike(c){return !!c&&ASW_COMBATANT_TYPES.has(vesselGameplayType(c))&&isSurfaceCombatant(c);}

