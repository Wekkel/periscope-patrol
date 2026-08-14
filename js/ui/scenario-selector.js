// ═══════════════════════════════════════════════════ SCENARIO SELECTOR UI
class ScenarioSelector{
  constructor(game){
    this.game=game;
    const state=game.getSnapshot(),campaign=getCampaignProfile(state?.campaign?.campaignProfileId),party=resolveCampaignForRuntimeProfile(campaign?.id)||getWarPartyProfile(DEFAULT_GAME_IDENTITY.warPartyId);
    this.selCampaignId=state?.campaign?.campaignId||party?.campaignId||DEFAULT_GAME_IDENTITY.campaignId;this.selWarPartyId=state?.campaign?.warPartyId||party?.id||DEFAULT_GAME_IDENTITY.warPartyId;this.selArea=state?.campaign?.patrolArea||campaign?.defaultArea||null;this.selHist=null;this.selMission='AUTO';this.activeTab='patrol';
    this.bind();this.renderCards();this.renderHistorical();
  }

  activePatrolNeedsGuard(){
    const s=this.game?.getSnapshot?.(),status=s?.campaign?.missionStatus;
    return !!s&&s.playerSub?.mode!=='SUNK'&&['PATROL','RETURN TO BASE'].includes(status);
  }

  async confirmPatrolReplacement(action='continue'){
    if(!this.activePatrolNeedsGuard())return true;
    return DecisionDialog.confirm({title:'ACTIVE PATROL',message:`${action} will replace the current boat state. Manual save slots remain available.`,confirmLabel:'REPLACE PATROL',danger:true});
  }

