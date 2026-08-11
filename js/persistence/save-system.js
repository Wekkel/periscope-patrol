// ═══════════════════════════════════════════════════ SAVE / LOAD SYSTEM
const SaveSystem={
  KEY:'ss2_save_', CAREER:'ss2_career', MAX:5,
  FULL_REPLAY_PATROLS:10,

  /* Portable profile envelope. Keep this version independent from individual
     save-slot/fullState versions: future builds can migrate the envelope while
     the simulation keeps its own additive save migrations. The checksum is for
     corruption detection only. In a client-only MIT/open-source game it is NOT
     an anti-cheat boundary; any embedded secret would also be public. */
  PROFILE_FORMAT:'periscope-patrol-player-profile', PROFILE_VERSION:1, PROFILE_MAX_BYTES:12*1024*1024,
  // STATE_SCHEMA_VERSION belongs to the serialized simulation state, not the
  // portable-profile envelope. Keep those version lines independent: a future
  // release can migrate old patrol states without gratuitously invalidating or
  // redesigning the backup container itself. Schema 0 means a pre-Mega save;
  // the current runtime already upgrades those through its ensure* extensions.
  STATE_SCHEMA_VERSION:1,
  _importedResumePending:false,lastLoadError:null,

  _decimateArray(a,max=120){
    if(!Array.isArray(a)||a.length<=max)return Array.isArray(a)?a:[];
    const out=[],step=(a.length-1)/(max-1);for(let i=0;i<max;i++)out.push(a[Math.round(i*step)]);
    return out;
  },

  _compactReplay(replay){
    if(!replay||replay.compacted)return replay||null;
    const compactTrack=g=>({...g,points:this._decimateArray(g.points||[],60)});
    return{version:replay.version||1,compacted:true,
      route:this._decimateArray(replay.route||[],120),
      observedTracks:(replay.observedTracks||[]).slice(0,16).map(compactTrack),
      truthTracks:(replay.truthTracks||[]).slice(0,16).map(compactTrack),
      events:this._decimateArray(replay.events||[],140),
      torpedoes:(replay.torpedoes||[]).slice(-40),
      aircraftEvaded:Number(replay.aircraftEvaded)||0};
  },

  _compactOldCareerReplays(c,keepFull=this.FULL_REPLAY_PATROLS){
    const cut=Math.max(0,(c.patrolHistory||[]).length-keepFull);
    for(let i=0;i<cut;i++)if(c.patrolHistory[i]?.replay)c.patrolHistory[i].replay=this._compactReplay(c.patrolHistory[i].replay);
    return c;
  },

  _careerDefault(){return{version:2,totalScore:0,totalTonnage:0,totalShips:0,patrolHistory:[],commendations:[],legacyPatrols:0};},

  _normalizeCareer(raw){
    const c=this._careerDefault(),r=raw&&typeof raw==='object'?raw:{};
    c.version=2;
    c.totalScore=Number(r.totalScore)||0;
    c.totalTonnage=Number(r.totalTonnage!==undefined?r.totalTonnage:r.tonnage)||0;
    c.totalShips=Number(r.totalShips)||0;
    c.legacyPatrols=Number(r.legacyPatrols!==undefined?r.legacyPatrols:r.patrols)||0;
    c.patrolHistory=Array.isArray(r.patrolHistory)?r.patrolHistory.map(x=>JSON.parse(JSON.stringify(x))):[];
    c.commendations=Array.isArray(r.commendations)?r.commendations.map(x=>typeof x==='string'?{id:x,title:x,earnedAt:'legacy',patrolId:null}:JSON.parse(JSON.stringify(x))):[];
    if(c.legacyPatrols>0&&!c.commendations.some(x=>x.id==='first-war-patrol'))
      c.commendations.push({id:'first-war-patrol',title:'First War Patrol',earnedAt:'legacy',patrolId:null});
    return c;
  },

  getCareer(){
    try{const r=localStorage.getItem(this.CAREER);return this._normalizeCareer(r?JSON.parse(r):null);}
    catch{return this._careerDefault();}
  },

  _award(c,id,title,record){
    if(c.commendations.some(x=>x.id===id))return false;
    c.commendations.push({id,title,earnedAt:record?.endDate||new Date().toISOString(),patrolId:record?.id||null});return true;
  },

  _updateCommendations(c,r){
    if(c.patrolHistory.length===1&&c.legacyPatrols===0)this._award(c,'first-war-patrol','First War Patrol',r);
    if(c.totalTonnage>=50000)this._award(c,'50000-tons','50,000 tons sunk',r);
    if(r.outcome==='COMPLETED'&&r.area==='Truk Approaches'&&r.harborRaid?.attempted)
      this._award(c,'truk-penetration','Successful Truk penetration',r);
    if(r.outcome==='COMPLETED'&&(r.hullAtEnd??100)<=25)
      this._award(c,'critical-hull-return','Returned with critical hull damage',r);
  },

  recordPatrol(record){
    try{
      if(!record||!record.id)return null;
      const c=this.getCareer();
      const old=c.patrolHistory.find(x=>x.id===record.id);if(old)return old;
      const r=JSON.parse(JSON.stringify(record));
      c.patrolHistory.push(r);
      c.totalScore=Math.max(c.totalScore||0,Number(r.careerTotalScore)||0);
      c.totalTonnage=(c.totalTonnage||0)+(Number(r.tonnage)||0);
      c.totalShips=(c.totalShips||0)+(Number(r.shipsSunk)||0);
      this._updateCommendations(c,r);
      this._compactOldCareerReplays(c);
      try{localStorage.setItem(this.CAREER,JSON.stringify(c));}
      catch(first){
        // Mobile browsers often give localStorage only a few megabytes. Keep
        // the complete recent hunts, then degrade older replay geometry before
        // ever sacrificing the actual patrol history/log.
        this._compactOldCareerReplays(c,3);
        for(let i=0;i<Math.max(0,c.patrolHistory.length-3);i++){
          const q=c.patrolHistory[i];if(q?.replay?.compacted){
            q.replay.observedTracks=(q.replay.observedTracks||[]).slice(0,8);
            q.replay.truthTracks=(q.replay.truthTracks||[]).slice(0,8);
            q.replay.route=this._decimateArray(q.replay.route||[],60);
          }
        }
        localStorage.setItem(this.CAREER,JSON.stringify(c));
      }
      return JSON.parse(JSON.stringify(r));
    }catch(e){console.warn('Career save failed',e);return null;}
  },

  // Compatibility shim for older callers. Phase 4 finalizes whole patrol
  // records instead of incrementally mutating three career counters.
  updateCareer(camp){
    const c=this.getCareer();
    c.totalScore=Math.max(c.totalScore||0,camp?.totalScore||0);
    try{localStorage.setItem(this.CAREER,JSON.stringify(c));}catch(e){console.warn('Career save failed',e);}
    return c;
  },

  listSlots(){
    return Array.from({length:this.MAX},(_,i)=>{
      try{const r=localStorage.getItem(this.KEY+i);return r?{slot:i,...JSON.parse(r),empty:false}:{slot:i,empty:true};}
      catch{return{slot:i,empty:true};}
    });
  },

  save(slot,state){
    try{
      const snap={
        savedAt:new Date().toISOString(),version:8,stateSchemaVersion:this.STATE_SCHEMA_VERSION,
        area:state.campaign.patrolArea,score:state.campaign.score,
        patrol:state.campaign.patrolNumber,totalScore:state.campaign.totalScore,
        tonnage:state.campaign.tonnageSunk,missionStatus:state.campaign.missionStatus,
        hullIntegrity:state.playerSub.damage.hullIntegrity,
        torpedoInventory:state.weapons.torpedoInventory,
        elapsedSeconds:state.time.elapsedSeconds,
        fullState:JSON.parse(JSON.stringify(state))
      };
      localStorage.setItem(this.KEY+slot,JSON.stringify(snap));
      return true;
    }catch(e){console.warn('Save failed',e);return false;}
  },

  _migrateSnapshot(snapshot){
    if(!snapshot?.fullState)throw new Error('Save snapshot has no game state.');
    const from=Number(snapshot.stateSchemaVersion??0);
    if(!Number.isFinite(from)||from<0)throw new Error('Save snapshot has an invalid state schema.');
    if(from>this.STATE_SCHEMA_VERSION)throw new Error(`Save state format ${from} is newer than this game supports (${this.STATE_SCHEMA_VERSION}). Update the game before loading it.`);
    // v0 → v1 is intentionally additive: engine.ensureTacticalExtensions(),
    // ensureWorldExtensions(), traffic/mission setup and the subsystem-specific
    // ensure methods supply every field introduced since the old save. Put any
    // future destructive/renaming migration HERE before advancing the version.
    if(from===0)snapshot.stateSchemaVersion=1;
    return snapshot;
  },

  load(slot){
    this.lastLoadError=null;
    try{const r=localStorage.getItem(this.KEY+slot);return r?this._migrateSnapshot(JSON.parse(r)).fullState:null;}
    catch(e){this.lastLoadError=e?.message||String(e);return null;}
  },

  delete(slot){try{localStorage.removeItem(this.KEY+slot);return true;}catch{return false;}},

  _stableJson(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(v=>this._stableJson(v)).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+this._stableJson(value[k])).join(',')+'}';
  },

  _fnv1a32(text){
    let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');
  },

  async _profileDigest(payload,algorithm='SHA-256'){
    const canonical=this._stableJson(payload);
    if(algorithm==='SHA-256'&&globalThis.crypto?.subtle&&typeof TextEncoder!=='undefined'){
      const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
      return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
    }
    // FNV is deliberately only a compatibility fallback for non-secure/file://
    // contexts. It detects common corruption but makes no security claim.
    return this._fnv1a32(canonical);
  },

  _portableResume(state){
    if(!state?.playerSub||state.playerSub.mode==='SUNK'||state.campaign?.missionStatus==='TRAINING')return null;
    if((state.time?.elapsedSeconds||0)<20)return null;
    return{
      savedAt:new Date().toISOString(),version:10,stateSchemaVersion:this.STATE_SCHEMA_VERSION,why:'profile-export',
      area:state.campaign?.patrolArea||'',score:Number(state.campaign?.score)||0,
      elapsedSeconds:Number(state.time?.elapsedSeconds)||0,
      hullIntegrity:Number(state.playerSub?.damage?.hullIntegrity??100),
      tonnage:Number(state.campaign?.tonnageSunk)||0,
      fullState:JSON.parse(JSON.stringify(state))
    };
  },

  async exportProfile(activeState=null){
    const saves=[];
    for(let slot=0;slot<this.MAX;slot++){
      const raw=localStorage.getItem(this.KEY+slot);if(!raw)continue;
      try{const snapshot=this._migrateSnapshot(JSON.parse(raw));if(snapshot?.fullState)saves.push({slot,snapshot});}catch(e){throw new Error(`Save slot ${slot+1} cannot be exported: ${e?.message||e}`);}
    }
    // Prefer the boat currently in memory: an export made during a patrol should
    // be enough to move devices even if the player forgot to press Save first.
    const autosave=this._portableResume(activeState)||this.autoRead();
    const payload={career:this.getCareer(),saves,autosave:autosave?.fullState?autosave:null};
    const algorithm=(globalThis.crypto?.subtle&&typeof TextEncoder!=='undefined')?'SHA-256':'FNV-1A-32';
    const value=await this._profileDigest(payload,algorithm);
    return JSON.stringify({
      format:this.PROFILE_FORMAT,formatVersion:this.PROFILE_VERSION,
      exportedAt:new Date().toISOString(),appVersion:(typeof AppVersion!=='undefined'?AppVersion.value:null)||null,
      integrity:{algorithm,value,purpose:'corruption-detection'},payload
    },null,2);
  },

  _migrateProfile(doc){
    if(!doc||doc.format!==this.PROFILE_FORMAT)throw new Error('Not a Periscope Patrol player profile.');
    const v=Number(doc.formatVersion)||0;
    if(v>this.PROFILE_VERSION)throw new Error(`Profile format ${v} is newer than this game supports (${this.PROFILE_VERSION}). Update the game before importing.`);
    // Version 1 is the first public portable format. Future migrations belong
    // here and should return a fresh object rather than rewriting old backups.
    if(v===1)return doc;
    throw new Error(`Unsupported legacy profile format ${v}.`);
  },

  _validateProfilePayload(payload){
    if(!payload||typeof payload!=='object')throw new Error('Player profile has no payload.');
    const saves=Array.isArray(payload.saves)?payload.saves:[];
    if(saves.length>this.MAX)throw new Error('Player profile contains too many save slots.');
    const seen=new Set();
    for(const item of saves){
      const slot=Number(item?.slot);
      if(!Number.isInteger(slot)||slot<0||slot>=this.MAX||seen.has(slot)||!item?.snapshot?.fullState)throw new Error('Player profile contains an invalid save slot.');
      seen.add(slot);
    }
    if(payload.autosave!=null&&!payload.autosave?.fullState)throw new Error('Player profile contains an invalid resumable patrol.');
    return{saves};
  },

  async importProfile(text){
    if(typeof text!=='string'||!text.trim())throw new Error('Player profile is empty.');
    if(text.length>this.PROFILE_MAX_BYTES)throw new Error('Player profile is unexpectedly large.');
    let doc;try{doc=JSON.parse(text);}catch{throw new Error('Player profile is not valid JSON.');}
    doc=this._migrateProfile(doc);const {saves}=this._validateProfilePayload(doc.payload);
    const alg=doc.integrity?.algorithm,value=String(doc.integrity?.value||'');
    if(!alg||!value)throw new Error('Player profile has no integrity checksum.');
    if(!['SHA-256','FNV-1A-32'].includes(alg))throw new Error(`Unsupported profile checksum: ${alg}.`);
    const actual=await this._profileDigest(doc.payload,alg);
    if(actual.toLowerCase()!==value.toLowerCase())throw new Error('Player profile checksum failed. The backup may be damaged or edited.');

    // Verify the envelope BEFORE migration: the checksum describes the backup
    // exactly as exported. Only after it is known intact may old state schemas
    // be upgraded for storage on this device.
    const migratedSaves=saves.map(item=>({slot:Number(item.slot),snapshot:this._migrateSnapshot(JSON.parse(JSON.stringify(item.snapshot)))}));
    const migratedAutosave=doc.payload.autosave?.fullState?this._migrateSnapshot(JSON.parse(JSON.stringify(doc.payload.autosave))):null;

    const keys=[this.CAREER,...Array.from({length:this.MAX},(_,i)=>this.KEY+i),this.AUTO];
    const before=new Map(keys.map(k=>[k,localStorage.getItem(k)]));
    try{
      // Normalize career on entry so old career layouts remain importable while
      // full simulation states keep their original version for runtime migration.
      localStorage.setItem(this.CAREER,JSON.stringify(this._normalizeCareer(doc.payload.career)));
      for(let i=0;i<this.MAX;i++)localStorage.removeItem(this.KEY+i);
      for(const item of migratedSaves)localStorage.setItem(this.KEY+item.slot,JSON.stringify(item.snapshot));
      if(migratedAutosave?.fullState)localStorage.setItem(this.AUTO,JSON.stringify(migratedAutosave));
      else localStorage.removeItem(this.AUTO);
    }catch(e){
      // localStorage has no transaction primitive. Roll back every profile key
      // if quota/private-mode failure occurs mid-import so a backup import can
      // never leave half an old career and half a new one behind.
      for(const [k,v] of before){try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}}
      throw new Error(`Import could not be stored: ${e?.message||e}`);
    }
    this._importedResumePending=!!migratedAutosave?.fullState;
    const career=this.getCareer();
    return{ok:true,formatVersion:doc.formatVersion,appVersion:doc.appVersion||null,integrityVerified:true,
      saves:migratedSaves.length,patrols:career.patrolHistory.length,commendations:career.commendations.length,
      stateSchemaVersion:this.STATE_SCHEMA_VERSION,resumeState:migratedAutosave?.fullState||null};
  },

  releaseImportedResume(){this._importedResumePending=false;},

  /* ══ AUTOSAVE ═══════════════════════════════════════════════════════
     A phone does not close an app, it freezes it and reclaims the memory
     when it feels like it. A patrol you have been running for two hours
     can therefore vanish between putting the phone in your pocket and
     taking it out again, with no warning and nothing to reload.

     So the boat writes herself down whenever the screen goes away — on
     visibilitychange, on pagehide, on blur — and on a slow tick besides.
     It lives in its own key, outside the five manual slots, so it can
     never overwrite a save the player made deliberately. */
  AUTO:'pp_autosave',

  autoSave(state,why){
    try{
      // Do not let the current device overwrite a just-imported resumable patrol
      // before the player has accepted or discarded it.
      if(this._importedResumePending)return false;
      if(!state||!state.playerSub) return false;
      if(state.playerSub.mode==='SUNK') return false;          // nothing to come back to
      if(state.campaign.missionStatus==='TRAINING') return false;
      if((state.time.elapsedSeconds||0)<20) return false;      // not worth a record yet
      const snap={
        savedAt:new Date().toISOString(),version:9,stateSchemaVersion:this.STATE_SCHEMA_VERSION,why:why||'auto',
        area:state.campaign.patrolArea,score:state.campaign.score,
        elapsedSeconds:state.time.elapsedSeconds,
        hullIntegrity:state.playerSub.damage.hullIntegrity,
        tonnage:state.campaign.tonnageSunk,
        fullState:JSON.parse(JSON.stringify(state))
      };
      localStorage.setItem(this.AUTO,JSON.stringify(snap));
      return true;
    }catch(e){ console.warn('Autosave failed',e); return false; }
  },

  autoRead(){
    try{const r=localStorage.getItem(this.AUTO);return r?this._migrateSnapshot(JSON.parse(r)):null;}
    catch(e){console.warn('Autosave cannot be loaded',e);return null;}
  },

  autoClear(){this._importedResumePending=false;try{localStorage.removeItem(this.AUTO);}catch{}}
};

