// ═══════════════════════════════════════════════════ PATCH 8 — AFTER ACTION REPORT UI
// Static canvas redraws only on open/timeline/toggle/play ticks; it has no RAF.
class AfterActionReport{
  constructor(game){
    this.game=game;this.record=null;this.intel=false;this.playTimer=null;this._preScale=null;this.completedOpen=false;this._playHoldTicks=0;
    this.overlay=document.getElementById('aarOverlay');this.canvas=document.getElementById('aarCanvas');this.ctx=this.canvas?.getContext?.('2d')||null;
    document.getElementById('aarClose')?.addEventListener('click',()=>this.close(false));
    document.getElementById('aarContinue')?.addEventListener('click',()=>this.close(true));
    document.getElementById('aarIntel')?.addEventListener('click',()=>{this.intel=!this.intel;this.refreshIntelLabel();this.draw();});
    document.getElementById('aarTimeline')?.addEventListener('input',()=>this.draw());
    document.getElementById('aarPlay')?.addEventListener('click',()=>this.togglePlay());
    window.addEventListener?.('resize',()=>{if(this.overlay?.classList.contains('open'))this.draw();},{passive:true});
  }

  open(record,opts={}){
    if(!record)return;this.stopPlay();this.record=JSON.parse(JSON.stringify(record));this.intel=false;this.completedOpen=!!opts.completed;this._playHoldTicks=0;
    const s=this.game?.getSnapshot?.();if(s?.time){this._preScale=s.time.timeScale;s.time.timeScale=0;}
    this.renderHeader();this.renderStats();this.renderLog();
    const slider=document.getElementById('aarTimeline'),dur=Math.max(1,Math.round(this.record.durationSeconds||this.record.replay?.route?.at?.(-1)?.[0]||1));
    if(slider){slider.max=String(dur);slider.value=String(dur);slider.step='1';}
    const cont=document.getElementById('aarContinue');if(cont)cont.textContent=this.completedOpen?'CONTINUE TO WAR RECORD':'CLOSE REPORT';
    this.refreshIntelLabel();this.overlay?.classList.add('open');this.draw();
  }

  close(toCareer=false){
    this.stopPlay();this.overlay?.classList.remove('open');
    const s=this.game?.getSnapshot?.();
    if(!this.completedOpen&&s?.time&&this._preScale!=null)s.time.timeScale=this._preScale;
    this._preScale=null;const wasCompleted=this.completedOpen;this.completedOpen=false;
    if(toCareer&&wasCompleted&&typeof sceneSelector!=='undefined'){
      sceneSelector.open();
      const tab=document.querySelector?.('.scen-tab[data-stab="career"]');tab?.click?.();
    }
  }

