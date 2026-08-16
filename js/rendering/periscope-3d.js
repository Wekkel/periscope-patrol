/* Periscope station rendering and impact observation. */
const PeriscopeStation={
  drawPeriscope(ctx,w,h,state,layout){
    const sub=state.playerSub, tact=state.tactical, env=state.world.environment;
    const opt=SCOPE_OPTICS[tact.periscopeZoom===1?0:1], prof=scopeOpticProfile(sub.damage.periscopeDamage);
    const tooDeep=sub.depthFeet>70;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    const r=Math.min(w*0.48,h*0.41);
    const cx=w/2, cy=this.portrait?h*0.42:h*0.5;
    this.scopeGeom={cx,cy,r,hor:cy};
    const cam=setupViewCamera(state,opt.fov,cx,cy,r,{bearingDeg:tact.periscopeBearing,kind:'PERISCOPE'});
    this.cam=cam;
    this.scopeGeom.hor=cam.horizonY;

    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    if(prof.unusable) this.drawScopeDamaged(ctx,w,h,cx,cy,prof);
    else if(tooDeep) this.drawScopeDeep(ctx,w,h,cx,cy);
    else{
      ctx.save();
      if(prof.blurPx>0)ctx.filter=`blur(${prof.blurPx.toFixed(2)}px) contrast(${prof.contrast.toFixed(2)}) saturate(${clamp(1-prof.damage*.25,.65,1).toFixed(2)})`;
      this.drawScopeScene(ctx,w,h,cam,state,opt,env);
      ctx.restore();
      if(prof.scratches) this.drawScopeDamageOverlay(ctx,cx,cy,r,prof,state);
    }
    ctx.restore();
    this.subRef=sub;
    this.drawScopeFrame(ctx,w,h,cx,cy,r,r,tact,opt,env.daylight,cam);
    this.drawScopeHUD(ctx,w,h,state,opt,tact,env,sub,prof,tooDeep,layout);
  },

  drawImpactObservation(ctx,w,h,state){
    const obs=state.tactical?.impactObservation;if(!obs?.position)return;
    const wallNow=typeof performance!=='undefined'?performance.now():Date.now();
    const presentation=state.runtime?.presentation;
    const startedWall=presentation?.impactToken===obs.token?presentation.impactStartedWall:null;
    const age=Math.max(0,(wallNow-(Number(startedWall)||wallNow))/1000);this.lastImpactAge=age;
    const duration=Math.max(.5,(obs.durationMs||5000)/1000),k=this.k;
    const preImpactSec=Math.max(0,(obs.preImpactMs||0)/1000),impactAge=age-preImpactSec,beforeImpact=impactAge<0;
    const range=Math.max(.05,Number(obs.rangeNm)||distNm(obs.viewerPos||state.playerSub.position,obs.position));
    const lenM=Math.max(20,(Number(obs.lengthYards)||300)*.3048);
    const angular=radToDeg(Math.atan2(lenM,range*NM_M));
    // The impact view is a deliberate cinematic cut, not a reconstructed replay.
    // IMPORTANT: setupCam() uses `r` as its focal-plane half-size. In portrait
    // `r` is taller than the physical canvas width, so choosing FOV from angular
    // hull length alone can make a close target wider than the screen. Derive a
    // second FOV from the REAL viewport width and keep ~13% margin each side.
    const cx=w/2,cy=this.portrait?h*.46:h*.50,r=Math.max(w,h)*.72;
    const nominalFov=angular*1.58;
    const hullFootprint=lenM*1.22; // bow/stern projection + superstructure + anti-crop margin
    const safeWidth=Math.max(80,w*.72),maxImpactFov=92;
    const actualRangeM=range*NM_M;
    /* A camera cannot fit a 250 m broadside carrier that is almost touching the
       submarine merely by widening FOV forever.  The impact view is already a
       cinematic cut, so if the real viewer is inside the minimum framing range
       we pull the virtual camera straight back along the SAME bearing.  Bearing,
       hit geometry and wake remain truthful; only cinematographic distance is
       changed. This hard guarantee is preferable to cropping the bow/stern on
       portrait phones. */
    const minFrameRangeM=(hullFootprint*r)/(safeWidth*Math.tan(degToRad(maxImpactFov*.5)));
    const frameRangeM=Math.max(actualRangeM,minFrameRangeM),frameRangeNm=frameRangeM/NM_M;
    const fitFov=radToDeg(2*Math.atan((hullFootprint/frameRangeM)*r/safeWidth));
    const fov=clamp(Math.max(nominalFov*(actualRangeM/frameRangeM),fitFov),2.35,maxImpactFov);
    const cinematicDepth=obs.originStation==='BRIDGE'?0:Math.min(Number(obs.viewerDepth)||55,55);
    const realViewer=obs.viewerPos||state.playerSub.position,targetBearing=obs.targetBearing??bearingBetween(realViewer,obs.position),tb=degToRad(targetBearing);
    const frameViewer=frameRangeM>actualRangeM+1
      ?{xNm:obs.position.xNm-Math.sin(tb)*frameRangeNm,yNm:obs.position.yNm+Math.cos(tb)*frameRangeNm}
      :{...realViewer};
    const sub={...state.playerSub,position:frameViewer,depthFeet:cinematicDepth,heading:obs.viewerHeading??state.playerSub.heading};
    const tact={...state.tactical,periscopeBearing:targetBearing};
    const live=(state.world.contacts||[]).find(c=>c.id===obs.contactId);
    // The hit is already resolved internally before this cinematic starts.
    // For the 1.5-second anticipation beat, deliberately freeze the captured
    // pre-hit ship AT the true impact geometry instead of trying to rewind it.
    // Target, wake and camera therefore share one coherent world snapshot:
    // cut to impact framing -> hold -> boom -> resolved damage state.
    const shipState=beforeImpact&&obs.beforeShip?obs.beforeShip:obs;
    const displayPos={...obs.position};
    const target={...(live||{}),id:obs.contactId,name:obs.name||obs.contactId,type:obs.type||'MERCHANT',displayType:obs.displayType||obs.type,
      lengthYards:obs.lengthYards||live?.lengthYards||300,tonsFactor:obs.tonsFactor||live?.tonsFactor||0,heading:shipState.heading||0,speedKnots:shipState.speedKnots||0,
      position:displayPos,shipDamage:shipState.shipDamage||null,sunk:!!shipState.sunk,sinkingProgress:shipState.sinkingProgress||0,sinkStyle:shipState.sinkStyle||0,
      hitFrac:Number.isFinite(shipState.hitFrac)?shipState.hitFrac:0,hitSide:shipState.hitSide||1,stationary:!!obs.stationary,side:live?.side||'ENEMY'};
    const impactPos=obs.impactPosition||obs.position;
    const env={...state.world.environment,visibilityNm:Math.max(Number(state.world.environment?.visibilityNm)||.5,range*1.35)};
    const viewState={...state,playerSub:sub,tactical:tact,
      // Freeze waves/wakes as well during the anticipation beat. After impact,
      // cinematic effects may advance on wall-clock time while simulation stays paused.
      time:{...state.time,elapsedSeconds:(state.time.elapsedSeconds||0)+Math.max(0,impactAge)},
      world:{...state.world,environment:env,contacts:[target],contactTracks:{},depthCharges:[]},
      weapons:{...state.weapons,activeTorpedoes:[],explosions:beforeImpact?[]:[{position:{...impactPos},zM:Math.max(0,Number(obs.impactPosition?.zM)||0),ageSec:impactAge,maxAgeSec:5,label:`${obs.weapon||'TORPEDO'} HIT`,big:String(obs.weapon||'TORPEDO').toUpperCase()==='TORPEDO',targetLengthFeet:Number(target.lengthYards)||300,warheadKg:Number(obs.warheadKg)||292,impactSide:obs.impactSide,incidenceDeg:obs.incidenceDeg}]}};
    const cam=setupViewCamera(viewState,fov,cx,cy,r,{bearingDeg:tact.periscopeBearing,kind:'IMPACT',viewW:w,viewH:h});this.impactCam=cam;

    ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    const t=viewState.time.elapsedSeconds,dl=env.daylight,wx=env.weather||'CLEAR';
    this.drawSky3D(ctx,w,h,cam,viewState,dl,wx,t);
    this.drawSea3D(ctx,w,h,cam,dl,env.seaState,wx,t,env);
    this.drawTerrain3D(ctx,cam,viewState,dl);
    this.drawImpactTorpedoTrack(ctx,cam,obs,impactAge,dl,env);
    this.drawWeatherCells3D?.(ctx,cam,viewState,dl,t);
    this.drawBattleAtmosphereBack?.(ctx,cam,viewState,dl,t);
    this.drawFleet3D(ctx,cam,viewState,dl,env,t);
    this.drawExplosions3D(ctx,cam,viewState,dl);
    this.drawBattleAtmosphereFront?.(ctx,cam,viewState,dl,t);
    if((env.precipitation||0)>.04||weatherIsWet(wx))this.drawRain(ctx,w,h,env.seaState,t,wx,env.precipitation||.25);
    if(dl<.32)this.drawNightOverlay(ctx,w,h,dl);

    // Film-style exposure remains local to the impact. It blooms outward from
    // the projected strike without any camera-pointing reflection beam; that
    // directional cone previously read as a rocket trail.
    const ip=projectWorldPoint(cam,impactPos.xNm*NM_M,-impactPos.yNm*NM_M,Math.max(.4,Number(obs.impactPosition?.zM)||3));
    if(ip&&impactAge>=0&&impactAge<1.1){
      const a=(1-impactAge/1.1)*.72,rr=clamp(30*k+7000/Math.max(100,ip.d)*k,32*k,125*k);
      ctx.save();ctx.globalCompositeOperation='screen';
      const g=ctx.createRadialGradient(ip.x,ip.y,0,ip.x,ip.y,rr);g.addColorStop(0,`rgba(255,244,188,${a})`);g.addColorStop(.22,`rgba(255,178,72,${a*.58})`);g.addColorStop(1,'rgba(255,122,38,0)');
      ctx.fillStyle=g;ctx.fillRect(ip.x-rr,ip.y-rr,rr*2,rr*2);
      // Local underwater/at-hull bloom only. A previous tapered reflection cone
      // pointed back toward the camera and read as a rocket/torpedo trail. A
      // detonation has no such directional light beam: water around the strike
      // glows broadly and dies in place.
      const broadR=Math.max(rr*2.3,Math.min(Math.hypot(w,h)*.42,280*k));
      const bg=ctx.createRadialGradient(ip.x,ip.y,rr*.08,ip.x,ip.y,broadR);bg.addColorStop(0,`rgba(255,211,128,${a*.22})`);bg.addColorStop(.38,`rgba(255,150,70,${a*.08})`);bg.addColorStop(1,'rgba(255,115,40,0)');ctx.fillStyle=bg;ctx.fillRect(ip.x-broadR,ip.y-broadR,broadR*2,broadR*2);
      ctx.globalAlpha=1;ctx.restore();
    }

    const bw=Math.min(w-18*k,430*k),bh=62*k,x=(w-bw)/2,y=10*k;
    ctx.fillStyle='rgba(3,13,16,.82)';this.rr(ctx,x,y,bw,bh,6*k);ctx.fill();
    ctx.fillStyle='rgba(245,198,92,.96)';ctx.font=this.fnt(9,true);ctx.textAlign='center';
    ctx.fillText(`IMPACT OBSERVATION · ${String(obs.weapon||'TORPEDO').replace(/_/g,' ')} ${beforeImpact?'RUN':'HIT'}`,w/2,y+16*k);
    const queuedCount=state.runtime?.presentation?.impactQueue?.length||0,skipReady=age>=.9;this.lastImpactSkipHintVisible=!!(queuedCount&&skipReady);
    const rawName=obs.name||obs.contactId||'TARGET',displayName=(typeof PP_BUILD==='undefined'||PP_BUILD.isDev||!/^DEV\s/i.test(rawName))?rawName:(obs.contactId||'TARGET');
    ctx.fillStyle='rgba(220,238,229,.92)';ctx.font=this.fnt(8.5);ctx.fillText(`${displayName} · ${range.toFixed(2)} nm${obs.location?` · ${String(obs.location).toUpperCase()}`:''}`,w/2,y+32*k);
    if(queuedCount&&skipReady){ctx.font=this.fnt(7,true);ctx.fillStyle='rgba(245,198,92,.86)';ctx.fillText(`HIT 1 OF ${queuedCount+1} · TAP TO SKIP`,w/2,y+48*k);}
    ctx.textAlign='left';

    // Make the tactical consequence legible in the cinematic itself. MAP can
    // still carry the detailed labels afterwards, but the player should not
    // have to leave the impact view to discover whether the ship is merely
    // damaged, crippled, foundering or already sinking.
    if(impactAge>.55){
      const D=obs.shipDamage||target.shipDamage||{},condition=String(obs.sunk?'SINKING':(obs.condition||'DAMAGED')).toUpperCase();
      const severe=/SINKING|FOUNDERING|ABANDONED/.test(condition),crippled=/CRIPPLED|DEAD IN WATER|BURNING/.test(condition);
      const items=[];
      if((D.flotation||0)>.15)items.push(`FLOT ${Math.round((D.flotation||0)*100)}%`);
      if((D.propulsion||0)>.15)items.push(`PROP ${Math.round((D.propulsion||0)*100)}%`);
      if((D.fire||0)>.15)items.push(`FIRE ${Math.round((D.fire||0)*100)}%`);
      if((D.steering||0)>.22)items.push(`STEER ${Math.round((D.steering||0)*100)}%`);
      const ow=Math.min(w-20*k,390*k),oh=items.length?43*k:29*k,ox=(w-ow)/2,oy=h-oh-14*k;
      ctx.fillStyle='rgba(3,10,12,.84)';this.rr(ctx,ox,oy,ow,oh,6*k);ctx.fill();
      ctx.textAlign='center';ctx.font=this.fnt(10,true);ctx.fillStyle=severe?'#ff8b68':crippled?'#f5c65c':'#a9e7bd';
      ctx.fillText(`DAMAGE ASSESSMENT · ${condition}`,w/2,oy+17*k);
      if(items.length){ctx.font=this.fnt(8);ctx.fillStyle='rgba(220,238,229,.88)';ctx.fillText(items.slice(0,3).join(' · '),w/2,oy+33*k);}
      ctx.textAlign='left';
    }
    const fade=clamp((duration-age)/.55,0,1);if(fade<1){ctx.fillStyle=`rgba(2,7,9,${1-fade})`;ctx.fillRect(0,0,w,h);}
    ctx.restore();
  },

  drawImpactTorpedoTrack(ctx,cam,obs,impactAge,dl,env){
    if(!obs?.torpedoWakeVisible||!obs.impactPosition||dl<.22)return;
    const calm=clamp(1-clamp(env?.seaState||0,0,1)*1.45,0,1);if(calm<.08)return;
    const postFade=impactAge<0?1:Math.exp(-impactAge/2.6),baseA=.40*calm*clamp(dl*1.35,0,1)*postFade;
    const raw=Array.isArray(obs.torpedoWakePath)?obs.torpedoWakePath.filter(p=>Number.isFinite(p?.xNm)&&Number.isFinite(p?.yNm)):[];
    let pts=[];
    if(raw.length>=2){
      pts=raw.map(p=>projectWorldPoint(cam,p.xNm*NM_M,-p.yNm*NM_M,0)).filter(Boolean);
    }
    if(pts.length<2&&Number.isFinite(obs.torpedoHeading)){
      // Save compatibility for observations created before wake history existed.
      const runNm=clamp(Number(obs.torpedoWakeNm)||.28,.10,.48),hb=degToRad(obs.torpedoHeading),E=obs.impactPosition.xNm*NM_M,N=-obs.impactPosition.yNm*NM_M,run=runNm*NM_M;
      const tail=projectWorldPoint(cam,E-Math.sin(hb)*run,N-Math.cos(hb)*run,0),head=projectWorldPoint(cam,E,N,0);
      if(tail&&head)pts=[tail,head];
    }
    if(pts.length<2)return;

    // This is a PRE-TRIMMED snapshot of the wake as it existed about 1.5 s
    // before impact. It is complete on the very first cinematic frame and its
    // head already lies close to the target. Nothing grows, advances or spawns
    // along this track during the anticipation beat; only post-impact fading is allowed.
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=1;i<pts.length;i++){
      const u=i/(pts.length-1),a=baseA*(.30+.70*u),w=Math.max(.8,this.k*(1.0+2.1*u));
      ctx.strokeStyle=`rgba(232,246,251,${a})`;ctx.lineWidth=w;
      ctx.beginPath();ctx.moveTo(pts[i-1].x,pts[i-1].y);ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();
    }
    if(this.quality>.35){
      ctx.fillStyle=`rgba(244,251,253,${baseA*.62})`;
      const count=Math.min(12,Math.max(6,pts.length));
      for(let i=1;i<count;i++){
        const u=i/count,idx=u*(pts.length-1),j=Math.floor(idx),f=idx-j,a=pts[j],b=pts[Math.min(pts.length-1,j+1)];
        const x=lerp(a.x,b.x,f),y=lerp(a.y,b.y,f),wig=Math.sin(i*17.31+obs.impactPosition.xNm*9.1)*this.k*1.3,r=Math.max(.6,this.k*(.55+.50*u));
        ctx.beginPath();ctx.arc(x+wig,y,r,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  },

  drawScopeScene(ctx,w,h,cam,state,opt,env){
    const t=state.time.elapsedSeconds;
    const dl=env.daylight, sea=env.seaState;
    const wx=env.weather||'CLEAR';
    this.drawSky3D(ctx,w,h,cam,state,dl,wx,t);
    this.drawSea3D(ctx,w,h,cam,dl,sea,wx,t,env);
    this.drawTerrain3D(ctx,cam,state,dl);
    this.drawWeatherCells3D?.(ctx,cam,state,dl,t);
    this.drawBattleAtmosphereBack?.(ctx,cam,state,dl,t);
    this.drawOwnWake(ctx,cam,state,t,dl);
    this.drawWakes3D(ctx,cam,state,t,dl);
    this.drawFleet3D(ctx,cam,state,dl,env,t);
    this.drawExplosions3D(ctx,cam,state,dl);
    this.drawSplashes3D(ctx,cam,state,dl);
    this.drawBattleAtmosphereFront?.(ctx,cam,state,dl,t);
    if(dl>0.3&&this.quality>0.5) this.drawGulls(ctx,w,h,cam,t,dl);
    if((env.precipitation||0)>.04||weatherIsWet(wx)) this.drawRain(ctx,w,h,sea,t,wx,env.precipitation||.25);
    if((env.precipitation||0)>.12) this.drawPeriscopeDroplets(ctx,w,h,t,env.precipitation||0);
    this.drawPeriscopeBroachWash?.(ctx,w,h,state,t);
    if(this._flash>0.01){ctx.fillStyle=`rgba(225,232,255,${this._flash})`;ctx.fillRect(0,0,w,h);}
    if(sea>0.45&&this.quality>0.5) this.drawScopeSpray(ctx,w,h,sea,t);
    if(dl<0.32) this.drawNightOverlay(ctx,w,h,dl);
  },

  drawScopeFrame(ctx,w,h,cx,cy,rx,ry,tact,opt,daylight,cam){
    const k=this.k, r=rx;
    ctx.save();
    ctx.strokeStyle='#12292b';ctx.lineWidth=Math.round(18*k);
    ctx.beginPath();ctx.arc(cx,cy,r+Math.round(9*k),0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#3a7060';ctx.lineWidth=Math.max(2,2.5*k);
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='rgba(160,220,200,.12)';ctx.lineWidth=Math.max(1,1.2*k);
    ctx.beginPath();ctx.arc(cx,cy,r+Math.round(17*k),0,Math.PI*2);ctx.stroke();

    const hy=cam?cam.horizonY:cy;
    const cross=clamp(daylight*0.7+0.25,0.25,0.92);
    // horizontal wire sits on the true horizon, vertical wire on the bearing
    ctx.strokeStyle=`rgba(215,245,231,${cross})`;ctx.lineWidth=1;ctx.setLineDash([5,5]);
    ctx.beginPath();
    ctx.moveTo(cx,cy-r*0.68);ctx.lineTo(cx,cy+r*0.68);
    ctx.moveTo(cx-r*0.68,hy);ctx.lineTo(cx+r*0.68,hy);
    ctx.stroke();ctx.setLineDash([]);

    // stadimeter ladder, calibrated in degrees of elevation for this power
    ctx.strokeStyle=`rgba(215,245,231,${cross*0.5})`;
    ctx.fillStyle=`rgba(215,245,231,${cross*0.8})`;
    ctx.font=this.fnt(7.5);ctx.textAlign='right';
    const step=opt.fov/16;
    for(let i=1;i<=5;i++){
      const yy=hy-(i*step/opt.fov)*r*2;
      if(yy<cy-r*0.9) break;
      const len=i%2?r*0.035:r*0.06;
      ctx.beginPath();ctx.moveTo(cx-len,yy);ctx.lineTo(cx+len,yy);ctx.stroke();
      if(i%2===0) ctx.fillText(`${(i*step).toFixed(1)}°`,cx-r*0.075,yy+3*k);
    }
    ctx.textAlign='left';

    // bearing tape. The glass still points where the tube really points, but a
    // damaged repeater can carry a fixed calibration error until repaired.
    ctx.textAlign='center';
    const displayBearing=normDeg(tact.periscopeBearing+(this.subRef?.damage?.instrumentBias?.scopeBearingDeg||0));
    const marks=this.portrait?5:7, halfSpan=opt.fov/2*0.82;
    for(let i=-Math.floor(marks/2);i<=Math.floor(marks/2);i++){
      const off=(i/(marks/2))*halfSpan;
      const bx=cx+Math.tan(degToRad(off))*(cam?cam.f:r/Math.tan(degToRad(opt.fov/2)));
      if(bx<cx-r*0.95||bx>cx+r*0.95) continue;
      ctx.fillStyle=i===0?'rgba(245,198,92,.95)':'rgba(215,245,231,.62)';
      ctx.font=i===0?this.fnt(10.5,true):this.fnt(9);
      ctx.fillText(fmtDeg(normDeg(displayBearing+off)),bx,cy-r*0.80);
      ctx.strokeStyle='rgba(215,245,231,.35)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(bx,cy-r*0.86);ctx.lineTo(bx,cy-r*0.92);ctx.stroke();
    }
    // Where the boat is pointing, on the same tape. Green is the heading she
    // is actually making; amber is the course ordered, if she is still swinging.
    const tapeY=cy-r*0.86;
    const mark=(deg,col,label,up)=>{
      const off=shortDelta(tact.periscopeBearing,deg);
      const inside=Math.abs(off)<opt.fov*0.46;
      const x=inside?cx+Math.tan(degToRad(off))*(cam?cam.f:r*2)
                    :cx+(off>0?1:-1)*r*0.86;
      ctx.fillStyle=col;
      ctx.beginPath();
      if(inside){
        ctx.moveTo(x,tapeY+3);ctx.lineTo(x-4.5*k,tapeY-6*k);ctx.lineTo(x+4.5*k,tapeY-6*k);
      }else{                                       // off the field: an arrow at the rim
        const d=off>0?1:-1;
        ctx.moveTo(x+d*5*k,tapeY-1*k);ctx.lineTo(x-d*3*k,tapeY-7*k);ctx.lineTo(x-d*3*k,tapeY+5*k);
      }
      ctx.closePath();ctx.fill();
      ctx.font=this.fnt(7.5,true);ctx.textAlign='center';
      ctx.fillText(label,x,tapeY-(up?16:9)*k);
      ctx.textAlign='left';
    };
    if(this.subRef){
      const sh=this.subRef.heading, so=this.subRef.orderedHeading;
      mark(sh,'rgba(111,224,143,.95)','BOW '+fmtDeg(sh),false);
      if(Math.abs(shortDelta(sh,so))>3) mark(so,'rgba(245,198,92,.9)','ORD '+fmtDeg(so),true);
    }
    ctx.textAlign='left';

    // magnification indicator, bottom of the optic
    const iw=r*0.62, ih=Math.round(24*k), ix=cx-iw/2, iy=cy+r*0.66;
    this.zoomPill={x:ix-10*k,y:iy-10*k,w:iw+20*k,h:ih+20*k};
    ctx.fillStyle='rgba(4,12,15,.66)';this.rr(ctx,ix,iy,iw,ih,ih/2);ctx.fill();
    ctx.strokeStyle='rgba(160,220,200,.35)';ctx.lineWidth=1;ctx.stroke();
    const high=opt.mag>3;
    ctx.fillStyle=high?'rgba(245,198,92,.95)':'rgba(215,245,231,.75)';
    this.rr(ctx,ix+(high?iw/2:2),iy+2,iw/2-2,ih-4,(ih-4)/2);ctx.fill();
    ctx.font=this.fnt(10.5,true);ctx.textAlign='center';
    ctx.fillStyle=high?'rgba(215,245,231,.8)':'#04120f';
    ctx.fillText('1.5×',ix+iw*0.25,iy+ih*0.68);
    ctx.fillStyle=high?'#241a08':'rgba(215,245,231,.8)';
    ctx.fillText('6×',ix+iw*0.75,iy+ih*0.68);
    ctx.textAlign='left';

    const vig=ctx.createRadialGradient(cx,cy,r*0.45,cx,cy,r*1.02);
    vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(0.72,'rgba(0,0,0,.10)');vig.addColorStop(1,'rgba(0,0,0,.62)');
    ctx.fillStyle=vig;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    // a whisper of glare on the objective glass
    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle=`rgba(255,255,255,${0.05+0.03*daylight})`;
    ctx.lineWidth=r*0.045;
    ctx.beginPath();ctx.arc(cx,cy,r*0.90,-2.45,-1.75);ctx.stroke();
    ctx.strokeStyle=`rgba(255,255,255,${0.03+0.02*daylight})`;
    ctx.lineWidth=r*0.02;
    ctx.beginPath();ctx.arc(cx,cy,r*0.82,-2.3,-1.95);ctx.stroke();
    ctx.restore();
    ctx.restore();
  },

  drawScopeHUD(ctx,w,h,state,opt,tact,env,sub,prof,tooDeep,layout){
    const k=this.k, pad=Math.round(9*k);
    ctx.fillStyle='rgba(4,12,15,.62)';this.rr(ctx,pad*0.6,pad*0.5,Math.round(178*k),Math.round(60*k),5*k);ctx.fill();
    ctx.fillStyle='#8fb8a8';ctx.font=this.fnt(10.5,true);
    ctx.fillText(`BRG ${fmtDeg(scopeMeasuredBearing(state,tact.periscopeBearing))}`,pad,Math.round(17*k));
    ctx.font=this.fnt(8.5);ctx.fillStyle='rgba(140,175,160,.9)';
    ctx.fillText(`${opt.label} ${opt.name} · FIELD ${opt.fov}°`,pad,Math.round(29*k));
    const camH=sub.depthFeet<8?6.5:clamp(1.8-(sub.depthFeet-45)*0.06,0.35,1.9);
    const horNm=Math.sqrt(2*EARTH_R*camH)/NM_M;
    ctx.fillText(`VIS ${env.visibilityNm.toFixed(1)}nm · HORIZON ${horNm.toFixed(1)}nm`,pad,Math.round(40*k));
    let msg='SCOPE ACTIVE',col='#6fe08f';
    if(prof.unusable){msg='OPTICS CRITICAL — IMAGE MOSTLY LOST';col='#ef6a58';}
    else if(tooDeep){msg=`TOO DEEP — ${sub.depthFeet.toFixed(0)}ft`;col='#f5c65c';}
    else if(prof.damage>.62){msg='OPTICAL DISTORTION — MEASUREMENTS UNRELIABLE';col='#ef6a58';}
    else if(prof.damage>.28){msg='OPTICS DAMAGED — BLUR / CALIBRATION ERROR';col='#f5c65c';}
    else if(prof.damage>.07){msg='OPTICS SCRATCHED — CONTRAST REDUCED';col='#f5c65c';}
    else if(sub.depthFeet<8) msg='SURFACED · SCOPE ACTIVE';
    ctx.fillStyle=col;ctx.font=this.fnt(9,true);ctx.fillText(msg,pad,Math.round(52*k));

    const tdc=state.tdc;
    const by=h-Math.round(46*k),touch=layout.shell==='touch';
    const side=touch?Math.min(96*k,w*.19):0,boxX=touch?side:pad*.6,boxW=touch?w-side*2:w-pad*1.2,tx=boxX+8*k,tright=boxX+boxW-8*k;
    if(tdc.targetId){
      const sq=Math.round(tdc.solutionQuality*100),ri=torpedoRangeInfo(state,tdc.targetId);
      const c=sq>70?'#6fe08f':sq>40?'#f5c65c':'#ef6a58';
      const rc=ri?(ri.band==='IN'?'#6fe08f':ri.band==='BORDERLINE'?'#f5c65c':'#ef6a58'):c;
      ctx.fillStyle='rgba(4,12,15,.76)';this.rr(ctx,boxX,by-6*k,boxW,Math.round(46*k),5*k);ctx.fill();
      ctx.strokeStyle=rc;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=c;ctx.font=this.fnt(touch?9.6:10.5,true);
      ctx.fillText(`${tdc.targetId} · SOL ${sq}%`,tx,by+Math.round(8*k));
      if(ri){
        ctx.fillStyle=rc;ctx.font=this.fnt(touch?8.2:9,true);ctx.textAlign='right';
        ctx.fillText(ri.label,tright,by+Math.round(8*k));ctx.textAlign='left';
      }
      ctx.fillStyle='#a4c2b7';ctx.font=this.fnt(touch?7.6:8.5);
      const rtxt=ri?`R ${ri.rangeNm.toFixed(1)} NM · INTERCEPT ${ri.runNm.toFixed(1)}/${ri.maxNm.toFixed(1)} NM`:`${tdc.torpedoType}`;
      ctx.fillText(rtxt,tx,by+Math.round(22*k));
      ctx.fillStyle='#82a89a';ctx.font=this.fnt(touch?7.2:8);
      const tti=tdc.timeToImpactSec?`${tdc.timeToImpactSec.toFixed(0)}s`:'--';
      ctx.fillText(`GYRO ${tdc.gyroAngle!==null?tdc.gyroAngle.toFixed(0)+'°':'--'} · AoB ${tdc.angleOnBow!==null?tdc.angleOnBow.toFixed(0)+'°':'--'} · TtI ${tti} · ${tdc.torpedoType}`,tx,by+Math.round(35*k));
    }else{
      ctx.fillStyle='rgba(130,168,154,.7)';ctx.font=this.fnt(9);ctx.textAlign='center';
      ctx.fillText('drag to train · double-tap for 6× · tap a ship to lock',w/2,h-Math.round(12*k));
      ctx.textAlign='left';
    }
  },

  drawScopeDamageOverlay(ctx,cx,cy,r,prof,state){
    // Scratches are fixed to the glass, not the world. Their layout derives
    // from the patrol seed so damaged optics look stable while the scope turns.
    const seed=state.campaign?.scenarioSeed||1;
    ctx.save();
    if(prof.haze>0){ctx.fillStyle=`rgba(205,220,214,${prof.haze})`;ctx.fillRect(cx-r,cy-r,r*2,r*2);}
    ctx.strokeStyle=`rgba(232,242,235,${clamp(.08+prof.damage*.25,.08,.30)})`;ctx.lineWidth=Math.max(.7,this.k*.85);
    for(let i=0;i<prof.scratches;i++){
      const a=_damageSeedUnit(seed,400+i)*Math.PI*2,rr=r*(.18+_damageSeedUnit(seed,500+i)*.72);
      const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr,len=r*(.05+_damageSeedUnit(seed,600+i)*.16);
      const ang=a+(_damageSeedUnit(seed,700+i)-.5)*1.8;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len);ctx.stroke();
    }
    if(prof.distortion>0){
      ctx.strokeStyle=`rgba(245,198,92,${prof.distortion*.22})`;ctx.lineWidth=Math.max(1,1.2*this.k);
      for(let i=0;i<3;i++){const rr=r*(.34+i*.17);ctx.beginPath();ctx.arc(cx+Math.sin(i*2.1)*r*.04,cy,rr,-1.1,1.05);ctx.stroke();}
    }
    ctx.restore();
  },

  drawScopeDamaged(ctx,w,h,cx,cy,prof){
    ctx.fillStyle='#05080a';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(239,106,88,.45)';ctx.lineWidth=2;
    for(let i=0;i<10;i++){
      const a=i*0.628+0.3,l=Math.min(w,h)*0.38;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*l*(.55+((i*37)%50)/100),cy+Math.sin(a)*l*(.55+((i*17)%50)/100));ctx.stroke();
    }
    ctx.fillStyle='rgba(239,106,88,.82)';ctx.font=this.fnt(13,true);ctx.textAlign='center';
    ctx.fillText('PERISCOPE OPTICS CRITICAL',cx,cy-4*this.k);
    ctx.font=this.fnt(9);ctx.fillStyle='rgba(220,235,228,.6)';ctx.fillText(`${Math.round(prof.damage*100)}% damage — only light and motion discernible`,cx,cy+14*this.k);ctx.textAlign='left';
  },

  drawScopeDeep(ctx,w,h,cx,cy){
    ctx.fillStyle='#020a0e';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(130,168,154,.55)';ctx.font=this.fnt(12);ctx.textAlign='center';
    ctx.fillText('SCOPE BELOW SURFACE',cx,cy-8*this.k);
    ctx.font=this.fnt(10);ctx.fillStyle='rgba(245,198,92,.7)';
    ctx.fillText('rise to 55 ft for a look',cx,cy+10*this.k);ctx.textAlign='left';
  }
};

Object.assign(CanvasViewDeckGun.prototype,PeriscopeStation);
