// ═══════════════════════════════════════════════════ CAREER HISTORY / CAPTAIN'S LOG
// Phase 4 keeps career history append-only. The active patrol carries only
// the current captain's log; immutable patrol records use the persistence layer.
const CAREER_RECORD_VERSION=2;
const GAME_DAY_SECONDS=86400; // same one-second/one-world-second contract as DayNightCycle

function _careerClone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function _careerStampFrom(baseStamp,elapsedSec){
  let raw=String(baseStamp||'1943-08-17 06:00');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) raw+=' 06:00';
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  const y=+(m?.[1]||1943),mo=+(m?.[2]||8)-1,d=+(m?.[3]||17),h=+(m?.[4]||6),mi=+(m?.[5]||0);
  const ms=Date.UTC(y,mo,d,h,mi)+Math.max(0,Number(elapsedSec)||0)*(86400000/GAME_DAY_SECONDS);
  const q=new Date(ms),pad=n=>String(n).padStart(2,'0');
  return `${q.getUTCFullYear()}-${pad(q.getUTCMonth()+1)}-${pad(q.getUTCDate())} ${pad(q.getUTCHours())}:${pad(q.getUTCMinutes())}`;
}
function _careerPatrolId(c){
  // New patrols receive a random id in state. This deterministic fallback is
  // only for pre-Phase-4 saves, so reloading the same legacy save cannot create
  // a second history row after it has already been finalized.
  return `legacy:${c.patrolNumber||1}:${c.patrolArea||'UNKNOWN'}:${c.scenarioSeed||1}:${c.startDate||'1943-08-17'}`;
}

