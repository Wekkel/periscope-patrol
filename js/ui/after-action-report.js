// ═══════════════════════════════════════════════════ AFTER ACTION REPORT UI
// Static canvas redraws only on open/timeline/toggle/play ticks; it has no RAF.
// The replay camera is deliberately low-cost: a single 2-D transform follows
// the patrol, widens in transit and crash-zooms key events. No second renderer.
class AfterActionReport{
  constructor(game){
    this.game=game;this.record=null;this.intel=false;this.playTimer=null;this._preScale=null;this.completedOpen=false;
    this._playHoldTicks=0;this._playMoment=null;this.cameraMode='AUTO';this.cameraZoom=1;this.camera=null;
    this.overlay=document.getElementById('aarOverlay');this.canvas=document.getElementById('aarCanvas');this.ctx=this.canvas?.getContext?.('2d')||null;
    document.getElementById('aarClose')?.addEventListener('click',()=>this.close(false));
    document.getElementById('aarContinue')?.addEventListener('click',()=>this.close(true));
    document.getElementById('aarIntel')?.addEventListener('click',()=>{this.intel=!this.intel;this.refreshIntelLabel();this.draw();});
    document.getElementById('aarTimeline')?.addEventListener('input',()=>{this._playMoment=null;this.draw();});
    document.getElementById('aarPlay')?.addEventListener('click',()=>this.togglePlay());
    document.getElementById('aarZoomIn')?.addEventListener('click',()=>{this.cameraZoom=Math.min(4,this.cameraZoom*1.35);this.camera=null;this.draw();});
    document.getElementById('aarZoomOut')?.addEventListener('click',()=>{this.cameraZoom=Math.max(.45,this.cameraZoom/1.35);this.camera=null;this.draw();});
    document.getElementById('aarFit')?.addEventListener('click',()=>{this.cameraMode='FIT';this.cameraZoom=1;this.camera=null;this.refreshCameraButtons();this.draw();});
    document.getElementById('aarAutoCam')?.addEventListener('click',()=>{this.cameraMode='AUTO';this.camera=null;this.refreshCameraButtons();this.draw();});
    window.addEventListener?.('resize',()=>{if(this.overlay?.classList.contains('open')){this.camera=null;this.draw();}},{passive:true});
  }

  open(record,opts={}){
    if(!record)return;this.stopPlay();this.record=JSON.parse(JSON.stringify(record));this.intel=false;this.completedOpen=!!opts.completed;
    this._playHoldTicks=0;this._playMoment=null;this.cameraMode='AUTO';this.cameraZoom=1;this.camera=null;
    const s=this.game?.getSnapshot?.();if(s?.time){this._preScale=s.time.timeScale;s.time.timeScale=0;}
    this.renderHeader();this.renderStats();this.renderLog();
    const slider=document.getElementById('aarTimeline'),dur=Math.max(1,Math.round(this.record.durationSeconds||this.record.replay?.route?.at?.(-1)?.[0]||1));
    if(slider){slider.max=String(dur);slider.value=String(dur);slider.step='1';}
    const cont=document.getElementById('aarContinue');if(cont)cont.textContent=this.completedOpen?'CONTINUE TO WAR RECORD':'CLOSE REPORT';
    this.refreshIntelLabel();this.refreshCameraButtons();this.overlay?.classList.add('open');this.draw();
  }

  close(toCareer=false){
    this.stopPlay();this.overlay?.classList.remove('open');
    const s=this.game?.getSnapshot?.();
    if(!this.completedOpen&&s?.time&&this._preScale!=null)s.time.timeScale=this._preScale;
    this._preScale=null;const wasCompleted=this.completedOpen;this.completedOpen=false;
    if(toCareer&&wasCompleted&&typeof sceneSelector!=='undefined'){
      sceneSelector.open();const tab=document.querySelector?.('.scen-tab[data-stab="career"]');tab?.click?.();
    }
  }

