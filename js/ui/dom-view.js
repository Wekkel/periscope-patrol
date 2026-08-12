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
  }
  render(state){
    const sub=state.playerSub; const p=sub.propulsion; const tdc=state.tdc;
    if(this.clock) this.clock.textContent=Math.floor(state.time.elapsedSeconds).toString().padStart(5,'0');
    if(this.mode)  this.mode.textContent=sub.mode;
    if(this.station) this.station.textContent=state.tactical.activeStation;
    if(this.timescale) this.timescale.textContent=state.time.timeScale===0?'PAUSED':`${state.time.timeScale}x`;
    const tsel=document.getElementById('timeSelect');
    if(tsel&&tsel!==document.activeElement&&+tsel.value!==state.time.timeScale){tsel.value=String(state.time.timeScale);tsel._pkLabel?.();}
    const dudSel=document.getElementById('dudSelect');
    if(dudSel&&dudSel!==document.activeElement&&dudSel.value!==tdc.dudMode)dudSel.value=tdc.dudMode;
    const torpSel=document.getElementById('torpTypeSelect');if(torpSel){for(const o of torpSel.options||[])o.disabled=typeof isTorpedoAvailableForState==='function'?!isTorpedoAvailableForState(state,o.value):false;if(torpSel!==document.activeElement&&torpSel.value!==tdc.torpedoSpecKey)torpSel.value=tdc.torpedoSpecKey;}
    if(this.hArea)  this.hArea.textContent=state.campaign.patrolArea;
    if(this.hScore) this.hScore.textContent=state.campaign.score.toLocaleString();
    document.querySelectorAll('#stationTabs button').forEach(b=>{const map={stationTactical:'TACTICAL',stationBridge:'BRIDGE',stationSound:'SOUND',stationPeriscope:'PERISCOPE',stationMap:'MAP',stationDeckGun:'DECK_GUN'};b.classList.toggle('active',map[b.id]===state.tactical.activeStation);});
    const bc=document.getElementById('bridgeControls');if(bc)bc.classList.toggle('on',state.tactical.activeStation==='BRIDGE');
    document.getElementById('mapWeatherButton')?.classList.toggle('on',!!state.map.weatherOverlay);
    const sc=document.getElementById('soundControls');if(sc)sc.classList.toggle('on',state.tactical.activeStation==='SOUND');
    const rb=document.getElementById('soundRadar');if(rb){rb.classList.toggle('on',state.tactical.soundDisplay==='RADAR');const sp=rb.querySelector?.('span');if(sp)sp.textContent=state.tactical.soundDisplay==='RADAR'?'Passive Sound':'SJ Radar';}
    const bz=bridgeZoomAmount(state),bb=document.getElementById('bridgeBino');if(bb){bb.classList.toggle('on',bz>.05);const span=bb.querySelector?.('span');if(span)span.textContent=bz>.05?`Binos ${bridgeMagnification(state).toFixed(1)}×`:'Binoculars';}
    const dg=state.weapons.deckGun,ds=document.getElementById('deckGunStatus');
    if(ds&&dg)ds.textContent=`${dg.manned?'CREW TOPSIDE — automatic':'crew secured — enter GUN station to man automatically'} · train ${dg.trainDeg.toFixed(1)}° · elev ${dg.elevationDeg.toFixed(1)}° · ammo ${dg.ammo} · drag 3D view to aim`;
    const rp=sub.damage.repairPriority||'FLOODING';
    const ids={FLOODING:'dcFloodButton',PROPULSION:'dcPropButton',STEERING:'dcSteerButton',OPTICS_FIRE_CONTROL:'dcOpticsButton'};
    for(const [k,id] of Object.entries(ids))document.getElementById(id)?.classList.toggle('on',k===rp);
    const dn=document.getElementById('deskDcNote');if(dn){const cap=Math.round(clamp(1-(sub.damage.pumpDamage||0)*.78,.16,1)*100);dn.textContent=`Priority ${repairPriorityLabel(rp)} · ${sub.damage.damageControlActive?'parties working':'standby'} · pumps ${sub.damage.pumpTripped?'TRIPPED':sub.damage.pumpActive?`ON ${cap}%`:`ready ${cap}%`}${sub.damage.driveBankOffline?' · drive bank offline':''}`;}
    this.renderAlerts(state);
    this.renderOrders(sub,state);
    this.renderDamage(sub);
    this.renderGauges(sub,state);
    if(this.batteryBar) this.batteryBar.style.width=`${p.battery}%`;
    if(this.fuelBar)    this.fuelBar.style.width=`${p.fuel}%`;
    if(this.hullBar)    this.hullBar.style.width=`${sub.damage.hullIntegrity}%`;
    if(this.logEl){
      const cap=(state.campaign.importantEvents||[]).slice().reverse();
      const capHtml=cap.length?`<div style="color:var(--alert);letter-spacing:1px;margin-bottom:4px;">CAPTAIN'S LOG</div>`+
        cap.map(e=>`<div class="log-entry"><b>${e.date||('T+'+fmtTime(e.t))}</b> · ${e.text}</div>`).join('')+
        `<div style="color:var(--dim);letter-spacing:1px;margin:8px 0 4px;">FULL PATROL LOG</div>`:'';
      this.logEl.innerHTML=capHtml+state.log.map(e=>`<div class="log-entry ${e.level==='warn'?'warn':e.level==='bad'?'bad':''}">T+${fmtTime(e.t)} ${e.message}</div>`).join('');
    }
  }
  renderAlerts(state){
    const W=state.playerSub.damage.warnings||[{level:'normal',text:'SYSTEMS NOMINAL'}];
    if(this.alertEl) this.alertEl.innerHTML=W.map(w=>`<span class="${w.level}">${w.text}</span>`).join('<span style="color:#2f5f56"> ▪ </span>');
  }
  renderOrders(sub,state){
    if(!this.ordersGrid) return;
    const p=sub.propulsion; const tdc=state.tdc;
    const ch=(a,b)=>Math.abs(a-b)>0.5;
    const row=(l,c,o,f)=>`<span class="lbl">${l}</span><span class="val ${ch(c,o)?'changed':''}">${f(c)} → ${f(o)}</span>`;
    this.ordersGrid.innerHTML=
      row('Heading',sub.heading,sub.orderedHeading,fmtDeg)+
      row('Depth',sub.depthFeet,sub.orderedDepthFeet,v=>`${v.toFixed(0)}ft`)+
      row('RPM',p.actualRpm,p.orderedRpm,v=>v.toFixed(0))+
      `<span class="lbl">Speed</span><span class="val">${p.speedKnots.toFixed(1)} kn</span>`+
      `<span class="lbl">Engine</span><span class="val">${p.engineMode}</span>`+
      `<span class="lbl">Ballast</span><span class="val">${sub.ballastState}</span>`+
      `<span class="lbl">Silent</span><span class="val ${sub.stealth.silentRunning?'changed':''}">${sub.stealth.silentRunning?'ON':'OFF'}</span>`+
      `<span class="lbl">TDC</span><span class="val">${tdc.status}</span>`+
      `<span class="lbl">Solution</span><span class="val">${Math.round(tdc.solutionQuality*100)}%</span>`+
      `<span class="lbl">Launch</span><span class="val">${tdc.launchBank||'FWD'} · ${tdc.launchGeometry||'--'}</span>`+
      `<span class="lbl">Tube turn</span><span class="val">${Number.isFinite(tdc.tubeTurnDeg)?tdc.tubeTurnDeg.toFixed(1)+'°':'--'}</span>`+
      `<span class="lbl">Gyro</span><span class="val">${tdc.gyroAngle!==null?tdc.gyroAngle.toFixed(1)+'°':'--'}</span>`+
      `<span class="lbl">AoB</span><span class="val">${tdc.angleOnBow!==null?tdc.angleOnBow.toFixed(0)+'°':'--'}</span>`+
      `<span class="lbl">TtI</span><span class="val">${tdc.timeToImpactSec?tdc.timeToImpactSec.toFixed(0)+'s':'--'}</span>`+
      `<span class="lbl">Torps</span><span class="val">${(()=>{const ts=torpedoStoresStatus(state);return `${ts.total} aboard · ${ts.reserve} reserve · ${ts.loadShort}`;})()}</span>`+
      `<span class="lbl">Hits/Duds</span><span class="val">${state.weapons.hits.length}/${(state.weapons.duds||[]).length}</span>`;

    // Tube status
    const te=document.getElementById('tubeStatusDisplay');
    if(te) te.innerHTML=state.weapons.tubes.map(t=>{
      const col=t.status==='READY'?'var(--ok)':t.status==='EMPTY'?'var(--danger)':'var(--muted)';
      const pct=t.status==='EMPTY'?` ${Math.round(t.reloadProgress*100)}%`:'';
      const typ=t.status==='EMPTY'?'—':torpedoShortName(t.specKey||tdc.torpedoSpecKey);
      return `<span style="color:${col}">T${t.id}[${t.pos}] ${typ}: ${t.status.replace('LOADED_DRY','LOADED')}${pct}</span>`;
    }).join('<br>');

    // TDC note
    const ne=document.getElementById('tdcSolutionNote');
    if(ne){
      const sq=Math.round(tdc.solutionQuality*100);
      const spec=TORPEDO_SPECS[tdc.torpedoSpecKey]||{};
      const dudPct=Math.round(100*(typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(state,tdc.torpedoSpecKey,tdc.dudMode):(spec.dudChanceBase||0.25)*(DUD_MODES[tdc.dudMode]??1)));
      const ri=torpedoRangeInfo(state,tdc.targetId);
      ne.style.color=ri?(ri.band==='IN'?'var(--ok)':ri.band==='BORDERLINE'?'var(--alert)':'var(--danger)'):(sq>70?'var(--ok)':sq>40?'var(--alert)':'var(--danger)');
      ne.textContent=tdc.targetId
        ?`${tdc.status} — Sol:${sq}% · ${tdc.launchBank||'FWD'} · ${tdc.launchGeometry||'--'} · tube ${Number.isFinite(tdc.tubeTurnDeg)?tdc.tubeTurnDeg.toFixed(1)+'°':'--'} · ${ri?`${ri.label} · R ${ri.rangeNm.toFixed(1)} nm · intercept ${ri.runNm.toFixed(1)}/${ri.maxNm.toFixed(1)} nm · `:''}Dud:${dudPct}% · ${tdc.torpedoType}`
        :'No target.';
    }

    const camp=state.campaign;
    if(this.missionStatus){
      const opt=(camp.optionalObjectives||[]).map(o=>{
        const result=o.result&&o.result!=='not_attempted'?` · ${o.result.toUpperCase()}`:'';
        return `<span style="color:${o.done?'var(--ok)':'var(--alert)'}">${o.done?'✓':'◇'} OPTIONAL — ${o.text}${result}</span>`;
      }).join('<br>');
      const pm=camp.primaryMission,progress=typeof missionProgressText==='function'?missionProgressText(state):'';
      this.missionStatus.innerHTML=
        `<strong style="color:var(--alert)">${pm?.title||camp.missionStatus}</strong> <span style="color:var(--dim);font-size:10px;">${camp.missionStatus}</span><br>`+
        (progress?`<span style="color:var(--alert);font-size:10px;">${progress}</span><br>`:'')+
        camp.objectives.map(o=>`<span style="color:${o.done?'var(--ok)':'var(--muted)'}">${o.done?'✓':'○'} ${o.text}</span>`).join('<br>')+
        (opt?`<br>${opt}`:'')+
        `<br><span style="color:var(--muted);font-size:10px;">Tonnage: ${camp.tonnageSunk.toLocaleString()}t | #${camp.patrolNumber} | Career: ${camp.totalScore}</span>`;
    }
  }
  renderDamage(sub){
    if(!this.damageReport) return;
    const d=sub.damage;
    const bar=(l,v)=>{const col=v>0.65?'#e36b5d':v>0.3?'#f0c35a':'#7be08f';
      return `<div class="dmg-row"><span class="dmg-lbl">${l}</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${(v*100).toFixed(0)}%;background:${col}"></div></div><span class="dmg-val">${(v*100).toFixed(0)}%</span></div>`;};
    const hc=d.hullIntegrity<30?'#e36b5d':d.hullIntegrity<60?'#f0c35a':'#7be08f';
    this.damageReport.innerHTML=
      `<div class="dmg-row"><span class="dmg-lbl">Hull</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${d.hullIntegrity.toFixed(0)}%;background:${hc}"></div></div><span class="dmg-val">${d.hullIntegrity.toFixed(0)}%</span></div>`+
      bar('Flooding',d.flooding)+bar('Ballast',d.ballastDamage)+bar('Motor',d.motorDamage)+
      bar('Electrical',d.electricalDamage||0)+bar('Rudder',d.rudderDamage)+bar('Periscope',d.periscopeDamage)+
      bar('TDC',d.tdcDamage||0)+bar('Gyro',d.gyroDamage||0)+bar('Pumps',d.pumpDamage||0)+
      `<div class="note" style="margin:5px 0 8px;">DC priority: ${repairPriorityLabel(d.repairPriority)}${d.driveBankOffline?' · DRIVE BANK OFFLINE':''}${d.pumpTripped?' · PUMP TRIPPED':''}</div>`+
      `<div class="dmg-row"><span class="dmg-lbl">Air quality</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${d.oxygen.toFixed(0)}%;background:${d.oxygen<25?'#e36b5d':d.oxygen<50?'#f0c35a':'#7be08f'}"></div></div><span class="dmg-val">${d.oxygen.toFixed(0)}%</span></div>`;
  }
  renderGauges(sub,state){
    if(!this.gaugeReadout) return;
    const p=sub.propulsion;
    this.gaugeReadout.innerHTML=
      `<span>Contacts</span><strong>${Object.keys(state.world.contactTracks).length}</strong>`+
      `<span>Visibility</span><strong>${state.world.environment.visibilityNm.toFixed(1)} nm</strong>`+
      `<span>Weather</span><strong>${state.world.environment.weather||'CLEAR'}</strong>`+
      `<span>Sea state</span><strong>${state.world.environment.seaState.toFixed(2)}</strong>`+
      `<span>Enemy alert</span><strong>${state.world.enemy.alertState}</strong>`+
      `<span>DCs active</span><strong>${state.world.depthCharges.length}</strong>`+
      `<span>Noise sig</span><strong>${sub.stealth.acousticSignature.toFixed(2)}</strong>`+
      `<span>Shallow</span><strong style="color:${sub.inShallowWater?'var(--alert)':'var(--muted)'}">${sub.inShallowWater?'YES':'NO'}</strong>`+
      `<span>Radar fit</span><strong>${state.world.radar?.fitLabel||'—'}</strong>`+
      `<span>Score</span><strong>${state.campaign.score.toLocaleString()}</strong>`+
      `<span>Area</span><strong>${state.campaign.patrolArea}</strong>`;
  }
}

