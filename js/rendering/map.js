class CanvasView extends CanvasViewSound {
  drawMap(ctx,w,h,state,layout){
    const sub=state.playerSub, map=state.map, k=this.k;
    this._mapViewport={w,h};
    const intelContextSeq=map.intelContextSeq||0;
    if(this._intelContextSeq!==intelContextSeq){
      this._intelContextSeq=intelContextSeq;
      this._intelFitSeq=null;this._intelFocusUntil=0;
    }
    const fit=map.intelFitRequest?.historyId&&map.intelFitRequest.historyId!==state.campaign?.historyId?null:map.intelFitRequest;
    if(fit&&this._intelFitSeq!==fit.seq){
      this._intelFitSeq=fit.seq;
      const dx=Math.abs(fit.estimate.xNm-fit.own.xNm),dy=Math.abs(fit.estimate.yNm-fit.own.yNm);
      const touch=layout.shell==='touch',left=touch?74*k:38*k,right=touch?96*k:38*k,top=touch?74*k:42*k,bottom=touch?72*k:42*k;
      this.zoom=clamp(Math.min((w-left-right)/Math.max(4,dx),(h-top-bottom)/Math.max(4,dy)),this.minZoom,this.maxZoom);
      const mx=(fit.estimate.xNm+fit.own.xNm)/2,my=(fit.estimate.yNm+fit.own.yNm)/2,targetX=(left+w-right)/2,targetY=(top+h-bottom)/2;
      this.mapCenter.xNm=mx-(targetX-w/2)/this.zoom;this.mapCenter.yNm=my-(targetY-h/2)/this.zoom;this.follow=false;
      this._intelFocusUntil=(typeof performance!=='undefined'?performance.now():Date.now())+4200;
    }
    const pxPerNm=this.zoom;
    // NEW_PATROL raises a state-side recenter sequence. Consume it here rather
    // than reaching from simulation into the CanvasView instance. This keeps
    // the dependency direction one-way and also works if MAP is opened later.
    const recenterSeq=map.recenterSeq||0;
    if(this._mapRecenterSeq!==recenterSeq){
      this._mapRecenterSeq=recenterSeq;
      const requested=Number(PATROL_AREAS?.[state.campaign?.patrolArea]?.chartStartZoom);if(Number.isFinite(requested))this.zoom=clamp(requested,this.minZoom,this.maxZoom);
      this.recenter(sub);
    }
    if(this.follow){this.mapCenter.xNm=sub.position.xNm;this.mapCenter.yNm=sub.position.yNm;}
    const cx=w/2, cy=h/2;
    const w2s=(xNm,yNm)=>({x:cx+(xNm-this.mapCenter.xNm)*pxPerNm,y:cy+(yNm-this.mapCenter.yNm)*pxPerNm});
    this._w2s=w2s;

    ctx.fillStyle='#020c10';ctx.fillRect(0,0,w,h);
    this.drawMapBathy(ctx,state,w2s,w,h);
    this.drawAreaBounds(ctx,state,w2s);

    // Current optical coverage. The old 5-nm explored-cell tiles are retained
    // in save state but deliberately not painted: square blocks read as square
    // vision. This soft footprint is only an information aid; contacts still
    // come exclusively from the sensor simulation.
    const VF=map.visibilityFootprint;
    if(VF&&VF.points&&VF.points.length){
      const o=w2s((VF.origin||sub.position).xNm,(VF.origin||sub.position).yNm),P=VF.points.map(q=>w2s(q.xNm,q.yNm));
      ctx.save();ctx.fillStyle=VF.mode==='SCOPE'?'rgba(111,224,143,.026)':'rgba(111,224,143,.018)';
      ctx.strokeStyle=VF.mode==='SCOPE'?'rgba(111,224,143,.18)':'rgba(111,224,143,.095)';ctx.lineWidth=Math.max(.65,.8*k);ctx.setLineDash([4*k,7*k]);
      ctx.beginPath();
      if(VF.mode==='SCOPE'){ctx.moveTo(o.x,o.y);P.forEach(q=>ctx.lineTo(q.x,q.y));ctx.closePath();}
      else{P.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();}
      ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.restore();
    }

    // convoy routes — the actual water lane the ships and decoded shipping intelligence use
    for(const route of state.world.convoyRoutes){
      const path=route.waterPath&&route.waterPath.length>1?route.waterPath:[route.from,route.to];
      const P=path.map(q=>w2s(q.xNm,q.yNm));
      ctx.strokeStyle='rgba(245,198,92,0.16)';ctx.lineWidth=Math.max(6,12*k);ctx.setLineDash([10,9]);
      ctx.beginPath();P.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();
      ctx.strokeStyle='rgba(245,198,92,0.38)';ctx.lineWidth=Math.max(1,1.6*k);
      ctx.beginPath();P.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.setLineDash([]);
      const mid=routePointAt(path,routeCum(path).at(-1)/2).pos,pm=w2s(mid.xNm,mid.yNm);
      ctx.fillStyle='rgba(245,198,92,0.55)';ctx.font=this.fnt(9);ctx.textAlign='center';ctx.fillText(route.label,pm.x,pm.y-8*k);ctx.textAlign='left';
    }

    this.drawMapTerrain(ctx,state.world.terrain,w2s);
    this._mapFixedLabelRects=[];
    this.drawNavigationCorridors(ctx,state.world.navigationCorridors||[],w2s);
    this.drawMapWeather(ctx,state,w2s,w,h,layout);
    this.drawMapPortScenes(ctx,state.world.portScenes||[],w2s);
    this.drawMapPorts(ctx,state.world.ports,w2s);
    this.drawFriendlyApproach(ctx,state,w2s);
    this.drawMapHarbor(ctx,state.world.harbor,state.world.harborIntel,w2s,state.time.elapsedSeconds,state.campaign);
    this.drawMissionOverlay(ctx,state,w2s);
    this.drawMapTrail(ctx,map.ownshipTrail,w2s);
    this.drawMapPlot(ctx,map.plottedCourse,w2s,sub.position,map.autoFollowPlot);
    this.drawTorpedoEnvelope(ctx,state,w2s,w,h);
    this.drawScopeFovCue(ctx,state,w2s,w,h);
    this.drawMapDCs(ctx,state.world.depthCharges,w2s);
    this.drawMapTorps(ctx,state.weapons.activeTorpedoes,w2s);
    this.drawMapExplosions(ctx,state.weapons.explosions,w2s);
    this.drawUltra(ctx,state,w2s);
    this.drawInterceptAdvice(ctx,state,w2s,w,h);
    this.drawMapContacts(ctx,state.world.contactTracks,w2s,state.time.elapsedSeconds,sub.position,state.tactical.selectedTrackId,state);
    this.drawEnemySonarPing(ctx,state,w2s);
    this.drawMapAircraft(ctx,state.world.aircraft||[],w2s,sub);
    particles.draw(ctx,w2s);
    this.drawMapOwnship(ctx,sub,w2s);

    // ── HUD ──
    const pad=Math.round(9*k);
    ctx.fillStyle='rgba(4,12,15,.66)';this.rr(ctx,pad*0.6,pad*0.5,Math.round(196*k),Math.round(58*k),5*k);ctx.fill();
    ctx.fillStyle='#8fb8a8';ctx.font=this.fnt(11,true);
    ctx.fillText('NAVIGATION',pad,Math.round(17*k));
    ctx.font=this.fnt(8.5);ctx.fillStyle='rgba(140,175,160,.9)';
    ctx.fillText(`${sub.position.xNm.toFixed(1)}E / ${(-sub.position.yNm).toFixed(1)}N · ${state.campaign.missionStatus}`,pad,Math.round(29*k));
    const wp=map.plottedCourse[0];
    const navTxt=map.autoFollowPlot&&wp
      ? `AUTOPILOT → WP1 ${distNm(sub.position,wp).toFixed(1)}nm ${fmtDeg(bearingBetween(sub.position,wp))}`
      : `MANUAL HELM ${fmtDeg(sub.orderedHeading)}`;
    ctx.fillStyle=map.autoFollowPlot&&wp?'#6fe08f':'rgba(140,175,160,.9)';
    ctx.fillText(navTxt,pad,Math.round(40*k));
    ctx.fillStyle='rgba(140,175,160,.9)';
    {const ts=torpedoStoresStatus(state),wx=String(state.world.environment?.weather||'CLEAR').replace(/_/g,' ');ctx.fillText(`TRACKS ${Object.keys(state.world.contactTracks).length} · TORPS ${ts.total} (${ts.loadShort}) · WX ${wx} · MAP ${this.follow?'LOCKED':'FREE'}`,pad,Math.round(51*k));}
    if(sub.inShallowWater||(sub.keelClearanceFeet??3000)<35){
      ctx.fillStyle=(sub.keelClearanceFeet??3000)<15?'#ef6a58':'#f5c65c';ctx.font=this.fnt(9,true);
      const clr=sub.keelClearanceFeet??3000;
      ctx.fillText(clr<35?`⚠ ${Math.max(0,clr).toFixed(0)} FT UNDER KEEL`:'⚠ SHALLOW WATER',pad,Math.round(68*k));
    }

    // No omniscient traffic hint. An undetected ship is not a moving beacon:
    // use a real contact, a hydrophone bearing or a decoded intelligence plot to find it.
    if(Object.keys(state.world.contactTracks).length===0){
      ctx.fillStyle='rgba(245,198,92,0.68)';ctx.font=this.fnt(8.5);ctx.textAlign='center';
      /* Keep chart prose in its own bottom lane. The scale bar lives at the
         waterline immediately below it; sharing h-14/h-16 made the two labels
         physically overwrite one another on both mobile and desktop maps. */
      const noticeY=h-Math.round(38*k);
      const shippingCopy=getCampaignRadioIntelProfile(state.campaign.campaignProfileId)?.shipping;
      ctx.fillText(state.world.ultra?(shippingCopy?.noContactsPrompt||'NO CURRENT CONTACTS — work the intelligence plot'):'NO CURRENT CONTACTS — listen, look, or wait for intelligence',w/2,noticeY);
      ctx.textAlign='left';
    }

    // scale bar
    const targetPx=Math.min(w*0.28,140*k);
    const nice=[0.5,1,2,5,10,20,50,100];
    let nm=nice[0];
    for(const n of nice){if(n*pxPerNm<=targetPx) nm=n;}
    const touchLayout=layout.shell==='touch';
    /* MAP owns the bottom-right scale lane, but desktop also keeps the 110 px
       gyro repeater there. Reserve its footprint; on touch the gyro moves to
       the top and the smaller inset instead clears the right action controls. */
    const rightHudInset=(touchLayout?92:126)*k;
    const sbw=nm*pxPerNm, sbx=w-pad-rightHudInset-sbw, sby=h-Math.round(16*k);
    ctx.strokeStyle='rgba(215,245,231,.65)';ctx.lineWidth=Math.max(1,1.5*k);
    ctx.beginPath();ctx.moveTo(sbx,sby);ctx.lineTo(sbx+sbw,sby);
    ctx.moveTo(sbx,sby-4*k);ctx.lineTo(sbx,sby+4*k);
    ctx.moveTo(sbx+sbw,sby-4*k);ctx.lineTo(sbx+sbw,sby+4*k);ctx.stroke();
    ctx.fillStyle='rgba(215,245,231,.8)';ctx.font=this.fnt(8.5);ctx.textAlign='center';
    ctx.fillText(`${nm} nm`,sbx+sbw/2,sby-6*k);ctx.textAlign='left';

    const wall=typeof performance!=='undefined'?performance.now():Date.now();
    if(this._intelFocusUntil>wall){const label='MAP FOCUS · OWN BOAT + INTEL ESTIMATE';ctx.font=this.fnt(7.5,true);const bw=ctx.measureText(label).width+14*k,x=(w-bw)/2,y=8*k;ctx.fillStyle='rgba(4,15,18,.88)';this.rr(ctx,x,y,bw,19*k,4*k);ctx.fill();ctx.strokeStyle='rgba(111,224,143,.45)';ctx.stroke();ctx.fillStyle='rgba(190,240,215,.95)';ctx.textAlign='center';ctx.fillText(label,w/2,y+13*k);ctx.textAlign='left';}
    if(this.showLegend) this.drawMapLegend(ctx,w,h);
  }

  drawInterceptAdvice(ctx,state,w2s,w,h){
    const p=state.map?.interceptPlot;if(!p?.point)return;
    if(p.historyId&&p.historyId!==state.campaign?.historyId)return;
    const K=this.k,path=(p.waterPath?.length>1?p.waterPath:[state.playerSub.position,p.point]).map(q=>w2s(q.xNm,q.yNm)),b=path.at(-1);
    ctx.save();ctx.strokeStyle='rgba(111,224,143,.8)';ctx.fillStyle='rgba(111,224,143,.9)';ctx.lineWidth=Math.max(1,1.5*K);ctx.setLineDash([7*K,5*K]);
    ctx.beginPath();path.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(b.x,b.y,5*K,0,Math.PI*2);ctx.stroke();
    const age=Math.max(0,state.time.elapsedSeconds-(p.sourceReceivedAt||p.createdAt||0)),eta=p.timeSec<3600?`${Math.round(p.timeSec/60)}m`:`${(p.timeSec/3600).toFixed(1)}h`;
    const label=`ADVICE ${fmtDeg(p.courseDeg)} · ETA ${eta} · ±${Number(p.uncertaintyNm||0).toFixed(1)} NM · ${age<60?Math.round(age)+'s':Math.round(age/60)+'m'} OLD · HELM UNCHANGED`;
    ctx.font=this.fnt(7.5,true);const bw=Math.min(w-16*K,ctx.measureText(label).width+16*K),x=w-bw-8*K,y=34*K;
    ctx.fillStyle='rgba(4,15,18,.84)';this.rr(ctx,x,y,bw,21*K,4*K);ctx.fill();ctx.strokeStyle='rgba(111,224,143,.45)';ctx.stroke();ctx.fillStyle='rgba(190,240,215,.95)';ctx.textAlign='right';ctx.fillText(label,w-16*K,y+14*K);ctx.textAlign='left';ctx.restore();
  }


  drawEnemySonarPing(ctx,state,w2s){
    const cue=state.world.sound?.lastEnemyPingVisual;if(!cue?.position)return;
    const now=state.time?.elapsedSeconds||0,age=now-(cue.t||now);if(age<0||age>.95)return;
    const p=w2s(cue.position.xNm,cue.position.yNm),K=this.k,u=clamp(age/.95,0,1),r=(7+34*u)*K,a=(1-u)*.82;
    ctx.save();ctx.strokeStyle=`rgba(111,224,180,${a})`;ctx.lineWidth=Math.max(1.2,2*K*(1-u*.35));ctx.setLineDash([3*K,4*K]);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    if(u<.62){ctx.fillStyle=`rgba(205,245,228,${a*.88})`;ctx.font=this.fnt(7.5,true);ctx.textAlign='center';ctx.fillText('PING',p.x,p.y-r-5*K);ctx.textAlign='left';}ctx.restore();
  }

  drawMapWeather(ctx,state,w2s,w,h,layout){
    if(!state?.map?.weatherOverlay)return;
    /* Read-only weather plotting.  This deliberately does not call back into
       the weather simulation: MAP must remain a pure consumer of state so a
       display bug can never change or stall the simulation.  Cells are broad
       cloud/squall areas, not radar-quality truth. */
    const own=state.playerSub?.position,K=this.k,z=this.zoom,env=state.world?.environment||{};
    if(!own||!Number.isFinite(z)||z<=0)return;
    ctx.save();
    // Desktop needs an explicit chart cue when the layer is enabled. Touch MAP
    // already has the always-visible #mapWxChip in this exact corner; drawing a
    // second canvas label underneath it made the two controls compete for the
    // same pixels on phones. Debug/offscreen renderers have no document and
    // therefore keep the desktop cue by default.
    const touchMap=layout.shell==='touch';
    if(!touchMap){
      const wx=String(env.weather||'CLEAR').replace(/_/g,' '),vis=Number(env.visibilityNm);
      const label=`WX OVERLAY ON · ${wx}${Number.isFinite(vis)?` · VIS ${vis.toFixed(1)} NM`:''}`;
      ctx.font=this.fnt(7.5,true);ctx.textAlign='right';
      const tw=ctx.measureText(label).width+14*K,tx=w-8*K,ty=8*K;
      ctx.fillStyle='rgba(4,15,18,.78)';this.rr(ctx,tx-tw,ty,tw,19*K,4*K);ctx.fill();
      ctx.strokeStyle='rgba(177,204,211,.34)';ctx.lineWidth=Math.max(.8,K);ctx.stroke();
      ctx.fillStyle='rgba(190,220,218,.88)';ctx.fillText(label,tx-7*K,ty+13*K);ctx.textAlign='left';
    }
    const cells=state?.world?.weatherSystem?.cells;
    if(!Array.isArray(cells)||!cells.length){ctx.restore();return;}
    for(const c of cells.slice(0,3)){
      const center=c?.center;
      if(!center||!Number.isFinite(center.xNm)||!Number.isFinite(center.yNm))continue;
      const rNm=clamp(Number(c.radiusNm)||5,.8,12),rng=distNm(own,center);
      // A lookout can read a nearby weather mass from the horizon, but MAP is
      // not an omniscient meteorological radar. Far cells stay off the chart.
      if(rng>30+rNm)continue;
      const p=w2s(center.xNm,center.yNm),rp=rNm*z;
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(rp))continue;
      if(p.x+rp<-32||p.x-rp>w+32||p.y+rp<-32||p.y-rp>h+32)continue;

      const core=Math.max(7,rp*.44),outer=Math.max(10,rp);
      // Stable, cell-specific lobes replace the former perfect oval. Weather
      // remains deterministic and cheap: no per-frame random calls or raster.
      const seed=String(c.id||c.seed||`${center.xNm}:${center.yNm}`).split('').reduce((n,ch)=>(Math.imul(n,33)^ch.charCodeAt(0))>>>0,2166136261);
      const blob=(radius,scale=.72)=>{ctx.beginPath();for(let i=0;i<16;i++){const a=i/16*Math.PI*2,noise=1+.18*Math.sin(a*3+(seed%97))+.10*Math.sin(a*7+(seed%41)*.13),x=p.x+Math.cos(a)*radius*noise,y=p.y+Math.sin(a)*radius*scale*(1+.14*Math.cos(a*5+(seed%53)));i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();};
      // Outer cloud mass: faint and dashed. Inner core: precipitation/squall.
      ctx.fillStyle='rgba(116,139,150,.045)';ctx.strokeStyle='rgba(158,188,198,.28)';
      ctx.lineWidth=Math.max(.8,1.05*K);ctx.setLineDash([5*K,6*K]);
      blob(outer);ctx.fill();ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle='rgba(112,135,148,.075)';ctx.strokeStyle='rgba(177,204,211,.34)';
      blob(core,.68);ctx.fill();ctx.stroke();

      const hdg=Number(c.heading)||0,a=degToRad(hdg),L=clamp(outer*.38,12*K,46*K);
      const ex=p.x+Math.sin(a)*L,ey=p.y-Math.cos(a)*L;
      ctx.strokeStyle='rgba(174,204,211,.42)';ctx.lineWidth=Math.max(.8,K);
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(ex,ey);ctx.stroke();
      const ah=4*K,aa=Math.atan2(ey-p.y,ex-p.x);
      ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(aa-.55)*ah,ey-Math.sin(aa-.55)*ah);ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(aa+.55)*ah,ey-Math.sin(aa+.55)*ah);ctx.stroke();

      if(outer>18*K){
        ctx.fillStyle='rgba(183,210,216,.72)';ctx.font=this.fnt(7.2,true);ctx.textAlign='center';
        ctx.fillText('WEATHER CELL',p.x,p.y-outer*.72-5*K);
      }
    }
    ctx.setLineDash([]);ctx.textAlign='left';ctx.restore();
  }

  drawMissionOverlay(ctx,state,w2s){
    const m=state.campaign?.primaryMission;if(!m||m.type==='CONVOY_INTERDICTION')return;
    const K=this.k,ring=(pos,r,label,col='rgba(111,224,143,.72)',dash=[6,5])=>{
      if(!pos)return;const p=w2s(pos.xNm,pos.yNm);ctx.save();ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,1.4*K);ctx.setLineDash(dash);
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(8,r*this.zoom),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=col;ctx.font=this.fnt(8,true);ctx.fillText(label,p.x+Math.max(10,r*this.zoom)+4*K,p.y-4*K);ctx.restore();
    };
    if(m.type==='SHADOW_REPORT'&&typeof missionNightAttackGuidance==='function'){
      const g=missionNightAttackGuidance(state);if(g?.known){
        const C=g.center,K=this.k,half=46,min=g.minNm||.8,max=g.maxNm||3.5,pts=[];
        for(let i=0;i<=12;i++){const h=g.heading-half+i*(half*2/12),r=degToRad(h);pts.push(w2s(C.xNm+Math.sin(r)*max,C.yNm-Math.cos(r)*max));}
        for(let i=12;i>=0;i--){const h=g.heading-half+i*(half*2/12),r=degToRad(h);pts.push(w2s(C.xNm+Math.sin(r)*min,C.yNm-Math.cos(r)*min));}
        ctx.save();ctx.fillStyle='rgba(111,224,143,.055)';ctx.strokeStyle=g.ready?'rgba(111,224,143,.88)':'rgba(245,198,92,.64)';ctx.lineWidth=Math.max(1,1.5*K);ctx.setLineDash([6*K,5*K]);ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
        const r=degToRad(g.heading),lp=w2s(C.xNm+Math.sin(r)*max,C.yNm-Math.cos(r)*max);ctx.fillStyle=g.ready?'rgba(151,238,181,.94)':'rgba(245,198,92,.90)';ctx.font=this.fnt(7.5,true);ctx.textAlign='center';ctx.fillText(g.ready?`ATTACK POSITION · HOLD ${Math.round(g.hold)}/${Math.ceil(g.required)} SEC`:'NIGHT ATTACK POSITION · GET AHEAD INSIDE DASHED SECTOR',lp.x,lp.y-8*K);ctx.textAlign='left';ctx.restore();
      }
    }else if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT'){
      ring(m.intelFix,m.intelUncertaintyNm||2.5,m.type==='ESCORT_HUNT'?'ESCORT — REPORTED AREA':'HVT — REPORTED AREA','rgba(160,205,255,.82)');
      if(m.intelFix&&Number.isFinite(m.intelCourse)){
        const a=w2s(m.intelFix.xNm,m.intelFix.yNm),r=degToRad(m.intelCourse),L=Math.min(8*this.zoom,120*K);
        ctx.strokeStyle='rgba(160,205,255,.48)';ctx.lineWidth=1.2;ctx.setLineDash([8,5]);ctx.beginPath();ctx.moveTo(a.x-Math.sin(r)*L,a.y+Math.cos(r)*L);ctx.lineTo(a.x+Math.sin(r)*L,a.y-Math.cos(r)*L);ctx.stroke();ctx.setLineDash([]);
      }
    }else if(m.type==='RECONNAISSANCE'){
      ring(m.center,m.radiusNm||3.2,'RECON AREA','rgba(245,198,92,.78)');
    }else if(m.type==='LIFEGUARD'){
      ring(m.station,m.stationRadiusNm||2.5,'LIFEGUARD STATION','rgba(111,224,143,.78)');
      if(m.survivorSpawned&&!m.survivorSeen)ring(m.searchCenter,m.searchUncertaintyNm||1.6,'AIRMAN — SEARCH AREA','rgba(245,198,92,.80)',[3,5]);
      if(m.survivorSeen&&m.survivorPos){const p=w2s(m.survivorPos.xNm,m.survivorPos.yNm);ctx.fillStyle='#f5c65c';ctx.font=this.fnt(13,true);ctx.textAlign='center';ctx.fillText('⊙',p.x,p.y+4*K);ctx.font=this.fnt(7.5,true);ctx.fillText('LIFE RAFT',p.x,p.y-10*K);ctx.textAlign='left';}
    }else if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type)){
      const done=!!m.transferComplete,label=m.type==='RECON_EXTRACTION'?'RECON EXTRACTION':m.type==='RECON_INSERTION'?'RECON LANDING':'COASTWATCHER RV';
      ring(m.rendezvous,m.radiusNm||.18,done?`${label} — CLEAR AREA`:label,'rgba(111,224,143,.82)');
      if(done)ring(m.rendezvous,m.escapeRadiusNm||4,'CLEAR THIS RING','rgba(245,198,92,.42)',[3,7]);
    }else if(m.type==='HARBOR_STRIKE'){
      ring(m.center,m.radiusNm||2,m.neutralized?'HARBOR TARGET DOWN — WITHDRAW':'HARBOR STRIKE','rgba(239,106,88,.72)');
      if(m.neutralized)ring(m.center,m.escapeRadiusNm||6,'CLEAR DEFENSE RING','rgba(245,198,92,.42)',[3,7]);
    }else if(m.type==='WEATHER_AMBUSH'){
      const cell=(state.world.weatherSystem?.cells||[]).find(c=>c.id===m.weatherCellId);if(cell)ring(cell.center,cell.radiusNm||6,'REPORTED SQUALL','rgba(160,205,255,.50)',[3,7]);
    }else if(m.type==='MINELAYING'){
      ring(m.zone,m.zoneRadiusNm||.75,`MINE BOX · ${m.minesLaid||0}/${m.mineCount||12}`,'rgba(245,198,92,.82)');
      for(const q of m.mines||[]){const p=w2s(q.pos.xNm,q.pos.yNm);ctx.fillStyle='rgba(245,198,92,.72)';ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.5,2*K),0,Math.PI*2);ctx.fill();}
      if(m.zone&&Number.isFinite(m.layHeading)){const p=w2s(m.zone.xNm,m.zone.yNm),r=degToRad(m.layHeading),L=Math.min(2.2*this.zoom,58*K);ctx.strokeStyle='rgba(245,198,92,.6)';ctx.beginPath();ctx.moveTo(p.x-Math.sin(r)*L,p.y+Math.cos(r)*L);ctx.lineTo(p.x+Math.sin(r)*L,p.y-Math.cos(r)*L);ctx.stroke();}
    }
  }

  drawUltra(ctx,state,w2s){
    const U=state.world.ultra;if(!U)return;
    const shippingCopy=getCampaignRadioIntelProfile(state.campaign.campaignProfileId)?.shipping;
    const K=this.k,now=state.time.elapsedSeconds,age=now-U.reportedAt;
    if(age>6*3600){delete state.world.ultra;return;}
    const run=knotsNmSec(U.speedKn)*age,route=(state.world.convoyRoutes||[])[0],path=route?.waterPath;
    const routed=path&&path.length>1&&U.routeS!=null&&U.routeDir!=null;
    let dr,heading=U.courseDeg,trace;
    if(routed){
      trace=routeTrace(path,U.routeS,U.routeDir,run,.8);const q=trace[trace.length-1];dr=q.pos;heading=q.heading;
    }else{
      const r=degToRad(U.courseDeg);dr={xNm:U.reportPos.xNm+Math.sin(r)*run,yNm:U.reportPos.yNm-Math.cos(r)*run};
      trace=[{pos:U.reportPos},{pos:dr}];
    }
    const a=w2s(U.reportPos.xNm,U.reportPos.yNm),b=w2s(dr.xNm,dr.yNm);
    // Dead-reckoning follows the same navigable lane as the physical convoy.
    ctx.strokeStyle='rgba(160,200,255,.45)';ctx.lineWidth=Math.max(1,1.6*K);ctx.setLineDash([8,6]);ctx.beginPath();
    trace.forEach((q,i)=>{const z=w2s(q.pos.xNm,q.pos.yNm);i?ctx.lineTo(z.x,z.y):ctx.moveTo(z.x,z.y);});ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle='rgba(160,200,255,.5)';ctx.lineWidth=Math.max(1,1.4*K);ctx.beginPath();ctx.arc(a.x,a.y,6*K,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(160,200,255,.65)';ctx.font=this.fnt(7.5);ctx.fillText(`${shippingCopy?.mapFixLabel||'INTEL fix'} ${(age/3600).toFixed(1)}h old`,a.x+9*K,a.y+3*K);
    const unc=clamp((U.uncBaseNm||.8)+U.speedKn*age/3600*.10,.8,9);
    ctx.strokeStyle='rgba(120,190,255,.55)';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(b.x,b.y,Math.max(8,unc*this.zoom),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(150,205,255,.95)';ctx.font=this.fnt(9,true);ctx.fillText(shippingCopy?.mapEstimateLabel||'INTELLIGENCE — ESTIMATED CONVOY',b.x+11*K,b.y-3*K);
    ctx.font=this.fnt(7.5);ctx.fillStyle='rgba(150,205,255,.7)';ctx.fillText(`course ${fmtDeg(heading)} · ${U.speedKn.toFixed(0)}kn · ±${unc.toFixed(1)}nm`,b.x+11*K,b.y+8*K);
    const sp=state.playerSub.position;ctx.fillStyle='rgba(190,225,255,.9)';ctx.font=this.fnt(8,true);ctx.fillText(`${distNm(sp,dr).toFixed(1)} nm · steer ${fmtDeg(bearingBetween(sp,dr))}`,b.x+11*K,b.y+18*K);
    this._mapFixedLabelRects?.push({x:b.x+7*K,y:b.y-15*K,w:196*K,h:38*K,reserved:true});
    this.shipIcon(ctx,b.x,b.y,heading,clamp(.22*this.zoom,14*K,40*K),'MERCHANT','rgba(120,190,255,.30)','rgba(160,210,255,.8)',.95);
  }

  drawMapAircraft(ctx,list,w2s,sub){
    const K=this.k;
    for(const a of list){
      if(!a.seenBySub) continue;                       // only what the boat knows about
      const p=w2s(a.position.xNm,a.position.yNm);
      const col=a.side==='FRIENDLY'?'#6fe08f':a.state==='ATTACKING'||a.state==='STRAFING'?'#ef6a58':'#f5c65c';
      const S=Math.max(4.5,6*K);                       // a chart symbol, smaller than the boat
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(degToRad(a.heading));
      ctx.fillStyle=col;ctx.strokeStyle=col;
      ctx.lineWidth=Math.max(0.8,1.1*K);ctx.lineJoin='round';
      const k=a.kind||'FLOATPLANE';
      ctx.beginPath();
      if(k==='FLYING_BOAT'){                           // broad parasol wing, boat hull
        ctx.moveTo(0,-S*0.85);
        ctx.lineTo(S*0.16,-S*0.2);ctx.lineTo(S*1.15,-S*0.05);ctx.lineTo(S*1.15,S*0.12);
        ctx.lineTo(S*0.16,S*0.16);ctx.lineTo(S*0.30,S*0.75);ctx.lineTo(-S*0.30,S*0.75);
        ctx.lineTo(-S*0.16,S*0.16);ctx.lineTo(-S*1.15,S*0.12);ctx.lineTo(-S*1.15,-S*0.05);
        ctx.lineTo(-S*0.16,-S*0.2);
      }else if(k==='BOMBER'){                          // B5N/Kate: broad conventional tapered wing, not jet sweep
        ctx.moveTo(0,-S*1.0);
        ctx.lineTo(S*0.12,-S*0.18);ctx.lineTo(S*0.98,-S*0.05);ctx.lineTo(S*0.98,S*0.10);
        ctx.lineTo(S*0.13,S*0.14);ctx.lineTo(S*0.31,S*0.78);ctx.lineTo(S*0.10,S*0.70);
        ctx.lineTo(0,S*0.90);ctx.lineTo(-S*0.10,S*0.70);ctx.lineTo(-S*0.31,S*0.78);
        ctx.lineTo(-S*0.13,S*0.14);ctx.lineTo(-S*0.98,S*0.10);ctx.lineTo(-S*0.98,-S*0.05);
        ctx.lineTo(-S*0.12,-S*0.18);
      }else{                                           // floatplane: small, with floats
        ctx.moveTo(0,-S*0.8);
        ctx.lineTo(S*0.12,-S*0.2);ctx.lineTo(S*0.85,-S*0.02);ctx.lineTo(S*0.85,S*0.14);
        ctx.lineTo(S*0.12,S*0.18);ctx.lineTo(S*0.26,S*0.7);ctx.lineTo(-S*0.26,S*0.7);
        ctx.lineTo(-S*0.12,S*0.18);ctx.lineTo(-S*0.85,S*0.14);ctx.lineTo(-S*0.85,-S*0.02);
        ctx.lineTo(-S*0.12,-S*0.2);
      }
      ctx.closePath();ctx.fill();
      if(k==='FLOATPLANE'){
        ctx.globalAlpha=0.8;
        ctx.fillRect(-S*0.42,S*0.15,S*0.10,S*0.5);
        ctx.fillRect(S*0.32,S*0.15,S*0.10,S*0.5);
        ctx.globalAlpha=1;
      }
      ctx.restore();
      ctx.fillStyle=col;ctx.font=this.fnt(7.5,true);
      ctx.fillText(a.state==='ATTACKING'?'ATTACKING':(a.name||'AIRCRAFT'),p.x+S*1.4,p.y+3*K);
      if(a.state==='ATTACKING'){
        ctx.strokeStyle='rgba(239,106,88,.30)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
        ctx.beginPath();ctx.arc(p.x,p.y,16*K,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      }
    }
  }

  drawMapLegend(ctx,w,h){
    const k=this.k, lw=Math.round(196*k), lh=Math.round(140*k);
    const lx=Math.round(10*k), ly=h-lh-Math.round(28*k);
    ctx.fillStyle='rgba(6,16,18,0.86)';this.rr(ctx,lx,ly,lw,lh,5*k);ctx.fill();
    ctx.strokeStyle='rgba(47,95,86,0.6)';ctx.lineWidth=1;ctx.stroke();
    const rows=[['#6fe08f','▲','your submarine'],['#f5c65c','▲','enemy ship (confirmed)'],
      ['#f5c65c','◌','estimated position'],['#6fe08f','⚓','friendly port'],['#ef6a58','⚓','enemy port'],
      ['rgba(150,200,214,0.9)','┄','100-fathom curve'],['rgba(235,195,125,0.9)','┄','10-fathom danger line'],
      ['rgba(239,106,88,0.9)','━','4-fathom grounding danger'],['rgba(245,198,92,0.7)','▭','patrol area boundary']];
    ctx.font=this.fnt(8.5);
    rows.forEach((r,i)=>{
      const y=ly+Math.round((14+i*14)*k);
      ctx.fillStyle=r[0];ctx.fillText(r[1],lx+Math.round(8*k),y);
      ctx.fillStyle='#82a89a';ctx.fillText(r[2],lx+Math.round(24*k),y);
    });
  }

  /* ── BATHYMETRY ────────────────────────────────────────────────────
     The charts of 1943 had no colour to spare, but they had the one line a
     submariner read before anything else: the 100-fathom curve. Inside it a
     boat under attack has nowhere to go — the depth charges find the bottom
     and so do you. Outside it the whole dark ocean is yours to hide in.
     There is no survey data in the game, so the sea floor is synthesised
     the way it mostly works in nature: a shelf that falls away with
     distance from the land, roughened with a fixed noise so the contours
     wander like real ones. Drawn as the palest of washes — chart tint, not
     decoration — with spot soundings in fathoms when zoomed close. */
  _ensureBathy(state){ return (this._bathy=Bathy.ensure(state.world.terrain)); }

  /* THE PATROL AREA. It had no edge you could see, only a message that
     appeared when you crossed one. Drawn now as the box it is, with the
     margin where the boat is considered to be standing out of it shaded. */
  drawAreaBounds(ctx,state,w2s){
    const B=this._bathy; if(!B) return;
    const A=state.world.chartBounds||{x0:B.x0,y0:B.y0,x1:B.x0+(B.nx-1)*B.cell,y1:B.y0+(B.ny-1)*B.cell};
    const p=w2s(A.x0,A.y0), q=w2s(A.x1,A.y1);
    const m0=w2s(A.x0+6,A.y0+6), m1=w2s(A.x1-6,A.y1-6);
    ctx.save();
    // the six-mile margin
    ctx.beginPath();
    ctx.rect(p.x,p.y,q.x-p.x,q.y-p.y);
    ctx.rect(m0.x,m0.y,m1.x-m0.x,m1.y-m0.y);
    ctx.fillStyle='rgba(245,198,92,.055)';
    ctx.fill('evenodd');
    // the boundary itself
    ctx.strokeStyle='rgba(245,198,92,.42)';
    ctx.lineWidth=1.5; ctx.setLineDash([9,6]);
    ctx.strokeRect(p.x,p.y,q.x-p.x,q.y-p.y);
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(245,198,92,.6)';
    ctx.font=this.fnt(8.5);
    ctx.textAlign='left';
    ctx.fillText('PATROL AREA BOUNDARY',p.x+8,p.y+14);
    ctx.restore();
  }

  _buildBathyOverview(B){
    /* legitieme DOM-toegang: offscreen buffer, geen layout- of statuslezing */
    const owner=this.canvas?.ownerDocument;if(!owner||typeof owner.createElement!=='function') return null;
    if(this._bathyOverview?.ref===B) return this._bathyOverview;
    const scale=6,w=Math.max(1,(B.nx-1)*scale),h=Math.max(1,(B.ny-1)*scale);
    const canvas=owner.createElement('canvas');
    if(!canvas||typeof canvas.getContext!=='function') return null;
    canvas.width=w;canvas.height=h;
    const c=canvas.getContext('2d',{alpha:true});
    if(!c) return null;
    const {grid,nx,ny}=B,D=(i,j)=>grid[j*nx+i];
    const bands=[[10,'rgba(150,215,222,0.085)'],[25,'rgba(135,205,218,0.058)'],
                 [50,'rgba(120,195,212,0.038)'],[100,'rgba(105,182,205,0.022)']];
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const d0=D(i,j),d1=D(i+1,j),d2=D(i+1,j+1),d3=D(i,j+1);
      if(d0<0&&d1<0&&d2<0&&d3<0)continue;
      const dm=(Math.max(d0,0)+Math.max(d1,0)+Math.max(d2,0)+Math.max(d3,0))/4;
      let fill=null;for(const b of bands){if(dm<b[0]){fill=b[1];break;}}
      if(fill){c.fillStyle=fill;c.fillRect(i*scale,j*scale,scale+.5,scale+.5);}
    }
    const curve=(T,style,dash)=>{
      c.strokeStyle=style;c.lineWidth=1;if(dash)c.setLineDash(dash);c.beginPath();
      for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
        const z=[D(i,j),D(i+1,j),D(i+1,j+1),D(i,j+1)];if(z.some(v=>v<0))continue;
        const x=[i*scale,(i+1)*scale,(i+1)*scale,i*scale],y=[j*scale,j*scale,(j+1)*scale,(j+1)*scale],pts=[];
        for(let e=0;e<4;e++){const a=z[e],b=z[(e+1)%4];if((a<T)!==(b<T)){const f=(T-a)/(b-a);pts.push({x:x[e]+(x[(e+1)%4]-x[e])*f,y:y[e]+(y[(e+1)%4]-y[e])*f});}}
        if(pts.length>=2){c.moveTo(pts[0].x,pts[0].y);c.lineTo(pts[1].x,pts[1].y);if(pts.length===4){c.moveTo(pts[2].x,pts[2].y);c.lineTo(pts[3].x,pts[3].y);}}
      }
      c.stroke();c.setLineDash([]);
    };
    curve(4,'rgba(239,106,88,0.48)',[]);curve(10,'rgba(235,195,125,0.26)',[3,3]);curve(100,'rgba(150,200,214,0.30)',[6,4]);
    this._bathyOverview={ref:B,canvas,scale};return this._bathyOverview;
  }

  drawMapBathy(ctx,state,w2s,w,h){
    const B=this._ensureBathy(state); if(!B) return;
    const {grid,nx,ny,x0,y0,cell}=B,cellPx=cell*this.zoom;
    /* Wide-area map views used to recompute four tint bands plus three complete
       marching-squares contour passes every frame. That is mostly invisible
       work when a bathymetry cell is only a few pixels wide, and it is the
       worst MAP hotspot on Helio G88-class devices. At that scale the exact
       same chart layer is rasterised once at six pixels per source cell and
       then transformed as a single image. Close zoom stays fully vector so
       soundings/coast approach work remain crisp. */
    if(cellPx<=6||(this.lowSpec&&cellPx<=13)){
      const O=this._buildBathyOverview(B);
      if(O&&typeof ctx.drawImage==='function'){
        const p=w2s(x0,y0),q=w2s(x0+(nx-1)*cell,y0+(ny-1)*cell);
        ctx.drawImage(O.canvas,p.x,p.y,q.x-p.x,q.y-p.y);
        return;
      }
    }
    const s2w=(sx,sy)=>({x:this.mapCenter.xNm+(sx-w/2)/this.zoom,
                         y:this.mapCenter.yNm+(sy-h/2)/this.zoom});
    const tl=s2w(0,0),br=s2w(w,h);
    const i0=clamp(Math.floor((tl.x-x0)/cell),0,nx-2), i1=clamp(Math.ceil((br.x-x0)/cell),1,nx-1);
    const j0=clamp(Math.floor((tl.y-y0)/cell),0,ny-2), j1=clamp(Math.ceil((br.y-y0)/cell),1,ny-1);
    const D=(i,j)=>grid[j*nx+i];
    const bands=[[10,'rgba(150,215,222,0.085)'],[25,'rgba(135,205,218,0.058)'],
                 [50,'rgba(120,195,212,0.038)'],[100,'rgba(105,182,205,0.022)']];
    for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++){
      const d0=D(i,j),d1=D(i+1,j),d2=D(i+1,j+1),d3=D(i,j+1);
      if(d0<0&&d1<0&&d2<0&&d3<0) continue;
      const dm=(Math.max(d0,0)+Math.max(d1,0)+Math.max(d2,0)+Math.max(d3,0))/4;
      let fill=null;for(const b of bands){if(dm<b[0]){fill=b[1];break;}}if(!fill)continue;
      const p=w2s(x0+i*cell,y0+j*cell),q=w2s(x0+(i+1)*cell,y0+(j+1)*cell);
      ctx.fillStyle=fill;ctx.fillRect(p.x,p.y,q.x-p.x+0.6,q.y-p.y+0.6);
    }
    const curve=(T,style,dash)=>{
      ctx.strokeStyle=style;ctx.lineWidth=1;if(dash)ctx.setLineDash(dash);ctx.beginPath();
      for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++){
        const c=[D(i,j),D(i+1,j),D(i+1,j+1),D(i,j+1)];if(c.some(v=>v<0))continue;
        const xs=[x0+i*cell,x0+(i+1)*cell,x0+(i+1)*cell,x0+i*cell],ys=[y0+j*cell,y0+j*cell,y0+(j+1)*cell,y0+(j+1)*cell],px2=[];
        for(let e=0;e<4;e++){const a=c[e],b=c[(e+1)%4];if((a<T)!==(b<T)){const f=(T-a)/(b-a);px2.push(w2s(xs[e]+(xs[(e+1)%4]-xs[e])*f,ys[e]+(ys[(e+1)%4]-ys[e])*f));}}
        if(px2.length>=2){ctx.moveTo(px2[0].x,px2[0].y);ctx.lineTo(px2[1].x,px2[1].y);if(px2.length===4){ctx.moveTo(px2[2].x,px2[2].y);ctx.lineTo(px2[3].x,px2[3].y);}}
      }
      ctx.stroke();ctx.setLineDash([]);
    };
    curve(4,'rgba(239,106,88,0.48)',[]);curve(10,'rgba(235,195,125,0.26)',[3,3]);curve(100,'rgba(150,200,214,0.30)',[6,4]);
    /* Numeric depth soundings were historically appropriate, but on this
       small moving canvas they read like numbered map tiles. Worse, the old
       viewport-dependent sampling changed which labels were painted while
       panning. Keep the bathymetry, fills and contour lines as navigation
       truth; omit the decorative numbers for a calmer, stable chart. */
  }

  drawMapTerrain(ctx,terrain,w2s){
    const K=this.k,margin=42*K;
    this._terrainBoundsCache=this._terrainBoundsCache||new WeakMap();
    const landGradient=ctx.createLinearGradient(0,0,0,this.h);
    landGradient.addColorStop(0,'rgba(92,104,62,0.92)');landGradient.addColorStop(1,'rgba(66,80,50,0.92)');
    const thin=(pts,minNm)=>{
      if(!minNm||pts.length<10)return pts;const out=[pts[0]];let last=pts[0];
      for(let i=1;i<pts.length-1;i++){const q=pts[i],dx=q.xNm-last.xNm,dy=q.yNm-last.yNm;if(dx*dx+dy*dy>=minNm*minNm){out.push(q);last=q;}}
      out.push(pts[pts.length-1]);return out.length>=3?out:pts;
    };
    for(const f of terrain){
      if(!f.points||f.points.length<3) continue;
      let b=this._terrainBoundsCache.get(f);
      if(!b){
        let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,cx=0,cy=0;
        for(const q of f.points){minX=Math.min(minX,q.xNm);maxX=Math.max(maxX,q.xNm);minY=Math.min(minY,q.yNm);maxY=Math.max(maxY,q.yNm);cx+=q.xNm;cy+=q.yNm;}
        b={minX,maxX,minY,maxY,cx:cx/f.points.length,cy:cy/f.points.length,
          lodFar:thin(f.points,.45),lodMid:thin(f.points,.18),lodNear:thin(f.points,.08)};
        this._terrainBoundsCache.set(f,b);
      }
      const a=w2s(b.minX,b.minY),z=w2s(b.maxX,b.maxY),l=Math.min(a.x,z.x),r=Math.max(a.x,z.x),t=Math.min(a.y,z.y),bt=Math.max(a.y,z.y);
      if(r<-margin||l>this.w+margin||bt<-margin||t>this.h+margin) continue;
      // At wide zoom the omitted vertices are strictly sub-pixel detail. Keeping
      // them out of Canvas2D paths saves thousands of commands without changing
      // the visible coastline; close zoom automatically returns to full geometry.
      const pts=this.zoom<2?b.lodFar:this.lowSpec?(this.zoom<5?b.lodMid:this.zoom<10?b.lodNear:f.points):f.points;
      const path=()=>{ctx.beginPath();pts.forEach((p,i)=>{const q=w2s(p.xNm,p.yNm);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();};
      if(f.type==='REEF'){
        path();ctx.fillStyle='rgba(215,180,95,0.20)';ctx.fill();ctx.strokeStyle='rgba(240,200,110,0.65)';ctx.lineWidth=Math.max(1,1.4*K);ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);continue;
      }
      path();ctx.strokeStyle='rgba(120,175,150,0.16)';ctx.lineWidth=Math.max(6,14*K);ctx.lineJoin='round';ctx.stroke();
      ctx.strokeStyle='rgba(190,205,120,0.14)';ctx.lineWidth=Math.max(3,7*K);ctx.stroke();
      ctx.fillStyle=landGradient;ctx.fill();
      ctx.strokeStyle=this.zoom>=70?'rgba(239,106,88,0.72)':'rgba(214,228,150,0.55)';ctx.lineWidth=this.zoom>=70?Math.max(1.4,1.8*K):Math.max(1,1.3*K);ctx.stroke();
      if(f.areaNm2>25){
        const c=w2s(b.cx,b.cy),cx=c.x,cy=c.y;
        if(cx>-120&&cx<this.w+120&&cy>-60&&cy<this.h+60){ctx.fillStyle='rgba(226,238,180,0.8)';ctx.font=this.fnt(9,true);ctx.textAlign='center';ctx.fillText(f.name.toUpperCase(),cx,cy);if(f.peakM>500){ctx.fillStyle='rgba(226,238,180,0.5)';ctx.font=this.fnt(7.5);ctx.fillText(`▲ ${f.peakM} m`,cx,cy+10*K);}ctx.textAlign='left';}
      }
    }
  }

  drawNavigationCorridors(ctx,corridors,w2s){
    const K=this.k;for(const corridor of corridors){const pts=corridor.points||[];if(pts.length<2)continue;
      const P=pts.map(p=>w2s(p.xNm,p.yNm)),friendly=corridor.side!=='ENEMY',col=friendly?'111,224,143':'245,198,92',half=Math.max(3*K,(Number(corridor.widthNm)||1.2)*this.zoom*.5);
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=`rgba(${col},.10)`;ctx.lineWidth=Math.max(2,half*2);ctx.setLineDash([12*K,9*K]);ctx.beginPath();P.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      ctx.strokeStyle=`rgba(${col},.54)`;ctx.lineWidth=Math.max(1,1.15*K);ctx.setLineDash([5*K,6*K]);ctx.beginPath();P.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
      const a=P[0],b=P[1],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,tip={x:a.x+ux*14*K,y:a.y+uy*14*K};ctx.strokeStyle=`rgba(${col},.72)`;ctx.lineWidth=Math.max(1,1.25*K);ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*7*K+nx*4*K,tip.y-uy*7*K+ny*4*K);ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*7*K-nx*4*K,tip.y-uy*7*K-ny*4*K);ctx.stroke();
      const mid=P[(P.length/2)|0];ctx.fillStyle=`rgba(${col},.78)`;ctx.font=this.fnt(7.2,true);ctx.textAlign='center';ctx.fillText(String(corridor.label||'CHARTED APPROACH').toUpperCase(),mid.x,mid.y-7*K);ctx.textAlign='left';ctx.restore();
    }
  }

  drawFriendlyApproach(ctx,state,w2s){
    const camp=state.campaign,ap=camp&&camp.portApproach;
    if(!ap||!ap.pos) return;
    const p=w2s(ap.pos.xNm,ap.pos.yNm),K=this.k;
    const r=Math.max(13*K,Math.min(28*K,0.30*this.zoom));
    ctx.save();
    ctx.strokeStyle='rgba(111,224,143,.72)';ctx.lineWidth=Math.max(1.2,1.8*K);ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(111,224,143,.10)';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(205,245,226,.92)';ctx.font=this.fnt(8.5,true);ctx.textAlign='center';
    ctx.fillText(`${ap.portName} · FRIENDLY RV`,p.x,p.y-r-5*K);
    ctx.font=this.fnt(7.5);ctx.fillStyle='rgba(150,205,180,.82)';
    const finalReturn=camp.missionStatus==='RETURN TO BASE';
    ctx.fillText(`SAFE SERVICE WATER`,p.x,p.y+r+10*K);
    ctx.fillText(finalReturn
      ? `FINAL RETURN · SURFACE · ALL STOP`
      : `SERVICE · SURFACE · ALL STOP`,p.x,p.y+r+20*K);
    this._mapFixedLabelRects?.push({x:p.x-85*K,y:p.y-r-18*K,w:170*K,h:Math.max(55*K,2*r+38*K)});
    ctx.textAlign='left';ctx.restore();
  }

  drawTorpedoEnvelope(ctx,state,w2s,w,h){
    const preferred=state.tactical.selectedTrackId||state.tdc.targetId;
    const I=torpedoRangeInfo(state,preferred);
    if(!I) return;
    const sub=state.playerSub,K=this.k,own=w2s(sub.position.xNm,sub.position.yNm);
    const rp=I.maxNm*this.zoom;
    ctx.save();
    if(rp>10){
      ctx.strokeStyle='rgba(111,224,143,.22)';ctx.lineWidth=Math.max(1,1.2*K);ctx.setLineDash([7,7]);
      ctx.beginPath();ctx.arc(own.x,own.y,rp,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      if(rp>34&&rp<Math.max(w,h)*1.4){
        ctx.fillStyle='rgba(145,205,180,.72)';ctx.font=this.fnt(7.5,true);ctx.textAlign='center';
        ctx.fillText(`${I.spec.name.toUpperCase()} · ${I.maxNm.toFixed(1)} NM MAX`,own.x,own.y-rp-5*K);
      }
    }
    if(I.pos){
      const q=w2s(I.pos.xNm,I.pos.yNm);
      const col=I.band==='IN'?'rgba(111,224,143,.72)':I.band==='BORDERLINE'?'rgba(245,198,92,.78)':'rgba(239,106,88,.72)';
      ctx.strokeStyle=col;ctx.lineWidth=Math.max(1.2,1.7*K);ctx.setLineDash(I.band==='OUT'?[5,5]:[]);
      ctx.beginPath();ctx.moveTo(own.x,own.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);
      const mx=(own.x+q.x)/2,my=(own.y+q.y)/2;
      const line=I.band==='OUT'
        ?`R ${I.rangeNm.toFixed(1)} · ${I.label}`
        :`R ${I.rangeNm.toFixed(1)} · RUN ${I.runNm.toFixed(1)}/${I.maxNm.toFixed(1)} NM · ${I.label}`;
      ctx.font=this.fnt(8,true);const tw=ctx.measureText(line).width+12*K;
      ctx.fillStyle='rgba(3,13,16,.84)';this.rr(ctx,mx-tw/2,my-10*K,tw,19*K,5*K);ctx.fill();
      ctx.strokeStyle=col;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=col;ctx.textAlign='center';ctx.fillText(line,mx,my+3*K);ctx.textAlign='left';
    }
    ctx.restore();
  }

  drawMapPorts(ctx,ports,w2s){
    for(const port of ports){
      const p=w2s(port.pos.xNm,port.pos.yNm);
      const friendly=port.side==='FRIENDLY';
      const col=friendly?'#7be08f':'#e36b5d';
      const bgCol=friendly?'rgba(123,224,143,0.12)':'rgba(227,107,93,0.12)';

      // Background glow
      ctx.fillStyle=bgCol;
      ctx.beginPath();ctx.arc(p.x,p.y,20,0,Math.PI*2);ctx.fill();

      // Outer ring — clearly different from contact circles (square, not dashed)
      ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([]);
      ctx.strokeRect(p.x-12,p.y-12,24,24);

      // Anchor icon inside
      ctx.fillStyle=col;ctx.font=this.fnt(12,true);ctx.textAlign='center';
      ctx.fillText('⚓',p.x,p.y+5);

      // PORT label — clearly marked
      ctx.font=this.fnt(8.5,true);
      ctx.fillStyle=col;
      ctx.fillText(port.name,p.x,p.y-18);
      ctx.fillStyle='rgba(130,168,154,0.8)';
      ctx.font=this.fnt(7.5);
      ctx.fillText(friendly?'FRIENDLY PORT':'ENEMY PORT',p.x,p.y+22);
      ctx.textAlign='left';
    }
  }

  drawMapPortScenes(ctx,scenes,w2s){
    const K=this.k;for(const scene of scenes){if(!scene.known)continue;const c=w2s(scene.position.xNm,scene.position.yNm),a=degToRad(scene.heading||0),sin=Math.sin(a),cos=Math.cos(a);
      ctx.save();ctx.strokeStyle=scene.side==='FRIENDLY'?'rgba(111,224,143,.38)':'rgba(227,107,93,.38)';ctx.fillStyle='rgba(205,215,190,.30)';ctx.lineWidth=Math.max(1,K);
      for(const f of scene.features||[]){const x=c.x+(sin*f.alongNm+cos*f.lateralNm)*this.zoom,y=c.y+(-cos*f.alongNm+sin*f.lateralNm)*this.zoom;
        if(f.kind==='pier'){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(x,y);ctx.stroke();}
        else{const s=Math.max(2,Math.min(7,(f.sizeM||12)/10*K));ctx.fillRect(x-s*.5,y-s*.35,s,s*.7);}}
      ctx.restore();
    }
  }

  drawMapHarbor(ctx,H,I,w2s,now,campaign=null){
    if(!H) return;
    const K=this.k,c=w2s(H.center.xNm,H.center.yNm), mine=I?.minefield, ch=I?.channel;
    const hasKnowledge=!!I&&(mine?.level!=='NONE'||ch?.level!=='NONE'||I.net?.known||(I.batteries||[]).length);
    const lightActive=(H.searchlightActiveUntil||-1)>(now||0);
    if(!hasKnowledge&&!lightActive&&H.alert<=0) return; // before intel: the port symbol is all the chart knows
    ctx.save();

    // REPORTED / OBSERVED MINEFIELD: deliberately fuzzy knowledge, never the
    // physical mine points and never the exact truth radii from world.harbor.
    // The hand-drawn irregularity is chart language, not hidden mine data: it
    // keeps the harbour from looking like a perfect arcade target while still
    // preserving the same approximate intelligence envelope on every frame.
    if(mine&&mine.level!=='NONE'){
      const observed=mine.level==='OBSERVED';
      const cc=w2s(H.center.xNm+(observed?0:mine.reportCenterDx||0),H.center.yNm+(observed?0:mine.reportCenterDy||0));
      const rin=(observed?mine.observedInnerNm:mine.reportedInnerNm)*this.zoom;
      const rout=(observed?mine.observedOuterNm:mine.reportedOuterNm)*this.zoom;
      const ring=(base,phase)=>{
        const amp=Math.min(5*K,Math.max(1.4*K,base*.012));ctx.beginPath();
        for(let i=0;i<=72;i++){
          const a=i/72*Math.PI*2,w=(Math.sin(a*3+phase)*.54+Math.sin(a*7+phase*1.73)*.29+Math.sin(a*11-phase*.41)*.17)*amp;
          const rr=base+w,x=cc.x+Math.cos(a)*rr,y=cc.y+Math.sin(a)*rr;
          if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }
        ctx.closePath();ctx.stroke();
      };
      ctx.strokeStyle=observed?'rgba(227,107,93,.48)':'rgba(227,107,93,.30)';ctx.lineWidth=Math.max(1,1.25*K);ctx.setLineDash(observed?[7*K,6*K]:[10*K,8*K]);
      ring(rout,.7);ring(rin,2.1);ctx.setLineDash([]);
      // Sparse radial hash marks communicate a dangerous belt without filling
      // the whole harbour centre or implying knowledge of individual mines.
      ctx.strokeStyle=observed?'rgba(227,107,93,.16)':'rgba(227,107,93,.10)';ctx.lineWidth=Math.max(.7,.85*K);
      for(let i=0;i<24;i++){
        const a=(i/24)*Math.PI*2+.11*Math.sin(i*1.7),mid=rin+(rout-rin)*(.34+.30*((i*7)%11)/10),len=Math.min((rout-rin)*.18,10*K);
        const tang=a+.72,x1=cc.x+Math.cos(a)*mid-Math.cos(tang)*len*.5,y1=cc.y+Math.sin(a)*mid-Math.sin(tang)*len*.5,x2=x1+Math.cos(tang)*len,y2=y1+Math.sin(tang)*len;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      }
      ctx.fillStyle=observed?'rgba(227,107,93,.72)':'rgba(227,107,93,.58)';ctx.font=this.fnt(7.5,true);ctx.textAlign='center';
      ctx.fillText(observed?'OBSERVED MINE BELT':'REPORTED MINE BELT',cc.x,cc.y-rout-8*K);
    }

    // A swept approach is intelligence, not a magic green safe rectangle. The
    // dashed outer limits show uncertainty; the much narrower central ribbon
    // is the skipper's best-estimate track. Arrowheads always point INBOUND so
    // the chart immediately answers the practical question: where should I sail?
    // Close reconnaissance tightens the plot, but never reveals the torpedo-net
    // gate until the boat actually sees or contacts the net.
    if(ch&&ch.level!=='NONE'){
      const observed=ch.level==='OBSERVED',bearing=observed?ch.observedBearing:ch.reportedBearing;
      const half=observed?ch.observedHalfWidthNm:ch.reportedHalfWidthNm;
      const r=degToRad(bearing),sx=Math.cos(r),sy=Math.sin(r);
      const point=(along,side)=>({xNm:H.center.xNm+Math.sin(r)*along+sx*side,yNm:H.center.yNm-Math.cos(r)*along+sy*side});
      const inner=observed?1.15:.75,outer=(mine?.level!=='NONE'?(mine.level==='OBSERVED'?mine.observedOuterNm:mine.reportedOuterNm):5.4)+.55;
      const toScreen=p=>w2s(p.xNm,p.yNm),edgeHalf=t=>half*(observed?(.66+.34*t):(.60+.40*t)),coreHalf=t=>edgeHalf(t)*(observed?.48:.34);
      const poly=(widthFn,fill,stroke,dash)=>{
        const N=18,L=[],R=[];
        for(let i=0;i<=N;i++){const t=i/N,a=inner+(outer-inner)*t,w=widthFn(t);L.push(toScreen(point(a,-w)));R.push(toScreen(point(a,w)));}
        ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(1,1.25*K);ctx.setLineDash(dash);
        ctx.beginPath();L.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));for(let i=R.length-1;i>=0;i--)ctx.lineTo(R[i].x,R[i].y);ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
      };
      poly(edgeHalf,observed?'rgba(111,224,143,.025)':'rgba(111,224,143,.016)',observed?'rgba(111,224,143,.42)':'rgba(111,224,143,.24)',observed?[7*K,5*K]:[10*K,8*K]);
      poly(coreHalf,observed?'rgba(111,224,143,.105)':'rgba(111,224,143,.045)',observed?'rgba(111,224,143,.26)':'rgba(111,224,143,.14)',[]);

      // Best-estimate centerline. Small chevrons face towards decreasing
      // 'along' distance (the harbour), so there is no ambiguity about travel.
      const pOuter=toScreen(point(outer,0)),pInner=toScreen(point(inner,0));
      ctx.strokeStyle=observed?'rgba(170,244,194,.74)':'rgba(170,244,194,.42)';ctx.lineWidth=Math.max(1,1.35*K);ctx.setLineDash([3*K,5*K]);ctx.beginPath();ctx.moveTo(pOuter.x,pOuter.y);ctx.lineTo(pInner.x,pInner.y);ctx.stroke();ctx.setLineDash([]);
      for(const t of [.22,.42,.62,.82]){
        const a=outer-(outer-inner)*t,tip=toScreen(point(a,0)),tail=toScreen(point(a+.22,0)),dx=tip.x-tail.x,dy=tip.y-tail.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,back=5.5*K,wing=3.2*K;
        ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*back+nx*wing,tip.y-uy*back+ny*wing);ctx.moveTo(tip.x,tip.y);ctx.lineTo(tip.x-ux*back-nx*wing,tip.y-uy*back-ny*wing);ctx.stroke();
      }
      const labelT=.60,lp=toScreen(point(inner+(outer-inner)*labelT,edgeHalf(labelT)*1.38));ctx.fillStyle=observed?'rgba(151,238,181,.90)':'rgba(151,238,181,.64)';ctx.font=this.fnt(7.2,true);ctx.textAlign='center';
      ctx.fillText(observed?'OBSERVED SWEPT APPROACH':'REPORTED SWEPT APPROACH · APPROX',lp.x,lp.y-3*K);
      ctx.font=this.fnt(6.4,true);ctx.fillStyle=observed?'rgba(190,246,207,.76)':'rgba(190,246,207,.48)';ctx.fillText('FOLLOW CENTERLINE INBOUND',lp.x,lp.y+7*K);
      if(H.channelDepthFeet){ctx.font=this.fnt(5.8,true);ctx.fillStyle='rgba(157,214,239,.76)';ctx.fillText(`CHARTED PASSAGE · ~${Math.round(H.channelDepthFeet)} FT`,lp.x,lp.y+16*K);}
      if(!I?.net?.known){
        const noteT=.26,np=toScreen(point(inner+(outer-inner)*noteT,-edgeHalf(noteT)*1.72));ctx.fillStyle='rgba(245,198,92,.82)';ctx.font=this.fnt(6.7,true);ctx.textAlign='center';
        ctx.fillText('NET / GATE NOT LOCATED',np.x,np.y);ctx.font=this.fnt(6.0);ctx.fillStyle='rgba(245,198,92,.62)';ctx.fillText('VISUAL RECON REQUIRED',np.x,np.y+9*K);
      }
    }

    // Exact net geometry appears only after visual recognition or close contact.
    // Once known, the opening itself gets a separate green gate marker: the net
    // and the swept mine approach are two different navigation problems.
    if(I?.net?.known){
      const r=degToRad(H.channelBearing),gate={xNm:H.center.xNm+Math.sin(r)*H.netRangeNm,yNm:H.center.yNm-Math.cos(r)*H.netRangeNm},gp=w2s(gate.xNm,gate.yNm);
      const gapHalfDeg=radToDeg(Math.asin(clamp(H.netGapHalfNm/Math.max(.1,H.netRangeNm),0,.95))),step=6,atBearing=b=>{const q=degToRad(b);return w2s(H.center.xNm+Math.sin(q)*H.netRangeNm,H.center.yNm-Math.cos(q)*H.netRangeNm);};
      ctx.strokeStyle='rgba(245,198,92,.84)';ctx.lineWidth=Math.max(2,2.1*K);ctx.beginPath();let open=false;
      for(let a=0;a<=360;a+=step){const mid=normDeg(a-step*.5);if(a>0&&Math.abs(shortDelta(H.channelBearing,mid))<=gapHalfDeg){open=false;continue;}const p=atBearing(a);if(!open){ctx.moveTo(p.x,p.y);open=true;}else ctx.lineTo(p.x,p.y);}ctx.stroke();
      const labelB=normDeg(H.channelBearing+72),netLabel=atBearing(labelB);ctx.fillStyle='rgba(245,198,92,.78)';ctx.font=this.fnt(6.7,true);ctx.textAlign='center';ctx.fillText('OBSERVED TORPEDO NET',netLabel.x,netLabel.y-7*K);
      ctx.strokeStyle='rgba(111,224,143,.94)';ctx.lineWidth=Math.max(1.5,2*K);ctx.beginPath();ctx.arc(gp.x,gp.y,Math.max(4.5*K,5),0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(151,238,181,.95)';ctx.font=this.fnt(7.2,true);ctx.fillText('GATE',gp.x,gp.y+12*K);
    }
    const objectiveId=H.optionalObjectiveId||getCampaignHarborOperationProfile(campaign?.campaignProfileId)?.optionalObjectiveId;
    const harborObj=objectiveId?campaign?.optionalObjectives?.find?.(o=>o.id===objectiveId):null;
    if(harborObj&&!harborObj.done){const r=degToRad(H.channelBearing),a=I?.net?.known?H.netRangeNm:Math.max(2.1,H.mineInnerNm+.2),q=w2s(H.center.xNm+Math.sin(r)*a,H.center.yNm-Math.cos(r)*a);ctx.fillStyle='rgba(245,198,92,.92)';ctx.font=this.fnt(6.4,true);ctx.textAlign='center';ctx.fillText(I?.net?.known?'INTEL OBJECTIVE · PASS GATE':'INTEL OBJECTIVE · ENTRY INSIDE NET REQUIRED',q.x,q.y+24*K);}

    // Battery positions are estimates created by observed fire, never truth
    // locations or weapon-range circles.
    for(const b of I?.batteries||[]){const p=w2s(b.xNm,b.yNm);ctx.strokeStyle='rgba(245,198,92,.70)';ctx.lineWidth=Math.max(1,1.2*K);ctx.beginPath();ctx.moveTo(p.x-4*K,p.y);ctx.lineTo(p.x+4*K,p.y);ctx.moveTo(p.x,p.y-4*K);ctx.lineTo(p.x,p.y+4*K);ctx.stroke();ctx.fillStyle='rgba(245,198,92,.72)';ctx.font=this.fnt(6.8,true);ctx.textAlign='center';ctx.fillText('POSSIBLE BATTERY',p.x,p.y-7*K);}

    // A searchlight is a visible phenomenon, not a chart symbol. Draw its beam
    // only during the actual eight-second sweep state in world.harbor.
    if(lightActive){
      const br=degToRad(H.searchlightBearing||0),wid=degToRad((H.searchlightWidthDeg||14)/2),len=4.4;
      const p1=w2s(H.center.xNm+Math.sin(br-wid)*len,H.center.yNm-Math.cos(br-wid)*len),p2=w2s(H.center.xNm+Math.sin(br+wid)*len,H.center.yNm-Math.cos(br+wid)*len);
      ctx.fillStyle='rgba(255,244,180,.075)';ctx.strokeStyle='rgba(255,244,180,.22)';ctx.lineWidth=Math.max(1,K);ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.fill();ctx.stroke();
    }
    if(H.alert>0){ctx.fillStyle=H.alert>=2?'rgba(239,106,88,.95)':'rgba(245,198,92,.9)';ctx.font=this.fnt(8.5,true);ctx.textAlign='center';ctx.fillText(H.alert>=2?'HARBOR ALARM':'DEFENCES ALERT',c.x,c.y+34*K);}
    ctx.restore();ctx.textAlign='left';
  }

  drawMapTrail(ctx,trail,w2s){
    if(trail.length<2) return;
    ctx.strokeStyle='rgba(123,224,143,0.55)';ctx.lineWidth=2;ctx.beginPath();
    [...trail].reverse().forEach((p,i)=>{const s=w2s(p.xNm,p.yNm);if(i===0)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);});
    ctx.stroke();
  }

  drawMapPlot(ctx,plot,w2s,ownPos,auto){
    if(!plot.length) return;
    const K=this.k;
    if(ownPos){                       // leg from the boat to the first waypoint
      const o=w2s(ownPos.xNm,ownPos.yNm), f=w2s(plot[0].xNm,plot[0].yNm);
      ctx.strokeStyle=auto?'rgba(111,224,143,.55)':'rgba(245,198,92,.35)';
      ctx.lineWidth=Math.max(1.5,2*K);ctx.setLineDash([7,7]);
      ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(f.x,f.y);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.strokeStyle='#f5c65c';ctx.lineWidth=Math.max(1.5,2*K);ctx.setLineDash([6,6]);ctx.beginPath();
    plot.forEach((p,i)=>{const s=w2s(p.xNm,p.yNm);if(i===0)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);});
    ctx.stroke();ctx.setLineDash([]);
    plot.forEach((p,i)=>{
      const s=w2s(p.xNm,p.yNm), r=Math.max(7,9*K);
      ctx.fillStyle='rgba(6,16,20,.75)';ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=i===0&&auto?'#6fe08f':'#f5c65c';ctx.lineWidth=Math.max(1.5,2*K);ctx.stroke();
      ctx.fillStyle=i===0&&auto?'#6fe08f':'#f5c65c';
      ctx.font=this.fnt(9,true);ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(String(i+1),s.x,s.y+0.5);
      ctx.textAlign='left';ctx.textBaseline='alphabetic';
    });
  }

  drawMapDCs(ctx,dcs,w2s){
    for(const dc of dcs){
      const p=w2s(dc.position.xNm,dc.position.yNm);
      ctx.strokeStyle=dc.status==='SINKING'?'#d7f5e7':'#e36b5d';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();
    }
  }

  drawMapTorps(ctx,torps,w2s){
    const K=this.k;
    for(const t of torps){
      const p=w2s(t.position.xNm,t.position.yNm);const r=degToRad(t.heading);
      // wake behind the running fish
      const runPx=Math.min(t.rangeRunNm*this.zoom,140*K);
      ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=Math.max(2,3*K);
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x-Math.sin(r)*runPx,p.y+Math.cos(r)*runPx);ctx.stroke();
      ctx.strokeStyle='#ef6a58';ctx.fillStyle='#ef6a58';ctx.lineWidth=Math.max(1.5,2*K);
      ctx.beginPath();ctx.moveTo(p.x-Math.sin(r)*12*K,p.y+Math.cos(r)*12*K);
      ctx.lineTo(p.x+Math.sin(r)*12*K,p.y-Math.cos(r)*12*K);ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,3*K,0,Math.PI*2);ctx.fill();
      ctx.font=this.fnt(8);ctx.fillText(t.id,p.x+6*K,p.y-6*K);
    }
  }

  drawMapExplosions(ctx,exps,w2s){
    for(const e of exps){
      const p=w2s(e.position.xNm,e.position.yNm);const t=e.ageSec/e.maxAgeSec;const r=8+t*40;
      ctx.strokeStyle=`rgba(227,107,93,${1-t})`;ctx.fillStyle=`rgba(240,195,90,${0.3*(1-t)})`;
      ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=`rgba(240,195,90,${1-t})`;ctx.font='11px Consolas';ctx.fillText(e.label,p.x+r+4,p.y);
    }
  }

  drawContactUncertaintyGlyph(ctx,pe,tr,uncertaintyR,K,isSelected,a,ownScreen){
    const src=tr.positionSource||tr.source||'HYDROPHONE';
    const hydro=src==='HYDROPHONE'||src==='SOUND BEARING';
    const triang=src==='SOUND TRIANGULATION';
    const radar=isElectronicRangeFixSource(src);
    const ang=degToRad(hydro?(tr.bearing||0):(tr.courseEstimate||tr.bearing||0))-Math.PI/2;
    const major=uncertaintyR*(hydro?1.85:triang?1.35:1.05);
    const minor=uncertaintyR*(hydro?.34:triang?.54:.72);
    if(hydro&&ownScreen){
      ctx.save();ctx.strokeStyle=isSelected?'rgba(245,198,92,.28)':`rgba(245,198,92,${a*.09})`;
      ctx.lineWidth=isSelected?Math.max(1.2,1.7*K):Math.max(.75,.95*K);ctx.setLineDash([9*K,9*K]);
      ctx.beginPath();ctx.moveTo(ownScreen.x,ownScreen.y);ctx.lineTo(pe.x,pe.y);ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.translate(pe.x,pe.y);ctx.rotate(ang);
    ctx.fillStyle=isSelected?'rgba(245,198,92,.035)':`rgba(245,198,92,${a*.016})`;
    ctx.strokeStyle=isSelected?'rgba(245,198,92,.52)':`rgba(245,198,92,${a*.25})`;
    ctx.lineWidth=isSelected?Math.max(1,1.3*K):Math.max(.7,.85*K);ctx.setLineDash(hydro?[6*K,7*K]:[4*K,5*K]);
    ctx.beginPath();ctx.ellipse(0,0,major,minor,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    if(radar&&clamp(tr.positionConfidence||0,0,1)>.68){
      const iconType=this._mapIconType(tr.contactType);
      this.shipIcon(ctx,pe.x,pe.y,tr.courseEstimate||0,clamp(13*K,11,24),iconType,
        'rgba(245,198,92,.035)','rgba(245,198,92,.20)',.22);
    }
  }

  _mapIconType(type='MERCHANT'){
    const t=String(type||'MERCHANT').toUpperCase().replace(/\s+/g,'_');
    if(t==='CARRIER')return 'CARRIER';
    if(t==='HEAVY_CRUISER'||t==='CRUISER')return 'CRUISER';
    if(['ESCORT','WARSHIP','PATROL_CRAFT','DESTROYER','KAIBOKAN'].includes(t))return 'ESCORT';
    if(t==='TANKER')return 'TANKER';
    if(t==='SUB')return 'SUB';
    return 'MERCHANT';
  }

  _mapCompactTypeLabel(type='UNKNOWN'){
    const t=String(type||'UNKNOWN').toUpperCase();
    if(t==='MERCHANT') return 'MERCHANT';
    if(t==='CARGO SHIP') return 'CARGO';
    if(t==='TANKER') return 'TANKER';
    if(t==='ESCORT') return 'ESCORT';
    if(t==='PATROL CRAFT') return 'PATROL';
    if(t==='WARSHIP') return 'WARSHIP';
    if(t==='DESTROYER') return 'DESTROYER';
    if(t==='KAIBOKAN') return 'KAIBOKAN';
    if(t==='HEAVY CRUISER'||t==='HEAVY_CRUISER') return 'HEAVY CRUISER';
    if(t==='CARRIER') return 'CARRIER';
    if(t==='UNKNOWN') return 'CONTACT';
    return t.replace(/\s+/g,' ').slice(0,18);
  }

  _mapLabelOverlapArea(a,b){
    const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    return x*y;
  }

  _mapLabelRectFor(anchor,w,h,dx,dy,dist,K){
    let x=anchor.x+dx*dist*K,y=anchor.y+dy*dist*K;
    x+=dx>0.42?3*K:dx<-0.42?-(w+3*K):-(w*0.5);
    y+=dy>0.42?(h*0.15):dy<-0.42?-(h+2*K):-(h*0.45);
    return {x,y,w,h};
  }

  _placeMapLabel(anchor,w,h,K,occupied,selected=false){
    const vp=this._mapViewport||{w:1024,h:768},strategy=String(this.mapLabelStrategy||'HYBRID').toUpperCase();
    const overlapFor=rect=>{let n=0;for(const o of occupied)n+=this._mapLabelOverlapArea(rect,o);return n;};
    const overflowFor=rect=>Math.max(0,4-rect.x)+Math.max(0,4-rect.y)+Math.max(0,rect.x+rect.w-(vp.w-4))+Math.max(0,rect.y+rect.h-(vp.h-4));
    const clampRect=rect=>{rect.x=clamp(rect.x,4,Math.max(4,vp.w-rect.w-4));rect.y=clamp(rect.y,4,Math.max(4,vp.h-rect.h-4));return rect;};

    // Debug comparison strategy 3: two clean filing lanes. It is extremely
    // legible but intentionally included as a comparison rather than default —
    // leader lines become long when a convoy crosses the centre of the chart.
    if(strategy==='LANES'){
      const side=anchor.x<vp.w*.5?'L':'R',x=side==='L'?7:vp.w-w-7;
      let y=clamp(anchor.y-h*.45,7,vp.h-h-7),dir=anchor.y<vp.h*.5?1:-1;
      for(let n=0;n<24;n++){
        const rect={x,y,w,h};if(overlapFor(rect)<1){occupied.push(rect);return rect;}
        y=clamp(y+dir*(h+5*K),7,vp.h-h-7);if((y<=7||y>=vp.h-h-7)&&n>5)dir*=-1;
      }
      const rect=clampRect({x,y,w,h});occupied.push(rect);return rect;
    }

    const baseDirs=[[1,-1],[1,1],[-1,-1],[-1,1],[0,-1],[0,1],[1,0],[-1,0],[.55,-1],[-.55,-1],[.55,1],[-.55,1]];
    const wideDirs=[[1,-.45],[1,.45],[-1,-.45],[-1,.45],[.28,-1],[-.28,-1],[.28,1],[-.28,1],...baseDirs];
    let dirs=baseDirs,radii=selected?[12,20,30,42,56,72]:[12,20,30,42,56];
    if(strategy==='WIDE'||strategy==='HYBRID'){dirs=wideDirs;radii=selected?[12,18,26,36,48,62,78,96]:[12,18,26,36,48,62,78];}
    if(strategy==='HYBRID'&&this._mapLabelDense){
      /* A ten-ship convoy simply cannot be made legible by keeping every label
         within a few pixels of its hull. In dense plots HYBRID searches an
         outer orbit as well. This is still local (unlike LANES at the screen
         edges), but accepts longer hairlines rather than letting text overlap. */
      dirs=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;dirs.push([Math.cos(a),Math.sin(a)]);}
      radii=selected?[24,40,58,80,108,140,176]:[54,74,98,128,162,198];
    }
    if(strategy==='OUTWARD'){
      const sx=anchor.x<vp.w*.5?-1:1,sy=anchor.y<vp.h*.5?-1:1;
      dirs=[[sx,sy],[sx,0],[sx,-sy],[0,sy],[-sx,sy],[0,-sy],[-sx,0],[-sx,-sy],...baseDirs];
      radii=selected?[12,20,30,44,60,80]:[12,20,30,44,60];
    }

    let best=null,bestScore=1e18;
    for(const r of radii)for(const [dx,dy] of dirs){
      const rect=this._mapLabelRectFor(anchor,w,h,dx,dy,r,K),overflow=overflowFor(rect),overlap=overlapFor(rect);
      const midX=rect.x+rect.w*.5,midY=rect.y+rect.h*.5,leader=Math.hypot(midX-anchor.x,midY-anchor.y);
      let score=overlap*15+overflow*280+leader+(dy>0?10:0)+(dx<0?3:0);
      if(strategy==='NEAREST')score=overlap*23+overflow*330+leader*1.55+(dy>0?7:0);
      if(strategy==='OUTWARD'){
        const outX=(anchor.x-vp.w*.5)*(midX-anchor.x),outY=(anchor.y-vp.h*.5)*(midY-anchor.y);
        score=overlap*18+overflow*310+leader*.82-(outX+outY)*.012;
      }
      if(strategy==='HYBRID'){
        // Production default: overlap dominates, but also reserve a small
        // breathing moat around earlier labels and prefer short leaders that
        // point away from the dense centre of the chart.
        let moat=0;const ex={x:rect.x-4*K,y:rect.y-3*K,w:rect.w+8*K,h:rect.h+6*K};
        for(const o of occupied)moat+=this._mapLabelOverlapArea(ex,o);
        const out=(anchor.x-vp.w*.5)*(midX-anchor.x)+(anchor.y-vp.h*.5)*(midY-anchor.y);
        const coversAnchor=anchor.x>=rect.x&&anchor.x<=rect.x+rect.w&&anchor.y>=rect.y&&anchor.y<=rect.y+rect.h;
        const dense=this._mapLabelDense;
        score=overlap*(dense?80:26)+moat*(dense?8:2.8)+overflow*420+leader*(dense?.34:.72)-(out*.010)+(coversAnchor?1200:0)+(dy>0?4:0);
      }
      if(score<bestScore){bestScore=score;best=rect;if(!overlap&&!overflow&&strategy!=='HYBRID'&&leader<38*K)break;}
    }
    if(best){clampRect(best);occupied.push(best);return best;}
    const fallback=clampRect({x:anchor.x+12*K,y:anchor.y-h-8*K,w,h});occupied.push(fallback);return fallback;
  }

  drawScopeFovCue(ctx,state,w2s,w,h){
    const sub=state?.playerSub,T=state?.tactical,K=this.k;
    if(!sub||!T||sub.mode==='SUNK'||(Number(sub.depthFeet)||0)>65)return;
    if(typeof scopeOpticProfile==='function'&&scopeOpticProfile(sub.damage?.periscopeDamage).unusable)return;
    const opt=(typeof SCOPE_OPTICS!=='undefined'&&Array.isArray(SCOPE_OPTICS))
      ?SCOPE_OPTICS[T.periscopeZoom===1?0:1]
      :{fov:T.periscopeZoom===1?32:8,label:T.periscopeZoom===1?'1.5×':'6×'};
    const fov=Number(opt?.fov)||(T.periscopeZoom===1?32:8),bearing=normDeg(Number(T.periscopeBearing)||0);
    const o=w2s(sub.position.xNm,sub.position.yNm);
    if(!Number.isFinite(o.x)||!Number.isFinite(o.y)||o.x<-80*K||o.x>w+80*K||o.y<-80*K||o.y>h+80*K)return;

    // Screen-space radius keeps this a quiet orientation aid at every MAP
    // zoom level. The angular width and bearing are exact; the radius is not
    // intended to imply a detection range.
    const radius=clamp(2.6*this.zoom,64*K,Math.min(w,h)*.34);
    const a0=degToRad(bearing-fov*.5-90),a1=degToRad(bearing+fov*.5-90),ac=degToRad(bearing-90);
    const ex=o.x+Math.cos(ac)*radius,ey=o.y+Math.sin(ac)*radius;
    ctx.save();
    ctx.fillStyle='rgba(111,224,143,.025)';
    ctx.strokeStyle='rgba(111,224,143,.20)';ctx.lineWidth=Math.max(.7,.9*K);
    ctx.setLineDash([4*K,6*K]);
    ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.arc(o.x,o.y,radius,a0,a1,false);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.setLineDash([]);ctx.strokeStyle='rgba(111,224,143,.34)';ctx.lineWidth=Math.max(.8,1.05*K);
    ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(ex,ey);ctx.stroke();
    if(radius>72*K){
      const label=`SCOPE ${opt?.label||''} · ${Math.round(fov)}°`;
      ctx.font=this.fnt(7.2,true);ctx.textAlign='center';ctx.fillStyle='rgba(155,224,181,.66)';
      ctx.fillText(label,o.x+Math.cos(ac)*radius*.76,o.y+Math.sin(ac)*radius*.76-4*K);
      ctx.textAlign='left';
    }
    ctx.restore();
  }

  drawMapContacts(ctx,tracks,w2s,now,ownPos,selId,state=null){
    const K=this.k;this.mapLabelStrategy=this.mapLabelStrategy||'HYBRID';
    // Labels are allowed to move; fixed HUD text is not. Reserving the small
    // navigation panel prevents the solver from finding a mathematically empty
    // but visually unreadable slot underneath it.
    this._mapLabelRects=[{x:0,y:0,w:Math.min(this._mapViewport?.w||220,214*K),h:70*K,reserved:true},...(this._mapFixedLabelRects||[])];
    const visible=Object.values(tracks).filter(q=>!q.sunk),dense=visible.length>=4;
    this._mapLabelDense=visible.length>=6;
    const contactById=state?new Map((state.world.contacts||[]).filter(c=>!c.sunk).map(c=>[c.id,c])):null;
    /* Hull symbols are also reserved space. A label that avoids every other
       label can still be unreadable if it sits directly over three convoy
       symbols; reserve a small box around every known plot before placement. */
    if(this._mapLabelDense){
      for(const tr of visible){
        const c=contactById?.get(tr.id),live=!!(state&&c&&typeof crewCanSeeSurfaceHull==='function'&&crewCanSeeSurfaceHull(state,c));
        const wp=live?c.position:(tr.plotPosition||tr.lastFixPosition);if(!wp)continue;
        const p=w2s(wp.xNm,wp.yNm),q=9*K;this._mapLabelRects.push({x:p.x-q,y:p.y-q,w:q*2,h:q*2,reserved:true});
      }
    }
    const ordered=[...Object.values(tracks)].sort((a,b)=>((b.id===selId)-(a.id===selId))||((b.visualHullConfirmed?1:0)-(a.visualHullConfirmed?1:0))||((b.confidence||0)-(a.confidence||0))||String(a.id).localeCompare(String(b.id)));
    for(const tr of ordered){
      if(tr.sunk){                                   // a wreck: fixed, silent, no solution
        const wp=tr.plotPosition||tr.lastFixPosition;
        if(!wp) continue;
        const p=w2s(wp.xNm,wp.yNm);
        ctx.strokeStyle='rgba(150,175,170,.75)';ctx.lineWidth=Math.max(1.5,2*K);
        const q=6*K;
        ctx.beginPath();
        ctx.moveTo(p.x-q,p.y-q);ctx.lineTo(p.x+q,p.y+q);
        ctx.moveTo(p.x+q,p.y-q);ctx.lineTo(p.x-q,p.y+q);ctx.stroke();
        ctx.fillStyle='rgba(150,175,170,.8)';ctx.font=this.fnt(8);
        ctx.fillText(`${tr.id} SUNK`,p.x+10*K,p.y+3*K);
        continue;
      }
      const conf=tr.confidence;
      const posConf=clamp(Number.isFinite(tr.positionConfidence)?tr.positionConfidence:conf,0,1);
      const a=clamp(0.25+conf*0.75,0.2,1);
      const isSelected=tr.id===selId;

      // Absolute paper-plot position. If this is a stale contact it has been
      // dead-reckoned from the LAST FIX; it never moves merely because ownship moved.
      const bRad=degToRad(tr.bearing);
      const contact=contactById?.get(tr.id)||null;
      const fallbackVisual=tr.visualHullConfirmed===undefined?(tr.positionSource==='VISUAL'||tr.source==='VISUAL'):!!tr.visualHullConfirmed;
      const liveVisual=!!(state&&typeof crewCanSeeSurfaceHull==='function'&&contact&&crewCanSeeSurfaceHull(state,contact));
      const hasTruePos=state?liveVisual:fallbackVisual;
      // While the crew can resolve the hull, draw the actual world position —
      // no remembered acoustic/radar plot is allowed to displace a ship that is
      // plainly visible. The moment visual range is lost, fall back to the paper
      // plot and its uncertainty glyph. Direct legacy renderer tests that do not
      // pass full state keep the old plot-position contract.
      const est=liveVisual?contact.position:(tr.plotPosition||{xNm:ownPos.xNm+Math.sin(bRad)*tr.rangeEstimateNm,
                 yNm:ownPos.yNm-Math.cos(bRad)*tr.rangeEstimateNm});
      const pe=w2s(est.xNm,est.yNm);
      const pt=hasTruePos?pe:null;

      const sensorUncPx=Number.isFinite(tr.positionUncertaintyNm)?tr.positionUncertaintyNm*this.zoom:0;
      const uncertaintyR=clamp(Math.max(10+(1-posConf)*30,sensorUncPx)+Math.min(36,(tr.staleSeconds||0)*0.06),8,72)*K;
      const ownScreen=w2s(ownPos.xNm,ownPos.yNm);

      if(pt){
        // Acquisition is a symbol transition, not a 150-knot lateral manoeuvre.
        const transAge=Number.isFinite(tr.visualTransitionAt)?now-tr.visualTransitionAt:99;
        if(tr.visualTransitionFrom&&transAge>=0&&transAge<.45){
          const gp=w2s(tr.visualTransitionFrom.xNm,tr.visualTransitionFrom.yNm),fade=1-transAge/.45;
          this.drawContactUncertaintyGlyph(ctx,gp,{...tr,positionSource:tr.visualTransitionSource||'HYDROPHONE'},
            Math.max(12*K,(tr.visualTransitionUncertaintyNm||.25)*this.zoom*K),K,false,a*fade,ownScreen);
        }
        const iconType=this._mapIconType(tr.contactType),isEsc=['ESCORT','CRUISER','CARRIER'].includes(iconType);
        /* Red means an observed immediate prosecution, not merely "enemy".
           A confirmed hostile escort that is unaware/searching stays amber;
           only behaviour the crew can actually see may promote it to red. */
        const activeThreat=tr.affiliation==='ENEMY'&&isEsc&&liveVisual&&state?.world?.enemy?.alertState==='ATTACKING'&&
          (contact?.aswRole==='PROSECUTOR'||contact?.sonarContact||state.world.enemy.visualOnSub);
        const shipCol=tr.affiliation==='FRIENDLY'?'#6fe08f':tr.affiliation==='NEUTRAL'?'#9ec9d3':activeThreat?'#ef6a58':isEsc?'#e6a055':'#f5c65c';
        if(isSelected)this.courseVector(ctx,pt,tr.courseEstimate,tr.speedEstimateKnots,w2s,est,
          '#6fe08f',K,`${fmtDeg(tr.courseEstimate)} · ${tr.speedEstimateKnots.toFixed(0)}kn`);
        const lenNm=shipVisualLengthNm(tr,isEsc?300:450);
        const iconLen=clamp(lenNm*this.zoom,15*K,52*K);
        if(isSelected){ctx.strokeStyle='rgba(111,224,143,.8)';ctx.lineWidth=Math.max(1.5,2*K);ctx.beginPath();ctx.arc(pt.x,pt.y,iconLen*.8,0,Math.PI*2);ctx.stroke();}
        this.shipIcon(ctx,pt.x,pt.y,tr.courseEstimate,iconLen,iconType,shipCol,
          isSelected?'#eafff0':'rgba(12,20,18,.9)',clamp(a,0.45,1));
        if(isSelected&&Math.abs(tr.turnRateEstimateDegSec||0)>.12)this.turnCue(ctx,pt.x,pt.y,tr.courseEstimate,iconLen,tr.turnRateEstimateDegSec,'#6fe08f');
      }else{
        this.drawContactUncertaintyGlyph(ctx,pe,tr,uncertaintyR,K,isSelected,a,ownScreen);
        // Course is advisory for a plot, not a drawn hull trajectory.
        if(isSelected&&Number.isFinite(tr.courseEstimate)&&!(tr.positionSource==='HYDROPHONE'||tr.positionSource==='SOUND BEARING')){
          const cRad=degToRad(tr.courseEstimate);ctx.strokeStyle=isSelected?'rgba(245,198,92,.75)':`rgba(245,198,92,${a*.48})`;ctx.lineWidth=Math.max(1,K);
          ctx.beginPath();ctx.moveTo(pe.x,pe.y);ctx.lineTo(pe.x+Math.sin(cRad)*18*K,pe.y-Math.cos(cRad)*18*K);ctx.stroke();
        }
      }

      // Keep a busy convoy readable. Unselected contacts use one compact
      // line in dense plots; the selected contact alone gets the full working
      // data. Labels are moved to the first free nearby slot and joined by a
      // hairline instead of painting opaque cards over one another.
      const labelPos=pt||pe;
      this._mapLabelRects=this._mapLabelRects||[];
      const stale=Math.floor(now-(Number.isFinite(tr.positionFixAt)?tr.positionFixAt:tr.lastUpdated));
      const aff=tr.affiliation&&tr.affiliation!=='ENEMY'?String(tr.affiliation).toUpperCase():'';
      const rawType=String(tr.typeEstimate||'UNKNOWN'),compactType=this._mapCompactTypeLabel(rawType);
      // Keep affiliation and vessel class separate. Older traffic definitions
      // used displayType='FRIENDLY TRANSPORT', which produced the comic
      // 'FRIENDLY FRIENDLY TRANSPORT' once the visual watch identified side.
      const affPrefix=(aff&&!rawType.toUpperCase().startsWith(aff))?aff+' ':'';
      const compactAff=(aff&&!String(compactType).toUpperCase().startsWith(aff))?aff+' ':'';
      const title=isSelected?`${tr.id} ${affPrefix}${rawType}`:`${tr.id} ${dense?compactType:(compactAff+compactType)}`;
      const lines=[title.trim()];
      if(isSelected&&liveVisual&&contact){
        const visualRange=distNm(ownPos,contact.position),visualBearing=bearingBetween(ownPos,contact.position);
        lines.push(`VISUAL · BRG ${fmtDeg(visualBearing)} · R ${visualRange.toFixed(1)} NM`);
        // Tiny craft can be physically visible yet only a few pixels long in
        // the 1.5× search optic. Give a restrained crew hint rather than
        // pretending the contact is uncertain or invisible on MAP.
        const lenM=shipVisualLengthM(contact,180);
        const angularDeg=visualRange>.02?radToDeg(Math.atan2(lenM,visualRange*NM_M)):99;
        if(lenM<=40&&angularDeg<1.2&&(state?.tactical?.periscopeZoom??1)===1)lines.push('SMALL CRAFT · 6× RECOMMENDED');
      }else if(isSelected){const sourceLabel=contactFixSourceDisplayLabel(state,tr.source);lines.push(`${sourceLabel} C${Math.round(conf*100)}% ${stale}s · ${tr.rangeEstimateNm.toFixed(1)}nm`);}
      else if(!dense&&!hasTruePos){const sourceLabel=contactFixSourceDisplayLabel(state,tr.source);lines.push(`${sourceLabel} C${Math.round(conf*100)}%`);}
      if(isSelected&&tr.damageEstimate)lines.push(tr.damageEstimate);
      const fs=isSelected?10.2:8.2, lh=(isSelected?12:10)*K;
      ctx.font=this.fnt(fs,true);
      const tw=Math.max(...lines.map(x=>ctx.measureText?ctx.measureText(x).width:x.length*fs*6*K));
      const th=lines.length*lh;
      const rect=this._placeMapLabel(labelPos,tw,th+2*K,K,this._mapLabelRects,isSelected);
      const lx=rect.x,ly=rect.y+lh;
      const leadX=rect.x+Math.min(rect.w-4,Math.max(4,labelPos.x-rect.x)),leadY=rect.y+Math.min(rect.h-4,Math.max(4,labelPos.y-rect.y));
      if(Math.hypot(leadX-labelPos.x,leadY-labelPos.y)>16*K){ctx.strokeStyle=`rgba(245,198,92,${isSelected?'.44':'.18'})`;ctx.lineWidth=Math.max(.6,.8*K);ctx.beginPath();ctx.moveTo(labelPos.x,labelPos.y);ctx.lineTo(leadX,leadY);ctx.stroke();}
      for(let li=0;li<lines.length;li++){
        const damage=isSelected&&li===lines.length-1&&tr.damageEstimate;
        ctx.fillStyle=damage&&(tr.damageEstimate==='BURNING'||tr.damageEstimate==='FOUNDERING')?'rgba(239,106,88,.96)':`rgba(245,198,92,${isSelected?1:Math.max(.62,a*.82)})`;
        ctx.font=this.fnt(li===0?fs:(fs-1),li===0||!!damage);ctx.fillText(lines[li],lx,ly+li*lh);
      }
    }
  }

  /* ── Top-down ship icons. Bow points up in local space, then rotated to
     the ship's heading. Size follows the zoom but never drops below a
     readable minimum, so the plot works at every scale. ── */
  shipIcon(ctx,x,y,hdgDeg,lenPx,type,fill,stroke,alpha=1){
    const L=lenPx, B=L*(type==='ESCORT'?0.17:type==='CRUISER'?0.20:type==='CARRIER'?0.24:type==='TANKER'?0.20:0.24);
    ctx.save();
    ctx.translate(x,y);ctx.rotate(degToRad(hdgDeg));
    ctx.globalAlpha=alpha;
    ctx.lineJoin='round';
    ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(0.8,L*0.035);
    // hull outline
    ctx.beginPath();
    if(type==='SUB'){
      ctx.moveTo(0,-L*0.50);
      ctx.quadraticCurveTo(B*0.62,-L*0.28,B*0.50,L*0.10);
      ctx.quadraticCurveTo(B*0.42,L*0.44,0,L*0.50);
      ctx.quadraticCurveTo(-B*0.42,L*0.44,-B*0.50,L*0.10);
      ctx.quadraticCurveTo(-B*0.62,-L*0.28,0,-L*0.50);
    }else if(type==='CARRIER'){
      ctx.moveTo(-B*.54,-L*.48);ctx.lineTo(B*.54,-L*.48);ctx.lineTo(B*.50,L*.48);ctx.lineTo(-B*.50,L*.48);
    }else if(type==='CRUISER'){
      ctx.moveTo(0,-L*0.50);
      ctx.quadraticCurveTo(B*.82,-L*.18,B*.58,L*.31);ctx.lineTo(B*.42,L*.50);ctx.lineTo(-B*.42,L*.50);
      ctx.quadraticCurveTo(-B*.58,L*.31,-B*.82,-L*.18);ctx.quadraticCurveTo(-B*.44,-L*.38,0,-L*.50);
    }else if(type==='ESCORT'){
      ctx.moveTo(0,-L*0.50);
      ctx.quadraticCurveTo(B*0.78,-L*0.16,B*0.52,L*0.30);
      ctx.lineTo(B*0.40,L*0.50);ctx.lineTo(-B*0.40,L*0.50);
      ctx.quadraticCurveTo(-B*0.52,L*0.30,-B*0.78,-L*0.16);
      ctx.quadraticCurveTo(-B*0.40,-L*0.36,0,-L*0.50);
    }else{
      ctx.moveTo(0,-L*0.50);
      ctx.quadraticCurveTo(B*0.86,-L*0.24,B*0.50,L*0.16);
      ctx.lineTo(B*0.46,L*0.46);ctx.lineTo(-B*0.46,L*0.46);
      ctx.lineTo(-B*0.50,L*0.16);
      ctx.quadraticCurveTo(-B*0.86,-L*0.24,0,-L*0.50);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
    // deck detail once the icon is big enough to carry it
    if(L>17){
      ctx.fillStyle=stroke;
      if(type==='SUB'){
        ctx.fillRect(-B*0.17,-L*0.12,B*0.34,L*0.24);            // conning tower
        ctx.fillRect(-B*0.46,L*0.30,B*0.92,Math.max(0.8,L*0.03)); // stern planes
      }else if(type==='CARRIER'){
        ctx.fillRect(B*.12,-L*.08,B*.24,L*.36);                  // island
        ctx.fillRect(-B*.38,-L*.34,B*.76,Math.max(.8,L*.025));   // flight deck mark
      }else if(type==='CRUISER'){
        ctx.fillRect(-B*.28,-L*.08,B*.56,L*.22);                 // superstructure
        for(const yy of [-L*.31,L*.28]){ctx.beginPath();ctx.arc(0,yy,Math.max(1,L*.055),0,Math.PI*2);ctx.fill();}
      }else if(type==='ESCORT'){
        ctx.fillRect(-B*0.24,-L*0.10,B*0.48,L*0.22);            // bridge
        ctx.fillRect(-B*0.16,L*0.24,B*0.32,L*0.12);             // aft mount
      }else if(type==='TANKER'){
        ctx.fillRect(-B*0.34,L*0.22,B*0.68,L*0.20);             // aft house
        ctx.fillRect(-B*0.06,-L*0.30,B*0.12,L*0.52);            // catwalk
      }else{
        ctx.fillRect(-B*0.34,-L*0.10,B*0.68,L*0.26);            // midships house
        ctx.fillRect(-B*0.26,L*0.26,B*0.52,L*0.14);             // poop
      }
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  turnCue(ctx,x,y,hdgDeg,lenPx,rateDegSec,color){
    const L=lenPx,side=rateDegSec>=0?1:-1;
    ctx.save();ctx.translate(x,y);ctx.rotate(degToRad(hdgDeg));
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,L*.035);
    const r=Math.max(7,L*.46),cx=side*r*.36,cy=-L*.12;
    const a0=side>0?-2.35:-.79,a1=side>0?-.75:-2.39;
    ctx.beginPath();ctx.arc(cx,cy,r,a0,a1,side<0);ctx.stroke();
    const ex=cx+Math.cos(a1)*r,ey=cy+Math.sin(a1)*r,ang=a1+(side>0?Math.PI/2:-Math.PI/2),ah=Math.max(3,L*.10);
    ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(ang-.55)*ah,ey-Math.sin(ang-.55)*ah);ctx.lineTo(ex-Math.cos(ang+.55)*ah,ey-Math.sin(ang+.55)*ah);ctx.closePath();ctx.fill();
    ctx.restore();
  }

  /* ── Course-and-speed vector: length is where the ship will be in six
     minutes, so a long arrow literally means a fast ship. ── */
  courseVector(ctx,p,hdgDeg,speedKn,w2s,posNm,color,K,label){
    const mins=6;
    const distNmAhead=Math.max(speedKn*mins/60,0.05);
    const rad=degToRad(hdgDeg);
    const end=w2s(posNm.xNm+Math.sin(rad)*distNmAhead,posNm.yNm-Math.cos(rad)*distNmAhead);
    const dx=end.x-p.x, dy=end.y-p.y, len=Math.hypot(dx,dy);
    if(len<4) return;
    const ux=dx/len, uy=dy/len;
    ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.2,1.8*K);
    ctx.beginPath();ctx.moveTo(p.x+ux*6*K,p.y+uy*6*K);ctx.lineTo(end.x,end.y);ctx.stroke();
    // arrowhead
    const ah=Math.max(4,6*K);
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.moveTo(end.x,end.y);
    ctx.lineTo(end.x-ux*ah-uy*ah*0.5,end.y-uy*ah+ux*ah*0.5);
    ctx.lineTo(end.x-ux*ah+uy*ah*0.5,end.y-uy*ah-ux*ah*0.5);
    ctx.closePath();ctx.fill();
    // minute ticks along the vector
    if(len>26*K){
      ctx.lineWidth=Math.max(1,1.2*K);
      for(let m=2;m<mins;m+=2){
        const f=m/mins;
        const tx=p.x+dx*f, ty=p.y+dy*f, t=3*K;
        ctx.beginPath();ctx.moveTo(tx-uy*t,ty+ux*t);ctx.lineTo(tx+uy*t,ty-ux*t);ctx.stroke();
      }
    }
    if(label&&len>18*K){
      ctx.fillStyle=color;ctx.font=this.fnt(7.5,true);
      ctx.textAlign=ux>=0?'left':'right';
      ctx.fillText(label,end.x+ux*7*K,end.y+uy*7*K+2*K);
      ctx.textAlign='left';
    }
  }

  drawMapOwnship(ctx,sub,w2s){
    const p=w2s(sub.position.xNm,sub.position.yNm);const K=this.k;
    if(sub.inShallowWater){
      ctx.fillStyle='rgba(245,198,92,0.12)';ctx.beginPath();ctx.arc(p.x,p.y,30*K,0,Math.PI*2);ctx.fill();
    }
    const col=sub.mode==='SUNK'?'#ef6a58':'#6fe08f';
    // ordered heading as a ghost line while the boat is still swinging round
    if(Math.abs(shortDelta(sub.heading,sub.orderedHeading))>2){
      const r=degToRad(sub.orderedHeading);
      ctx.strokeStyle='rgba(245,198,92,.45)';ctx.lineWidth=Math.max(1,1.4*K);ctx.setLineDash([4,5]);
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x+Math.sin(r)*34*K,p.y-Math.cos(r)*34*K);ctx.stroke();ctx.setLineDash([]);
    }
    this.courseVector(ctx,p,sub.heading,sub.propulsion.speedKnots,w2s,sub.position,
      'rgba(111,224,143,.85)',K,`${fmtDeg(sub.heading)} · ${sub.propulsion.speedKnots.toFixed(1)}kn`);
    const len=clamp(0.09*this.zoom,17*K,54*K);          // ~300 ft boat, true to scale when zoomed in
    ctx.shadowColor='rgba(111,224,143,.7)';ctx.shadowBlur=7*K;
    this.shipIcon(ctx,p.x,p.y,sub.heading,len,'SUB',col,'#04120f');
    ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(111,224,143,0.22)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(p.x,p.y,48*K,0,Math.PI*2);ctx.stroke();
  }

  screenToWorldMap(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();
    const sx=(clientX-rect.left)*(this.w/(rect.width||this.w));
    const sy=(clientY-rect.top)*(this.h/(rect.height||this.h));
    return{xNm:this.mapCenter.xNm+(sx-this.w/2)/this.zoom,
           yNm:this.mapCenter.yNm+(sy-this.h/2)/this.zoom};
  }
  // local (CSS-pixel) coordinates inside the canvas
  toLocal(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();
    return{x:(clientX-rect.left)*(this.w/(rect.width||this.w)),
           y:(clientY-rect.top)*(this.h/(rect.height||this.h))};
  }
  // zoom around a screen point so pinch feels anchored
  zoomAt(factor,clientX,clientY){
    const before=this.screenToWorldMap(clientX,clientY);
    this.zoom=clamp(this.zoom*factor,this.minZoom,this.maxZoom);
    const after=this.screenToWorldMap(clientX,clientY);
    this.mapCenter.xNm+=before.xNm-after.xNm;
    this.mapCenter.yNm+=before.yNm-after.yNm;
    if(Math.abs(before.xNm-after.xNm)>1e-9||Math.abs(before.yNm-after.yNm)>1e-9) this.follow=false;
  }
  panBy(dxPx,dyPx){
    this.mapCenter.xNm-=dxPx/this.zoom;
    this.mapCenter.yNm-=dyPx/this.zoom;
    this.follow=false;
  }
  recenter(sub){
    // A chart-table centre button is a one-shot reposition, not a camera lock.
    // Ownship must continue to travel across a fixed map after startup/centring.
    this.follow=false;this.mapCenter.xNm=sub.position.xNm;this.mapCenter.yNm=sub.position.yNm;
  }
  // nearest contact track to a tap on the map (returns id or null)
  pickTrack(state,clientX,clientY){
    const p=this.toLocal(clientX,clientY);
    const cx=this.w/2, cy=this.h/2;
    let best=null,bd=Infinity;
    const own=state.playerSub.position;
    for(const tr of Object.values(state.world.contactTracks)){
      const bRad=degToRad(tr.bearing);
      const pos=tr.plotPosition||
        {xNm:own.xNm+Math.sin(bRad)*tr.rangeEstimateNm,yNm:own.yNm-Math.cos(bRad)*tr.rangeEstimateNm};
      const sx=cx+(pos.xNm-this.mapCenter.xNm)*this.zoom;
      const sy=cy+(pos.yNm-this.mapCenter.yNm)*this.zoom;
      const d=Math.hypot(sx-p.x,sy-p.y);
      if(d<bd){bd=d;best=tr.id;}
    }
    return bd<Math.max(34,40*this.k)?best:null;
  }
  // waypoint under the finger on the map (returns index or -1)
  pickWaypoint(state,clientX,clientY){
    const p=this.toLocal(clientX,clientY);
    const cx=this.w/2, cy=this.h/2;
    let best=-1,bd=Infinity;
    state.map.plottedCourse.forEach((wp,i)=>{
      const sx=cx+(wp.xNm-this.mapCenter.xNm)*this.zoom;
      const sy=cy+(wp.yNm-this.mapCenter.yNm)*this.zoom;
      const d=Math.hypot(sx-p.x,sy-p.y);
      if(d<bd){bd=d;best=i;}
    });
    return bd<Math.max(30,36*this.k)?best:-1;
  }

  // nearest visible ship to a tap in the gun view (returns track id or null)
  pickGunContact(state,clientX,clientY){
    const p=this.toLocal(clientX,clientY),cam=this.gunCam;if(!cam)return null;
    let best=null,bd=Infinity;
    for(const c of state.world.contacts){
      if(c.sunk)continue;const scr=this.proj(cam,c.position.xNm*NM_M,-c.position.yNm*NM_M,5);if(!scr)continue;
      const d=Math.hypot(scr.x-p.x,(scr.y-p.y)*0.7);if(d<bd){bd=d;best=c.id;}
    }
    return bd<Math.max(50,65*this.k)?best:null;
  }

  // nearest visible ship to a tap in the periscope view (returns track id or null)
  pickScopeContact(state,clientX,clientY){
    const p=this.toLocal(clientX,clientY);
    const cam=this.cam;
    if(!cam) return null;
    const fov=SCOPE_OPTICS[state.tactical.periscopeZoom===1?0:1].fov;
    let best=null,bd=Infinity;
    // Prefer a real hull only when the same canonical visual test says the
    // periscope can actually resolve it. A tap on that hull can then become a
    // VISUAL map fix instead of selecting an unrelated hydrophone plot.
    for(const c of state.world.contacts){
      if(c.sunk&&(c.sinkingProgress??0)>=1) continue;
      if(typeof scopeCanResolveHull==='function'&&!scopeCanResolveHull(state,c,{fovPad:.60}))continue;
      const scr=this.proj(cam,c.position.xNm*NM_M,-c.position.yNm*NM_M,0);
      if(!scr) continue;
      const d=Math.abs(scr.x-p.x);
      if(d<bd){bd=d;best=c.id;}
    }
    if(best===null){
      for(const tr of Object.values(state.world.contactTracks)){
        if(tr.confidence<0.12||tr.sunk) continue;
        const bd2=shortDelta(state.tactical.periscopeBearing,tr.bearing);
        if(Math.abs(bd2)>fov/2) continue;
        const x=cam.cx+Math.tan(degToRad(bd2))*cam.f;
        const d=Math.abs(x-p.x);
        if(d<bd){bd=d;best=tr.id;}
      }
    }
    return bd<Math.max(46,60*this.k)?best:null;
  }
}