function _careerRarity(c){
  const profile=typeof getVesselProfile==='function'?getVesselProfile(c?.vesselProfileId):null,authored=String(profile?.rarity||'').toUpperCase();
  if(authored){const score={COMMON:25,UNCOMMON:55,RARE:82,'VERY RARE':94}[authored]??25;return{score,label:authored};}
  const id=String(c?.displayType||c?.type||'SHIP').toUpperCase();
  let score=25;
  if(/FLEET CARRIER/.test(id))score=98;
  else if(/LIGHT CARRIER|CARRIER/.test(id))score=92;
  else if(/CRUISER|BATTLESHIP/.test(id))score=87;
  else if(/TROOP TRANSPORT|FLEET OILER/.test(id))score=78;
  else if(c?.type==='DESTROYER')score=70;
  else if(c?.type==='KAIBOKAN'||['ESCORT','WARSHIP'].includes(c?.type))score=62;
  else if(c?.type==='TANKER'||/TANKER|OILER/.test(id))score=55;
  else if(c?.type==='PATROL_CRAFT')score=40;
  else if(/SAMPAN|JUNK|FISHING|RAFT/.test(id))score=15;
  if(c?.harborTarget)score=Math.min(99,score+8);
  if(c?.missionRole==='HIGH_VALUE_TARGET')score=Math.min(99,score+8);
  const label=score>=92?'VERY RARE':score>=76?'RARE':score>=48?'UNCOMMON':'COMMON';
  return{score,label};
}
function _careerDifficultyLabel(score){return score>=88?'EXCEPTIONAL':score>=73?'VERY DIFFICULT':score>=55?'DIFFICULT':score>=36?'CHALLENGING':'ROUTINE';}
function _careerAttackDifficulty(c,e){
  const d=e?.data||{},weapon=String(d.weapon||e?.type||'TORPEDO').toUpperCase();
  const own=e?.position,target=e?.targetPosition;
  const range=Number.isFinite(d.rangeNm)?d.rangeNm:(own&&target?distNm(own,target):1.5);
  const speed=Number.isFinite(d.targetSpeedKnots)?d.targetSpeedKnots:Number(c?.baseSpeed??c?.speedKnots)||0;
  const len=Math.max(60,Number(d.lengthFeet)||Number(c?.lengthYards)||400);
  const sea=clamp(Number(d.seaState)||0,0,1),vis=Math.max(.5,Number(d.visibilityNm)||12),day=Number.isFinite(d.daylight)?d.daylight:1;
  const escorts=Math.max(0,Number(d.escortThreat)||0),alerted=!!(d.targetAlerted||c?.scattering),combatant=d.targetCombatant!=null?!!d.targetCombatant:(typeof isSurfaceCombatant==='function'?isSurfaceCombatant(c):['ESCORT','WARSHIP','PATROL_CRAFT','DESTROYER','KAIBOKAN','HEAVY_CRUISER','CARRIER'].includes(c?.type));
  const rangeTerm=(weapon.includes('DECK'))?clamp((range-.7)/4.5,0,1)*25:clamp((range-.55)/3.4,0,1)*25;
  const speedTerm=clamp(speed/20,0,1)*18;
  const sizeTerm=(1-clamp((len-100)/650,0,1))*14;
  const alertTerm=alerted?10:0,combatantTerm=combatant?8:0,escortTerm=Math.min(15,escorts*5);
  const weatherTerm=clamp((sea-.15)/.7,0,1)*7+clamp((9-vis)/7,0,1)*6+(day<.28?5:0);
  const score=Math.round(clamp(10+rangeTerm+speedTerm+sizeTerm+alertTerm+combatantTerm+escortTerm+weatherTerm,8,98));
  return{score,label:_careerDifficultyLabel(score),rangeNm:range,targetSpeedKnots:speed,lengthFeet:len,seaState:sea,visibilityNm:vis,daylight:day,escortThreat:escorts,targetAlerted:alerted,targetCombatant:combatant};
}
function _careerEngagements(state){
  const A=state.campaign?.afterAction||{},events=A.events||[],contacts=state.world?.contacts||[];
  const hitEvents=events.filter(e=>['TORPEDO_HIT','DECK_GUN_HIT'].includes(e?.type)&&e?.data?.contactId);
  const engagedIds=new Set(hitEvents.map(e=>e.data.contactId));
  for(const c of contacts){if(c&&(!c.side||c.side==='ENEMY')&&(c.sunk||shipDamageSeverity(c)>.05||(c.gunDamage||0)>.001))engagedIds.add(c.id);}
  const out=[];
  for(const id of engagedIds){
    const c=contacts.find(x=>x?.id===id);if(!c||c.side&&c.side!=='ENEMY')continue;
    const hits=hitEvents.filter(e=>e.data.contactId===id),D=ensureShipDamage(c),rarity=_careerRarity(c);
    const evaluated=hits.map(e=>({event:e,..._careerAttackDifficulty(c,e)}));
    const hardest=evaluated.sort((a,b)=>b.score-a.score)[0]||{event:null,..._careerAttackDifficulty(c,null)};
    const weapons=[...new Set(hits.map(e=>String(e.data?.weapon||e.type||'').replace(/_HIT$/,'').replace(/_/g,' ')).filter(Boolean))];
    const torpHits=hits.filter(e=>e.type==='TORPEDO_HIT').length,gunHits=hits.filter(e=>e.type==='DECK_GUN_HIT').length;
    const torps=(A.torpedoes||[]).filter(t=>t.targetId===id||t.contactId===id),torpsFired=torps.length;
    const status=c.sunk?'SUNK':shipDamageCondition(c),damage={flotation:D.flotation,propulsion:D.propulsion,steering:D.steering,fire:D.fire};
    const badges=[],hd=hardest;
    if((String(hd.event?.data?.weapon||'').includes('DECK')&&hd.rangeNm>=4)||(String(hd.event?.data?.weapon||'').includes('TORPEDO')&&hd.rangeNm>=3))badges.push('LONG SHOT');
    if(hd.targetSpeedKnots>=14)badges.push('FAST TARGET');
    if(hd.lengthFeet<180)badges.push('SMALL TARGET');
    if(hd.targetAlerted)badges.push('MANOEUVRING');
    if(hd.targetCombatant)badges.push('SURFACE COMBATANT');
    if(hd.escortThreat>0)badges.push('ESCORTED');
    if(hd.daylight<.28)badges.push('NIGHT ATTACK');
    if(hd.seaState>.52)badges.push('HEAVY SEA');
    if(rarity.score>=76)badges.push('RARE CONTACT');
    if(c.sunk&&hits.length===1)badges.push('ONE-HIT SINKING');
    const ev=hardest.event,torpId=ev?.data?.torpedoId,torp=(A.torpedoes||[]).find(t=>t.id===torpId)||(torps.length?torps[0]:null);
    const attackMap=ev?{own:_careerClone(ev.position||torp?.start||null),launch:_careerClone(torp?.start||ev.position||null),target:_careerClone(ev.targetPosition||torp?.end||c.position||null),impact:_careerClone(torp?.end||ev.targetPosition||c.position||null),weapon:ev.data?.weapon||ev.type}:null;
    const profile=typeof getVesselProfile==='function'?getVesselProfile(c.vesselProfileId):null;
    out.push({id:c.id,name:c.name||c.id,type:c.displayType||c.type||'SHIP',role:c.type||'SHIP',tons:Number(c.tonsFactor)||0,lengthFeet:(Number(c.lengthYards)||0)*3,
      vesselProfileId:c.vesselProfileId||null,modelKey:c.modelKey||profile?.modelKey||null,factionId:c.factionId||profile?.factionId||null,recognition:profile?.recognition||null,armament:profile?.armament||null,sensors:_careerClone(profile?.sensors||[]),doctrine:profile?.doctrine||null,
      maxSpeedKnots:Number(c.baseSpeed??c.speedKnots)||0,status,damage,points:Number(D.killPoints)||0,hits:hits.length,torpedoHits:torpHits,deckGunHits:gunHits,torpedoesFired:torpsFired,weapons,
      rarityLabel:rarity.label,rarityScore:rarity.score,difficultyScore:hardest.score,difficultyLabel:hardest.label,attackRangeNm:hardest.rangeNm,targetSpeedKnots:hardest.targetSpeedKnots,
      escortThreat:hardest.escortThreat,badges,attackMap,firstHitT:hits.length?Math.min(...hits.map(e=>e.t||0)):null,lastHitT:hits.length?Math.max(...hits.map(e=>e.t||0)):null});
  }
  return out.sort((a,b)=>(b.status==='SUNK')-(a.status==='SUNK')||b.rarityScore-a.rarityScore||b.difficultyScore-a.difficultyScore||b.tons-a.tons);
}

