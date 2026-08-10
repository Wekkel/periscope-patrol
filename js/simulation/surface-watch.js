// ═══════════════════════════════════════════════════ SURFACE WATCH / BRIDGE
// Pure helpers shared by the bridge station, lookout detection and tests.
// The bridge is a view onto information the surfaced watch can physically see;
// it does not create a second world model or an omniscient contact list.
const BRIDGE_VIEW={
  maxDepthFt:12,
  normalFovDeg:82,
  binocularFovDeg:24,
  cameraHeightM:7.2
};

function bridgeZoomAmount(state){
  const T=state?.tactical||{};
  const z=Number(T.bridgeZoom);
  return Number.isFinite(z)?clamp(z,0,1):(T.bridgeBinoculars?1:0);
}

function bridgeFovDeg(state){
  const z=bridgeZoomAmount(state),e=z*z*(3-2*z);
  return lerp(BRIDGE_VIEW.normalFovDeg,BRIDGE_VIEW.binocularFovDeg,e);
}

function bridgeMagnification(state){
  const fov=bridgeFovDeg(state);
  return Math.tan(degToRad(BRIDGE_VIEW.normalFovDeg)/2)/Math.tan(degToRad(fov)/2);
}

function bridgeCanUse(state){
  const sub=state?.playerSub;
  return !!sub&&sub.mode!=='SUNK'&&(sub.depthFeet||0)<=BRIDGE_VIEW.maxDepthFt;
}

function bridgeVisualLimitNm(state,contact){
  const sub=state?.playerSub,env=state?.world?.environment||{};
  const vis=Math.max(.5,sub&&contact?weatherVisibilityBetween(state,sub.position,contact.position):(Number(env.visibilityNm)||.5));
  if(!sub)return 0;
  if(contact?.type==='RAFT'){
    if((sub.depthFeet||0)<8)return Math.min(3.2,vis*.30);
    if((sub.depthFeet||0)<=65)return Math.min(1.8,vis*.17);
    return 0;
  }
  if((sub.depthFeet||0)<8){
    let smoke=(contact&&!contact.stationary&&(contact.speedKnots||0)>=4)
      ?(contact.type==='TANKER'?1.20:isSurfaceCombatant(contact)?1.10:1.16):1.04;
    if(contact?.shipDamage){const D=ensureShipDamage(contact);smoke*=1+clamp(D.fire*.42+D.propulsion*.12,0,.52);}
    return vis*smoke;
  }
  if((sub.depthFeet||0)<=65)return vis*.86;
  return 0;
}


function scopeOpticalFovDeg(state){
  const T=state?.tactical||{};
  if(typeof SCOPE_OPTICS!=='undefined'){
    const o=SCOPE_OPTICS[T.periscopeZoom===1?0:1];if(o&&Number.isFinite(o.fov))return o.fov;
  }
  return T.periscopeZoom===1?32:8;
}

// A visual fix is chart/fire-control knowledge, not a render-frame side effect.
// Once the skipper has actually resolved a hull, lower-grade sensors may add
// information but they may not replace that fix immediately. Forty-five seconds
// is long enough to swap SCOPE -> MAP / TDC without flicker, short enough that a
// ship which disappears in rain or behind the horizon soon reverts to a paper plot.
const VISUAL_FIX_MEMORY_SEC=45;
function visualFixAgeSec(state,tr){
  const now=state?.time?.elapsedSeconds||0,at=Number.isFinite(tr?.visualLastSeenAt)?tr.visualLastSeenAt:(Number.isFinite(tr?.hullConfirmedAt)?tr.hullConfirmedAt:-9999);
  return Math.max(0,now-at);
}
function hasFreshVisualFix(state,tr,maxAgeSec=VISUAL_FIX_MEMORY_SEC){
  return !!tr?.visualHullConfirmed&&visualFixAgeSec(state,tr)<=maxAgeSec;
}

/* One definition of a visually resolvable periscope hull, shared by sensor
   acquisition and the optical renderer. It also returns a quality estimate so
   the TDC gets the same answer as the picture rather than an unrelated generic
   confidence percentage. */
function scopeHullObservation(state,contact,requireStation=true){
  const sub=state?.playerSub,T=state?.tactical;
  const out={visible:false,quality:0,rangeNm:Infinity,limitNm:0,bearing:0,offsetDeg:180,fovDeg:scopeOpticalFovDeg(state)};
  if(!sub||!T||!contact||contact.sunk)return out;
  if(requireStation&&T.activeStation!=='PERISCOPE')return out;
  if((sub.depthFeet||0)<8||(sub.depthFeet||0)>65)return out;
  const rng=distNm(sub.position,contact.position),limit=Math.max(.05,bridgeVisualLimitNm(state,contact));
  const bear=bearingBetween(sub.position,contact.position),off=Math.abs(shortDelta(T.periscopeBearing,bear)),fov=out.fovDeg;
  out.rangeNm=rng;out.limitNm=limit;out.bearing=bear;out.offsetDeg=off;
  if(rng>limit*1.02||off>fov*.52)return out;
  const rangeQ=clamp(1-rng/(limit*1.08),0,1),centreQ=clamp(1-off/Math.max(.1,fov*.55),0,1),high=T.periscopeZoom===1?0:1;
  out.quality=clamp(.86+rangeQ*.08+centreQ*.03+high*.02,.86,.99);out.visible=true;
  return out;
}
function scopeCanResolveHull(state,contact,requireStation=true){return scopeHullObservation(state,contact,requireStation).visible;}

function _bridgeHashUnit(seed,text,tag=0){
  let h=(Number(seed)||1)*2654435761+tag*2246822519;
  const s=String(text||'');
  for(let i=0;i<s.length;i++)h=((h^s.charCodeAt(i))*16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967295;
}

function bridgeObservation(state,contact,binoculars=false){
  const sub=state.playerSub,seed=state.campaign?.scenarioSeed||1;
  const z=typeof binoculars==='number'?clamp(binoculars,0,1):(binoculars?1:0);
  const bucket=Math.floor((state.time?.elapsedSeconds||0)/15);
  const tag=`${contact.id}:${bucket}`;
  const trueBearing=bearingBetween(sub.position,contact.position),trueRange=distNm(sub.position,contact.position);
  const brErr=(_bridgeHashUnit(seed,tag,11)*2-1)*lerp(.65,.20,z);
  const rangeErr=(_bridgeHashUnit(seed,tag,17)*2-1)*lerp(.055,.023,z);
  const bearing=normDeg(trueBearing+brErr),rangeNm=Math.max(.03,trueRange*(1+rangeErr)),r=degToRad(bearing);
  return{
    bearing,rangeNm,
    position:{xNm:sub.position.xNm+Math.sin(r)*rangeNm,yNm:sub.position.yNm-Math.cos(r)*rangeNm},
    bearingErrorDeg:brErr,rangeErrorPct:rangeErr
  };
}
