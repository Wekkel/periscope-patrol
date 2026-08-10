class CanvasViewTactical extends CanvasViewCore {
  drawTactical(ctx,w,h,state){
    const sub=state.playerSub, k=this.k, t=state.time.elapsedSeconds;
    const silent=sub.stealth.silentRunning;
    const alertState=state.world.enemy.alertState;

    // Background
    const bg=ctx.createRadialGradient(w/2,h*0.42,0,w/2,h*0.42,Math.max(w,h)*0.75);
    if(silent){bg.addColorStop(0,'#170808');bg.addColorStop(1,'#080303');}
    else{bg.addColorStop(0,'#0b2029');bg.addColorStop(1,'#040b0e');}
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);

    // Grid
    const gs=Math.round(46*k);
    ctx.strokeStyle=silent?'rgba(110,40,40,0.22)':'rgba(47,95,86,0.16)';ctx.lineWidth=1;
    ctx.beginPath();
    for(let x=gs;x<w;x+=gs){ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,h);}
    for(let y=gs;y<h;y+=gs){ctx.moveTo(0,y+.5);ctx.lineTo(w,y+.5);}
    ctx.stroke();

    const pad=Math.round(10*k),safe=(this.portrait&&this.touchSafeTactical)||null;
    // Touch navigation is a real DOM overlay. Reserve its measured height in
    // the tactical canvas instead of painting useful information underneath it.
    const sceneTop=safe?Math.round(safe.top):0;
    const bannerH=(alertState==='ATTACKING'||alertState==='SEARCHING')?Math.round(21*k):0;
    const headerH=Math.round(46*k)+bannerH;
    const barsH=Math.round(60*k)+(silent?Math.round(22*k):0);
    const bodyTop=sceneTop+headerH, bodyBot=h-barsH;

    // Header (pushed down when a threat banner is showing)
    ctx.fillStyle=silent?'#e8b7b1':'#8fb8a8';ctx.font=this.fnt(11.5,true);
    ctx.fillText('TACTICAL STATUS',pad,sceneTop+bannerH+Math.round(18*k));
    ctx.font=this.fnt(9.5);ctx.fillStyle='rgba(140,175,160,.9)';
    ctx.fillText(`${sub.position.xNm.toFixed(1)}E / ${(-sub.position.yNm).toFixed(1)}N nm — ${state.campaign.patrolArea}`,pad,sceneTop+bannerH+Math.round(32*k));
    const en=state.world.enemy;
    let sonarTxt='';
    if(alertState!=='UNAWARE'){
      const held=en.contactHeld;
      const blind=state.time.elapsedSeconds<(en.sonarBlindUntil||0);
      sonarTxt=held?' · SONAR: THEY HOLD YOU':blind?' · SONAR: THEY ARE DEAF':' · SONAR: CONTACT LOST';
    }
    const envTxt=`${sub.inShallowWater?'⚠ SHALLOW':'DEEP WATER'} · ENEMY ${alertState}${sonarTxt}`;
    ctx.fillStyle=en.contactHeld?'#ef6a58':sub.inShallowWater?'#f5c65c':'rgba(140,175,160,.75)';
    ctx.fillText(envTxt,pad,sceneTop+bannerH+Math.round(43*k));

    // Layout
    let comp,col;
    if(this.portrait){
      const availH=bodyBot-bodyTop;
      const r=Math.min(w*0.34,availH*0.20);
      comp={cx:w/2,cy:bodyTop+r+pad*1.2,r};
      const colTop=comp.cy+r+Math.round(22*k);
      col={x:pad,y:colTop,w:w-pad*2,h:Math.max(90,bodyBot-colTop-pad*0.5)};
    }else{
      const availH=bodyBot-bodyTop;
      const r=Math.min(w*0.20,availH*0.42);
      comp={cx:pad+r+Math.round(14*k),cy:bodyTop+availH*0.5,r};
      const cx0=comp.cx+r+Math.round(26*k);
      col={x:cx0,y:bodyTop+pad*0.4,w:w-cx0-pad,h:availH-pad*0.8};
    }

    this.tactGeom={comp,col};
    this.drawCompassGauge(ctx,comp,sub,state);
    this.drawDepthColumn(ctx,col,sub,state);
    const sbH=Math.round(52*k);
    this.drawStatusBars(ctx,pad,bodyBot+Math.round(4*k),w-pad*2,sbH,state);

    // Silent running banner
    if(silent){
      const bh2=Math.round(22*k);
      ctx.fillStyle='rgba(150,32,32,0.85)';ctx.fillRect(0,h-bh2,w,bh2);
      ctx.fillStyle='#ffd9d5';ctx.font=this.fnt(10.5,true);ctx.textAlign='center';
      ctx.fillText('🔇 SILENT RUNNING — MINIMUM NOISE',w/2,h-bh2*0.3);ctx.textAlign='left';
    }
    // Threat banner
    if(alertState==='ATTACKING'){
      const pulse=0.65+0.35*Math.sin(t*6);
      const bh2=Math.round(21*k);
      ctx.fillStyle=`rgba(178,38,38,${pulse*0.92})`;ctx.fillRect(0,sceneTop,w,bh2);
      ctx.fillStyle='#ffe6e2';ctx.font=this.fnt(10.5,true);ctx.textAlign='center';
      ctx.fillText('⚠ DEPTH CHARGE ATTACK — EVADE',w/2,sceneTop+bh2*0.72);ctx.textAlign='left';
    }else if(alertState==='SEARCHING'){
      const bh2=Math.round(21*k);
      ctx.fillStyle='rgba(120,80,0,0.72)';ctx.fillRect(0,sceneTop,w,bh2);
      ctx.fillStyle='#f5c65c';ctx.font=this.fnt(10.5,true);ctx.textAlign='center';
      ctx.fillText('⚠ ESCORTS SEARCHING — GO SILENT',w/2,sceneTop+bh2*0.72);ctx.textAlign='left';
    }
  }

  /* ── Compass / helm gauge ── */
  drawCompassGauge(ctx,c,sub,state){
    const {cx,cy,r}=c, k=this.k;
    // dial face
    const g=ctx.createRadialGradient(cx,cy-r*0.3,r*0.1,cx,cy,r);
    g.addColorStop(0,'rgba(20,52,60,.92)');g.addColorStop(1,'rgba(6,18,22,.94)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#2f5f56';ctx.lineWidth=Math.max(1.5,2*k);
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();

    // slow sonar sweep for atmosphere
    if(this.quality>0.55){
      const a=(state.time.elapsedSeconds*0.55)%(Math.PI*2);
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,r-2,0,Math.PI*2);ctx.clip();
      ctx.globalAlpha=0.18;
      for(let i=0;i<14;i++){
        ctx.strokeStyle=`rgba(111,224,143,${0.05*(1-i/14)})`;
        ctx.lineWidth=r*0.14;
        ctx.beginPath();ctx.arc(cx,cy,r*0.5,a-i*0.05,a-i*0.05+0.05);ctx.stroke();
      }
      ctx.globalAlpha=1;ctx.restore();
    }

    // ticks
    ctx.lineWidth=1;
    for(let ang=0;ang<360;ang+=5){
      const rd=degToRad(ang), main=ang%30===0, mid=ang%10===0;
      const inner=r-(main?r*0.14:mid?r*0.09:r*0.05);
      ctx.strokeStyle=main?'rgba(150,190,175,.75)':'rgba(90,130,120,.45)';
      ctx.beginPath();
      ctx.moveTo(cx+Math.sin(rd)*inner,cy-Math.cos(rd)*inner);
      ctx.lineTo(cx+Math.sin(rd)*(r-2),cy-Math.cos(rd)*(r-2));ctx.stroke();
    }
    ctx.font=this.fnt(9.5,true);ctx.textAlign='center';ctx.textBaseline='middle';
    ['N','E','S','W'].forEach((lbl,i)=>{
      const rd=degToRad(i*90), rr=r-r*0.24;
      ctx.fillStyle=i===0?'#f5c65c':'rgba(150,190,175,.8)';
      ctx.fillText(lbl,cx+Math.sin(rd)*rr,cy-Math.cos(rd)*rr);
    });

    // ordered heading marker on the rim
    const orad=degToRad(sub.orderedHeading);
    ctx.fillStyle='#f5c65c';
    ctx.beginPath();
    const ox=cx+Math.sin(orad)*(r-1), oy=cy-Math.cos(orad)*(r-1);
    const perp=orad+Math.PI/2, s=r*0.07;
    ctx.moveTo(ox,oy);
    ctx.lineTo(ox-Math.sin(orad)*s*1.8+Math.cos(perp)*0,oy+Math.cos(orad)*s*1.8);
    ctx.lineTo(ox+Math.cos(orad)*s,oy+Math.sin(orad)*s);
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(245,198,92,.45)';ctx.lineWidth=Math.max(1,1.5*k);ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(orad)*(r*0.86),cy-Math.cos(orad)*(r*0.86));ctx.stroke();
    ctx.setLineDash([]);

    // waypoint bearing marker
    const wp=state.map.plottedCourse[0];
    if(wp){
      const wb=degToRad(bearingBetween(sub.position,wp));
      const wx=cx+Math.sin(wb)*(r*0.93), wy=cy-Math.cos(wb)*(r*0.93);
      ctx.fillStyle=state.map.autoFollowPlot?'#6fe08f':'rgba(111,224,143,.4)';
      ctx.beginPath();
      ctx.moveTo(wx,wy-r*0.055);ctx.lineTo(wx+r*0.055,wy);ctx.lineTo(wx,wy+r*0.055);ctx.lineTo(wx-r*0.055,wy);
      ctx.closePath();ctx.fill();
    }

    // actual heading needle
    const hrad=degToRad(sub.heading);
    const nx=cx+Math.sin(hrad)*(r*0.8), ny=cy-Math.cos(hrad)*(r*0.8);
    ctx.strokeStyle=sub.mode==='SUNK'?'#ef6a58':'#6fe08f';
    ctx.lineWidth=Math.max(2,3*k);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx-Math.sin(hrad)*(r*0.22),cy+Math.cos(hrad)*(r*0.22));ctx.lineTo(nx,ny);ctx.stroke();
    ctx.lineCap='butt';
    ctx.fillStyle='#6fe08f';ctx.beginPath();ctx.arc(nx,ny,Math.max(2.5,3.5*k),0,Math.PI*2);ctx.fill();

    // hub readouts
    const hub=r*0.44;
    ctx.fillStyle='rgba(4,12,15,.86)';ctx.beginPath();ctx.arc(cx,cy,hub,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(47,95,86,.7)';ctx.lineWidth=1;ctx.stroke();
    ctx.textAlign='center';
    ctx.fillStyle='#dff7ea';ctx.font=this.fnt(19,true);
    ctx.fillText(fmtDeg(sub.heading),cx,cy-hub*0.22);
    ctx.fillStyle='#82a89a';ctx.font=this.fnt(8.5);
    ctx.fillText(`ORD ${fmtDeg(sub.orderedHeading)}`,cx,cy+hub*0.15);
    ctx.fillStyle='#6fe08f';ctx.font=this.fnt(11,true);
    ctx.fillText(`${sub.propulsion.speedKnots.toFixed(1)} kn`,cx,cy+hub*0.6);
    if(state.map.autoFollowPlot&&state.map.plottedCourse.length){
      ctx.fillStyle='#6fe08f';ctx.font=this.fnt(7.5,true);
      ctx.fillText('◈ AUTOPILOT',cx,cy-hub*0.62);
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';

    // rudder indicator under the dial
    const rud=clamp(shortDelta(sub.heading,sub.orderedHeading)/30,-1,1);
    const rw=r*1.1, rx=cx-rw/2, ry=cy+r+Math.round(9*this.k);
    ctx.fillStyle='rgba(6,18,22,.8)';this.rr(ctx,rx,ry,rw,Math.round(6*this.k),3);ctx.fill();
    ctx.fillStyle=Math.abs(rud)>0.5?'#f5c65c':'#6fe08f';
    const hw=rw/2;
    ctx.fillRect(cx,ry,rud*hw,Math.round(6*this.k));
    ctx.fillStyle='rgba(150,190,175,.5)';ctx.fillRect(cx-1,ry-2,2,Math.round(10*this.k));
  }

  /* ── Depth column (water cross-section) ── */
  drawDepthColumn(ctx,R,sub,state){
    const k=this.k, maxD=300,safe=(this.portrait&&this.touchSafeTactical)||null;
    const x=R.x,y=R.y,cw=R.w,chh=R.h;
    const lab=Math.round(34*k);                 // left label gutter
    const top=y+Math.round(14*k), bot=y+chh-Math.round(6*k);
    const d2y=d=>top+clamp(d/maxD,0,1)*(bot-top);
    const wx=x+lab, ww=cw-lab-Math.round(4*k);
    if(this.tactGeom){this.tactGeom.colTop=top;this.tactGeom.colBot=bot;}

    // sky + sea
    ctx.fillStyle='rgba(30,52,66,.55)';ctx.fillRect(wx,y,ww,top-y);
    const sea=ctx.createLinearGradient(0,top,0,bot);
    sea.addColorStop(0,'rgba(24,74,96,.75)');
    sea.addColorStop(0.45,'rgba(11,42,58,.85)');
    sea.addColorStop(1,'rgba(3,12,18,.95)');
    ctx.fillStyle=sea;ctx.fillRect(wx,top,ww,bot-top);
    ctx.strokeStyle='rgba(47,95,86,.55)';ctx.lineWidth=1;ctx.strokeRect(wx+.5,y+.5,ww-1,chh-Math.round(6*k));

    // waterline
    ctx.strokeStyle='rgba(150,220,255,.6)';ctx.lineWidth=Math.max(1,1.5*k);
    ctx.beginPath();ctx.moveTo(wx,top+.5);ctx.lineTo(wx+ww,top+.5);ctx.stroke();

    // crush-depth danger band
    const cd=sub.damage.crushDepthFeet;
    if(cd<maxD){
      const cy2=d2y(cd);
      ctx.fillStyle='rgba(239,106,88,.14)';ctx.fillRect(wx,cy2,ww,bot-cy2);
      ctx.strokeStyle='rgba(239,106,88,.65)';ctx.setLineDash([5,4]);
      ctx.beginPath();ctx.moveTo(wx,cy2);ctx.lineTo(wx+ww,cy2);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(239,106,88,.9)';ctx.font=this.fnt(8.5,true);
      ctx.fillText(`CRUSH ${cd.toFixed(0)}ft`,wx+Math.round(4*k),cy2+Math.round(10*k));
    }

    // depth ladder
    ctx.font=this.fnt(8.5);
    for(let d=0;d<=maxD;d+=50){
      const dy=d2y(d);
      ctx.strokeStyle='rgba(120,170,158,.18)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(wx,dy+.5);ctx.lineTo(wx+ww,dy+.5);ctx.stroke();
      ctx.fillStyle='rgba(130,168,154,.75)';ctx.textAlign='right';
      ctx.fillText(String(d),x+lab-Math.round(5*k),dy+Math.round(3.5*k));
    }
    ctx.textAlign='left';
    // thermal layer — sonar's blind spot, and your best cover
    const layer=state.world.environment.layerDepthFt||0;
    if(layer>0&&layer<maxD){
      const ly=d2y(layer);
      const lg=ctx.createLinearGradient(0,ly-6*k,0,ly+10*k);
      lg.addColorStop(0,'rgba(80,190,220,0)');
      lg.addColorStop(0.5,'rgba(80,190,220,.30)');
      lg.addColorStop(1,'rgba(80,190,220,0)');
      ctx.fillStyle=lg;ctx.fillRect(wx,ly-6*k,ww,16*k);
      ctx.strokeStyle='rgba(120,215,240,.75)';ctx.setLineDash([7,4]);
      ctx.lineWidth=Math.max(1,1.4*k);
      ctx.beginPath();ctx.moveTo(wx,ly);ctx.lineTo(wx+ww,ly);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(140,225,245,.9)';ctx.font=this.fnt(8,true);
      ctx.fillText(`THERMAL LAYER ${layer}ft`,wx+Math.round(4*k),ly-Math.round(4*k));
      if(sub.depthFeet>layer+15){
        ctx.fillStyle='rgba(111,224,143,.85)';ctx.font=this.fnt(8.5,true);
        ctx.fillText('▼ BELOW THE LAYER — SONAR RETURNS WEAK',wx+Math.round(4*k),ly+Math.round(14*k));
      }
    }
    // periscope depth reference
    const py=d2y(55);
    ctx.strokeStyle='rgba(245,198,92,.35)';ctx.setLineDash([2,4]);
    ctx.beginPath();ctx.moveTo(wx,py);ctx.lineTo(wx+ww,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(245,198,92,.55)';ctx.font=this.fnt(8);
    ctx.fillText('SCOPE',wx+ww-Math.round(36*k),py-Math.round(3*k));

    // ordered depth marker
    const oy=d2y(sub.orderedDepthFeet);
    ctx.fillStyle='#f5c65c';
    ctx.beginPath();ctx.moveTo(wx+ww,oy);ctx.lineTo(wx+ww-Math.round(9*k),oy-Math.round(5*k));
    ctx.lineTo(wx+ww-Math.round(9*k),oy+Math.round(5*k));ctx.closePath();ctx.fill();

    // seabed when shallow
    if(sub.inShallowWater){
      const sy=bot-Math.round(10*k);
      ctx.fillStyle='rgba(140,120,60,.55)';
      ctx.beginPath();ctx.moveTo(wx,bot);
      for(let i=0;i<=10;i++){
        const px=wx+ww*i/10;
        ctx.lineTo(px,sy+Math.sin(i*1.7+state.time.elapsedSeconds*0.2)*Math.round(3*k));
      }
      ctx.lineTo(wx+ww,bot);ctx.closePath();ctx.fill();
    }

    // the boat
    const dy2=d2y(sub.depthFeet);
    const bob=sub.depthFeet<6?Math.sin(state.time.elapsedSeconds*1.6)*2*k:0;
    const bx=wx+ww*0.5, byy=dy2+bob;
    const bl=Math.min(ww*0.42,Math.round(96*k)), bh2=Math.max(6,bl*0.19);
    const hullCol=sub.mode==='SUNK'?'#ef6a58':sub.inShallowWater?'#f5c65c':'#6fe08f';
    ctx.save();ctx.translate(bx,byy);
    // trim angle from vertical speed
    ctx.rotate(clamp(sub.verticalSpeedFps*0.05,-0.28,0.28));
    ctx.fillStyle=hullCol;ctx.globalAlpha=0.92;
    ctx.beginPath();ctx.ellipse(0,0,bl/2,bh2/2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#04120f';
    ctx.fillRect(-bl*0.08,-bh2*1.15,bl*0.17,bh2*0.85);   // sail
    ctx.fillStyle=hullCol;
    ctx.fillRect(-bl*0.5,-bh2*0.1,bl*0.06,bh2*0.9);      // stern planes
    if(sub.depthFeet<66&&sub.damage.periscopeDamage<0.92){ // raised scope
      ctx.fillStyle='#dff7ea';ctx.fillRect(-bl*0.02,-bh2*2.0,Math.max(1.5,1.6*k),bh2*0.9);
    }
    ctx.globalAlpha=1;ctx.restore();

    // bubble trail when blowing ballast
    if(sub.ballastState==='EMERGENCY_BLOW'&&this.quality>0.4){
      ctx.fillStyle='rgba(200,240,255,.5)';
      for(let i=0;i<8;i++){
        const p=(state.time.elapsedSeconds*1.5+i*0.37)%1;
        ctx.beginPath();ctx.arc(bx+Math.sin(i*3+p*6)*bl*0.2,byy-(dy2-top)*p,Math.max(1,(2.5-p*1.5)*k),0,Math.PI*2);ctx.fill();
      }
    }

    // readouts. On touch TAC the right-side action cluster floats over the
    // depth plot. Use its measured LEFT edge as a hard safe boundary, so the
    // actual depth can sit closer to the boat rather than disappear under a
    // SILENT/LOCK/FIRE button. On tablets this normally leaves the old x-pos.
    const normalReadX=wx+ww-Math.round(6*k),safeRight=safe?.rightStart;
    const minReadX=bx+bl*.58;
    const readX=Number.isFinite(safeRight)
      ? clamp(Math.min(normalReadX,safeRight-Math.round(10*k)),minReadX,normalReadX)
      : normalReadX;
    ctx.font=this.fnt(17,true);ctx.fillStyle=hullCol;ctx.textAlign='right';
    ctx.fillText(`${sub.depthFeet.toFixed(0)} ft`,readX,top+Math.round(17*k));
    ctx.font=this.fnt(8.5);ctx.fillStyle='#82a89a';
    ctx.fillText(`${sub.mode.replace(/_/g,' ')} → ${sub.orderedDepthFeet.toFixed(0)}ft`,readX,top+Math.round(28*k));
    const vs=sub.verticalSpeedFps;
    if(Math.abs(vs)>0.15){
      ctx.fillStyle=vs>0?'#54b6ff':'#f5c65c';
      ctx.fillText(`${vs>0?'▼':'▲'} ${Math.abs(vs).toFixed(1)} ft/s`,readX,top+Math.round(38*k));
    }
    ctx.textAlign='left';
  }

  /* ── Bottom status bars ── */
  drawStatusBars(ctx,x,y,w,h,state){
    const sub=state.playerSub, k=this.k, p=sub.propulsion;
    const noise=clamp(sub.stealth.acousticSignature,0,1);
    const items=[
      {l:'NOISE',v:noise,txt:`${Math.round(noise*100)}%`,c:noise>0.7?'#ef6a58':noise>0.4?'#f5c65c':'#6fe08f'},
      {l:'PROFILE',v:sub.stealth.visualProfile,txt:sub.stealth.visualProfile>0.5?'HIGH':sub.stealth.visualProfile>0.1?'SCOPE':'HIDDEN',
       c:sub.stealth.visualProfile>0.5?'#ef6a58':sub.stealth.visualProfile>0.1?'#f5c65c':'#6fe08f'},
      {l:'BATTERY',v:p.battery/100,txt:`${p.battery.toFixed(0)}%${p.chargeRate>0.0004?' ↑'+(p.battery>=99.5?'':Math.round((100-p.battery)/(p.chargeRate*60))+'m'):''}`,c:p.battery<20?'#ef6a58':p.battery<45?'#f5c65c':'#6fe08f'},
      {l:'FUEL',v:p.fuel/100,txt:`${p.fuel.toFixed(0)}%`,c:p.fuel<20?'#ef6a58':'#6fe08f'},
      {l:'O₂',v:sub.damage.oxygen/100,txt:`${sub.damage.oxygen.toFixed(0)}%`,c:sub.damage.oxygen<25?'#ef6a58':sub.damage.oxygen<50?'#f5c65c':'#6fe08f'}
    ];
    const n=items.length, gap=Math.round(6*k), cw=(w-gap*(n-1))/n;
    items.forEach((it,i)=>{
      const ix=x+i*(cw+gap);
      ctx.fillStyle='rgba(8,22,27,.75)';this.rr(ctx,ix,y,cw,h,4*k);ctx.fill();
      ctx.strokeStyle='rgba(47,95,86,.5)';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='#5c7f76';ctx.font=this.fnt(7.5);
      ctx.fillText(it.l,ix+Math.round(6*k),y+Math.round(11*k));
      ctx.fillStyle=it.c;ctx.font=this.fnt(11,true);ctx.textAlign='right';
      ctx.fillText(it.txt,ix+cw-Math.round(6*k),y+Math.round(12*k));ctx.textAlign='left';
      const by=y+h-Math.round(8*k), bw=cw-Math.round(12*k);
      ctx.fillStyle='rgba(4,12,15,.9)';this.rr(ctx,ix+Math.round(6*k),by,bw,Math.round(4*k),2*k);ctx.fill();
      ctx.fillStyle=it.c;this.rr(ctx,ix+Math.round(6*k),by,Math.max(2,bw*clamp(it.v,0,1)),Math.round(4*k),2*k);ctx.fill();
    });
  }

  // ─── PERISCOPE ───
  // ═══════════════════ PERISCOPE — circular, resolution independent ═══════════════════
  // ═══════════════════════════════════════════════════════════════════
  //  PERISCOPE — real 3D scene
  //  World: E = east (metres), N = north, Y = up, sea surface at Y = 0.
  //  Camera sits at the eye height of the scope (or the bridge when surfaced),
  //  looking along the periscope bearing. Earth curvature is included, so
  //  distant ships genuinely go hull-down over the horizon.
  // ═══════════════════════════════════════════════════════════════════
}