function _careerOwnBoat(state){const s=state.playerSub,p=s.propulsion||{},d=s.damage||{},W=state.weapons||{};return{profileId:s.profileId||null,hullIntegrity:Number(d.hullIntegrity)||0,flooding:Number(d.flooding)||0,battery:Number(p.battery)||0,fuel:Number(p.fuel)||0,oxygen:Number(d.oxygen)||0,crewFatigue:Number(d.crewFatigue)||0,veteranLevel:Number(d.veteranLevel)||0,veteranRank:d.veteranRank||'GREEN',torpedoReserve:Number(W.torpedoInventory)||0,loadedTubes:(W.tubes||[]).filter(t=>t.status!=='EMPTY').length,deckGunAmmo:Number(W.deckGun?.ammo)||0,aircraftKills:Number(state.world?.aaKills)||0};}
function _careerLessons(state,engagements){
  const A=state.campaign?.afterAction||{},torps=A.torpedoes||[],guns=A.gunRounds||[],responses=A.enemyResponses||[],out=[];
  if(torps.length){const hits=torps.filter(t=>t.status==='HIT').length,duds=torps.filter(t=>t.status==='DUD').length,misses=torps.filter(t=>!['HIT','DUD','DEFLECTED','NETTED'].includes(t.status)).filter(t=>t.status!=='RUNNING'),low=torps.filter(t=>Number(t.solutionQuality)<.55).length,cpa=misses.map(t=>t.intendedCpaNm).filter(Number.isFinite).sort((a,b)=>a-b)[0];out.push(`${hits}/${torps.length} torpedoes hit${duds?`; ${duds} failed as duds`:''}${low?`; ${low} left the tubes below 55% solution quality`:''}${Number.isFinite(cpa)?`; best intended-target miss was ${Math.round(cpa*2025)} yd`:''}.`);}
  if(guns.length){const gh=guns.filter(x=>x.status==='HIT').length,deck=guns.filter(x=>x.material==='DECK').length;out.push(`Deck gun: ${gh}/${guns.length} recorded rounds hit${deck?`, including ${deck} deck strike${deck===1?'':'s'}`:''}; fall-of-shot remained physical rather than score-only.`);}
  if(responses.length){const q=responses[0];out.push(`The first recorded escort reaction followed ${String(q.reason).replaceAll('_',' ').toLowerCase()} via ${q.via}, with about ${Math.round((q.uncertaintyNm||0)*2025)} yd datum uncertainty.`);}
  if(out.length<2&&engagements.length)out.push(`${engagements.length} damaging engagement${engagements.length===1?' was':'s were'} recorded; the hardest scored ${Math.max(...engagements.map(e=>e.difficultyScore||0))}/100.`);
  if(out.length<2)out.push(`No damaging weapon engagement was recorded; the debrief is based on the actual mission, route and contact log.`);
  if(out.length<2)out.push(`The boat returned with ${Math.round(state.playerSub.damage?.hullIntegrity??100)}% hull, ${Math.round(state.playerSub.propulsion?.fuel??0)}% fuel and ${Math.round(state.playerSub.propulsion?.battery??0)}% battery.`);
  return out.slice(0,3);
}

