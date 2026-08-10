// ═══════════════════════════════════════════════════ AFTER ACTION REPORT UI
// The AAR is a patrol debrief, not a second tactical-map replay. It turns the
// patrol record into a compact mission summary, notable engagement cards and a
// captain's log. Static mini-maps use the low-frequency recorder data, but no
// replay timer, camera state or canvas render loop exists here.
class AfterActionReport{
  constructor(game){
    this.game=game;this.record=null;this.completedOpen=false;this._preScale=null;this.engagementIndex=0;this._swipe=null;
    this.overlay=document.getElementById('aarOverlay');
    document.getElementById('aarClose')?.addEventListener('click',()=>this.close(false));
    document.getElementById('aarContinue')?.addEventListener('click',()=>this.close(true));
    document.getElementById('aarEngagementPrev')?.addEventListener('click',()=>this.moveEngagement(-1));
    document.getElementById('aarEngagementNext')?.addEventListener('click',()=>this.moveEngagement(1));
    const panel=document.getElementById('aarEngagementPanel');
    panel?.addEventListener('pointerdown',e=>{this._swipe={id:e.pointerId,x:e.clientX,y:e.clientY};});
    panel?.addEventListener('pointerup',e=>{if(!this._swipe||this._swipe.id!==e.pointerId)return;const dx=e.clientX-this._swipe.x,dy=e.clientY-this._swipe.y;this._swipe=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.15)this.moveEngagement(dx<0?1:-1);});
    panel?.addEventListener('pointercancel',()=>{this._swipe=null;});
    window.addEventListener?.('keydown',e=>{if(!this.overlay?.classList.contains('open'))return;if(e.key==='ArrowLeft')this.moveEngagement(-1);else if(e.key==='ArrowRight')this.moveEngagement(1);});
  }

  open(record,opts={}){
    if(!record)return;this.record=JSON.parse(JSON.stringify(record));this.completedOpen=!!opts.completed;this.engagementIndex=0;
    const s=this.game?.getSnapshot?.();if(s?.time){this._preScale=s.time.timeScale;s.time.timeScale=0;}
    this.renderHeader();this.renderStats();this.renderMission();this.renderEngagement();this.renderHonors();this.renderLog();
    const cont=document.getElementById('aarContinue');if(cont)cont.textContent=this.completedOpen?'CONTINUE TO WAR RECORD':'CLOSE REPORT';
    this.overlay?.classList.add('open');
  }

  close(continueFlow=false){
    this.overlay?.classList.remove('open');
    const s=this.game?.getSnapshot?.();if(!this.completedOpen&&s?.time&&s.time.timeScale===0&&this._preScale!=null&&s.playerSub?.mode!=='SUNK')s.time.timeScale=this._preScale;
    this._preScale=null;const completed=this.completedOpen;this.completedOpen=false;
    if(continueFlow&&completed&&typeof sceneSelector!=='undefined'){sceneSelector.open();const tab=document.querySelector?.('.scen-tab[data-stab="career"]');tab?.click?.();}
  }

  esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  fmtT(sec){sec=Math.max(0,Math.round(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
  pct(v){return Math.round(Math.max(0,Math.min(1,Number(v)||0))*100);}

  renderHeader(){
    const r=this.record,t=document.getElementById('aarTitle'),d=document.getElementById('aarDates');if(t)t.textContent=`PATROL ${r.patrolNumber||''} — ${r.area||'UNKNOWN AREA'}`;if(d)d.textContent=[r.startDate,r.endDate].filter(Boolean).join('  →  ');
  }
  renderStats(){
    const r=this.record,el=document.getElementById('aarStats');if(!el)return;
    const hitRate=r.torpedoesFired?Math.round((r.torpedoHits||0)/r.torpedoesFired*100):0;
    const stats=[
      ['Outcome',String(r.outcome||'UNKNOWN').replace(/_/g,' ')],
      ['Score',Number(r.patrolScore||0).toLocaleString()],
      ['Ships sunk',`${r.shipsSunk||0} · ${Number(r.tonnage||0).toLocaleString()} t`],
      ['Ships damaged',String(r.shipsDamaged||0)],
      ['Torpedoes',`${r.torpedoHits||0}/${r.torpedoesFired||0} hits · ${hitRate}%`],
      ['Deck gun',`${r.deckGunHits||0}/${r.deckGunRounds||0} hits`],
      ['Hull returned',`${Math.round(r.hullAtEnd??100)}%`],
      ['Patrol time',this.fmtT(r.durationSeconds||0)]
    ];
    el.innerHTML=stats.map(([a,b])=>`<div class="aar-stat"><strong>${this.esc(a)}</strong><span>${this.esc(b)}</span></div>`).join('');
  }

  renderMission(){
    const r=this.record,el=document.getElementById('aarMission');if(!el)return;
    const title=r.missionName||r.primaryMission?.title||String(r.missionType||'PATROL').replace(/_/g,' ');
    const objective=r.primaryMission?.description||r.primaryMission?.briefing||r.primaryMission?.title||'Complete assigned patrol orders and return safely.';
    const opts=(r.optionalObjectives||[]).map(o=>`<span class="aar-objective ${o.done?'done':o.failed?'failed':''}">${o.done?'✓':o.failed?'×':'○'} ${this.esc(o.text||'Optional objective')}</span>`).join('');
    el.innerHTML=`<div class="aar-mission-kicker">MISSION DEBRIEF</div><div class="aar-mission-title">${this.esc(title)}</div><div class="aar-mission-copy">${this.esc(objective)}</div><div class="aar-mission-meta"><span>Return: ${this.esc(r.returnPort||'—')}</span><span>Aircraft evaded: ${Number(r.aircraftEvaded)||0}</span><span>Aircraft kills: ${Number(r.aircraftKills)||0}</span><span>Duds: ${Number(r.torpedoDuds)||0}</span></div>${opts?`<div class="aar-objectives">${opts}</div>`:''}`;
  }

  fallbackRarity(type,tons=0){
    const q=String(type||'').toUpperCase();let score=/FLEET CARRIER/.test(q)?98:/CARRIER/.test(q)?92:/CRUISER|BATTLESHIP/.test(q)?87:/TRANSPORT|OILER/.test(q)?78:/ESCORT|WARSHIP/.test(q)?66:/TANKER/.test(q)?55:/PATROL/.test(q)?40:/SAMPAN|JUNK|FISHING/.test(q)?15:25;if(tons>=15000)score=Math.max(score,85);return{score,label:score>=92?'VERY RARE':score>=76?'RARE':score>=48?'UNCOMMON':'COMMON'};
  }
  engagements(){
    if(Array.isArray(this.record?.engagements)&&this.record.engagements.length)return this.record.engagements;
    // Compatibility for patrols stored before the debrief-card format existed.
    const sunk=(this.record?.sunkShips||[]).map(x=>{const r=this.fallbackRarity(x.type,x.tons);return{...x,status:'SUNK',rarityScore:r.score,rarityLabel:r.label,difficultyScore:50,difficultyLabel:'CHALLENGING',hits:1,weapons:[x.weapon||'UNKNOWN'],badges:r.score>=76?['RARE CONTACT']:[],damage:{}};});
    const damaged=(this.record?.damagedShips||[]).map(x=>{const r=this.fallbackRarity(x.type,x.tons);return{...x,status:x.condition||'DAMAGED',rarityScore:r.score,rarityLabel:r.label,difficultyScore:45,difficultyLabel:'CHALLENGING',hits:1,weapons:[x.weapon||'UNKNOWN'],badges:r.score>=76?['RARE CONTACT']:[],damage:x.subsystems||{}};});
    return [...sunk,...damaged];
  }

  moveEngagement(delta){const a=this.engagements();if(a.length<2)return;this.engagementIndex=(this.engagementIndex+delta+a.length)%a.length;this.renderEngagement();}
  shipSilhouette(e){
    const q=String(e.type||e.role||'').toUpperCase(),war=/ESCORT|WARSHIP|PATROL|CRUISER/.test(q),carrier=/CARRIER/.test(q),small=/SAMPAN|JUNK|FISHING|RAFT/.test(q);
    if(small)return `<svg viewBox="0 0 420 150" aria-hidden="true"><path class="hull" d="M70 93 L118 78 L300 79 L350 94 L320 110 L112 110 Z"/><path class="upper" d="M175 78 L190 55 L242 55 L263 79 Z"/><path class="line" d="M205 54 L205 32 M205 36 L238 50"/></svg>`;
    if(carrier)return `<svg viewBox="0 0 420 150" aria-hidden="true"><path class="hull" d="M48 91 L90 77 L344 80 L382 94 L349 112 L92 112 Z"/><path class="upper" d="M72 67 L340 63 L355 78 L76 81 Z"/><path class="upper" d="M245 62 L256 40 L294 42 L306 64 Z"/><path class="line" d="M267 42 L267 24"/></svg>`;
    if(war)return `<svg viewBox="0 0 420 150" aria-hidden="true"><path class="hull" d="M52 93 L104 73 L332 78 L382 94 L342 111 L98 111 Z"/><path class="upper" d="M153 74 L169 50 L248 50 L275 77 Z"/><path class="upper" d="M121 72 L141 63 L160 73 Z M286 78 L306 65 L326 80 Z"/><path class="line" d="M202 50 L202 26 M202 30 L238 45"/></svg>`;
    return `<svg viewBox="0 0 420 150" aria-hidden="true"><path class="hull" d="M45 91 L91 73 L345 78 L388 94 L348 113 L91 113 Z"/><path class="upper" d="M154 76 L172 48 L258 48 L281 79 Z"/><path class="upper" d="M187 47 L196 30 L237 30 L248 49 Z"/><path class="line" d="M217 30 L217 18"/></svg>`;
  }

  miniMap(e){
    const m=e.attackMap||{},raw=[m.own,m.launch,m.target,m.impact].filter(p=>Number.isFinite(p?.xNm)&&Number.isFinite(p?.yNm));if(raw.length<2)return '<div class="aar-mini-empty">No geometry recorded for this engagement.</div>';
    let minX=Math.min(...raw.map(p=>p.xNm)),maxX=Math.max(...raw.map(p=>p.xNm)),minY=Math.min(...raw.map(p=>p.yNm)),maxY=Math.max(...raw.map(p=>p.yNm));let span=Math.max(maxX-minX,maxY-minY,.25);minX=(minX+maxX)/2-span*.62;maxX=minX+span*1.24;minY=(minY+maxY)/2-span*.34;maxY=minY+span*.68;
    const P=p=>({x:18+(p.xNm-minX)/(maxX-minX)*324,y:108-(p.yNm-minY)/(maxY-minY)*88});const own=P(m.launch||m.own),tar=P(m.impact||m.target),weapon=String(m.weapon||'').replace(/_/g,' ');
    return `<svg class="aar-mini-svg" viewBox="0 0 360 122" role="img" aria-label="Static engagement geometry"><path class="grid" d="M18 20H342M18 50H342M18 80H342M18 108H342M90 14V108M180 14V108M270 14V108"/><path class="attack" d="M${own.x.toFixed(1)} ${own.y.toFixed(1)} L${tar.x.toFixed(1)} ${tar.y.toFixed(1)}"/><g class="own" transform="translate(${own.x.toFixed(1)} ${own.y.toFixed(1)})"><path d="M0 -8 L-5 6 L0 4 L5 6 Z"/></g><g class="target" transform="translate(${tar.x.toFixed(1)} ${tar.y.toFixed(1)})"><path d="M-12 3 L-8 -4 L8 -4 L12 3 L8 6 L-8 6 Z"/></g><text x="20" y="118">FIRING / IMPACT GEOMETRY · ${this.esc(weapon)}</text></svg>`;
  }

  damageBars(e){const d=e.damage||{};return ['flotation','propulsion','steering','fire'].map(k=>{const p=this.pct(d[k]);return `<div class="aar-damage-row"><span>${k.slice(0,4).toUpperCase()}</span><i><b style="width:${p}%"></b></i><em>${p}%</em></div>`;}).join('');}

  renderEngagement(){
    const all=this.engagements(),host=document.getElementById('aarEngagements'),counter=document.getElementById('aarEngagementCounter'),prev=document.getElementById('aarEngagementPrev'),next=document.getElementById('aarEngagementNext');if(!host)return;
    if(!all.length){host.innerHTML='<div class="aar-no-engagement"><strong>NO ENEMY SHIPS DAMAGED</strong><span>The patrol record contains no damaging engagement cards.</span></div>';if(counter)counter.textContent='0 / 0';if(prev)prev.disabled=true;if(next)next.disabled=true;return;}
    this.engagementIndex=Math.max(0,Math.min(all.length-1,this.engagementIndex));const e=all[this.engagementIndex],status=String(e.status||'DAMAGED').replace(/_/g,' '),weapons=(e.weapons||[]).join(' + ')||'UNKNOWN',badges=(e.badges||[]).map(b=>`<span>${this.esc(b)}</span>`).join('');
    const facts=[['TONNAGE',e.tons?`${Number(e.tons).toLocaleString()} t`:'—'],['LENGTH',e.lengthFeet?`${Math.round(e.lengthFeet)} ft`:'—'],['SPEED',Number.isFinite(e.maxSpeedKnots)?`${Number(e.maxSpeedKnots).toFixed(1)} kn`:'—'],['HITS',`${e.hits||0} (${e.torpedoHits||0} T / ${e.deckGunHits||0} G)`],['WEAPON',weapons],['RANGE',Number.isFinite(e.attackRangeNm)?`${Number(e.attackRangeNm).toFixed(2)} nm`:'—']];
    host.innerHTML=`<article class="aar-engagement-card"><div class="aar-card-top"><div><div class="aar-card-kicker">${this.esc(e.type||e.role||'ENEMY SHIP')}</div><h3>${this.esc(e.name||e.id||'CONTACT')}</h3></div><div class="aar-status ${/SUNK/.test(status)?'sunk':/CRIPPLED|FOUNDERING|BURNING|DEAD/.test(status)?'severe':''}">${this.esc(status)}</div></div><div class="aar-ship-stage">${this.shipSilhouette(e)}<div class="aar-rarity"><small>GAME RARITY</small><b>${this.esc(e.rarityLabel||'COMMON')}</b><span>${Math.round(e.rarityScore||0)}/100</span></div></div><div class="aar-difficulty"><div><small>ATTACK DIFFICULTY</small><b>${Math.round(e.difficultyScore||0)}/100 · ${this.esc(e.difficultyLabel||'')}</b></div><i><b style="width:${Math.max(0,Math.min(100,Number(e.difficultyScore)||0))}%"></b></i></div>${badges?`<div class="aar-badges">${badges}</div>`:''}<div class="aar-card-body"><div class="aar-specs">${facts.map(([a,b])=>`<div><small>${a}</small><b>${this.esc(b)}</b></div>`).join('')}<div class="aar-points"><small>SCORE CREDIT</small><b>${Number(e.points||0)>0?`+${Number(e.points).toLocaleString()}`:'—'}</b></div></div><div class="aar-damage"><div class="aar-subhead">DAMAGE STATE</div>${this.damageBars(e)}</div></div><div class="aar-mini-map">${this.miniMap(e)}</div></article>`;
    if(counter)counter.textContent=`${this.engagementIndex+1} / ${all.length}`;if(prev)prev.disabled=all.length<2;if(next)next.disabled=all.length<2;
  }

  renderHonors(){
    const el=document.getElementById('aarPatrolHonors');if(!el)return;const a=this.engagements();if(!a.length){el.innerHTML='';return;}
    const hardest=[...a].sort((x,y)=>(y.difficultyScore||0)-(x.difficultyScore||0))[0],rarest=[...a].sort((x,y)=>(y.rarityScore||0)-(x.rarityScore||0))[0],heavy=[...a].sort((x,y)=>(y.tons||0)-(x.tons||0))[0];
    el.innerHTML=`<div class="aar-honor"><small>HARDEST ATTACK</small><b>${this.esc(hardest?.name||'—')}</b><span>${Math.round(hardest?.difficultyScore||0)}/100</span></div><div class="aar-honor"><small>RAREST CONTACT</small><b>${this.esc(rarest?.name||'—')}</b><span>${this.esc(rarest?.rarityLabel||'—')}</span></div><div class="aar-honor"><small>HEAVIEST ENGAGED</small><b>${this.esc(heavy?.name||'—')}</b><span>${Number(heavy?.tons||0).toLocaleString()} t</span></div>`;
  }

  renderLog(){
    const el=document.getElementById('aarCaptainLog');if(!el)return;const ev=this.record.importantEvents||[];el.innerHTML=ev.length?ev.map(x=>`<div class="aar-log-row"><span>${this.esc(x.date||this.fmtT(x.t))}</span><b>${this.esc(x.text||x.type)}</b></div>`).join(''):'<div class="aar-log-row"><b>No Captain\'s Log entries.</b></div>';
  }
}
