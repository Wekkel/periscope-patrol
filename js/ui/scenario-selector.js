// ═══════════════════════════════════════════════════ SCENARIO SELECTOR UI
class ScenarioSelector{
  constructor(game){
    this.game=game;this.selArea='Solomon Sea';this.selHist=null;this.selMission='AUTO';this.activeTab='patrol';
    this.bind();this.renderCards();this.renderHistorical();
  }

  open(){
    audio.ensure();
    const career=SaveSystem.getCareer();
    const el=document.getElementById('scenCareerScore');
    if(el)el.textContent=(career.totalScore||0).toLocaleString();
    const meta=document.getElementById('scenCareerMeta');
    if(meta)meta.textContent=`${career.totalShips||0} ships · ${(career.totalTonnage||0).toLocaleString()} tons · ${career.patrolHistory?.length||0} recorded patrols`;
    document.getElementById('scenarioOverlay')?.classList.add('open');
    this.renderSaveSlots();this.renderCareer();
    const s=this.game.getSnapshot();
    if(s.time.timeScale!==0){s.time._pre=s.time.timeScale;s.time.timeScale=0;}
  }

  close(){
    document.getElementById('scenarioOverlay')?.classList.remove('open');
    const s=this.game.getSnapshot();
    if(s.time._pre!=null){s.time.timeScale=s.time._pre;s.time._pre=null;}
  }