function _careerTruthComparison(state){
  const contacts=state.world?.contacts||[],tracks=state.world?.contactTracks||{},A=state.campaign?.afterAction||{};
  const obsTracks=A.observedById||{},truthTracks=A.truthById||{},hits=(A.events||[]).filter(e=>['TORPEDO_HIT','DECK_GUN_HIT'].includes(e?.type)&&e?.data?.contactId);
  const allIds=new Set([...contacts.map(c=>c?.id),...Object.keys(tracks),...Object.keys(obsTracks),...Object.keys(truthTracks)].filter(Boolean));
  const rows=[];
  for(const id of allIds){
    const c=contacts.find(x=>x?.id===id),tr=tracks[id],obs=obsTracks[id],truth=truthTracks[id];
    if(!c&&!truth)continue;
    const trueType=c?.displayType||c?.type||truth?.type||'SHIP',trueSide=c?.side||truth?.side||'ENEMY';
    if(trueSide!=='ENEMY')continue;
    const trueName=c?.name||(c?`Enemy ${trueType}`:id),trueTons=Number(c?.tonsFactor)||0;
    const isSunk=!!(c?.sunk||(truth?.points&&truth.points.some(p=>p[5]===1))),hitCount=hits.filter(e=>e.data?.contactId===id).length;
    const held=!!tr||!!obs,estType=tr?.typeEstimate||obs?.type||(held?'UNIDENTIFIED':'UNOBSERVED');
    const visualHull=!!(tr?.visualHullConfirmed||(obs?.points&&obs.points.some(p=>p[8]===1))),sensorSource=tr?.source||tr?.lastSensorSource||(obs?.points?.length?'SENSOR':'NONE');
    let estTons=0,normEst=String(estType).toUpperCase();
    if(/CARRIER/.test(normEst))estTons=22000;
    else if(/BATTLESHIP/.test(normEst))estTons=35000;
    else if(/CRUISER/.test(normEst))estTons=10000;
    else if(/TANKER|OILER/.test(normEst))estTons=9000;
    else if(/FREIGHTER|CARGO|TRANSPORT/.test(normEst))estTons=5000;
    else if(/DESTROYER/.test(normEst))estTons=1800;
    else if(/CORVETTE|SLOOP|FRIGATE|ESCORT/.test(normEst))estTons=1100;
    else if(/PATROL|TRAWLER|CHASER/.test(normEst))estTons=500;
    else if(/SAMPAN|JUNK/.test(normEst))estTons=100;
    else estTons=held?4000:0;
    let accuracy='ACCURATE',assessmentNote='';
    if(!held){
      accuracy='UNOBSERVED';
      assessmentNote=`Vessel operated in area unspotted by ownship sensors.`;
    }else if(!visualHull){
      accuracy='ACOUSTIC_ONLY';
      assessmentNote=`Hydrophone/radar track only; classified as ${estType}, never sighted visually.`;
    }else{
      const normTrue=String(trueType).toUpperCase();
      const isCruiser=normTrue.includes('CRUISER'),isCarrier=normTrue.includes('CARRIER'),isEscort=/DESTROYER|ESCORT|WARSHIP|SLOOP|FRIGATE|CORVETTE/.test(normTrue),isTanker=/TANKER|OILER/.test(normTrue);
      const isMerchant=!isCruiser&&!isCarrier&&!isEscort&&!isTanker&&/FREIGHTER|CARGO|MERCHANT|TRANSPORT|TRAMP|LINER|COASTER/.test(normTrue);
      const estCruiser=normEst.includes('CRUISER'),estCarrier=normEst.includes('CARRIER'),estEscort=/DESTROYER|ESCORT|WARSHIP|SLOOP|FRIGATE|CORVETTE/.test(normEst),estTanker=/TANKER|OILER/.test(normEst);
      const estMerchant=/FREIGHTER|CARGO|MERCHANT|TRANSPORT|TRAMP|LINER|COASTER/.test(normEst);
      const matchType=(normEst===normTrue)||(isCruiser&&estCruiser)||(isCarrier&&estCarrier)||(isEscort&&estEscort)||(isTanker&&estTanker)||(isMerchant&&estMerchant);
      if(!matchType){
        accuracy='MISIDENTIFIED';
        assessmentNote=`Skipper logged as ${estType}; wartime archives confirm ${trueName} (${trueType}, ${trueTons.toLocaleString()} t).`;
      }else if(trueTons>0&&Math.abs(estTons-trueTons)/trueTons>.40){
        accuracy=estTons>trueTons?'OVERESTIMATED':'UNDERESTIMATED';
        assessmentNote=`Correct type (${trueType}), but tonnage ${accuracy.toLowerCase()} by ${Math.round(Math.abs(estTons-trueTons)/trueTons*100)}%.`;
      }else{
        accuracy='ACCURATE';
        assessmentNote=`Confirmed visual identification: ${trueName} (${trueType}, ${trueTons.toLocaleString()} t).`;
      }
    }
    const outcome=isSunk?'SUNK':(hitCount>0?'DAMAGED':'SURVIVED');
    rows.push({id,observed:{held,typeEstimate:estType,estimatedTons:estTons,visualHullConfirmed:visualHull,sensorSource},truth:{name:trueName,type:trueType,tons:trueTons,side:trueSide,convoyId:c?.convoyId||truth?.convoyId||null,vesselProfileId:c?.vesselProfileId||truth?.vesselProfileId||null,outcome},evaluation:{accuracy,assessmentNote,hitsInflicted:hitCount}});
  }
  return rows.sort((a,b)=>(b.truth.outcome==='SUNK')-(a.truth.outcome==='SUNK')||b.evaluation.hitsInflicted-a.evaluation.hitsInflicted||b.truth.tons-a.truth.tons);
}

