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
    const bino=!!tact.bridgeBinoculars,fov=bino?BRIDGE_VIEW.binocularFovDeg:BRIDGE_VIEW.normalFovDeg;
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
      this.drawDistantBridgeSmoke(ctx,cam,state,env.daylight,t);
      this.drawOwnWake(ctx,cam,state,t,env.daylight);
      this.drawWakes3D(ctx,cam,state,t,env.daylight);
      this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
      this.drawExplosions3D(ctx,cam,state,env.daylight);
      this.drawSplashes3D(ctx,cam,state,env.daylight);
      if(env.weather==='RAIN'||env.weather==='STORM')this.drawRain(ctx,w,h,env.seaState,t,env.weather);
      if(env.seaState>.58&&this.quality>.48)this.drawScopeSpray(ctx,w,h,env.seaState,t);
      if(env.daylight<.32)this.drawNightOverlay(ctx,w,h,env.daylight);
      this.drawBridgeForedeck(ctx,w,h,cam,state,t);
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

  drawBridgeForedeck(ctx,w,h,cam,state,t){
    const sub=state.playerSub,k=this.k,rel=shortDelta(cam.bearingDeg,sub.heading);
    // The foredeck only belongs in the picture while the watch is looking
    // generally over the bow. Looking abeam/aft leaves an unobstructed sea view.
    if(Math.abs(rel)<78){
      const bx=cam.cx+Math.tan(degToRad(rel))*cam.f,tipY=h*(this.portrait?.66:.71);
      if(bx>-w*.35&&bx<w*1.35){
        const halfBottom=Math.min(w*.33,145*k),halfTip=Math.max(5,11*k);
        ctx.fillStyle='rgba(20,25,24,.97)';ctx.strokeStyle='rgba(94,108,101,.75)';ctx.lineWidth=Math.max(1,1.2*k);
        ctx.beginPath();ctx.moveTo(cam.cx-halfBottom,h+2);ctx.lineTo(bx-halfTip,tipY);ctx.lineTo(bx+halfTip,tipY);ctx.lineTo(cam.cx+halfBottom,h+2);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle='rgba(135,145,137,.38)';ctx.beginPath();ctx.moveTo(cam.cx, h);ctx.lineTo(bx,tipY);ctx.stroke();
        const spd=sub.propulsion.speedKnots||0;
        if(spd>2.5&&state.world.environment.daylight>.12){
          const a=clamp((spd-2.5)/14,.12,.75)*(1-state.world.environment.seaState*.28);
          ctx.strokeStyle=`rgba(238,248,252,${a})`;ctx.lineWidth=Math.max(1,1.5*k);
          const strokes=this.lowSpec?3:5;
          for(let i=0;i<strokes;i++){
            const side=i%2?-1:1,off=(7+i*2.4)*k*side,wob=Math.sin(t*5+i)*3*k;
            ctx.beginPath();ctx.moveTo(bx+off,tipY+4*k);ctx.quadraticCurveTo(bx+off*2+wob,tipY+17*k,bx+off*3.2,tipY+27*k);ctx.stroke();
          }
        }
      }
    }
    // Bridge coaming/rail: a tiny foreground cue, not a cockpit UI.
    ctx.strokeStyle='rgba(105,119,112,.68)';ctx.lineWidth=Math.max(1,1.4*k);
    const ry=h-10*k;ctx.beginPath();ctx.moveTo(w*.08,ry);ctx.lineTo(w*.92,ry);ctx.stroke();
    for(let x=.12;x<.92;x+=.10){ctx.beginPath();ctx.moveTo(w*x,ry);ctx.lineTo(w*x,ry-12*k);ctx.stroke();}
  }

  drawBridgeHud(ctx,w,h,state,cam,bino){
    const k=this.k,t=state.tactical,sub=state.playerSub;
    ctx.fillStyle='rgba(3,13,16,.66)';this.rr(ctx,8*k,8*k,Math.min(286*k,w-16*k),50*k,6*k);ctx.fill();
    ctx.fillStyle='#d7f5e7';ctx.font=this.fnt(10,true);ctx.fillText('SURFACE WATCH — BRIDGE',16*k,25*k);
    ctx.fillStyle='rgba(210,235,224,.86)';ctx.font=this.fnt(8.5);
    ctx.fillText(`LOOK ${fmtDeg(t.bridgeBearing)} · ${bino?'BINOCULARS 3×':'WIDE WATCH'} · FOV ${Math.round(cam.fovDeg)}°`,16*k,41*k);
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
