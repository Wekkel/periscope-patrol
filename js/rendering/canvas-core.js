class CanvasViewCore{
  constructor(canvas){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:false});
    this.mapCenter={xNm:0,yNm:0};
    this.w=canvas.width; this.h=canvas.height; this.dpr=1; this.k=1; this.portrait=false;
    this.zoom=28;                 // map pixels per nautical mile
    this.minZoom=0.9; this.maxZoom=900;    // whole sea to a single berth
    this.follow=true;             // map keeps ownship centred
    this.showLegend=false;
    this.scopeGeom={cx:0,cy:0,r:100,hor:0};
    this.quality=1;               // 0..1 — lowered automatically on slow frames
    const mem=Number(navigator.deviceMemory),cores=Number(navigator.hardwareConcurrency);
    // Only classify from capabilities the browser actually exposes. Chromium
    // Android reports deviceMemory, while Safari may omit it; omission must not
    // make every high-end iPhone look like a 4 GB budget device.
    this.lowSpec=(mem>0&&mem<=4)||(cores>0&&cores<=4); // Helio G88 / 4 GB class: keep wide 3-D views lean
    this.scopeLabelId=null;this.scopeLabelUntil=0;
    this.resize(true);
  }

  /* ── Backing store sizing: crisp on hi-dpi, memory-safe on 4 GB tablets ── */
  resize(force){
    const c=this.canvas;
    const rect=c.getBoundingClientRect();
    const cw=Math.max(200,Math.round(rect.width ||c.clientWidth ||960));
    const ch=Math.max(200,Math.round(rect.height||c.clientHeight||560));
    let dpr=window.devicePixelRatio||1;
    const mem=navigator.deviceMemory||4;
    dpr=Math.min(dpr, mem<=4?1.5:2);
    const BUDGET=2200000;                       // ≈2.2 MP ceiling
    if(cw*ch*dpr*dpr>BUDGET) dpr=Math.sqrt(BUDGET/(cw*ch));
    dpr=Math.max(1,Math.round(dpr*20)/20);
    const bw=Math.round(cw*dpr), bh=Math.round(ch*dpr);
    const changed=(c.width!==bw||c.height!==bh);
    if(force||changed){c.width=bw;c.height=bh;}
    this.dpr=dpr; this.w=cw; this.h=ch;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.k=clamp(Math.min(cw,ch)/430,0.78,2.0); // global UI scale
    this.portrait=ch>cw*0.98;
    return changed;
  }

  fnt(px,bold){return `${bold?'bold ':''}${Math.max(8,Math.round(px*this.k))}px ui-monospace,Consolas,monospace`;}
  rr(ctx,x,y,w,h,r){ // rounded rect path
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }
  revealScopeLabel(id,ms=3200){this.scopeLabelId=id;this.scopeLabelUntil=performance.now()+ms;}

  render(state){
    const ctx=this.ctx,w=this.w,h=this.h;
    // the whole view jolts when something goes off nearby
    const mag=clamp(state.world.shakeMag||0,0,9);
    let sx=0,sy=0;
    if(mag>0.05){
      const t=state.time.elapsedSeconds*47;
      const amp=mag*this.k*0.9;
      sx=(Math.sin(t*1.7)+Math.sin(t*3.1)*0.5)*amp;
      sy=(Math.cos(t*2.3)+Math.sin(t*4.7)*0.5)*amp*0.8;
    }
    ctx.setTransform(this.dpr,0,0,this.dpr,sx*this.dpr,sy*this.dpr);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.globalAlpha=1;ctx.setLineDash([]);
    if(state.tactical.activeStation==='MAP') this.drawMap(ctx,w,h,state);
    else if(state.tactical.activeStation==='PERISCOPE') this.drawPeriscope(ctx,w,h,state);
    else if(state.tactical.activeStation==='BRIDGE') this.drawBridge(ctx,w,h,state);
    else if(state.tactical.activeStation==='SOUND') this.drawSound(ctx,w,h,state);
    else if(state.tactical.activeStation==='DECK_GUN') this.drawDeckGun(ctx,w,h,state);
    else this.drawTactical(ctx,w,h,state);
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);   // HUD stays put
    this.drawHitFlash(ctx,w,h,state);
    this.drawAirAlarm(ctx,w,h,state);
    this.drawSoundCallout(ctx,w,h,state);
    if(mag>1.6){                                    // dust and flakes shaken loose
      ctx.fillStyle=`rgba(255,235,200,${clamp(mag/26,0,0.10)})`;
      ctx.fillRect(0,0,w,h);
    }
  }

  drawSoundCallout(ctx,w,h,state){
    const r=state.world.sound?.lastOperatorReport;if(!r||state.time.elapsedSeconds>(r.until||0)||state.tactical.activeStation==='SOUND')return;
    const k=this.k,bw=Math.min(w-20*k,430*k),bh=25*k,x=10*k,y=h-bh-8*k;
    ctx.fillStyle='rgba(3,18,20,.88)';this.rr(ctx,x,y,bw,bh,5*k);ctx.fill();ctx.strokeStyle='rgba(89,151,133,.72)';ctx.lineWidth=Math.max(1,k);ctx.stroke();
    ctx.fillStyle='rgba(205,238,223,.92)';ctx.font=this.fnt(8.6,true);ctx.fillText(r.text,x+8*k,y+16*k);
  }

  drawAirAlarm(ctx,w,h,state){
    const air=state.world.aircraft||[];
    const known=air.filter(a=>a.seenBySub&&a.state!=='DEPARTING'
      &&distNm(state.playerSub.position,a.position)<12);
    const orbiting=known.some(a=>a.state==='ORBIT');
    if(!known.length) return;
    const inbound=known.some(a=>a.state==='ATTACKING');
    const t=state.time.elapsedSeconds;
    const pulse=0.55+0.45*Math.sin(t*(inbound?9:4));
    const bh=Math.round(26*this.k);
    const y=h-bh;
    ctx.fillStyle=inbound?`rgba(190,36,30,${0.85*pulse})`:`rgba(150,96,10,${0.8*pulse})`;
    ctx.fillRect(0,y,w,bh);
    const near=known.reduce((a,b)=>distNm(state.playerSub.position,a.position)
                                  <distNm(state.playerSub.position,b.position)?a:b);
    const rng=distNm(state.playerSub.position,near.position);
    ctx.fillStyle='#fff3ef';ctx.font=this.fnt(11,true);ctx.textAlign='center';
    const sub=state.playerSub,diveUnderway=(sub.orderedDepthFeet||0)>Math.max(12,(sub.depthFeet||0)+4)||sub.mode==='DIVING'||sub.mode==='CRASH_DIVING';
    const action=inbound?'TAKE HER DOWN'
      :orbiting?'STAY DOWN'
      :(sub.depthFeet>=12?'STAY SUBMERGED':diveUnderway?'CONTINUE THE DIVE':'CLEAR THE BRIDGE');
    ctx.fillText(inbound?`✈ AIRCRAFT ATTACKING — ${rng.toFixed(1)} nm — ${action}`
                :orbiting?`✈ AIRCRAFT CIRCLING OVERHEAD ${rng.toFixed(1)} nm — ${action}`
                        :`✈ AIR CONTACT ${rng.toFixed(1)} nm — ${action}`,w/2,y+bh*0.7);
    ctx.textAlign='left';
  }

  drawHitFlash(ctx,w,h,state){
    let f=0;
    for(const e of state.weapons.explosions){
      if(e.ageSec<0.55&&/HIT/.test(e.label)) f=Math.max(f,1-e.ageSec/0.55);
    }
    if(f<=0) return;
    ctx.fillStyle=`rgba(255,226,170,${f*0.30})`;ctx.fillRect(0,0,w,h);
    const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.2,w/2,h/2,Math.max(w,h)*0.7);
    g.addColorStop(0,'rgba(255,180,60,0)');
    g.addColorStop(1,`rgba(255,140,40,${f*0.35})`);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }

  // ═══════════════════ TACTICAL — fully responsive ═══════════════════
}