function _careerDeclassifiedIntel(state,engagements,truthComparison){
  const c=state.campaign||{},out=[],sunkShips=truthComparison.filter(r=>r.truth.outcome==='SUNK'),damagedShips=truthComparison.filter(r=>r.truth.outcome==='DAMAGED'),unobservedWarships=truthComparison.filter(r=>r.evaluation.accuracy==='UNOBSERVED'&&['DESTROYER','ESCORT','WARSHIP'].includes(r.truth.type));
  const theater=String(c.campaignProfileId||c.warPartyId||'').toUpperCase();
  const isPacific=/PACIFIC|US|IJN/.test(theater),isGerman=/ATLANTIC|BDU|UBOOT|GERMAN/.test(theater);
  if(sunkShips.length>0){
    const list=sunkShips.map(s=>`${s.truth.name} (${s.truth.type}, ${s.truth.tons.toLocaleString()} GRT)`).join(', ');
    const txt=isPacific?`CINCPAC INTEL DECRYPT: Radio intercepts confirm loss of ${list}. Enemy naval staff reports no salvage possible.`:isGerman?`B-DIENST INTERCEPT: Admiralty casualty broadcast confirms loss of ${list}. Lloyds casualty register amended.`:`POST-PATROL ADMIRALTY DAMAGE ASSESSMENT: Decrypted enemy dispatches verify sinking of ${list}.`;
    out.push({classification:'ULTRA DECRYPT',authority:isPacific?'CINCPAC CINCPOA HQ':isGerman?'B.d.U. ABTEILUNG 1 SKL':'ADMIRALTY 8S SECTION',headline:`${sunkShips.length} ENEMY VESSEL(S) CONFIRMED LOST`,text:txt,tonnageConfirmed:sunkShips.reduce((sum,s)=>sum+s.truth.tons,0)});
  }
  if(damagedShips.length>0){
    const list=damagedShips.map(s=>`${s.truth.name} (${s.truth.type})`).join(', ');
    const txt=isPacific?`IMPERIAL DOCKYARDS INTERCEPT: Repairs ordered for ${list} following underwater hull penetration. Drydock estimate: 6 months.`:isGerman?`B-DIENST TELEGRAM: Convoy escort commander reports ${list} heavily damaged, taken under tow by tugs.`:`INTELLIGENCE INTERCEPT: Enemy merchant vessel(s) ${list} towed into port with flooded compartments.`;
    out.push({classification:'TACTICAL DECRYPT',authority:isPacific?'COMSUBPAC GUAM':isGerman?'B-DIENST SONDERREFERAT':'OP-20-G RADIO INTELLIGENCE',headline:`${damagedShips.length} VESSEL(S) UNDERGOING EMERGENCY REPAIRS`,text:txt,tonnageDamaged:damagedShips.reduce((sum,s)=>sum+s.truth.tons,0)});
  }
  const A=state.campaign?.afterAction||{},dcAttacks=(A.events||[]).filter(e=>e?.type==='DEPTH_CHARGE_ATTACK'),enemyResp=A.enemyResponses||[];
  if(dcAttacks.length>0||enemyResp.length>0){
    const totalDc=dcAttacks.reduce((sum,e)=>sum+(Number(e.data?.count)||10),0);
    const txt=isPacific?`POST-ACTION ENEMY ASW REPORT: Escort screen logged ${dcAttacks.length} depth charge attack runs (${totalDc} pattern charges). Assessment concluded submarine lost or driven below deep layer.`:isGerman?`ALLIED ASW SUMMARY: British 2nd Escort Group expended ${totalDc} depth charges and Asdic barrages. Own boat effectively broke contact using bathythermal gradient.`:`NAVAL STAFF DEBRIEF: ${totalDc} enemy depth charges detonated in vicinity. Thermal layer evasion verified effective by post-war records.`;
    out.push({classification:'ASW DOSSIER',authority:isPacific?'FLEET SONAR ANALYSIS UNIT':isGerman?'U-BOOTWAFFE ERPROBUNGSSTELLE':'ASW INTELLIGENCE BRANCH',headline:`ENEMY ASW COUNTERMEASURE EXPENDITURE: ${totalDc} DEPTH CHARGES`,text:txt,dcExpended:totalDc});
  }
  if(unobservedWarships.length>0){
    const list=unobservedWarships.map(s=>`${s.truth.name} (${s.truth.type})`).join(', ');
    out.push({classification:'WAR DIARY LOG',authority:'POSTWAR ADMIRALTY HISTORICAL SECTION',headline:`CONCEALED ENEMY PATROLS IN THEATER`,text:`Captured war diaries reveal enemy escort(s) ${list} were active along the convoy perimeter but never gained contact with ownship.`,vessels:unobservedWarships.map(s=>s.truth.name)});
  }
  if(!out.length){
    out.push({classification:'PATROL ARCHIVE',authority:isPacific?'COMSUBPAC INTELLIGENCE':'NAVAL STAFF ARCHIVE',headline:'ROUTINE CONVOY TRANSIT VERIFIED',text:'Post-patrol decryption logs confirm enemy convoys rerouted 60 nm south of ownship patrol box upon detection of submarine activity in adjacent sectors.'});
  }
  return out;
}

