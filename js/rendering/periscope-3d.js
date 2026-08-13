function phaseSmooth01(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function dayPhaseRgb(dl,night,twilight,day){
  if(dl<=.36){const q=phaseSmooth01((dl-.04)/.32);return night.map((v,i)=>Math.round(lerp(v,twilight[i],q)));}
  const q=phaseSmooth01((dl-.36)/.30);return twilight.map((v,i)=>Math.round(lerp(v,day[i],q)));
}
function rgbCss(a){return `rgb(${a[0]},${a[1]},${a[2]})`;}

class CanvasViewPeriscope extends CanvasViewDeckGun {
  drawPeriscope(ctx,w,h,state){
    const sub=state.playerSub, tact=state.tactical, env=state.world.environment;
    const opt=SCOPE_OPTICS[tact.periscopeZoom===1?0:1], prof=scopeOpticProfile(sub.damage.periscopeDamage);
    const tooDeep=sub.depthFeet>70;
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    const r=Math.min(w*0.48,h*0.41);
    const cx=w/2, cy=this.portrait?h*0.42:h*0.5;
    this.scopeGeom={cx,cy,r,hor:cy};
    const cam=this.setupCam(state,opt.fov,cx,cy,r,{bearingDeg:tact.periscopeBearing,kind:'PERISCOPE'});
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
    this.drawScopeHUD(ctx,w,h,state,opt,tact,env,sub,prof,tooDeep);
  }

  drawImpactObservation(ctx,w,h,state){
    const obs=state.tactical?.impactObservation;if(!obs?.position)return;
    const wallNow=typeof performance!=='undefined'?performance.now():Date.now();
    const age=Math.max(0,(wallNow-(obs.startedWall||wallNow))/1000);
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
      weapons:{...state.weapons,activeTorpedoes:[],explosions:beforeImpact?[]:[{position:{...impactPos},zM:Math.max(0,Number(obs.impactPosition?.zM)||0),ageSec:impactAge,maxAgeSec:5,label:`${obs.weapon||'TORPEDO'} HIT`,big:String(obs.weapon||'TORPEDO').toUpperCase()==='TORPEDO',targetLengthFeet:Number(target.lengthYards)||300}]}};
    const cam=this.setupCam(viewState,fov,cx,cy,r,{bearingDeg:tact.periscopeBearing,kind:'IMPACT',viewW:w,viewH:h});this.impactCam=cam;

    ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
    ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
    const t=viewState.time.elapsedSeconds,dl=env.daylight,wx=env.weather||'CLEAR';
    this.drawSky3D(ctx,w,h,cam,viewState,dl,wx,t);
    this.drawSea3D(ctx,w,h,cam,dl,env.seaState,wx,t);
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
    const ip=this.proj(cam,impactPos.xNm*NM_M,-impactPos.yNm*NM_M,Math.max(.4,Number(obs.impactPosition?.zM)||3));
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

    const bw=Math.min(w-18*k,430*k),bh=44*k,x=(w-bw)/2,y=10*k;
    ctx.fillStyle='rgba(3,13,16,.82)';this.rr(ctx,x,y,bw,bh,6*k);ctx.fill();
    ctx.fillStyle='rgba(245,198,92,.96)';ctx.font=this.fnt(9,true);ctx.textAlign='center';
    ctx.fillText(`IMPACT OBSERVATION · ${String(obs.weapon||'TORPEDO').replace(/_/g,' ')} ${beforeImpact?'RUN':'HIT'}`,w/2,y+16*k);
    ctx.fillStyle='rgba(220,238,229,.92)';ctx.font=this.fnt(8.5);ctx.fillText(`${obs.name||obs.contactId||'TARGET'} · ${range.toFixed(2)} nm${obs.location?` · ${String(obs.location).toUpperCase()}`:''}`,w/2,y+31*k);ctx.textAlign='left';

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
  }

  drawImpactTorpedoTrack(ctx,cam,obs,impactAge,dl,env){
    if(!obs?.torpedoWakeVisible||!obs.impactPosition||dl<.22)return;
    const calm=clamp(1-clamp(env?.seaState||0,0,1)*1.45,0,1);if(calm<.08)return;
    const postFade=impactAge<0?1:Math.exp(-impactAge/2.6),baseA=.40*calm*clamp(dl*1.35,0,1)*postFade;
    const raw=Array.isArray(obs.torpedoWakePath)?obs.torpedoWakePath.filter(p=>Number.isFinite(p?.xNm)&&Number.isFinite(p?.yNm)):[];
    let pts=[];
    if(raw.length>=2){
      pts=raw.map(p=>this.proj(cam,p.xNm*NM_M,-p.yNm*NM_M,0)).filter(Boolean);
    }
    if(pts.length<2&&Number.isFinite(obs.torpedoHeading)){
      // Save compatibility for observations created before wake history existed.
      const runNm=clamp(Number(obs.torpedoWakeNm)||.28,.10,.48),hb=degToRad(obs.torpedoHeading),E=obs.impactPosition.xNm*NM_M,N=-obs.impactPosition.yNm*NM_M,run=runNm*NM_M;
      const tail=this.proj(cam,E-Math.sin(hb)*run,N-Math.cos(hb)*run,0),head=this.proj(cam,E,N,0);
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
  }

  drawScopeScene(ctx,w,h,cam,state,opt,env){
    const t=state.time.elapsedSeconds;
    const dl=env.daylight, sea=env.seaState;
    const wx=env.weather||'CLEAR';
    this.drawSky3D(ctx,w,h,cam,state,dl,wx,t);
    this.drawSea3D(ctx,w,h,cam,dl,sea,wx,t);
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
  }

  /* ── SKY: gradient, sun/moon, clouds, stars ── */
  drawSky3D(ctx,w,h,cam,state,dl,wx,t){
    this.sunScreen=null;this.celestialIsMoon=false;this.celestialPathStrength=0;
    const hy=cam.horizonY;
    const g=ctx.createLinearGradient(0,Math.max(0,hy-cam.r*2),0,hy);
    const storm=weatherIsWet(wx)||wx==='BUILDING CLOUD'||wx==='CLEARING';
    // Continuous night → twilight → day blend. Hard palette thresholds made
    // the last red dusk frame snap visibly into a blue-black night frame.
    const dayTop=storm?[74,85,96]:[47,111,158],dayMid=storm?[106,116,124]:[127,179,212],dayHor=storm?[141,148,154]:[207,230,242];
    const skyTop=dayPhaseRgb(dl,[3,6,15],[27,39,64],dayTop),skyMid=dayPhaseRgb(dl,[7,19,34],[122,79,92],dayMid),skyHor=dayPhaseRgb(dl,[18,36,58],[224,146,92],dayHor);
    g.addColorStop(0,rgbCss(skyTop));g.addColorStop(.62,rgbCss(skyMid));g.addColorStop(1,rgbCss(skyHor));
    ctx.fillStyle=g;ctx.fillRect(0,hy-cam.r*2.2,w,cam.r*2.2+2);

    // stars — low cloud/rain can erase the celestial references entirely.
    const cloudCover=clamp(state.world.environment.cloudCover||0,0,1);
    if(dl<0.3&&this.quality>0.4&&cloudCover<.82){
      const n=Math.round(70*this.quality*(1-cloudCover*.75));
      for(let i=0;i<n;i++){
        const az=(i*137.508)%360;
        const el=degToRad(2+((i*53)%60));
        const p=this.projAzEl(cam,az,el);
        if(!p||p.y>hy-2) continue;
        const tw=0.45+0.55*Math.sin(t*1.3+i);
        ctx.fillStyle=`rgba(226,240,255,${(0.3-dl)*2.2*tw*(1-cloudCover*.82)})`;
        ctx.fillRect(p.x,p.y,1.4,1.4);
      }
    }
    // sun or moon
    const tod=((state.time.elapsedSeconds/DayNightCycle.CYCLE_SECONDS)%1+1)%1;
    const sunAz=normDeg(90+tod*360);
    const sunEl=degToRad(-8+62*Math.sin(Math.PI*clamp(dl,0,1)));
    const body=this.projAzEl(cam,sunAz,sunEl);
    const sunA=phaseSmooth01((dl-.07)/.16),moonA=1-phaseSmooth01((dl-.04)/.18);
    if(body&&sunA>.01){
      const rr=cam.r*0.055*(cam.fovDeg<15?2.6:1),sa=sunA*clamp(.35+dl,.25,1),gg=ctx.createRadialGradient(body.x,body.y,0,body.x,body.y,rr*7);
      gg.addColorStop(0,`rgba(255,247,214,${0.95*sa})`);gg.addColorStop(.12,`rgba(255,226,150,${0.55*sa})`);gg.addColorStop(1,'rgba(255,190,90,0)');ctx.fillStyle=gg;ctx.beginPath();ctx.arc(body.x,body.y,rr*7,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(255,252,236,${.9*sa})`;ctx.beginPath();ctx.arc(body.x,body.y,rr,0,Math.PI*2);ctx.fill();this.sunScreen=body;this.celestialIsMoon=false;this.celestialPathStrength=sa;
    }
    if(body&&moonA>.01){
      const rr=cam.r*0.045*(cam.fovDeg<15?2.6:1),moon=this.projAzEl(cam,normDeg(sunAz+180),degToRad(28));
      if(moon){const ma=clamp((state.world.environment.moonIllumination??.55)*(1-cloudCover*.78),.06,.92)*moonA;ctx.fillStyle=`rgba(232,240,255,${ma})`;ctx.beginPath();ctx.arc(moon.x,moon.y,rr,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(3,8,16,${.9*moonA})`;ctx.beginPath();ctx.arc(moon.x-rr*.42,moon.y-rr*.2,rr*.92,0,Math.PI*2);ctx.fill();if(moonA>sunA){this.sunScreen=moon;this.celestialIsMoon=true;this.celestialPathStrength=ma;}}
    }
    // clouds — fixed in the world, so they pan as the scope trains around.
    // Cumulus built from seeded puff clusters with a shaded flat base and a
    // sunlit crown; under a storm sky they flatten and darken to stratus.
    if(this.quality>0.35){
      for(let ci=0;ci<CLOUDS.length;ci++){
        const c=CLOUDS[ci];
        const p=this.projAzEl(cam,normDeg(c.az+t*0.12),degToRad(c.el));
        if(!p) continue;
        const cw=cam.r*c.w*(cam.fovDeg<15?3.4:1);
        const ch=cw*(storm?0.20:0.34);
        if(p.x<-cw*1.4||p.x>w+cw*1.4||p.y>hy) continue;
        const aTop=(storm?0.5:0.42)*clamp(dl+0.25,0.2,1);
        const aBase=aTop*0.9;
        const puffs=6;
        const hsh=i=>{const v=Math.sin(i*91.7+ci*137.3)*43758.5;return v-Math.floor(v);};
        // shaded base first
        for(let i=0;i<puffs;i++){
          const f=i/(puffs-1);
          const ox=(f-0.5)*cw*1.5, taper=1-Math.abs(f-0.5)*0.9;
          const pr=cw*(0.18+hsh(i)*0.10)*taper;
          const oy=ch*0.30-hsh(i+9)*ch*0.10;
          ctx.fillStyle=dl>0.5
            ?`rgba(${storm?96:186},${storm?100:196},${storm?108:206},${aBase})`
            :`rgba(${storm?46:100},${storm?50:92},${storm?58:108},${aBase})`;
          ctx.beginPath();ctx.ellipse(p.x+ox,p.y+oy,pr,pr*0.62,0,0,Math.PI*2);ctx.fill();
        }
        // sunlit crown
        for(let i=0;i<puffs;i++){
          const f=i/(puffs-1);
          const ox=(f-0.5)*cw*1.4, taper=1-Math.abs(f-0.5)*1.0;
          const pr=cw*(0.16+hsh(i+3)*0.11)*taper;
          const oy=-ch*(0.18+hsh(i+5)*0.34)*taper;
          ctx.fillStyle=dl>0.5
            ?`rgba(255,255,255,${aTop})`
            :`rgba(${storm?76:158},${storm?80:140},${storm?90:160},${aTop})`;
          ctx.beginPath();ctx.ellipse(p.x+ox,p.y+oy,pr,pr*0.72,0,0,Math.PI*2);ctx.fill();
        }
      }
      // high cirrus on a clear day
      if(!storm&&dl>0.4&&wx==='CLEAR'){
        ctx.strokeStyle=`rgba(255,255,255,${0.13*dl})`;
        ctx.lineWidth=Math.max(1,cam.r*0.006);
        for(let i=0;i<4;i++){
          const p2=this.projAzEl(cam,normDeg(i*83+31+t*0.05),degToRad(16+i*4));
          if(!p2||p2.y>hy) continue;
          const lw=cam.r*(0.5+i*0.13)*(cam.fovDeg<15?3:1);
          ctx.beginPath();
          ctx.moveTo(p2.x-lw/2,p2.y);
          ctx.quadraticCurveTo(p2.x,p2.y-lw*0.05,p2.x+lw/2,p2.y+lw*0.03);
          ctx.stroke();
        }
      }
    }
    // lightning under a storm sky — a rare, brief, world-anchored bolt
    this._flash=0;
    if(wx==='STORM'){
      const ph=Math.sin(t*1.13+7)*Math.sin(t*0.71+2.4);
      if(ph>0.982){
        const fa=(ph-0.982)/0.018;
        this._flash=fa*0.30;
        const az=normDeg(Math.floor(t/4)*97.3);
        const bp=this.projAzEl(cam,az,degToRad(13));
        if(bp&&bp.y<hy){
          ctx.strokeStyle=`rgba(235,240,255,${fa*0.9})`;
          ctx.lineWidth=Math.max(1,1.6*this.k);
          ctx.beginPath();ctx.moveTo(bp.x,bp.y);
          let bx=bp.x, by=bp.y;
          const hsh2=i=>{const v=Math.sin(i*57.1+Math.floor(t/4)*17.7)*43758.5;return v-Math.floor(v);};
          for(let i=0;i<6;i++){
            bx+=(hsh2(i)-0.5)*cam.r*0.10;
            by+=(hy-bp.y)/6;
            ctx.lineTo(bx,by);
          }
          ctx.stroke();
        }
      }
    }
  }
  // azimuth/elevation → screen (for objects at optical infinity)
  projAzEl(cam,azDeg,elRad){
    const rel=degToRad(shortDelta(radToDeg(Math.atan2(cam.sin,cam.cos)),azDeg));
    if(Math.abs(rel)>cam.halfFov*2.4) return null;
    return{x:cam.cx+Math.tan(rel)*cam.f, y:cam.horizonY-Math.tan(elRad)*cam.f};
  }

  /* ── SEA: perspective wave rows, glitter path, whitecaps ── */
  drawSea3D(ctx,w,h,cam,dl,seaState,wx,t){
    const hy=cam.horizonY;
    /* Real water is two different things at once. Out at the horizon you see
       it at a grazing angle and it is all mirror — it takes whatever colour
       the sky is wearing. Close under the boat you look INTO it, the mirror
       fails (Fresnel), and you get the sea's own colour: dark, saturated,
       green-blue. Painters knew this centuries before Fresnel wrote it down.
       So the gradient runs light-far to dark-near, not the other way. */
    const far=dayPhaseRgb(dl,[12,20,34],[66,52,64],wx==='STORM'||wx==='RAIN'?[74,84,92]:[52,88,110]);
    const near=dayPhaseRgb(dl,[2,7,14],[10,16,30],[8,37,50]);
    const g=ctx.createLinearGradient(0,hy,0,cam.cy+cam.r);
    g.addColorStop(0,`rgb(${far[0]},${far[1]},${far[2]})`);
    g.addColorStop(0.30,`rgb(${Math.round(far[0]*0.45+near[0]*0.55)},${Math.round(far[1]*0.45+near[1]*0.55)},${Math.round(far[2]*0.45+near[2]*0.55)})`);
    g.addColorStop(1,`rgb(${near[0]},${near[1]},${near[2]})`);
    ctx.fillStyle=g;ctx.fillRect(0,hy,w,cam.cy+cam.r-hy+2);

    // the sky mirrored in a band just below the horizon — the sea always
    // carries the sky's colour where the reflection angle is shallowest
    const bandH=cam.r*0.16;
    const skyRef=dl>0.55?(wx==='STORM'||wx==='RAIN'?'150,158,166':'168,205,228')
                :dl>0.22?'196,140,110':'20,36,58';
    const rb=ctx.createLinearGradient(0,hy,0,hy+bandH);
    rb.addColorStop(0,`rgba(${skyRef},${dl>0.22?0.26:0.18})`);
    rb.addColorStop(1,`rgba(${skyRef},0)`);
    ctx.fillStyle=rb;ctx.fillRect(0,hy,w,bandH);

    // Glitter path under the sun — and, at night, a colder narrower moon
    // path.  The celestial body is world-anchored in drawSky3D, so the path
    // moves consistently when the player trains the bridge/scope.
    const moonPath=!!this.celestialIsMoon&&dl<=.15&&(this.celestialPathStrength||0)>.12;
    if(this.sunScreen&&(dl>0.25||moonPath)&&this.quality>0.4&&
       this.sunScreen.x>-w*0.4&&this.sunScreen.x<w*1.4){
      const sx=this.sunScreen.x;
      const rows=Math.round((moonPath?18:26)*this.quality);
      for(let i=0;i<rows;i++){
        const f=i/rows;
        const d=cam.dHor*Math.pow(1-f,2.1)+18;
        const y=this.seaY(cam,d);
        if(y>cam.cy+cam.r) continue;
        const spread=(cam.f/d)*22*(0.4+f*3)*(0.45+seaState*1.4);
        const n=Math.round(3+f*8);
        for(let j=0;j<n;j++){
          const px=sx+(Math.sin(j*12.9898+i*4.14+t*0.6)*spread);
          const strength=moonPath?clamp((this.celestialPathStrength||.3)*.42,.05,.34):dl;
          const a=(0.5-f*0.35)*strength*(0.5+0.5*Math.sin(t*3+i*2+j));
          ctx.fillStyle=moonPath?`rgba(205,222,242,${clamp(a,0,0.30)})`:`rgba(255,240,205,${clamp(a,0,0.55)})`;
          ctx.fillRect(px,y,Math.max(1.2,(cam.f/d)*(moonPath?5:7)),Math.max(1,(cam.f/d)*1.6));
        }
      }
    }
    /* ── The wave field ──────────────────────────────────────────────
       The old sea was sine-stripes in SCREEN space, so it slid about when
       the scope was trained. This one is a height field in WORLD metres:
       two swell systems and a wind chop, each a travelling sine with a
       fixed world direction. Every screen column at every range row is
       projected back to a world point, the field is sampled there, and the
       facet is lit by its slope toward the light. Train the scope and the
       sea holds still; only the waves themselves march. */
    const rows=this.quality>0.6?26:16;
    const bot=cam.cy+cam.r;
    // three wave trains: [world dir rad, wavelength m, speed m/s, amp share]
    const rough=0.22+seaState*0.78;
    const TR=[[degToRad(292),74,6.2,0.52],
              [degToRad(318),41,4.4,0.30],
              [degToRad(255),13,2.6,0.18]];
    for(const tr of TR){tr[4]=Math.cos(tr[0]);tr[5]=Math.sin(tr[0]);
      tr[6]=Math.PI*2/tr[1];tr[7]=tr[6]*tr[2];}
    const ampM=(0.25+seaState*2.3);                       // significant height, m
    // light comes from the sun's side of the sky; at night, faintly from the moon
    const lx=this.sunScreen?clamp((this.sunScreen.x-cam.cx)/cam.r,-1,1):0.3;
    const contr=(dl>0.5?1:dl>0.2?0.7:0.45)*(wx==='FOG'?0.5:1);
    // per-column view azimuth is the same for every row — compute once
    const colW=Math.max(9,Math.round(w/ (this.quality>0.6?44:28)));
    const nCol=Math.ceil(w/colW)+2;
    if(!this._seaCols||this._seaCols.n!==nCol||this._seaCols.w!==w||this._seaCols.f!==cam.f){
      const az=new Float32Array(nCol);
      for(let j=0;j<nCol;j++){const x=(j-0.5)*colW;az[j]=Math.atan((x-cam.cx)/cam.f);}
      this._seaCols={n:nCol,w,f:cam.f,az};
    }
    const AZ=this._seaCols.az;
    let prevY=null;
    const rowY=new Float32Array(rows);
    const rowD=new Float32Array(rows);
    for(let i=0;i<rows;i++){const f=(i+0.5)/rows;
      rowD[i]=cam.dHor*Math.pow(1-f,2.55)+13;
      rowY[i]=this.seaY(cam,rowD[i]);}
    for(let i=0;i<rows;i++){
      const f=(i+0.5)/rows, d=rowD[i], y=rowY[i];
      if(y>bot+6) continue;
      const yNext=i+1<rows?rowY[i+1]:bot+8;
      const stripH=Math.max(2,yNext-y+2);
      const px=cam.f/d;                                   // pixels per metre here
      const dispMax=Math.min(px*ampM*0.9,(y-hy)*0.40,stripH*2.2);
      // Fresnel: how much of the sky this row wears
      const fr=clamp(Math.pow(1-f,1.6)*0.55,0,0.55);
      const baseR=near[0]+(far[0]-near[0])*fr*1.7, baseG=near[1]+(far[1]-near[1])*fr*1.7,
            baseB=near[2]+(far[2]-near[2])*fr*1.7;
      const shadeAmp=(6+f*20)*contr*rough;
      for(let j=0;j<nCol;j++){
        const x=(j-0.5)*colW;
        const azW=Math.atan2(cam.sin,cam.cos)+AZ[j];      // world azimuth of this ray
        const sE=Math.sin(azW), cN=Math.cos(azW);
        const pE=cam.E+sE*d, pN=cam.N+cN*d;
        let hgt=0, slope=0;
        for(const tr of TR){
          const ph=(pE*tr[5]+pN*tr[4])*tr[6]-t*tr[7];
          hgt+=Math.sin(ph)*tr[3];
          slope+=Math.cos(ph)*tr[3]*(tr[5]*lx+tr[4]*0.3);
        }
        const dy=clamp(-hgt*ampM*px*0.5,-dispMax,dispMax);
        const lit=slope*shadeAmp;
        const a=clamp(0.30+f*0.30,0,0.62);
        ctx.fillStyle=`rgba(${Math.round(clamp(baseR+lit,0,255))},${Math.round(clamp(baseG+lit*1.15,0,255))},${Math.round(clamp(baseB+lit*1.25,0,255))},${a})`;
        ctx.fillRect(x,Math.max(hy+1,y+dy),colW+1,stripH+Math.abs(dy)*0.5+1);
      }
      // Breaking crests where the field is actually steep — foam sits on the
      // wave, not scattered at random.
      if(seaState>0.35&&f>0.3&&this.quality>0.5&&px>0.05){
        const n=Math.round(seaState*5*f);
        for(let j2=0;j2<n;j2++){
          const cj=Math.floor(((j2*137+i*61+Math.floor(t*1.5)*29)%nCol));
          const x=(cj-0.5)*colW+colW/2;
          const azW=Math.atan2(cam.sin,cam.cos)+AZ[cj];
          const pE=cam.E+Math.sin(azW)*d, pN=cam.N+Math.cos(azW)*d;
          let hgt=0,st=0;
          for(const tr of TR){const ph=(pE*tr[5]+pN*tr[4])*tr[6]-t*tr[7];hgt+=Math.sin(ph)*tr[3];st+=Math.cos(ph)*tr[3];}
          if(st<0.35) continue;                            // only on the forward face
          const cy2=Math.max(hy+2,y-hgt*ampM*px*0.5);
          const cw=Math.max(2,px*8*(0.6+f))*clamp(st,0.4,1);
          const gg=ctx.createLinearGradient(x-cw,cy2,x+cw,cy2);
          gg.addColorStop(0,'rgba(236,246,252,0)');
          gg.addColorStop(0.5,`rgba(240,250,255,${0.20*seaState*(0.35+f)*contr})`);
          gg.addColorStop(1,'rgba(236,246,252,0)');
          ctx.fillStyle=gg;
          ctx.beginPath();ctx.ellipse(x,cy2,cw,Math.max(0.8,cw*0.15),0,0,Math.PI*2);ctx.fill();
        }
      }
      // Wind streaks — spindrift blown into long lanes down the wind. They
      // only appear in half a gale and they all point the same way.
      if(seaState>0.55&&f>0.55&&this.quality>0.5){
        const n=Math.round((seaState-0.5)*6);
        for(let j3=0;j3<n;j3++){
          const sx2=((j3*97+i*53)%100)/100*w;
          const sy3=y+((j3*31+i*17)%100)/100*stripH;
          const len=px*26*(0.5+f);
          ctx.strokeStyle=`rgba(225,238,246,${0.05+0.06*seaState})`;
          ctx.lineWidth=Math.max(0.8,px*0.8);
          ctx.beginPath();ctx.moveTo(sx2-len/2,sy3+len*0.03);ctx.lineTo(sx2+len/2,sy3-len*0.03);ctx.stroke();
        }
      }
    }
    // haze band at the horizon
    const hz=ctx.createLinearGradient(0,hy-cam.r*0.12,0,hy+cam.r*0.10);
    const hc=dl>0.5?'190,215,230':dl>0.2?'120,110,120':'22,34,52';
    hz.addColorStop(0,`rgba(${hc},0)`);
    hz.addColorStop(0.5,`rgba(${hc},${wx==='FOG'?0.75:0.35})`);
    hz.addColorStop(1,`rgba(${hc},0)`);
    ctx.fillStyle=hz;ctx.fillRect(0,hy-cam.r*0.12,w,cam.r*0.22);
  }

  /* ── LAND seen from the boat ─────────────────────────────────────────
     Rebuilt so the view is stable and looks like terrain, not a plate.

     For each landmass a radial profile around the boat is computed ONCE
     (and cached until the boat has moved): the coastline EDGES — not just
     the vertices — are swept into fixed WORLD-azimuth bins of 0.35°, so
     training the scope merely re-projects a fixed profile; nothing is
     re-binned and nothing jumps. The depth of land behind each bin drives
     the ridge height, a deterministic noise seeded per island roughens the
     skyline the same way every frame, an interior ridge line gives large
     islands a hazed second layer, and the shore gets a live surf line.
     The nearest-land distance per screen column is kept so ships beyond
     an island are properly hidden behind it.                             */
  _terrainProfiles(state){
    const own=state.playerSub.position;
    const terr=state.world.terrain;
    if(this._tCache&&this._tCacheTerr===terr&&this._tCachePos&&
       distNm(this._tCachePos,own)<0.05) return this._tCache;
    const STEP=0.35, NB=Math.ceil(360/STEP);
    const cache={STEP,NB,feats:[]};
    for(const f of terr){
      if(!f.points||f.points.length<3) continue;
      // quick reject: bounding distance
      let minD=Infinity;
      for(const p of f.points){const d=distNm(own,p); if(d<minD)minD=d;}
      if(minD>45) continue;
      const near=new Float32Array(NB).fill(Infinity);
      const far=new Float32Array(NB);
      const put=(az,d)=>{
        const i=((Math.round(az/STEP)%NB)+NB)%NB;
        if(d<near[i]) near[i]=d;
        if(d>far[i]) far[i]=d;
      };
      const pts=f.points, n=pts.length;
      for(let i=0;i<n;i++){
        let a=pts[i], b=pts[(i+1)%n];
        // subdivide long edges by distance first
        const eLen=Math.hypot(b.xNm-a.xNm,b.yNm-a.yNm);
        const segs=Math.max(1,Math.ceil(eLen/1.5));
        let pb=bearingBetween(own,a), pd=distNm(own,a);
        for(let s=1;s<=segs;s++){
          const t=s/segs;
          const q={xNm:a.xNm+(b.xNm-a.xNm)*t,yNm:a.yNm+(b.yNm-a.yNm)*t};
          const qb=bearingBetween(own,q), qd=distNm(own,q);
          // walk the bins between the two samples along the short arc
          const delta=shortDelta(pb,qb);
          const steps=Math.max(1,Math.ceil(Math.abs(delta)/STEP));
          for(let k=0;k<=steps;k++){
            put(normDeg(pb+delta*k/steps), pd+(qd-pd)*k/steps);
          }
          pb=qb; pd=qd;
        }
      }
      // seeded skyline noise — a pure function of WORLD azimuth: rock-steady
      const seed=(f.name||'X').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
      const peak=f.peakM||300;
      const h=new Float32Array(NB);
      for(let i=0;i<NB;i++){
        if(near[i]===Infinity){h[i]=-1;continue;}
        const spanM=Math.max((far[i]-near[i])*1852,120);
        let hh=clamp(peak*clamp(spanM/12000,0.12,1),40,peak);
        const az=i*STEP;
        const nz=Math.sin(az*0.31+seed)*0.5+Math.sin(az*0.93+seed*1.7)*0.32
                +Math.sin(az*2.7+seed*0.6)*0.18;
        hh*=0.82+0.30*nz*0.5+0.15;                        // ±~15 % relief
        h[i]=clamp(hh,30,peak*1.05);
      }
      // smooth height + near-distance inside the land run (2 passes)
      for(let pass=0;pass<2;pass++){
        for(let i=0;i<NB;i++){
          if(h[i]<0) continue;
          const l=h[(i-1+NB)%NB], r=h[(i+1)%NB];
          if(l>=0&&r>=0) h[i]=(l+h[i]*2+r)/4;
        }
      }
      cache.feats.push({f,near,far,h,seed,minD});
    }
    this._tCache=cache; this._tCacheTerr=terr; this._tCachePos={...own};
    return cache;
  }

  drawTerrain3D(ctx,cam,state,dl){
    const env=state.world.environment;
    const vis=env.visibilityNm;
    const t=state.time.elapsedSeconds;
    const prof=this._terrainProfiles(state);
    const {STEP,NB}=prof;
    this._landOcc=[];                                     // per-frame occlusion segments
    if(!prof.feats.length) return;
    // The terrain profile is world-anchored and must be projected through the
    // ACTIVE optical camera, not always through the periscope bearing. Bridge
    // and deck-gun views reuse this renderer; tying land to the scope bearing
    // made islands appear nailed to the horizon instead of rotating with view.
    const brg=(cam&&Number.isFinite(cam.bearingDeg))?cam.bearingDeg:(state.tactical.periscopeBearing||0);
    const colPx=this.quality>0.6?2:3;
    const x0=Math.max(0,cam.cx-cam.r), x1=Math.min(this.w,cam.cx+cam.r);
    const sample=(arr,az)=>{                              // linear interp over bins
      const u=az/STEP, i=Math.floor(u), fr=u-i;
      const a=arr[((i%NB)+NB)%NB], b=arr[(((i+1)%NB)+NB)%NB];
      if(a===Infinity||b===Infinity||a<0||b<0) return (a===Infinity||a<0)?(b===Infinity||b<0?null:b):a;
      return a+(b-a)*fr;
    };
    const hazeCol=dl>0.5?[176,203,222]:dl>0.2?[112,104,118]:[18,30,50];
    for(const F of prof.feats){
      if(F.minD>vis*1.6) continue;
      const f=F.f, peak=f.peakM||300;
      // build screen-column samples
      const cols=[];
      for(let x=x0;x<=x1;x+=colPx){
        const az=normDeg(brg+radToDeg(Math.atan((x-cam.cx)/cam.f)));
        const dNm=sample(F.near,az);
        if(dNm===null||dNm===undefined||dNm>vis*1.6){cols.push(null);continue;}
        const dfNm=sample(F.far,az)||dNm;
        const hM=sample(F.h,az);
        if(hM===null||hM<=0){cols.push(null);continue;}
        cols.push({x,d:dNm*NM_M,df:dfNm*NM_M,h:hM,az});
      }
      // split into contiguous runs
      let run=[];
      const runs=[];
      for(const cc of cols){
        if(cc) run.push(cc);
        else if(run.length){runs.push(run);run=[];}
      }
      if(run.length) runs.push(run);
      for(const R of runs){
        if(R.length<2) continue;
        let nearest=Infinity,farthest=0;
        for(const cc of R){if(cc.d<nearest)nearest=cc.d; if(cc.d>farthest)farthest=cc.d;}
        if(nearest>vis*NM_M*1.5) continue;
        const fade=clamp(1-nearest/(vis*NM_M*1.25),0.06,0.95);
        const hzMix=1-fade;
        const lum=Math.round(20+dl*46);
        const mix=(r,g,b)=>`rgb(${Math.round(r*fade+hazeCol[0]*hzMix)},${Math.round(g*fade+hazeCol[1]*hzMix)},${Math.round(b*fade+hazeCol[2]*hzMix)})`;
        const topY=cc=>cam.cy+((cam.h-cc.h)/cc.d+cc.d/(2*EARTH_R))*cam.f;
        const baseY=cc=>Math.min(this.seaY(cam,cc.d),cam.cy+cam.r+4);

        // ── interior ridge: the island's far side, hazier, drawn first ──
        if(farthest-nearest>2.5*NM_M&&this.quality>0.45){
          ctx.beginPath();
          let started=false;
          for(const cc of R){
            const dm=(cc.d+cc.df)/2;
            const hm=Math.min(cc.h*1.12,peak*1.05);
            const y=cam.cy+((cam.h-hm)/dm+dm/(2*EARTH_R))*cam.f;
            if(!started){ctx.moveTo(cc.x,y);started=true;}else ctx.lineTo(cc.x,y);
          }
          for(let i=R.length-1;i>=0;i--) ctx.lineTo(R[i].x,baseY(R[i]));
          ctx.closePath();
          const rf=fade*0.55;
          ctx.fillStyle=`rgba(${Math.round((lum+26)*0.75+hazeCol[0]*0.25)},${Math.round((lum+38)*0.75+hazeCol[1]*0.25)},${Math.round((lum+30)*0.75+hazeCol[2]*0.25)},${rf})`;
          ctx.fill();
        }

        // ── main slope with vertical gradient: rocky ridge → forest → dark shore ──
        let yMin=1e9;
        for(const cc of R){const y=topY(cc); if(y<yMin)yMin=y;}
        const yBase=baseY(R[Math.floor(R.length/2)]);
        const g=ctx.createLinearGradient(0,yMin,0,yBase);
        g.addColorStop(0,mix(lum+46,lum+52,lum+34));       // sunlit ridge / bare rock
        g.addColorStop(0.28,mix(lum+18,lum+40,lum+16));    // upper forest
        g.addColorStop(0.7,mix(lum+2,lum+22,lum+8));       // lower forest
        g.addColorStop(1,mix(Math.round(lum*0.5),Math.round(lum*0.66),Math.round(lum*0.55))); // shore shadow
        ctx.fillStyle=g;
        ctx.beginPath();
        ctx.moveTo(R[0].x,baseY(R[0])+2);
        for(const cc of R) ctx.lineTo(cc.x,topY(cc));
        ctx.lineTo(R[R.length-1].x,baseY(R[R.length-1])+2);
        ctx.closePath();ctx.fill();

        // ── vertical spurs / gully striations for nearby land ──
        if(nearest<9*NM_M&&this.quality>0.55){
          ctx.strokeStyle=`rgba(0,0,0,${0.10*fade})`;ctx.lineWidth=1;
          ctx.beginPath();
          for(let i=2;i<R.length-2;i+=4){
            const cc=R[i];
            const jz=Math.sin(cc.az*3.7+F.seed)*0.5+0.5;
            if(jz<0.45) continue;
            const ty=topY(cc), by=baseY(cc);
            ctx.moveTo(cc.x,ty+(by-ty)*0.15);
            ctx.lineTo(cc.x+ (Math.sin(cc.az*7.1+F.seed)*2), by-(by-ty)*0.08);
          }
          ctx.stroke();
        }

        // ── ridge highlight ──
        ctx.strokeStyle=`rgba(${lum+78},${lum+92},${lum+58},${fade*0.5})`;
        ctx.lineWidth=Math.max(1,1.2*this.k);
        ctx.beginPath();
        for(let i=0;i<R.length;i++){const y=topY(R[i]); if(i===0)ctx.moveTo(R[i].x,y);else ctx.lineTo(R[i].x,y);}
        ctx.stroke();

        // ── surf line where the land meets the sea ──
        if(nearest<8*NM_M){
          const sa=clamp(0.28+0.14*Math.sin(t*1.7+F.seed),0.15,0.45)*fade;
          ctx.strokeStyle=`rgba(240,250,252,${sa})`;
          ctx.lineWidth=Math.max(1,1.6*this.k*clamp(3*NM_M/nearest,0.4,1.4));
          ctx.beginPath();
          for(let i=0;i<R.length;i++){
            const y=baseY(R[i])-0.5+Math.sin(R[i].az*11+t*2.1)*0.6;
            if(i===0)ctx.moveTo(R[i].x,y);else ctx.lineTo(R[i].x,y);
          }
          ctx.stroke();
        }

        // occlusion segment for ships behind this land
        this._landOcc.push({x0:R[0].x,x1:R[R.length-1].x,d:nearest});

        // name
        if(nearest<14*NM_M&&f.areaNm2>8&&R.length>10){
          ctx.fillStyle=`rgba(206,224,168,${fade*0.85})`;ctx.font=this.fnt(8.5);
          ctx.textAlign='center';
          ctx.fillText(f.name,(R[0].x+R[R.length-1].x)/2,yBase+12*this.k);
          ctx.textAlign='left';
        }
      }
    }
  }

  /* ── GULLS ── */
  drawGulls(ctx,w,h,cam,t,dl){
    for(let i=0;i<GULLS.length;i++){
      const b=GULLS[i];
      const az=normDeg(b.az+t*b.spd);
      const el=degToRad(b.el+Math.sin(t*0.6+i)*1.3);
      const p=this.projAzEl(cam,az,el);
      if(!p||p.y>cam.horizonY) continue;
      const s=cam.r*0.012*b.s*(cam.fovDeg<15?3:1);
      const flap=Math.sin(t*6+i*2.1);
      ctx.strokeStyle=`rgba(240,244,248,${0.55*dl})`;
      ctx.lineWidth=Math.max(1,s*0.22);
      ctx.beginPath();
      ctx.moveTo(p.x-s,p.y+flap*s*0.45);
      ctx.quadraticCurveTo(p.x-s*0.3,p.y-s*0.35,p.x,p.y);
      ctx.quadraticCurveTo(p.x+s*0.3,p.y-s*0.35,p.x+s,p.y+flap*s*0.45);
      ctx.stroke();
    }
  }

  /* ── MOVING SQUALLS / RAIN ── */
  drawWeatherCells3D(ctx,cam,state,dl,t){
    const cells=state.world.weatherSystem?.cells||[];if(!cells.length||this.quality<.28)return;
    const own=state.playerSub.position;
    for(const c of cells){
      const rng=distNm(own,c.center);if(rng>34)continue;
      const br=bearingBetween(own,c.center),d=Math.abs(shortDelta(cam.bearingDeg,br));if(d>cam.fovDeg*.72)continue;
      const p=this.projAzEl(cam,br,degToRad(3.5));if(!p)continue;
      const angular=radToDeg(Math.atan2(c.radiusNm||5,Math.max(.4,rng)));
      const ww=Math.max(24*this.k,cam.f*Math.tan(degToRad(Math.min(angular,38))));
      const hh=Math.max(18*this.k,cam.r*(.10+.10*clamp(1-rng/30,0,1)));
      const a=clamp(.10+.34*(1-rng/34),.08,.42)*(state.world.environment.cloudCover||.5);
      const g=ctx.createLinearGradient(0,p.y-hh,0,p.y+hh);g.addColorStop(0,'rgba(35,43,50,0)');g.addColorStop(.45,`rgba(42,50,56,${a})`);g.addColorStop(1,'rgba(80,88,92,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(p.x,p.y,ww,hh,0,0,Math.PI*2);ctx.fill();
    }
  }

  drawRain(ctx,w,h,seaState,t,wx,amount=.4){
    const heavy=wx==='HEAVY RAIN'||wx==='STORM',q=clamp(amount,0,1);
    const cap=this.lowSpec?70:150,n=Math.min(cap,Math.round((heavy?145:80)*this.quality*(.35+q*.85)));
    ctx.strokeStyle=`rgba(190,215,235,${.16+.18*q})`;ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const x=((i*73.13+t*260)%(w+120))-60;
      const y=((i*151.7+t*900)%(h+80))-40;
      const len=14+((i*37)%20);
      ctx.moveTo(x,y);ctx.lineTo(x-len*0.28,y+len);
    }
    ctx.stroke();
    ctx.fillStyle=`rgba(150,170,190,${.035+.12*q})`;ctx.fillRect(0,0,w,h);
  }

  drawPeriscopeDroplets(ctx,w,h,t,amount){
    const n=Math.round((this.lowSpec?7:13)*clamp(amount,0,1)*this.quality);
    for(let i=0;i<n;i++){
      const x=((i*113.7+31)%997)/997*w,y=((i*67.3+t*(4+i%3))%(h*.78));
      const r=Math.max(1.2,(2.2+(i%4)*1.1)*this.k);
      ctx.strokeStyle=`rgba(215,235,242,${.12+.12*amount})`;ctx.lineWidth=Math.max(.7,this.k*.7);
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    }
  }

  drawScopeSpray(ctx,w,h,seaState,t){
    const n=Math.round(seaState*26*this.quality);
    ctx.fillStyle=`rgba(255,255,255,${0.16*seaState})`;
    for(let i=0;i<n;i++){
      const x=((i*97.3+t*38)%w);
      const y=h*0.62+Math.sin(i*2.7+t*2.2)*h*0.10;
      ctx.beginPath();ctx.arc(x,y,Math.max(1,2.4*this.k*(0.4+seaState)),0,Math.PI*2);ctx.fill();
    }
  }

  drawNightOverlay(ctx,w,h,daylight){
    const a=clamp((0.32-daylight)*2.0,0,0.62);
    ctx.fillStyle=`rgba(4,10,22,${a})`;ctx.fillRect(0,0,w,h);
  }

  /* ── OPTIC HOUSING, RETICLE AND ZOOM INDICATOR ── */
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
  }

  drawScopeHUD(ctx,w,h,state,opt,tact,env,sub,prof,tooDeep){
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
    const by=h-Math.round(46*k),touch=typeof document!=='undefined'&&document.documentElement?.dataset?.lay==='touch';
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
  }

  /* ══════════ 3D SHIPS ══════════ */

  // shading helper: face normal in world space vs the sun
  shade(nE,nN,nY,light,dl){
    const len=Math.hypot(nE,nN,nY)||1;
    const d=(nE*light.E+nN*light.N+nY*light.Y)/len;
    const amb=0.34+dl*0.16;
    return clamp(amb+Math.max(0,d)*(0.30+dl*0.55),0.12,1.35);
  }

  drawFleet3D(ctx,cam,state,dl,env,t){
    const sub=state.playerSub;
    const visNm=env.visibilityNm;
    const light=(()=>{                                   // sun direction as a unit vector
      const tod=((state.time.elapsedSeconds/DayNightCycle.CYCLE_SECONDS)%1+1)%1;
      const az=degToRad(normDeg(90+tod*360));
      const el=degToRad(6+58*Math.sin(Math.PI*clamp(dl,0,1)));
      return{E:Math.sin(az)*Math.cos(el),N:Math.cos(az)*Math.cos(el),Y:Math.sin(el)+0.25};
    })();

    const list=[];
    for(const c of state.world.contacts){
      if(c.sunk&&(c.sinkingProgress??0)>=1){
        this.drawWreck3D(ctx,cam,c,state,dl,t);
        continue;
      }
      const E=c.position.xNm*NM_M, N=-c.position.yNm*NM_M;
      const d=Math.hypot(E-cam.E,N-cam.N);
      if(d>visNm*NM_M*1.15) continue;
      // Optical rendering and sensor acquisition share one canonical scope
      // hull-resolution test. This prevents SCOPE from drawing a hull that MAP
      // still treats as an unresolved acoustic contact, and also keeps legacy
      // callers of scopeCanResolveHull compatible across PWA updates.
      if(cam.kind==='PERISCOPE'&&!scopeCanResolveHull(state,c,{rangePad:1.02,fovPad:.85})) continue;
      const bear=bearingBetween(sub.position,c.position);
      const viewBearing=cam.bearingDeg??normDeg(radToDeg(Math.atan2(cam.sin,cam.cos)));
      const bd=shortDelta(viewBearing,bear);
      if(Math.abs(bd)>cam.fovDeg*0.85) continue;
      // hidden behind land?
      const sx=cam.cx+Math.tan(degToRad(bd))*cam.f;
      let occluded=false;
      for(const o of (this._landOcc||[])){
        if(sx>=o.x0-4&&sx<=o.x1+4&&d>o.d*1.02){occluded=true;break;}
      }
      if(occluded) continue;
      list.push({c,E,N,d,bd});
    }
    list.sort((a,b)=>b.d-a.d);                           // painter's algorithm
    for(const it of list) this.drawShip3D(ctx,cam,it,state,dl,light,visNm,t);

    // hydrophone-only tracks belong in the periscope plot, not in an optical gun sight.
    if(cam.kind==='GUN'||cam.kind==='BRIDGE') return;
    for(const tr of Object.values(state.world.contactTracks)){
      if(tr.sunk||tr.source!=='HYDROPHONE'||tr.confidence<0.15) continue;
      if(state.world.contacts.some(c=>c.id===tr.id&&distNm(sub.position,c.position)<visNm)) continue;
      const bd=shortDelta(cam.bearingDeg,tr.bearing);
      if(Math.abs(bd)>cam.fovDeg*0.5) continue;
      const x=cam.cx+Math.tan(degToRad(bd))*cam.f;
      ctx.strokeStyle=`rgba(245,198,92,${0.25+tr.confidence*0.35})`;
      ctx.setLineDash([4,5]);ctx.lineWidth=Math.max(1,1.4*this.k);
      ctx.beginPath();ctx.moveTo(x,cam.horizonY-18*this.k);ctx.lineTo(x,cam.horizonY+4);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(245,198,92,.75)';ctx.font=this.fnt(8);ctx.textAlign='center';
      ctx.fillText('♪ '+tr.id,x,cam.horizonY-22*this.k);ctx.textAlign='left';
    }
  }

  drawShip3D(ctx,cam,it,state,dl,light,visNm,t){
    const c=it.c;
    const model=SHIP_MODELS[typeof shipVisualModelKey==='function'?shipVisualModelKey(c):c.type]||SHIP_MODELS.MERCHANT;
    const realLen=shipVisualLengthM(c,400);
    const S=realLen/model.len;                            // uniform scale
    const hb=degToRad(c.heading), cosH=Math.cos(hb), sinH=Math.sin(hb);
    const sinkP=c.sinkingProgress??0, style=c.sinkStyle||0;
    const seed=(c.id||'X').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
    const haze=clamp(1-it.d/(visNm*NM_M),0.05,1);
    const hazeCol=dayPhaseRgb(dl,[16,26,44],[110,100,112],[188,212,228]);

    // angular size guard — skip anything smaller than a couple of pixels
    const pxLen=realLen/it.d*cam.f;
    if(pxLen<2.5) return;
    const lod=pxLen<26?0:pxLen<90?1:2;

    const paint=(rgb,sh)=>{
      const r=clamp(rgb[0]*sh,0,255), g=clamp(rgb[1]*sh,0,255), b=clamp(rgb[2]*sh,0,255);
      const m=1-haze;
      return `rgb(${Math.round(r*haze+hazeCol[0]*m)},${Math.round(g*haze+hazeCol[1]*m)},${Math.round(b*haze+hazeCol[2]*m)})`;
    };
    const night=clamp(1-dl*2.2,0,1);
    const pal=SHIP_PALETTE(seed,night);

    /* Sinking, driven by where the torpedo struck.
       style 0 = bow first: she pitches down by the head and slides under.
       style 1 = stern first.
       style 2 = her back is broken amidships. The correct picture: the
                 explosion lifts her midships, the keel fails, and both
                 halves flood at the BREAK — so the broken ends go DOWN
                 first while bow and stern rear up, and she goes under
                 middle-first. The halves drift apart and one half usually
                 lingers a little longer than the other.
       style 3 = settling amidships on a nearly even keel, with a growing
                 list towards the wound.
       Everything below the waterline is clipped away.                     */
    const passes=[];
    const rollSide=(c.hitSide!==undefined?c.hitSide:(seed%2?1:-1));
    if(sinkP>0&&style===2){
      // stagger: one half hangs on a little (deterministic per ship)
      const lead=seed%2===0;
      const pF=clamp(sinkP*(lead?1.22:1.0)+(lead?0:-0.10),0,1);   // forward half
      const pA=clamp(sinkP*(lead?1.0:1.22)+(lead?-0.10:0),0,1);   // after half
      const brk=.82;                                              // dramatic only once she is truly going
      const sep=model.len*.035,sepF=phaseSmooth01(clamp((sinkP-.66)/.34,0,1));
      // the drop starts slow so the halves first REAR UP at bow and stern
      // while the broken ends flood and go under — then both slide down
      const dropF=realLen*0.60*Math.pow(pF,2.4);
      const dropA=realLen*0.60*Math.pow(pA,2.4);
      // Forward half: pivot near the BOW so the broken end (z≈0) rotates down.
      passes.push({zMin:0,zMax:1,sink:{p:pF,pitch:brk,pitchP:Math.pow(pF,1.45),
        pivot:model.len*.34,roll:rollSide*.22,drop:dropF,shift:sep*sepF}});
      // After half: pivot near the STERN, opposite rotation — break end down.
      passes.push({zMin:-1,zMax:0,sink:{p:pA,pitch:-brk,pitchP:Math.pow(pA,1.45),
        pivot:-model.len*.34,roll:-rollSide*.28,drop:dropA,shift:-sep*sepF}});
    }else if(sinkP>0&&style===3){
      // even keel, listing over, slight trim towards the wound
      const trim=(c.hitFrac??0)*0.5;
      passes.push({zMin:-1,zMax:1,sink:{p:sinkP,pitch:-trim,pitchP:Math.pow(sinkP,1.35),
        pivot:0,roll:rollSide*0.95,drop:realLen*0.5*Math.pow(sinkP,1.5),shift:0}});
    }else{
      const bowFirst=style===0,sinkPitchP=Math.pow(sinkP,1.72);
      const sinkDrop=realLen*(.018*phaseSmooth01(clamp(sinkP/.30,0,1))+.50*Math.pow(sinkP,2.05));
      passes.push({zMin:-1,zMax:1,sink:sinkP>0?{p:sinkP,pitch:bowFirst?-.92:.92,pitchP:sinkPitchP,pivot:0,roll:rollSide*.34,drop:sinkDrop,shift:0}:null});
    }
    const seaLine=this.seaY(cam,it.d);
    ctx.save();
    ctx.beginPath();ctx.rect(0,0,this.w,seaLine);ctx.clip();

    for(const pass of passes){
      const sink=pass.sink;
      const V=(lx,ly,lz)=>{
        let x=lx*S,y=ly*S,z=lz*S;
        if(!sink&&!c.stationary){
          // Patch 5: a flooded bow/stern and list are visible in the same hull
          // geometry the player is looking at. These are visual transforms only;
          // the collision waterplane remains deterministic and cheap.
          const SD=c.shipDamage;
          if(SD){
            const flotation=clamp(SD.flotation||0,0,1);
            const pitch=-clamp(SD.trim||0,-1,1)*.075,cp=Math.cos(pitch),sp=Math.sin(pitch),nz=z*cp-y*sp,ny=z*sp+y*cp;z=nz;y=ny;
            const roll=clamp(SD.list||0,-1,1)*.12,cr0=Math.cos(roll),sr0=Math.sin(roll),nx0=x*cr0-y*sr0;y=x*sr0+y*cr0;x=nx0;
            y-=model.fb*S*clamp(flotation*.46,0,.50);
          }
          // A ship under helm develops a small, stable heel instead of
          // remaining perfectly upright while its bow swings on the chart.
          // This is visual only; collision hulls remain on the simulated
          // waterplane and therefore stay deterministic/cheap.
          const heel=clamp((c.turnRateDegSec||0)*(c.speedKnots||0)*.0019,-.075,.075);
          if(Math.abs(heel)>.001){const cr=Math.cos(heel),sr=Math.sin(heel),nx=x*cr-y*sr;y=x*sr+y*cr;x=nx;}
        }
        if(sink){
          const p=sink.pitchP??sink.p, pv=sink.pivot*S;
          const pitch=sink.pitch*p, cp=Math.cos(pitch), sp=Math.sin(pitch);
          const z0=z-pv, nz=z0*cp-y*sp, ny=z0*sp+y*cp;
          z=pv+nz+(sink.shift||0)*S; y=ny;
          const roll=sink.roll*(sink.p), cr=Math.cos(roll), sr=Math.sin(roll);
          const nx=x*cr-y*sr; y=x*sr+y*cr; x=nx;
          y-=sink.drop;
        }
        return this.proj(cam,it.E+x*cosH+z*sinH,it.N-x*sinH+z*cosH,y);
      };
      const worldN=(a,b,cc)=>{                            // normal from three local points
        const p1=[a[0]*S,a[1]*S,a[2]*S],p2=[b[0]*S,b[1]*S,b[2]*S],p3=[cc[0]*S,cc[1]*S,cc[2]*S];
        const u=[p2[0]-p1[0],p2[1]-p1[1],p2[2]-p1[2]], v=[p3[0]-p1[0],p3[1]-p1[1],p3[2]-p1[2]];
        const nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
        return{E:nx*cosH+nz*sinH, N:-nx*sinH+nz*cosH, Y:ny};
      };
      const faces=[];
      const quad=(pts,rgb)=>{
        const n=worldN(pts[0],pts[1],pts[2]);
        const sh=this.shade(n.E,n.N,n.Y,light,dl);
        const sp=pts.map(p=>V(p[0],p[1],p[2]));
        if(sp.some(p=>!p)) return;
        // backface cull via screen winding
        let area=0;
        for(let i=0;i<sp.length;i++){const q=sp[(i+1)%sp.length];area+=sp[i].x*q.y-q.x*sp[i].y;}
        if(area>=0) return;
        faces.push({sp,col:paint(rgb,sh),d:(sp[0].d+sp[2].d)/2});
      };

      // ── hull ──
      const baseHull=(()=>{const H=model.hull;if(H.some(q=>Math.abs(q[0])<1e-7))return H;const out=[];for(let j=0;j<H.length-1;j++){const a=H[j],b=H[j+1];out.push(a);if(a[0]<0&&b[0]>0){const f=(-a[0])/(b[0]-a[0]);out.push([0,lerp(a[1],b[1],f)]);}}out.push(H[H.length-1]);return out;})();
      const hullSec=lod===0?baseHull.filter((_,i)=>i%2===0||i===baseHull.length-1||Math.abs(baseHull[i][0])<1e-7):baseHull;
      const deckY=(zf)=>model.fb*(1+0.14*Math.pow(Math.abs(zf)*2,2.4));
      for(let i=0;i<hullSec.length-1;i++){
        const [z0,b0]=hullSec[i], [z1,b1]=hullSec[i+1];
        if(z0*2<pass.zMin*1.001||z1*2>pass.zMax*1.001){
          if(!(z0*2>=pass.zMin&&z1*2<=pass.zMax)) continue;
        }
        const L=model.len, B=model.beam/2;
        const y0=deckY(z0), y1=deckY(z1);
        const zz0=z0*L, zz1=z1*L, bb0=b0*B, bb1=b1*B;
        quad([[bb0,0,zz0],[bb0,y0,zz0],[bb1,y1,zz1],[bb1,0,zz1]],pal.hull);           // starboard
        quad([[-bb1,0,zz1],[-bb1,y1,zz1],[-bb0,y0,zz0],[-bb0,0,zz0]],pal.hull);       // port
        quad([[bb1,y1,zz1],[-bb1,y1,zz1],[-bb0,y0,zz0],[bb0,y0,zz0]],pal.deck);       // deck
      }
      // transom
      const st=hullSec[0];
      quad([[-st[1]*model.beam/2,0,st[0]*model.len],[-st[1]*model.beam/2,deckY(st[0]),st[0]*model.len],
            [st[1]*model.beam/2,deckY(st[0]),st[0]*model.len],[st[1]*model.beam/2,0,st[0]*model.len]],pal.hull);

      // ── superstructure ──
      for(const p of model.parts){
        if(lod===0&&!p.big) continue;
        const zc=p.z/model.len*2;
        if(zc<pass.zMin-0.05||zc>pass.zMax+0.05) continue;
        const rgb=pal[p.c]||pal.house;
        if(p.t==='b'){
          const x0=p.x-p.w/2,x1=p.x+p.w/2,y0=p.y,y1=p.y+p.h,z0=p.z-p.d/2,z1=p.z+p.d/2;
          /* Rectangular Lego blocks were especially ugly in close scope views.
             The same five cheap faces now form a subtly tapered deckhouse:
             broad at deck level, narrower at the roof. Parts still share the
             ship's one rigid transform, so this costs essentially nothing on
             low-end Canvas2D hardware. */
          const tp=clamp(p.taper??(p.c==='house'?.90:p.c==='top'?.84:p.c==='gun'?.80:.96),.68,1);
          const tx0=p.x-p.w*tp/2,tx1=p.x+p.w*tp/2,zin=(1-tp)*p.d*.16,tz0=z0+zin,tz1=z1-zin;
          quad([[x1,y0,z0],[tx1,y1,tz0],[tx1,y1,tz1],[x1,y0,z1]],rgb);       // starboard
          quad([[x0,y0,z1],[tx0,y1,tz1],[tx0,y1,tz0],[x0,y0,z0]],rgb);       // port
          quad([[x0,y0,z1],[x1,y0,z1],[tx1,y1,tz1],[tx0,y1,tz1]],rgb);       // forward
          quad([[x1,y0,z0],[x0,y0,z0],[tx0,y1,tz0],[tx1,y1,tz0]],rgb);       // aft
          quad([[tx0,y1,tz0],[tx0,y1,tz1],[tx1,y1,tz1],[tx1,y1,tz0]],pal.top);// roof
        }else if(p.t==='f'){                                              // funnel
          const seg=lod>1?8:5, rake=p.rake||0;
          for(let i=0;i<seg;i++){
            const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2;
            const x0=p.x+Math.sin(a0)*p.r, z0=p.z+Math.cos(a0)*p.r;
            const x1=p.x+Math.sin(a1)*p.r, z1=p.z+Math.cos(a1)*p.r;
            const tr=p.r*0.86;
            const tx0=p.x+Math.sin(a0)*tr, tz0=p.z+Math.cos(a0)*tr-rake*p.h;
            const tx1=p.x+Math.sin(a1)*tr, tz1=p.z+Math.cos(a1)*tr-rake*p.h;
            quad([[x0,p.y,z0],[tx0,p.y+p.h,tz0],[tx1,p.y+p.h,tz1],[x1,p.y,z1]],
                 i/seg>0.25&&i/seg<0.75?pal.funnel:pal.funnelLit);
          }
        }
      }

      faces.sort((a,b)=>b.d-a.d);
      ctx.lineWidth=lod>1?Math.max(0.4,pxLen*0.0016):0;
      for(const f of faces){
        ctx.fillStyle=f.col;
        ctx.beginPath();ctx.moveTo(f.sp[0].x,f.sp[0].y);
        for(let i=1;i<f.sp.length;i++) ctx.lineTo(f.sp[i].x,f.sp[i].y);
        ctx.closePath();ctx.fill();
        if(lod>1){ctx.strokeStyle='rgba(0,0,0,.30)';ctx.stroke();}
      }

      // ── masts, booms, gun barrels ── (thin, drawn after the solid work)
      if(lod>0){
        ctx.lineCap='round';
        for(const m of (model.masts||[])){
          const zc=m.z/model.len*2;
          if(zc<pass.zMin-0.05||zc>pass.zMax+0.05) continue;
          const a=V(m.x||0,m.y,m.z), b=V(m.x||0,m.y+m.h,m.z);
          if(!a||!b) continue;
          ctx.strokeStyle=paint(pal.mast,0.85);
          ctx.lineWidth=Math.max(0.7,pxLen*0.004);
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
          if(m.yard&&lod>1){
            const yy=m.y+m.h*0.62;
            const l=V(-m.yard,yy,m.z), r=V(m.yard,yy,m.z);
            if(l&&r){ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(r.x,r.y);ctx.stroke();}
          }
        }
        ctx.lineCap='butt';
      }
    }

    /* ── the ship burns as she goes down ──────────────────────────────
       Fire at the torpedo wound (c.hitFrac), following the hull through
       the sinking transform, dying as that section slips under; a heavy
       column of oil smoke above it, and at night the glare of the fire
       laid on the water.                                                 */
    if(sinkP>0&&sinkP<1&&c.hitFrac!==undefined&&pxLen>8){
      const hz=c.hitFrac*model.len;
      // replicate the sink transform of the pass containing the wound
      let firePass=passes[0];
      for(const ps of passes){const zc=c.hitFrac*2; if(zc>=ps.zMin-0.01&&zc<=ps.zMax+0.01){firePass=ps;break;}}
      const fk=firePass.sink;
      const firePt=(ly)=>{
        let x=0,y=ly*S,z=hz*S;
        if(fk){
          const pp=fk.pitchP??fk.p, pv=fk.pivot*S;
          const pitch=fk.pitch*pp, cp2=Math.cos(pitch), sp2=Math.sin(pitch);
          const z0=z-pv, nz=z0*cp2-y*sp2, ny=z0*sp2+y*cp2;
          z=pv+nz+(fk.shift||0)*S; y=ny;
          y-=fk.drop;
        }
        return {scr:this.proj(cam,it.E+z*sinH,it.N+z*cosH,Math.max(y,0)),yW:y};
      };
      const fw=firePt(model.fb+1.5);
      if(fw.scr&&fw.yW>-2){
        const dying=clamp(1-Math.max(0,(-fw.yW))/6,0,1);   // drowning fire
        const fa=dying*clamp(1-sinkP*0.55,0.25,1);
        const scale=cam.f/it.d;
        const fx=fw.scr.x, fy=fw.scr.y;
        const flick=0.75+0.25*Math.sin(t*11+seed)+0.12*Math.sin(t*23+seed*2);
        const fr=Math.max(2,realLen*0.05*scale)*flick;
        // glare on the water, strongest at night
        if(dl<0.6){
          const gw=fr*5, ga=fa*(0.65-dl)*0.8;
          if(ga>0.02){
            const gg=ctx.createRadialGradient(fx,seaLine>fy?fy+fr:fy,0,fx,fy,gw);
            gg.addColorStop(0,`rgba(255,150,50,${ga})`);
            gg.addColorStop(1,'rgba(255,90,20,0)');
            ctx.fillStyle=gg;
            ctx.beginPath();ctx.ellipse(fx,fy+fr*1.2,gw,gw*0.3,0,0,Math.PI*2);ctx.fill();
          }
        }
        // flames — three licking tongues
        for(let i=0;i<3;i++){
          const ox=(i-1)*fr*0.55*(0.7+0.3*Math.sin(t*7+i*2+seed));
          const hgt=fr*(1.6+0.7*Math.sin(t*9+i*1.7+seed));
          const g2=ctx.createRadialGradient(fx+ox,fy-hgt*0.4,0,fx+ox,fy-hgt*0.4,hgt);
          g2.addColorStop(0,`rgba(255,240,170,${fa*0.9})`);
          g2.addColorStop(0.4,`rgba(255,150,40,${fa*0.75})`);
          g2.addColorStop(1,'rgba(190,50,10,0)');
          ctx.fillStyle=g2;
          ctx.beginPath();ctx.ellipse(fx+ox,fy-hgt*0.45,fr*0.6,hgt*0.8,0,0,Math.PI*2);ctx.fill();
        }
        // heavy oil smoke, leaning downwind
        if(this.quality>0.35){
          for(let i=0;i<7;i++){
            const ff=(i+1)/7;
            const drift=(t*6+i*11)%60;
            const rr2=Math.max(1.5,(fr*0.8+ff*fr*4));
            ctx.fillStyle=`rgba(22,20,20,${fa*0.5*(1-ff*0.75)*haze})`;
            ctx.beginPath();
            ctx.arc(fx+drift*scale*8*ff+Math.sin(t*1.3+i)*rr2*0.3,
                    fy-fr*1.5-ff*fr*7-drift*scale*2,rr2,0,Math.PI*2);
            ctx.fill();
          }
        }
      }
    }

    ctx.restore();          // end of the above-water clip

    // ── hull mirrored faintly in a calm sea ──
    if(!c.sunk&&state.world.environment.seaState<0.55&&dl>0.25&&pxLen>14&&this.quality>0.45){
      const base=this.proj(cam,it.E,it.N,0);
      if(base){
        const rw=pxLen*0.85, rh=Math.max(2,pxLen*0.10*(1-state.world.environment.seaState));
        const rg=ctx.createLinearGradient(0,base.y,0,base.y+rh);
        rg.addColorStop(0,`rgba(10,16,22,${0.16*haze*dl*(1-state.world.environment.seaState)})`);
        rg.addColorStop(1,'rgba(10,16,22,0)');
        ctx.fillStyle=rg;
        ctx.fillRect(base.x-rw/2,base.y,rw,rh);
      }
    }

    // ── battle damage: black smoke / open fire ──
    // This is intentionally a handful of vector puffs, not a particle system.
    // It therefore appears in PERISCOPE, BRIDGE and GUN without a second render
    // stack and stays inexpensive on low-end phones.
    const SD=c.shipDamage;
    if(!c.sunk&&SD&&lod>0&&(SD.fire>.12||SD.propulsion>.58)){
      const hz=(Number.isFinite(SD.lastHitFrac)?SD.lastHitFrac:0)*model.len;
      const base=V0(this,cam,it,cosH,sinH,S,0,model.fb+2.5,hz);
      if(base){
        const scale=cam.f/it.d,sev=clamp(Math.max(SD.fire,SD.propulsion*.65),.15,1);
        const puffs=this.lowSpec?3:Math.round(4+sev*3);
        if(SD.fire>.25){
          const fr=Math.max(2,realLen*.025*scale)*(0.7+SD.fire*.7),flick=.8+.2*Math.sin(t*13+seed);
          ctx.fillStyle=`rgba(255,105,24,${clamp(SD.fire*.72,0,.72)})`;
          ctx.beginPath();ctx.ellipse(base.x,base.y-fr*.55,fr*.60*flick,fr*1.1*flick,0,0,Math.PI*2);ctx.fill();
        }
        for(let i=0;i<puffs;i++){
          const ff=(i+1)/puffs,drift=((t*5+i*13)%50)*scale;
          const rr=Math.max(1.5,(4+ff*19)*scale*(.65+sev*.6));
          ctx.fillStyle=`rgba(12,13,14,${(.20+.35*sev)*(1-ff*.70)*haze})`;
          ctx.beginPath();ctx.arc(base.x+drift*ff*2.2+Math.sin(t*.9+i+seed)*rr*.25,
            base.y-ff*(18+28*sev)*scale-drift*.35,rr,0,Math.PI*2);ctx.fill();
        }
      }
    }

    // ── funnel smoke ──
    if(!c.sunk&&c.type!=='RAFT'&&this.quality>0.35&&lod>0){
      const f=model.smoke||{x:0,y:26,z:-10};
      const base=V0(this,cam,it,cosH,sinH,S,f.x,f.y,f.z);
      if(base){
        const scale=cam.f/it.d;
        for(let i=0;i<6;i++){
          const ff=(i+1)/6;
          const drift=(t*7+i*9)%40;
          ctx.fillStyle=`rgba(${night>0.5?40:76},${night>0.5?40:74},${night>0.5?44:70},${0.24*(1-ff)*haze})`;
          ctx.beginPath();
          ctx.arc(base.x+drift*scale*ff*2.2,base.y-ff*22*scale-drift*scale*0.5,
                  Math.max(1,(3+ff*16)*scale),0,Math.PI*2);
          ctx.fill();
        }
      }
    }

    /* ── bow wave and wake ────────────────────────────────────────────
       A proper picture: a white moustache curling off the stem, two Kelvin
       arms opening at ~19° from the track, foam feathering down the
       waterline, and astern the churned propeller wash fading out into a
       broad flat wake. Everything grows with speed.                       */
    if(!c.sunk&&c.speedKnots>1&&lod>0){
      const scale=cam.f/it.d;
      const spdF=clamp(c.speedKnots/11,0.3,1.5);
      const bowW=(sx)=>this.proj(cam,
        it.E+(sx)*cosH+(model.len*0.48*S)*sinH,
        it.N-(sx)*sinH+(model.len*0.48*S)*cosH,0);
      const bow=V0(this,cam,it,cosH,sinH,S,0,0,model.len*0.48);
      const stern=V0(this,cam,it,cosH,sinH,S,0,0,-model.len*0.5);
      if(bow&&stern){
        // moustache at the stem
        ctx.fillStyle=`rgba(255,255,255,${0.5*haze*spdF})`;
        ctx.beginPath();
        ctx.ellipse(bow.x,bow.y,Math.max(1.5,realLen*0.075*scale*spdF),Math.max(0.8,realLen*0.018*scale),0,0,Math.PI*2);
        ctx.fill();
        // Kelvin arms: sampled points trailing aft-outward from the bow
        if(this.quality>0.4&&pxLen>10){
          const tanK=Math.tan(degToRad(19.5));
          for(const side of [-1,1]){
            ctx.strokeStyle=`rgba(244,252,255,${0.30*haze*spdF})`;
            ctx.lineWidth=Math.max(1,realLen*0.012*scale);
            ctx.beginPath();
            let started=false;
            for(let k2=0;k2<=4;k2++){
              const back=k2/4*realLen*1.2*spdF;
              const out=side*(model.beam*0.5*S+back*tanK);
              const zAbs=model.len*0.46*S-back;
              const pt=this.proj(cam,
                it.E+out*cosH+zAbs*sinH,
                it.N-out*sinH+zAbs*cosH,0);
              if(!pt){started=false;continue;}
              if(!started){ctx.moveTo(pt.x,pt.y);started=true;}else ctx.lineTo(pt.x,pt.y);
            }
            ctx.stroke();
          }
          // foam feathering down the waterline near the bow
          ctx.fillStyle=`rgba(250,254,255,${0.22*haze*spdF})`;
          for(let k2=0;k2<3;k2++){
            const zAbs=(model.len*(0.40-k2*0.12))*S;
            for(const side of [-1,1]){
              const pt=this.proj(cam,
                it.E+side*model.beam*0.52*S*cosH+zAbs*sinH,
                it.N-side*model.beam*0.52*S*sinH+zAbs*cosH,0);
              if(pt) ctx.fillRect(pt.x-1.5,pt.y-0.8,Math.max(2,realLen*0.02*scale),Math.max(1,realLen*0.006*scale));
            }
          }
        }
        // wake astern: bright churn, then a broad fading strip
        const wl=Math.min(realLen*3.4,c.speedKnots*95);
        const tail=this.proj(cam,it.E-Math.sin(hb)*wl,it.N-Math.cos(hb)*wl,0);
        if(tail){
          const g=ctx.createLinearGradient(stern.x,stern.y,tail.x,tail.y);
          g.addColorStop(0,`rgba(255,255,255,${0.38*haze})`);
          g.addColorStop(0.4,`rgba(255,255,255,${0.16*haze})`);
          g.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=g;
          const wNear=Math.max(1.2,realLen*0.09*scale), wFar=Math.max(0.8,wNear*2.6);
          ctx.beginPath();
          ctx.moveTo(stern.x-wNear,stern.y);ctx.lineTo(stern.x+wNear,stern.y);
          ctx.lineTo(tail.x+wFar,tail.y);ctx.lineTo(tail.x-wFar,tail.y);
          ctx.closePath();ctx.fill();
          // propeller churn right under the counter
          ctx.fillStyle=`rgba(255,255,255,${0.5*haze*spdF})`;
          ctx.beginPath();
          ctx.ellipse(stern.x,stern.y,wNear*1.3,Math.max(1,wNear*0.32),0,0,Math.PI*2);
          ctx.fill();
          // transverse wake crests
          if(this.quality>0.5){
            ctx.strokeStyle=`rgba(255,255,255,${0.14*haze})`;ctx.lineWidth=1;
            ctx.beginPath();
            for(let k2=1;k2<=3;k2++){
              const f2=k2/4;
              const mx=stern.x+(tail.x-stern.x)*f2, my=stern.y+(tail.y-stern.y)*f2;
              const w2=wNear+(wFar-wNear)*f2;
              ctx.moveTo(mx-w2,my);ctx.quadraticCurveTo(mx,my+w2*0.2,mx+w2,my);
            }
            ctx.stroke();
          }
        }
      }
    }

    // ── navigation lights at night (convoy discipline: dimmed, often none) ──
    if(night>0.55&&!c.sunk&&(seed%3!==0)){
      const scale=cam.f/it.d;
      const lamp=(lx,ly,lz,col,size)=>{
        const p=V0(this,cam,it,cosH,sinH,S,lx,ly,lz);
        if(!p) return;
        const rr=Math.max(1.1,size*scale*3);
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*4);
        g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*4,0,Math.PI*2);ctx.fill();
      };
      lamp(0,model.fb+13,-model.len*0.42,'rgba(255,224,160,.55)',1.2);      // dimmed stern light
      if(c.type==='ESCORT') lamp(0,model.fb+9,model.len*0.1,'rgba(160,220,255,.35)',1);
    }

    // ── label ──
    const top=this.proj(cam,it.E,it.N,(model.fb+22)*S);
    if(top&&lod>0){
      const tr=state.world.contactTracks[c.id];
      const sinking=(c.sinkingProgress??0)>0;
      const sel=state.tactical.selectedTrackId===c.id;
      if(sel&&this.scopeLabelId!==c.id) this.revealScopeLabel(c.id);
      const fresh=sel&&performance.now()<this.scopeLabelUntil;
      // At low scope magnification a large merchant fills the optic; lift the
      // annotation by its projected size so the card never parks on the ship.
      const lift=sel?clamp(pxLen*0.16,9*this.k,34*this.k):0;
      const ly=top.y-lift;
      if(sel&&fresh){
        const line2=`${tr?tr.typeEstimate:(c.displayType||c.type)} · ${scopeMeasuredRangeNm(state,it.d/NM_M).toFixed(1)}nm`;
        ctx.font=this.fnt(9,true);const w=ctx.measureText(line2).width+10*this.k;
        const bw=Math.max(58*this.k,w),bh=22*this.k;
        ctx.fillStyle='rgba(3,13,16,.72)';this.rr(ctx,top.x-bw/2,ly-15*this.k,bw,bh,3*this.k);ctx.fill();
        ctx.textAlign='center';ctx.font=this.fnt(10,true);ctx.fillStyle=sinking?'rgba(239,106,88,.96)':'rgba(226,255,240,.98)';
        ctx.fillText(sinking?`${c.id} SINKING`:c.id,top.x,ly-6*this.k);
        ctx.font=this.fnt(8.5);ctx.fillStyle='rgba(210,240,228,.94)';ctx.fillText(line2,top.x,ly+3*this.k);
      }else{
        // After a few seconds the information recedes to quiet glass-writing.
        // Tap the selected ship again to reveal the full card for another beat.
        ctx.textAlign='center';ctx.font=this.fnt(sel?8.5:9,sel);ctx.fillStyle=sinking?'rgba(239,106,88,.78)':sel?'rgba(210,240,228,.28)':'rgba(245,198,92,.85)';
        ctx.fillText(sinking?`${c.id} SINKING`:c.id,top.x,ly-4*this.k);
        if(!sel){ctx.font=this.fnt(7.5);ctx.fillStyle='rgba(220,236,230,.62)';ctx.fillText(`${tr?tr.typeEstimate:(c.displayType||c.type)} · ${scopeMeasuredRangeNm(state,it.d/NM_M).toFixed(1)}nm`,top.x,ly+6*this.k);}
      }
      ctx.textAlign='left';
      if(sel){
        ctx.strokeStyle=`rgba(111,224,143,${fresh ? .55 : .22})`;ctx.lineWidth=1;
        const half=Math.max(8,realLen/it.d*cam.f*0.55);
        ctx.strokeRect(top.x-half,top.y-2*this.k,half*2,Math.max(10,half*0.5));
      }
    }
  }

  /* ── what is left after she goes under ──────────────────────────────
     A spreading slick of fuel oil, flotsam bobbing in it, patches of
     burning oil for the first minute or so, and a thinning wisp of smoke.
     Fades out over about five minutes.                                    */
  drawWreck3D(ctx,cam,c,state,dl,t){
    const since=state.time.elapsedSeconds-((c.sunkAt||0)+(c.sinkDurationSec||45));
    if(since<0||since>300) return;
    const p=this.proj(cam,c.position.xNm*NM_M,-c.position.yNm*NM_M,0);if(!p)return;
    const sub=state.playerSub,bd=shortDelta(cam.bearingDeg,bearingBetween(sub.position,c.position));
    if(Math.abs(bd)>cam.fovDeg*0.9)return;
    for(const o of (this._landOcc||[]))if(p.x>=o.x0-4&&p.x<=o.x1+4&&p.d>o.d*1.02)return;
    const sc=cam.f/p.d,lenM=shipVisualLengthM(c,400),fade=clamp(1-since/300,0,1);
    const seed=(c.id||'X').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
    const rnd=n=>{const x=Math.sin(seed*12.9898+n*78.233)*43758.5453;return x-Math.floor(x);};
    const wind=(rnd(901)-.5)*1.15, R=Math.max(4,lenM*(0.44+Math.sqrt(since)*0.10)*sc),flat=Math.max(1.2,R*.18);
    const waterY=cam.horizonY;

    /* OIL / FLOTSAM / FIRE BASE live on the surface. Clip them to the sea half
       of the optic: a slick can reach the horizon, never float in the sky. */
    ctx.save();ctx.beginPath();ctx.rect(0,waterY,this.w,Math.max(0,this.h-waterY));ctx.clip();
    ctx.globalCompositeOperation='multiply';
    const LOBES=this.quality>.5?8:5;
    for(let i=0;i<LOBES;i++){
      const ph=rnd(i)*Math.PI*2,dr=.12+rnd(i+40)*.72,breathe=1+.07*Math.sin(t*(.18+rnd(i+9)*.12)+ph);
      const ox=Math.cos(ph)*R*dr+wind*since*sc*.42,oy=Math.sin(ph)*flat*dr,rr=R*(.30+rnd(i+70)*.40)*breathe;
      const g=ctx.createRadialGradient(p.x+ox,p.y+oy,0,p.x+ox,p.y+oy,rr);
      g.addColorStop(0,`rgba(28,27,24,${.74*fade})`);g.addColorStop(.72,`rgba(48,45,39,${.48*fade})`);g.addColorStop(1,'rgba(255,255,255,1)');
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(p.x+ox,p.y+oy,rr,rr*.20,0,0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    if(dl>.35&&this.quality>.4){
      for(let i=0;i<3;i++){
        const rr=R*(.72+i*.11),cx=p.x+wind*since*sc*.42,gg=ctx.createLinearGradient(cx-rr,p.y,cx+rr,p.y),a=.09*fade*dl;
        gg.addColorStop(0,'rgba(120,150,190,0)');gg.addColorStop(.38,`rgba(160,180,120,${a})`);gg.addColorStop(.57,`rgba(190,135,170,${a*1.15})`);gg.addColorStop(1,'rgba(120,150,190,0)');
        ctx.strokeStyle=gg;ctx.lineWidth=Math.max(1,R*.025);ctx.beginPath();ctx.ellipse(cx,p.y,rr,rr*.19,0,0,Math.PI*2);ctx.stroke();
      }
    }
    if(this.quality>.4)for(let i=0;i<8;i++){
      const a=rnd(i+200)*Math.PI*2,r2=R*(.10+rnd(i+210)*.78),bob=Math.sin(t*(1+rnd(i+220)*.8)+i)*Math.max(.4,R*.009);
      const x=p.x+Math.cos(a)*r2+wind*since*sc*.42,y=p.y+Math.sin(a)*r2*.20+bob,w=Math.max(1,lenM*(.012+rnd(i+230)*.018)*sc);
      ctx.fillStyle=`rgba(62,48,34,${(.48+rnd(i+240)*.30)*fade})`;ctx.save();ctx.translate(x,y);ctx.rotate((rnd(i+250)-.5)*.9);ctx.fillRect(-w/2,-w*.10,w,Math.max(1,w*.22));ctx.restore();
    }
    // Firelight on the water belongs under the horizon too.
    const fires=[];
    for(let i=0;i<4;i++){
      const born=rnd(i+300)*35,life=55+rnd(i+310)*65,age=since-born;if(age<0||age>life)continue;
      const amp=clamp(age/6,0,1)*clamp(1-(age-(life-16))/16,0,1);if(amp<.02)continue;
      const ph=rnd(i+320)*Math.PI*2,dr=.14+rnd(i+330)*.52;
      const fx=p.x+Math.cos(ph)*R*dr+wind*since*sc*.42,fy=p.y+Math.sin(ph)*flat*dr;
      const flick=.78+.22*Math.sin(t*(8+i*2.1)+ph),fr=Math.max(1.7,lenM*.028*sc)*(0.7+flick*.75)*amp;
      fires.push({fx,fy,fr,amp,ph,i});
      const glow=ctx.createRadialGradient(fx,fy,0,fx,fy,fr*2.5);glow.addColorStop(0,`rgba(255,165,55,${.40*amp})`);glow.addColorStop(1,'rgba(255,110,25,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(fx,fy,fr*2.5,fr*.55,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore(); // no sea clip beyond this point

    /* Flames rise out of the surface and smoke is a separate volumetric-looking
       layer: irregular round billows, narrow/black at the root and broad/grey
       aloft. No flattened oil ellipses are reused as smoke. */
    for(const F of fires){
      const {fx,fy,fr,amp,ph,i}=F;
      const tongues=this.quality>.5?3:2;
      for(let k=0;k<tongues;k++){
        const ox=(k-(tongues-1)/2)*fr*.62, hgt=fr*(1.5+.8*Math.abs(Math.sin(t*(7+k*2.4)+ph))),lean=wind*hgt*.34;
        const g=ctx.createLinearGradient(fx+ox,fy,fx+ox+lean,fy-hgt);g.addColorStop(0,`rgba(255,238,165,${.88*amp})`);g.addColorStop(.45,`rgba(255,135,35,${.68*amp})`);g.addColorStop(1,'rgba(110,25,8,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(fx+ox-fr*.42,fy);ctx.quadraticCurveTo(fx+ox+lean*.30,fy-hgt*.52,fx+ox+lean,fy-hgt);ctx.quadraticCurveTo(fx+ox+fr*.35+lean*.30,fy-hgt*.48,fx+ox+fr*.42,fy);ctx.closePath();ctx.fill();
      }
      if(this.quality>.3){
        const PUFF=this.quality>.55?10:6,shed=1.35;
        for(let k=0;k<PUFF;k++){
          const pa=((t/shed)+k)%PUFF*shed,rise=Math.pow(pa,.80)*fr*1.55,spread=fr*(.48+pa*.38),lean=wind*Math.pow(pa,1.28)*fr*.95;
          const soot=clamp(1-pa/15,0,1),alpha=.34*amp*clamp(1-pa/20,0,1);if(alpha<.012)continue;
          const cx=fx+lean+(rnd(i*50+k+500)-.5)*spread*.32,cy=fy-rise;
          const lobes=6;ctx.beginPath();
          for(let q=0;q<lobes;q++){
            const ang=q/lobes*Math.PI*2,rad=spread*(.72+.30*rnd(i*100+k*10+q+540));
            const x=cx+Math.cos(ang)*rad,y=cy+Math.sin(ang)*rad*.82;
            if(q===0)ctx.moveTo(x,y);else{const pang=(q-.5)/lobes*Math.PI*2,pr=spread*(.68+.20*rnd(i*90+k*8+q+610));ctx.quadraticCurveTo(cx+Math.cos(pang)*pr,cy+Math.sin(pang)*pr*.82,x,y);}
          }
          ctx.closePath();const v=Math.round(15+(1-soot)*50);ctx.fillStyle=`rgba(${v},${Math.max(0,v-2)},${Math.max(0,v-5)},${alpha})`;ctx.fill();
          // Dense soot core gives the plume depth instead of a stack of discs.
          ctx.fillStyle=`rgba(8,10,10,${alpha*.30*soot})`;ctx.beginPath();ctx.arc(cx-spread*.10,cy,spread*.32,0,Math.PI*2);ctx.fill();
        }
      }
    }
  }

  /* ── Your own wake ──────────────────────────────────────────────────
     Built as a proper strip on the sea surface: sampled along the track
     astern, widening the way a real turbulent wake spreads (roughly six
     per cent of the distance run), each sample projected through the same
     camera. Nothing is drawn nearer than the stern, which is what made the
     old version balloon across the whole optic.                          */
  drawOwnWake(ctx,cam,state,t,dl){
    const sub=state.playerSub,spd=Math.max(0,sub.propulsion.speedKnots||0);
    if(spd<.8||dl<0.12) return;
    const surfaced=sub.depthFeet<12;if(!surfaced&&sub.depthFeet>70)return;
    const back=normDeg(sub.heading+180),viewBearing=cam.bearingDeg??state.tactical.periscopeBearing;
    if(Math.abs(shortDelta(viewBearing,back))>cam.fovDeg*0.98)return;
    const E=sub.position.xNm*NM_M,N=-sub.position.yNm*NM_M,br=degToRad(back),sinB=Math.sin(br),cosB=Math.cos(br),px=Math.cos(br),pz=-Math.sin(br);
    const speedN=clamp((spd-1)/17,0,1),foamN=clamp((spd-2.5)/13,0,1);
    const sternM=surfaced?43:22,lenM=surfaced?clamp(80+spd*38,115,760):clamp(70+spd*12,90,180);
    const halfNear=surfaced?lerp(1.35,3.8,speedN):.55,spread=surfaced?lerp(.030,.060,speedN):.010;
    const N_SEG=surfaced?(this.lowSpec?8:11):5,left=[],right=[],mid=[];
    const world=(d,side=0)=>({E:E+sinB*d+px*side,N:N+cosB*d+pz*side});
    for(let i=0;i<=N_SEG;i++){
      const f=i/N_SEG,d=sternM+(lenM-sternM)*Math.pow(f,1.28),hw=halfNear+d*spread,c=world(d),l=this.proj(cam,c.E+px*hw,c.N+pz*hw,0),r=this.proj(cam,c.E-px*hw,c.N-pz*hw,0),m=this.proj(cam,c.E,c.N,0);
      if(!l||!r||!m)break;left.push(l);right.push(r);mid.push({p:m,f,hw,d});
    }
    if(left.length<3)return;
    ctx.save();ctx.beginPath();ctx.rect(0,cam.horizonY,this.w,this.h-cam.horizonY);ctx.clip();

    // Turbulent centre wake: narrow at manoeuvring speed, longer/brighter as
    // shaft power rises. It fades continuously rather than ending in a blunt V.
    const baseA=(surfaced?lerp(.10,.31,speedN):.10)*dl,g=ctx.createLinearGradient(left[0].x,left[0].y,left.at(-1).x,left.at(-1).y);
    g.addColorStop(0,`rgba(240,248,251,${baseA})`);g.addColorStop(.32,`rgba(229,242,248,${baseA*.72})`);g.addColorStop(.72,`rgba(220,236,244,${baseA*.28})`);g.addColorStop(1,'rgba(216,232,242,0)');ctx.fillStyle=g;
    ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);for(let i=1;i<left.length;i++)ctx.lineTo(left[i].x,left[i].y);for(let i=right.length-1;i>=0;i--)ctx.lineTo(right[i].x,right[i].y);ctx.closePath();ctx.fill();

    if(surfaced){
      // Propeller wash is a dense, much narrower core rather than one huge white
      // blob. At low speed it is almost the only visible wake.
      const coreL=[],coreR=[];
      for(let i=0;i<mid.length;i++){
        const m=mid[i],cw=m.hw*lerp(.19,.31,speedN),c=world(m.d),a=this.proj(cam,c.E+px*cw,c.N+pz*cw,0),b=this.proj(cam,c.E-px*cw,c.N-pz*cw,0);if(a&&b){coreL.push(a);coreR.push(b);}
      }
      if(coreL.length>2){
        const cg=ctx.createLinearGradient(coreL[0].x,coreL[0].y,coreL.at(-1).x,coreL.at(-1).y),ca=lerp(.25,.53,speedN)*dl;
        cg.addColorStop(0,`rgba(255,255,255,${ca})`);cg.addColorStop(.20,`rgba(247,252,253,${ca*.82})`);cg.addColorStop(1,'rgba(232,244,248,0)');ctx.fillStyle=cg;ctx.beginPath();ctx.moveTo(coreL[0].x,coreL[0].y);for(const q of coreL.slice(1))ctx.lineTo(q.x,q.y);for(let i=coreR.length-1;i>=0;i--)ctx.lineTo(coreR[i].x,coreR[i].y);ctx.closePath();ctx.fill();
      }

      // Kelvin divergent waves. The classical deep-water wake half-angle is
      // about 19.5°. Keep these subtle: they should read as moving water, not as
      // two luminous rails painted behind the submarine.
      if(spd>5&&this.quality>.32){
        const kelvin=Math.tan(degToRad(19.47)),steps=this.lowSpec?5:7;
        for(const side of [-1,1]){
          ctx.strokeStyle=`rgba(224,240,246,${(.055+.075*foamN)*dl})`;ctx.lineWidth=Math.max(.75,1.05*this.k);ctx.beginPath();let begun=false;
          for(let i=0;i<=steps;i++){
            const f=i/steps,d=sternM+25+(lenM-sternM-20)*f,lateral=side*d*kelvin*(.58+.22*f),c=world(d,lateral),q=this.proj(cam,c.E,c.N,0);if(!q)continue;if(!begun){ctx.moveTo(q.x,q.y);begun=true;}else ctx.lineTo(q.x,q.y);
          }ctx.stroke();
        }
      }

      // Broken shoulder crests replace the old full-width zebra stripes. Their
      // spacing travels with time and they only appear once the boat is making
      // enough way to throw persistent foam.
      if(spd>4&&this.quality>.45){
        for(let i=1;i<mid.length-1;i++){
          const m=mid[i],phase=.5+.5*Math.sin(m.d*.075-t*(1.15+spd*.035));if(phase<.58)continue;
          const alpha=(.035+.12*foamN)*(1-m.f)*phase*dl;
          for(const side of [-1,1]){
            const a=side<0?left[i]:right[i],b=mid[i].p,x0=lerp(a.x,b.x,.08),y0=lerp(a.y,b.y,.08),x1=lerp(a.x,b.x,.48),y1=lerp(a.y,b.y,.48);
            ctx.strokeStyle=`rgba(250,253,255,${alpha})`;ctx.lineWidth=Math.max(.75,1.15*this.k);ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(lerp(x0,x1,.55),lerp(y0,y1,.55)-Math.max(.4,this.k*.7),x1,y1);ctx.stroke();
          }
        }
      }

      // Short stern boil, speed-scaled and deliberately bounded to the propeller
      // wash instead of filling the optic at every speed.
      const n0=mid[0].p,n1=mid[Math.min(1,mid.length-1)].p,wpx=Math.max(3,Math.abs(left[0].x-right[0].x)*(.20+.15*speedN));
      const boil=ctx.createRadialGradient(n0.x,n0.y,0,n0.x,n0.y,Math.max(4,wpx*1.35));boil.addColorStop(0,`rgba(255,255,255,${lerp(.20,.48,speedN)*dl})`);boil.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=boil;ctx.beginPath();ctx.ellipse(n0.x,(n0.y+n1.y)/2,Math.max(4,wpx*1.35),Math.max(1.8,wpx*.38),0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  /* ── Torpedo wake ───────────────────────────────────────────────────
     A steam torpedo does leave a track of exhaust bubbles — that is why the
     electric Mark 18 was built. But from a periscope your eye is a metre
     above the water looking almost along the track, so only the first few
     hundred yards of it are really visible, and then only in decent light on
     a quiet sea. It is drawn accordingly: faint, short, and easy to miss.   */
  drawWakes3D(ctx,cam,state,t,dl){
    const env=state.world.environment;
    if(dl<0.25) return;                                   // no wake to see in the dark
    const calm=clamp(1-clamp(env.seaState,0,1)*1.5,0,1);
    if(calm<=0.05) return;                                // lost in a lively sea
    const own=state.playerSub.position;
    for(const tp of state.weapons.activeTorpedoes){
      if(tp.status!=='RUNNING'||tp.isElectric) continue;
      const E=tp.position.xNm*NM_M, N=-tp.position.yNm*NM_M;
      const hb=degToRad(tp.heading);
      const rngM=distNm(own,tp.position)*NM_M;
      if(rngM>1300) continue;                             // beyond that it is simply not visible
      const run=Math.min(tp.rangeRunNm*NM_M,900);
      const head=this.proj(cam,E,N,0);
      const tail=this.proj(cam,E-Math.sin(hb)*run,N-Math.cos(hb)*run,0);
      if(!head||!tail) continue;
      const fade=clamp(1-rngM/1300,0,1)*calm*clamp(dl*1.4,0,1);
      const wHead=Math.max(0.7,4*cam.f/Math.max(head.d,60));
      const wTail=Math.max(0.7,10*cam.f/Math.max(tail.d,60));
      const g=ctx.createLinearGradient(head.x,head.y,tail.x,tail.y);
      g.addColorStop(0,`rgba(236,246,252,${0.22*fade})`);
      g.addColorStop(0.5,`rgba(226,240,250,${0.11*fade})`);
      g.addColorStop(1,'rgba(220,238,250,0)');
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(head.x-wHead,head.y);ctx.lineTo(head.x+wHead,head.y);
      ctx.lineTo(tail.x+wTail,tail.y);ctx.lineTo(tail.x-wTail,tail.y);
      ctx.closePath();ctx.fill();
    }
  }

  /* ── explosions ─────────────────────────────────────────────────────
     A torpedo warhead against a hull: a white flash, then a fireball with
     a hot core, a water column that collapses back as falling spray, an
     expanding foam ring on the surface, dark debris thrown in arcs, and a
     pall of rolling smoke that outlives the flame. Every particle is a
     pure function of the explosion's age, so the picture is stable.      */
  drawExplosions3D(ctx,cam,state,dl){
    for(const e of state.weapons.explosions){
      const gunHit=/GUN HIT/.test(e.label||'');
      const p=this.proj(cam,e.position.xNm*NM_M,-e.position.yNm*NM_M,gunHit?Math.max(.5,Number(e.zM)||3.5):0);
      if(!p) continue;
      const sc=cam.f/p.d;                                   // pixels per metre
      const dud=e.kind==='dud'||/DUD|GLANCED/.test(e.label||'');
      const age=e.ageSec, tt=clamp(age/e.maxAgeSec,0,1);
      const big=e.big?1.35:1;
      const hs=(i,s)=>{const v=Math.sin(i*127.1+s*311.7+(e.position.xNm*13.3))*43758.5453;return v-Math.floor(v);};
      ctx.save();
      if(gunHit&&!dud){
        // A 3-inch shell strike is a compact hull/deck explosion, not a miniature
        // torpedo water column. Keep it above the waterline, make the hot area a
        // little broader and less brilliant, and let deterministic overlapping
        // lobes/sparks make the source look irregular rather than pinned to one
        // glowing pixel.
        const a0=clamp(1-age/1.15,0,1),baseR=Math.max(4*this.k,(22+age*10)*sc);
        if(age<1.15){
          ctx.save();ctx.globalCompositeOperation='screen';
          for(let i=0;i<5;i++){
            const wobX=(hs(i,11)-.5)*baseR*.72+Math.sin(age*(15+i*1.7)+i)*baseR*.10;
            const wobY=(hs(i,12)-.5)*baseR*.44-Math.sin(age*(8+i)+i*.7)*baseR*.08;
            const rr=baseR*(.72+hs(i,13)*.62),g=ctx.createRadialGradient(p.x+wobX,p.y+wobY,0,p.x+wobX,p.y+wobY,rr);
            g.addColorStop(0,`rgba(255,238,184,${a0*(.38-i*.025)})`);g.addColorStop(.30,`rgba(255,157,60,${a0*(.30-i*.025)})`);g.addColorStop(1,'rgba(170,50,18,0)');
            ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x+wobX,p.y+wobY,rr,0,Math.PI*2);ctx.fill();
          }
          ctx.restore();
        }
        if(age<2.5){
          const f=age/2.5,a=Math.pow(1-f,1.4);
          for(let i=0;i<4;i++){
            const ox=(hs(i,14)-.5)*(18+age*9)*sc,oy=(9+age*(15+hs(i,15)*9))*sc,rr=Math.max(2,(9+age*10)*(0.75+hs(i,16)*.42)*sc);
            const g=ctx.createRadialGradient(p.x+ox,p.y-oy,0,p.x+ox,p.y-oy,rr);g.addColorStop(0,`rgba(255,193,96,${a*.48})`);g.addColorStop(.55,`rgba(192,67,24,${a*.36})`);g.addColorStop(1,'rgba(100,30,18,0)');
            ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x+ox,p.y-oy,rr,0,Math.PI*2);ctx.fill();
          }
        }
        if(age<1.3&&this.quality>.35){
          ctx.strokeStyle=`rgba(255,190,92,${clamp(1-age/1.3,0,1)*.62})`;ctx.lineWidth=Math.max(1,.9*this.k);
          for(let i=0;i<9;i++){const ang=(-1.18+hs(i,17)*2.36),len=(8+hs(i,18)*24)*sc*(.6+age);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(ang)*len,p.y-Math.abs(Math.sin(ang))*len);ctx.stroke();}
        }
        if(age>.25&&age<5&&this.quality>.35){
          const sa=clamp(1-age/5,0,1)*.44;for(let i=0;i<6;i++){const f=(i+1)/6,rr=Math.max(2,(7+age*5)*sc*f),dr=(hs(i,19)-.5)*(14+age*4)*sc;ctx.fillStyle=`rgba(${55+i*3},${49+i*2},${44+i*2},${sa*(1-f*.35)})`;ctx.beginPath();ctx.arc(p.x+dr,p.y-(10+age*13)*sc*f,rr,0,Math.PI*2);ctx.fill();}
        }
        if(age<2.8&&e.label){ctx.fillStyle=`rgba(255,206,126,${clamp(1-age/2.8,0,1)*.72})`;ctx.font=this.fnt(10,true);ctx.textAlign='center';ctx.fillText(e.label,p.x,p.y-Math.max(22,68*sc));ctx.textAlign='left';}
        ctx.restore();continue;
      }
      if(!dud){
        /* Low-light blast illumination. Because ships and sea are already on
           the canvas, SCREEN blending gives us a convincing local flash and
           fading reflection without introducing a lighting engine. It ramps in
           continuously through dusk and also appears faintly in very gloomy
           squall conditions. */
        if(/HIT/.test(e.label||'')&&age<5.2){
          const E=state.world.environment||{},dark=clamp((.58-dl)/.50,0,1),storm=clamp(((E.cloudCover||0)*.30+(E.precipitation||0)*.42)*(1-dl*.72),0,.42),gloom=Math.max(dark,storm);
          if(gloom>.025){
            const flash=age<.45?1-age/.45:Math.exp(-(age-.45)/1.55)*.58,intensity=flash*gloom*(e.big?1.16:1);
            const rr=clamp((80+40*(e.big?1:0))*sc,24*this.k,155*this.k);
            ctx.save();ctx.globalCompositeOperation='screen';
            let lg=ctx.createRadialGradient(p.x,p.y-8*sc,0,p.x,p.y-8*sc,rr*1.35);
            lg.addColorStop(0,`rgba(255,238,176,${.48*intensity})`);lg.addColorStop(.34,`rgba(255,154,58,${.25*intensity})`);lg.addColorStop(1,'rgba(255,80,20,0)');
            ctx.fillStyle=lg;ctx.beginPath();ctx.arc(p.x,p.y-8*sc,rr*1.35,0,Math.PI*2);ctx.fill();
            lg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*1.45);lg.addColorStop(0,`rgba(255,191,91,${.22*intensity})`);lg.addColorStop(1,'rgba(255,100,25,0)');ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(p.x,p.y+rr*.10,rr*1.45,rr*.30,0,0,Math.PI*2);ctx.fill();
            ctx.restore();
          }
        }
        // 1 ─ muzzle flash
        if(age<0.35){
          const a=1-age/0.35;
          const rr=Math.max(3,46*sc*big*(0.5+a));
          const fg=ctx.createRadialGradient(p.x,p.y-12*sc,0,p.x,p.y-12*sc,rr);
          fg.addColorStop(0,`rgba(255,255,245,${a})`);
          fg.addColorStop(0.5,`rgba(255,238,180,${a*0.8})`);
          fg.addColorStop(1,'rgba(255,200,90,0)');
          ctx.fillStyle=fg;ctx.beginPath();ctx.arc(p.x,p.y-12*sc,rr,0,Math.PI*2);ctx.fill();
        }
        // 2 ─ fireball: three rising blobs, hot core → orange → sooty red
        if(age<3.0){
          const f=age/3.0, a=Math.pow(1-f,1.3);
          for(let i=2;i>=0;i--){
            const off=(i-1)*14*sc*big, rise=(14+f*34+i*6)*sc*big;
            const rr=Math.max(2,(12+f*40)*sc*big*(1-i*0.18));
            const gr=ctx.createRadialGradient(p.x+off*0.5,p.y-rise,0,p.x+off*0.5,p.y-rise,rr);
            gr.addColorStop(0,`rgba(255,246,200,${a})`);
            gr.addColorStop(0.35,`rgba(255,160,44,${a*0.9})`);
            gr.addColorStop(0.72,`rgba(180,54,16,${a*0.55})`);
            gr.addColorStop(1,'rgba(90,24,8,0)');
            ctx.fillStyle=gr;ctx.beginPath();ctx.arc(p.x+off*0.5,p.y-rise,rr,0,Math.PI*2);ctx.fill();
          }
        }
        // 3 ─ water column with cap, then falling spray
        if(age<5){
          const up=clamp(age/1.6,0,1), a=clamp(1-(age-1.4)/3.4,0,1);
          const rawColumnM=(28+up*86)*big;
          // A cinematic torpedo hit knows the target hull length. Cap the water
          // column in WORLD metres before projection so a close/zoomed impact can
          // never grow into a skyscraper above a small destroyer or merchant.
          const targetLenM=Number.isFinite(Number(e.targetLengthFeet))?Math.max(20,Number(e.targetLengthFeet)*.3048):null;
          const plumeCapM=targetLenM?clamp(targetLenM*.32,18,48):Infinity;
          const colH=Math.min(rawColumnM,plumeCapM)*sc, colW=Math.max(1.5,(7+up*8)*sc*big);
          const cg=ctx.createLinearGradient(p.x,p.y,p.x,p.y-colH);
          cg.addColorStop(0,`rgba(240,250,255,${a*0.9})`);
          cg.addColorStop(0.75,`rgba(232,246,255,${a*0.5})`);
          cg.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=cg;ctx.fillRect(p.x-colW/2,p.y-colH,colW,colH);
          // side jets
          ctx.strokeStyle=`rgba(238,250,255,${a*0.55})`;ctx.lineWidth=Math.max(1,colW*0.3);
          ctx.beginPath();
          ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x-colW*2.2,p.y-colH*0.6,p.x-colW*3.4,p.y-colH*0.18);
          ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x+colW*2.2,p.y-colH*0.62,p.x+colW*3.6,p.y-colH*0.2);
          ctx.stroke();
          // falling droplets off the cap
          if(this.quality>0.4&&age>0.7){
            ctx.fillStyle=`rgba(240,250,255,${a*0.7})`;
            for(let i=0;i<10;i++){
              const t0=0.7+hs(i,1)*0.8, ta=age-t0;
              if(ta<0) continue;
              const vx=(hs(i,2)-0.5)*36, vy=26+hs(i,3)*30;
              const dx=vx*ta, dy=vy*ta-22*ta*ta;      // metres above the cap; falls when negative
              const y=p.y-colH*0.85-dy*sc*big;
              if(y>p.y) continue;                      // back in the sea
              const s=Math.max(1,1.4*sc*big*3);
              ctx.fillRect(p.x+dx*sc*big,y,s,s);
            }
          }
        }
        // 4 ─ expanding foam ring on the surface
        if(age<6){
          const rg=Math.max(2,(6+age*22)*sc*big), a=clamp(1-age/6,0,1);
          ctx.strokeStyle=`rgba(240,250,252,${a*0.5})`;
          ctx.lineWidth=Math.max(1,rg*0.10);
          ctx.beginPath();ctx.ellipse(p.x,p.y,rg,Math.max(1,rg*0.24),0,0,Math.PI*2);ctx.stroke();
          ctx.strokeStyle=`rgba(240,250,252,${a*0.22})`;
          ctx.beginPath();ctx.ellipse(p.x,p.y,rg*0.66,Math.max(1,rg*0.16),0,0,Math.PI*2);ctx.stroke();
        }
        // 5 ─ thrown debris, dark, ballistic
        if(age<2.4&&this.quality>0.4){
          ctx.fillStyle=`rgba(30,26,22,${clamp(1-age/2.4,0,1)*0.85})`;
          for(let i=0;i<8;i++){
            const vx=(hs(i,5)-0.5)*55, vy=34+hs(i,6)*46;
            const dy=vy*age-26*age*age;
            if(dy<-2) continue;
            const s=Math.max(1,(1.2+hs(i,7)*2)*sc*10*big);
            ctx.fillRect(p.x+vx*age*sc*big,p.y-16*sc-dy*sc*big,s,s);
          }
        }
        // 6 ─ rolling smoke pall, outliving the flame
        if(this.quality>0.35&&age>0.4){
          const a=clamp(1-tt,0,1)*0.55;
          for(let i=0;i<7;i++){
            const f=(i+1)/7, rise=(16+age*17)*sc*big*f, rr=Math.max(2,(9+age*7)*sc*big*f);
            const drift=age*5*sc*big*(0.4+f);
            ctx.fillStyle=`rgba(${46+i*3},${44+i*3},${44+i*2},${a*(1-f*0.45)})`;
            ctx.beginPath();
            ctx.arc(p.x+Math.sin(i*1.9+age*0.35)*rr*0.6+drift*0.6,p.y-22*sc-rise,rr,0,Math.PI*2);
            ctx.fill();
          }
        }
      }else if(age<2.5){
        // dud / glance: a slap of water, nothing else
        const a=1-age/2.5;
        ctx.fillStyle=`rgba(232,246,255,${a*0.55})`;
        ctx.fillRect(p.x-Math.max(1,3*sc),p.y-(12+age*10)*sc,Math.max(1.5,6*sc),(12+age*10)*sc);
        const rg=Math.max(1.5,(3+age*10)*sc);
        ctx.strokeStyle=`rgba(232,246,255,${a*0.35})`;ctx.lineWidth=1;
        ctx.beginPath();ctx.ellipse(p.x,p.y,rg,rg*0.24,0,0,Math.PI*2);ctx.stroke();
      }
      if(age<3.5&&e.label){
        ctx.fillStyle=dud?`rgba(245,198,92,${1-age/3.5})`:`rgba(255,214,130,${1-age/3.5})`;
        ctx.font=this.fnt(11,true);ctx.textAlign='center';
        ctx.fillText(e.label,p.x,p.y-Math.max(24,96*sc));ctx.textAlign='left';
      }
      ctx.restore();
    }
  }

  /* ── depth-charge splashes ── */
  drawSplashes3D(ctx,cam,state,dl){
    for(const dc of state.world.depthCharges){
      const p=this.proj(cam,dc.position.xNm*NM_M,-dc.position.yNm*NM_M,0);
      if(!p) continue;
      const sc=cam.f/p.d, tt=dc.ageSec/dc.fuseSec;
      if(tt<0.35){
        const a=1-tt/0.35;
        ctx.fillStyle=`rgba(228,244,255,${a*0.75})`;
        const hgt=(10+tt*40)*sc;
        ctx.fillRect(p.x-Math.max(0.8,2.5*sc),p.y-hgt,Math.max(1.4,5*sc),hgt);
        ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(1.5,9*sc),Math.max(0.8,3*sc),0,0,Math.PI*2);ctx.fill();
      }
    }
  }

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
  }

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
  }

  drawScopeDeep(ctx,w,h,cx,cy){
    ctx.fillStyle='#020a0e';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(130,168,154,.55)';ctx.font=this.fnt(12);ctx.textAlign='center';
    ctx.fillText('SCOPE BELOW SURFACE',cx,cy-8*this.k);
    ctx.font=this.fnt(10);ctx.fillStyle='rgba(245,198,92,.7)';
    ctx.fillText('rise to 55 ft for a look',cx,cy+10*this.k);ctx.textAlign='left';
  }

  // ═══════════════════ NAVIGATION MAP — pan / pinch-zoom ═══════════════════
}
