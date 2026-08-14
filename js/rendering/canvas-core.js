class CanvasViewCore{
  constructor(canvas){
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d',{alpha:false});
    this.mapCenter={xNm:0,yNm:0};
    this.w=canvas.width; this.h=canvas.height; this.dpr=1; this.k=1; this.portrait=false;
    this.zoom=28;                 // map pixels per nautical mile
    this.minZoom=0.9; this.maxZoom=900;    // whole sea to a single berth
    this.follow=false;            // chart stays fixed; centring ownship is a one-shot action
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

  render(state,layout=LayoutService.get()){
    const ctx=this.ctx,w=this.w,h=this.h,station=state?.tactical?.activeStation||'TACTICAL';
    this._lastRenderError=null;
    try{
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
      if(station==='MAP') this.drawMap(ctx,w,h,state,layout);
      else if(station==='PERISCOPE') this.drawPeriscope(ctx,w,h,state);
      else if(station==='BRIDGE') this.drawBridge(ctx,w,h,state);
      else if(station==='SOUND') this.drawSound(ctx,w,h,state,layout);
      else if(station==='DECK_GUN') this.drawDeckGun(ctx,w,h,state);
      else this.drawTactical(ctx,w,h,state);
      ctx.setTransform(this.dpr,0,0,this.dpr,0,0);   // HUD stays put
      this.drawHitFlash(ctx,w,h,state);
      this.drawOwnBoatImpact(ctx,w,h,state);
      if(state.tactical.impactObservation&&this.drawImpactObservation)this.drawImpactObservation(ctx,w,h,state);
      else{
        this.drawAirAlarm(ctx,w,h,state);
        this.drawSoundCallout(ctx,w,h,state);
      }
      if(mag>1.6&&!state.tactical.impactObservation){ // dust and flakes shaken loose
        ctx.fillStyle=`rgba(255,235,200,${clamp(mag/26,0,0.10)})`;
        ctx.fillRect(0,0,w,h);
      }
      this._lastRenderErrorKey=null;
      return true;
    }catch(err){
      const e=err instanceof Error?err:new Error(String(err||'unknown render error'));
      this._lastRenderError=e;
      const key=`${station}:${e.message}`;
      if(this._lastRenderErrorKey!==key){
        this._lastRenderErrorKey=key;
        console.error(`[RENDER] ${station} display failed — station navigation kept alive`,e);
      }
      /* A display failure is local to this frame/station. Do not mutate game
         state or stop the loop: the skipper must still be able to switch away
         from a broken view, especially on memory-constrained touch devices. */
      try{
        ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
        ctx.fillStyle='#02070a';ctx.fillRect(0,0,w,h);
        ctx.fillStyle='rgba(239,106,88,.95)';ctx.font=this.fnt(11,true);ctx.textAlign='center';
        ctx.fillText(`${station} DISPLAY FAULT`,w/2,h*.46);
        ctx.fillStyle='rgba(210,226,220,.86)';ctx.font=this.fnt(8.5);ctx.fillText(e.message.slice(0,72),w/2,h*.51);
        ctx.fillText('Switch station or start/load a patrol.',w/2,h*.56);ctx.textAlign='left';
      }catch(_){ }
      return false;
    }
  }

  drawOwnBoatImpact(ctx,w,h,state){
    const q=state.world?.ownHitVisual;if(!q?.wallAt)return;const wall=typeof performance!=='undefined'?performance.now():Date.now(),age=(wall-q.wallAt)/1000;if(age<0||age>.9)return;
    const u=clamp(age/.9,0,1),a=(1-u)*clamp(.25+(Number(q.amount)||0)/38,.28,.78),K=this.k;ctx.save();
    // On MAP show exactly what happened to ownship; elsewhere use a restrained
    // edge concussion that remains visible with the device muted.
    if(state.tactical.activeStation==='MAP'&&this._w2s){const p=this._w2s(state.playerSub.position.xNm,state.playerSub.position.yNm),r=(12+42*u)*K;ctx.strokeStyle=`rgba(239,106,88,${a})`;ctx.lineWidth=Math.max(2,4*K*(1-u*.55));ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,r*.55,0,Math.PI*2);ctx.stroke();}
    const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.18,w/2,h/2,Math.hypot(w,h)*.62);g.addColorStop(0,'rgba(110,20,12,0)');g.addColorStop(.68,`rgba(170,42,25,${a*.12})`);g.addColorStop(1,`rgba(239,106,88,${a*.42})`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();
  }

  drawSoundCallout(ctx,w,h,state,layout=LayoutService.get()){
    const r=state.world.sound?.lastOperatorReport,wall=typeof performance!=='undefined'?performance.now():Date.now();
    if(!r||(state.time.elapsedSeconds>(r.until||0)&&wall>(r.wallUntil||0))||state.tactical.activeStation==='SOUND')return;
    const k=this.k,touch=layout?.shell==='touch';
    const side=touch?Math.min(96*k,w*.23):10*k,x=side,bw=Math.max(132*k,Math.min(w-side*2,430*k));
    ctx.font=this.fnt(8.4,true);const words=String(r.text||'').split(/\s+/),lines=[''];
    for(const word of words){const test=(lines.at(-1)+' '+word).trim();if(lines.length<2&&lines.at(-1)&&ctx.measureText(test).width>bw-16*k)lines.push(word);else lines[lines.length-1]=test;}
    const bh=(lines.length>1?38:25)*k,y=h-bh-8*k;
    ctx.fillStyle='rgba(3,18,20,.90)';this.rr(ctx,x,y,bw,bh,5*k);ctx.fill();ctx.strokeStyle='rgba(89,151,133,.72)';ctx.lineWidth=Math.max(1,k);ctx.stroke();
    ctx.fillStyle='rgba(205,238,223,.94)';lines.slice(0,2).forEach((line,i)=>ctx.fillText(line,x+8*k,y+(16+i*13)*k));
  }

  drawAirAlarm(ctx,w,h,state){
    const air=state.world.aircraft||[];
    const known=air.filter(a=>a.side!=='FRIENDLY'&&a.seenBySub&&a.state!=='DEPARTING'
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
    const station=state.tactical.activeStation;
    if(!['DECK_GUN','PERISCOPE','BRIDGE'].includes(station)||typeof this.proj!=='function')return;
    const cam=station==='DECK_GUN'?this.gunCam:station==='BRIDGE'?this.bridgeCam:this.cam;
    if(!cam)return;
    const now=state.time.elapsedSeconds,k=this.k;
    let hit=null,fade=0,power=1,zM=2.5;
    const gf=state.weapons.deckGun?.impactFlash;
    if(station==='DECK_GUN'&&gf?.position&&gf.until>now){
      hit=gf.position;zM=Number(gf.zM)||2.5;power=Number(gf.power)||1;
      fade=clamp((gf.until-now)/Math.max(.1,(gf.until-(gf.startedAt??now))),0,1);
    }
    for(const e of state.weapons.explosions||[]){
      if(!e?.position||e.ageSec>=.8||!/HIT/.test(e.label||''))continue;
      const f=1-e.ageSec/.8;if(f>fade){hit=e.position;fade=f;power=/GUN/.test(e.label||'')?.9:1.15;zM=Math.max(.5,Number(e.zM)||3);}
    }
    if(!hit||fade<=0)return;
    const p=this.proj(cam,hit.xNm*NM_M,-hit.yNm*NM_M,zM);if(!p)return;
    const rr=clamp((48+10200/Math.max(90,p.d))*k,42*k,175*k),a=clamp(fade*power,0,1);
    ctx.save();ctx.globalCompositeOperation='screen';

    // A shell burst is a broader, softer patch of light than the old pin-point
    // flare. Several low-alpha lobes overlap around the real strike point so the
    // source flickers irregularly without wandering away from the hull hit.
    let glow;
    for(let i=0;i<4;i++){
      const phase=(now-(gf?.startedAt??now))*13+i*1.71,ox=Math.sin(phase*1.9+i)*rr*(.035+.014*i),oy=Math.cos(phase*1.35+i*.8)*rr*(.025+.010*i);
      const rri=rr*(.72+i*.12),g=ctx.createRadialGradient(p.x+ox,p.y+oy,0,p.x+ox,p.y+oy,rri);
      g.addColorStop(0,`rgba(255,244,202,${a*(.24-i*.026)})`);
      g.addColorStop(.24,`rgba(255,188,92,${a*(.16-i*.016)})`);
      g.addColorStop(.64,`rgba(255,128,48,${a*(.050-i*.005)})`);
      g.addColorStop(1,'rgba(255,104,28,0)');ctx.fillStyle=g;ctx.fillRect(p.x-rri*1.2,p.y-rri*1.2,rri*2.4,rri*2.4);
    }

    // A blast is a point light radiating in every direction. Keep the ambient
    // bloom broad but restrained so it reads as a local hull explosion rather
    // than a full-screen exposure pulse.
    const broadR=Math.max(rr*2.9,Math.hypot(w,h)*.66);
    glow=ctx.createRadialGradient(p.x,p.y,rr*.16,p.x,p.y,broadR);
    glow.addColorStop(0,`rgba(255,210,126,${a*.125})`);
    glow.addColorStop(.32,`rgba(255,159,72,${a*.064})`);
    glow.addColorStop(.70,`rgba(255,120,46,${a*.022})`);
    glow.addColorStop(1,'rgba(255,105,35,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);

    // Water reflects along the observer/impact axis, but the visible boundaries
    // are now straight and heavily overlapped. That removes the bowed 'light
    // tunnel' look while the diffuse wash below blends the passes into one soft
    // sheet of reflected light.
    const ey=Math.min(h,p.y+Math.max(92*k,(h-p.y)*.90));
    if(ey>p.y+8*k){
      const dy=ey-p.y,endX=w/2,rg=ctx.createLinearGradient(p.x,p.y,endX,ey);
      rg.addColorStop(0,`rgba(255,226,158,${a*.135})`);
      rg.addColorStop(.30,`rgba(255,174,88,${a*.064})`);
      rg.addColorStop(.66,`rgba(255,132,54,${a*.021})`);
      rg.addColorStop(1,'rgba(255,118,42,0)');
      for(const pass of [
        // Start wide at the strike point and flare rapidly. The previous narrow
        // apex read as a directional beam/torpedo trail instead of reflected light.
        {near:Math.max(34*k,rr*.48),half:clamp(dy*.78,108*k,w*.66),alpha:.42},
        {near:Math.max(50*k,rr*.68),half:clamp(dy*1.04,148*k,w*.84),alpha:.19},
        {near:Math.max(68*k,rr*.88),half:Math.max(w*.98,dy*1.30),alpha:.065}
      ]){
        ctx.globalAlpha=pass.alpha;ctx.fillStyle=rg;ctx.beginPath();
        ctx.moveTo(p.x-pass.near,p.y);ctx.lineTo(endX-pass.half,ey);ctx.lineTo(endX+pass.half,ey);ctx.lineTo(p.x+pass.near,p.y);ctx.closePath();ctx.fill();
      }

      const washX=lerp(p.x,endX,.58),washY=lerp(p.y,ey,.56),washR=Math.max(w*.58,dy*.92);
      glow=ctx.createRadialGradient(washX,washY,0,washX,washY,washR);
      glow.addColorStop(0,`rgba(255,176,92,${a*.045})`);
      glow.addColorStop(.50,`rgba(255,142,62,${a*.016})`);
      glow.addColorStop(1,'rgba(255,120,46,0)');
      ctx.globalAlpha=1;ctx.fillStyle=glow;ctx.fillRect(0,p.y,w,h-p.y);

      // In the deck-gun station the nearby bow/mount should catch a faint warm
      // glint from the blast.  This is deliberately a cheap screen-space wash,
      // not a second lighting/shadow pass: enough to tie the foreground hull to
      // the flash without adding expensive geometry work on mobile hardware.
      if(station==='DECK_GUN'){
        const side=clamp((p.x-w/2)/Math.max(1,w/2),-1,1);
        const deckX=w/2+side*w*.20,deckY=h*.90,deckR=Math.max(w*.50,h*.38);
        glow=ctx.createRadialGradient(deckX,deckY,0,deckX,deckY,deckR);
        glow.addColorStop(0,`rgba(255,198,116,${a*.046})`);
        glow.addColorStop(.48,`rgba(255,154,78,${a*.016})`);
        glow.addColorStop(1,'rgba(255,128,54,0)');
        ctx.fillStyle=glow;ctx.fillRect(0,h*.66,w,h*.34);
      }
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }

  // ═══════════════════ TACTICAL — fully responsive ═══════════════════
}
