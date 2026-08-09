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

  /* Ownship needs a different projection rule from distant world geometry.
     The bridge camera is physically ON the submarine, so deck polygons can
     cross the camera's near plane as the player looks abeam. Dropping any
     vertex with fwd<3 m (the normal world-object rule) cut the boat in half.
     This tiny low-poly mesh clips faces against a 0.55 m near plane instead. */
  ownshipSurfaceSections(){
    return[
      {f:-47,w:.18,z:.68},{f:-41,w:2.35,z:.96},{f:-32,w:3.15,z:1.20},{f:-22,w:3.55,z:1.43},
      {f:-12,w:3.82,z:1.67},{f:-5,w:3.90,z:1.82},{f:4,w:3.92,z:1.88},{f:11,w:4.00,z:1.73},
      {f:22,w:3.72,z:1.47},{f:35,w:3.05,z:1.18},{f:48,w:1.58,z:.90},{f:55,w:.16,z:.67}
    ];
  }
  ownshipCamVertex(cam,sub,forwardM,sideM,zM){
    const d=degToRad(sub.heading-(cam.bearingDeg??sub.heading)),c=Math.cos(d),q=Math.sin(d);
    return{f:forwardM*c-sideM*q,r:forwardM*q+sideM*c,z:zM};
  }
  clipOwnshipPolygon(poly,near=.55){
    if(!poly.length)return[];const out=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],ai=a.f>=near,bi=b.f>=near;
      if(ai)out.push(a);
      if(ai!==bi){const t=(near-a.f)/(b.f-a.f);out.push({f:near,r:lerp(a.r,b.r,t),z:lerp(a.z,b.z,t)});}
    }
    return out;
  }
  projectOwnshipLocal(cam,v){
    if(v.f<.54)return null;
    return{x:cam.cx+v.r/v.f*cam.f,y:cam.cy+((cam.h-v.z)/v.f+v.f/(2*EARTH_R))*cam.f,d:v.f};
  }
  clipOwnshipSegment(a,b,near=.55){
    const ai=a.f>=near,bi=b.f>=near;if(!ai&&!bi)return null;
    if(ai&&bi)return[a,b];const t=(near-a.f)/(b.f-a.f),m={f:near,r:lerp(a.r,b.r,t),z:lerp(a.z,b.z,t)};
    return ai?[a,m]:[m,b];
  }
  ownshipSurfaceMesh(cam,state){
    const sub=state.playerSub,secs=this.ownshipSurfaceSections(),faces=[],near=.55;
    const V=(r,side,z)=>this.ownshipCamVertex(cam,sub,r.f,side*r.w,z===undefined?r.z:z);
    const add=(kind,poly)=>{
      const clipped=this.clipOwnshipPolygon(poly,near);if(clipped.length<3)return;
      const pts=clipped.map(v=>this.projectOwnshipLocal(cam,v));if(pts.some(x=>!x))return;
      faces.push({kind,pts,depth:clipped.reduce((n,v)=>n+v.f,0)/clipped.length});
    };
    for(let i=0;i<secs.length-1;i++){
      const a=secs[i],b=secs[i+1];
      add('DECK',[V(a,-1),V(b,-1),V(b,1),V(a,1)]);
      add('PORT',[V(a,-1,.12),V(b,-1,.12),V(b,-1),V(a,-1)]);
      add('STARBOARD',[V(a,1),V(b,1),V(b,1,.12),V(a,1,.12)]);
    }
    // Fairwater/conning-tower body bridges the visual gap around the camera.
    const box=[
      [-4,-1.55,1.75],[-4,1.55,1.75],[4,1.55,1.75],[4,-1.55,1.75],
      [-3,-1.28,5.25],[-3,1.28,5.25],[3,1.28,5.25],[3,-1.28,5.25]
    ].map(v=>this.ownshipCamVertex(cam,sub,v[0],v[1],v[2]));
    add('FAIRWATER',[box[0],box[1],box[5],box[4]]);add('FAIRWATER',[box[1],box[2],box[6],box[5]]);
    add('FAIRWATER',[box[2],box[3],box[7],box[6]]);add('FAIRWATER',[box[3],box[0],box[4],box[7]]);
    add('FAIRWATER_TOP',[box[4],box[5],box[6],box[7]]);
    faces.sort((a,b)=>b.depth-a.depth);
    return faces;
  }

  drawOwnshipSurfaceDeck3D(ctx,cam,state,opts={}){
    const sub=state.playerSub,k=this.k,faces=this.ownshipSurfaceMesh(cam,state);
    for(const face of faces){
      if(face.kind==='DECK')ctx.fillStyle='rgba(43,51,48,.985)';
      else if(face.kind==='FAIRWATER_TOP')ctx.fillStyle='rgba(52,60,56,.99)';
      else if(face.kind.startsWith('FAIRWATER'))ctx.fillStyle='rgba(29,36,34,.99)';
      else ctx.fillStyle='rgba(10,16,17,.98)';
      ctx.beginPath();face.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
      ctx.strokeStyle=face.kind==='DECK'?'rgba(126,141,133,.55)':'rgba(94,108,102,.48)';ctx.lineWidth=Math.max(.7,.9*k);ctx.stroke();
    }

    // Centre seam and rails are near-plane clipped segments rather than a list
    // of independently projected points, so they remain continuous at 90°.
    const secs=this.ownshipSurfaceSections(),line=(side,height,col)=>{
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(.7,.85*k);ctx.beginPath();let started=false;
      for(let i=0;i<secs.length-1;i++){
        const a=secs[i],b=secs[i+1];
        const av=this.ownshipCamVertex(cam,sub,a.f,side*a.w,a.z+height),bv=this.ownshipCamVertex(cam,sub,b.f,side*b.w,b.z+height);
        const seg=this.clipOwnshipSegment(av,bv);if(!seg){started=false;continue;}
        const p0=this.projectOwnshipLocal(cam,seg[0]),p1=this.projectOwnshipLocal(cam,seg[1]);if(!p0||!p1)continue;
        if(!started){ctx.moveTo(p0.x,p0.y);started=true;}else ctx.lineTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);
      }ctx.stroke();
    };
    line(0,.035,'rgba(128,141,134,.30)');line(-.92,.30,'rgba(148,160,153,.44)');line(.92,.30,'rgba(148,160,153,.44)');

    // A few fixed fittings keep scale/readability without textures.
    const detail=opts.gun?[-28,-13,14,30,43]:[-28,-13,13,29,42];
    for(const fwd of detail){
      const sec=secs.reduce((a,b)=>Math.abs(b.f-fwd)<Math.abs(a.f-fwd)?b:a),q=this.ownshipCamVertex(cam,sub,fwd,0,sec.z+.08);
      if(q.f<.75)continue;const p=this.projectOwnshipLocal(cam,q);if(!p)continue;
      const rr=clamp(cam.f/Math.max(q.f,90)*.62,1.1*k,4.2*k);ctx.fillStyle='rgba(7,12,12,.78)';ctx.beginPath();ctx.ellipse(p.x,p.y,rr*1.25,rr*.62,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(128,142,135,.48)';ctx.stroke();
    }
    return faces.length;
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
