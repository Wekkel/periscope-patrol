// ═══════════════════════════════════════════════════ SAVE / LOAD SYSTEM
const SaveSystem={
  KEY:'ss2_save_', CAREER:'ss2_career', MAX:5,
  FULL_REPLAY_PATROLS:10,

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
        savedAt:new Date().toISOString(),version:8,
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

  load(slot){
    try{const r=localStorage.getItem(this.KEY+slot);return r?JSON.parse(r).fullState:null;}
    catch{return null;}
  },

  delete(slot){try{localStorage.removeItem(this.KEY+slot);return true;}catch{return false;}},

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
      if(!state||!state.playerSub) return false;
      if(state.playerSub.mode==='SUNK') return false;          // nothing to come back to
      if(state.campaign.missionStatus==='TRAINING') return false;
      if((state.time.elapsedSeconds||0)<20) return false;      // not worth a record yet
      const snap={
        savedAt:new Date().toISOString(),version:9,why:why||'auto',
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
    try{const r=localStorage.getItem(this.AUTO);return r?JSON.parse(r):null;}
    catch{return null;}
  },

  autoClear(){try{localStorage.removeItem(this.AUTO);}catch{}}
};

