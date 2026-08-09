// ═══════════════════════════════════════════════════ SURFACE BRIDGE VIEW
// Wide, unmasked conning-tower view. It deliberately reuses the existing
// periscope/deck-gun world renderer so a second 3-D engine is not kept alive.
class CanvasViewBridge extends CanvasViewPeriscope {
  setupBridgeCam(state,fovDeg,w,h){
    const tact=state.tactical,cx=w/2,cy=this.portrait?h*.47:h*.50;
    const f=(w/2)/Math.tan(degToRad(fovDeg)/2),camH=BRIDGE_VIEW.cameraHeightM;
    const brg=degToRad(tact.bridgeBearing);
    return{
      E:state.playerSub.position.xNm*NM_M,N:-state.playerSub.position.yNm*NM_M,
      h:camH,f,cx,cy,r:Math.max(w,h)*.72,fovDeg,bearingDeg:tact.bridgeBearing,
      sin:Math.sin(brg),cos:Math.cos(brg),dip:Math.sqrt(2*camH/EARTH_R),
      horizonY:cy+f*Math.sqrt(2*camH/EARTH_R),dHor:Math.sqrt(2*EARTH_R*camH),
      halfFov:degToRad(fovDeg)/2,kind:'BRIDGE'
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
    const cam=this.setupBridgeCam(state,fov,w,h);this.cam=cam;this.bridgeCam=cam;
    const savedQ=this.quality;
    // A wide bridge scene can expose far more sea/terrain than the scope. On
    // 4 GB / low-core devices hold the effect density below the adaptive cap;
    // the simulation and contact geometry remain full fidelity.
    if(this.lowSpec)this.quality=Math.min(this.quality,.58);
    else this.quality=Math.min(this.quality,.92);
    try{
      this.drawSky3D(ctx,w,h,cam,state,env.daylight,env.weather||'CLEAR',t);
      this.drawSea3D(ctx,w,h,cam,env.daylight,env.seaState,env.weather||'CLEAR',t);
      this.drawTerrain3D(ctx,cam,state,env.daylight);
      this.drawWeatherCells3D?.(ctx,cam,state,env.daylight,t);
      this.drawDistantBridgeSmoke(ctx,cam,state,env.daylight,t);
      this.drawOwnWake(ctx,cam,state,t,env.daylight);
      this.drawWakes3D(ctx,cam,state,t,env.daylight);
      this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
      this.drawBridgeAircraft?.(ctx,cam,state,env.daylight,t);
      this.drawExplosions3D(ctx,cam,state,env.daylight);
      this.drawSplashes3D(ctx,cam,state,env.daylight);
      // Ownship is real perspective geometry, drawn as foreground world
      // geometry before rain/night overlays.  Changing focal length therefore
      // changes magnification, not the apparent course of the hull.
      this.drawBridgeForedeck(ctx,w,h,cam,state,t);
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
      const p=this.proj(cam,E,N,18);if(!p)continue;
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
    const sub=state.playerSub,env=state.world.environment||{},k=this.k;
    for(const a of state.world.aircraft||[]){
      if(a.shotDown||a.state==='DEPARTING'||!a.seenBySub)continue;
      const rng=distNm(sub.position,a.position),wx=weatherBetween(state,sub.position,a.position);
      if(rng>Math.min(12,Math.max(1.2,wx.visibilityNm*1.15)))continue;
      const bear=bearingBetween(sub.position,a.position),off=shortDelta(cam.bearingDeg,bear);
      if(Math.abs(off)>cam.fovDeg*.54)continue;
      // The aircraft model has no flight-dynamics altitude state. Use a stable
      // visual flight level keyed to its tactical state; range/heading remain
      // the real simulated values.
      const altitude=a.state==='ATTACKING'||a.state==='STRAFING'?clamp(70+rng*48,85,260)
                    :a.state==='ORBIT'?310:430;
      const p=this.proj(cam,a.position.xNm*NM_M,-a.position.yNm*NM_M,altitude);if(!p)continue;
      const spanM=a.kind==='FLYING_BOAT'?28:a.kind==='BOMBER'?15:14;
      const px=clamp(spanM*cam.f/Math.max(p.d,120),2.2*k,54*k);
      const attack=a.state==='ATTACKING'||a.state==='STRAFING';
      const haze=clamp(1-rng/Math.max(1,wx.visibilityNm*1.2),.28,1);
      ctx.save();ctx.translate(p.x,p.y);
      // Bank follows heading change enough to make an attacking turn readable,
      // while remaining a very cheap vector silhouette on low-end hardware.
      const relH=shortDelta(bear,a.heading),bank=clamp(relH/95,-.48,.48);
      ctx.rotate(bank);
      ctx.fillStyle=attack?`rgba(45,33,26,${.92*haze})`:`rgba(32,38,39,${.86*haze})`;
      ctx.strokeStyle=attack?`rgba(239,106,88,${.62*haze})`:`rgba(200,216,211,${.36*haze})`;
      ctx.lineWidth=Math.max(.8,k);
      ctx.beginPath();
      ctx.moveTo(0,-px*.48);ctx.lineTo(px*.10,-px*.08);ctx.lineTo(px*.50,px*.02);
      ctx.lineTo(px*.12,px*.10);ctx.lineTo(px*.06,px*.46);ctx.lineTo(0,px*.28);
      ctx.lineTo(-px*.06,px*.46);ctx.lineTo(-px*.12,px*.10);ctx.lineTo(-px*.50,px*.02);
      ctx.lineTo(-px*.10,-px*.08);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      if(attack&&px>5*k){ctx.fillStyle='rgba(239,106,88,.82)';ctx.font=this.fnt(7.5,true);ctx.textAlign='center';ctx.fillText('AIRCRAFT',p.x,p.y-px*.75-3*k);ctx.textAlign='left';}
    }
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
      const scr=this.proj(cam,c.position.xNm*NM_M,-c.position.yNm*NM_M,5);if(!scr)continue;
      const d=Math.hypot(scr.x-p.x,(scr.y-p.y)*.65);if(d<bd){bd=d;best=c.id;}
    }
    return bd<Math.max(48,62*this.k)?best:null;
  }
}
