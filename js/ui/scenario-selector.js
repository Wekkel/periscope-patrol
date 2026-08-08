// ═══════════════════════════════════════════════════ SCENARIO SELECTOR UI
class ScenarioSelector{
  constructor(game){
    this.game=game;this.selArea='Solomon Sea';this.selHist=null;this.activeTab='patrol';
    this.bind();this.renderCards();this.renderHistorical();
  }

  open(){
    audio.ensure();
    const career=SaveSystem.getCareer();
    const el=document.getElementById('scenCareerScore');
    if(el)el.textContent=(career.totalScore||0).toLocaleString();
    document.getElementById('scenarioOverlay')?.classList.add('open');
    this.renderSaveSlots();
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
        ['Patrol','Historical','Saveload'].forEach(n=>{
          const el=document.getElementById('stab'+n);
          if(el)el.style.display=this.activeTab===n.toLowerCase()?'':' none';
        });
        document.getElementById('stabPatrol').style.display=this.activeTab==='patrol'?'grid':'none';
        document.getElementById('stabHistorical').style.display=this.activeTab==='historical'?'flex':'none';
        document.getElementById('stabSaveload').style.display=this.activeTab==='saveload'?'flex':'none';
        if(this.activeTab==='saveload')this.renderSaveSlots();
      });
    });
  }

  renderCards(){
    const c=document.getElementById('stabPatrol');if(!c)return;
    const diffs={'Solomon Sea':{l:'MEDIUM',cls:'diff-med',s:'★★☆'},'Bismarck Sea':{l:'MEDIUM',cls:'diff-med',s:'★★☆'},
      'Luzon Strait':{l:'HARD',cls:'diff-hard',s:'★★★'},'Truk Approaches':{l:'HARD',cls:'diff-hard',s:'★★★'},'Java Sea':{l:'EASY',cls:'diff-easy',s:'★☆☆'}};
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
    }).join('');
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
        this.game.dispatch({type:'NEW_PATROL',areaKey:aKey});
        const s=this.game.getSnapshot();
        Object.assign(s.world.environment,h.environment);
        s.campaign.patrolBonus=h.patrolBonus;
        s.campaign.missionName=h.name;
        // Fix 7: set campaign start date from historical scenario
        s.campaign.startDate=h.date;
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
    if(this.selArea){this.game.dispatch({type:'NEW_PATROL',areaKey:this.selArea});this.close();}
  }
}

