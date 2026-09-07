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
    const setHeading=value=>{const heading=Math.round(normDeg(Number(value)||0));if(hi)hi.value=String(heading);const exact=document.getElementById('headingNumberInput');if(exact&&exact!==document.activeElement)exact.value=String(heading);if(hv)hv.textContent=fmtDeg(heading);this.game.dispatch({type:'SET_ORDERED_HEADING',heading});};
    hi?.addEventListener('input',()=>setHeading(hi.value));
    ri?.addEventListener('input',()=>{if(rv)rv.textContent=ri.value;this.game.dispatch({type:'SET_ENGINE_RPM',rpm:+ri.value});});
    di?.addEventListener('input',()=>{if(dv)dv.textContent=`${di.value} ft`;this.game.dispatch({type:'SET_ORDERED_DEPTH',depthFeet:+di.value});});
    const btn=(id,fn)=>document.getElementById(id)?.addEventListener('click',fn);
    const setRpm=value=>{const max=this.game.getSnapshot().playerSub.propulsion.characteristics?.normalizedMaxRpm??450,rpm=clamp(Math.round(Number(value)||0),0,max);if(ri)ri.value=String(rpm);const exact=document.getElementById('rpmNumberInput');if(exact)exact.value=String(rpm);if(rv)rv.textContent=String(rpm);this.game.dispatch({type:'SET_ENGINE_RPM',rpm});};
    const setDepth=value=>{const max=Number(di?.max)||300,depth=clamp(Math.round(Number(value)||0),0,max);if(di)di.value=String(depth);const exact=document.getElementById('depthNumberInput');if(exact)exact.value=String(depth);if(dv)dv.textContent=`${depth} ft`;this.game.dispatch({type:'SET_ORDERED_DEPTH',depthFeet:depth});};
    document.querySelectorAll?.('[data-hstep]')?.forEach(b=>{if(!b.closest('#touchShell'))b.addEventListener('click',()=>setHeading(this.game.getSnapshot().playerSub.orderedHeading+Number(b.dataset.hstep)));});
    document.getElementById('headingNumberInput')?.addEventListener('change',e=>setHeading(e.target.value));
    document.querySelectorAll?.('[data-deskrpm]')?.forEach(b=>b.addEventListener('click',()=>setRpm(b.dataset.deskrpm)));
    document.querySelectorAll?.('[data-deskrstep]')?.forEach(b=>b.addEventListener('click',()=>setRpm(this.game.getSnapshot().playerSub.propulsion.orderedRpm+Number(b.dataset.deskrstep))));
    document.querySelectorAll?.('[data-deskdstep]')?.forEach(b=>b.addEventListener('click',()=>setDepth(this.game.getSnapshot().playerSub.orderedDepthFeet+Number(b.dataset.deskdstep))));
    document.getElementById('rpmNumberInput')?.addEventListener('change',e=>setRpm(e.target.value));
    document.getElementById('depthNumberInput')?.addEventListener('change',e=>setDepth(e.target.value));
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
    document.querySelectorAll?.('[data-scope-zoom]')?.forEach(b=>{if(!b.closest('#touchShell'))b.addEventListener('click',()=>this.game.dispatch({type:'SET_PERISCOPE_ZOOM',zoom:Number(b.dataset.scopeZoom)}));});
    btn('scopeOverlayLeft', ()=>this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:-5}));
    btn('scopeOverlayRight',()=>this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:5}));
    btn('scopeOverlayZoom', ()=>this.game.dispatch({type:'TOGGLE_PERISCOPE_ZOOM'}));
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
    btn('plotInterceptButton',()=>this.game.dispatch({type:'PLOT_INTERCEPT_ADVISORY'}));
    btn('followPlotButton', ()=>this.game.dispatch({type:'MAP_STEER_TO_NEXT_WAYPOINT'}));
    btn('mapWeatherButton',()=>this.game.dispatch({type:'TOGGLE_MAP_WEATHER'}));
    btn('portButton',       ()=>this.game.dispatch({type:'HEAD_TO_PORT'}));
    btn('stationTactical',  ()=>setSta('TACTICAL'));
    btn('stationBridge',    ()=>setSta('BRIDGE'));
    btn('stationSound',     ()=>setSta('SOUND'));
    btn('stationPeriscope', ()=>setSta('PERISCOPE'));
    btn('stationMap',       ()=>setSta('MAP'));
    btn('stationDeckGun',   ()=>setSta('DECK_GUN'));
    btn('soundLeft',       ()=>this.game.dispatch({type:'ROTATE_SOUND',deltaDeg:-5}));
    btn('soundRight',      ()=>this.game.dispatch({type:'ROTATE_SOUND',deltaDeg:5}));
    btn('soundMark',       ()=>this.game.dispatch({type:'SOUND_MARK_BEARING'}));
    btn('soundEcho',       ()=>this.confirmActiveQc());
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
      if(globalThis.ppKeyboardBlocked?.()) return;
      if(e.ctrlKey||e.metaKey||e.altKey) return;
      const k=e.key.toLowerCase();
      const stationKeys={1:stT,2:stP,3:stM,4:stG,5:stB,6:stS};
      if(stationKeys[k]){if(!e.repeat)stationKeys[k].click();e.preventDefault();return;}
      const snap=this.game.getSnapshot(),sub=snap.playerSub,p=sub.propulsion;
      const order=(type,value,key)=>{this.game.dispatch({type,[key]:value});e.preventDefault();};
      if(k==='['){order('SET_ORDERED_HEADING',normDeg(sub.orderedHeading-5),'heading');return;}
      if(k===']'){order('SET_ORDERED_HEADING',normDeg(sub.orderedHeading+5),'heading');return;}
      if(k===','||k==='<'){order('SET_ENGINE_RPM',clamp(p.orderedRpm-25,0,p.characteristics?.normalizedMaxRpm??450),'rpm');return;}
      if(k==='.'||k==='>'){order('SET_ENGINE_RPM',clamp(p.orderedRpm+25,0,p.characteristics?.normalizedMaxRpm??450),'rpm');return;}
      if(k==='pageup'){order('SET_ORDERED_DEPTH',clamp(sub.orderedDepthFeet-10,0,300),'depthFeet');return;}
      if(k==='pagedown'){order('SET_ORDERED_DEPTH',clamp(sub.orderedDepthFeet+10,0,300),'depthFeet');return;}
      if(k==='s'&&!e.repeat){this.game.dispatch({type:'TOGGLE_SILENT_RUNNING'});return;}
      if(k==='e'&&!e.repeat){this.game.dispatch({type:'EMERGENCY_BLOW'});return;}
      if(k==='p'&&!e.repeat){this.game.dispatch({type:'TOGGLE_PUMPS'});return;}
      if(k==='h'&&!e.repeat){this.game.dispatch({type:'HEAD_TO_PORT'});return;}
      const a=snap.tactical.activeStation;
      if(k==='arrowleft'||k==='arrowright'){
        const d=k==='arrowleft'?-5:5;
        if(a==='BRIDGE')this.game.dispatch({type:'ROTATE_BRIDGE',deltaDeg:d});
        else if(a==='SOUND')this.game.dispatch({type:'ROTATE_SOUND',deltaDeg:d});
        else if(a==='DECK_GUN')this.game.dispatch({type:'ADJUST_DECK_GUN',deltaTrainDeg:d>0?1:-1});
        else if(a==='TACTICAL')this.game.dispatch({type:'SET_ORDERED_HEADING',heading:normDeg(sub.orderedHeading+d)});
        else if(a==='MAP')this.cv.panBy(d<0?35:-35,0);
        else if(a==='PERISCOPE')this.game.dispatch({type:'ROTATE_PERISCOPE',deltaDeg:d});
        e.preventDefault();return;
      }
      if((k==='arrowup'||k==='arrowdown')&&a==='DECK_GUN'){
        this.game.dispatch({type:'ADJUST_DECK_GUN',deltaElevDeg:k==='arrowup'?.2:-.2});e.preventDefault();return;
      }
      if((k==='arrowup'||k==='arrowdown')&&a==='MAP'){
        this.cv.panBy(0,k==='arrowup'?35:-35);e.preventDefault();return;
      }
      if(k===' '){e.preventDefault();this.game.dispatch({type:'SET_TIME_SCALE',scale:snap.time.timeScale===0?1:0});}
    });
  }
  confirmActiveQc(){
    const now=performance.now(),btn=document.getElementById('soundEcho');
    if(now<this._qcConfirmUntil){
      this._qcConfirmUntil=0;if(this._qcConfirmTimer){clearTimeout(this._qcConfirmTimer);this._qcConfirmTimer=null;}
      btn?.classList.remove('confirm');if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent='Active QC';}
      this.game.dispatch({type:'SOUND_ECHO_RANGE'});return;
    }
    this._qcConfirmUntil=now+2800;btn?.classList.add('confirm');
    if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent='Confirm Ping';}
    if(typeof Toast!=='undefined')Toast.warn('ACTIVE QC WILL BROADCAST YOUR POSITION — tap CONFIRM PING to transmit.');
    if(this._qcConfirmTimer)clearTimeout(this._qcConfirmTimer);
    this._qcConfirmTimer=setTimeout(()=>{this._qcConfirmUntil=0;this._qcConfirmTimer=null;btn?.classList.remove('confirm');if(btn){const sp=btn.querySelector('span');if(sp)sp.textContent='Active QC';}},2850);
  }

}
