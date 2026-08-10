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

  /* ── OWNSHIP PSEUDO-3D ─────────────────────────────────────────────
     BRIDGE and GUN are cameras physically mounted on the submarine.  The old
     renderer rotated hull coordinates around the boat's centre while leaving
     the camera at that same mathematical origin, then tried to hide the worst
     near-plane distortions with angle-dependent clipping.  That is why the
     deck could turn into a giant slab or fold at the ends of a look sweep.

     This path now uses one ordinary camera-space transform:
       1. hull vertices live in a fixed submarine-local coordinate system;
       2. each station has a real local camera position on that hull;
       3. the whole mesh is transformed once into camera space;
       4. polygons are clipped against one small, fixed near plane;
       5. only the closed upper casing/deck is visible from an onboard camera.

     It is still cheap Canvas2D vector geometry, but perspective is now the
     same operation at 0°, 90°, 180° and every bearing between. */
  ownshipSurfaceSections(){
    return[
      {f:-47,w:.18,z:.68},{f:-41,w:2.35,z:.96},{f:-32,w:3.15,z:1.20},{f:-22,w:3.55,z:1.43},
      {f:-12,w:3.82,z:1.67},{f:-5,w:3.90,z:1.82},{f:4,w:3.92,z:1.88},{f:11,w:4.00,z:1.73},
      {f:22,w:3.72,z:1.47},{f:35,w:3.05,z:1.18},{f:48,w:1.58,z:.90},{f:55,w:.16,z:.67}
    ];
  }
  ownshipCameraPose(cam,state,opts={}){
    // Fairwater/bridge is close to amidships. The gun sight lives on the
    // forward gun mount, not at the centre of the submarine.
    const fwd=opts.gun?12.0:0.0,side=0;
    cam.ownshipCameraFwdM=fwd;cam.ownshipCameraSideM=side;
    return{fwd,side};
  }
  ownshipNearPlane(cam,state,opts={}){return opts.gun?.42:.38;}
  ownshipCamVertex(cam,sub,forwardM,sideM,zM,opts={}){
    const pose=(Number.isFinite(cam.ownshipCameraFwdM)&&Number.isFinite(cam.ownshipCameraSideM))
      ?{fwd:cam.ownshipCameraFwdM,side:cam.ownshipCameraSideM}:this.ownshipCameraPose(cam,{playerSub:sub},opts);
    const lf=forwardM-pose.fwd,ls=sideM-pose.side;
    const d=degToRad(sub.heading-(cam.bearingDeg??sub.heading)),c=Math.cos(d),q=Math.sin(d);
    return{f:lf*c-ls*q,r:lf*q+ls*c,z:zM};
  }
  ownshipFrustumPlanes(cam,near=.38){
    const w=cam.viewW||cam.cx*2,h=cam.viewH||Math.max(cam.cy*2,cam.r||cam.cy*2);
    const left=(0-cam.cx)/cam.f,right=(w-cam.cx)/cam.f,top=cam.cy/cam.f,bottom=(cam.cy-h)/cam.f;
    return[
      v=>v.f-near,
      v=>v.r-left*v.f,
      v=>right*v.f-v.r,
      v=>top*v.f-(v.z-cam.h),
      v=>(v.z-cam.h)-bottom*v.f
    ];
  }
  clipOwnshipPolygon(poly,near=.38,cam=null){
    if(!poly.length)return[];
    const planes=cam?this.ownshipFrustumPlanes(cam,near):[v=>v.f-near];
    let src=poly;
    for(const plane of planes){
      if(!src.length)break;const out=[];
      for(let i=0;i<src.length;i++){
        const a=src[i],b=src[(i+1)%src.length],fa=plane(a),fb=plane(b),ai=fa>=0,bi=fb>=0;
        if(ai)out.push(a);
        if(ai!==bi){const t=fa/(fa-fb);out.push({f:lerp(a.f,b.f,t),r:lerp(a.r,b.r,t),z:lerp(a.z,b.z,t)});}
      }
      src=out;
    }
    return src;
  }
  projectOwnshipLocal(cam,v,near=.38){
    if(v.f<near-.01)return null;
    return{x:cam.cx+v.r/v.f*cam.f,y:cam.cy+((cam.h-v.z)/v.f+v.f/(2*EARTH_R))*cam.f,d:v.f};
  }
  clipOwnshipSegment(a,b,near=.38,cam=null){
    const planes=cam?this.ownshipFrustumPlanes(cam,near):[v=>v.f-near];let A={...a},B={...b};
    for(const plane of planes){
      let fa=plane(A),fb=plane(B);if(fa<0&&fb<0)return null;
      if(fa>=0&&fb>=0)continue;
      const t=fa/(fa-fb),m={f:lerp(A.f,B.f,t),r:lerp(A.r,B.r,t),z:lerp(A.z,B.z,t)};
      if(fa<0)A=m;else B=m;
    }
    return[A,B];
  }
  ownshipSurfaceMesh(cam,state,opts={}){
    const sub=state.playerSub,secs=this.ownshipSurfaceSections(),faces=[],near=this.ownshipNearPlane(cam,state,opts);
    this.ownshipCameraPose(cam,state,opts);
    const V=(s,side,z)=>this.ownshipCamVertex(cam,sub,s.f,side*s.w,z===undefined?s.z:z,opts);
    const add=(kind,poly)=>{
      const clipped=this.clipOwnshipPolygon(poly,near,cam);if(clipped.length<3)return;
      const pts=clipped.map(v=>this.projectOwnshipLocal(cam,v,near));if(pts.some(x=>!x))return;
      const depth=clipped.reduce((n,v)=>n+v.f,0)/clipped.length;
      faces.push({kind,pts,depth});
    };
    for(let i=0;i<secs.length-1;i++){
      const a=secs[i],b=secs[i+1],az=a.z+.10,bz=b.z+.10;
      // One closed crown from port edge through centreline to starboard edge.
      // No overlapping shoulder/side plates are allowed to paint across it.
      add('DECK_PORT',[V(a,-1,a.z),V(b,-1,b.z),V(b,0,bz),V(a,0,az)]);
      add('DECK_STARBOARD',[V(a,0,az),V(b,0,bz),V(b,1,b.z),V(a,1,a.z)]);
    }
    faces.sort((a,b)=>b.depth-a.depth);
    return faces;
  }

  drawOwnshipSurfaceDeck3D(ctx,cam,state,opts={}){
    const sub=state.playerSub,k=this.k,near=this.ownshipNearPlane(cam,state,opts);
    this.ownshipCameraPose(cam,state,opts);
    const faces=this.ownshipSurfaceMesh(cam,state,opts);
    for(const face of faces){
      ctx.fillStyle=face.kind==='DECK_PORT'?'rgba(45,55,51,.995)':'rgba(48,58,54,.995)';
      ctx.beginPath();face.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(118,137,128,.48)';ctx.lineWidth=Math.max(.65,.8*k);ctx.stroke();
    }

    const secs=this.ownshipSurfaceSections();
    const shapeAt=fwd=>{
      if(fwd<=secs[0].f)return{w:secs[0].w,z:secs[0].z};if(fwd>=secs.at(-1).f)return{w:secs.at(-1).w,z:secs.at(-1).z};
      for(let i=0;i<secs.length-1;i++){const a=secs[i],b=secs[i+1];if(fwd>=a.f&&fwd<=b.f){const u=(fwd-a.f)/(b.f-a.f);return{w:lerp(a.w,b.w,u),z:lerp(a.z,b.z,u)};}}return{w:3,z:1};
    };
    const seg=(a,b,col='rgba(139,153,146,.48)',lw=.8)=>{
      const av=this.ownshipCamVertex(cam,sub,...a,opts),bv=this.ownshipCamVertex(cam,sub,...b,opts),q=this.clipOwnshipSegment(av,bv,near,cam);if(!q)return false;
      const p0=this.projectOwnshipLocal(cam,q[0],near),p1=this.projectOwnshipLocal(cam,q[1],near);if(!p0||!p1)return false;
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(.65,lw*k);ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();return true;
    };
    const poly=(pts,fill,stroke='rgba(138,153,146,.52)',lw=.8)=>{
      const q=this.clipOwnshipPolygon(pts.map(v=>this.ownshipCamVertex(cam,sub,...v,opts)),near,cam);if(q.length<3)return false;
      const P=q.map(v=>this.projectOwnshipLocal(cam,v,near));if(P.some(v=>!v))return false;
      ctx.fillStyle=fill;ctx.beginPath();P.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fill();
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(.65,lw*k);ctx.stroke();}return true;
    };
    const deckRect=(fwd,side,len,width,zOff,fill,stroke)=>{
      const s=shapeAt(fwd),z=s.z+.13+zOff;return poly([[fwd-len/2,side-width/2,z],[fwd+len/2,side-width/2,z],[fwd+len/2,side+width/2,z],[fwd-len/2,side+width/2,z]],fill,stroke,.75);
    };

    // Rails and casing outline are projected from the same hull coordinates.
    const lineAlong=(sideFactor,height,col,lw=.9)=>{
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(.7,lw*k);ctx.beginPath();let active=false;
      for(let i=0;i<secs.length-1;i++){
        const a=secs[i],b=secs[i+1],av=this.ownshipCamVertex(cam,sub,a.f,sideFactor*a.w,a.z+height,opts),bv=this.ownshipCamVertex(cam,sub,b.f,sideFactor*b.w,b.z+height,opts);
        const q=this.clipOwnshipSegment(av,bv,near,cam);if(!q){active=false;continue;}const p0=this.projectOwnshipLocal(cam,q[0],near),p1=this.projectOwnshipLocal(cam,q[1],near);if(!p0||!p1)continue;
        if(!active){ctx.moveTo(p0.x,p0.y);active=true;}else ctx.lineTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);
      }ctx.stroke();
    };
    lineAlong(0,.12,'rgba(150,164,156,.30)',.75);
    lineAlong(-1,.02,'rgba(158,173,165,.72)',.95);lineAlong(1,.02,'rgba(158,173,165,.72)',.95);
    lineAlong(-.99,.38,'rgba(177,190,183,.65)',.9);lineAlong(.99,.38,'rgba(177,190,183,.65)',.9);
    lineAlong(-.99,.22,'rgba(156,171,163,.46)',.7);lineAlong(.99,.22,'rgba(156,171,163,.46)',.7);

    const seamF=opts.gun?[22,29,36,43,49]:[12,18,25,32,39,46,51];
    for(const fwd of seamF){const sh=shapeAt(fwd);seg([fwd,-sh.w*.72,sh.z+.11],[fwd,sh.w*.72,sh.z+.11],'rgba(166,179,171,.27)',.65);}

    const posts=opts.gun?[20,27,34,41,48]:[12,18,25,32,39,46,51];
    for(const fwd of posts){const sh=shapeAt(fwd);for(const side of [-1,1]){const y=side*sh.w;seg([fwd,y,sh.z+.03],[fwd,y,sh.z+.39],'rgba(177,190,183,.65)',.82);}}

    // Deck fittings: actual projected geometry, not screen-space decoration.
    for(const fwd of opts.gun?[22,34,44]:[15,26,38,47]){
      const sh=shapeAt(fwd),q=this.ownshipCamVertex(cam,sub,fwd,0,sh.z+.14,opts);if(q.f<near)continue;const p=this.projectOwnshipLocal(cam,q,near);if(!p)continue;
      const rr=clamp(cam.f/Math.max(q.f,25)*.10,2.1*k,6.5*k);ctx.fillStyle='rgba(10,16,16,.86)';ctx.beginPath();ctx.ellipse(p.x,p.y,rr*1.5,rr*.70,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(176,188,181,.64)';ctx.lineWidth=Math.max(.7,.85*k);ctx.stroke();
    }
    deckRect(opts.gun?31:27,0,3.0,1.28,.015,'rgba(21,28,27,.88)','rgba(157,171,163,.47)');
    for(const fwd of opts.gun?[39,42]:[34,36.2]){const sh=shapeAt(fwd);for(let n=-2;n<=2;n++)seg([fwd-1.25,n*.20,sh.z+.12],[fwd+1.25,n*.20,sh.z+.12],'rgba(8,14,14,.68)',.72);}

    // The early-war 3-inch mount sits on the forward deck close to the
    // fairwater rather than out near the bow. This makes it readable from the
    // bridge while keeping the bow itself clean and recognisably submarine-like.
    if(opts.bridge){
      const fwd=12.0,sh=shapeAt(fwd),z=sh.z;
      seg([fwd,0,z+.10],[fwd,0,z+.92],'rgba(137,151,144,.96)',3.0);
      poly([[fwd-.30,-.66,z+.70],[fwd-.30,.66,z+.70],[fwd-.30,.56,z+1.35],[fwd-.30,-.56,z+1.35]],'rgba(54,64,60,.98)','rgba(185,197,190,.78)',1.05);
      seg([fwd-.45,-.54,z+.18],[fwd-.22,-.43,z+.86],'rgba(145,159,151,.72)',1.45);
      seg([fwd-.45,.54,z+.18],[fwd-.22,.43,z+.86],'rgba(145,159,151,.72)',1.45);
      seg([fwd-.05,0,z+1.04],[fwd+5.3,0,z+1.38],'rgba(190,201,194,.96)',2.6);
      seg([fwd+5.3,0,z+1.38],[fwd+5.72,0,z+1.40],'rgba(62,72,68,.98)',3.5);
    }
    return faces.length;
  }

  drawDeckGun(ctx,w,h,state){
    const sub=state.playerSub,G=state.weapons.deckGun,env=state.world.environment,t=state.time.elapsedSeconds;
    const bearing=normDeg(sub.heading+(G?.trainDeg||0));
    const fov=this.portrait?62:56,cx=w/2,cy=this.portrait?h*0.46:h*0.49,r=Math.max(w,h)*0.72;
    const cam=this.setupCam(state,fov,cx,cy,r);
    cam.h=5.6;cam.bearingDeg=bearing;cam.viewW=w;cam.viewH=h;const br=degToRad(bearing);cam.sin=Math.sin(br);cam.cos=Math.cos(br);
    // The gun camera physically stands at the forward mount. setupCam's
    // generic world camera is at the submarine origin; with the gun trained
    // abeam that made a correctly simulated shell appear to emerge from the
    // boat's old straight-ahead axis. Move the world camera to the same mount
    // used by the ownship mesh so muzzle, flash and tracer share one origin.
    const hr=degToRad(sub.heading),mountForwardM=12.0;
    cam.E=(sub.position.xNm+Math.sin(hr)*mountForwardM/NM_M)*NM_M;
    cam.N=-(sub.position.yNm-Math.cos(hr)*mountForwardM/NM_M)*NM_M;
    cam.dip=Math.sqrt(2*cam.h/EARTH_R);cam.horizonY=cy+cam.f*cam.dip;cam.dHor=Math.sqrt(2*EARTH_R*cam.h);cam.kind='GUN';
    this.cam=cam;this.gunCam=cam;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    this.drawSky3D(ctx,w,h,cam,state,env.daylight,env.weather||'CLEAR',t);
    this.drawSea3D(ctx,w,h,cam,env.daylight,env.seaState,env.weather||'CLEAR',t);
    this.drawTerrain3D(ctx,cam,state,env.daylight);
    this.drawBattleAtmosphereBack?.(ctx,cam,state,env.daylight,t);
    this.drawWakes3D(ctx,cam,state,t,env.daylight);
    // Overshoots aligned with a target are painted BEFORE the nearer hull;
    // the ship therefore occludes the water column instead of a far splash
    // appearing magically on top of the target.
    this.drawGunSplashes3D(ctx,cam,state,true);
    this.drawFleet3D(ctx,cam,state,env.daylight,env,t);
    this.drawExplosions3D(ctx,cam,state,env.daylight);
    this.drawGunProjectiles3D(ctx,cam,state,false);
    this.drawGunSplashes3D(ctx,cam,state,false);
    this.drawBattleAtmosphereFront?.(ctx,cam,state,env.daylight,t);
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
      const age=Math.max(0,t-(G.flashStartedAt??t)),life=Math.max(.08,G.flashUntil-(G.flashStartedAt??t));
      const a=clamp(1-age/life,0,1),fy=Math.max(aimY+26*k,gunY-92*k);
      ctx.save();ctx.globalCompositeOperation='screen';
      // Nearby blast light can wash the sight a little, but the visible flame is
      // directional: it leaves the muzzle and stretches forward along the bore.
      const gg=ctx.createRadialGradient(cx,fy,0,cx,fy,54*k);gg.addColorStop(0,`rgba(255,238,170,${a*.34})`);gg.addColorStop(1,'rgba(255,132,34,0)');
      ctx.fillStyle=gg;ctx.fillRect(cx-58*k,fy-58*k,116*k,116*k);
      const len=(52+28*(1-a))*k,wide=(10+6*a)*k,wob=Math.sin(age*91)*3*k;
      ctx.fillStyle=`rgba(255,126,35,${a*.78})`;ctx.beginPath();ctx.moveTo(cx-wide*.70,fy+2*k);ctx.quadraticCurveTo(cx+wob,fy-len*.48,cx+wob*.4,fy-len);ctx.quadraticCurveTo(cx-wob*.35,fy-len*.43,cx+wide*.70,fy+2*k);ctx.closePath();ctx.fill();
      ctx.fillStyle=`rgba(255,246,196,${a*.96})`;ctx.beginPath();ctx.moveTo(cx-wide*.32,fy);ctx.quadraticCurveTo(cx+wob*.35,fy-len*.30,cx+wob*.15,fy-len*.64);ctx.quadraticCurveTo(cx-wob*.20,fy-len*.28,cx+wide*.32,fy);ctx.closePath();ctx.fill();
      // A few fast incandescent grains make the burst read as propellant flame,
      // not a static glowing sprite.
      ctx.strokeStyle=`rgba(255,211,116,${a*.70})`;ctx.lineWidth=Math.max(1,1.2*k);
      for(let i=-2;i<=2;i++){const sx=cx+i*3.2*k,sl=(24+Math.abs(i)*8)*k;ctx.beginPath();ctx.moveTo(sx,fy-7*k);ctx.lineTo(sx+i*1.6*k,fy-sl);ctx.stroke();}
      ctx.restore();
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
      const cb=bearingBetween(sub.position,c.position),realLen=shipVisualLengthM(c,400);
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