  open(){
    audio.ensure();
    const current=this.game.getSnapshot(),campaign=getCampaignProfile(current?.campaign?.campaignProfileId),party=resolveCampaignForRuntimeProfile(campaign?.id);
    if(party&&party.id!==this.selWarPartyId){this.selCampaignId=party.campaignId;this.selWarPartyId=party.id;this.selArea=current.campaign.patrolArea||campaign.defaultArea;this.selMission='AUTO';this.renderCards();}
    // Opening the anchor/menu is the alternative acknowledgement path for the
    // persistent end-of-patrol AAR offer.
    if(typeof Toast!=='undefined')Toast.dismissRole?.('patrol-aar');
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

  campaignAccess(definition,career=SaveSystem.getCareer()){
    const defs=getSelectableCampaignDefinitions(),index=defs.findIndex(x=>x.id===definition.id);
    /* Atlantic-dev is deliberately open for testing. When this selector is
       promoted to MAIN, PP_BUILD.isDev becomes false and the progression rule
       below activates without maintaining a second campaign implementation. */
    if(PP_BUILD.isDev)return{unlocked:true,label:'DEV OPEN',successes:3,required:3};
    if(index<=0)return{unlocked:true,label:'AVAILABLE',successes:3,required:3};
    const previous=defs[index-1],successes=(career.patrolHistory||[]).filter(r=>r.campaignId===previous.id&&r.outcome==='COMPLETED').length,required=3;
    return{unlocked:successes>=required,label:successes>=required?'UNLOCKED':`${successes}/${required} successful patrols in ${previous.displayName}`,successes,required,previous};
  }

  renderCards(){
    const c=document.getElementById('stabPatrol');if(!c)return;
    const state=this.game?.getSnapshot?.(),activeCampaign=getCampaignProfile(state?.campaign?.campaignProfileId),definition=getCampaignDefinition(this.selCampaignId)||getCampaignDefinition(DEFAULT_GAME_IDENTITY.campaignId),
      parties=getSelectableWarParties(definition.id),party=parties.find(x=>x.id===this.selWarPartyId)||parties[0],
      campaign=getCampaignProfile(party?.runtimeCampaignProfileId||activeCampaign?.id),
      missionProfile=typeof getCampaignMissionProfile==='function'?getCampaignMissionProfile(campaign?.id):null,
      areaIds=Array.isArray(campaign?.patrolAreaIds)?campaign.patrolAreaIds:Object.keys(PATROL_AREAS);
    const missionTypes=(typeof MISSION_PRIMARY_TYPES!=='undefined'?MISSION_PRIMARY_TYPES:[]).filter(k=>missionProfile?.definitions?.[k]);
    const missionOpts=[['AUTO','AUTO — varied patrol orders'],...missionTypes.map(k=>[k,missionProfile.definitions[k].title||k.replaceAll('_',' ')])];
    const missionHint=missionProfile?.autoDescription||'One primary mission per patrol. AUTO chooses orders appropriate to the selected patrol area.';
    const defs=getSelectableCampaignDefinitions(),career=SaveSystem.getCareer(),subProfile=getSubmarineProfile(party.submarineProfileId);
    const campaignPicker=`<section class="campaign-command" style="grid-column:1/-1">
      <div class="campaign-step"><span>01</span><div><b>CAMPAIGN</b><small>Choose the theatre. Later theatres require three successful patrols in the previous campaign.</small></div></div>
      <div class="campaign-choice-grid" role="listbox" aria-label="Campaign">${defs.map((x,i)=>{const access=this.campaignAccess(x,career),selected=x.id===definition.id;return`<button type="button" class="campaign-choice${selected?' selected':''}${access.unlocked?'':' locked'}" data-campaign-id="${x.id}" role="option" aria-selected="${selected}" ${access.unlocked?'':'disabled'}><span class="campaign-index">${String(i+1).padStart(2,'0')} · ${x.theaterId.replaceAll('-',' ')}</span><strong>${x.displayName}</strong><small>${x.historicalContext}</small><em>${access.unlocked?'◆':'🔒'} ${access.label}</em></button>`;}).join('')}</div>
      <div class="campaign-step"><span>02</span><div><b>WAR PARTY</b><small>Your navy changes boat, terminology, equipment and doctrine.</small></div></div>
      <div class="war-party-choice-grid" role="listbox" aria-label="War party">${parties.map(x=>{const faction=getFactionProfile(x.factionId),boat=getSubmarineProfile(x.submarineProfileId),selected=x.id===party?.id;return`<button type="button" class="war-party-choice${selected?' selected':''}" data-war-party-id="${x.id}" role="option" aria-selected="${selected}"><span>${x.shortName}</span><div><strong>${faction.displayName}</strong><b>${x.commandName}</b><small>${boat.displayName} · ${x.doctrine}</small></div></button>`;}).join('')}</div>
      <div class="campaign-step"><span>03</span><div><b>BOAT / DATE / REFIT</b><small>Equipment availability follows the selected patrol date.</small></div></div>
      <div class="boat-assignment"><strong>${subProfile.displayName}</strong><span>${party.dateWindow[0]} — ${party.dateWindow[1]}</span><p>${party.doctrine}</p></div>
      <div class="campaign-step mission-step"><span>04</span><div><b>PATROL &amp; MISSION</b><small>Options below belong to this campaign and war party.</small></div></div>
    </section>`;
    c.innerHTML=campaignPicker+areaIds.map(name=>[name,PATROL_AREAS[name]]).filter(([,area])=>!!area).map(([name,area])=>{
      const dl=String(area.difficulty||'MEDIUM').toUpperCase(),d=dl==='HARD'?{l:dl,cls:'diff-hard',s:'★★★'}:dl==='EASY'?{l:dl,cls:'diff-easy',s:'★☆☆'}:{l:dl,cls:'diff-med',s:'★★☆'};
      return `<div class="area-card${name===this.selArea?' selected':''}" data-area="${name}">
        <h3>${(area.displayName||name).toUpperCase()}</h3>
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
    }).join('')+`<div class="hist-card" style="grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><div style="min-width:210px;flex:1"><h3 style="margin:0 0 4px">PRIMARY MISSION</h3><div class="hist-desc">${missionHint}</div></div><select id="missionTypeSelect" class="tsel" style="min-width:250px;max-width:100%;">${missionOpts.map(([v,l])=>`<option value="${v}"${v===this.selMission?' selected':''}>${l}</option>`).join('')}</select></div>`;
    c.querySelectorAll('[data-campaign-id]').forEach(button=>button.addEventListener('click',()=>{this.selCampaignId=button.dataset.campaignId;const next=getSelectableWarParties(this.selCampaignId)[0];if(!next)return;this.selWarPartyId=next.id;const runtime=getCampaignProfile(next.runtimeCampaignProfileId);this.selArea=runtime.defaultArea;this.selMission='AUTO';this.renderCards();this.syncFooter();}));
    c.querySelectorAll('[data-war-party-id]').forEach(button=>button.addEventListener('click',()=>{this.selWarPartyId=button.dataset.warPartyId;const next=getWarPartyProfile(this.selWarPartyId),runtime=getCampaignProfile(next.runtimeCampaignProfileId);this.selArea=runtime.defaultArea;this.selMission='AUTO';this.renderCards();this.syncFooter();}));
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
      const party=slot.warPartyId&&getWarPartyProfile(slot.warPartyId),campaign=slot.campaignId&&getCampaignDefinition(slot.campaignId),identity=[campaign?.displayName,party&&getFactionProfile(party.factionId)?.shortName].filter(Boolean).join(' · ');
      return`<div class="save-slot">
        <div class="slot-info">
          <div class="slot-name">Slot ${slot.slot+1} — ${identity?identity+' · ':''}${slot.area} | Patrol #${slot.patrol}</div>
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
    }catch(e){console.warn('Profile export failed',e);Toast.bad(`Profile export failed: ${e?.message||e}`);}
  }

  async importPlayerProfile(file){
    try{
      if(!await DecisionDialog.confirm({title:'IMPORT PROFILE',message:'Your local career, manual save slots and resumable patrol will be replaced.',confirmLabel:'IMPORT',danger:true}))return;
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
    }catch(e){console.warn('Profile import failed',e);Toast.bad(`Profile import failed: ${e?.message||e}`);}
  }

  saveToSlot(slot){
    if(SaveSystem.save(slot,this.game.getSnapshot())){audio.event?.('SAVE_CONFIRMED');this.renderSaveSlots();}
    else Toast.bad('Save failed.');
  }

  async loadSlot(slot){
    const state=SaveSystem.load(slot);
    if(!state){Toast.bad(`Load failed${SaveSystem.lastLoadError?`: ${SaveSystem.lastLoadError}`:'.'}`);return;}
    if(!await this.confirmPatrolReplacement(`Loading slot ${slot+1}`))return;
    SaveSystem.releaseImportedResume?.();SaveSystem.autoClear?.();
    Object.assign(this.game.state,state);
    this.close();
    showBriefing(state.campaign.patrolArea,state);
    audio.event?.('RESUME_CONFIRMED');
  }

  async deleteSlot(slot){
    if(!await DecisionDialog.confirm({title:'DELETE SAVE',message:`Delete manual save slot ${slot+1}? This cannot be undone.`,confirmLabel:'DELETE',danger:true}))return;
    SaveSystem.delete(slot);this.renderSaveSlots();
  }

  async launch(){
    // The footer is shared by all tabs, but launching is not. Career and
    // Save/Load are review/management screens and must never fall through to
    // a random patrol. Historical missions also require an explicit choice.
    if(this.activeTab!=='patrol'&&this.activeTab!=='historical')return;
    if(this.activeTab==='historical'&&!this.selHist){globalThis.Toast?.warn?.('Choose a historical mission first.');return;}
    if(!await this.confirmPatrolReplacement('Launching a new mission'))return;
    if(this.activeTab==='historical'&&this.selHist){
      const h=HISTORICAL_SCENARIOS.find(s=>s.id===this.selHist);
      if(h){
        const aKey=PATROL_AREAS[h.area]?h.area:null;
        // Historical missions must never silently fall back to another chart: that
        // turned the old Yellow Sea/Wahoo entry into a Solomon Sea patrol.
        if(!aKey){globalThis.Toast?.bad?.(`Historical chart missing: ${h.area}`);return;}
        SaveSystem.autoClear?.();
        const hp=h.campaignProfileId&&getCampaignProfile(h.campaignProfileId),gameIdentity=hp?{theaterId:hp.theaterId,playerFactionId:hp.playerFactionId,campaignProfileId:hp.id,submarineProfileId:hp.submarineProfileId}:DEFAULT_GAME_IDENTITY;
        this.game.dispatch({type:'NEW_PATROL',areaKey:aKey,startDate:h.date,difficulty:h.difficulty,missionType:h.missionType||'CONVOY_INTERDICTION',gameIdentity});
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
        audio.event?.('MISSION_START');this.close();showBriefing(aKey,s);return;
      }
    }
    if(this.activeTab==='patrol'&&this.selArea){const party=getWarPartyProfile(this.selWarPartyId),campaign=getCampaignProfile(party?.runtimeCampaignProfileId),gameIdentity=campaign?{campaignId:party.campaignId,warPartyId:party.id,theaterId:campaign.theaterId,playerFactionId:campaign.playerFactionId,campaignProfileId:campaign.id,submarineProfileId:campaign.submarineProfileId}:DEFAULT_GAME_IDENTITY;SaveSystem.autoClear?.();this.game.dispatch({type:'NEW_PATROL',areaKey:this.selArea,missionType:this.selMission||'AUTO',gameIdentity});audio.event?.('MISSION_START');this.close();}
  }
}
