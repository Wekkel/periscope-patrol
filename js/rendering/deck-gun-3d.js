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


  ownshipDeckPoint(sub,forwardM,sideM,zM=1.35){
    const h=degToRad(sub.heading),fx=Math.sin(h),fy=-Math.cos(h),sx=Math.cos(h),sy=Math.sin(h);
    return{xNm:sub.position.xNm+(fx*forwardM+sx*sideM)/NM_M,
      yNm:sub.position.yNm+(fy*forwardM+sy*sideM)/NM_M,zM};
  }

  drawOwnshipSurfaceDeck3D(ctx,cam,state,opts={}){
    const sub=state.playerSub,k=this.k,rel=Math.abs(shortDelta(cam.bearingDeg??sub.heading,sub.heading));
    // Looking almost exactly abeam, the long deck is below/behind the bridge
    // camera and should not turn into a giant screen-space wedge.
    if(rel>82&&rel<98)return;
    const aft=rel>=98;
    const specs=aft
      ?[[-4,3.85,1.85],[-10,3.8,1.70],[-21,3.5,1.45],[-33,2.65,1.15],[-43,.18,.72]]
      :[[4,3.85,1.90],[10,4.0,1.75],[21,3.75,1.48],[34,3.15,1.20],[48,1.65,.92],[55,.16,.68]];
    const rows=[];
    for(const [fwd,width,z] of specs){
      const L=this.ownshipDeckPoint(sub,fwd,-width,z),R=this.ownshipDeckPoint(sub,fwd,width,z);
      const lp=this.proj(cam,L.xNm*NM_M,-L.yNm*NM_M,L.zM),rp=this.proj(cam,R.xNm*NM_M,-R.yNm*NM_M,R.zM);
      const Lw=this.ownshipDeckPoint(sub,fwd,-width,0),Rw=this.ownshipDeckPoint(sub,fwd,width,0);
      const lw=this.proj(cam,Lw.xNm*NM_M,-Lw.yNm*NM_M,0),rw=this.proj(cam,Rw.xNm*NM_M,-Rw.yNm*NM_M,0);
      if(lp&&rp)rows.push({fwd,width,z,lp,rp,lw,rw});
    }
    if(rows.length<2)return;
    // Hull sides first: a thin vertical face makes the deck feel like a body in
    // space rather than a flat HUD polygon.
    ctx.fillStyle='rgba(11,17,18,.97)';
    for(let i=0;i<rows.length-1;i++){
      const a=rows[i],b=rows[i+1];
      if(a.lp&&b.lp&&a.lw&&b.lw){ctx.beginPath();ctx.moveTo(a.lp.x,a.lp.y);ctx.lineTo(b.lp.x,b.lp.y);ctx.lineTo(b.lw.x,b.lw.y);ctx.lineTo(a.lw.x,a.lw.y);ctx.closePath();ctx.fill();}
      if(a.rp&&b.rp&&a.rw&&b.rw){ctx.beginPath();ctx.moveTo(a.rp.x,a.rp.y);ctx.lineTo(b.rp.x,b.rp.y);ctx.lineTo(b.rw.x,b.rw.y);ctx.lineTo(a.rw.x,a.rw.y);ctx.closePath();ctx.fill();}
    }
    const grd=ctx.createLinearGradient?ctx.createLinearGradient(cam.cx,cam.cy,cam.cx,Math.max(cam.cy,this.h||cam.cy+300)):null;
    if(grd){grd.addColorStop(0,'rgba(58,66,63,.98)');grd.addColorStop(1,'rgba(24,30,29,.99)');ctx.fillStyle=grd;}else ctx.fillStyle='rgba(38,46,43,.98)';
    ctx.beginPath();
    rows.forEach((r,i)=>i?ctx.lineTo(r.lp.x,r.lp.y):ctx.moveTo(r.lp.x,r.lp.y));
    for(let i=rows.length-1;i>=0;i--)ctx.lineTo(rows[i].rp.x,rows[i].rp.y);
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(122,137,130,.72)';ctx.lineWidth=Math.max(1,1.15*k);ctx.stroke();

    // Deck centre line and edge rails, all projected from ownship coordinates.
    const centres=rows.map(r=>{const q=this.ownshipDeckPoint(sub,r.fwd,0,r.z+.025);return this.proj(cam,q.xNm*NM_M,-q.yNm*NM_M,q.zM)}).filter(Boolean);
    if(centres.length>1){ctx.strokeStyle='rgba(127,139,132,.38)';ctx.lineWidth=Math.max(.8,k);ctx.beginPath();centres.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    ctx.strokeStyle='rgba(144,156,149,.48)';ctx.lineWidth=Math.max(.7,.85*k);
    for(const side of [-1,1]){
      const pts=rows.map(r=>{const q=this.ownshipDeckPoint(sub,r.fwd,side*r.width*.92,r.z+.28);return this.proj(cam,q.xNm*NM_M,-q.yNm*NM_M,q.zM)}).filter(Boolean);
      if(pts.length>1){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    }
    // Hatches / cleats give scale without textures or a second render engine.
    const detailFwd=aft?[-13,-28]:[13,29,42];
    for(const fwd of detailFwd){
      const q=this.ownshipDeckPoint(sub,fwd,0,1.65),p=this.proj(cam,q.xNm*NM_M,-q.yNm*NM_M,q.zM);if(!p)continue;
      const rr=clamp(cam.f/Math.max(p.d,100)*.75,1.2*k,5*k);ctx.fillStyle='rgba(8,13,13,.82)';ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(132,145,138,.58)';ctx.stroke();
    }
    if(opts.bridge&&!aft){
      const q=this.ownshipDeckPoint(sub,18,0,2.0),p=this.proj(cam,q.xNm*NM_M,-q.yNm*NM_M,q.zM);
      if(p){const rr=clamp(cam.f/Math.max(p.d,80)*1.2,2*k,8*k);ctx.fillStyle='rgba(25,31,29,.98)';ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(134,146,139,.62)';ctx.stroke();}
    }
  }

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
    // Overshoots aligned with a target are painted BEFORE the nearer hull;
    // the ship therefore occludes the water column instead of a far splash
    // appearing magically on top of the target.
    this.drawGunSplashes3D(ctx,cam,state,true);
    this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
    this.drawExplosions3D(ctx,cam,state,env.daylight);
    this.drawGunProjectiles3D(ctx,cam,state,false);
    this.drawGunSplashes3D(ctx,cam,state,false);
    if((env.weather==='RAIN'||env.weather==='STORM'))this.drawRain(ctx,w,h,env.seaState,t,env.weather);
    if(env.daylight<0.32)this.drawNightOverlay(ctx,w,h,env.daylight);
    // A slice of pressure-hull deck beneath the mount makes it unmistakable
    // that this camera is standing on a submarine, not on a floating gun UI.
    this.drawOwnshipSurfaceDeck3D(ctx,cam,state,{gun:true,time:t});

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

  gunSplashBehindShip(cam,state,sp){
    const sub=state.playerSub,spRange=distNm(sub.position,sp.position),spBear=bearingBetween(sub.position,sp.position);
    for(const c of state.world.contacts||[]){
      if(c.sunk)continue;
      const cr=distNm(sub.position,c.position);if(cr>=spRange-.01)continue;
      const cb=bearingBetween(sub.position,c.position),realLen=(c.lengthYards||400)*.9144;
      const broad=Math.abs(Math.sin(degToRad(shortDelta(c.heading||0,cb))));
      const apparentM=realLen*(.13+.87*broad);
      const halfDeg=radToDeg(Math.atan2(apparentM*.55,Math.max(20,cr*NM_M)));
      if(Math.abs(shortDelta(cb,spBear))<=Math.max(.08,halfDeg))return true;
    }
    return false;
  }

  drawGunSplashOne(ctx,cam,state,sp){
    const k=this.k,env=state.world.environment||{},sea=clamp(env.seaState||0,0,1),rain=clamp(env.precipitation||0,0,1);
    const p=this.proj(cam,sp.position.xNm*NM_M,-sp.position.yNm*NM_M,0);if(!p)return;
    const a=clamp(1-sp.age/4,0,1)*(1-rain*.38),rise=Math.sin(clamp(sp.age/1.4,0,1)*Math.PI)*22*k*(1+sea*.42);
    ctx.fillStyle=`rgba(225,242,248,${a*.86})`;ctx.beginPath();ctx.ellipse(p.x,p.y-rise*0.45,(4*k+sp.age*2*k)*(1+sea*.18),Math.max(3*k,rise),0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=`rgba(230,245,250,${a*.65})`;ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.ellipse(p.x,p.y,(8*k+sp.age*5*k)*(1+sea*.22),2.5*k+sp.age*k,0,0,Math.PI*2);ctx.stroke();
  }

  drawGunSplashes3D(ctx,cam,state,behindShips){
    for(const sp of state.weapons.deckGun?.splashes||[]){
      if(this.gunSplashBehindShip(cam,state,sp)!==behindShips)continue;
      this.drawGunSplashOne(ctx,cam,state,sp);
    }
  }

  drawGunProjectiles3D(ctx,cam,state,includeSplashes=true){
    const G=state.weapons.deckGun,k=this.k;
    for(const sh of G?.shells||[]){
      const p=this.proj(cam,sh.xNm*NM_M,-sh.yNm*NM_M,sh.zM);if(!p)continue;
      const a=clamp(1-sh.age/10,0.25,1);ctx.fillStyle=`rgba(255,235,155,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.2,2.2*k),0,Math.PI*2);ctx.fill();
      if(sh.prev){const q=this.proj(cam,sh.prev.xNm*NM_M,-sh.prev.yNm*NM_M,sh.prev.zM);if(q){ctx.strokeStyle=`rgba(255,210,120,${a*.42})`;ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke();}}
    }
    // Backward-compatible helper contract for renderer tests/tools that call
    // this method directly; drawDeckGun passes false and depth-sorts splashes.
    if(includeSplashes)for(const sp of G?.splashes||[])CanvasViewDeckGun.prototype.drawGunSplashOne.call(this,ctx,cam,state,sp);
  }


}
