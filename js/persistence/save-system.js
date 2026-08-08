// ═══════════════════════════════════════════════════ SAVE / LOAD SYSTEM
const SaveSystem={
  KEY:'ss2_save_', CAREER:'ss2_career', MAX:5,

  getCareer(){
    try{const r=localStorage.getItem(this.CAREER);return r?JSON.parse(r):{totalScore:0,patrols:0,tonnage:0};}
    catch{return{totalScore:0,patrols:0,tonnage:0};}
  },

  updateCareer(camp){
    try{
      const c=this.getCareer();
      c.totalScore=Math.max(c.totalScore||0,camp.totalScore||0);
      c.patrols=Math.max(c.patrols||0,camp.patrolNumber||0);
      c.tonnage=(c.tonnage||0)+(camp.tonnageSunk||0);
      localStorage.setItem(this.CAREER,JSON.stringify(c));
    }catch(e){console.warn('Career save failed',e);}
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