  renderHeader(){
    const r=this.record;const t=document.getElementById('aarTitle'),d=document.getElementById('aarDates');
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
  _eventTimes(){return [...new Set((this.record?.replay?.events||[]).map(e=>Math.round(e.t||0)).filter(t=>t>=0))].sort((a,b)=>a-b);}

  togglePlay(){
    if(this.playTimer){this.stopPlay();return;}const s=document.getElementById('aarTimeline');if(!s)return;if(+s.value>=+s.max)s.value='0';
    const step=Math.max(4,Math.round((+s.max||1)/120)),eventTimes=this._eventTimes();const b=document.getElementById('aarPlay');if(b)b.textContent='Ⅱ PAUSE';
    this.playTimer=setInterval(()=>{
      if(this._playHoldTicks>0){this._playHoldTicks--;return;}
      const cur=+s.value,max=+s.max;let n=Math.min(max,cur+step);
      const nextEvent=eventTimes.find(t=>t>cur+.25);
      if(nextEvent!=null&&nextEvent<=cur+step*1.8){n=Math.min(max,nextEvent);this._playHoldTicks=2;}
      s.value=String(n);this.draw();if(n>=max)this.stopPlay();
    },180);
  }
  stopPlay(){if(this.playTimer){clearInterval(this.playTimer);this.playTimer=null;}this._playHoldTicks=0;const b=document.getElementById('aarPlay');if(b)b.textContent='▶ PLAY';}
  fmtT(sec){sec=Math.max(0,Math.round(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`T+${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`T+${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

  updateNowPanel(t){
    const el=document.getElementById('aarNow');if(!el)return;const ev=(this.record?.replay?.events||[]).slice().sort((a,b)=>(a.t||0)-(b.t||0));
    const last=[...ev].reverse().find(e=>(e.t||0)<=t+0.001)||null;const next=ev.find(e=>(e.t||0)>t+0.001)||null;
    const pretty=e=>{if(!e)return'';const d=e.data||{},parts=[];if(d.targetId)parts.push(`target ${d.targetId}`);if(d.torpedoId)parts.push(`torpedo ${d.torpedoId}`);if(d.escortId)parts.push(`escort ${d.escortId}`);if(d.name)parts.push(d.name);return parts.length?` (${parts.join(' · ')})`:'';};
    if(last&&next)el.textContent=`${this.fmtT(last.t)} — ${last.text||last.type}${pretty(last)}. Next: ${this.fmtT(next.t)} — ${next.text||next.type}.`;
    else if(last)el.textContent=`${this.fmtT(last.t)} — ${last.text||last.type}${pretty(last)}.`;
    else if(next)el.textContent=`Next event: ${this.fmtT(next.t)} — ${next.text||next.type}.`;
    else el.textContent='Move the timeline or press PLAY to review the patrol. Event summaries appear here.';
  }

  draw(){
    if(!this.ctx||!this.record)return;const c=this.canvas,box=c.getBoundingClientRect?.()||{width:900,height:500};const dpr=Math.min(1.5,window.devicePixelRatio||1),w=Math.max(320,Math.round(box.width||900)),h=Math.max(250,Math.round(box.height||500));
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}const x=this.ctx;x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);x.fillStyle='#07161b';x.fillRect(0,0,w,h);
    const slider=document.getElementById('aarTimeline'),t=slider?+slider.value:(this.record.durationSeconds||0),time=document.getElementById('aarTime');if(time)time.textContent=this.fmtT(t);this.updateNowPanel(t);
    const R=this.record.replay||{},tracks=this.intel?(R.truthTracks||[]):(R.observedTracks||[]),pts=[];
    for(const q of R.route||[])if(q[0]<=t)pts.push({xNm:q[1],yNm:q[2]});for(const g of tracks)for(const q of g.points||[])if(q[0]<=t)pts.push({xNm:q[1],yNm:q[2]});for(const e of R.events||[])if(e.t<=t){if(e.position)pts.push(e.position);if(e.targetPosition)pts.push(e.targetPosition);}
    const area=typeof PATROL_AREAS!=='undefined'?PATROL_AREAS[this.record.area]:null;if(area?.terrain)for(const f of area.terrain)for(const p of f.points||[])pts.push(p);if(area?.ports)for(const p of area.ports)pts.push(p.pos);
    if(!pts.length)pts.push({xNm:-1,yNm:-1},{xNm:1,yNm:1});let minX=Math.min(...pts.map(p=>p.xNm)),maxX=Math.max(...pts.map(p=>p.xNm)),minY=Math.min(...pts.map(p=>p.yNm)),maxY=Math.max(...pts.map(p=>p.yNm));
    const padx=Math.max(1,(maxX-minX)*.06),pady=Math.max(1,(maxY-minY)*.06);minX-=padx;maxX+=padx;minY-=pady;maxY+=pady;const pad=24,sx=(w-pad*2)/Math.max(.1,maxX-minX),sy=(h-pad*2)/Math.max(.1,maxY-minY),sc=Math.min(sx,sy),ox=(w-(maxX-minX)*sc)/2,oy=(h-(maxY-minY)*sc)/2;
    const p2=q=>({x:ox+(q.xNm-minX)*sc,y:h-(oy+(q.yNm-minY)*sc)});
    this.drawGrid(x,w,h,pad);this.drawTerrain(x,area,p2);this.drawRoute(x,(R.route||[]).filter(q=>q[0]<=t),p2);this.drawTracks(x,tracks,p2,this.intel,t);this.drawTorpedoes(x,(R.torpedoes||[]).filter(q=>q.launchT<=t),p2,t);this.drawEvents(x,(R.events||[]).filter(e=>e.t<=t),p2);
  }
  drawGrid(x,w,h,pad){x.save();x.strokeStyle='rgba(130,190,195,.10)';x.lineWidth=1;for(let i=1;i<6;i++){const xx=pad+(w-pad*2)*i/6;x.beginPath();x.moveTo(xx,pad);x.lineTo(xx,h-pad);x.stroke();const yy=pad+(h-pad*2)*i/6;x.beginPath();x.moveTo(pad,yy);x.lineTo(w-pad,yy);x.stroke();}x.restore();}
  drawTerrain(x,area,p2){if(!area)return;x.save();for(const f of area.terrain||[]){const a=f.points||[];if(a.length<2)continue;x.beginPath();a.forEach((q,i)=>{const p=p2(q);i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.closePath();x.fillStyle=f.type==='REEF'?'rgba(92,107,75,.25)':'rgba(83,84,66,.48)';x.fill();x.strokeStyle='rgba(170,170,130,.28)';x.stroke();}for(const po of area.ports||[]){const p=p2(po.pos);x.fillStyle=po.side==='FRIENDLY'?'#83d6b1':'#bd775f';x.fillRect(p.x-2,p.y-2,4,4);}x.restore();}
  drawRoute(x,a,p2){if(a.length<2)return;x.save();x.strokeStyle='#d9ddd2';x.lineWidth=1.6;x.beginPath();a.forEach((q,i)=>{const p=p2({xNm:q[1],yNm:q[2]});i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.stroke();const q=a[a.length-1],p=p2({xNm:q[1],yNm:q[2]});x.fillStyle='#fff3b0';x.beginPath();x.moveTo(p.x,p.y-6);x.lineTo(p.x-4,p.y+5);x.lineTo(p.x+4,p.y+5);x.closePath();x.fill();x.restore();}
  drawTracks(x,groups,p2,intel,t){x.save();for(const g of groups){const a=(g.points||[]).filter(q=>q[0]<=t);if(!a.length)continue;if(a.length>1){x.beginPath();a.forEach((q,i)=>{const p=p2({xNm:q[1],yNm:q[2]});i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)});x.strokeStyle=intel?(g.side==='FRIENDLY'?'rgba(100,200,180,.5)':'rgba(205,90,68,.55)'):'rgba(226,191,92,.42)';x.lineWidth=1;x.setLineDash(intel?[]:[4,5]);x.stroke();}const q=a[a.length-1],p=p2({xNm:q[1],yNm:q[2]}),heading=q[3]||0,posConf=intel?1:(q[6]??q[5]??.5),visual=intel?true:!!q[8];x.setLineDash([]);x.save();x.translate(p.x,p.y);x.rotate(heading*Math.PI/180);x.strokeStyle=intel?(g.side==='FRIENDLY'?'#83d6b1':'#df7d61'):'#e6bf5c';x.lineWidth=1.4;if(!intel&&!visual){x.beginPath();x.ellipse(0,0,7+12*(1-posConf),3.5,0,0,Math.PI*2);x.stroke();}else{x.beginPath();x.moveTo(0,-7);x.lineTo(-3.5,5);x.lineTo(0,3);x.lineTo(3.5,5);x.closePath();x.stroke();}x.restore();}x.restore();}
  drawTorpedoes(x,a,p2,t){x.save();x.strokeStyle='rgba(110,205,210,.75)';x.lineWidth=1.1;for(const q of a){if(!q.start)continue;const e=q.end&&q.endT<=t?q.end:null;if(!e)continue;const A=p2(q.start),B=p2(e);x.beginPath();x.moveTo(A.x,A.y);x.lineTo(B.x,B.y);x.stroke();}x.restore();}
  drawEvents(x,a,p2){
    x.save();
    const groups=[];
    for(const e of a){
      const q=e.targetPosition||e.position;if(!q)continue;const p=p2(q);
      let g=groups.find(z=>Math.hypot(z.x-p.x,z.y-p.y)<14);
      if(!g){g={x:p.x,y:p.y,items:[]};groups.push(g);}g.items.push({e,p});
    }
    for(const g of groups){
      const n=g.items.length;
      g.items.forEach((item,i)=>{
        const radius=n>1?(n<=3?10:14):0,ang=n>1?(-Math.PI/2+i*(Math.PI*2/n)):0;
        const dx=Math.cos(ang)*radius,dy=Math.sin(ang)*radius;
        if(radius>0){x.strokeStyle='rgba(240,207,105,.26)';x.lineWidth=1;x.beginPath();x.moveTo(g.x,g.y);x.lineTo(g.x+dx,g.y+dy);x.stroke();}
        const ty=String(item.e.type||'');x.save();x.translate(g.x+dx,g.y+dy);x.lineWidth=1.6;
        if(/SUNK|SHIP_SUNK/.test(ty)){x.strokeStyle='#ff816b';x.beginPath();x.moveTo(-5,-5);x.lineTo(5,5);x.moveTo(5,-5);x.lineTo(-5,5);x.stroke();}
        else if(/DEPTH_CHARGE|DAMAGE/.test(ty)){x.strokeStyle='#ff9f72';x.beginPath();for(let j=0;j<8;j++){const a=j*Math.PI/4,r=j%2?3:7;j?x.lineTo(Math.cos(a)*r,Math.sin(a)*r):x.moveTo(Math.cos(a)*r,Math.sin(a)*r)}x.closePath();x.stroke();}
        else if(/AIRCRAFT/.test(ty)){x.strokeStyle='#d5a0ff';x.beginPath();x.moveTo(0,-6);x.lineTo(-5,5);x.lineTo(5,5);x.closePath();x.stroke();}
        else if(/TORPEDO|DECK_GUN/.test(ty)){x.strokeStyle='#71d0d6';x.beginPath();x.moveTo(-5,4);x.lineTo(5,-4);x.moveTo(5,-4);x.lineTo(1,-4);x.moveTo(5,-4);x.lineTo(5,0);x.stroke();}
        else{x.strokeStyle='#f0cf69';x.beginPath();x.arc(0,0,4,0,Math.PI*2);x.stroke();}
        x.restore();
      });
    }
    x.restore();
  }
}
