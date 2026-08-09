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
