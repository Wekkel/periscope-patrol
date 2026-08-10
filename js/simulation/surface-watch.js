// ═══════════════════════════════════════════════════ SURFACE WATCH / BRIDGE
// Pure helpers shared by the bridge station, lookout detection and tests.
// The bridge is a view onto information the surfaced watch can physically see;
// it does not create a second world model or an omniscient contact list.
const BRIDGE_VIEW={
  maxDepthFt:12,
  normalFovDeg:72,
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

/* ══════════ PERISCOPE VISUAL COHERENCE ═══════════════════════════════
   These helpers are deliberately defined in surface-watch.js because that
   script loads before both simulation/physics-navigation.js and the 3-D
   renderers.  Older/intermediate builds called these names directly, while
   later patches had inlined the same logic.  Keeping one canonical pair here
   prevents a mixed/stale PWA cache from turning SCOPE into a ReferenceError
   and gives rendering + MAP acquisition exactly the same definition of a
   resolved hull. */
function crewCanSeeSurfaceHull(state,contact,opts={}){
  if(!state||!contact||!state.playerSub||!contact.position)return false;
  if(contact.sunk&&(contact.sinkingProgress??0)>=1)return false;
  const sub=state.playerSub,depth=Number(sub.depthFeet)||0;
  if(depth>65)return false;
  // MAP uses the same physical visibility envelope as the bridge/periscope
  // renderers, but assumes the watch crew scans the full 360 degrees. In
  // particular, surface smoke/profile bonuses must not let BRG show a hull
  // while MAP simultaneously downgrades that same ship to an uncertain plot.
  const limit=bridgeVisualLimitNm(state,contact);
  const pad=Number.isFinite(opts.rangePad)?opts.rangePad:1.02;
  return distNm(sub.position,contact.position)<=limit*pad;
}

function scopeCanResolveHull(state,contact,opts={}){
  if(!state||!contact||!state.playerSub||!state.tactical)return false;
  const sub=state.playerSub,T=state.tactical;
  if((sub.depthFeet||0)>65)return false;
  // The optic remains usable while surfaced as well as at periscope depth.
  // MAP/crew visual knowledge is 360 degrees, but what the player physically
  // sees through SCOPE is still limited by the trained bearing and current FOV.
  // Do not impose the bridge-only <8 ft split here: leaving SCOPE selectable
  // while silently suppressing every hull at 0 ft made close contacts vanish.
  if(!crewCanSeeSurfaceHull(state,contact,{rangePad:Number.isFinite(opts.rangePad)?opts.rangePad:1.02}))return false;
  const zoom=Number(opts.zoom??T.periscopeZoom??1);
  const fov=(typeof SCOPE_OPTICS!=='undefined'&&Array.isArray(SCOPE_OPTICS))
    ?(SCOPE_OPTICS[zoom===1?0:1]?.fov??(zoom===1?32:8))
    :(zoom===1?32:8);
  const bear=bearingBetween(sub.position,contact.position);
  const off=Math.abs(shortDelta(T.periscopeBearing??sub.heading??0,bear));
  const fovPad=Number.isFinite(opts.fovPad)?opts.fovPad:.52;
  return off<=fov*fovPad;
}

function hasFreshVisualFix(state,tr,maxAgeSec=24){
  if(!state||!tr)return false;
  const c=(state.world?.contacts||[]).find(q=>q.id===tr.id);
  // "Fresh visual" is intentionally literal now: while the crew can resolve
  // the hull, visual truth owns the plot; the instant the hull is no longer
  // visible, MAP is free to fall back to an uncertain sensor solution. This
  // removes the old 18–24 s memory window that could disagree with SCOPE.
  return !!c&&crewCanSeeSurfaceHull(state,c);
}

function scopeHullObservation(state,contact,opts={}){
  if(!scopeCanResolveHull(state,contact,opts))return null;
  const sub=state.playerSub,T=state.tactical;
  const zoom=Number(opts.zoom??T.periscopeZoom??1);
  const rng=distNm(sub.position,contact.position),bear=bearingBetween(sub.position,contact.position);
  const quality=zoom===1?.82:.96;
  return{
    resolved:true,contactId:contact.id,bearing:bear,rangeNm:rng,
    position:{xNm:contact.position.xNm,yNm:contact.position.yNm},
    courseDeg:contact.heading,speedKnots:contact.speedKnots,
    typeEstimate:contact.displayType||contact.type,affiliation:contact.side||'ENEMY',
    quality,confidenceFloor:zoom===1?.78:.90,
    positionConfidence:zoom===1?.90:.97,
    positionUncertaintyNm:zoom===1?.045:.018,
    observedAt:Number(state.time?.elapsedSeconds)||0
  };
}