  renderHeader(){
    const r=this.record,t=document.getElementById('aarTitle'),d=document.getElementById('aarDates');
    if(t)t.textContent=`PATROL ${r.patrolNumber||'?'} — ${String(r.area||'UNKNOWN').toUpperCase()}`;
    if(d)d.textContent=this.dateRange(r.startDate,r.endDate);
  }
  dateRange(a,b){
    const parse=x=>{const m=String(x||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;},A=parse(a),B=parse(b),mons=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    if(!A&&!B)return'';if(!B)return`${A.d} ${mons[A.m-1]} ${A.y}`;if(!A)return`${B.d} ${mons[B.m-1]} ${B.y}`;
    return A.y===B.y?`${A.d} ${mons[A.m-1]} – ${B.d} ${mons[B.m-1]} ${B.y}`:`${A.d} ${mons[A.m-1]} ${A.y} – ${B.d} ${mons[B.m-1]} ${B.y}`;
  }
  renderStats(){
    const r=this.record,el=document.getElementById('aarStats');if(!el)return;
    const stats=[
      [`${r.shipsSunk||0} ships sunk`,`${Number(r.tonnage||0).toLocaleString()} tons`],
      [`${r.shipsDamaged||0} damaged`,r.shipsDamaged?'probable':'—'],
      ['Torpedoes',`${r.torpedoesFired||0} fired / ${r.torpedoHits||0} hits / ${r.torpedoDuds||0} duds`],
      ['Deck gun',`${r.deckGunRounds||0} rounds / ${r.deckGunHits||0} hits`],
      ['Aircraft evaded',String(r.aircraftEvaded||r.replay?.aircraftEvaded||0)],
      ['Hull on return',`${Math.round(r.hullAtEnd??100)}%`]
    ];
    el.innerHTML=stats.map(([a,b])=>`<div class="aar-stat"><strong>${a}</strong><span>${b}</span></div>`).join('');
  }
  renderLog(){
    const el=document.getElementById('aarCaptainLog');if(!el)return;const ev=this.record.importantEvents||[];
    el.innerHTML=ev.length?ev.map(x=>`<div class="aar-log-row"><span>${x.date||this.fmtT(x.t)}</span><b>${x.text||x.type}</b></div>`).join(''):'<div class="aar-log-row"><b>No Captain\'s Log entries.</b></div>';
  }
  refreshIntelLabel(){
    const b=document.getElementById('aarIntel'),l=document.getElementById('aarIntelLegend');if(b)b.textContent=this.intel?'HIDE INTELLIGENCE PICTURE':'SHOW INTELLIGENCE PICTURE';if(l)l.style.display=this.intel?'inline':'none';
  }
  refreshCameraButtons(){
    document.getElementById('aarAutoCam')?.classList.toggle('on',this.cameraMode==='AUTO');
    document.getElementById('aarFit')?.classList.toggle('on',this.cameraMode==='FIT');
  }
  _events(){return (this.record?.replay?.events||[]).slice().sort((a,b)=>(a.t||0)-(b.t||0));}
  _isKeyMoment(e){return !!e&&/SHIP_SUNK|TORPEDO_HIT|DECK_GUN_HIT|DEPTH_CHARGE_ATTACK|AIRCRAFT_ATTACK|DAMAGE|MINE_STRUCK|TRUK_PENETRATION|MISSION_COMPLETED|MISSION_FAILED|RETURNED_TO_PORT|BOAT_LOST/i.test(String(e.type||''));}
  _holdTicksFor(e){const ty=String(e?.type||'');if(/SHIP_SUNK|BOAT_LOST/.test(ty))return 10;if(/TORPEDO_HIT|DECK_GUN_HIT|DEPTH_CHARGE_ATTACK|AIRCRAFT_ATTACK|DAMAGE|MINE_STRUCK/.test(ty))return 7;return this._isKeyMoment(e)?5:2;}

  togglePlay(){
    if(this.playTimer){this.stopPlay();return;}const s=document.getElementById('aarTimeline');if(!s)return;
    if(+s.value>=+s.max){s.value='0';this.camera=null;}
    const step=Math.max(4,Math.round((+s.max||1)/150)),events=this._events();const b=document.getElementById('aarPlay');if(b)b.textContent='Ⅱ PAUSE';
    this.playTimer=setInterval(()=>{
      if(this._playHoldTicks>0){this._playHoldTicks--;this.draw();return;}
      const cur=+s.value,max=+s.max;let n=Math.min(max,cur+step),moment=null;
      const next=events.find(e=>(e.t||0)>cur+.25&&(e.t||0)<=cur+step*1.8);
      if(next){n=Math.min(max,+next.t||0);moment=next;this._playHoldTicks=this._holdTicksFor(next);}
      this._playMoment=moment;s.value=String(n);this.draw();if(n>=max)this.stopPlay();
    },180);
  }
  stopPlay(){if(this.playTimer){clearInterval(this.playTimer);this.playTimer=null;}this._playHoldTicks=0;const b=document.getElementById('aarPlay');if(b)b.textContent='▶ PLAY';}
  fmtT(sec){sec=Math.max(0,Math.round(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`T+${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`T+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

  activeMoment(t){
    if(this._playMoment&&Math.abs((this._playMoment.t||0)-t)<1.1)return this._playMoment;
    let best=null,bd=Infinity;for(const e of this._events()){if(!this._isKeyMoment(e))continue;const d=Math.abs((e.t||0)-t);if(d<bd){bd=d;best=e;}}
    return bd<=3?best:null;
  }
  updateNowPanel(t){
    const el=document.getElementById('aarNow');if(!el)return;const ev=this._events(),moment=this.activeMoment(t);
    if(moment){el.textContent=this.momentText(moment);return;}
    const last=[...ev].reverse().find(e=>(e.t||0)<=t+.001)||null,next=ev.find(e=>(e.t||0)>t+.001)||null;
    const pretty=e=>{if(!e)return'';const d=e.data||{},parts=[];if(d.contactId||d.targetId)parts.push(`target ${d.contactId||d.targetId}`);if(d.torpedoId)parts.push(`torpedo ${d.torpedoId}`);if(d.escortId)parts.push(`escort ${d.escortId}`);if(d.name)parts.push(d.name);return parts.length?` (${parts.join(' · ')})`:'';};
    if(last&&next)el.textContent=`${this.fmtT(last.t)} — ${last.text||last.type}${pretty(last)}. Next: ${this.fmtT(next.t)} — ${next.text||next.type}.`;
    else if(last)el.textContent=`${this.fmtT(last.t)} — ${last.text||last.type}${pretty(last)}.`;
    else if(next)el.textContent=`Next event: ${this.fmtT(next.t)} — ${next.text||next.type}.`;
    else el.textContent='Move the timeline or press PLAY to review the patrol. Event summaries appear here.';
  }
  momentText(e){
    const d=e?.data||{},parts=[`${this.fmtT(e?.t)} — ${e?.text||e?.type||'Key moment'}`];
    if(d.tons)parts.push(`${Number(d.tons).toLocaleString()} tons`);if(d.location)parts.push(d.location);if(d.weapon)parts.push(String(d.weapon).replace(/_/g,' '));if(d.condition)parts.push(d.condition);
    return parts.join(' · ');
  }

  routeAt(route,t){
    if(!route?.length)return null;let a=route[0],b=route[route.length-1];if(t<=a[0])return{xNm:a[1],yNm:a[2]};if(t>=b[0])return{xNm:b[1],yNm:b[2]};
    for(let i=1;i<route.length;i++)if(route[i][0]>=t){a=route[i-1];b=route[i];const u=(t-a[0])/Math.max(1,b[0]-a[0]);return{xNm:a[1]+(b[1]-a[1])*u,yNm:a[2]+(b[2]-a[2])*u};}
    return{xNm:b[1],yNm:b[2]};
  }
  trackAt(g,t){const a=(g?.points||[]).filter(q=>q[0]<=t);if(!a.length)return null;const q=a[a.length-1];return{xNm:q[1],yNm:q[2]};}
  bounds(points,w,h,minSpan=1){
    const p=points.filter(q=>q&&Number.isFinite(q.xNm)&&Number.isFinite(q.yNm));if(!p.length)p.push({xNm:0,yNm:0});
    let minX=Math.min(...p.map(q=>q.xNm)),maxX=Math.max(...p.map(q=>q.xNm)),minY=Math.min(...p.map(q=>q.yNm)),maxY=Math.max(...p.map(q=>q.yNm));
    let dx=Math.max(minSpan,maxX-minX),dy=Math.max(minSpan*.65,maxY-minY),span=Math.max(dx*1.25,dy*1.25*(w/Math.max(1,h)),minSpan);
    return{cx:(minX+maxX)/2,cy:(minY+maxY)/2,span};
  }
  fullActivityCamera(R,tracks,w,h){
    const pts=[];for(const q of R.route||[])pts.push({xNm:q[1],yNm:q[2]});for(const g of tracks)for(const q of g.points||[])pts.push({xNm:q[1],yNm:q[2]});for(const e of R.events||[]){if(e.position)pts.push(e.position);if(e.targetPosition)pts.push(e.targetPosition);}
    const b=this.bounds(pts,w,h,6);b.span=Math.min(260,b.span/this.cameraZoom);return b;
  }
  autoCamera(R,tracks,t,w,h,moment){
    const own=this.routeAt(R.route||[],t),pts=[];if(own)pts.push(own);
    if(moment){if(moment.position)pts.push(moment.position);if(moment.targetPosition)pts.push(moment.targetPosition);const ty=String(moment.type||'');const min=/SHIP_SUNK|TORPEDO_HIT|DECK_GUN_HIT/.test(ty)?2.2:/DEPTH_CHARGE|DAMAGE/.test(ty)?3.2:/AIRCRAFT/.test(ty)?5:6;const b=this.bounds(pts,w,h,min);b.span=Math.min(14,Math.max(min,b.span))/this.cameraZoom;return b;}
    if(own)for(const g of tracks){const p=this.trackAt(g,t);if(p&&Math.hypot(p.xNm-own.xNm,p.yNm-own.yNm)<=11)pts.push(p);}
    const b=this.bounds(pts,w,h,8);b.span=Math.min(20,Math.max(8,b.span))/this.cameraZoom;return b;
  }
  cameraFor(R,tracks,t,w,h,moment){
    const target=this.cameraMode==='FIT'?this.fullActivityCamera(R,tracks,w,h):this.autoCamera(R,tracks,t,w,h,moment);
    if(!this.camera||this.cameraMode==='FIT'){this.camera={...target};return this.camera;}
    const a=(moment&&(moment.targetPosition||moment.position)) ? .52 : .20;
    this.camera.cx+=((target.cx-this.camera.cx)*a);this.camera.cy+=((target.cy-this.camera.cy)*a);this.camera.span+=((target.span-this.camera.span)*a);return this.camera;
  }

  draw(){
    if(!this.ctx||!this.record)return;const c=this.canvas,box=c.getBoundingClientRect?.()||{width:900,height:500};const dpr=Math.min(1.5,window.devicePixelRatio||1),w=Math.max(320,Math.round(box.width||900)),h=Math.max(250,Math.round(box.height||500));
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}const x=this.ctx;x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);x.fillStyle='#07161b';x.fillRect(0,0,w,h);
    const slider=document.getElementById('aarTimeline'),t=slider?+slider.value:(this.record.durationSeconds||0),time=document.getElementById('aarTime');if(time)time.textContent=this.fmtT(t);this.updateNowPanel(t);
    const R=this.record.replay||{},tracks=this.intel?(R.truthTracks||[]):(R.observedTracks||[]),moment=this.activeMoment(t),cam=this.cameraFor(R,tracks,t,w,h,moment),pad=20;
    const span=Math.max(.5,cam.span),sc=(w-pad*2)/span,p2=q=>({x:w/2+(q.xNm-cam.cx)*sc,y:h/2-(q.yNm-cam.cy)*sc});
    const area=typeof PATROL_AREAS!=='undefined'?PATROL_AREAS[this.record.area]:null;
    this.drawGrid(x,w,h,pad);this.drawTerrain(x,area,p2);this.drawRoute(x,(R.route||[]).filter(q=>q[0]<=t),p2);this.drawTracks(x,tracks,p2,this.intel,t);this.drawTorpedoes(x,(R.torpedoes||[]).filter(q=>q.launchT<=t),p2,t);
    const shown=(R.events||[]).filter(e=>e.t<=t&&(!this.playTimer||t-e.t<900||e===moment));this.drawEvents(x,shown,p2);if(moment&&this._isKeyMoment(moment))this.drawMomentCard(x,w,h,moment,p2);
  }
  drawGrid(x,w,h,pad){x.save();x.strokeStyle='rgba(130,190,195,.10)';x.lineWidth=1;for(let i=1;i<6;i++){const xx=pad+(w-pad*2)*i/6;x.beginPath();x.moveTo(xx,pad);x.lineTo(xx,h-pad);x.stroke();const yy=pad+(h-pad*2)*i/6;x.beginPath();x.moveTo(pad,yy);x.lineTo(w-pad,yy);x.stroke();}x.restore();}
  drawTerrain(x,area,p2){if(!area)return;x.save();for(const f of area.terrain||[]){const a=f.points||[];if(a.length<2)continue;x.beginPath();a.forEach((q,i)=>{const p=p2(q);i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.closePath();x.fillStyle=f.type==='REEF'?'rgba(92,107,75,.25)':'rgba(83,84,66,.48)';x.fill();x.strokeStyle='rgba(170,170,130,.28)';x.stroke();}for(const po of area.ports||[]){const p=p2(po.pos);x.fillStyle=po.side==='FRIENDLY'?'#83d6b1':'#bd775f';x.fillRect(p.x-2,p.y-2,4,4);}x.restore();}
  drawRoute(x,a,p2){if(a.length<2)return;x.save();x.strokeStyle='#d9ddd2';x.lineWidth=1.6;x.beginPath();a.forEach((q,i)=>{const p=p2({xNm:q[1],yNm:q[2]});i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.stroke();const q=a[a.length-1],p=p2({xNm:q[1],yNm:q[2]});x.fillStyle='#fff3b0';x.beginPath();x.moveTo(p.x,p.y-6);x.lineTo(p.x-4,p.y+5);x.lineTo(p.x+4,p.y+5);x.closePath();x.fill();x.restore();}
  drawTracks(x,groups,p2,intel,t){x.save();for(const g of groups){const a=(g.points||[]).filter(q=>q[0]<=t);if(!a.length)continue;if(a.length>1){x.beginPath();a.forEach((q,i)=>{const p=p2({xNm:q[1],yNm:q[2]});i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.strokeStyle=intel?(g.side==='FRIENDLY'?'rgba(100,200,180,.5)':'rgba(205,90,68,.55)'):'rgba(226,191,92,.42)';x.lineWidth=1;x.setLineDash(intel?[]:[4,5]);x.stroke();}const q=a[a.length-1],p=p2({xNm:q[1],yNm:q[2]}),heading=q[3]||0,posConf=intel?1:(q[6]??q[5]??.5),visual=intel?true:!!q[8];x.setLineDash([]);x.save();x.translate(p.x,p.y);x.rotate(heading*Math.PI/180);x.strokeStyle=intel?(g.side==='FRIENDLY'?'#83d6b1':'#df7d61'):'#e6bf5c';x.lineWidth=1.4;if(!intel&&!visual){x.beginPath();x.ellipse(0,0,7+12*(1-posConf),3.5,0,0,Math.PI*2);x.stroke();}else{x.beginPath();x.moveTo(0,-7);x.lineTo(-3.5,5);x.lineTo(0,3);x.lineTo(3.5,5);x.closePath();x.stroke();}x.restore();}x.restore();}
  drawTorpedoes(x,a,p2,t){x.save();x.strokeStyle='rgba(110,205,210,.75)';x.lineWidth=1.1;for(const q of a){if(!q.start)continue;const e=q.end&&q.endT<=t?q.end:null;if(!e)continue;const A=p2(q.start),B=p2(e);x.beginPath();x.moveTo(A.x,A.y);x.lineTo(B.x,B.y);x.stroke();}x.restore();}
  drawEvents(x,a,p2){
    x.save();const groups=[];
    for(const e of a){const q=e.targetPosition||e.position;if(!q)continue;const p=p2(q);let g=groups.find(z=>Math.hypot(z.x-p.x,z.y-p.y)<14);if(!g){g={x:p.x,y:p.y,items:[]};groups.push(g);}g.items.push({e,p});}
    for(const g of groups){const n=g.items.length;g.items.forEach((item,i)=>{const radius=n>1?(n<=3?10:14):0,ang=n>1?(-Math.PI/2+i*(Math.PI*2/n)):0,dx=Math.cos(ang)*radius,dy=Math.sin(ang)*radius;if(radius>0){x.strokeStyle='rgba(240,207,105,.26)';x.lineWidth=1;x.beginPath();x.moveTo(g.x,g.y);x.lineTo(g.x+dx,g.y+dy);x.stroke();}const ty=String(item.e.type||'');x.save();x.translate(g.x+dx,g.y+dy);x.lineWidth=1.6;if(/SUNK|SHIP_SUNK/.test(ty)){x.strokeStyle='#ff816b';x.beginPath();x.moveTo(-5,-5);x.lineTo(5,5);x.moveTo(5,-5);x.lineTo(-5,5);x.stroke();}else if(/DEPTH_CHARGE|DAMAGE|MINE/.test(ty)){x.strokeStyle='#ff9f72';x.beginPath();for(let j=0;j<8;j++){const aa=j*Math.PI/4,r=j%2?3:7;j?x.lineTo(Math.cos(aa)*r,Math.sin(aa)*r):x.moveTo(Math.cos(aa)*r,Math.sin(aa)*r)}x.closePath();x.stroke();}else if(/AIRCRAFT/.test(ty)){x.strokeStyle='#d5a0ff';x.beginPath();x.moveTo(0,-6);x.lineTo(-5,5);x.lineTo(5,5);x.closePath();x.stroke();}else if(/TORPEDO|DECK_GUN/.test(ty)){x.strokeStyle='#71d0d6';x.beginPath();x.moveTo(-5,4);x.lineTo(5,-4);x.moveTo(5,-4);x.lineTo(1,-4);x.moveTo(5,-4);x.lineTo(5,0);x.stroke();}else{x.strokeStyle='#f0cf69';x.beginPath();x.arc(0,0,4,0,Math.PI*2);x.stroke();}x.restore();});}x.restore();
  }

  _rr(x,x0,y0,w,h,r){r=Math.min(r,w/2,h/2);x.beginPath();x.moveTo(x0+r,y0);x.arcTo(x0+w,y0,x0+w,y0+h,r);x.arcTo(x0+w,y0+h,x0,y0+h,r);x.arcTo(x0,y0+h,x0,y0,r);x.arcTo(x0,y0,x0+w,y0,r);x.closePath();}
  drawMomentCard(x,w,h,e,p2){
    const q=e.targetPosition||e.position||{xNm:0,yNm:0},sp=p2(q),cw=Math.min(280,Math.max(190,w*.37)),ch=Math.min(165,Math.max(118,h*.34)),left=sp.x>w*.55?12:w-cw-12,top=12;
    x.save();x.fillStyle='rgba(5,17,20,.96)';this._rr(x,left,top,cw,ch,8);x.fill();x.strokeStyle='rgba(245,198,92,.78)';x.lineWidth=1.2;x.stroke();
    const picH=Math.round(ch*.58);x.save();this._rr(x,left+5,top+5,cw-10,picH-3,5);x.clip();this.drawMomentPicture(x,left+5,top+5,cw-10,picH-3,e);x.restore();
    const d=e.data||{},title=/SHIP_SUNK/.test(e.type)?'SHIP SUNK':/TORPEDO_HIT/.test(e.type)?'TORPEDO IMPACT':/DECK_GUN_HIT/.test(e.type)?'DECK-GUN HIT':/DEPTH_CHARGE/.test(e.type)?'DEPTH-CHARGE ATTACK':/AIRCRAFT/.test(e.type)?'AIR ATTACK':/DAMAGE/.test(e.type)?'DAMAGE TAKEN':'KEY MOMENT';
    x.fillStyle='#f5c65c';x.font='bold 10px ui-monospace,Consolas,monospace';x.fillText(`${this.fmtT(e.t)} · ${title}`,left+9,top+picH+14);
    x.fillStyle='#d7f5e7';x.font='9px ui-monospace,Consolas,monospace';let line=e.text||e.type||'';if(line.length>44)line=line.slice(0,42)+'…';x.fillText(line,left+9,top+picH+28);
    const facts=[];if(d.contactId||d.targetId)facts.push(d.contactId||d.targetId);if(d.type)facts.push(d.type);if(d.tons)facts.push(`${Number(d.tons).toLocaleString()} tons`);if(d.location)facts.push(d.location);if(d.weapon)facts.push(String(d.weapon).replace(/_/g,' '));
    if(facts.length){x.fillStyle='rgba(170,208,194,.92)';x.font='8px ui-monospace,Consolas,monospace';let f=facts.join(' · ');if(f.length>55)f=f.slice(0,53)+'…';x.fillText(f,left+9,top+picH+42);}x.restore();
  }
  drawMomentPicture(x,left,top,w,h,e){
    const ty=String(e.type||''),seaY=top+h*.66,g=x.createLinearGradient(0,top,0,seaY);g.addColorStop(0,'#345e78');g.addColorStop(1,'#a3bec7');x.fillStyle=g;x.fillRect(left,top,w,seaY-top);x.fillStyle='#123444';x.fillRect(left,seaY,w,top+h-seaY);
    if(/DEPTH_CHARGE/.test(ty)){x.fillStyle='#132229';x.beginPath();x.ellipse(left+w*.52,top+h*.73,w*.23,h*.055,0,0,Math.PI*2);x.fill();for(const px of [.28,.48,.69]){x.fillStyle='rgba(240,220,160,.55)';x.beginPath();x.arc(left+w*px,top+h*(.63+px*.08),9,0,Math.PI*2);x.fill();}return;}
    if(/AIRCRAFT/.test(ty)){x.strokeStyle='#201c1c';x.lineWidth=3;x.beginPath();x.moveTo(left+w*.72,top+h*.22);x.lineTo(left+w*.48,top+h*.34);x.lineTo(left+w*.25,top+h*.31);x.moveTo(left+w*.49,top+h*.34);x.lineTo(left+w*.42,top+h*.19);x.stroke();}
    const sx=left+w*.48,sy=seaY-3,L=w*.55,H=h*.17;x.fillStyle='#29353a';x.beginPath();x.moveTo(sx-L*.5,sy);x.lineTo(sx-L*.38,sy-H*.55);x.lineTo(sx+L*.38,sy-H*.5);x.lineTo(sx+L*.5,sy);x.closePath();x.fill();x.fillStyle='#465258';x.fillRect(sx-L*.12,sy-H*.95,L*.22,H*.48);x.fillRect(sx-L*.04,sy-H*1.30,L*.12,H*.35);
    if(/TORPEDO_HIT|DECK_GUN_HIT|SHIP_SUNK|DAMAGE|MINE/.test(ty)){const ex=sx+L*.16,ey=sy-H*.34,rg=x.createRadialGradient(ex,ey,1,ex,ey,H*.8);rg.addColorStop(0,'rgba(255,245,180,1)');rg.addColorStop(.25,'rgba(255,156,55,.95)');rg.addColorStop(1,'rgba(190,45,20,0)');x.fillStyle=rg;x.beginPath();x.arc(ex,ey,H*.8,0,Math.PI*2);x.fill();x.strokeStyle='rgba(235,245,245,.8)';x.lineWidth=3;x.beginPath();x.moveTo(ex,seaY);x.lineTo(ex-H*.2,ey-H*.55);x.moveTo(ex,seaY);x.lineTo(ex+H*.25,ey-H*.45);x.stroke();}
    if(/SHIP_SUNK/.test(ty)){x.strokeStyle='rgba(45,45,45,.7)';x.lineWidth=7;x.beginPath();x.moveTo(sx+L*.1,sy-H*1.1);x.quadraticCurveTo(sx+L*.2,top+h*.12,sx+L*.28,top);x.stroke();}
  }
}
