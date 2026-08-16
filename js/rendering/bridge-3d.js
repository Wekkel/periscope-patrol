// ═══════════════════════════════════════════════════ SURFACE BRIDGE VIEW
// Wide, unmasked conning-tower view. It deliberately reuses the existing
// periscope/deck-gun world renderer so a second 3-D engine is not kept alive.
class CanvasViewBridge extends CanvasViewPeriscope {
  setupBridgeCam(state,fovDeg,w,h){
    const tact=state.tactical,cx=w/2,cy=this.portrait?h*.47:h*.50,r=w/2;
    return makeWorldCamera(state,{heightM:BRIDGE_VIEW.cameraHeightM,bearingDeg:tact.bridgeBearing,
      fovDeg,cx,cy,r,viewW:w,viewH:h,kind:'BRIDGE'});
  }

  bridgeSurfaceMotion(state,t){
    const sub=state.playerSub,sea=clamp(state.world.environment?.seaState||0,0,1),maxSurface=Math.max(1,sub.propulsion?.characteristics?.maxSurfaceSpeedKn||18),spd=clamp((sub.propulsion?.speedKnots||0)/maxSurface,0,1);
    if((sub.depthFeet||0)>8)return{heaveM:0,pitchDeg:0,rollDeg:0};
    const live=clamp(.18+sea*.82+spd*.22,0,1.15);
    return{
      heaveM:Math.sin(t*.93+1.1)*(.025+.19*sea)*live,
      pitchDeg:Math.sin(t*.71+.35)*(.08+.72*sea+.13*spd)*live,
      rollDeg:Math.sin(t*.57+2.2)*(.10+1.05*sea)*live
    };
  }

  drawBridge(ctx,w,h,state){
    const sub=state.playerSub,tact=state.tactical,env=state.world.environment,t=state.time.elapsedSeconds;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    if(!bridgeCanUse(state)){
      ctx.fillStyle='#061014';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#f5c65c';ctx.font=this.fnt(14,true);ctx.textAlign='center';
      ctx.fillText('BRIDGE BELOW THE SURFACE',w/2,h*.46);
      ctx.font=this.fnt(10);ctx.fillStyle='#9bb9ad';ctx.fillText('Surface or come awash to send the watch topside.',w/2,h*.46+24*this.k);ctx.textAlign='left';
      return;
    }
    const zoom=bridgeZoomAmount(state),bino=zoom>.55,fov=bridgeFovDeg(state);
    const cam=this.setupBridgeCam(state,fov,w,h),deckCam={...cam},motion=(this.bridgeSurfaceMotion||CanvasViewBridge.prototype.bridgeSurfaceMotion).call(this,state,t);
    // The observer and submarine move together, so ownship stays stable in the
    // foreground while the horizon/world gently heaves, pitches and rolls.
    cam.h+=motion.heaveM;cam.cy+=Math.tan(degToRad(motion.pitchDeg))*cam.f;
    cam.dip=Math.sqrt(2*Math.max(.2,cam.h)/EARTH_R);cam.horizonY=cam.cy+cam.f*cam.dip;cam.dHor=Math.sqrt(2*EARTH_R*Math.max(.2,cam.h));
    this.cam=cam;this.bridgeCam=cam;this.bridgeDeckCam=deckCam;this.bridgeMotion=motion;
    const savedQ=this.quality;
    // A wide bridge scene can expose far more sea/terrain than the scope. On
    // 4 GB / low-core devices hold the effect density below the adaptive cap;
    // the simulation and contact geometry remain full fidelity.
    if(this.lowSpec)this.quality=Math.min(this.quality,.58);
    else this.quality=Math.min(this.quality,.92);
    try{
      ctx.save();ctx.translate(cam.cx,cam.cy);ctx.rotate(degToRad(-motion.rollDeg));ctx.translate(-cam.cx,-cam.cy);
      this.drawSky3D(ctx,w,h,cam,state,env.daylight,env.weather||'CLEAR',t);
      this.drawSea3D(ctx,w,h,cam,env.daylight,env.seaState,env.weather||'CLEAR',t,env);
      this.drawTerrain3D(ctx,cam,state,env.daylight);
      this.drawWeatherCells3D?.(ctx,cam,state,env.daylight,t);
      this.drawBattleAtmosphereBack?.(ctx,cam,state,env.daylight,t);
      this.drawDistantBridgeSmoke(ctx,cam,state,env.daylight,t);
      this.drawOwnWake(ctx,cam,state,t,env.daylight);
      this.drawWakes3D(ctx,cam,state,t,env.daylight);
      this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
      this.drawBridgeAircraft?.(ctx,cam,state,env.daylight,t);
      this.drawExplosions3D(ctx,cam,state,env.daylight);
      this.drawSplashes3D(ctx,cam,state,env.daylight);
      this.drawBattleAtmosphereFront?.(ctx,cam,state,env.daylight,t);ctx.restore();
      // Deck/camera are rigidly attached to the same boat; unlike the horizon,
      // ownship therefore does not wobble relative to the observer.
      this.drawBridgeForedeck(ctx,w,h,deckCam,state,t);
      this.drawBridgeDeckSpray?.(ctx,w,h,state,t);
      (this.drawBridgeDiveSequence||CanvasViewBridge.prototype.drawBridgeDiveSequence).call(this,ctx,w,h,state,t);
      if((env.precipitation||0)>.04||weatherIsWet(env.weather))this.drawRain(ctx,w,h,env.seaState,t,env.weather,env.precipitation||.25);
      if(env.seaState>.58&&this.quality>.48)this.drawScopeSpray(ctx,w,h,env.seaState,t);
      if(env.daylight<.32)this.drawNightOverlay(ctx,w,h,env.daylight);
    }finally{this.quality=savedQ;}
    this.drawBridgeHud(ctx,w,h,state,cam,bino);
  }

