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
    const s=this.game?.getSnapshot?.();if(!this.completedOpen&&s?.time&&s.time.timeScale===0&&this._preScale!=null)s.time.timeScale=this._preScale;
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
      [String(r.outcome||'').toUpperCase()==='LOST'?'Hull at loss':'Hull returned',`${Math.round(r.hullAtEnd??100)}%`],
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
    const q=String(type||'').toUpperCase();let score=/FLEET CARRIER/.test(q)?98:/CARRIER/.test(q)?92:/CRUISER|BATTLESHIP/.test(q)?87:/TRANSPORT|OILER/.test(q)?78:/DESTROYER/.test(q)?70:/KAIBOKAN|ESCORT|WARSHIP/.test(q)?62:/TANKER/.test(q)?55:/PATROL/.test(q)?40:/SAMPAN|JUNK|FISHING/.test(q)?15:25;if(tons>=15000)score=Math.max(score,85);return{score,label:score>=92?'VERY RARE':score>=76?'RARE':score>=48?'UNCOMMON':'COMMON'};
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
    const q=String(e.type||e.displayType||e.role||'').toUpperCase();
    const isSmall=/SAMPAN|JUNK|FISHING|RAFT/.test(q);
    const isCarrier=/CARRIER/.test(q);
    const isCruiser=/HEAVY CRUISER|CRUISER/.test(q);
    const isDestroyer=/DESTROYER|KAIBOKAN|ESCORT|WARSHIP/.test(q);
    const isPatrol=/PATROL/.test(q);
    const isTanker=/TANKER|OILER/.test(q);
    const isSmallTanker=/SMALL TANKER/.test(q);
    const isTransport=/TRANSPORT|FREIGHTER|MERCHANT|TROOP|CARGO/.test(q);
    const svg=(body)=>`<svg viewBox="0 0 420 150" aria-hidden="true">${body}</svg>`;
    /* Debrief silhouettes are simplified card art, but they should still read
       as believable side profiles. The key correction here is that bow and
       stern must no longer look like mirrored spear-points: most merchant and
       tanker hulls get a fuller transom/cruiser stern, while warships keep a
       sharper bow with a comparatively blunter aft run. */
    if(isSmall)return svg(`<path class="hull" d="M72 112 L72 97 L104 94 L268 94 L298 93 L326 91 L338 89 L346 90 L334 100 L318 112 Z"/><path class="upper" d="M178 94 L192 74 L235 74 L248 94 Z"/><path class="line" d="M206 74 L206 42 M206 48 L231 59"/>`);
    if(isCarrier)return svg(`<path class="hull" d="M62 112 L62 91 L92 88 L340 88 L370 90 L388 92 L374 101 L364 112 Z"/><path class="upper" d="M72 75 L356 75 L356 86 L72 86 Z"/><path class="upper" d="M238 75 L238 52 L274 52 L274 75 Z"/><path class="line" d="M256 52 L256 29 M256 36 L274 44"/>`);
    if(isCruiser)return svg(`<path class="hull" d="M60 112 L64 100 L110 96 L286 96 L318 95 L342 92 L356 84 L366 85 L348 101 L340 112 Z"/><path class="upper" d="M130 95 L148 78 L200 78 L224 88 L272 88 L292 96 L130 96 Z"/><path class="upper" d="M118 95 L130 89 L144 95 Z M300 96 L314 88 L328 96 Z"/><path class="upper" d="M246 78 L260 62 L278 62 L292 78 Z"/><path class="line" d="M188 78 L188 44 M188 50 L219 61"/>`);
    if(isDestroyer)return svg(`<path class="hull" d="M62 112 L66 99 L114 95 L286 95 L316 93 L338 89 L352 80 L362 81 L344 100 L336 112 Z"/><path class="upper" d="M138 94 L154 75 L208 75 L226 86 L264 86 L284 95 L138 95 Z"/><path class="upper" d="M125 94 L136 88 L149 94 Z M290 95 L304 88 L317 95 Z"/><path class="line" d="M187 75 L187 42 M187 47 L214 58"/>`);
    if(isPatrol)return svg(`<path class="hull" d="M70 112 L72 101 L112 97 L260 97 L292 95 L314 91 L324 85 L332 86 L318 101 L311 112 Z"/><path class="upper" d="M158 96 L174 78 L219 78 L238 96 Z"/><path class="upper" d="M146 96 L158 89 L170 96 Z"/><path class="line" d="M202 78 L202 48"/>`);
    if(isSmallTanker)return svg(`<path class="hull" d="M62 112 L62 94 L118 91 L286 91 L314 90 L334 88 L348 84 L356 84 L340 100 L332 112 Z"/><path class="upper" d="M184 91 L198 67 L244 67 L258 91 Z"/><path class="upper" d="M212 67 L212 49 L226 49 L226 67 Z"/><path class="line" d="M219 49 L219 31"/><path class="line" d="M138 91 L304 91"/>`);
    if(isTanker)return svg(`<path class="hull" d="M56 112 L56 92 L120 89 L302 89 L330 88 L350 86 L364 82 L372 83 L356 98 L348 112 Z"/><path class="upper" d="M108 89 L128 70 L160 70 L176 89 Z"/><path class="upper" d="M184 88 L302 88 L302 91 L184 91 Z"/><path class="line" d="M145 70 L145 44 M145 50 L168 60"/><path class="line" d="M236 88 L236 74 M268 88 L268 74"/>`);
    if(isTransport)return svg(`<path class="hull" d="M58 112 L60 95 L114 92 L290 92 L322 91 L344 87 L358 83 L366 84 L350 101 L342 112 Z"/><path class="upper" d="M96 92 L108 72 L166 72 L181 92 Z"/><path class="upper" d="M119 72 L126 54 L158 54 L166 72 Z"/><path class="line" d="M143 54 L143 34 M143 41 L166 50"/><path class="line" d="M195 91 L195 78 M260 91 L260 78 M316 91 L316 80"/>`);
    return svg(`<path class="hull" d="M58 112 L60 95 L114 92 L290 92 L322 91 L344 87 L358 83 L366 84 L350 101 L342 112 Z"/><path class="upper" d="M96 92 L108 72 L166 72 L181 92 Z"/><path class="upper" d="M119 72 L126 54 L158 54 L166 72 Z"/><path class="line" d="M143 54 L143 34 M143 41 L166 50"/><path class="line" d="M195 91 L195 78 M260 91 L260 78 M316 91 L316 80"/>`);
  }

  miniMap(e){
    const m=e.attackMap||{},raw=[m.own,m.launch,m.target,m.impact].filter(p=>Number.isFinite(p?.xNm)&&Number.isFinite(p?.yNm));if(raw.length<2)return '<div class="aar-mini-empty">No geometry recorded for this engagement.</div>';
    let minX=Math.min(...raw.map(p=>p.xNm)),maxX=Math.max(...raw.map(p=>p.xNm)),minY=Math.min(...raw.map(p=>p.yNm)),maxY=Math.max(...raw.map(p=>p.yNm));
    const sx=Math.max(maxX-minX,.18),sy=Math.max(maxY-minY,.18),px=Math.max(.05,sx*.16),py=Math.max(.05,sy*.22);minX-=px;maxX+=px;minY-=py;maxY+=py;
    const P=p=>({x:24+(p.xNm-minX)/(maxX-minX)*312,y:102-(p.yNm-minY)/(maxY-minY)*78});const launch=P(m.launch||m.own),impact=P(m.impact||m.target),weapon=String(m.weapon||'').replace(/_/g,' ');
    return `<svg class="aar-mini-svg" viewBox="0 0 360 122" role="img" aria-label="Launch point, weapon track and impact point"><path class="grid" d="M18 20H342M18 48H342M18 76H342M18 104H342M90 14V104M180 14V104M270 14V104"/><path class="attack" d="M${launch.x.toFixed(1)} ${launch.y.toFixed(1)} L${impact.x.toFixed(1)} ${impact.y.toFixed(1)}"/><g class="own" transform="translate(${launch.x.toFixed(1)} ${launch.y.toFixed(1)})"><circle r="5"/><path d="M0 -10 L-5 4 L0 2 L5 4 Z"/></g><text x="${Math.min(306,launch.x+8).toFixed(1)}" y="${Math.max(15,launch.y-8).toFixed(1)}">LAUNCH</text><g class="target" transform="translate(${impact.x.toFixed(1)} ${impact.y.toFixed(1)})"><path d="M-12 3 L-8 -4 L8 -4 L12 3 L8 6 L-8 6 Z"/><circle r="3"/></g><text x="${Math.min(304,impact.x+8).toFixed(1)}" y="${Math.max(15,impact.y-8).toFixed(1)}">IMPACT</text><text x="20" y="118">FIRING / IMPACT GEOMETRY · ${this.esc(weapon)}</text></svg>`;
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