  bind(){
    document.getElementById('scenCancel')?.addEventListener('click',()=>this.close());
    document.getElementById('scenLaunch')?.addEventListener('click',()=>this.launch());
    document.querySelectorAll('.scen-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        this.activeTab=tab.dataset.stab;
        document.querySelectorAll('.scen-tab').forEach(t=>t.classList.toggle('active',t.dataset.stab===this.activeTab));
        document.getElementById('stabPatrol').style.display=this.activeTab==='patrol'?'grid':'none';
        document.getElementById('stabHistorical').style.display=this.activeTab==='historical'?'flex':'none';
        document.getElementById('stabSaveload').style.display=this.activeTab==='saveload'?'flex':'none';
        document.getElementById('stabCareer').style.display=this.activeTab==='career'?'flex':'none';
        if(this.activeTab==='saveload')this.renderSaveSlots();
        if(this.activeTab==='career')this.renderCareer();
      });
    });
  }

  renderCards(){
    const c=document.getElementById('stabPatrol');if(!c)return;
    const diffs={'Solomon Sea':{l:'MEDIUM',cls:'diff-med',s:'★★☆'},'Bismarck Sea':{l:'MEDIUM',cls:'diff-med',s:'★★☆'},
      'Luzon Strait':{l:'HARD',cls:'diff-hard',s:'★★★'},'Truk Approaches':{l:'HARD',cls:'diff-hard',s:'★★★'},'Java Sea':{l:'EASY',cls:'diff-easy',s:'★☆☆'}};
    const missionOpts=[['AUTO','AUTO — varied patrol orders'],...(typeof MISSION_PRIMARY_TYPES!=='undefined'?MISSION_PRIMARY_TYPES:[]).map(k=>[k,(typeof MISSION_DEFINITIONS!=='undefined'&&MISSION_DEFINITIONS[k]?.title)||k.replaceAll('_',' ')])];
    c.innerHTML=Object.entries(PATROL_AREAS).map(([name,area])=>{
      const d=diffs[name]||{l:'MEDIUM',cls:'diff-med',s:'★★☆'};
      return `<div class="area-card${name===this.selArea?' selected':''}" data-area="${name}">
        <h3>${name.toUpperCase()}</h3>
        <div class="area-desc">${area.description}</div>
        <div class="area-stats">
          <span>Visibility</span><span>${area.environment.visibilityNm.toFixed(0)} nm</span>
          <span>Weather</span><span>${area.environment.weather}</span>
          <span>Sea State</span><span>${area.environment.seaState.toFixed(1)}</span>
          <span>Convoys</span><span>${area.convoyCountRange[0]}–${area.convoyCountRange[1]} ships</span>
          <span>Home Port</span><span>${(area.ports.find(p=>p.side==='FRIENDLY')||{name:'—'}).name}</span>
        </div>
        <span class="area-diff ${d.cls}">${d.s} ${d.l}</span>
      </div>`;
    }).join('')+`<div class="hist-card" style="grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><div style="min-width:210px;flex:1"><h3 style="margin:0 0 4px">PRIMARY MISSION</h3><div class="hist-desc">One primary mission per patrol. Truk harbor raids remain intelligence-driven optional opportunities.</div></div><select id="missionTypeSelect" class="tsel" style="min-width:250px;max-width:100%;">${missionOpts.map(([v,l])=>`<option value="${v}"${v===this.selMission?' selected':''}>${l}</option>`).join('')}</select></div>`;
    const ms=c.querySelector('#missionTypeSelect');if(ms)ms.addEventListener('change',()=>{this.selMission=ms.value;});
    c.querySelectorAll('.area-card').forEach(card=>{
      card.addEventListener('click',()=>{
        this.selArea=card.dataset.area;this.selHist=null;
        c.querySelectorAll('.area-card').forEach(x=>x.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  renderHistorical(){
    const c=document.getElementById('stabHistorical');if(!c)return;
    c.innerHTML=HISTORICAL_SCENARIOS.map(s=>`
      <div class="hist-card" data-id="${s.id}">
        <div class="hist-date">📅 ${s.date} — ${s.name}</div>
        <div class="hist-desc">${s.description}</div>
        <div style="margin-top:6px;">
          <span class="area-diff ${s.difficulty==='HARD'?'diff-hard':s.difficulty==='EASY'?'diff-easy':'diff-med'}">${s.difficulty}</span>
          <span style="font-size:11px;color:var(--alert);margin-left:8px;">Bonus: +${s.patrolBonus.toLocaleString()} pts</span>
        </div>
      </div>`).join('');
    c.querySelectorAll('.hist-card').forEach(card=>{
      card.addEventListener('click',()=>{
        this.selHist=card.dataset.id;this.selArea=null;
        c.querySelectorAll('.hist-card').forEach(x=>x.style.borderColor='');
        card.style.borderColor='var(--ok)';
      });
    });
  }

  renderCareer(){
    const c=document.getElementById('careerHistory');if(!c)return;
    const car=SaveSystem.getCareer(),hist=[...(car.patrolHistory||[])].reverse();
    const badges=(car.commendations||[]).map(x=>`<span class="area-diff diff-med" style="margin:2px 5px 2px 0;">★ ${x.title}</span>`).join('');
    const rows=hist.map(r=>{
      const ev=(r.importantEvents||[]).map(e=>`<div class="log-entry">${e.date||''} · ${e.text}</div>`).join('');
      const opt=(r.optionalObjectives||[]).length?` · optional ${(r.optionalObjectives||[]).map(o=>o.result||(o.done?'done':'not attempted')).join(', ')}`:'';
      return `<div class="hist-card"><h3>Patrol #${r.patrolNumber} — ${r.area} · ${r.outcome}</h3><div style="font-size:10px;color:var(--alert);margin:2px 0 4px;">${r.missionName||String(r.missionType||'CONVOY_INTERDICTION').replaceAll('_',' ')}</div>
        <div class="hist-date">${r.startDate||''} → ${r.endDate||''}</div>
        <div class="hist-desc">${r.shipsSunk||0} sunk · ${(r.tonnage||0).toLocaleString()}t · ${r.shipsDamaged||0} damaged · hull ${Math.round(r.hullAtEnd??100)}%<br>
        Torpedoes ${r.torpedoesFired||0} fired / ${r.torpedoHits||0} hits / ${r.torpedoDuds||0} duds · deck gun ${r.deckGunRounds||0} rounds / ${r.deckGunHits||0} hits · aircraft ${r.aircraftKills||0}${opt}</div>
        ${ev?`<div style="margin-top:7px;font-size:10.5px;color:var(--muted);">${ev}</div>`:''}</div>`;
    }).join('');
    c.innerHTML=`<div class="hist-card"><h3>WAR RECORD</h3><div class="hist-desc">Score ${(car.totalScore||0).toLocaleString()} · ${(car.totalTonnage||0).toLocaleString()} tons · ${car.totalShips||0} ships</div><div style="margin-top:7px;">${badges||'<span style="color:var(--dim)">No commendations yet.</span>'}</div></div>`+
      (rows||'<div class="hist-card"><div class="hist-desc">No completed or lost patrols recorded yet.</div></div>');
  }

  renderSaveSlots(){
    const c=document.getElementById('saveSlots');if(!c)return;
    const slots=SaveSystem.listSlots();
    c.innerHTML=slots.map(slot=>{
      if(slot.empty)return`<div class="save-slot">
        <div class="slot-info"><div class="slot-name" style="color:var(--muted);">— Empty Slot ${slot.slot+1} —</div></div>
        <div class="slot-btns"><button onclick="sceneSelector.saveToSlot(${slot.slot})" style="border-color:var(--ok);color:var(--ok);">Save Here</button></div></div>`;
      const d=new Date(slot.savedAt).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'});
      return`<div class="save-slot">
        <div class="slot-info">
          <div class="slot-name">Slot ${slot.slot+1} — ${slot.area} | Patrol #${slot.patrol}</div>
          <div class="slot-meta">${d} | Score: ${(slot.score||0).toLocaleString()} | ${(slot.tonnage||0).toLocaleString()}t sunk | Hull: ${Math.round(slot.hullIntegrity||100)}%</div>
        </div>
        <div class="slot-btns">
          <button onclick="sceneSelector.loadSlot(${slot.slot})" style="border-color:var(--alert);color:var(--alert);">Load</button>
          <button onclick="sceneSelector.saveToSlot(${slot.slot})" style="border-color:var(--ok);color:var(--ok);">Save</button>
          <button onclick="sceneSelector.deleteSlot(${slot.slot})" class="danger">Del</button>
        </div></div>`;
    }).join('');
  }

  saveToSlot(slot){
    if(SaveSystem.save(slot,this.game.getSnapshot())){audio.playWaypoint();this.renderSaveSlots();}
    else alert('Save failed.');
  }

  loadSlot(slot){
    const state=SaveSystem.load(slot);
    if(!state){alert('Load failed.');return;}
    Object.assign(this.game.state,state);
    this.close();
    showBriefing(state.campaign.patrolArea,state);
    audio.playDive();
  }

  deleteSlot(slot){
    if(!confirm('Delete this save?'))return;
    SaveSystem.delete(slot);this.renderSaveSlots();
  }

  launch(){
    if(this.selHist){
      const h=HISTORICAL_SCENARIOS.find(s=>s.id===this.selHist);
      if(h){
        const aKey=Object.keys(PATROL_AREAS).find(k=>h.area.includes(k.split(' ')[0]))||'Solomon Sea';
        this.game.dispatch({type:'NEW_PATROL',areaKey:aKey,startDate:h.date,difficulty:h.difficulty,missionType:h.missionType||'CONVOY_INTERDICTION'});
        const s=this.game.getSnapshot();
        Object.assign(s.world.environment,h.environment);
        s.world.weatherSystem=null;(this.game.engine||this.game).ensureWeatherSystem?.(true);
        s.campaign.patrolBonus=h.patrolBonus;
        s.campaign.missionName=h.name;
        // Fix 7: set campaign start date from historical scenario
        s.campaign.startDate=h.date;s.time.campaignDate=h.date;
        s.campaign._careerStartDate=`${h.date} 06:00`;
        s.time.elapsedSeconds=0; // reset elapsed so date shows correctly
        if(h.forceDudMode) s.tdc.dudMode=h.forceDudMode;
        if(h.forceTorpedo){
          s.tdc.torpedoSpecKey=h.forceTorpedo;
          const sp=TORPEDO_SPECS[h.forceTorpedo];
          if(sp){s.tdc.torpedoType=sp.name;s.tdc.torpedoSpeedKnots=sp.speedKnots;s.tdc.torpedoMaxRangeNm=sp.maxRangeNm;}
        }
        audio.playDive();this.close();showBriefing(aKey,s);return;
      }
    }
    if(this.selArea){this.game.dispatch({type:'NEW_PATROL',areaKey:this.selArea,missionType:this.selMission||'AUTO'});this.close();}
  }
}

