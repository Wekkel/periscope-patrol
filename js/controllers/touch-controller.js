// ═══════════════════════════════════════════════════ MOBILE CONTROLLER
// ═══════════════════════════════════════════════════ TOUCH CONTROLLER
const buzz=(ms)=>{try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}};

class TouchCtrl{
  constructor(game,cv){
    this.game=game; this.cv=cv;
    this.touch=false; this.pane='view'; this.canvasMoved=false; this.wired=false;
    this.cache={}; this.dragging=null; this.lastSync=0;
    this.applyLayout(true);
    window.addEventListener('resize',()=>this.applyLayout(),{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(()=>this.applyLayout(),160),{passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize',()=>this.syncViewport(),{passive:true});
      window.visualViewport.addEventListener('scroll',()=>this.syncViewport(),{passive:true});
    }
    setInterval(()=>this.syncViewport(),1500);   // Android toolbars slide in and out silently
  }

  /* ── layout selection ── */
  isTouchLayout(){
    const forced=(new URLSearchParams(location.search).get('ui'))||localStorage.getItem(PP_BUILD.storageKey('ss_ui'));
    if(forced==='touch') return true;
    if(forced==='desk')  return false;
    const mm=q=>window.matchMedia?window.matchMedia(q).matches:false;
    const coarse=mm('(pointer:coarse)')||('ontouchstart' in window)||(navigator.maxTouchPoints||0)>0;
    const fine=mm('(pointer:fine)');
    /* A laptop can expose touch points as well as a mouse/trackpad. Treating
       every such hybrid as a phone was why wide browser windows sometimes got
       the mobile shell. A fine pointer plus usable width is a desktop cockpit;
       genuinely coarse devices keep the touch shell regardless of orientation. */
    if(fine&&window.innerWidth>=900) return false;
    if(coarse&&!fine) return true;
    return window.innerWidth<1024;
  }

  syncViewport(){
    const vv=window.visualViewport;
    const h=Math.round((vv&&vv.height)||window.innerHeight||0);
    if(h>200&&h!==this._vh){
      this._vh=h;
      document.documentElement.style.setProperty('--appH',h+'px');
      requestAnimationFrame(()=>{this.cv.resize(true);this.checkLayout();});
    }
  }

  // The Android toolbar and the browser's "large viewport" have a habit of
  // pushing the tab bar off the bottom of the screen. Measure it and clamp.
  checkLayout(){
    if(!this.touch) return null;
    const tabs=document.getElementById('tTabs');
    if(!tabs) return null;
    const r=tabs.getBoundingClientRect();
    const vh=Math.round((window.visualViewport&&window.visualViewport.height)||window.innerHeight);
    const off=Math.round(r.bottom-vh);
    if(off>2&&vh>200){
      document.documentElement.style.setProperty('--appH',vh+'px');
      this.cv.resize(true);
    }
    // is anything sitting on top of the tab bar?
    let blocked=null;
    if(document.elementFromPoint&&r.height>10){
      const hit=document.elementFromPoint(Math.round(r.left+r.width/2),Math.round(r.top+r.height/2));
      if(hit&&!hit.closest('#tTabs')) blocked=hit.id||hit.className||hit.tagName;
    }
    return{tabsBottom:Math.round(r.bottom),viewport:vh,overflow:off,blockedBy:blocked};
  }

  syncTacticalSafeAreas(){
    if(!this.touch||!this.cv?.canvas){this.cv.touchSafeTactical=null;return null;}
    const sta=this.game?.getSnapshot?.()?.tactical?.activeStation||'TACTICAL';
    if(sta!=='TACTICAL'){this.cv.touchSafeTactical=null;return null;}
    const canvas=this.cv.canvas,nav=document.getElementById('ovlStations'),right=document.getElementById('ovlRight');
    if(!nav||!right)return null;
    const cr=canvas.getBoundingClientRect(),nr=nav.getBoundingClientRect(),rr=right.getBoundingClientRect();
    if(cr.width<40||cr.height<40)return null;
    /* Real DOM geometry, in the same CSS-pixel coordinate system as CanvasView.
       This keeps TAC correct on a narrow phone, a large Android tablet and
       unusual browser zoom/DPR values without maintaining device breakpoints. */
    const safe={
      top:clamp(nr.bottom-cr.top+6,0,Math.min(92,cr.height*.18)),
      navLeft:clamp(nr.left-cr.left,0,cr.width),
      rightStart:clamp(rr.left-cr.left,cr.width*.52,cr.width),
      chipWidth:clamp(nr.left-cr.left-16,58,Math.min(330,cr.width*.62))
    };
    this.cv.touchSafeTactical=safe;
    return safe;
  }

  applyLayout(first){
    this.syncViewport();
    const want=this.isTouchLayout();
    document.documentElement.dataset.lay=want?'touch':'desk';
    if(want&&(!this.touch||first)){this.touch=true;this.enterTouch();}
    else if(!want&&(this.touch||first)){this.touch=false;this.enterDesk();}
    requestAnimationFrame(()=>{this.cv.resize(true);this.cache={};this.checkLayout();});
  }

  enterTouch(){
    const stage=document.getElementById('tStage');
    const deskC=document.getElementById('deskCanvas');
    if(stage&&deskC&&deskC.parentElement!==stage) stage.insertBefore(deskC,stage.firstChild);
    if(deskC) deskC.style.cssText='position:absolute;inset:0;padding:0;margin:0;border:none;'+
      'background:none;box-shadow:none;border-radius:0;';
    this.canvasMoved=true;
    if(!this.wired) this.wire();
    this.setPane(this.pane||'view');
  }

  enterDesk(){
    const shell=document.getElementById('desktopShell');
    const deskC=document.getElementById('deskCanvas');
    const right=document.getElementById('deskRight');
    if(shell&&deskC&&right&&deskC.parentElement!==shell) shell.insertBefore(deskC,right);
    if(deskC) deskC.style.cssText='';          // back to the stylesheet's grid cell
    this.canvasMoved=false;
    if(!this.wired) this.wire();
  }

  /* ── one-time wiring ── */
  wire(){
    this.wired=true;
    const g=id=>document.getElementById(id);
    /* Feedback on press. A capacitive screen gives the finger nothing back,
       so a button that takes a moment to have a visible effect reads as
       broken. Every button in the touch shell now flashes and buzzes the
       instant it is touched, before any command is even dispatched. */
    const press=el=>{
      if(!el) return;
      el.classList.add('pressed');
      clearTimeout(el._pt);
      el._pt=setTimeout(()=>el.classList.remove('pressed'),170);
    };
    this._press=press;
    document.querySelectorAll('#touchShell button, #touchShell .rbtn').forEach(el=>{
      el.addEventListener('pointerdown',()=>{press(el);buzz(8);},{passive:true});
    });
    const btn=(id,fn)=>{const el=g(id);if(el)el.addEventListener('click',e=>{e.preventDefault();press(el);fn(el);},{passive:false});};
    const D=c=>this.game.dispatch(c);

    // tab bar + sheet
    document.querySelectorAll('#tTabs .mob-tab').forEach(t=>{
      t.addEventListener('pointerdown',()=>{t.classList.add('pressed');buzz(10);},{passive:true});
      const off=()=>t.classList.remove('pressed');
      t.addEventListener('pointerup',off,{passive:true});
      t.addEventListener('pointercancel',off,{passive:true});
      t.addEventListener('pointerleave',off,{passive:true});
      t.addEventListener('click',()=>{off();this.setPane(t.dataset.pane);},{passive:true});
    });
    btn('tSheetClose',()=>this.setPane('view'));

    // top bar
    const onTime=e=>{
      const v=e.target.value;
      if(String(v).startsWith('skip')){
        // "skip0" = no clock: run until an event stops her
        D({type:'START_TRANSIT',seconds:+String(v).slice(4)||0});
        this.setPane('view');buzz(12);
        e.target.value=String(this.game.getSnapshot().time.timeScale);
      }else{D({type:'SET_TIME_SCALE',scale:+v});buzz(8);}
    };
    g('tBtnTime')?.addEventListener('change',onTime);
    g('mTimeSel')?.addEventListener('change',onTime);
    btn('tBtnMenu',()=>sceneSelector?.open());

    // station switcher
    document.querySelectorAll('#ovlStations button').forEach(b=>{
      b.addEventListener('click',()=>{
        D({type:'SET_ACTIVE_STATION',station:b.dataset.sta});
        this.setPane('view');
        /* Do not wait for the next physics/RAF tick to make a station tap
           visible. A view change is navigation, so repaint it immediately.
           This also keeps the bridge usable if a migrated save trips a
           simulation subsystem later in the frame. */
        const snap=this.game.getSnapshot();
        this.cv.render(snap);
        this.updateTouch(snap,true);
        buzz(8);
      },{passive:true});
    });

    // stage overlay buttons
    btn('oZoomIn', ()=>this.cv.zoomAt(1.35,innerWidth/2,innerHeight/2));
    btn('oZoomOut',()=>this.cv.zoomAt(1/1.35,innerWidth/2,innerHeight/2));
    btn('oCenter', ()=>{this.cv.recenter(this.game.getSnapshot().playerSub);Toast.ok('Map centred on ownship');});
    btn('oClear',  ()=>D({type:'MAP_CLEAR_PLOT'}));
    btn('oWeather',()=>{D({type:'TOGGLE_MAP_WEATHER'});buzz(8);});
    btn('mapWxChip',()=>{D({type:'TOGGLE_MAP_WEATHER'});buzz(8);});
    btn('oScopeL', ()=>D({type:'ROTATE_PERISCOPE',deltaDeg:-5}));
    btn('oScopeR', ()=>D({type:'ROTATE_PERISCOPE',deltaDeg:5}));
    btn('oScopeZ', ()=>D({type:'TOGGLE_PERISCOPE_ZOOM'}));
    btn('oSurface',()=>{D({type:'SURFACE'});this.setDepthSlider(0);});
    btn('oScopeDepth',()=>{D({type:'PERISCOPE_DEPTH'});this.setDepthSlider(55);});
    btn('oDive',   ()=>{D({type:'DIVE'});this.setDepthSlider(100);});
    btn('oGunLay', ()=>{D({type:'LAY_DECK_GUN'});buzz(10);});
    btn('oGunFire',()=>{D({type:'FIRE_DECK_GUN'});buzz([18,22,18]);});
    btn('oGunElevUp',()=>{D({type:'ADJUST_DECK_GUN',deltaElevDeg:.1});buzz(6);});
    btn('oGunElevDown',()=>{D({type:'ADJUST_DECK_GUN',deltaElevDeg:-.1});buzz(6);});
    {const el=g('oGunElev');
      if(el){
        const read=()=>g('gunElevReadout');
        el.addEventListener('input',()=>{
          const v=clamp(+el.value,0,22),r=read();
          if(r)r.textContent=`${v.toFixed(1)}°`;
          D({type:'SET_DECK_GUN_ELEVATION',elevationDeg:v});
        },{passive:true});
        el.addEventListener('pointerdown',()=>{this.dragging='oGunElev';},{passive:true});
        const drop=()=>{if(this.dragging==='oGunElev')this.dragging=null;};
        el.addEventListener('pointerup',drop,{passive:true});
        el.addEventListener('pointercancel',drop,{passive:true});
      }
    }
    btn('bridgeBino',()=>{D({type:'TOGGLE_BRIDGE_BINOCULARS'});buzz(10);});
    btn('bridgeMark',()=>{D({type:'BRIDGE_MARK_CONTACT'});buzz(10);});
    btn('bridgeTarget',()=>{D({type:'BRIDGE_TARGET_CENTER'});buzz(14);});
    btn('bridgeGun',()=>{D({type:'SET_ACTIVE_STATION',station:'DECK_GUN'});buzz(14);});
    btn('soundLeft',()=>{D({type:'ROTATE_SOUND',deltaDeg:-5});buzz(6);});
    btn('soundRight',()=>{D({type:'ROTATE_SOUND',deltaDeg:5});buzz(6);});
    btn('soundMark',()=>{D({type:'SOUND_MARK_BEARING'});buzz(10);});
    // soundEcho is intentionally NOT rebound here. BridgeController owns the
    // button on every layout so touch devices use the same two-step ACTIVE QC
    // confirmation as desktop. A second touch listener would transmit on the
    // first tap and silently defeat the warning.
    btn('soundRadar',()=>{D({type:'TOGGLE_SOUND_DISPLAY'});buzz(10);});
    btn('oSilent', ()=>{D({type:'TOGGLE_SILENT_RUNNING'});buzz(12);});
    btn('oLock',   ()=>{D({type:'PERISCOPE_SELECT_CENTER_CONTACT'});D({type:'TDC_SEND_SCOPE_OBSERVATION'});buzz(12);});
    btn('btnFire', ()=>this.quickFire());

    // helm sheet
    const bindRange=(id,valId,fmt,cmd)=>{
      const el=g(id),vel=g(valId);if(!el)return;
      el.addEventListener('input',()=>{if(vel)vel.textContent=fmt(+el.value);D(cmd(+el.value));},{passive:true});
      el.addEventListener('pointerdown',()=>{this.dragging=id;},{passive:true});
      el.addEventListener('pointerup',()=>{this.dragging=null;},{passive:true});
      el.addEventListener('pointercancel',()=>{this.dragging=null;},{passive:true});
    };
    bindRange('mHdg','mHdgV',v=>fmtDeg(v),v=>({type:'SET_ORDERED_HEADING',heading:v}));
    bindRange('mRpm',null,v=>v,v=>({type:'SET_ENGINE_RPM',rpm:v}));
    bindRange('mDpt',null,v=>v,v=>({type:'SET_ORDERED_DEPTH',depthFeet:v}));
    document.querySelectorAll('#touchShell [data-hstep]').forEach(b=>b.addEventListener('click',()=>{this._press(b);this.nudgeHeading(Number(b.dataset.hstep));},{passive:true}));
    g('mHeadingNumberInput')?.addEventListener('change',e=>{const v=Math.round(normDeg(Number(e.target.value)||0));this.setHeadingSlider(v);D({type:'SET_ORDERED_HEADING',heading:v});});
    document.querySelectorAll('#touchShell [data-scope-zoom]').forEach(b=>b.addEventListener('click',()=>D({type:'SET_PERISCOPE_ZOOM',zoom:Number(b.dataset.scopeZoom)}),{passive:true}));
    btn('mHdgM10',()=>this.nudgeHeading(-10));
    btn('mHdgP10',()=>this.nudgeHeading(10));
    document.querySelectorAll('#paneHelm [data-hdg]').forEach(b=>b.addEventListener('click',()=>{
      const v=+b.dataset.hdg;this.setHeadingSlider(v);D({type:'SET_ORDERED_HEADING',heading:v});buzz(8);
    },{passive:true}));
    document.querySelectorAll('#paneHelm [data-rpm]').forEach(b=>b.addEventListener('click',()=>{
      const v=+b.dataset.rpm;const el=g('mRpm');if(el)el.value=v;D({type:'SET_ENGINE_RPM',rpm:v});buzz(8);
    },{passive:true}));
    /* ── ORDER PAD ── */
    this.pad=null;
    const padEl=g('orderPad');
    const openPad=which=>{
      if(this.pad===which){closePad();return;}
      this.pad=which;
      padEl?.classList.add('on');
      g('opDepth')?.classList.toggle('on',which==='depth');
      g('opSpeed')?.classList.toggle('on',which==='speed');
      const t=g('opTitle'); if(t) t.textContent=which==='depth'?'Depth':'Engine';
      g('qsDepth')?.classList.toggle('open',which==='depth');
      g('qsSpeed')?.classList.toggle('open',which==='speed');
      this.cache={};                       // force the read-outs to repaint
      this.updateTouch(this.game.getSnapshot(),true);
      buzz(10);
    };
    const closePad=()=>{
      this.pad=null;padEl?.classList.remove('on');
      g('qsDepth')?.classList.remove('open');g('qsSpeed')?.classList.remove('open');
    };
    this.closePad=closePad;
    for(const [id,which] of [['qsDepth','depth'],['qsSpeed','speed']]){
      const el=g(id); if(!el) continue;
      el.addEventListener('pointerdown',()=>{el.classList.add('pressed');},{passive:true});
      const off=()=>el.classList.remove('pressed');
      el.addEventListener('pointerup',off,{passive:true});
      el.addEventListener('pointercancel',off,{passive:true});
      el.addEventListener('click',()=>{off();openPad(which);},{passive:true});
    }
    btn('opClose',closePad);
    // tapping the picture puts the pad away
    window.addEventListener('pointerdown',e=>{
      if(!this.pad) return;
      if(padEl&&padEl.contains(e.target)) return;
      if(g('qsDepth')?.contains(e.target)||g('qsSpeed')?.contains(e.target)) return;
      closePad();
    },{passive:true,capture:true});

    const ordDepth=()=>this.game.getSnapshot().playerSub.orderedDepthFeet;
    const ordRpm  =()=>this.game.getSnapshot().playerSub.propulsion.orderedRpm;
    document.querySelectorAll('#opDepth [data-depth]').forEach(b=>b.addEventListener('click',()=>{
      const v=+b.dataset.depth;this._press(b);
      D({type:'SET_ORDERED_DEPTH',depthFeet:v});this.setDepthSlider(v);buzz(10);
    },{passive:true}));
    document.querySelectorAll('#opDepth [data-dstep]').forEach(b=>b.addEventListener('click',()=>{
      const v=clamp(Math.round((ordDepth()+ +b.dataset.dstep)/5)*5,0,300);this._press(b);
      D({type:'SET_ORDERED_DEPTH',depthFeet:v});this.setDepthSlider(v);buzz(8);
    },{passive:true}));
    document.querySelectorAll('#opSpeed [data-rpm]').forEach(b=>b.addEventListener('click',()=>{
      const v=+b.dataset.rpm;this._press(b);
      D({type:'SET_ENGINE_RPM',rpm:v});const el=g('mRpm');if(el)el.value=v;buzz(10);
    },{passive:true}));
    document.querySelectorAll('#opSpeed [data-rstep]').forEach(b=>b.addEventListener('click',()=>{
      const maxRpm=this.game.getSnapshot().playerSub.propulsion?.characteristics?.normalizedMaxRpm??450,v=clamp(ordRpm()+ +b.dataset.rstep,0,maxRpm);this._press(b);
      D({type:'SET_ENGINE_RPM',rpm:v});const el=g('mRpm');if(el)el.value=v;buzz(8);
    },{passive:true}));
    btn('opCrash',()=>{D({type:'CRASH_DIVE'});this.setDepthSlider(150);buzz([20,40,20]);closePad();});
    btn('opBlow', ()=>{D({type:'EMERGENCY_BLOW'});this.setDepthSlider(0);buzz([20,40,20]);closePad();});
    btn('opBottom',()=>{D({type:'BOTTOM_OUT'});buzz([15,30,15]);closePad();});

    btn('mSurface',  ()=>{D({type:'SURFACE'});this.setDepthSlider(0);});
    btn('mPeriscope',()=>{D({type:'PERISCOPE_DEPTH'});this.setDepthSlider(55);});
    btn('mDive',     ()=>{D({type:'DIVE'});this.setDepthSlider(100);});
    btn('mDeep',     ()=>{D({type:'SET_ORDERED_DEPTH',depthFeet:200});this.setDepthSlider(200);});
    btn('mCrashDive',()=>{D({type:'CRASH_DIVE'});this.setDepthSlider(150);buzz([20,40,20]);});
    btn('mBlow',     ()=>{D({type:'EMERGENCY_BLOW'});this.setDepthSlider(0);buzz([20,40,20]);});
    btn('mSilent',   ()=>D({type:'TOGGLE_SILENT_RUNNING'}));
    btn('mPumps',    ()=>D({type:'TOGGLE_PUMPS'}));
    btn('mDcFlood',  ()=>D({type:'SET_REPAIR_PRIORITY',priority:'FLOODING'}));
    btn('mDcProp',   ()=>D({type:'SET_REPAIR_PRIORITY',priority:'PROPULSION'}));
    btn('mDcSteer',  ()=>D({type:'SET_REPAIR_PRIORITY',priority:'STEERING'}));
    btn('mDcOptics', ()=>D({type:'SET_REPAIR_PRIORITY',priority:'OPTICS_FIRE_CONTROL'}));
    btn('mSteerWp',  ()=>D({type:'MAP_STEER_TO_NEXT_WAYPOINT'}));
    btn('mAutoPilot',()=>{D({type:'TOGGLE_AUTOPILOT'});buzz(10);});
    const transit=secs=>{const T=this.game.getSnapshot().time;if(this.transitRequestPending||T.transitUntil>T.elapsedSeconds){Toast.warn('Transit already running — stop it before choosing another.');return;}this.transitRequestPending=true;D({type:'START_TRANSIT',seconds:secs});this.setPane('view');buzz(12);};
    btn('mTransit30',()=>transit(1800));
    btn('mTransit2h',()=>transit(7200));
    btn('mTransit8h',()=>transit(28800));
    btn('mTransitOpen',()=>transit(0));       // 0 = no clock, only events
    btn('transitStop',()=>{this.transitRequestPending=false;D({type:'STOP_TRANSIT'});});
    btn('mClearPlot',()=>{D({type:'MAP_CLEAR_PLOT'});Toast.ok('Plot cleared — manual helm');});
    btn('mPlotIntercept',()=>D({type:'PLOT_INTERCEPT_ADVISORY'}));
    btn('mPortBtn',  ()=>D({type:'HEAD_TO_PORT'}));
    btn('mHelpBtn',  ()=>document.getElementById('hotkeyOverlay')?.classList.add('open'));

    // attack sheet
    bindRange('mTdcB','mTdcBV',v=>fmtDeg(v),v=>({type:'SET_TDC_MANUAL',bearing:v}));
    bindRange('mTdcR','mTdcRV',v=>(+v).toFixed(1),v=>({type:'SET_TDC_MANUAL',range:v}));
    bindRange('mTdcC','mTdcCV',v=>fmtDeg(v),v=>({type:'SET_TDC_MANUAL',course:v}));
    bindRange('mTdcS','mTdcSV',v=>(+v).toFixed(1),v=>({type:'SET_TDC_MANUAL',speed:v}));
    bindRange('mTorpDepth','mTorpDepthV',v=>v+'ft',v=>({type:'SET_TORPEDO_DEPTH',depthFt:v}));
    btn('mTdcSet',  ()=>D({type:'APPLY_TDC_MANUAL'}));
    btn('mSelScope',()=>{D({type:'PERISCOPE_SELECT_CENTER_CONTACT'});buzz(10);});
    btn('mSendTdc', ()=>{D({type:'TDC_SEND_SCOPE_OBSERVATION'});buzz(10);});
    btn('mFloodFwd',()=>D({type:'FLOOD_ALL_TUBES'}));
    btn('mFloodAft',()=>D({type:'FLOOD_AFT_TUBES'}));
    btn('mFireFwd', ()=>{D({type:'FIRE_READY_SPREAD'});buzz([25,30,25]);});
    btn('mFireAft', ()=>{D({type:'FIRE_AFT_SPREAD'});buzz([25,30,25]);});
    g('mTorpSel')?.addEventListener('change',e=>D({type:'SET_TORPEDO_TYPE',specKey:e.target.value}));
    g('mDudSel') ?.addEventListener('change',e=>D({type:'SET_DUD_MODE',mode:e.target.value}));
    g('mTubes')  ?.addEventListener('click',e=>{
      const el=e.target.closest('.tube'); if(!el) return;
      const id=+el.dataset.tube;
      const tube=this.game.getSnapshot().weapons.tubes.find(t=>t.id===id);
      if(!tube) return;
      if(tube.status==='LOADED_DRY'){D({type:'FLOOD_TUBE',tubeId:id});buzz(10);}
      else if(tube.status==='READY'){D({type:'FIRE_TORPEDO',tubeId:id});buzz([25,30,25]);}
      else Toast.warn(`Tube ${id} reloading — ${Math.round(tube.reloadProgress*100)}%`);
    },{passive:true});

    this.bindGestures();
  }

  /* ── helpers ── */
  setDepthSlider(v){const el=document.getElementById('mDpt');if(el)el.value=v;
    const d=document.getElementById('depthInput');if(d)d.value=v;}
  setHeadingSlider(v){const el=document.getElementById('mHdg');if(el)el.value=v;
    const t=document.getElementById('mHdgV');if(t)t.textContent=fmtDeg(v);const exact=document.getElementById('mHeadingNumberInput');if(exact)exact.value=String(Math.round(normDeg(v)));}
  nudgeHeading(d){
    const s=this.game.getSnapshot();
    const v=normDeg(s.playerSub.orderedHeading+d);
    this.setHeadingSlider(Math.round(v));
    this.game.dispatch({type:'SET_ORDERED_HEADING',heading:v});buzz(8);
  }
  quickFire(){
    const s=this.game.getSnapshot(), W=s.weapons;
    // The large FIRE button is deliberately only a firing control. Flooding is
    // a separate readiness decision made in ATTACK, so an accidental MAP tap
    // can never flood every tube for the player behind the scenes.
    const bank=s.tdc?.launchBank||'FWD';
    // TDC 2.0 may legitimately choose stern tubes for the shorter/cleaner gyro
    // solution. The big FIRE control must honor that bank or the UI and the
    // physical torpedo would silently solve two different shots.
    const ready=W.tubes.find(t=>t.pos===bank&&t.status==='READY')||W.tubes.find(t=>t.status==='READY');
    if(ready){this.game.dispatch({type:'FIRE_TORPEDO',tubeId:ready.id});buzz([28,30,28]);return;}
    const dry=W.tubes.some(t=>t.status==='LOADED_DRY');
    if(dry){Toast.warn('No torpedo tube flooded — open ATTACK and flood at least one tube first.');buzz(12);return;}
    Toast.bad('No torpedo tube ready — check ATTACK for reload status.');
  }

  setPane(pane){
    this.pane=pane;
    const sheet=document.getElementById('tSheet');
    const open=pane!=='view';
    sheet?.classList.toggle('open',open);
    document.querySelectorAll('.sheet-pane').forEach(p=>p.classList.toggle('active',p.id===pane));
    document.querySelectorAll('#tTabs .mob-tab').forEach(t=>t.classList.toggle('active',t.dataset.pane===pane));
    document.getElementById('coach')?.classList.toggle('up',open);
    const titles={paneHelm:'Helm & Boat',paneAttack:'Fire Control',paneStats:'Status & Log'};
    const ttl=document.getElementById('tSheetTitle');
    if(ttl&&titles[pane]) ttl.textContent=titles[pane];
    this.cache={};                   // force a fresh DOM refresh for the new pane
    this.updateTouch(this.game.getSnapshot(),true);
    if(pane==='paneHelm') document.dispatchEvent(new Event('helmshown'));
  }

  /* ── canvas gestures ── */
  bindGestures(){
    const c=this.cv.canvas, cv=this.cv, D=cmd=>this.game.dispatch(cmd);
    const pts=new Map();
    let mode=null, moved=0, startT=0, last=null, lastDist=0, lastTap=0, primaryPointerType='touch';
    /* A waypoint is a deliberate act. It used to fall out of a pinch: the
       second finger lifts, the first follows a moment later, and because
       pinch moves never accumulated into `moved` the release looked exactly
       like a tap. So: remember whether a second finger was ever down, and
       whether the view actually moved, and give the hand a moment to settle
       after a gesture before a tap counts for anything. */
    let multiUsed=false, gestureEnd=-1e9;

    const dist=()=>{const a=[...pts.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};
    const mid =()=>{const a=[...pts.values()];return{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};};

    const purge=()=>{pts.clear();mode=null;last=null;lastDist=0;};
    // A pointerup swallowed by the browser (notification, app switch, palm on
    // the bezel) used to leave a phantom finger down: every later tap was then
    // read as the second finger of a pinch and nothing responded.
    const dropStale=(now,ms)=>{
      let n=0;
      for(const [id,q] of pts) if(now-(q.t||0)>ms){pts.delete(id);n++;}
      if(n&&pts.size===0) purge();
      return n;
    };
    setInterval(()=>{if(pts.size) dropStale(performance.now(),4000);},2000);
    c.addEventListener('pointerdown',e=>{
      const now=performance.now();
      dropStale(now,700);
      if(pts.size>2) purge();
      try{c.setPointerCapture?.(e.pointerId);}catch(_){}
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY,t:now});
      if(pts.size===1){
        moved=0;startT=performance.now();last={x:e.clientX,y:e.clientY};
        primaryPointerType=e.pointerType||'touch';multiUsed=false;
        mode=this.beginDrag(e);
      }else if(pts.size===2){
        mode='pinch';lastDist=dist();multiUsed=true;
      }
    });

    c.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId)) return;
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY,t:performance.now()});
      const s=this.game.getSnapshot();
      if(mode==='pinch'&&pts.size>=2){
        const d=dist();
        if(lastDist>0&&s.tactical.activeStation==='MAP'){
          const m=mid(),raw=Math.log(Math.max(.5,Math.min(2,d/lastDist)));
          // A trackpad or touchscreen reports many tiny distance changes. Apply
          // a dead zone and a bounded response so one tremor cannot jump levels.
          if(Math.abs(raw)>.004)cv.zoomAt(Math.exp(clamp(raw,-.08,.08)*.48),m.x,m.y);
        }else if(lastDist>0&&s.tactical.activeStation==='PERISCOPE'){
          // spread the fingers for high power, pinch in for the search field
          const want=d/lastDist>1.25?2.5:d/lastDist<0.8?1:null;
          if(want!==null&&s.tactical.periscopeZoom!==want){
            D({type:'TOGGLE_PERISCOPE_ZOOM'});buzz(12);lastDist=d;
          }
        }else if(lastDist>0&&s.tactical.activeStation==='BRIDGE'){
          // Bridge optics are continuously zoomable.  The old threshold toggle
          // made a pinch suddenly jump between two focal lengths, which also
          // exaggerated the old 2-D foredeck perspective error.
          const ratio=d/lastDist,z=bridgeZoomAmount(s);
          const next=clamp(z+Math.log(Math.max(.2,ratio))*1.15,0,1);
          if(Math.abs(next-z)>.008)D({type:'SET_BRIDGE_ZOOM',zoom:next});
        }
        lastDist=d;return;
      }
      if(!last) return;
      const dx=e.clientX-last.x, dy=e.clientY-last.y;
      moved+=Math.hypot(dx,dy);
      last={x:e.clientX,y:e.clientY};
      if(mode==='pan'){cv.panBy(dx,dy);}
      else if(mode==='scope'){
        const cam=cv.cam;
        const perPx=cam?cam.f:Math.max(60,cv.scopeGeom.r*1.7);
        D({type:'ROTATE_PERISCOPE',deltaDeg:-radToDeg(Math.atan(dx/perPx))});
      }
      else if(mode==='bridge'){
        const f=cv.bridgeCam?.f||Math.max(120,cv.w*.7);
        D({type:'ROTATE_BRIDGE',deltaDeg:-radToDeg(Math.atan(dx/f))});
      }
      else if(mode==='sound'){D({type:'ROTATE_SOUND',deltaDeg:-dx*.55});}
      else if(mode==='gun'){
        const f=cv.gunCam?.f||Math.max(180,cv.w*0.9);
        /* Horizontal drag should remain brisk for bearing, but vertical drag is
           intentionally damped because tiny finger motion produced very large
           elevation jumps on phones and tablets. The dedicated slider/wheel is
           for fine work; drag is now the coarse lay-on-target control. */
        D({type:'ADJUST_DECK_GUN',deltaTrainDeg:radToDeg(Math.atan(dx/f)),deltaElevDeg:-radToDeg(Math.atan((dy*0.35)/f))});
      }
      else if(mode==='compass'){this.compassDrag(e);}
      else if(mode==='depth'){this.depthDrag(e);}
    });

    const end=e=>{
      if(!pts.has(e.pointerId)) return;
      const wasMode=mode, m=moved, dt=performance.now()-startT;
      pts.delete(e.pointerId);
      if(pts.size===0){
        mode=null;last=null;
        const now=performance.now();
        const pen=primaryPointerType==='pen'||e.pointerType==='pen';
        const settled=pen||(now-gestureEnd)>260; // pen hover does not need finger settle time
        const still=pen?(m<16&&dt<700):(m<7&&dt<300);
        // Keep the proven finger gesture thresholds exactly as they were. A
        // stylus reports tiny pressure/hover motion even during an intentional
        // tap, so it needs a slightly larger stillness/time envelope.
        if(still&&!multiUsed&&settled){
          const dbl=(now-lastTap)<300;lastTap=now;
          this.handleTap(e,dbl);
        }else if(multiUsed||m>=7){
          gestureEnd=now;                        // pan or pinch: arm the settle timer
        }
        multiUsed=false;
      }else if(pts.size===1){
        mode=null;last=[...pts.values()][0];
        const it=pts.entries().next().value;last={x:it[1].x,y:it[1].y};
      }
    };
    c.addEventListener('pointerup',end);
    c.addEventListener('pointercancel',end);
    c.addEventListener('lostpointercapture',end);
    c.addEventListener('pointerleave',end);
    window.addEventListener('blur',purge,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)purge();},{passive:true});
    c.addEventListener('contextmenu',e=>e.preventDefault());
    /* Fine-pointer wheel parity. The same canvas gesture router owns mouse,
       pen and touch, so a desktop click is processed exactly once here rather
       than again by a parallel MAP click handler. Wheel meaning follows the
       visible station and never changes simulation state outside that station. */
    c.addEventListener('wheel',e=>{
      const s=this.game.getSnapshot();
      if(s.tactical.activeStation==='MAP'){
        e.preventDefault();
        if(e.ctrlKey){const amount=clamp(-e.deltaY*.0018,-.10,.10);if(Math.abs(amount)>.002)cv.zoomAt(Math.exp(amount),e.clientX,e.clientY);}
        else cv.panBy(-e.deltaX,-e.deltaY);
        return;
      }
      if(s.tactical.activeStation==='BRIDGE'){
        e.preventDefault();const z=bridgeZoomAmount(s),step=e.deltaY<0?.10:-.10;
        D({type:'SET_BRIDGE_ZOOM',zoom:clamp(z+step,0,1)});return;
      }
      if(s.tactical.activeStation==='PERISCOPE'){
        if(Math.abs(e.deltaX)>1){D({type:'ROTATE_PERISCOPE',deltaDeg:clamp(e.deltaX*.055,-4,4)});e.preventDefault();return;}
        const z=Number(s.tactical.periscopeZoom)||1,want=e.deltaY<0?2.5:1;
        if(Math.abs(e.deltaY)>12&&((want>1&&z<2)||(want===1&&z>1.1)))D({type:'TOGGLE_PERISCOPE_ZOOM'});
        e.preventDefault();return;
      }
      if(s.tactical.activeStation==='SOUND'){
        D({type:'ROTATE_SOUND',deltaDeg:e.deltaY<0?-2:2});e.preventDefault();return;
      }
      if(s.tactical.activeStation==='DECK_GUN'){
        D({type:'ADJUST_DECK_GUN',deltaElevDeg:e.deltaY<0?.2:-.2});e.preventDefault();
      }
    },{passive:false});
  }

  beginDrag(e){
    const s=this.game.getSnapshot(), sta=s.tactical.activeStation;
    if(sta==='MAP') return 'pan';
    if(sta==='PERISCOPE') return 'scope';
    if(sta==='BRIDGE') return 'bridge';
    if(sta==='SOUND') return 'sound';
    if(sta==='DECK_GUN') return 'gun';
    const gm=this.cv.tactGeom;
    if(gm){
      const p=this.cv.toLocal(e.clientX,e.clientY);
      if(Math.hypot(p.x-gm.comp.cx,p.y-gm.comp.cy)<gm.comp.r*1.15) return 'compass';
      if(p.x>=gm.col.x&&p.x<=gm.col.x+gm.col.w&&p.y>=gm.col.y&&p.y<=gm.col.y+gm.col.h) return 'depth';
    }
    return null;
  }

  compassDrag(e){
    const gm=this.cv.tactGeom;if(!gm)return;
    const p=this.cv.toLocal(e.clientX,e.clientY);
    const hdg=normDeg(radToDeg(Math.atan2(p.x-gm.comp.cx,-(p.y-gm.comp.cy))));
    this.setHeadingSlider(Math.round(hdg));
    this.game.dispatch({type:'SET_ORDERED_HEADING',heading:hdg});
  }

  depthDrag(e){
    const gm=this.cv.tactGeom;if(!gm||gm.colBot===undefined)return;
    const p=this.cv.toLocal(e.clientX,e.clientY);
    const f=clamp((p.y-gm.colTop)/(gm.colBot-gm.colTop),0,1);
    const d=Math.round(f*300/5)*5;
    this.setDepthSlider(d);
    this.game.dispatch({type:'SET_ORDERED_DEPTH',depthFeet:d});
  }

  handleTap(e,dbl){
    const s=this.game.getSnapshot(), sta=s.tactical.activeStation, D=c=>this.game.dispatch(c);
    if(sta==='MAP'){
      if(dbl){this.cv.zoomAt(1.6,e.clientX,e.clientY);return;}
      const wi=this.cv.pickWaypoint(s,e.clientX,e.clientY);
      if(wi>=0){
        const n0=s.map.plottedCourse.length;
        D({type:'MAP_REMOVE_WAYPOINT',index:wi});this.game.update(0);
        const n1=this.game.getSnapshot().map.plottedCourse.length;
        if(n1<n0){Toast.ok(`Waypoint ${wi+1} removed`);buzz(12);}
        return;
      }
      const id=this.cv.pickTrack(s,e.clientX,e.clientY);
      if(id){
        if(id===s.tactical.selectedTrackId){D({type:'DESELECT_TRACK'});Toast.ok('Contact selection cleared');}
        else {D({type:'SELECT_TRACK',trackId:id});D({type:'TDC_SEND_SCOPE_OBSERVATION'});}
        buzz(14);return;
      }
      const w=this.cv.screenToWorldMap(e.clientX,e.clientY);
      // snap to a grid you can actually see: finer as you zoom in
      const snap=this.cv.zoom>120?0.05:this.cv.zoom>40?0.1:0.25;
      const n0=s.map.plottedCourse.length;
      D({type:'MAP_ADD_WAYPOINT',xNm:Math.round(w.xNm/snap)*snap,yNm:Math.round(w.yNm/snap)*snap});
      D({type:'MAP_STEER_TO_NEXT_WAYPOINT'});
      // MAP tap feedback must describe committed state, not merely a queued
      // command. This removes the old "waypoint set" toast while the chart was
      // still (or no longer) showing the corresponding point.
      this.game.update(0);
      const after=this.game.getSnapshot();
      if(after.map.plottedCourse.length>n0){
        buzz([10,30,10]);Toast.ok(`Waypoint ${after.map.plottedCourse.length} plotted — autopilot steering`);
      }
    }else if(sta==='PERISCOPE'){
      const zp=this.cv.zoomPill;
      if(zp){
        const p=this.cv.toLocal(e.clientX,e.clientY);
        if(p.x>=zp.x&&p.x<=zp.x+zp.w&&p.y>=zp.y&&p.y<=zp.y+zp.h){
          D({type:'TOGGLE_PERISCOPE_ZOOM'});buzz(12);return;
        }
      }
      if(dbl){D({type:'TOGGLE_PERISCOPE_ZOOM'});return;}
      const id=this.cv.pickScopeContact(s,e.clientX,e.clientY);
      if(id){this.cv.revealScopeLabel(id);D({type:'SELECT_TRACK',trackId:id});D({type:'TDC_SEND_SCOPE_OBSERVATION'});buzz(14);}
    }else if(sta==='BRIDGE'){
      if(dbl){D({type:'TOGGLE_BRIDGE_BINOCULARS'});return;}
      const id=this.cv.pickBridgeContact(s,e.clientX,e.clientY);
      if(id){D({type:'BRIDGE_TARGET_CONTACT',trackId:id});buzz(14);}
    }else if(sta==='SOUND'){
      if(dbl){D({type:'SOUND_MARK_BEARING'});buzz(10);}
    }else if(sta==='DECK_GUN'){
      const id=this.cv.pickGunContact(s,e.clientX,e.clientY);
      if(id){D({type:'SELECT_TRACK',trackId:id});if(dbl)D({type:'LAY_DECK_GUN'});buzz(14);}
      else if(dbl)D({type:'LAY_DECK_GUN'});
    }else{
      if(dbl){D({type:'CYCLE_TIME_SCALE'});}
    }
  }

  /* ── DOM refresh (throttled by the game loop) ── */
  updateTouch(state,force){
    if(!this.touch) return;
    const g=id=>document.getElementById(id);
    const C=this.cache;
    const set=(id,v)=>{if(C[id]===v)return;C[id]=v;const el=g(id);if(el)el.textContent=v;};
    const html=(id,v)=>{if(C['h'+id]===v)return;C['h'+id]=v;const el=g(id);if(el)el.innerHTML=v;};
    const cls=(id,c,on)=>{const el=g(id);if(el)el.classList.toggle(c,!!on);};
    const sub=state.playerSub, p=sub.propulsion, tdc=state.tdc, W=state.weapons,ui=getPlayerStationPresentation(state),dui=ui.depth||{},ord=ui.orders||{},tui=ui.tubes||{};
    const warn=sub.damage.warnings||[], enemy=state.world.enemy.alertState;
    const sta=state.tactical.activeStation;
    document.documentElement.dataset.station=sta;

    // transit banner
    const T=state.time;
    const running=T.transitUntil>T.elapsedSeconds;
    if(running)this.transitRequestPending=false;
    cls('transitBar','on',running);
    for(const id of ['mTransit30','mTransit2h','mTransit8h','mTransitOpen']){const el=g(id);if(el)el.disabled=running||!!this.transitRequestPending;}
    if(running){
      const done=T.elapsedSeconds-(T.transitFrom||0);
      const left=T.transitUntil-T.elapsedSeconds;
      set('transitTxt',isFinite(left)
        ? `⏩ TRANSIT — start ${DayNightCycle.getTimeString(T.transitFrom||0)} · ${fmtTime(T.transitUntil-(T.transitFrom||0))} planned · ${fmtTime(done)} run · ${fmtTime(left)} left · ends ${DayNightCycle.getTimeString(T.transitUntil)}`
        : `⏩ TRANSIT — ${fmtTime(done)} run · until something happens`);
    }

    // top bar
    {const env=state.world.environment||{},dl=Number(env.daylight)||0,icon=dl>.6?'☀':dl>.25?'🌅':'🌙',vis=Number(env.visibilityNm)||0;set('mClock',`${icon} ${DayNightCycle.getTimeString(state.time.elapsedSeconds)}`);set('mConditions',`${String(env.weather||'CLEAR').replace(/_/g,' ')} · ${vis>=8?'GOOD':vis>=4?'FAIR':'POOR'} VIS`);}
    set('mMode',sub.mode.replace(/_/g,' '));
    const tsel=g('tBtnTime');
    if(tsel&&tsel!==document.activeElement&&+tsel.value!==state.time.timeScale){
      tsel.value=String(state.time.timeScale);tsel._pkLabel?.();
    }
    const hsel=g('mTimeSel');
    if(hsel&&hsel!==document.activeElement&&+hsel.value!==state.time.timeScale){
      hsel.value=String(state.time.timeScale);hsel._pkLabel?.();
    }
    const torpSel=g('mTorpSel');if(torpSel){const keys=torpedoSpecKeysForState(state),oldKeys=[...(torpSel.options||[])].map(o=>o.value);if(keys.join('|')!==oldKeys.join('|'))torpSel.innerHTML=keys.map(k=>`<option value="${k}">${torpedoOptionLabel(k)}</option>`).join('');for(const o of torpSel.options||[])o.disabled=typeof isTorpedoAvailableForState==='function'?!isTorpedoAvailableForState(state,o.value):false;if(torpSel!==document.activeElement&&torpSel.value!==tdc.torpedoSpecKey)torpSel.value=tdc.torpedoSpecKey;}
    set('mScore',state.campaign.score.toLocaleString());

    // alert strip
    html('tAlert',warn.map(w=>`<span class="${w.level}">${w.text}</span>`).join('<span style="color:#2f5f56"> ▪ </span>'));

    // quick status
    const qv=(id,val,c)=>{const el=g(id);if(!el)return;if(C[id]!==val){C[id]=val;el.textContent=val;}
      const k='c'+id;const cc='qs-v'+(c?' '+c:'');if(C[k]!==cc){C[k]=cc;el.className=cc;}};
    qv('qDepth',playerDepthDisplay(state,sub.depthFeet,0),sub.depthFeet>sub.damage.crushDepthFeet*0.8?'d':sub.inShallowWater?'w':'');
    // the ordered value under the actual one: the gap between them IS the boat
    set('qDepthOrd',Math.abs(sub.orderedDepthFeet-sub.depthFeet)<2?'':`→${playerDepthDisplay(state,sub.orderedDepthFeet,0)}`);
    // the fathometer: the number that decides what you are allowed to do
    {const sea=sub.seabedFeet??3000, cl=sea-sub.depthFeet;
     qv('qKeel',sea>=3000?'deep':playerDepthDisplay(state,Math.max(0,cl),0),
        sub.bottomed?'':cl<25?'d':cl<60?'w':'');
     set('qBottom',sub.bottomed?'ON BOTTOM':sea>=3000?'':`${playerDepthDisplay(state,sea,0)} ${(sub.bottomType||'').toLowerCase()}`);}
    set('qSpdOrd',sub.stealth.silentRunning
      ? `SILENT · ${p.actualRpm.toFixed(0)}rpm`
      : (Math.abs(p.orderedRpm-p.actualRpm)<8?'':`→${p.orderedRpm.toFixed(0)}rpm`));
    if(this.pad){
      const pc=p.characteristics||{},maxKn=p.engineMode==='DIESEL'?(pc.maxSurfaceSpeedKn??18):(pc.maxSubmergedSpeedKn??8.5),
        maxRpm=pc.normalizedMaxRpm??450,response=pc.rpmResponse??170,
        kn=maxKn*(1-Math.exp(-clamp(p.orderedRpm,0,maxRpm)/response));
      set('opDepthVal',playerDepthDisplay(state,sub.orderedDepthFeet,0));
      set('opSpeedVal',`${p.orderedRpm.toFixed(0)} rpm`);
      set('opNow',this.pad==='depth'
        ? `now ${playerDepthDisplay(state,sub.depthFeet,0)} · ${sub.verticalSpeedFps>0.05?'going down':sub.verticalSpeedFps<-0.05?'coming up':'steady'}`
        : `now ${p.speedKnots.toFixed(1)} kn · ${p.engineMode.toLowerCase()}`);
      const sea=sub.seabedFeet??3000;
      set('opDepthNote',sub.bottomed
        ? `Lying on the bottom in ${playerDepthDisplay(state,sea,0)} of ${(sub.bottomType||'').toLowerCase()}. Order revs or a shallower depth to come off her.`
        : sub.cannotHoldDepth
        ? 'SHE WILL NOT ANSWER THE PLANES — blow main ballast, pumps on, get way on her.'
        : (state.world.aaManned||state.weapons.deckGun?.manned)
        ? `${state.weapons.deckGun?.manned?'Deck-gun':'AA'} crew topside — a dive order will clear the deck automatically and wait briefly for the hatch.`
        : sea<3000
        ? `Fathometer ${playerDepthDisplay(state,sea,0)}, ${(sub.bottomType||'').toLowerCase()} — safe to ${playerDepthDisplay(state,Math.max(0,sea-25),0)}. Crush depth ${playerDepthDisplay(state,sub.damage.crushDepthFeet,0)}.`
        : `Deep water. Periscope depth ${playerDepthDisplay(state,dui.scopeFeet||55,0)}. Crush depth ${playerDepthDisplay(state,sub.damage.crushDepthFeet,0)}.`);
      const bb=document.getElementById('opBottom');
      if(bb) bb.textContent=sub.bottomed?'⚓ Come Off the Bottom':'⚓ Lie on the Bottom';
      set('opSpeedNote',`about ${kn.toFixed(1)} kn ordered · ${p.engineMode==='DIESEL'?'diesels — charging fastest at low revs':'battery '+p.battery.toFixed(0)+'% — flank drains it fast'}`);
    }
    {const maxRpm=p.characteristics?.normalizedMaxRpm??450;document.querySelectorAll('#mRpm,#rpmInput').forEach(el=>el.max=String(maxRpm));for(const root of ['#paneHelm','#opSpeed']){const bs=[...document.querySelectorAll(`${root} [data-rpm]`)];if(bs.length){const flank=bs.reduce((a,b)=>(+b.dataset.rpm>+a.dataset.rpm?b:a));if(/flank/i.test(flank.textContent||''))flank.dataset.rpm=String(maxRpm);}}}
    qv('qHdg',fmtDeg(sub.heading));
    qv('qSpd',sub.stealth.silentRunning?`${p.speedKnots.toFixed(1)}kn · SILENT`:`${p.speedKnots.toFixed(1)}kn`,sub.stealth.silentRunning?'w':'');
    {const ts=torpedoStoresStatus(state);qv('qTorp',`${ts.total}·${ts.loadShort}`,ts.total<4?'w':'');}
    const en=state.world.enemy;
    const thr=enemy==='UNAWARE'?'CLEAR':(en.contactHeld?'HELD':enemy==='ATTACKING'?'LOST':'SEARCH');
    qv('qThr',thr,en.contactHeld?'d':enemy!=='UNAWARE'?'w':'');
    qv('qHull',`${sub.damage.hullIntegrity.toFixed(0)}%`,sub.damage.hullIntegrity<35?'d':sub.damage.hullIntegrity<70?'w':'');
    qv('qFuel',`${sub.propulsion.fuel.toFixed(0)}%`,sub.propulsion.fuel<12?'d':sub.propulsion.fuel<25?'w':'');
    {const b=p.battery??0,charging=p.engineMode==='DIESEL'&&(p.chargeRate||0)>.002&&b<99.5;
      const bs=b>=99.5?'FULL':charging?'CHG':p.engineMode==='ELECTRIC'?'DRAIN':'HOLD';
      qv('qBatt',`${b.toFixed(0)}%`,b<12?'d':b<25?'w':'');set('qBattState',bs);
    }

    // station buttons + contextual overlay
    document.querySelectorAll('#ovlStations button').forEach(b=>b.classList.toggle('active',b.dataset.sta===sta));
    if(C.sta!==sta){
      C.sta=sta;
      document.querySelectorAll('#ovlLeft .rbtn').forEach(b=>{b.style.display=b.dataset.sta===sta?'flex':'none';});
      const gy=g('gyroIndicator');if(gy)gy.classList.toggle('off',sta!=='PERISCOPE');
      const gun=sta==='DECK_GUN',bridge=sta==='BRIDGE',sound=sta==='SOUND';
      const lock=g('oLock'),fire=g('btnFire');if(lock)lock.style.display=(gun||bridge||sound)?'none':'';if(fire)fire.style.display=(gun||bridge||sound)?'none':'';
      g('bridgeControls')?.classList.toggle('on',bridge);g('soundControls')?.classList.toggle('on',sound);
    }
    const tactSafe=this.syncTacticalSafeAreas();
    const bz=bridgeZoomAmount(state);cls('bridgeBino','on',bz>.05);
    const bb=g('bridgeBino');if(bb){const span=bb.querySelector?.('span');if(span)span.textContent=bz>.05?`Binos ${bridgeMagnification(state).toFixed(1)}×`:'Binoculars';}
    cls('soundRadar','on',state.tactical.soundDisplay==='RADAR');
    const sensorUi=getPlayerSensorPresentation(state),sr=g('soundRadar');if(sr){sr.style.display=sensorUi.surfaceSearchRadar?'':'none';const span=sr.querySelector?.('span');if(span)span.textContent=state.tactical.soundDisplay==='RADAR'?(sensorUi.passiveSound?.label||'Passive Sound'):(sensorUi.surfaceSearchRadar?.label||'Surface Radar');}const se=g('soundEcho');if(se){se.style.display=sensorUi.activeEcho?'':'none';if(!se.classList.contains('confirm')){const span=se.querySelector?.('span');if(span)span.textContent=sensorUi.activeEcho?.label||'Active Echo';}}
    cls('oSilent','on',sub.stealth.silentRunning);
    cls('oWeather','on',!!state.map.weatherOverlay);
    cls('mapWxChip','on',!!state.map.weatherOverlay);
    const wxLabel=g('mapWxLabel');
    if(wxLabel){
      // weatherAtPosition includes local squalls rather than merely repeating the
      // patrol's base forecast. Fall back safely for old/imported save states.
      const wx=(typeof weatherAtPosition==='function'&&state.world?.weatherSystem)
        ? weatherAtPosition(state,sub.position)
        : {stage:state.world?.environment?.weather||'CLEAR',visibilityNm:state.world?.environment?.visibilityNm};
      const stage=String(wx.stage||'CLEAR').replace(/_/g,' '),vis=Number(wx.visibilityNm);
      wxLabel.textContent=`WX ${stage}${Number.isFinite(vis)?` · ${vis.toFixed(1)} NM`:''}`;
    }
    cls('oGunFire','ready',!!state.weapons.deckGun?.manned&&state.weapons.deckGun.ammo>0);

    // fire button + TDC chip
    const sq=Math.round(tdc.solutionQuality*100);
    const canFire=!!tdc.targetId&&tdc.solutionQuality>=0.25&&W.tubes.some(t=>t.status==='READY');
    cls('btnFire','ready',canFire);
    set('fireSol',tdc.targetId?`${sq}%`:'--');
    // the periscope draws its own solution bar, so the chip is for the other stations
    const chipOn=!!tdc.targetId&&sta==='TACTICAL',chip=g('tdcChip');
    cls('tdcChip','on',chipOn);
    if(chip){
      chip.style.maxWidth=(chipOn&&tactSafe)?`${Math.floor(tactSafe.chipWidth)}px`:'';
      chip.classList.toggle('compact',!!(chipOn&&tactSafe&&tactSafe.chipWidth<175));
      chip.classList.toggle('micro',!!(chipOn&&tactSafe&&tactSafe.chipWidth<108));
    }
    if(chipOn){
      const tti=tdc.timeToImpactSec?`${tdc.timeToImpactSec.toFixed(0)}s`:'--',
            rng=tdc.rangeNm?tdc.rangeNm.toFixed(1)+'nm':'--',
            sol=`<b style="color:${sq>70?'#6fe08f':sq>40?'#f5c65c':'#ef6a58'}">${sq}%</b>`,
            micro=!!(tactSafe&&tactSafe.chipWidth<108),compact=!!(tactSafe&&tactSafe.chipWidth<175);
      html('tdcChip',micro
        ? `<b>${tdc.targetId}</b> · ${sol}<br>${rng}`
        : compact
        ? `<b>${tdc.targetId}</b> · ${sol}<br>${rng} · ${tti}`
        : `<b>${tdc.targetId}</b> · sol ${sol}<br>`+
          `${tdc.launchBank||'FWD'} · tube <b>${Number.isFinite(tdc.tubeTurnDeg)?tdc.tubeTurnDeg.toFixed(0)+'°':'--'}</b> · <b>${tdc.launchGeometry||'--'}</b><br>`+
          `gyro <b>${tdc.gyroAngle!==null?tdc.gyroAngle.toFixed(0)+'°':'--'}</b> · run <b>${tti}</b><br>`+
          `${rng} · ${tdc.torpedoType}`);
    }

    // badges
    const readyTubes=W.tubes.filter(t=>t.status==='READY').length;
    const crit=warn.filter(w=>w.level==='critical').length;
    const ab=g('atkBadge');if(ab&&C.ab!==readyTubes){C.ab=readyTubes;ab.textContent=readyTubes||'';ab.classList.toggle('on',readyTubes>0);}
    const unread=(state.world.radio||{}).unread||0;
    const stsCount=crit+unread;
    const sb=g('stsBadge');if(sb&&C.sb!==stsCount){C.sb=stsCount;sb.textContent=stsCount||'';
      sb.classList.toggle('on',stsCount>0);}
    {const d=sub.damage,burden=(100-d.hullIntegrity)+100*(['flooding','ballastDamage','motorDamage','electricalDamage','rudderDamage','periscopeDamage','tdcDamage','gyroDamage','pumpDamage'].reduce((n,k)=>n+(Number(d[k])||0),0));if(this._touchDamageBurden!=null&&burden>this._touchDamageBurden+.35){const tab=document.querySelector?.('#tTabs [data-pane="paneStats"]');tab?.classList.remove('damage-pulse');void tab?.offsetWidth;tab?.classList.add('damage-pulse');}this._touchDamageBurden=burden;}

    // sync sliders with the sim (unless the finger is on them)
    if(this.dragging!=='mHdg'){const el=g('mHdg');const v=Math.round(sub.orderedHeading);
      if(el&&+el.value!==v){el.value=v;}const exact=g('mHeadingNumberInput');if(exact&&exact!==document.activeElement&&+exact.value!==v)exact.value=String(v);set('mHdgV',fmtDeg(sub.orderedHeading));}
    document.querySelectorAll('#touchShell [data-scope-zoom]').forEach(b=>b.classList.toggle('on',Number(b.dataset.scopeZoom)===Number(state.tactical.periscopeZoom)));
    if(this.dragging!=='mRpm'){const el=g('mRpm');if(el&&+el.value!==Math.round(p.orderedRpm))el.value=Math.round(p.orderedRpm);}
    if(this.dragging!=='mDpt'){const el=g('mDpt');if(el&&+el.value!==Math.round(sub.orderedDepthFeet))el.value=Math.round(sub.orderedDepthFeet);}
    if(this.dragging!=='oGunElev'){
      const el=g('oGunElev'),v=clamp(state.weapons.deckGun?.elevationDeg??0,0,22);
      if(el&&Math.abs(+el.value-v)>.049)el.value=v.toFixed(1);
    }
    set('gunElevReadout',`${clamp(state.weapons.deckGun?.elevationDeg??0,0,22).toFixed(1)}°`);
    set('hdgOrdered',fmtDeg(sub.orderedHeading));
    set('rpmOrdered',`${p.orderedRpm.toFixed(0)} rpm`);
    set('dptOrdered',playerDepthDisplay(state,sub.orderedDepthFeet,0));
    const auto=state.map.autoFollowPlot&&state.map.plottedCourse.length>0;
    cls('mAutoPilot','on',auto);
    const wp=state.map.plottedCourse[0];
    set('navNote',wp
      ? `${state.map.plottedCourse.length} waypoint(s) · WP1 ${distNm(sub.position,wp).toFixed(1)}nm on ${fmtDeg(bearingBetween(sub.position,wp))} · ${auto?'autopilot steering':'autopilot off — manual helm'}`
      : 'No waypoints. Tap open water on the map to plot one, tap a waypoint to delete it.');
    cls('mSilent','on',sub.stealth.silentRunning);
    cls('mPumps','on',sub.damage.pumpActive);
    const rp=sub.damage.repairPriority||'FLOODING';
    cls('mDcFlood','on',rp==='FLOODING');cls('mDcProp','on',rp==='PROPULSION');
    cls('mDcSteer','on',rp==='STEERING');cls('mDcOptics','on',rp==='OPTICS_FIRE_CONTROL');
    {const G=state.weapons.deckGun, aa=state.world.aaManned, dc=sub.damage.damageControlActive;
      const airCrew=sensorUi.airWarningRadar?` · ${sensorUi.airWarningRadar.label.toUpperCase()} ${sub.depthFeet<12?'ON':'STANDBY'}`:'';
      set('mAutoCrewStatus',`AUTO CREW${airCrew} · AA ${aa?'MANNED':'STANDBY'} · DECK GUN ${G?.manned?'MANNED':'SECURED'} · DAMAGE CONTROL ${dc?'WORKING':'STANDBY'}`);
      const cap=Math.round(clamp(1-(sub.damage.pumpDamage||0)*.78,.16,1)*100);
      set('mDcStatus',`PRIORITY ${repairPriorityLabel(rp)} · ${dc?'parties working':'standby'} · pumps ${sub.damage.pumpTripped?'TRIPPED':sub.damage.pumpActive?`ON ${cap}%`:`ready ${cap}%`}${sub.damage.driveBankOffline?' · DRIVE BANK OFFLINE':''}`);}
    set('rpmNote',`${p.engineMode} · ${p.speedKnots.toFixed(1)} kn · noise ${(sub.stealth.acousticSignature*100).toFixed(0)}%`);

    // ── panes (only refresh the visible one) ──
    if(this.pane==='paneAttack'||force){
      const spec=TORPEDO_SPECS[tdc.torpedoSpecKey]||{};
      const dudPct=Math.round(100*(typeof historicalTorpedoDudChance==='function'?historicalTorpedoDudChance(state,tdc.torpedoSpecKey,tdc.dudMode):(spec.dudChanceBase||0.25)*(DUD_MODES[tdc.dudMode]??1)));
      const dudSel=g('mDudSel');if(dudSel&&dudSel!==document.activeElement&&dudSel.value!==tdc.dudMode)dudSel.value=tdc.dudMode;
      set('mTdcTgt',tdc.targetId||'no target');
      const note=g('mTdcNote');
      if(note){
        const ri=torpedoRangeInfo(state,tdc.targetId);
        const txt=tdc.targetId
          ?`${tdc.status} · solution ${sq}% · ${tdc.launchBank||'FWD'} tubes · ${tdc.launchGeometry||'--'} · tube turn ${Number.isFinite(tdc.tubeTurnDeg)?tdc.tubeTurnDeg.toFixed(1)+'°':'--'} · ${ri?`${ri.label} · range ${ri.rangeNm.toFixed(1)} nm · intercept ${ri.runNm.toFixed(1)}/${ri.maxNm.toFixed(1)} nm · `:''}gyro ${tdc.gyroAngle!==null?tdc.gyroAngle.toFixed(1)+'°':'--'} · AoB ${tdc.angleOnBow!==null?tdc.angleOnBow.toFixed(0)+'°':'--'} · TtI ${tdc.timeToImpactSec?tdc.timeToImpactSec.toFixed(0)+'s':'--'} · dud risk ${dudPct}%`
          :'No target. Lock a contact from the scope or the map, or enter a manual solution below.';
        if(C.tdcnote!==txt){C.tdcnote=txt;note.textContent=txt;note.style.color=ri?(ri.band==='IN'?'var(--ok)':ri.band==='BORDERLINE'?'var(--alert)':'var(--danger)'):(sq>70?'var(--ok)':sq>40?'var(--alert)':'var(--danger)');}
      }
      {const ts=torpedoStoresStatus(state),fwd=state.weapons.tubes.filter(t=>t.pos==='FWD').map(t=>t.id),aft=state.weapons.tubes.filter(t=>t.pos==='AFT').map(t=>t.id);set('mTorpStores',`${ts.total} aboard · ${ts.loaded} loaded (${ts.loadedText}) · ${ts.reserve} reserve · reload ${ts.loadShort} · ${ts.ready} READY`);set('mFloodFwd',`${tui.flood||'Flood'} ${tui.forward||'Fwd'} ${fwd.join('-')}`);set('mFloodAft',`${tui.flood||'Flood'} ${tui.aft||'Aft'} ${aft.join('-')}`);}
      html('mTubes',W.tubes.map(t=>{
        const st=t.status==='READY'?'ready':t.status==='EMPTY'?'empty':'flooded';
        const sub2=t.status==='READY'?'FIRE':t.status==='EMPTY'?`${Math.round(t.reloadProgress*100)}%`:'FLOOD';
        const typ=t.status==='EMPTY'?'—':torpedoShortName(t.specKey||tdc.torpedoSpecKey);
        return `<div class="tube ${st}" data-tube="${t.id}"><b>${tui.prefix||'T'}${t.id}</b><span>${t.pos==='FWD'?(tui.forward||'FWD'):(tui.aft||'AFT')} · ${typ}</span><span>${sub2==='FIRE'?(tui.fire||sub2):sub2==='FLOOD'?(tui.flood||sub2):sub2}</span></div>`;
      }).join(''));
    }

    if(this.pane==='paneStats'){const R2=state.world.radio;if(R2)R2.unread=0;}
    if(this.pane==='paneStats'||force){
      const ch=(a,b)=>Math.abs(a-b)>0.5;
      const row=(l,c,o,f)=>`<span class="lbl">${l}</span><span class="val ${ch(c,o)?'changed':''}">${f(c)} → ${f(o)}</span>`;
      html('mOrdersGrid',
        row(ord.heading||'Heading',sub.heading,sub.orderedHeading,fmtDeg)+
        row(ord.depth||'Depth',sub.depthFeet,sub.orderedDepthFeet,v=>playerDepthDisplay(state,v,0))+
        row(ord.power||'RPM',p.actualRpm,p.orderedRpm,v=>v.toFixed(0))+
        `<span class="lbl">${ord.speed||'Speed'}</span><span class="val">${p.speedKnots.toFixed(1)} kn</span>`+
        `<span class="lbl">${ord.engine||'Engine'}</span><span class="val">${p.engineMode}</span>`+
        `<span class="lbl">${ord.ballast||'Ballast'}</span><span class="val">${sub.ballastState}</span>`+
        `<span class="lbl">${ord.silent||'Silent'}</span><span class="val ${sub.stealth.silentRunning?'changed':''}">${sub.stealth.silentRunning?'ON':'OFF'}</span>`+
        `<span class="lbl">TDC</span><span class="val">${tdc.status}</span>`+
        `<span class="lbl">Solution</span><span class="val">${sq}%</span>`+
        `<span class="lbl">Torps</span><span class="val">${(()=>{const ts=torpedoStoresStatus(state);return `${ts.total} aboard · ${ts.reserve} reserve · ${ts.loadShort}`;})()}</span>`+
        `<span class="lbl">Hits / duds</span><span class="val">${W.hits.length} / ${(W.duds||[]).length}</span>`);
      const c2=state.campaign;
      const opt2=(c2.optionalObjectives||[]).map(o=>{
        const result=o.result&&o.result!=='not_attempted'?` · ${o.result.toUpperCase()}`:'';
        return `<span style="color:${o.done?'var(--ok)':'var(--alert)'}">${o.done?'✓':'◇'} OPTIONAL — ${o.text}${result}</span>`;
      }).join('<br>');
      const missionProgress=typeof missionProgressText==='function'?missionProgressText(state):'';
      html('mMission',`<strong style="color:var(--alert)">${c2.primaryMission?.title||c2.missionName||'Assigned patrol'}</strong> · ${c2.missionStatus}<br>${missionProgress?`<span style="color:var(--alert);font-size:10px;">${missionProgress}</span><br>`:''}`+
        c2.objectives.map(o=>`<span style="color:${o.done?'var(--ok)':'var(--muted)'}">${o.done?'✓':'○'} ${o.text}</span>`).join('<br>')+
        (opt2?`<br>${opt2}`:'')+
        `<br><span style="color:var(--dim);font-size:10px;">Tonnage ${c2.tonnageSunk.toLocaleString()}t · patrol #${c2.patrolNumber} · career ${c2.totalScore}</span>`);
      const d=sub.damage;
      const bar=(l,v)=>{const col=v>0.65?'#ef6a58':v>0.3?'#f5c65c':'#6fe08f';
        return `<div class="dmg-row"><span class="dmg-lbl">${l}</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${(v*100).toFixed(0)}%;background:${col}"></div></div><span class="dmg-val">${(v*100).toFixed(0)}%</span></div>`;};
      const hc=d.hullIntegrity<30?'#ef6a58':d.hullIntegrity<60?'#f5c65c':'#6fe08f';
      html('mDamage',
        `<div class="note" style="margin:0 0 7px;">Hull shows integrity remaining; subsystem rows show damage accumulated.</div>`+
        `<div class="dmg-row"><span class="dmg-lbl">Hull</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${d.hullIntegrity.toFixed(0)}%;background:${hc}"></div></div><span class="dmg-val">${d.hullIntegrity.toFixed(0)}%</span></div>`+
        bar('Flooding',d.flooding)+bar('Ballast',d.ballastDamage)+bar('Motor',d.motorDamage)+
        bar('Electrical',d.electricalDamage||0)+bar('Rudder',d.rudderDamage)+bar('Periscope',d.periscopeDamage)+
        bar('TDC',d.tdcDamage||0)+bar('Gyro',d.gyroDamage||0)+bar('Pumps',d.pumpDamage||0)+
        `<div class="note" style="margin:5px 0 8px;">DC priority: ${repairPriorityLabel(d.repairPriority)}${d.driveBankOffline?' · DRIVE BANK OFFLINE':''}${d.pumpTripped?' · PUMP TRIPPED':''}</div>`+
        `<div class="dmg-row"><span class="dmg-lbl">Air quality</span><div class="dmg-bar-wrap"><div class="dmg-bar-fill" style="width:${d.oxygen.toFixed(0)}%;background:${d.oxygen<25?'#ef6a58':d.oxygen<50?'#f5c65c':'#6fe08f'}"></div></div><span class="dmg-val">${d.oxygen.toFixed(0)}%</span></div>`);
      html('mGauges',
        `<span>Contacts</span><strong>${Object.keys(state.world.contactTracks).length}</strong>`+
        `<span>Visibility</span><strong>${state.world.environment.visibilityNm.toFixed(1)} nm</strong>`+
        `<span>Weather</span><strong>${state.world.environment.weather||'CLEAR'}</strong>`+
        `<span>Sea state</span><strong>${state.world.environment.seaState.toFixed(2)}</strong>`+
        `<span>Enemy alert</span><strong>${enemy}</strong>`+
        `<span>Depth charges</span><strong>${state.world.depthCharges.length}</strong>`+
        `<span>Noise</span><strong>${sub.stealth.acousticSignature.toFixed(2)}</strong>`+
        `<span>Shallow</span><strong style="color:${sub.inShallowWater?'var(--alert)':'var(--muted)'}">${sub.inShallowWater?'YES':'NO'}</strong>`);
      const sbw=(id,v)=>{const el=g(id);if(el&&C[id+'w']!==v){C[id+'w']=v;el.style.width=v+'%';}};
      sbw('mBattery',Math.round(p.battery));sbw('mFuel',Math.round(p.fuel));sbw('mHull',Math.round(sub.damage.hullIntegrity));
      const R=state.world.radio||{inbox:[],pending:null,copying:0};
      const copyNeed=Math.max(1,R.copyRequired||40),E=R.enigma||{};
      set('radioState',R.pending?(sub.depthFeet<42?`copying ${Math.round(R.copying/copyNeed*100)}% · ${E.keyState||'KEY SET'}`:'traffic waiting — come to antenna depth')
                                :`${R.inbox.length} signal(s) · ${E.keyState||'KEY SET'} · workload ${(E.workload||0).toFixed(1)}`);
      const pm=state.campaign?.primaryMission,reportBtn=g('radioReportButton'),silenceBtn=g('radioSilenceButton'),partialBtn=g('radioPartialButton');
      if(reportBtn){reportBtn.disabled=!(pm?.type==='SHADOW_REPORT'&&pm.reportReady&&!pm.reportedAt);reportBtn.classList.toggle('active',!!pm?.reportTransmitAuthorized);}
      if(silenceBtn)silenceBtn.classList.toggle('active',!!R.txSilence);
      if(partialBtn)partialBtn.disabled=!(R.pending&&R.copying>=copyNeed*.45);
      /* the intel board: nearest first, with a steer and an age on each */
      const now2=state.time.elapsedSeconds;
      const eng=this.game.engine||this.game;
      const intel=(eng.intelSummary?eng.intelSummary():[]).slice(0,6);
      const agef=a=>a<60?`${Math.round(a)}s`:a<3600?`${Math.round(a/60)}m`:`${(a/3600).toFixed(1)}h`;
      html('mIntel',intel.length?intel.map(o=>{
        const cls2=o.kind==='ULTRA'?'ultra':o.kind==='ESCORT'?'escort':'contact';
        const ageCls=o.ageSec<120?'fresh':o.ageSec<1800?'stale':'cold';
        const trust=o.kind==='ULTRA'
          ? `estimate ±${o.uncNm.toFixed(1)} nm · ${o.trend|| (o.closing?'CLOSING':'OPENING')} ${Math.abs(o.rangeRateKn||0).toFixed(1)} kn · CPA ${Number.isFinite(o.cpaNm)?o.cpaNm.toFixed(1):'--'} nm`
          : `${o.source==='VISUAL'?'sighted':'sonar'} · ${Math.round((o.confidence||0)*100)}% sure`;
        /* Steering at the bearing is a stern chase you never win. This line
           is the collision course and the time it takes — and when there is
           no solution at the speed she is making, it says so and tells her
           what it would take on the surface. */
        let icpt;
        if(o.icptNow) icpt=`<b class="ic-go">INTERCEPT ${fmtDeg(o.icptNow.courseDeg)}</b> · ${agef(o.icptNow.timeSec)} at this speed`;
        else if(o.icptFlank) icpt=`<b class="ic-warn">SURFACE AND RUN</b> · ${fmtDeg(o.icptFlank.courseDeg)}, ${agef(o.icptFlank.timeSec)} at flank`;
        else icpt=`<b class="ic-no">CANNOT BE CAUGHT</b> · she is drawing away`;
        return `<div class="intel-row ${cls2}">
          <div class="intel-rng"><b>${o.rngNm.toFixed(1)}</b><span>NM</span></div>
          <div class="intel-main"><b>${o.name}</b>
            <span>her course ${fmtDeg(o.courseDeg||0)} at ${(o.speedKn||0).toFixed(0)} kn · bearing ${fmtDeg(o.brg)}</span>
            <span class="intel-ic">${icpt}</span></div>
          <div class="intel-age"><span class="${ageCls}">${agef(o.ageSec)} old</span><br><span>${trust}</span></div>
        </div>`;}).join('')
        :'<div class="intel-empty">Nothing held. Listen on the hydrophones, sweep with the scope, and come shallow for the broadcast.</div>');

      html('mRadio',R.inbox.length?R.inbox.map((m,i)=>
        `<div class="log-entry"><b style="color:${m.intel?'var(--ok)':(m.type==='WARNING'||m.type==='SPECIAL INTELLIGENCE')?'var(--alert)':'var(--ink)'}">`+
        `${m.type} · ${m.subject}</b>${i===0?'<span class="sig-new">LATEST</span>':''}`+
        `<span class="sig-age">${agef(now2-(m.time||now2))} ago</span><br>${m.text}</div>`).join('')
        :'<span style="color:var(--dim)">No traffic copied yet. Come shallower than 42 ft when the broadcast is up.</span>');
      const caplog=(state.campaign.importantEvents||[]).slice().reverse();
      html('mCaptainLog',caplog.length?caplog.map(e=>`<div class="log-entry"><b>${e.date||('T+'+fmtTime(e.t))}</b> · ${e.text}</div>`).join('')
        :'<span style="color:var(--dim)">No major events entered yet.</span>');
      html('mLog',state.log.slice(0,30).map(e=>`<div class="log-entry ${e.level==='warn'?'warn':e.level==='bad'?'bad':''}">T+${fmtTime(e.t)} ${e.message}</div>`).join(''));
    }
  }
}