function _careerCalculateRefitTurnaround(lastRecord,options={}){
  const r=lastRecord||null,hp=options.historicalProfile||r?.historicalProfile||null;
  const campaignProfileId=options.campaignProfileId||r?.campaignProfileId||(typeof DEFAULT_GAME_IDENTITY!=='undefined'?DEFAULT_GAME_IDENTITY.campaignProfileId:'us-pacific');
  const subProfileId=options.submarineProfileId||r?.submarineProfileId||(typeof DEFAULT_GAME_IDENTITY!=='undefined'?DEFAULT_GAME_IDENTITY.submarineProfileId:'gato');
  const subProf=typeof getSubmarineProfile==='function'?getSubmarineProfile(subProfileId):null;
  const nominalCrush=subProf?.damage?.crushDepthFeet||400;
  const prevPatrol=r?.patrolNumber||1;
  const patrolScore=Number(r?.patrolScore)||0;
  const totalScore=Number(options.totalScore!==undefined?options.totalScore:(r?.careerTotalScore||patrolScore));
  const outcome=String(r?.outcome||'COMPLETED').toUpperCase();

  const returnedHull=clamp(Number(r?.hullAtEnd!==undefined?r.hullAtEnd:100),0,100);
  let hullRestored=100,residualStress=false,hullCeiling=100;
  const refitNotes=[];

  if(!r||outcome==='TRAINING'){
    hullRestored=100;residualStress=false;
    refitNotes.push('Commissioning trials completed: Pressure hull and machinery certified 100% sound.');
  }else if(returnedHull>=85){
    hullRestored=100;residualStress=false;
    refitNotes.push('Drydock maintenance and hull overhaul completed. Pressure bulkheads certified 100% sound.');
  }else{
    const scoreBonus=clamp(Math.floor(patrolScore/250),0,15);
    const candidateHull=returnedHull+40+scoreBonus;
    if(returnedHull<50){
      hullCeiling=clamp(85+Math.floor(scoreBonus*0.5),85,92);
      hullRestored=clamp(candidateHull,78,hullCeiling);
      residualStress=true;
      refitNotes.push(`Heavy battle damage repairs completed at base yard. Framing and pressure bulkheads hydraulic-jacked; residual stress limits certified hull integrity to ${hullRestored}%.`);
    }else{
      hullRestored=clamp(candidateHull,85,100);
      residualStress=hullRestored<95;
      refitNotes.push(`Drydock plating and machinery repairs completed. Submarine restored to ${hullRestored}% hull integrity.`);
    }
  }

  hullRestored=Math.max(78,hullRestored);
  const crushDepthRatedFeet=residualStress?Math.round(nominalCrush*(0.85+(hullRestored/100)*0.15)):nominalCrush;

  const lastFatigue=Number(r?.ownBoat?.crewFatigue)||0;
  let crewFatigueResidual=(lastFatigue>0.70&&options.shortTurnaround)?0.08:0;
  if(crewFatigueResidual>0)refitNotes.push('Short turnaround: Crew carries slight residual combat fatigue (8%).');

  let prevVet=Number(options.prevVeteranLevel??(r?.ownBoat?.veteranLevel||0));
  let veteranLevel=clamp(prevVet,0,3);
  const isSuccess=patrolScore>=1200||(r?.shipsSunk||0)>=2||(r?.tonnage||0)>=8000||(r?.harborOperation?.stealthPenetration);
  const isDisaster=outcome==='FAILED'||(returnedHull<=20&&(r?.shipsSunk||0)===0);
  if(isSuccess&&veteranLevel<3){
    veteranLevel++;
    const rankNames=['GREEN','SEASONED','VETERAN','ELITE'];
    refitNotes.push(`Crew commended for combat excellence: Rated ${rankNames[veteranLevel]} status.`);
  }else if(isDisaster&&veteranLevel>0){
    veteranLevel--;
    refitNotes.push('Heavy casualties and draft replacements: Crew experience rating reduced.');
  }
  const crewRankTitle=['GREEN','SEASONED','VETERAN','ELITE'][veteranLevel]||'GREEN';

  const freshSub=typeof materializeFreshSubmarine==='function'?materializeFreshSubmarine(subProfileId):null;
  const nominalInventory=freshSub?.weapons?.torpedoInventory||16;
  let reserveCount=nominalInventory,priorityStock=false,logisticsMemo='';
  if(!r||outcome==='TRAINING'){
    reserveCount=nominalInventory;
  }else if(patrolScore>=1500||veteranLevel>=2){
    reserveCount=nominalInventory;priorityStock=true;
    logisticsMemo=`Priority ordnance requisition approved: Full magazine complement (${reserveCount} reserve torpedoes).`;
    refitNotes.push(logisticsMemo);
  }else if(patrolScore<800&&returnedHull<60){
    reserveCount=Math.max(12,nominalInventory-4);
    logisticsMemo=`Forward logistics restricted: Standard wartime quota issued (${reserveCount} reserve torpedoes).`;
    refitNotes.push(logisticsMemo);
  }else{
    reserveCount=Math.max(14,nominalInventory-2);
    logisticsMemo=`Standard ordnance requisition issued (${reserveCount} reserve torpedoes).`;
  }

  const unlockedForwardBases=[];
  const isPacific=/PACIFIC|USA|IJN/i.test(campaignProfileId);
  if(isPacific){
    unlockedForwardBases.push('Pearl Harbor');
    if(totalScore>=1200||prevPatrol>=2)unlockedForwardBases.push('Midway');
    if(totalScore>=2500||prevPatrol>=3)unlockedForwardBases.push('Tulagi');
    if(totalScore>=4500||prevPatrol>=4)unlockedForwardBases.push('Fremantle');
  }else{
    unlockedForwardBases.push('Kiel');
    if(totalScore>=1200||prevPatrol>=2)unlockedForwardBases.push('Lorient');
    if(totalScore>=2500||prevPatrol>=3)unlockedForwardBases.push('Brest');
    if(totalScore>=4500||prevPatrol>=4)unlockedForwardBases.push('La Spezia');
  }

  let recommendedPatrolType='STANDARD_PATROL';
  let patrolRecommendationText='Command cleared submarine for unrestricted combat patrol.';
  if(hullRestored<88||residualStress){
    recommendedPatrolType='RECOVERY_PATROL';
    patrolRecommendationText='COMMAND ADVISORY: Working-up / coastal patrol recommended to verify frame repairs and shake down replacement crew.';
    refitNotes.push(patrolRecommendationText);
  }else if(veteranLevel>=2&&hullRestored>=95){
    recommendedPatrolType='PRIORITY_INTERCEPTION';
    patrolRecommendationText='COMMAND ADVISORY: Veteran crew assigned priority choke-point convoy interdiction.';
    refitNotes.push(patrolRecommendationText);
  }

  return Object.freeze({
    hullRestored,
    hullCeiling,
    residualStress,
    crushDepthRatedFeet,
    crewFatigueResidual,
    crewVeteranLevel:veteranLevel,
    crewRankTitle,
    torpedoAllocation:Object.freeze({reserveCount,priorityStock,memo:logisticsMemo}),
    unlockedForwardBases:Object.freeze(unlockedForwardBases),
    recommendedPatrolType,
    patrolRecommendationText,
    refitNotes:Object.freeze(refitNotes)
  });
}

