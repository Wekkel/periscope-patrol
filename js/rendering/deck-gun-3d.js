class CanvasViewDeckGun extends CanvasViewTactical {
  setupCam(state,fovDeg,cx,cy,r){
    const sub=state.playerSub;
    const camH=sub.depthFeet<8?6.5:clamp(1.8-(sub.depthFeet-45)*0.06,0.35,1.9);
    const f=(r)/Math.tan(degToRad(fovDeg)/2);      // focal length in pixels
    const dip=Math.sqrt(2*camH/EARTH_R);
    const brg=degToRad(state.tactical.periscopeBearing);
    return{
      E:state.playerSub.position.xNm*NM_M,
      N:-state.playerSub.position.yNm*NM_M,
      h:camH,f,cx,cy,r,fovDeg,
      sin:Math.sin(brg),cos:Math.cos(brg),
      dip, horizonY:cy+f*dip, dHor:Math.sqrt(2*EARTH_R*camH),
      halfFov:degToRad(fovDeg)/2
    };
  }
  // world point → screen. d is the horizontal distance (also used for sorting)
  proj(cam,E,N,Y){
    const dE=E-cam.E, dN=N-cam.N;
    const fwd=dE*cam.sin+dN*cam.cos;
    const rgt=dE*cam.cos-dN*cam.sin;
    if(fwd<3) return null;
    return{
      x:cam.cx+rgt/fwd*cam.f,
      y:cam.cy+((cam.h-Y)/fwd+fwd/(2*EARTH_R))*cam.f,
      d:fwd
    };
  }
  // screen y of the sea surface at distance d (straight ahead)
  seaY(cam,d){return cam.cy+(cam.h/d+d/(2*EARTH_R))*cam.f;}

  drawDeckGun(ctx,w,h,state){
    const sub=state.playerSub,G=state.weapons.deckGun,env=state.world.environment,t=state.time.elapsedSeconds;
    const bearing=normDeg(sub.heading+(G?.trainDeg||0));
    const fov=this.portrait?62:56,cx=w/2,cy=this.portrait?h*0.46:h*0.49,r=Math.max(w,h)*0.72;
    const cam=this.setupCam(state,fov,cx,cy,r);
    cam.h=5.6;cam.bearingDeg=bearing;const br=degToRad(bearing);cam.sin=Math.sin(br);cam.cos=Math.cos(br);
    cam.dip=Math.sqrt(2*cam.h/EARTH_R);cam.horizonY=cy+cam.f*cam.dip;cam.dHor=Math.sqrt(2*EARTH_R*cam.h);cam.kind='GUN';
    this.cam=cam;this.gunCam=cam;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    this.drawSky3D(ctx,w,h,cam,state,env.daylight,env.weather||'CLEAR',t);
    this.drawSea3D(ctx,w,h,cam,env.daylight,env.seaState,env.weather||'CLEAR',t);
    this.drawTerrain3D(ctx,cam,state,env.daylight);
    this.drawWakes3D(ctx,cam,state,t,env.daylight);
    this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
    this.drawExplosions3D(ctx,cam,state,env.daylight);
    this.drawGunProjectiles3D(ctx,cam,state);
    if((env.weather==='RAIN'||env.weather==='STORM'))this.drawRain(ctx,w,h,env.seaState,t,env.weather);
    if(env.daylight<0.32)this.drawNightOverlay(ctx,w,h,env.daylight);

    // Gun and pedestal in the foreground. The camera follows train only;
    // elevation moves the actual sight above the horizon, so fall of shot is visible.
    const k=this.k,baseY=h+14*k,gunY=h-18*k;
    ctx.fillStyle='rgba(8,12,12,.96)';ctx.beginPath();ctx.ellipse(cx,baseY,86*k,35*k,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(126,142,134,.8)';ctx.lineWidth=Math.max(2,3*k);ctx.stroke();
    ctx.fillStyle='rgba(55,65,60,.98)';ctx.fillRect(cx-22*k,gunY-18*k,44*k,36*k);
    ctx.strokeStyle='rgba(22,27,25,.9)';ctx.strokeRect(cx-22*k,gunY-18*k,44*k,36*k);
    const aimY=cam.horizonY-Math.tan(degToRad(G?.elevationDeg||0))*cam.f;
    ctx.strokeStyle='rgba(72,82,77,.98)';ctx.lineWidth=Math.max(7,9*k);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx,gunY-8*k);ctx.lineTo(cx,Math.max(aimY+28*k,gunY-92*k));ctx.stroke();ctx.lineCap='butt';
    if(G&&G.flashUntil>t){
      const a=clamp((G.flashUntil-t)/0.16,0,1),fy=Math.max(aimY+26*k,gunY-92*k);
      const gg=ctx.createRadialGradient(cx,fy,0,cx,fy,30*k);gg.addColorStop(0,`rgba(255,246,188,${a})`);gg.addColorStop(1,'rgba(255,128,30,0)');
      ctx.fillStyle=gg;ctx.fillRect(cx-34*k,fy-34*k,68*k,68*k);
    }

    // Optical ring / crosshair.
    const crossY=clamp(aimY,38*k,h-78*k);
    ctx.strokeStyle=G?.manned?'rgba(240,236,198,.92)':'rgba(130,140,130,.55)';ctx.lineWidth=Math.max(1,1.3*k);
    ctx.beginPath();ctx.arc(cx,crossY,22*k,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-50*k,crossY);ctx.lineTo(cx-8*k,crossY);ctx.moveTo(cx+8*k,crossY);ctx.lineTo(cx+50*k,crossY);ctx.moveTo(cx,crossY-42*k);ctx.lineTo(cx,crossY-8*k);ctx.moveTo(cx,crossY+8*k);ctx.lineTo(cx,crossY+42*k);ctx.stroke();

    ctx.fillStyle='rgba(3,13,16,.76)';this.rr(ctx,8*k,8*k,Math.min(270*k,w-16*k),72*k,6*k);ctx.fill();
    ctx.fillStyle='#d7f5e7';ctx.font=this.fnt(10,true);ctx.fillText('3\"/50 DECK GUN',16*k,25*k);
    ctx.font=this.fnt(8.5);ctx.fillStyle='rgba(210,235,224,.88)';
    ctx.fillText(`BRG ${fmtDeg(bearing)} · TRAIN ${(G?.trainDeg||0).toFixed(1)}° · ELEV ${(G?.elevationDeg||0).toFixed(1)}°`,16*k,41*k);
    ctx.fillText(`AMMO ${G?.ammo??0} · ${G?.manned?'CREW TOPSIDE':'GUN NOT MANNED'} · drag to aim`,16*k,56*k);
    const tgt=state.tactical.selectedTrackId&&state.world.contacts.find(c=>c.id===state.tactical.selectedTrackId&&!c.sunk);
    if(tgt){ctx.fillStyle='rgba(245,198,92,.95)';ctx.fillText(`TARGET ${tgt.id} · ${distNm(sub.position,tgt.position).toFixed(2)} nm · LAY available`,16*k,71*k);}
    if(G?.lastFall&&G.lastFall.until>t){
      ctx.font=this.fnt(11,true);ctx.textAlign='center';ctx.fillStyle=/HIT|SUNK/.test(G.lastFall.text)?'#6fe08f':'#f5c65c';
      ctx.fillText(G.lastFall.text,cx,Math.min(h-86*k,crossY+70*k));ctx.textAlign='left';
    }
    if(!G?.manned){
      ctx.fillStyle='rgba(3,8,10,.78)';this.rr(ctx,cx-145*k,h*0.36,290*k,74*k,8*k);ctx.fill();
      ctx.fillStyle='#f5c65c';ctx.font=this.fnt(12,true);ctx.textAlign='center';ctx.fillText('DECK GUN NOT MANNED',cx,h*0.36+28*k);
      ctx.font=this.fnt(9);ctx.fillStyle='#d7f5e7';ctx.fillText('Surface and enter GUN station — crew mans automatically',cx,h*0.36+49*k);ctx.textAlign='left';
    }
  }

  drawGunProjectiles3D(ctx,cam,state){
    const G=state.weapons.deckGun,k=this.k,env=state.world.environment||{},sea=clamp(env.seaState||0,0,1),rain=clamp(env.precipitation||0,0,1);
    for(const sh of G?.shells||[]){
      const p=this.proj(cam,sh.xNm*NM_M,-sh.yNm*NM_M,sh.zM);if(!p)continue;
      const a=clamp(1-sh.age/10,0.25,1);ctx.fillStyle=`rgba(255,235,155,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.2,2.2*k),0,Math.PI*2);ctx.fill();
      if(sh.prev){const q=this.proj(cam,sh.prev.xNm*NM_M,-sh.prev.yNm*NM_M,sh.prev.zM);if(q){ctx.strokeStyle=`rgba(255,210,120,${a*.42})`;ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke();}}
    }
    for(const sp of G?.splashes||[]){
      const p=this.proj(cam,sp.position.xNm*NM_M,-sp.position.yNm*NM_M,0);if(!p)continue;
      const a=clamp(1-sp.age/4,0,1)*(1-rain*.38),rise=Math.sin(clamp(sp.age/1.4,0,1)*Math.PI)*22*k*(1+sea*.42);
      ctx.fillStyle=`rgba(225,242,248,${a*.86})`;ctx.beginPath();ctx.ellipse(p.x,p.y-rise*0.45,(4*k+sp.age*2*k)*(1+sea*.18),Math.max(3*k,rise),0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=`rgba(230,245,250,${a*.65})`;ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.ellipse(p.x,p.y,(8*k+sp.age*5*k)*(1+sea*.22),2.5*k+sp.age*k,0,0,Math.PI*2);ctx.stroke();
    }
  }

}
