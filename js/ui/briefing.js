// ═══════════════════════════════════════════════════ DOM VIEW


// ═══════════════════════════════════════════════════ BRIEFING
function showBriefing(areaKey,state){
  const area=PATROL_AREAS[areaKey];
  const camp=state.campaign;
  const mission=camp.primaryMission,missionText=typeof missionBriefingText==='function'?missionBriefingText(state):'';
  document.getElementById('briefingText').innerHTML=
    `<strong>PATROL AREA:</strong> ${area?.displayName||areaKey}<br><strong>PRIMARY:</strong> ${mission?.title||camp.missionName||'CONVOY INTERDICTION'}<br><strong>SITUATION:</strong> ${area.description}${missionText?`<br><br><strong>ORDERS:</strong> ${missionText}`:''}`;
  document.getElementById('briefingObjectives').innerHTML=
    '<strong>OBJECTIVES:</strong><br>'+camp.objectives.map(o=>`○ ${o.text}`).join('<br>');
  const fp=camp.friendlyPort;
  const hp=camp.historicalProfile,refit=(camp.refitMessages||[]).join('<br>');
  document.getElementById('briefingResources').innerHTML=
    `<strong>RESOURCES:</strong> 16 torpedoes, 100% fuel<br>`+
    `<strong>HOME PORT:</strong> ${fp?fp.name:'Base'}<br>`+
    (hp?`<strong>WAR CALENDAR:</strong> ${hp.date} · ${hp.era}<br><strong>EQUIPMENT:</strong> ${hp.radarLabel} · ${hp.availableTorpedoes.map(k=>TORPEDO_SPECS[k]?.name||k).join(', ')}<br>`:'')+
    (refit?`<strong>REFIT:</strong> ${refit}<br>`:'')+
    `<strong>ENVIRONMENT:</strong> Visibility ${area.environment.visibilityNm.toFixed(0)}nm, ${area.environment.weather}`;
  document.getElementById('briefingOverlay').style.display='flex';
}

// ═══════════════════════════════════════════════════ CONTROLLER


// ═══════════════════════════════════════════════════ GAME LOOP
