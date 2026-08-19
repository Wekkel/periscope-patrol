// ═══════════════════════════════════════════════════ DESKTOP DOM VIEW
class DomView{
  constructor(){
    this.clock=document.getElementById('clock');
    this.mode=document.getElementById('mode');
    this.station=document.getElementById('station');
    this.timescale=document.getElementById('timescale');
    this.hArea=document.getElementById('hArea');
    this.hScore=document.getElementById('hScore');
    this.ordersGrid=document.getElementById('ordersGrid');
    this.missionStatus=document.getElementById('missionStatus');
    this.damageReport=document.getElementById('damageReport');
    this.gaugeReadout=document.getElementById('gaugeReadout');
    this.batteryBar=document.getElementById('batteryBar');
    this.fuelBar=document.getElementById('fuelBar');
    this.hullBar=document.getElementById('hullBar');
    this.alertEl=document.getElementById('deskAlert');
    this.logEl=document.getElementById('deskLog');
    this.inputHint=document.getElementById('deskInputHint');
  }
  render(state,layout){
    const viewModel=buildHudViewModel(state,layout);
    return this._renderLegacy(state,viewModel);
  }
  _renderLegacy(state,viewModel){
    const sub=state.playerSub; const p=sub.propulsion; const tdc=state.tdc;
    const ui=getPlayerStationPresentation(state);this.applyPresentation(state,ui);
    if(this.clock) this.clock.textContent=viewModel.time.desktopClockText;
    if(this.mode)  this.mode.textContent=sub.mode;
    if(this.station) this.station.textContent=state.tactical.activeStation;
    if(this.inputHint){
      const hints={
        TACTICAL:'Drag compass/depth · [ ] heading · , . RPM · PgUp/PgDn depth',
        BRIDGE:'Drag to scan · wheel binocular zoom · ← → train',
        SOUND:'Drag or wheel to train · ← → fine train · mark a bearing',
        PERISCOPE:'Drag to train · wheel optical zoom · click a contact',
        MAP:'Drag / arrows / two fingers to pan · pinch or Ctrl+wheel zoom · click waypoint or track',
        DECK_GUN:'Drag to aim · wheel or ↑ ↓ elevation · ← → fine train'
      };
      this.inputHint.textContent=hints[state.tactical.activeStation]||'';
    }
    if(this.timescale) this.timescale.textContent=viewModel.time.scaleText;
    const rpmInput=document.getElementById('rpmInput'),maxRpm=p.characteristics?.normalizedMaxRpm??450;if(rpmInput)rpmInput.max=String(maxRpm);
    const depthMax=Math.min(600,Math.max(300,Math.floor((sub.damage.crushDepthFeet||420)-10)));for(const id of ['depthInput','mDpt']){const el=document.getElementById(id);if(el)el.max=String(depthMax);}
    const tsel=document.getElementById('timeSelect');
    if(tsel&&tsel!==document.activeElement&&+tsel.value!==state.time.timeScale){tsel.value=String(state.time.timeScale);tsel._pkLabel?.();}
    const dudSel=document.getElementById('dudSelect');
    if(dudSel&&dudSel!==document.activeElement&&dudSel.value!==tdc.dudMode)dudSel.value=tdc.dudMode;
    const torpSel=document.getElementById('torpTypeSelect');if(torpSel){const keys=torpedoSpecKeysForState(state),oldKeys=[...(torpSel.options||[])].map(o=>o.value);if(keys.join('|')!==oldKeys.join('|'))torpSel.innerHTML=keys.map(k=>`<option value="${k}">${torpedoOptionLabel(k)}</option>`).join('');for(const o of torpSel.options||[])o.disabled=typeof isTorpedoAvailableForState==='function'?!isTorpedoAvailableForState(state,o.value):false;if(torpSel!==document.activeElement&&torpSel.value!==tdc.torpedoSpecKey)torpSel.value=tdc.torpedoSpecKey;}
    if(this.hArea)  this.hArea.textContent=PATROL_AREAS[state.campaign.patrolArea]?.displayName||state.campaign.patrolArea;
    if(this.hScore) this.hScore.textContent=viewModel.mission.scoreText;
    {const el=document.getElementById('hTimeConditions');if(el)el.textContent=viewModel.time.desktopConditionsText;}
    const headingExact=document.getElementById('headingNumberInput'),rpmExact=document.getElementById('rpmNumberInput'),depthExact=document.getElementById('depthNumberInput');if(headingExact&&headingExact!==document.activeElement)headingExact.value=String(Math.round(sub.orderedHeading));if(rpmExact&&rpmExact!==document.activeElement)rpmExact.value=String(Math.round(p.orderedRpm));if(depthExact&&depthExact!==document.activeElement)depthExact.value=String(Math.round(sub.orderedDepthFeet));
    document.querySelectorAll('[data-scope-zoom]').forEach(b=>b.classList.toggle('on',Number(b.dataset.scopeZoom)===Number(state.tactical.periscopeZoom)));
    document.querySelectorAll('#stationTabs button').forEach(b=>{const map={stationTactical:'TACTICAL',stationBridge:'BRIDGE',stationSound:'SOUND',stationPeriscope:'PERISCOPE',stationMap:'MAP',stationDeckGun:'DECK_GUN'};b.classList.toggle('active',map[b.id]===state.tactical.activeStation);});
    const bc=document.getElementById('bridgeControls');if(bc)bc.classList.toggle('on',state.tactical.activeStation==='BRIDGE');
    document.getElementById('mapWeatherButton')?.classList.toggle('on',!!state.map.weatherOverlay);
    const sc=document.getElementById('soundControls');if(sc)sc.classList.toggle('on',state.tactical.activeStation==='SOUND');
    const sensorUi=getPlayerSensorPresentation(state),rb=document.getElementById('soundRadar');if(rb){rb.style.display=sensorUi.surfaceSearchRadar?'':'none';rb.classList.toggle('on',state.tactical.soundDisplay==='RADAR');const sp=rb.querySelector?.('span');if(sp)sp.textContent=state.tactical.soundDisplay==='RADAR'?(sensorUi.passiveSound?.label||'Passive Sound'):(sensorUi.surfaceSearchRadar?.label||'Surface Radar');}const eb=document.getElementById('soundEcho');if(eb){eb.style.display=sensorUi.activeEcho?'':'none';if(!eb.classList.contains('confirm')){const sp=eb.querySelector?.('span');if(sp)sp.textContent=sensorUi.activeEcho?.label||'Active Echo';}}
    const bb=document.getElementById('bridgeBino');if(bb){bb.classList.toggle('on',viewModel.display.bridgeBinoText!=='Binoculars');const span=bb.querySelector?.('span');if(span)span.textContent=viewModel.display.bridgeBinoText;}
    const ds=document.getElementById('deckGunStatus');
    if(ds)ds.textContent=viewModel.display.deckGunStatus;
    const rp=sub.damage.repairPriority||'FLOODING';
    const ids={FLOODING:'dcFloodButton',PROPULSION:'dcPropButton',STEERING:'dcSteerButton',OPTICS_FIRE_CONTROL:'dcOpticsButton'};
    for(const [k,id] of Object.entries(ids))document.getElementById(id)?.classList.toggle('on',k===rp);
    const dn=document.getElementById('deskDcNote');if(dn)dn.textContent=viewModel.damage.dcNote;
    this.renderAlerts(state);
    this.renderOrders(sub,state,viewModel);
    {const burden=viewModel.damage.burden;if(this._damageBurden!=null&&burden>this._damageBurden+.35){const el=document.getElementById('deskDamage');el?.classList.remove('damage-pulse');void el?.offsetWidth;el?.classList.add('damage-pulse');}this._damageBurden=burden;}
    this.renderDamage(sub,viewModel);
    this.renderGauges(sub,state,viewModel);
    if(this.batteryBar) this.batteryBar.style.width=`${viewModel.vitals.battery.raw}%`;
    if(this.fuelBar)    this.fuelBar.style.width=`${viewModel.vitals.fuel.raw}%`;
    if(this.hullBar)    this.hullBar.style.width=`${viewModel.vitals.hull.raw}%`;
    for(const [id,v] of [['batteryPct',viewModel.vitals.battery.value],['fuelPct',viewModel.vitals.fuel.value],['hullPct',viewModel.vitals.hull.value]]){const el=document.getElementById(id);if(el)el.textContent=v;}
    if(this.logEl){
      const cap=viewModel.log.captain;
      const capHtml=cap.length?`<div style="color:var(--alert);letter-spacing:1px;margin-bottom:4px;">CAPTAIN'S LOG</div>`+
        cap.map(e=>`<div class="log-entry"><b>${e.date}</b> · ${e.text}</div>`).join('')+
        `<div style="color:var(--dim);letter-spacing:1px;margin:8px 0 4px;">FULL PATROL LOG</div>`:'';
      this.logEl.innerHTML=capHtml+viewModel.log.patrol.map(e=>`<div class="log-entry ${e.level==='warn'?'warn':e.level==='bad'?'bad':''}">${e.time} ${e.text}</div>`).join('');
    }
  }
  applyPresentation(state,ui){
    if(this._presentationId===ui.id)return;this._presentationId=ui.id;
    document.documentElement.dataset.stationTheme=ui.theme||ui.id;
    const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
    const fwd=state.weapons.tubes.filter(t=>t.pos==='FWD').map(t=>t.id),aft=state.weapons.tubes.filter(t=>t.pos==='AFT').map(t=>t.id),t=ui.tubes||{},g=ui.gauges||{},o=ui.orders||{},sub=getSubmarineProfile(state.playerSub.profileId);
    set('deskBoatTitle',`Periscope Patrol — ${sub?.displayName||'Submarine'}`);
    set('touchBoatTitle',sub?.displayName||'Submarine');
    set('deskHeadingLabel',`Ordered ${o.heading||'Heading'}`);set('deskPowerLabel',`Ordered ${o.power||'RPM'}`);set('deskDepthLabel',`Ordered ${o.depth||'Depth'}`);
    set('deskFwdTubeTitle',`${t.forwardTitle||'Fwd Tubes'} (${fwd.join('–')})`);
    set('deskAftTubeTitle',`${t.aftTitle||'Aft Tubes'} (${aft.join('–')})`);
    set('touchTubeTitle',`${t.roomTitle||'Tubes'} — ${t.flood||'flood'} / ${t.fire||'fire'}`);
    const eng=document.getElementById('touchEngineTitle')?.firstChild;if(eng)eng.nodeValue=(g.power||'Engine')+' ';
    const dep=document.getElementById('touchDepthTitle')?.firstChild;if(dep)dep.nodeValue=(g.depth||'Depth')+' ';
    set('hkDepthStep',`Ordered ${String(g.depth||'depth').toLowerCase()} −/+ ${ui.depth?.factor<.9?'3 m':'10 ft'}`);
    set('periscopeButton',`${g.depth||'Periscope depth'} (${playerDepthDisplay(state,ui.depth?.scopeFeet||55,0)})`);
    set('diveButton',`${g.depth||'Dive'} (${playerDepthDisplay(state,100,0)})`);
    const qd=document.querySelector('#qsDepth .qs-l');if(qd)qd.textContent=`${String(g.depth||'DEPTH').toUpperCase()} ⇅`;
    const qh=document.querySelector('#qsSpeed .qs-l');if(qh)qh.textContent=`${String(g.power||'SPEED').toUpperCase()} ⇅`;
  }
  renderAlerts(state){
    const W=state.playerSub.damage.warnings||[{level:'normal',text:'SYSTEMS NOMINAL'}];
    if(this.alertEl) this.alertEl.innerHTML=W.map(w=>`<span class="${w.level}">${w.text}</span>`).join('<span style="color:#2f5f56"> ▪ </span>');
  }
  renderOrders(sub,state,viewModel){
    if(!this.ordersGrid) return;
    const p=sub.propulsion; const tdc=state.tdc,ui=getPlayerStationPresentation(state),o=ui.orders||{};
    const ch=(a,b)=>String(a)!==String(b);
    const row=(l,c,o,f)=>`<span class="lbl">${l}</span><span class="val ${ch(c,o)?'changed':''}">${f(c)} → ${f(o)}</span>`;
    this.ordersGrid.innerHTML=
      row(o.heading||'Heading',viewModel.navigation.orders.heading,viewModel.navigation.orders.orderedHeading,v=>v)+
      row(o.depth||'Depth',viewModel.navigation.orders.depth,viewModel.navigation.orders.orderedDepth,v=>v)+
      row(o.power||'RPM',viewModel.navigation.orders.actualRpm,viewModel.navigation.orders.orderedRpm,v=>v)+
      `<span class="lbl">${o.speed||'Speed'}</span><span class="val">${viewModel.vitals.speed.value}</span>`+
      `<span class="lbl">${o.engine||'Engine'}</span><span class="val">${p.engineMode}</span>`+
      `<span class="lbl">${o.ballast||'Ballast'}</span><span class="val">${sub.ballastState}</span>`+
      `<span class="lbl">${o.silent||'Silent'}</span><span class="val ${sub.stealth.silentRunning?'changed':''}">${sub.stealth.silentRunning?'ON':'OFF'}</span>`+
      `<span class="lbl">TDC</span><span class="val">${tdc.status}</span>`+
      `<span class="lbl">Solution</span><span class="val">${viewModel.fire.solutionText}</span>`+
      `<span class="lbl">Launch</span><span class="val">${tdc.launchBank||'FWD'} · ${tdc.launchGeometry||'--'}</span>`+
      `<span class="lbl">Tube turn</span><span class="val">${viewModel.fire.tubeTurnText}</span>`+
      `<span class="lbl">Gyro</span><span class="val">${viewModel.fire.gyroText}</span>`+
      `<span class="lbl">AoB</span><span class="val">${viewModel.fire.aobText}</span>`+
      `<span class="lbl">TtI</span><span class="val">${viewModel.fire.ttiText}</span>`+
      `<span class="lbl">Torps</span><span class="val">${viewModel.vitals.torpedoes.value}</span>`+
      `<span class="lbl">Hits/Duds</span><span class="val">${state.weapons.hits.length}/${(state.weapons.duds||[]).length}</span>`;

    // Tube status
    const te=document.getElementById('tubeStatusDisplay');
    if(te) te.innerHTML=viewModel.weapons.tubes.map(t=>`<span style="color:${t.status==='READY'?'var(--ok)':t.status==='EMPTY'?'var(--danger)':'var(--muted)'}">T${t.id}[${t.position}] ${t.type}: ${t.status}${t.reloadText?` ${t.reloadText}`:''}</span>`).join('<br>');

    // TDC note
    const ne=document.getElementById('tdcSolutionNote');
    if(ne){
      ne.style.color=viewModel.fire.rangeBand?(viewModel.fire.rangeBand==='IN'?'var(--ok)':viewModel.fire.rangeBand==='BORDERLINE'?'var(--alert)':'var(--danger)'):(viewModel.fire.solutionNumber>70?'var(--ok)':viewModel.fire.solutionNumber>40?'var(--alert)':'var(--danger)');
      ne.textContent=tdc.targetId
        ?`${tdc.status} — Sol:${viewModel.fire.solutionText} · ${tdc.launchBank||'FWD'} · ${tdc.launchGeometry||'--'} · tube ${viewModel.fire.tubeTurnText} · ${viewModel.fire.rangeText}Dud:${viewModel.fire.dudText} · ${tdc.torpedoType}`
        :'No target.';
    }

    const camp=state.campaign;
    if(this.missionStatus){
      const opt=(camp.optionalObjectives||[]).map(o=>{
        const result=o.result&&o.result!=='not_attempted'?` · ${o.result.toUpperCase()}`:'';
        return `<span style="color:${o.done?'var(--ok)':'var(--alert)'}">${o.done?'✓':'◇'} OPTIONAL — ${o.text}${result}</span>`;
      }).join('<br>');
      const pm=camp.primaryMission,progress=viewModel.mission.progressText;
      this.missionStatus.innerHTML=
        `<strong style="color:var(--alert)">${viewModel.mission.title}</strong> <span style="color:var(--dim);font-size:10px;">${viewModel.mission.status}</span><br>`+
        (progress?`<span style="color:var(--alert);font-size:10px;">${progress}</span><br>`:'')+
        viewModel.mission.objectives.map(o=>`<span style="color:${o.done?'var(--ok)':'var(--muted)'}">${o.done?'✓':'○'} ${o.text}</span>`).join('<br>')+
        (viewModel.mission.optionalObjectives.length?`<br>${viewModel.mission.optionalObjectives.map(o=>`<span style="color:${o.done?'var(--ok)':'var(--alert)'}">${o.done?'✓':'◇'} OPTIONAL — ${o.text}${o.result?` · ${o.result}`:''}</span>`).join('<br>')}`:'')+
        `<br><span style="color:var(--muted);font-size:10px;">Tonnage: ${viewModel.mission.tonnageText}t | #${viewModel.mission.patrolNumber} | Career: ${viewModel.mission.scoreText}</span>`;
    }
  }
  renderDamage(sub,viewModel){
    if(!this.damageReport) return;
    this.damageReport.innerHTML=viewModel.damage.desktopHtml;
  }
  renderGauges(sub,state,viewModel){
    if(!this.gaugeReadout) return;
    const v=viewModel.vitals,sys=viewModel.systems;
    this.gaugeReadout.innerHTML=
      `<span>Contacts</span><strong>${sys.contacts}</strong>`+
      `<span>Visibility</span><strong>${sys.visibilityText}</strong>`+
      `<span>Weather</span><strong>${sys.weather}</strong>`+
      `<span>Sea state</span><strong>${sys.seaStateText}</strong>`+
      `<span>Enemy alert</span><strong>${sys.alertLevel}</strong>`+
      `<span>DCs active</span><strong>${sys.activeDepthCharges}</strong>`+
      `<span>Noise sig</span><strong>${sys.noiseText}</strong>`+
      `<span>Shallow zone</span><strong style="color:${sys.shallowZone?'var(--alert)':'var(--muted)'}">${sys.shallowZone?'YES':'NO'}</strong>`+
      `<span>Keel clearance</span><strong style="color:${v.underKeel.state==='critical'?'var(--alert)':'var(--ok)'}">${v.underKeel.value}</strong>`+
      `<span>Radar fit</span><strong>${sys.radar}</strong>`+
      `<span>Score</span><strong>${sys.scoreText}</strong>`+
      `<span>Area</span><strong>${sys.areaText}</strong>`;
  }
}
