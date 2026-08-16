class CanvasViewDeckGun extends CanvasViewTactical {
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
  ownshipVisualModelKey(state){
    const p=typeof getSubmarineProfile==='function'?getSubmarineProfile(state?.playerSub?.profileId):null;
    return p?.visualModelKey||'GATO_FLEET_BOAT';
  }
  ownshipSurfaceSections(state=null){
    if(this.ownshipVisualModelKey(state)==='TYPE_VIIC_1941')return[
      {f:-33.2,w:.12,z:.50},{f:-29,w:1.35,z:.67},{f:-23,w:2.35,z:.84},{f:-15,w:2.75,z:1.00},
      {f:-7,w:2.92,z:1.12},{f:0,w:3.02,z:1.18},{f:8,w:2.96,z:1.12},{f:16,w:2.72,z:.98},
      {f:24,w:2.18,z:.80},{f:30,w:1.12,z:.62},{f:33.8,w:.10,z:.48}
    ];
    return[
      {f:-47,w:.18,z:.68},{f:-41,w:2.35,z:.96},{f:-32,w:3.15,z:1.20},{f:-22,w:3.55,z:1.43},
      {f:-12,w:3.82,z:1.67},{f:-5,w:3.90,z:1.82},{f:4,w:3.92,z:1.88},{f:11,w:4.00,z:1.73},
      {f:22,w:3.72,z:1.47},{f:35,w:3.05,z:1.18},{f:48,w:1.58,z:.90},{f:55,w:.16,z:.67}
    ];
  }
  ownshipDeckGunForwardM(state){return this.ownshipVisualModelKey(state)==='TYPE_VIIC_1941'?8.5:12.0;}
  ownshipCameraPose(cam,state,opts={}){
    // Fairwater/bridge is close to amidships. The gun sight lives on the
    // forward gun mount, not at the centre of the submarine.
    const fwd=opts.gun?this.ownshipDeckGunForwardM(state):(this.ownshipVisualModelKey(state)==='TYPE_VIIC_1941'?-2.0:0.0),side=0;
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
    const sub=state.playerSub,secs=this.ownshipSurfaceSections(state),faces=[],near=this.ownshipNearPlane(cam,state,opts);
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
    const sub=state.playerSub,k=this.k,near=this.ownshipNearPlane(cam,state,opts),viic=this.ownshipVisualModelKey(state)==='TYPE_VIIC_1941';
    this.ownshipCameraPose(cam,state,opts);
    const faces=this.ownshipSurfaceMesh(cam,state,opts);
    for(const face of faces){
      ctx.fillStyle=face.kind==='DECK_PORT'?'rgba(45,55,51,.995)':'rgba(48,58,54,.995)';
      ctx.beginPath();face.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(118,137,128,.48)';ctx.lineWidth=Math.max(.65,.8*k);ctx.stroke();
    }

    const secs=this.ownshipSurfaceSections(state);
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

    const seamF=viic?(opts.gun?[12,17,22,27,31]:[7,12,17,22,27,31]):(opts.gun?[22,29,36,43,49]:[12,18,25,32,39,46,51]);
    for(const fwd of seamF){const sh=shapeAt(fwd);seg([fwd,-sh.w*.72,sh.z+.11],[fwd,sh.w*.72,sh.z+.11],'rgba(166,179,171,.27)',.65);}

    const posts=viic?(opts.gun?[11,16,21,26,30]:[7,12,17,22,27,31]):(opts.gun?[20,27,34,41,48]:[12,18,25,32,39,46,51]);
    for(const fwd of posts){const sh=shapeAt(fwd);for(const side of [-1,1]){const y=side*sh.w;seg([fwd,y,sh.z+.03],[fwd,y,sh.z+.39],'rgba(177,190,183,.65)',.82);}}

    // Deck fittings: actual projected geometry, not screen-space decoration.
    for(const fwd of (viic?(opts.gun?[13,22,29]:[8,16,24,30]):(opts.gun?[22,34,44]:[15,26,38,47]))){
      const sh=shapeAt(fwd),q=this.ownshipCamVertex(cam,sub,fwd,0,sh.z+.14,opts);if(q.f<near)continue;const p=this.projectOwnshipLocal(cam,q,near);if(!p)continue;
      const rr=clamp(cam.f/Math.max(q.f,25)*.10,2.1*k,6.5*k);ctx.fillStyle='rgba(10,16,16,.86)';ctx.beginPath();ctx.ellipse(p.x,p.y,rr*1.5,rr*.70,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(176,188,181,.64)';ctx.lineWidth=Math.max(.7,.85*k);ctx.stroke();
    }
    deckRect(viic?(opts.gun?21:18):(opts.gun?31:27),0,viic?2.4:3.0,viic?1.05:1.28,.015,'rgba(21,28,27,.88)','rgba(157,171,163,.47)');
    for(const fwd of (viic?(opts.gun?[26,28]:[24,26]):(opts.gun?[39,42]:[34,36.2]))){const sh=shapeAt(fwd);for(let n=-2;n<=2;n++)seg([fwd-1.25,n*.20,sh.z+.12],[fwd+1.25,n*.20,sh.z+.12],'rgba(8,14,14,.68)',.72);}

    // The early-war 3-inch mount sits on the forward deck close to the
    // fairwater rather than out near the bow. This makes it readable from the
    // bridge while keeping the bow itself clean and recognisably submarine-like.
    if(opts.bridge){
      const fwd=this.ownshipDeckGunForwardM(state),sh=shapeAt(fwd),z=sh.z,compact=viic?.86:1;
      seg([fwd,0,z+.10],[fwd,0,z+.88*compact],'rgba(137,151,144,.96)',2.7);
      poly([[fwd-.28,-.62*compact,z+.65],[fwd-.28,.62*compact,z+.65],[fwd-.28,.52*compact,z+1.25*compact],[fwd-.28,-.52*compact,z+1.25*compact]],'rgba(54,64,60,.98)','rgba(185,197,190,.78)',1.0);
      seg([fwd-.40,-.50*compact,z+.18],[fwd-.20,-.40*compact,z+.82*compact],'rgba(145,159,151,.72)',1.35);
      seg([fwd-.40,.50*compact,z+.18],[fwd-.20,.40*compact,z+.82*compact],'rgba(145,159,151,.72)',1.35);
      const barrel=viic?4.4:5.3;seg([fwd-.04,0,z+.98*compact],[fwd+barrel,0,z+1.28*compact],'rgba(190,201,194,.96)',viic?2.3:2.6);
      seg([fwd+barrel,0,z+1.28*compact],[fwd+barrel+.38,0,z+1.30*compact],'rgba(62,72,68,.98)',3.2);
    }
    return faces.length;
  }

  /* ── AIRCRAFT PSEUDO-3D ─────────────────────────────────────────────
     BRIDGE and GUN share this world-space renderer. Aircraft are deliberately
     tiny parameterised meshes rather than station-specific icons or sprites:
     camera bearing therefore determines front / belly / rear aspect naturally.
     Keep this renderer cheap: a handful of projected polygons per visible
     aircraft, no textures, no per-pixel work and no new animation loop. */
  aircraftVisualProfile(a){
    const profile=typeof getAircraftProfile==='function'?getAircraftProfile(a?.aircraftProfileId):null;
    if(profile)return{key:profile.id,span:profile.spanM,len:profile.lengthM,body:profile.engines>=4?1.85:profile.kind==='FLYING_BOAT'?1.55:.78,tail:profile.lengthM*.42,engines:profile.engines,wingY:profile.kind==='FLYING_BOAT'?.04:.07,float:profile.kind==='FLYING_BOAT'};
    const name=String(a?.name||'').toUpperCase(),kind=String(a?.kind||'').toUpperCase();
    if(name.includes('PBY')||name.includes('CATALINA'))return{key:'PBY',span:31.7,len:19.5,body:1.55,tail:8.8,engines:2,wingY:.05,float:false};
    if(name.includes('TYPE 97')||name.includes('H6K'))return{key:'H6K',span:40.0,len:25.6,body:2.0,tail:11.2,engines:4,wingY:.01,float:true};
    if(kind==='FLYING_BOAT')return{key:'FLYING_BOAT',span:34,len:22,body:1.8,tail:10,engines:4,wingY:.02,float:true};
    if(kind==='FLOATPLANE'||name.includes('E13A'))return{key:'FLOATPLANE',span:14.5,len:11.3,body:.72,tail:4.7,engines:1,wingY:.07,float:true};
    if(kind==='FIGHTER')return{key:'FIGHTER',span:11.0,len:9.0,body:.62,tail:3.7,engines:1,wingY:.05,float:false};
    // B5N / ordinary single-engine carrier aircraft.
    return{key:'B5N',span:15.5,len:10.3,body:.68,tail:5.0,engines:1,wingY:.06,float:false};
  }

  aircraftVisualAltitudeM(a,rng){
    if(Number.isFinite(a?.visualAltitudeM))return a.visualAltitudeM;
    if(a?.state==='ATTACKING'||a?.state==='STRAFING')return clamp(62+rng*50,78,250);
    if(a?.state==='ORBIT')return 310;
    if(a?.state==='DEPARTING')return 380;
    return 430;
  }

  drawAircraftPseudo3D(ctx,cam,state,a,dl,t,opts={}){
    const sub=state.playerSub,env=state.world.environment||{},rng=distNm(sub.position,a.position);
    const wx=weatherBetween(state,sub.position,a.position),vis=Math.min(15,Math.max(1.2,wx.visibilityNm*1.18));
    if(rng>vis)return false;
    const bear=bearingBetween(sub.position,a.position),off=shortDelta(cam.bearingDeg,bear);
    if(Math.abs(off)>cam.fovDeg*.56)return false;
    const P=this.aircraftVisualProfile(a),alt=this.aircraftVisualAltitudeM(a,rng);
    const h=degToRad(a.heading||0),fx=Math.sin(h),fy=-Math.cos(h),rx=Math.cos(h),ry=Math.sin(h);
    // ATTACKING shows a restrained nose-down attitude; DEPARTING a slight climb.
    // This is presentation only. Flight AI remains 2-D and therefore cannot leak
    // a fake altitude state back into simulation or collision logic.
    const pitchDeg=a.state==='ATTACKING'?-5.5:a.state==='DEPARTING'?5.0:a.state==='STRAFING'?-3:0;
    const pitch=degToRad(pitchDeg),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const bankDeg=(a.state==='ORBIT'?clamp((a.orbitSign||1)*14,-18,18):a.state==='DEPARTING'?clamp((a.orbitSign||1)*8,-12,12):0);
    const bank=degToRad(bankDeg),cb=Math.cos(bank),sb=Math.sin(bank);
    const E0=a.position.xNm*NM_M,N0=-a.position.yNm*NM_M;
    const world=(side,forward,up=0)=>{
      // pitch rotates forward/up; bank rotates side/up. Applying these tiny
      // rotations in local aircraft space is enough to suggest attitude while
      // retaining the very cheap world projection used by ships.
      const f2=forward*cp-up*sp,u2=forward*sp+up*cp;
      const s2=side*cb-u2*sb,u3=side*sb+u2*cb;
      return{E:E0+fx*f2+rx*s2,N:N0+fy*f2+ry*s2,Y:alt+u3};
    };
    const project=q=>{const p=projectWorldPoint(cam,q.E,q.N,q.Y);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;};
    const friendly=a.side==='FRIENDLY',attack=!friendly&&(a.state==='ATTACKING'||a.state==='STRAFING');
    const haze=clamp(1-rng/Math.max(1,vis),.24,1),night=clamp(1-dl,0,1);
    const base=friendly?[39,68,54]:attack?[53,45,35]:[45,52,51];
    const shade=(mul,alpha=.96)=>`rgba(${Math.round(base[0]*mul)},${Math.round(base[1]*mul)},${Math.round(base[2]*mul)},${alpha*haze})`;
    const edge=friendly?`rgba(111,224,143,${.68*haze})`:attack?`rgba(239,106,88,${.58*haze})`:`rgba(205,220,214,${.34*haze})`;
    const L=P.len,S=P.span,B=P.body,tailY=-L*.38,wingY=L*P.wingY;
    const pts={
      nose:world(0,L*.52,0), noseU:world(0,L*.43,B*.42),
      tail:world(0,-L*.48,0), tailU:world(0,-L*.40,B*.30),
      wl:world(-S*.50,wingY,0), wr:world(S*.50,wingY,0),
      wli:world(-B*.62,wingY-L*.03,0), wri:world(B*.62,wingY-L*.03,0),
      tl:world(-P.tail*.50,tailY,0), tr:world(P.tail*.50,tailY,0),
      tli:world(-B*.42,tailY-L*.02,0), tri:world(B*.42,tailY-L*.02,0),
      fin:world(0,-L*.40,B*1.18), belly:world(0,0,-B*.38)
    };
    const pp={};for(const [k,q] of Object.entries(pts)){pp[k]=project(q);if(!pp[k]&&['nose','tail','wl','wr'].includes(k))return false;}
    const faces=[];
    const face=(keys,fill,stroke=edge,lw=.8)=>{const ps=keys.map(k=>pp[k]).filter(Boolean);if(ps.length<3)return;faces.push({ps,fill,stroke,lw,d:ps.reduce((n,p)=>n+p.d,0)/ps.length});};
    // Far-to-near order gives adequate self-occlusion for these tiny meshes.
    face(['wli','wl','tail','wri'],shade(.72));
    face(['wri','wr','tail','wli'],shade(.79));
    face(['nose','noseU','tailU','tail'],shade(.90));
    face(['tli','tl','tail','tri'],shade(.67));
    face(['tri','tr','tail','tli'],shade(.71));
    face(['tailU','fin','tail'],shade(.62));
    faces.sort((a,b)=>b.d-a.d);
    for(const f of faces){ctx.beginPath();ctx.moveTo(f.ps[0].x,f.ps[0].y);for(let i=1;i<f.ps.length;i++)ctx.lineTo(f.ps[i].x,f.ps[i].y);ctx.closePath();ctx.fillStyle=f.fill;ctx.fill();ctx.strokeStyle=f.stroke;ctx.lineWidth=Math.max(.65*this.k,f.lw*this.k);ctx.stroke();}

    // Engines/propeller disks. Draw only once the projection is large enough;
    // tiny aircraft remain a clean silhouette. A translucent ellipse is cheap
    // and, crucially, is seen edge-on/face-on according to the real aspect.
    const approxPx=P.span*cam.f/Math.max(80,(pp.nose?.d||rng*NM_M));
    if(approxPx>8*this.k){
      const engSides=P.engines===1?[0]:P.engines===2?[-S*.18,S*.18]:[-S*.31,-S*.11,S*.11,S*.31];
      // Camera in front of the aircraft? Only then should a propeller disk be a
      // strong cue; from the rear the tail/fin must carry the aspect instead.
      const toCamE=cam.E-E0,toCamN=cam.N-N0,toLen=Math.hypot(toCamE,toCamN)||1,front=(toCamE*fx+toCamN*fy)/toLen;
      for(const es of engSides){
        const hub=project(world(es,L*.09,B*.05));if(!hub)continue;
        ctx.fillStyle=shade(.48,.95);ctx.beginPath();ctx.arc(hub.x,hub.y,Math.max(.8*this.k,approxPx*.028),0,Math.PI*2);ctx.fill();
        if(front>.12){
          const rad=clamp(approxPx*(P.engines===1?.105:.065),1.5*this.k,12*this.k);
          ctx.strokeStyle=`rgba(210,224,216,${(.13+.11*dl)*haze})`;ctx.lineWidth=Math.max(.6,this.k*.7);ctx.beginPath();ctx.ellipse(hub.x,hub.y,rad,rad*.28,0,0,Math.PI*2);ctx.stroke();
        }
      }
    }
    // Float / flying-boat cue. One or two slim underside strokes are enough at
    // medium LOD and keep E13A/PBY/H6K distinguishable without texture detail.
    if(P.float&&approxPx>13*this.k){
      const sides=P.engines>=2?[-S*.18,S*.18]:[-S*.12,S*.12];ctx.strokeStyle=`rgba(20,27,28,${.72*haze})`;ctx.lineWidth=Math.max(1,1.3*this.k);
      for(const ss of sides){const q0=project(world(ss,-L*.02,-B*.42)),q1=project(world(ss,-L*.24,-B*.48));if(q0&&q1){ctx.beginPath();ctx.moveTo(q0.x,q0.y);ctx.lineTo(q1.x,q1.y);ctx.stroke();}}
    }
    if((attack||friendly)&&approxPx>5*this.k){const c=project(world(0,L*.10,B*.8));if(c){ctx.fillStyle=friendly?'rgba(111,224,143,.90)':'rgba(239,106,88,.84)';ctx.font=this.fnt(7.5,true);ctx.textAlign='center';ctx.fillText(friendly?'FRIENDLY AIRCRAFT':'AIRCRAFT',c.x,c.y-7*this.k);ctx.textAlign='left';}}
    return true;
  }

  drawWorldAircraft(ctx,cam,state,dl,t,opts={}){
    for(const a of state.world.aircraft||[]){if(a.shotDown||!a.seenBySub||!a.position)continue;this.drawAircraftPseudo3D(ctx,cam,state,a,dl,t,opts);}
  }

  drawDeckGun(ctx,w,h,state,layout){
    const sub=state.playerSub,G=state.weapons.deckGun,env=state.world.environment,t=state.time.elapsedSeconds;
    const bearing=normDeg(sub.heading+(G?.trainDeg||0));
    const fov=this.portrait?62:56,cx=w/2,cy=this.portrait?h*0.46:h*0.49,r=Math.max(w,h)*0.72;
    const cam=setupViewCamera(state,fov,cx,cy,r,{heightM:5.6,bearingDeg:bearing,viewW:w,viewH:h,kind:'GUN'});
    // The gun camera physically stands at the forward mount. setupCam's
    // generic world camera is at the submarine origin; with the gun trained
    // abeam that made a correctly simulated shell appear to emerge from the
    // boat's old straight-ahead axis. Move the world camera to the same mount
    // used by the ownship mesh so muzzle, flash and tracer share one origin.
    const hr=degToRad(sub.heading),mountForwardM=this.ownshipDeckGunForwardM(state);
    cam.E=(sub.position.xNm+Math.sin(hr)*mountForwardM/NM_M)*NM_M;
    cam.N=-(sub.position.yNm-Math.cos(hr)*mountForwardM/NM_M)*NM_M;
    cam.dip=Math.sqrt(2*cam.h/EARTH_R);cam.horizonY=cy+cam.f*cam.dip;cam.dHor=Math.sqrt(2*EARTH_R*cam.h);
    this.cam=cam;this.gunCam=cam;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    this.drawSky3D(ctx,w,h,cam,state,env.daylight,env.weather||'CLEAR',t);
    this.drawSea3D(ctx,w,h,cam,env.daylight,env.seaState,env.weather||'CLEAR',t,env);
    this.drawTerrain3D(ctx,cam,state,env.daylight);
    this.drawBattleAtmosphereBack?.(ctx,cam,state,env.daylight,t);
    // Same world-space aircraft meshes as BRIDGE. GUN's different FOV changes
    // apparent size naturally; no station-specific aircraft icon is needed.
    this.drawWorldAircraft(ctx,cam,state,env.daylight,t,{station:'GUN'});
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

    // On touch portrait the station selector owns the top-right and can cover a
    // fixed top-left panel once the viewport gets narrow. Use measured DOM safe
    // geometry from TouchCtrl and push the gun card below the selector.
    const touchSafe=layout.shell==='touch'?this.touchOverlaySafe:null;
    const hudY=Math.max(8*k,(touchSafe?.top||0)+3*k),hudW=Math.min(270*k,w-16*k);
    ctx.fillStyle='rgba(3,13,16,.78)';this.rr(ctx,8*k,hudY,hudW,72*k,6*k);ctx.fill();
    const gun=typeof deckGunSpecForState==='function'?deckGunSpecForState(state):{shortLabel:'3-IN/50',maxRangeNm:globalThis.DECK_GUN_MAX_RANGE_NM||7.2};
    ctx.fillStyle='#d7f5e7';ctx.font=this.fnt(10,true);ctx.fillText(`${gun.shortLabel} DECK GUN`,16*k,hudY+17*k);
    ctx.font=this.fnt(8.5);ctx.fillStyle='rgba(210,235,224,.88)';
    ctx.fillText(`BRG ${fmtDeg(bearing)} · TRAIN ${(G?.trainDeg||0).toFixed(1)}° · ELEV ${(G?.elevationDeg||0).toFixed(1)}°`,16*k,hudY+33*k);
    ctx.fillStyle=G?.ammoFlashUntil>t?'#f5c65c':'rgba(210,235,224,.88)';ctx.fillText(`AMMO ${G?.ammo??0} · ${G?.manned?'CREW TOPSIDE':'GUN NOT MANNED'} · drag to aim`,16*k,hudY+48*k);
    const tgt=state.tactical.selectedTrackId&&state.world.contacts.find(c=>c.id===state.tactical.selectedTrackId&&!c.sunk);
    if(tgt){
      const targetRange=distNm(sub.position,tgt.position),maxRange=gun.maxRangeNm;
      ctx.fillStyle=targetRange>maxRange?'rgba(239,106,88,.98)':'rgba(245,198,92,.95)';
      ctx.fillText(targetRange>maxRange
        ? `TARGET ${tgt.id} · ${targetRange.toFixed(2)} nm · OUT OF RANGE > ${maxRange.toFixed(1)} NM`
        : `TARGET ${tgt.id} · ${targetRange.toFixed(2)} nm · LAY available`,16*k,hudY+63*k);
    }
    if(G?.ammoFlashUntil>t){const aw=Math.min(205*k,w-24*k),ax=(w-aw)/2,ay=Math.min(h-72*k,hudY+80*k);ctx.fillStyle='rgba(3,13,16,.86)';this.rr(ctx,ax,ay,aw,25*k,5*k);ctx.fill();ctx.strokeStyle='rgba(245,198,92,.72)';ctx.stroke();ctx.fillStyle='#f5c65c';ctx.font=this.fnt(9.5,true);ctx.textAlign='center';ctx.fillText(`${gun.shortLabel} · ${G.ammoFlashCount??G.ammo} RDS`,w/2,ay+17*k);ctx.textAlign='left';}
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
    const p=projectWorldPoint(cam,sp.position.xNm*NM_M,-sp.position.yNm*NM_M,0);if(!p)return;
    const a=clamp(1-sp.age/4,0,1)*(1-rain*.38),rise=Math.sin(clamp(sp.age/1.4,0,1)*Math.PI)*22*k*(1+sea*.42);
    const rangeM=state.playerSub?.position?distNm(state.playerSub.position,sp.position)*NM_M:p.d,beyondHorizon=rangeM>(cam.dHor||Infinity);
    const canClip=beyondHorizon&&typeof ctx.save==='function'&&typeof ctx.clip==='function';
    if(canClip)ctx.save();
    // At long gun range the sea-surface base can be geometrically below the
    // horizon while the upper spray column remains visible. Drawing the full
    // water-ring there produced a flat/triangular horizon artifact. Clip only
    // the far splash to the visible side of the horizon; near splashes keep
    // their complete base and foam ring.
    if(canClip){ctx.beginPath();ctx.rect(0,0,cam.viewW||ctx.canvas?.width||4096,(cam.horizonY||p.y)+2*k);ctx.clip();}
    ctx.fillStyle=`rgba(225,242,248,${a*.86})`;ctx.beginPath();ctx.ellipse(p.x,p.y-rise*0.45,(4*k+sp.age*2*k)*(1+sea*.18),Math.max(3*k,rise),0,0,Math.PI*2);ctx.fill();
    if(!beyondHorizon){ctx.strokeStyle=`rgba(230,245,250,${a*.65})`;ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.ellipse(p.x,p.y,(8*k+sp.age*5*k)*(1+sea*.22),2.5*k+sp.age*k,0,0,Math.PI*2);ctx.stroke();}
    if(canClip)ctx.restore();
  }

  drawGunSplashes3D(ctx,cam,state,behindShips){
    for(const sp of state.weapons.deckGun?.splashes||[]){
      if(this.gunSplashBehindShip(cam,state,sp)!==behindShips)continue;
      this.drawGunSplashOne(ctx,cam,state,sp);
    }
  }

  drawGunProjectiles3D(ctx,cam,state,includeSplashes=true){
    const G=state.weapons.deckGun,k=this.k,sub=state.playerSub;
    for(const sh of G?.shells||[]){
      const p=projectWorldPoint(cam,sh.xNm*NM_M,-sh.yNm*NM_M,sh.zM);if(!p)continue;
      const rangeNm=distNm(sub.position,{xNm:sh.xNm,yNm:sh.yNm});
      // A 3-inch projectile is not a glowing tennis ball five miles away.
      // Keep a short readable tracer near the muzzle, then let the player watch
      // the actual fall of shot. This also removes the persistent horizon dot
      // that could masquerade as a sea-surface rendering artifact.
      if(rangeNm>2.15)continue;
      const distanceFade=clamp((2.15-rangeNm)/.75,0,1),a=clamp(1-sh.age/10,.25,1)*distanceFade;
      if(a<=.02)continue;
      ctx.fillStyle=`rgba(255,235,155,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.75,1.55*k),0,Math.PI*2);ctx.fill();
      if(sh.prev&&rangeNm<1.75){const q=projectWorldPoint(cam,sh.prev.xNm*NM_M,-sh.prev.yNm*NM_M,sh.prev.zM);if(q){ctx.strokeStyle=`rgba(255,210,120,${a*.34})`;ctx.lineWidth=Math.max(.7,1.05*k);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke();}}
    }
    // Backward-compatible helper contract for renderer tests/tools that call
    // this method directly; drawDeckGun passes false and depth-sorts splashes.
    if(includeSplashes)for(const sp of G?.splashes||[])CanvasViewDeckGun.prototype.drawGunSplashOne.call(this,ctx,cam,state,sp);
  }


}
