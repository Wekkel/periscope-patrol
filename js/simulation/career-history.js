// ═══════════════════════════════════════════════════ CAREER HISTORY / CAPTAIN'S LOG
// Phase 4 keeps career history append-only. The active patrol carries only
// the current captain's log; immutable patrol records live in SaveSystem.
const CAREER_RECORD_VERSION=1;
const GAME_DAY_SECONDS=7200; // same compressed-day contract as DayNightCycle

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
    const I=s.world.harborIntel;
    const opts=(c.optionalObjectives||[]).map(o=>({text:o.text,done:!!o.done,failed:!!o.failed,result:o.result||null}));
    return Object.freeze({
      version:CAREER_RECORD_VERSION,id:c.historyId,
      patrolNumber:c.patrolNumber||1,area:c.patrolArea||'UNKNOWN',missionName:c.missionName||c.primaryMission?.title||null,
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
      harborRaid:I?.raid?_careerClone(I.raid):null,
      hullAtEnd:Number(meta.hullAtEnd!==undefined?meta.hullAtEnd:s.playerSub.damage.hullIntegrity),
      aircraftEvaded:Number(c.afterAction?.aircraftEvaded)||0,
      importantEvents:_careerClone(c.importantEvents),
      replay:this.buildAfterActionReplay?.()||null,
      returnPort:meta.portName||null
    });
  }

  finalizePatrol(outcome,meta={}){
    const c=this.ensureCareerPatrolState();
    if(c.missionStatus==='TRAINING'||outcome==='TRAINING')return null;
    if(outcome==='LOST')this.captainLog('BOAT_LOST','Boat lost.',{reason:meta.reason||'combat loss'},'boat-lost');
    if(c._historyRecorded){
      const car=typeof SaveSystem!=='undefined'?SaveSystem.getCareer():null;
      const old=car?.patrolHistory?.find(r=>r.id===c._historyRecordId||r.id===c.historyId);
      if(old)return old;
      c._historyRecorded=false;c._historyRecordId=null;
    }
    const rec=this.buildPatrolRecord(outcome,meta);
    if(typeof SaveSystem==='undefined'||typeof SaveSystem.recordPatrol!=='function')return rec;
    const stored=SaveSystem.recordPatrol(rec);
    if(stored){c._historyRecorded=true;c._historyRecordId=rec.id;}
    return stored;
  }
}