const CareerSystem={
  ensureCareerPatrolState(){
    const c=this.state.campaign,R=this.state.runtime.campaign;
    c.importantEvents=Array.isArray(c.importantEvents)?c.importantEvents:[];
    R._captainEventSeq=Number(R._captainEventSeq)||c.importantEvents.length;
    c.historyId=c.historyId||_careerPatrolId(c);
    R._careerStartDate=R._careerStartDate||`${c.startDate||this.state.time.campaignDate||'1943-08-17'} 06:00`;
    if(R._historyRecorded===undefined)R._historyRecorded=false;
    return c;
  },

  captainLog(type,text,data={},key=null){
    const c=this.state.campaign,R=this.state.runtime.campaign;this.ensureCareerPatrolState();
    if(key){const old=c.importantEvents.find(e=>e.key===key);if(old)return old;}
    const ev={
      seq:++R._captainEventSeq,
      t:this.state.time.elapsedSeconds||0,
      date:_careerStampFrom(R._careerStartDate,c.patrolDuration||0),
      type:String(type||'EVENT'),text:String(text||''),
      data:_careerClone(data||{})
    };
    if(key)ev.key=key;
    c.importantEvents.push(ev);
    if(c.importantEvents.length>150)c.importantEvents.splice(0,c.importantEvents.length-150);
    const aarTrack=ev.data?.contactId?this.state.world.contactTracks?.[ev.data.contactId]:null;
    this.aar.recordEvent?.(ev.type,ev.text,{...ev.data,aarKey:key||null},this.state.playerSub?.position,aarTrack?.plotPosition||aarTrack?.lastFixPosition||null);
    return ev;
  },

  buildPatrolRecord(outcome,meta={}){
    const s=this.state,c=s.campaign,R=s.runtime.campaign;this.ensureCareerPatrolState();const W=s.weapons,G=W.deckGun||{},contacts=s.world.contacts||[];
    const sunk=contacts.filter(x=>x&&x.sunk&&(!x.side||x.side==='ENEMY')).map(x=>({
      id:x.id,name:x.name||x.id,type:x.displayType||x.type||'SHIP',tons:x.tonsFactor||0,
      weapon:x.shipDamage?.lastWeapon||((W.hits||[]).some(h=>h.contactId===x.id&&h.weapon==='DECK_GUN')?'DECK_GUN':
             (W.hits||[]).some(h=>h.contactId===x.id)?'TORPEDO':'OTHER')
    }));
    // "shipsDamaged" means damaged but not sunk; sunk ships are reported once
    // in the sunk total instead of being counted in both columns.
    const damaged=contacts.filter(x=>x&&!x.sunk&&(!x.side||x.side==='ENEMY')&&(shipDamageSeverity(x)>.05||(x.gunDamage||0)>0.001)).map(x=>{
      const D=ensureShipDamage(x),severity=shipDamageSeverity(x);
      return{id:x.id,name:x.name||x.id,type:x.displayType||x.type||'SHIP',damage:severity,
        condition:shipDamageCondition(x),subsystems:{flotation:D.flotation,propulsion:D.propulsion,steering:D.steering,fire:D.fire},
        weapon:D.lastWeapon||((x.gunDamage||0)>0?'DECK_GUN':'OTHER')};
    });
    const torpHits=(W.hits||[]).filter(h=>h.weapon!=='DECK_GUN').length;
    const engagements=_careerEngagements(s);
    const aircraftEncounters=Object.entries(this.state.runtime?.aar?.airStates||{}).filter(([,a])=>a?.seen||a?.attacked||a?.shotDown).map(([id,a])=>{const p=typeof getAircraftProfile==='function'?getAircraftProfile(a.aircraftProfileId):null;return{id,name:a.name||p?.name||'Aircraft',aircraftProfileId:a.aircraftProfileId||null,factionId:p?.factionId||null,kind:a.kind||p?.kind||null,status:a.shotDown?'SHOT DOWN':a.attacked?'ATTACK EVADED':'SIGHTED',dimensionsM:p?{span:p.spanM,length:p.lengthM}:null,speedKnots:_careerClone(p?.speedKnots||[]),ordnance:p?.ordnance||null,recognition:p?.recognition||null,doctrine:p?.doctrine||null};});
    const ownBoat=_careerOwnBoat(s),lessons=_careerLessons(s,engagements),hp=c.historicalProfile||{};
    const I=s.world.harborIntel;
    const H=s.world.harbor;
    let harborOp=null;
    if(H&&(H.entered||I?.raid?.attempted||I?.raid?.gateCrossed)){
      const stealthBonus=(I?.raid?.gateCrossed&&!H.indicatorLoopWarned&&H.alert<2)?500:0;
      harborOp={
        siteName:H.name,shortName:H.shortName,
        gateCrossed:!!I?.raid?.gateCrossed,
        stealthPenetration:stealthBonus>0,
        targetIdentified:!!I?.heavyUnit?.identified,
        targetNeutralized:!!(s.world.contacts||[]).find(x=>x.id===H.heavyTargetId)?.sunk,
        maxAlert:H.alert,
        specialIntelBonus:stealthBonus
      };
    }
    const opts=(c.optionalObjectives||[]).map(o=>({text:o.text,done:!!o.done,failed:!!o.failed,result:o.result||null}));
    const truthComparison=_careerTruthComparison(s);
    const declassifiedIntel=_careerDeclassifiedIntel(s,engagements,truthComparison);
    const pacingSummary=_careerClone(s.campaign?.pacingSummary||c.afterAction?.pacingSummary||null);
    const decisions=_careerClone(c.afterAction?.decisions||[]);
    const patrolScoreVal=Number(meta.patrolScore!==undefined?meta.patrolScore:c.score)+(harborOp?.specialIntelBonus||0);
    const hullAtEndVal=Number(meta.hullAtEnd!==undefined?meta.hullAtEnd:s.playerSub.damage.hullIntegrity);
    const refitTurnaround=_careerCalculateRefitTurnaround({
      outcome:String(outcome||c.missionStatus||'UNKNOWN'),
      patrolNumber:c.patrolNumber||1,
      patrolScore:patrolScoreVal,
      careerTotalScore:Number(c.totalScore)||0,
      hullAtEnd:hullAtEndVal,
      shipsSunk:sunk.length,
      tonnage:Number(c.tonnageSunk)||0,
      ownBoat,
      campaignProfileId:c.campaignProfileId||null,
      submarineProfileId:s.playerSub?.profileId||null,
      historicalProfile:c.historicalProfile||null,
      harborOperation:harborOp
    },{
      totalScore:Number(c.totalScore)||0,
      campaignProfileId:c.campaignProfileId||null,
      submarineProfileId:s.playerSub?.profileId||null,
      prevVeteranLevel:s.playerSub?.damage?.veteranLevel||0
    });
    return Object.freeze({
      version:CAREER_RECORD_VERSION,id:c.historyId,
      patrolNumber:c.patrolNumber||1,area:c.patrolArea||'UNKNOWN',missionName:c.missionName||c.primaryMission?.title||null,
      campaignId:c.campaignId||null,warPartyId:c.warPartyId||null,theaterId:c.theaterId||null,playerFactionId:c.playerFactionId||null,campaignProfileId:c.campaignProfileId||null,submarineProfileId:s.playerSub?.profileId||null,
      relationshipModel:'FACTION_DISPOSITION_AT_EVENT_TIME',aarIdentity:typeof getWarPartyProfile==='function'?getWarPartyProfile(c.warPartyId)?.aarIdentity:null,
      missionType:c.missionType||c.primaryMission?.type||'CONVOY_INTERDICTION',primaryMission:_careerClone(c.primaryMission||null),
      historicalProfile:_careerClone(c.historicalProfile||null),equipment:_careerClone(c.equipment||null),
      startDate:R._careerStartDate,
      endDate:_careerStampFrom(R._careerStartDate,c.patrolDuration||0),
      durationSeconds:Math.round(c.patrolDuration||0),outcome:String(outcome||c.missionStatus||'UNKNOWN'),
      patrolScore:patrolScoreVal,
      careerTotalScore:Number(c.totalScore)||0,
      shipsSunk:sunk.length,sunkShips:_careerClone(sunk),
      tonnage:Number(c.tonnageSunk)||0,
      shipsDamaged:damaged.length,damagedShips:_careerClone(damaged),
      torpedoesFired:Math.max(0,(W.nextTorpedoId||1)-1),torpedoHits:torpHits,torpedoDuds:(W.duds||[]).length,
      deckGunRounds:Number(G.shots)||0,deckGunHits:Number(G.hits)||0,aircraftKills:Number(s.world.aaKills)||0,
      optionalObjectives:_careerClone(opts),
      specialOperationId:I?.operationId||null,harborRaid:I?.raid?_careerClone(I.raid):null,
      harborOperation:harborOp?_careerClone(harborOp):null,
      hullAtEnd:hullAtEndVal,
      aircraftEvaded:Number(c.afterAction?.aircraftEvaded)||0,
      importantEvents:_careerClone(c.importantEvents),
      engagements:_careerClone(engagements),
      truthComparison:_careerClone(truthComparison),
      declassifiedIntel:_careerClone(declassifiedIntel),
      decisions,
      pacingSummary,
      aircraftEncounters:_careerClone(aircraftEncounters),
      ownBoat:_careerClone(ownBoat),lessons:_careerClone(lessons),historicalContext:{era:hp.era||null,date:hp.date||c.startDate||null,area:c.patrolArea||null,equipment:_careerClone(hp.equipment||c.equipment||[])},
      refitTurnaround,
      // Keep the compact recorder payload for save compatibility and for the
      // static per-engagement mini maps. The AAR UI no longer runs an animated replay.
      replay:this.aar.buildReplay?.()||null,
      returnPort:meta.portName||null
    });
  },

  buildTruthComparison(state){return _careerTruthComparison(state||this.state);},
  buildDeclassifiedIntel(state,engagements,truthComparison){return _careerDeclassifiedIntel(state||this.state,engagements||_careerEngagements(state||this.state),truthComparison||_careerTruthComparison(state||this.state));},
  calculateRefitTurnaround(lastRecord,options={}){return _careerCalculateRefitTurnaround(lastRecord,options);},

  finalizePatrol(outcome,meta={}){
    const c=this.state.campaign,R=this.state.runtime.campaign;this.ensureCareerPatrolState();
    if(c.missionStatus==='TRAINING'||outcome==='TRAINING')return null;
    if(outcome==='LOST')this.captainLog('BOAT_LOST','Boat lost.',{reason:meta.reason||'combat loss'},'boat-lost');
    if(R._historyRecorded){
      const old=this.state.runtime?.careerRecords?.find(r=>r.id===R._historyRecordId||r.id===c.historyId);
      if(old)return old;
      R._historyRecorded=false;R._historyRecordId=null;
    }
    const rec=this.buildPatrolRecord(outcome,meta);
    if(rec?.refitTurnaround){
      c.pendingRefit=rec.refitTurnaround;
      if(R)R.pendingRefit=rec.refitTurnaround;
    }
    const records=this.state.runtime.careerRecords=this.state.runtime.careerRecords||[];
    records.push(rec);if(records.length>24)records.shift();
    PresentationBridge.emit(this.state,'save',{method:'recordPatrol',args:[rec]});
    R._historyRecorded=true;R._historyRecordId=rec.id;
    return rec;
  }
};
