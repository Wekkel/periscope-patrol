// ═══════════════════════════════════════════════════ DESKTOP CONTROLLER
class BridgeController{
  constructor(game,cv){this.game=game;this.cv=cv;this.bind();}
  bind(){
    const hi=document.getElementById('headingInput');
    const ri=document.getElementById('rpmInput');
    const di=document.getElementById('depthInput');
    const hv=document.getElementById('orderedHeadingValue');
    const rv=document.getElementById('rpmValue');
    const dv=document.getElementById('depthValue');
    const stT=document.getElementById('stationTactical');
    const stP=document.getElementById('stationPeriscope');
    const stM=document.getElementById('stationMap');
    const stG=document.getElementById('stationDeckGun');
    const setSta=(s,a,o)=>{a?.classList.add('active');o.filter(Boolean).forEach(b=>b.classList.remove('active'));this.game.dispatch({type:'SET_ACTIVE_STATION',station:s});};
    hi?.addEventListener('input',()=>{if(hv)hv.textContent=fmtDeg(+hi.value);this.game.dispatch({type:'SET_ORDERED_HEADING',heading:+hi.value});});
    ri?.addEventListener('input',()=>{if(rv)rv.textContent=ri.value;this.game.dispatch({type:'SET_ENGINE_RPM',rpm:+ri.value});});
    di?.addEventListener('input',()=>{if(dv)dv.textContent=`${di.value} ft`;this.game.dispatch({type:'SET_ORDERED_DEPTH',depthFeet:+di.value});});
    const btn=(id,fn)=>document.getElementById(id)?.addEventListener('click',fn);
    btn('surfaceButton',    ()=>{if(di){di.value=0;dv.textContent='0 ft';}this.game.dispatch({type:'SURFACE'});});
    btn('periscopeButton',  ()=>{if(di){di.value=55;dv.textContent='55 ft';}this.game.dispatch({type:'PERISCOPE_DEPTH'});});
    btn('diveButton',       ()=>{if(di){di.value=100;dv.textContent='100 ft';}this.game.dispatch({type:'DIVE'});});
    btn('crashDiveButton',  ()=>{if(di){di.value=150;dv.textContent='150 ft';}this.game.dispatch({type:'CRASH_DIVE'});});
    btn('silentButton',     ()=>this.game.dispatch({type:'TOGGLE_SILENT_RUNNING'}));
    btn('emergencyBlowButton',()=>{if(di){di.value=0;dv.textContent='0 ft';}this.game.dispatch({type:'EMERGENCY_BLOW'});});
    btn('pumpButton',       ()=>this.game.dispatch({type:'TOGGLE_PUMPS'}));
    btn('dcFloodButton',     ()=>this.game.dispatch({type:'SET_REPAIR_PRIORITY',priority:'FLOODING'}));
    btn('dcPropButton',      ()=>this.game.dispatch({type:'SET_REPAIR_PRIORITY',priority:'PROPULSION'}));
    btn('dcSteerButton',     ()=>this.game.dispatch({type:'SET_REPAIR_PRIORITY',priority:'STEERING'}));
    btn('dcOpticsButton',    ()=>this.game.dispatch({type:'SET_REPAIR_PRIORITY',priority:'OPTICS_FIRE_CONTROL'}));
    const tsel=document.getElementById('timeSelect');
    tsel?.addEventListener('change',e=>{
      const v=e.target.value;
      if(String(v).startsWith('skip')){
        this.game.dispatch({type:'START_TRANSIT',seconds:+String(v).slice(4)});
        e.target.value=String(this.game.getSnapshot().time.timeScale);
      }else this.game.dispatch({type:'SET_TIME_SCALE',scale:+v});
    });
    btn('scopeLeftButton',  ()=>this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:-5}));
    btn('scopeRightButton', ()=>this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:5}));
    btn('scopeZoomButton',  ()=>this.game.dispatch({type:'TOGGLE_PERISCOPE_ZOOM'}));
    btn('selectScopeTargetButton',()=>this.game.dispatch({type:'PERISCOPE_SELECT_CENTER_CONTACT'}));
    btn('sendScopeToTdcButton',   ()=>this.game.dispatch({type:'TDC_SEND_SCOPE_OBSERVATION'}));
    btn('floodTubeButton',  ()=>this.game.dispatch({type:'FLOOD_ALL_TUBES'}));
    btn('fireTubeButton',   ()=>this.game.dispatch({type:'FIRE_TORPEDO',tubeId:1}));
    btn('fireSpreadButton', ()=>this.game.dispatch({type:'FIRE_READY_SPREAD'}));
    btn('floodAftButton',   ()=>this.game.dispatch({type:'FLOOD_AFT_TUBES'}));
    btn('fireAftButton',    ()=>this.game.dispatch({type:'FIRE_AFT_SPREAD'}));
    btn('clearPlotButton',  ()=>this.game.dispatch({type:'MAP_CLEAR_PLOT'}));
    btn('followPlotButton', ()=>this.game.dispatch({type:'MAP_STEER_TO_NEXT_WAYPOINT'}));
    btn('portButton',       ()=>this.game.dispatch({type:'HEAD_TO_PORT'}));
    btn('newScenarioButton',()=>this.game.dispatch({type:'NEW_PATROL'}));
    btn('stationTactical',  ()=>setSta('TACTICAL',stT,[stP,stM,stG]));
    btn('stationPeriscope', ()=>setSta('PERISCOPE',stP,[stT,stM,stG]));
    btn('stationMap',       ()=>setSta('MAP',stM,[stT,stP,stG]));
    btn('stationDeckGun',   ()=>setSta('DECK_GUN',stG,[stT,stP,stM]));
    btn('deckGunLayButton', ()=>this.game.dispatch({type:'LAY_DECK_GUN'}));
    btn('deckGunFireButton',()=>this.game.dispatch({type:'FIRE_DECK_GUN'}));
    btn('deckGunLeftButton',()=>this.game.dispatch({type:'ADJUST_DECK_GUN',deltaTrainDeg:-1}));
    btn('deckGunRightButton',()=>this.game.dispatch({type:'ADJUST_DECK_GUN',deltaTrainDeg:1}));
    btn('deckGunUpButton',()=>this.game.dispatch({type:'ADJUST_DECK_GUN',deltaElevDeg:.2}));
    btn('deckGunDownButton',()=>this.game.dispatch({type:'ADJUST_DECK_GUN',deltaElevDeg:-.2}));
    btn('tdcSetManualButton',()=>this.game.dispatch({type:'APPLY_TDC_MANUAL'}));
    btn('briefingDismiss',  ()=>{document.getElementById('briefingOverlay').style.display='none';});

    // TDC manual sliders
    const tdcB=document.getElementById('tdcBearingInput'); const tdcBV=document.getElementById('tdcBearingVal');
    const tdcR=document.getElementById('tdcRangeInput');   const tdcRV=document.getElementById('tdcRangeVal');
    const tdcC=document.getElementById('tdcCourseInput');  const tdcCV=document.getElementById('tdcCourseVal');
    const tdcS=document.getElementById('tdcSpeedInput');   const tdcSV=document.getElementById('tdcSpeedVal');
    tdcB?.addEventListener('input',()=>{if(tdcBV)tdcBV.textContent=fmtDeg(+tdcB.value);this.game.dispatch({type:'SET_TDC_MANUAL',bearing:+tdcB.value});});
    tdcR?.addEventListener('input',()=>{if(tdcRV)tdcRV.textContent=(+tdcR.value).toFixed(1);this.game.dispatch({type:'SET_TDC_MANUAL',range:+tdcR.value});});
    tdcC?.addEventListener('input',()=>{if(tdcCV)tdcCV.textContent=fmtDeg(+tdcC.value);this.game.dispatch({type:'SET_TDC_MANUAL',course:+tdcC.value});});
    tdcS?.addEventListener('input',()=>{if(tdcSV)tdcSV.textContent=(+tdcS.value).toFixed(1);this.game.dispatch({type:'SET_TDC_MANUAL',speed:+tdcS.value});});
    document.getElementById('torpTypeSelect')?.addEventListener('change',e=>this.game.dispatch({type:'SET_TORPEDO_TYPE',specKey:e.target.value}));
    document.getElementById('dudSelect')?.addEventListener('change',e=>this.game.dispatch({type:'SET_DUD_MODE',mode:e.target.value}));

    // Keyboard
    window.addEventListener('keydown',e=>{
      if(e.target&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      const k=e.key.toLowerCase();
      if(k==='1'&&stT) stT.click(); if(k==='2'&&stP) stP.click(); if(k==='3'&&stM) stM.click(); if(k==='4'&&stG) stG.click();
      if(k==='s') this.game.dispatch({type:'TOGGLE_SILENT_RUNNING'});
      if(k==='e') this.game.dispatch({type:'EMERGENCY_BLOW'});
      if(k==='p') this.game.dispatch({type:'TOGGLE_PUMPS'});
      if(k==='h') this.game.dispatch({type:'HEAD_TO_PORT'});
      if(k==='arrowleft') this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:-5});
      if(k==='arrowright') this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:5});
      if(k===' '){e.preventDefault();const s=this.game.getSnapshot();s.time.timeScale=s.time.timeScale===0?1:0;}
    });

    // Map click (desktop)
    this.cv.canvas.addEventListener('click',e=>{
      // touch devices are served by TouchCtrl's gesture handler; without this
      // guard the synthetic click fires a second time on every tap
      if(document.documentElement.dataset.lay!=='desk') return;
      const s=this.game.getSnapshot();
      if(s.tactical.activeStation!=='MAP') return;
      const wi=this.cv.pickWaypoint(s,e.clientX,e.clientY);
      if(wi>=0){this.game.dispatch({type:'MAP_REMOVE_WAYPOINT',index:wi});return;}
      const id=this.cv.pickTrack(s,e.clientX,e.clientY);
      if(id){this.game.dispatch({type:'SELECT_TRACK',trackId:id});
             this.game.dispatch({type:'TDC_SEND_SCOPE_OBSERVATION'});return;}
      const w=this.cv.screenToWorldMap(e.clientX,e.clientY);
      const snap=0.25;
      this.game.dispatch({type:'MAP_ADD_WAYPOINT',xNm:Math.round(w.xNm/snap)*snap,yNm:Math.round(w.yNm/snap)*snap});
      this.game.dispatch({type:'MAP_STEER_TO_NEXT_WAYPOINT'});
    });
  }
}

