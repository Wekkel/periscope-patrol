// ═══════════════════════════════════════════════════ SCENARIO SELECTOR UI
class ScenarioSelector{
  constructor(game){
    this.game=game;this.selArea='Solomon Sea';this.selHist=null;this.selMission='AUTO';this.activeTab='patrol';
    this.bind();this.renderCards();this.renderHistorical();
  }

  open(){
    audio.ensure();
    this.syncFooter();
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
    document.getElementById('profileExportBtn')?.addEventListener('click',()=>this.exportPlayerProfile());
    document.getElementById('profileImportBtn')?.addEventListener('click',()=>document.getElementById('profileImportFile')?.click());
    document.getElementById('profileImportFile')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)this.importPlayerProfile(f);e.target.value='';});
    document.querySelectorAll('.scen-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        this.activeTab=tab.dataset.stab;
        document.querySelectorAll('.scen-tab').forEach(t=>t.classList.toggle('active',t.dataset.stab===this.activeTab));
        document.getElementById('stabPatrol').style.display=this.activeTab==='patrol'?'grid':'none';
        document.getElementById('stabHistorical').style.display=this.activeTab==='historical'?'flex':'none';
        document.getElementById('stabSaveload').style.display=this.activeTab==='saveload'?'flex':'none';
        document.getElementById('stabCareer').style.display=this.activeTab==='career'?'flex':'none';
        const about=document.getElementById('stabAbout');if(about)about.style.display=this.activeTab==='about'?'flex':'none';
        if(this.activeTab==='saveload')this.renderSaveSlots();
        if(this.activeTab==='career')this.renderCareer();
        this.syncFooter();
      });
    });
  }

  syncFooter(){
    const launch=document.getElementById('scenLaunch');if(!launch)return;
    const launchTab=this.activeTab==='patrol'||this.activeTab==='historical';
    launch.style.display=launchTab?'':'none';
    if(!launchTab){launch.disabled=true;return;}
    if(this.activeTab==='historical'){
      launch.textContent='▶ Launch Historical Mission';
      launch.disabled=!this.selHist;
      launch.title=this.selHist?'':'Choose a historical mission first';
    }else{
      launch.textContent='▶ Launch Patrol';
      launch.disabled=!this.selArea;
      launch.title='';
    }
  }

  renderCards(){
    const c=document.getElementById('stabPatrol');if(!c)return;
    const missionOpts=[['AUTO','AUTO — varied patrol orders'],...(typeof MISSION_PRIMARY_TYPES!=='undefined'?MISSION_PRIMARY_TYPES:[]).map(k=>[k,(typeof MISSION_DEFINITIONS!=='undefined'&&MISSION_DEFINITIONS[k]?.title)||k.replaceAll('_',' ')])];
    c.innerHTML=Object.entries(PATROL_AREAS).map(([name,area])=>{
      const dl=String(area.difficulty||'MEDIUM').toUpperCase(),d=dl==='HARD'?{l:dl,cls:'diff-hard',s:'★★★'}:dl==='EASY'?{l:dl,cls:'diff-easy',s:'★☆☆'}:{l:dl,cls:'diff-med',s:'★★☆'};
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
    }).join('')+`<div class="hist-card" style="grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><div style="min-width:210px;flex:1"><h3 style="margin:0 0 4px">PRIMARY MISSION</h3><div class="hist-desc">One primary mission per patrol. AUTO chooses orders that suit the selected Pacific area.</div></div><select id="missionTypeSelect" class="tsel" style="min-width:250px;max-width:100%;">${missionOpts.map(([v,l])=>`<option value="${v}"${v===this.selMission?' selected':''}>${l}</option>`).join('')}</select></div>`;
    const ms=c.querySelector('#missionTypeSelect');if(ms){ms.addEventListener('change',()=>{this.selMission=ms.value;});if(typeof Picker!=='undefined')Picker.enhance(ms);}
    c.querySelectorAll('.area-card').forEach(card=>{
      card.addEventListener('click',()=>{
        this.selArea=card.dataset.area;
        c.querySelectorAll('.area-card').forEach(x=>x.classList.remove('selected'));
        card.classList.add('selected');this.syncFooter();
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
        this.selHist=card.dataset.id;
        c.querySelectorAll('.hist-card').forEach(x=>x.style.borderColor='');
        card.style.borderColor='var(--ok)';this.syncFooter();
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
        Torpedoes ${r.torpedoesFired||0} fired / ${r.torpedoHits||0} hits / ${r.torpedoDuds||0} duds · deck gun ${r.deckGunRounds||0} rounds / ${r.deckGunHits||0} hits · aircraft kills ${r.aircraftKills||0} / evaded ${r.aircraftEvaded||0}${opt}</div>
        ${r.replay?`<button class="career-aar-btn" data-aar-id="${r.id}" style="width:auto;margin:8px 0 0;padding:6px 9px;font-size:9.5px;border-color:var(--alert);color:var(--alert);">AFTER ACTION REPORT</button>`:''}
        ${ev?`<div style="margin-top:7px;font-size:10.5px;color:var(--muted);">${ev}</div>`:''}</div>`;
    }).join('');
    c.innerHTML=`<div class="hist-card"><h3>WAR RECORD</h3><div class="hist-desc">Score ${(car.totalScore||0).toLocaleString()} · ${(car.totalTonnage||0).toLocaleString()} tons · ${car.totalShips||0} ships</div><div style="margin-top:7px;">${badges||'<span style="color:var(--dim)">No commendations yet.</span>'}</div></div>`+
      (rows||'<div class="hist-card"><div class="hist-desc">No completed or lost patrols recorded yet.</div></div>');
    c.querySelectorAll?.('.career-aar-btn').forEach(b=>b.addEventListener('click',()=>{const r=(car.patrolHistory||[]).find(x=>x.id===b.dataset.aarId);if(r&&globalThis.aarController?.open)globalThis.aarController.open(r,{completed:false});}));
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

  async exportPlayerProfile(){
    try{
      const text=await SaveSystem.exportProfile(this.game.getSnapshot()),stamp=new Date().toISOString().slice(0,10);
      const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`periscope-patrol-profile-${stamp}.ppprofile.json`;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      globalThis.Toast?.ok?.('Player profile exported — keep the file somewhere safe.');
    }catch(e){console.warn('Profile export failed',e);alert(`Profile export failed: ${e?.message||e}`);}
  }

  async importPlayerProfile(file){
    try{
      if(!confirm('Import this player profile? Your local career, manual save slots and resumable patrol will be replaced.'))return;
      const text=await file.text(),result=await SaveSystem.importProfile(text);
      this.renderSaveSlots();this.renderCareer();
      const career=SaveSystem.getCareer(),score=document.getElementById('scenCareerScore'),meta=document.getElementById('scenCareerMeta');
      if(score)score.textContent=(career.totalScore||0).toLocaleString();
      if(meta)meta.textContent=`${career.totalShips||0} ships · ${(career.totalTonnage||0).toLocaleString()} tons · ${career.patrolHistory?.length||0} recorded patrols`;
      globalThis.Toast?.ok?.(`Profile imported — ${result.saves} save slot${result.saves===1?'':'s'}, ${result.patrols} patrol record${result.patrols===1?'':'s'}.`);
      // Offer the imported current patrol immediately. While it is pending,
      // SaveSystem suppresses autosave writes so the device we are importing ON
      // cannot overwrite the transferred boat before the player makes a choice.
      if(result.resumeState&&typeof AutoSave!=='undefined')AutoSave.offer();
    }catch(e){console.warn('Profile import failed',e);alert(`Profile import failed: ${e?.message||e}`);}
  }

  saveToSlot(slot){
    if(SaveSystem.save(slot,this.game.getSnapshot())){audio.playWaypoint();this.renderSaveSlots();}
    else alert('Save failed.');
  }

  loadSlot(slot){
    const state=SaveSystem.load(slot);
    if(!state){alert(`Load failed${SaveSystem.lastLoadError?`: ${SaveSystem.lastLoadError}`:'.'}`);return;}
    SaveSystem.releaseImportedResume?.();SaveSystem.autoClear?.();
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
    // The footer is shared by all tabs, but launching is not. Career and
    // Save/Load are review/management screens and must never fall through to
    // a random patrol. Historical missions also require an explicit choice.
    if(this.activeTab!=='patrol'&&this.activeTab!=='historical')return;
    if(this.activeTab==='historical'&&!this.selHist){globalThis.Toast?.warn?.('Choose a historical mission first.');return;}
    if(this.activeTab==='historical'&&this.selHist){
      const h=HISTORICAL_SCENARIOS.find(s=>s.id===this.selHist);
      if(h){
        const aKey=PATROL_AREAS[h.area]?h.area:null;
        // Historical missions must never silently fall back to another chart: that
        // turned the old Yellow Sea/Wahoo entry into a Solomon Sea patrol.
        if(!aKey){globalThis.Toast?.bad?.(`Historical chart missing: ${h.area}`);return;}
        SaveSystem.autoClear?.();
        this.game.dispatch({type:'NEW_PATROL',areaKey:aKey,startDate:h.date,difficulty:h.difficulty,missionType:h.missionType||'CONVOY_INTERDICTION'});
        const s=this.game.getSnapshot();
        Object.assign(s.world.environment,h.environment);
        rerollPatrolThermalLayer(s.world.environment,h.environment?.layerDepthFt);
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
    if(this.activeTab==='patrol'&&this.selArea){SaveSystem.autoClear?.();this.game.dispatch({type:'NEW_PATROL',areaKey:this.selArea,missionType:this.selMission||'AUTO'});this.close();}
  }
}

