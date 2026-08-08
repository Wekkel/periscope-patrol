// ═══════════════════════════════════════════════════ DOM VIEW


// ═══════════════════════════════════════════════════ BRIEFING
function showBriefing(areaKey,state){
  const area=PATROL_AREAS[areaKey];
  const camp=state.campaign;
  document.getElementById('briefingText').innerHTML=
    `<strong>PATROL AREA:</strong> ${areaKey}<br><strong>SITUATION:</strong> ${area.description}`;
  document.getElementById('briefingObjectives').innerHTML=
    '<strong>OBJECTIVES:</strong><br>'+camp.objectives.map(o=>`○ ${o.text}`).join('<br>');
  const fp=camp.friendlyPort;
  document.getElementById('briefingResources').innerHTML=
    `<strong>RESOURCES:</strong> 16 torpedoes, 100% fuel<br>`+
    `<strong>HOME PORT:</strong> ${fp?fp.name:'Base'}<br>`+
    `<strong>ENVIRONMENT:</strong> Visibility ${area.environment.visibilityNm.toFixed(0)}nm, ${area.environment.weather}`;
  document.getElementById('briefingOverlay').style.display='flex';
}

// ═══════════════════════════════════════════════════ CONTROLLER


// ═══════════════════════════════════════════════════ GAME LOOP

