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

function _careerOwnBoat(state){const s=state.playerSub,p=s.propulsion||{},d=s.damage||{},W=state.weapons||{};return{profileId:s.profileId||null,hullIntegrity:Number(d.hullIntegrity)||0,flooding:Number(d.flooding)||0,battery:Number(p.battery)||0,fuel:Number(p.fuel)||0,oxygen:Number(d.oxygen)||0,crewFatigue:Number(d.crewFatigue)||0,torpedoReserve:Number(W.torpedoInventory)||0,loadedTubes:(W.tubes||[]).filter(t=>t.status!=='EMPTY').length,deckGunAmmo:Number(W.deckGun?.ammo)||0,aircraftKills:Number(state.world?.aaKills)||0};}
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

class SimEngineCareer extends SimEngineDamage {
  ensureCareerPatrolState(){
    const c=this.state.campaign;
    c.importantEvents=Array.isArray(c.importantEvents)?c.importantEvents:[];
    c._captainEventSeq=Number(c._captainEventSeq)||c.importantEvents.length;
    c.historyId=c.historyId||_careerPatrolId(c);
    c._careerStartDate=c._careerStartDate||`${c.startDate||this.state.time.campaignDate||'1943-08-17'} 06:00`;
    if(c._historyRecorded===undefined)c._historyRecorded=false;
    return c;
  }

  captainLog(type,text,data={},key=null){
    const c=this.ensureCareerPatrolState();
    if(key){const old=c.importantEvents.find(e=>e.key===key);if(old)return old;}
    const ev={
      seq:++c._captainEventSeq,
      t:this.state.time.elapsedSeconds||0,
      date:_careerStampFrom(c._careerStartDate,c.patrolDuration||0),
      type:String(type||'EVENT'),text:String(text||''),
      data:_careerClone(data||{})
    };
    if(key)ev.key=key;
    c.importantEvents.push(ev);
    const aarTrack=ev.data?.contactId?this.state.world.contactTracks?.[ev.data.contactId]:null;
    this.aarRecordEvent?.(ev.type,ev.text,{...ev.data,aarKey:key||null},this.state.playerSub?.position,aarTrack?.plotPosition||aarTrack?.lastFixPosition||null);
    return ev;
  }

  buildPatrolRecord(outcome,meta={}){
    const s=this.state,c=this.ensureCareerPatrolState(),W=s.weapons,G=W.deckGun||{},contacts=s.world.contacts||[];
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
    const aircraftEncounters=Object.entries(c.afterAction?._airStates||{}).filter(([,a])=>a?.seen||a?.attacked||a?.shotDown).map(([id,a])=>{const p=typeof getAircraftProfile==='function'?getAircraftProfile(a.aircraftProfileId):null;return{id,name:a.name||p?.name||'Aircraft',aircraftProfileId:a.aircraftProfileId||null,factionId:p?.factionId||null,kind:a.kind||p?.kind||null,status:a.shotDown?'SHOT DOWN':a.attacked?'ATTACK EVADED':'SIGHTED',dimensionsM:p?{span:p.spanM,length:p.lengthM}:null,speedKnots:_careerClone(p?.speedKnots||[]),ordnance:p?.ordnance||null,recognition:p?.recognition||null,doctrine:p?.doctrine||null};});
    const ownBoat=_careerOwnBoat(s),lessons=_careerLessons(s,engagements),hp=c.historicalProfile||{};
    const I=s.world.harborIntel;
    const opts=(c.optionalObjectives||[]).map(o=>({text:o.text,done:!!o.done,failed:!!o.failed,result:o.result||null}));
    return Object.freeze({
      version:CAREER_RECORD_VERSION,id:c.historyId,
      patrolNumber:c.patrolNumber||1,area:c.patrolArea||'UNKNOWN',missionName:c.missionName||c.primaryMission?.title||null,
      campaignId:c.campaignId||null,warPartyId:c.warPartyId||null,theaterId:c.theaterId||null,playerFactionId:c.playerFactionId||null,campaignProfileId:c.campaignProfileId||null,submarineProfileId:s.playerSub?.profileId||null,
      relationshipModel:'FACTION_DISPOSITION_AT_EVENT_TIME',aarIdentity:typeof getWarPartyProfile==='function'?getWarPartyProfile(c.warPartyId)?.aarIdentity:null,
      missionType:c.missionType||c.primaryMission?.type||'CONVOY_INTERDICTION',primaryMission:_careerClone(c.primaryMission||null),
      historicalProfile:_careerClone(c.historicalProfile||null),equipment:_careerClone(c.equipment||null),
      startDate:c._careerStartDate,
      endDate:_careerStampFrom(c._careerStartDate,c.patrolDuration||0),
      durationSeconds:Math.round(c.patrolDuration||0),outcome:String(outcome||c.missionStatus||'UNKNOWN'),
      patrolScore:Number(meta.patrolScore!==undefined?meta.patrolScore:c.score)||0,
      careerTotalScore:Number(c.totalScore)||0,
      shipsSunk:sunk.length,sunkShips:_careerClone(sunk),
      tonnage:Number(c.tonnageSunk)||0,
      shipsDamaged:damaged.length,damagedShips:_careerClone(damaged),
      torpedoesFired:Math.max(0,(W.nextTorpedoId||1)-1),torpedoHits:torpHits,torpedoDuds:(W.duds||[]).length,
      deckGunRounds:Number(G.shots)||0,deckGunHits:Number(G.hits)||0,aircraftKills:Number(s.world.aaKills)||0,
      optionalObjectives:_careerClone(opts),
      specialOperationId:I?.operationId||null,harborRaid:I?.raid?_careerClone(I.raid):null,
      hullAtEnd:Number(meta.hullAtEnd!==undefined?meta.hullAtEnd:s.playerSub.damage.hullIntegrity),
      aircraftEvaded:Number(c.afterAction?.aircraftEvaded)||0,
      importantEvents:_careerClone(c.importantEvents),
      engagements:_careerClone(engagements),
      aircraftEncounters:_careerClone(aircraftEncounters),
      ownBoat:_careerClone(ownBoat),lessons:_careerClone(lessons),historicalContext:{era:hp.era||null,date:hp.date||c.startDate||null,area:c.patrolArea||null,equipment:_careerClone(hp.equipment||c.equipment||[])},
      // Keep the compact recorder payload for save compatibility and for the
      // static per-engagement mini maps. The AAR UI no longer runs an animated replay.
      replay:this.buildAfterActionReplay?.()||null,
      returnPort:meta.portName||null
    });
  }

  finalizePatrol(outcome,meta={}){
    const c=this.ensureCareerPatrolState();
    if(c.missionStatus==='TRAINING'||outcome==='TRAINING')return null;
    if(outcome==='LOST')this.captainLog('BOAT_LOST','Boat lost.',{reason:meta.reason||'combat loss'},'boat-lost');
    if(c._historyRecorded){
      const old=this.state.runtime?.careerRecords?.find(r=>r.id===c._historyRecordId||r.id===c.historyId);
      if(old)return old;
      c._historyRecorded=false;c._historyRecordId=null;
    }
    const rec=this.buildPatrolRecord(outcome,meta);
    const records=this.state.runtime.careerRecords=this.state.runtime.careerRecords||[];
    records.push(rec);if(records.length>24)records.shift();
    PresentationBridge.emit(this.state,'save',{method:'recordPatrol',args:[rec]});
    c._historyRecorded=true;c._historyRecordId=rec.id;
    return rec;
  }
}