  drawDistantBridgeSmoke(ctx,cam,state,dl,t){
    if(dl<.16||this.quality<.32)return;
    const vis=Math.max(.5,state.world.environment.visibilityNm||.5),own=state.playerSub.position;
    for(const c of state.world.contacts){
      if(c.sunk||c.stationary||(c.speedKnots||0)<4)continue;
      const rng=distNm(own,c.position);if(rng<vis*.72||rng>vis*1.34)continue;
      const bear=bearingBetween(own,c.position),bd=shortDelta(cam.bearingDeg,bear);
      if(Math.abs(bd)>cam.fovDeg*.52)continue;
      const E=c.position.xNm*NM_M,N=-c.position.yNm*NM_M;
      const p=projectWorldPoint(cam,E,N,18);if(!p)continue;
      const strength=clamp(1-(rng-vis*.72)/(vis*.72),.08,.75)*(c.type==='TANKER'?1.25:1);
      const n=this.lowSpec?2:3;
      for(let i=0;i<n;i++){
        const rr=Math.max(1.1,(2.2+i*1.7)*cam.f/Math.max(p.d,300));
        const drift=((t*3+i*13)%26)*cam.f/Math.max(p.d,500);
        ctx.fillStyle=`rgba(55,55,54,${.18*strength*(1-i/n*.55)})`;
        ctx.beginPath();ctx.arc(p.x+drift,p.y-i*rr*2.2,rr,0,Math.PI*2);ctx.fill();
      }
    }
  }

  drawBridgeAircraft(ctx,cam,state,dl,t){
    // Aircraft are world entities, not 2-D station icons. The shared renderer in
    // CanvasViewDeckGun projects the same tiny mesh into BRIDGE and GUN, so an
    // attacker naturally changes from nose/underside to belly to tail as it
    // passes the camera. This is deliberately Canvas2D pseudo-3D, not a costly
    // second 3-D engine.
    this.drawWorldAircraft(ctx,cam,state,dl,t,{station:'BRIDGE'});
  }

  drawBridgeForedeck(ctx,w,h,cam,state,t){
    // The old bridge used a screen-space trapezoid.  Its bow point was
    // bx = centre + tan(relative bearing) * focalLength, so changing FOV made
    // the *submarine* appear to rotate.  The deck is now projected from metre
    // coordinates fixed to ownship's heading, exactly like the other 3-D world
    // geometry.  The same helper is also used by the gun view.
    this.drawOwnshipSurfaceDeck3D(ctx,cam,state,{bridge:true,time:t});
    const k=this.k;
    // Immediate bridge coaming/rail remains a tiny near-camera cue.
    ctx.strokeStyle='rgba(105,119,112,.68)';ctx.lineWidth=Math.max(1,1.4*k);
    const ry=h-10*k;ctx.beginPath();ctx.moveTo(w*.08,ry);ctx.lineTo(w*.92,ry);ctx.stroke();
    for(let x=.12;x<.92;x+=.10){ctx.beginPath();ctx.moveTo(w*x,ry);ctx.lineTo(w*x,ry-12*k);ctx.stroke();}
  }

