// ═══════════════════════════════════════════════════ DESKTOP CONTROLLER
class BridgeController{
  constructor(game,cv){this.game=game;this.cv=cv;this._qcConfirmUntil=0;this._qcConfirmTimer=null;this.bind();}
  bind(){
    const hi=document.getElementById('headingInput');
    const ri=document.getElementById('rpmInput');
    const di=document.getElementById('depthInput');
    const hv=document.getElementById('orderedHeadingValue');
    const rv=document.getElementById('rpmValue');
    const dv=document.getElementById('depthValue');
    const stT=document.getElementById('stationTactical');
    const stB=document.getElementById('stationBridge');
    const stS=document.getElementById('stationSound');
    const stP=document.getElementById('stationPeriscope');
    const stM=document.getElementById('stationMap');
    const stG=document.getElementById('stationDeckGun');
    const allStations=[stT,stB,stS,stP,stM,stG].filter(Boolean);
    const stationByName={TACTICAL:stT,BRIDGE:stB,SOUND:stS,PERISCOPE:stP,MAP:stM,DECK_GUN:stG};
    const setSta=s=>{
      this.game.dispatch({type:'SET_ACTIVE_STATION',station:s});
      const snap=this.game.getSnapshot(),actual=snap.tactical.activeStation;
      allStations.forEach(b=>b.classList.toggle('active',b===stationByName[actual]));
      this.cv.render(snap);                 // navigation should feel immediate
    };
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
    btn('fireTubeButton',   ()=>{
      const s=this.game.getSnapshot(),bank=s.tdc?.launchBank||'FWD';
      // Follow the TDC-selected bank; hard-coding tube 1 reintroduced the exact
      // close-range geometry error TDC 2.0 is designed to remove.
      const t=s.weapons.tubes.find(x=>x.pos===bank&&x.status==='READY')||s.weapons.tubes.find(x=>x.status==='READY');
      if(t)this.game.dispatch({type:'FIRE_TORPEDO',tubeId:t.id});
      else globalThis.Toast?.warn?.('No torpedo tube ready.');
    });
    btn('fireSpreadButton', ()=>this.game.dispatch({type:'FIRE_READY_SPREAD'}));
    btn('floodAftButton',   ()=>this.game.dispatch({type:'FLOOD_AFT_TUBES'}));
    btn('fireAftButton',    ()=>this.game.dispatch({type:'FIRE_AFT_SPREAD'}));
    btn('clearPlotButton',  ()=>this.game.dispatch({type:'MAP_CLEAR_PLOT'}));
    btn('followPlotButton', ()=>this.game.dispatch({type:'MAP_STEER_TO_NEXT_WAYPOINT'}));
    btn('mapWeatherButton',()=>this.game.dispatch({type:'TOGGLE_MAP_WEATHER'}));
    btn('portButton',       ()=>this.game.dispatch({type:'HEAD_TO_PORT'}));
    btn('newScenarioButton',()=>this.game.dispatch({type:'NEW_PATROL'}));
    btn('stationTactical',  ()=>setSta('TACTICAL'));
    btn('stationBridge',    ()=>setSta('BRIDGE'));
    btn('stationSound',     ()=>setSta('SOUND'));
    btn('stationPeriscope', ()=>setSta('PERISCOPE'));
    btn('stationMap',       ()=>setSta('MAP'));
    btn('stationDeckGun',   ()=>setSta('DECK_GUN'));
    btn('soundLeft',       ()=>this.game.dispatch({type:'ROTATE_SOUND',deltaDeg:-5}));
    btn('soundRight',      ()=>this.game.dispatch({type:'ROTATE_SOUND',deltaDeg:5}));
    btn('soundMark',       ()=>this.game.dispatch({type:'SOUND_MARK_BEARING'}));
    btn('soundEcho',       ()=>this.confirmActiveEcho());
    btn('soundRadar',      ()=>this.game.dispatch({type:'TOGGLE_SOUND_DISPLAY'}));
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
      if(k==='1'&&stT) stT.click(); if(k==='2'&&stP) stP.click(); if(k==='3'&&stM) stM.click(); if(k==='4'&&stG) stG.click(); if(k==='5'&&stB) stB.click(); if(k==='6'&&stS) stS.click();
      if(k==='s') this.game.dispatch({type:'TOGGLE_SILENT_RUNNING'});
      if(k==='e') this.game.dispatch({type:'EMERGENCY_BLOW'});
      if(k==='p') this.game.dispatch({type:'TOGGLE_PUMPS'});
      if(k==='h') this.game.dispatch({type:'HEAD_TO_PORT'});
      if(k==='arrowleft'){const q=this.game.getSnapshot(),a=q.tactical.activeStation;this.game.dispatch({type:a==='BRIDGE'?'ROTATE_BRIDGE':a==='SOUND'?'ROTATE_SOUND':'ROTATE_PERISCOPE',deltaDeg:-5});}
      if(k==='arrowright'){const q=this.game.getSnapshot(),a=q.tactical.activeStation;this.game.dispatch({type:a==='BRIDGE'?'ROTATE_BRIDGE':a==='SOUND'?'ROTATE_SOUND':'ROTATE_PERISCOPE',deltaDeg:5});}
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
      if(id){
        if(id===s.tactical.selectedTrackId)this.game.dispatch({type:'DESELECT_TRACK'});
        else {this.game.dispatch({type:'SELECT_TRACK',trackId:id});
              this.game.dispatch({type:'TDC_SEND_SCOPE_OBSERVATION'});}
        return;
      }
      const w=this.cv.screenToWorldMap(e.clientX,e.clientY);
      const snap=0.25;
      this.game.dispatch({type:'MAP_ADD_WAYPOINT',xNm:Math.round(w.xNm/snap)*snap,yNm:Math.round(w.yNm/snap)*snap});
      this.game.dispatch({type:'MAP_STEER_TO_NEXT_WAYPOINT'});
    });
  }
  confirmActiveEcho(){
    const now=performance.now(),btn=document.getElementById('soundEcho'),state=this.game.getSnapshot();
    const sensorUi=getPlayerSensorPresentation(state),activeEchoLabel=sensorUi.activeEcho?.label||'Active Echo';
    if(now<this._qcConfirmUntil){
      this._qcConfirmUntil=0;if(this._qcConfirmTimer){clearTimeout(this._qcConfirmTimer);this._qcConfirmTimer=null;}
      btn?.classList.remove('confirm');if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent=activeEchoLabel;}
      this.game.dispatch({type:'SOUND_ECHO_RANGE'});return;
    }
    this._qcConfirmUntil=now+2800;btn?.classList.add('confirm');
    if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent='Confirm Ping';}
    if(typeof Toast!=='undefined')Toast.warn(`${activeEchoLabel.toUpperCase()} WILL BROADCAST YOUR POSITION — tap CONFIRM PING to transmit.`);
    if(this._qcConfirmTimer)clearTimeout(this._qcConfirmTimer);
    this._qcConfirmTimer=setTimeout(()=>{this._qcConfirmUntil=0;this._qcConfirmTimer=null;btn?.classList.remove('confirm');if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent=activeEchoLabel;}},2850);
  }

}

