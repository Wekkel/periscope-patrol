/* ═══════════════════════════════════════════════════ AUTOSAVE WIRING
   Nothing here decides WHEN a patrol is worth keeping — SaveSystem does
   that. This only makes sure every way a phone can take the screen away
   ends with the boat written down first. */
const AutoSave={
  last:0,
  write(why){
    const s=game.getSnapshot();
    if(s.campaign?.missionStatus==='TRAINING'||s.campaign?.missionStatus==='MENU'){SaveSystem.autoClear();return;}
    if(SaveSystem.autoSave(s,why)) this.last=performance.now();
  },
  tick(){                                   // a slow heartbeat while playing
    if(performance.now()-this.last<45000) return;
    this.write('tick');
  },
  offer(){
    const rec=SaveSystem.autoRead();
    if(!rec||!rec.fullState) return false;
    const st=rec.fullState;
    if(!st.playerSub||st.playerSub.mode==='SUNK'||['LOST','TRAINING','MENU'].includes(st.campaign?.missionStatus)) { SaveSystem.autoClear(); return false; }
    const mins=Math.round((st.time?.elapsedSeconds||0)/60);
    const when=(()=>{try{return new Date(rec.savedAt).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'});}catch{return '';}})();
    const bar=document.getElementById('resumeBar');
    if(!bar) return false;
    const txt=document.getElementById('resumeTxt');
    if(txt) txt.innerHTML=`<b>Patrol in progress.</b> ${rec.area||''} — ${mins} min run, hull ${Math.round(rec.hullIntegrity??100)}%. Saved ${when}.`;
    bar.classList.add('on');
    document.getElementById('resumeNo').onclick=()=>{bar.classList.remove('on');SaveSystem.releaseImportedResume?.();SaveSystem.autoClear();};
    document.getElementById('resumeYes').onclick=()=>{
      bar.classList.remove('on');
      SaveSystem.releaseImportedResume?.();
      Object.assign(game.state,st);
      document.getElementById('briefingOverlay').style.display='none';
      sceneSelector.close?.();
      touchCtrl.cache={};
      Toast.ok('Patrol resumed where you left her');
      audio.event?.('RESUME_CONFIRMED');
    };
    return true;
  }
};
for(const ev of ['pagehide','blur']) window.addEventListener(ev,()=>AutoSave.write(ev),{passive:true});
document.addEventListener('visibilitychange',()=>{ if(document.hidden) AutoSave.write('hidden'); },{passive:true});
// iOS in particular may never fire pagehide, so freeze/resume too where present
window.addEventListener('freeze',()=>AutoSave.write('freeze'),{passive:true});
setTimeout(()=>AutoSave.offer(),650);