  drawBridgeDiveSequence(ctx,w,h,state,t){
    const seq=state.tactical.bridgeDiveSequence;if(!seq?.active)return;
    const k=this.k,p=clamp(seq.progress||0,0,1),crash=!!seq.crash;
    const hatchX=w*.57,hatchY=h*.78,hatchR=clamp(22*k,18,34);
    // Hatch/coaming lives in camera space because the watch is standing next
    // to it. Crew are deliberately simple silhouettes: four keyed poses cost
    // essentially nothing on low-end hardware but make the sequence readable.
    ctx.fillStyle='rgba(8,12,12,.92)';ctx.strokeStyle='rgba(136,149,142,.72)';ctx.lineWidth=Math.max(1,1.2*k);
    ctx.beginPath();ctx.ellipse(hatchX,hatchY,hatchR,hatchR*.58,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    const gone=Math.floor(clamp(p/.78,0,1)*4),remaining=Math.max(0,4-gone);
    for(let i=0;i<remaining;i++){
      const q=(p*.92+i*.17)%1,fromLeft=i%2===0,x=lerp(fromLeft?w*.18:w*.86,hatchX,q),y=lerp(h*.62,hatchY-10*k,q);
      const s=(crash?9:8)*k;ctx.strokeStyle='rgba(226,236,226,.82)';ctx.fillStyle='rgba(32,39,37,.96)';ctx.lineWidth=Math.max(1,1.2*k);
      ctx.beginPath();ctx.arc(x,y-s*.82,s*.22,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x,y-s*.58);ctx.lineTo(x,y);ctx.moveTo(x,y-s*.38);ctx.lineTo(x+(fromLeft?1:-1)*s*.42,y-s*.08);ctx.moveTo(x,y);ctx.lineTo(x-s*.25,y+s*.48);ctx.moveTo(x,y);ctx.lineTo(x+s*.25,y+s*.48);ctx.stroke();
    }
    if(p>=.78&&p<.96){
      const q=clamp((p-.78)/.18,0,1),x=hatchX,y=hatchY-lerp(18*k,-4*k,q),s=8*k*(1-q*.32);
      ctx.fillStyle='rgba(28,34,32,.98)';ctx.strokeStyle='rgba(230,238,230,.88)';ctx.beginPath();ctx.arc(x,y-s,s*.22,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x,y-s*.72);ctx.lineTo(x,y);ctx.stroke();
    }
    if(p>=.90){const q=clamp((p-.90)/.10,0,1);ctx.strokeStyle=`rgba(174,188,180,${.85*q})`;ctx.lineWidth=Math.max(2,3*k);ctx.beginPath();ctx.ellipse(hatchX,hatchY,hatchR*(1-q*.08),hatchR*.58*(1-q*.08),0,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle='rgba(3,13,16,.70)';this.rr(ctx,w*.18,18*k,w*.64,34*k,5*k);ctx.fill();ctx.fillStyle=crash?'#ef6a58':'#f5c65c';ctx.font=this.fnt(9.5,true);ctx.textAlign='center';
    ctx.fillText(p<.78?(crash?'CRASH DIVE — CLEAR THE BRIDGE!':'DIVE — BRIDGE WATCH GOING BELOW'):p<.92?'LAST MAN DOWN':'HATCH SHUT',w/2,39*k);ctx.textAlign='left';
  }

  drawBridgeHud(ctx,w,h,state,cam,bino){
    const k=this.k,t=state.tactical,sub=state.playerSub;
    ctx.fillStyle='rgba(3,13,16,.66)';this.rr(ctx,8*k,8*k,Math.min(286*k,w-16*k),50*k,6*k);ctx.fill();
    ctx.fillStyle='#d7f5e7';ctx.font=this.fnt(10,true);ctx.fillText('SURFACE WATCH — BRIDGE',16*k,25*k);
    ctx.fillStyle='rgba(210,235,224,.86)';ctx.font=this.fnt(8.5);
    const mag=bridgeMagnification(state);
    ctx.fillText(`LOOK ${fmtDeg(t.bridgeBearing)} · ${mag>1.08?`BINOCULARS ${mag.toFixed(1)}×`:'WIDE WATCH'} · FOV ${Math.round(cam.fovDeg)}°`,16*k,41*k);
    // A centre mark gives MARK/TARGET a clear datum without turning the view
    // into a gunsight.
    ctx.strokeStyle='rgba(220,236,226,.52)';ctx.lineWidth=Math.max(1,k);
    ctx.beginPath();ctx.moveTo(w/2-10*k,h*.50);ctx.lineTo(w/2-3*k,h*.50);ctx.moveTo(w/2+3*k,h*.50);ctx.lineTo(w/2+10*k,h*.50);ctx.stroke();
    const id=t.selectedTrackId,tr=id&&state.world.contactTracks[id];
    if(tr){
      ctx.fillStyle='rgba(245,198,92,.88)';ctx.font=this.fnt(8.5);ctx.textAlign='right';
      ctx.fillText(`TARGET ${id} · ${tr.rangeEstimateNm.toFixed(2)} nm · ${fmtDeg(tr.bearing)}`,w-12*k,22*k);ctx.textAlign='left';
    }
  }

  pickBridgeContact(state,clientX,clientY){
    const p=this.toLocal(clientX,clientY),cam=this.bridgeCam;if(!cam||!bridgeCanUse(state))return null;
    let best=null,bd=Infinity;
    for(const c of state.world.contacts){
      if(c.sunk&&(c.sinkingProgress??0)>=1)continue;
      if(distNm(state.playerSub.position,c.position)>bridgeVisualLimitNm(state,c)*1.02)continue;
      const scr=projectWorldPoint(cam,c.position.xNm*NM_M,-c.position.yNm*NM_M,5);if(!scr)continue;
      const d=Math.hypot(scr.x-p.x,(scr.y-p.y)*.65);if(d<bd){bd=d;best=c.id;}
    }
    return bd<Math.max(48,62*this.k)?best:null;
  }
}
