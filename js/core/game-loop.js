// ═══════════════════════════════════════════════════ GAME LOOP
class GameLoop{
  constructor(game,cv,dv,tc){
    this.game=game;this.cv=cv;this.dv=dv;this.tc=tc;
    this.fdt=1/10;this.acc=0;this.last=performance.now();
    this.domAcc=0;this.domInterval=1/5;      // DOM refresh at 5 Hz — huge saving on tablets
    this.frameMs=16;this.ambT=0;this.lastLogLen=0;this.stopToastUntil=0;this.lastTransitRender=0;
    // requestAnimationFrame follows the panel refresh rate. On a 120 Hz phone
    // that used to double Canvas2D/compositor work even though simulation is
    // only 10 Hz. A carry budget produces ~60 work frames on 60/90/120 Hz
    // panels without changing simulation time.
    this.rafTargetMs=1000/60;this.rafCarryMs=0;this.lastRaf=performance.now();
    this._frame=this.frame.bind(this);
  }
  start(){requestAnimationFrame(this._frame);}

  _safeUpdate(dt){
    try{
      this.game.update(dt);
      this._simErrorKey=null;
      const s=this.game.getSnapshot();if(s?.ui?.runtimeError?.kind==='SIMULATION')s.ui.runtimeError=null;
      return true;
    }catch(err){
      const s=this.game.getSnapshot(),msg=String(err?.message||err||'unknown simulation error'),key=msg;
      if(this._simErrorKey!==key){
        this._simErrorKey=key;
        console.error('[SIM] update failed — bridge UI kept alive',err);
        try{Toast.bad(`SIMULATION PAUSED — ${msg.slice(0,72)}`);}catch(_){ }
      }
      /* Stop time rather than repeatedly mutating a damaged state. Crucially,
         do not abort the frame: station navigation and the canvas remain live
         so the player can inspect STATUS, MAP or another view and recover by
         starting/loading a patrol. Commands still process on later safe calls. */
      if(s?.time){s.time.timeScale=0;s.time.transitUntil=0;s.time.transitOpen=false;}
      if(s){s.ui=s.ui||{};s.ui.runtimeError={kind:'SIMULATION',message:msg,at:performance.now()};}
      return false;
    }
  }

  frame(now){
    requestAnimationFrame(this._frame);
    const rafDt=Math.min(Math.max(0,now-this.lastRaf),50);this.lastRaf=now;
    this.rafCarryMs+=rafDt;
    if(this.rafCarryMs<this.rafTargetMs-.65)return;
    this.rafCarryMs=Math.max(0,this.rafCarryMs-this.rafTargetMs);
    if(this.rafCarryMs>this.rafTargetMs*2)this.rafCarryMs=0;
    const dt=Math.min((now-this.last)/1000,0.25);
    this.last=now;
    if(document.hidden) return;
    const t0=performance.now();

    if(typeof AutoSave!=='undefined') AutoSave.tick();
    /* Toasts, and when NOT to show them. Eight hours of compressed patrol
       generates a stack of signals; throwing all of them on screen the moment
       the skip ends pushes the one that matters — the reason she stopped —
       off the bottom before it can be read. So: hold everything while the
       transit runs (it all still goes in the log), and when she stops, show
       at most a couple of lines of context and then the reason, last and
       longest, so it is the one left glowing at the top. */
    const snap0=this.game.getSnapshot();
    const U=snap0.ui, Tq=snap0.time;
    if(U&&U.toasts&&U.toasts.length){
      const lost0=snap0.playerSub?.mode==='SUNK'||snap0.campaign?.missionStatus==='LOST';
      if(lost0){
        // A dead boat has no new operational traffic. The dedicated persistent
        // BOAT LOST / AAR action is a direct UI element, not this queue.
        U.toasts.length=0;
      }else if(Tq.transitUntil||(Tq.timeScale||1)>1||performance.now()<this.stopToastUntil){ // any compressed run / final reason owns lane: hold them
        if(U.toasts.length>40) U.toasts.splice(0,U.toasts.length-40);
      }else{
        const q=U.toasts.splice(0,U.toasts.length);
        if(q.length>3){
          const kept=q.slice(-2);
          Toast.warn(`${q.length-kept.length} more signals during the run — see the patrol log`);
         for(const m of kept) Toast.auto(m.msg, m.kind);
        }else{
          for(const m of q) Toast.auto(m.msg, m.kind);
        }
      }
    }
    // fixed-step simulation
    this.acc+=dt;
    let steps=0;
    while(this.acc>=this.fdt&&steps<8){
      const ok=this._safeUpdate(this.fdt);this.acc-=this.fdt;steps++;
      if(!ok){this.acc=0;break;}
    }
    if(this.acc>this.fdt*8) this.acc=0;

    // ── transit: burn through the empty hours, but keep a hand on the tiller ──
    const T=this.game.getSnapshot().time;
    if(T.transitUntil&&T.transitUntil>T.elapsedSeconds){
      const budget=performance.now()+11;              // never block a frame for long
      const eng=this.game.engine||this.game;
      while(performance.now()<budget&&T.transitUntil>T.elapsedSeconds){
        // Three simulated seconds per engine pass in genuinely empty deep
        // water; normal two-second/one-second precision resumes automatically
        // near traffic, aircraft, weapons, shore or a friendly rendezvous.
        const advance=eng.canUseOpenSeaTransitStep?.()?3.0:2.0;
        if(!this._safeUpdate(advance/Math.max(T.timeScale,1))){
          T.transitUntil=0;T.transitOpen=false;break;
        }
        const why=eng.transitInterrupt&&eng.transitInterrupt();
        if(why){
          // An event has handed the conn back to the player. Do not leave her
          // racing along at the pre-transit 8/16/32x setting: the whole point
          // of an event stop is to give the skipper time to react.
          T.transitUntil=0;T.transitOpen=false;T.timeScale=1;T.transitReason=why;
          if(why!=='ok'){
            eng.log(`Transit broken off — ${why}.`,'warn');
            // Give the stop reason the toast lane to itself. The queued context
            // may flash first, but this line clears it and then stays readable.
            T.stopReason=why; T.stopReasonAt=T.elapsedSeconds;
            const stopKind=transitStopToastKind(why);
            const stopText='TRANSIT STOPPED — '+why;
            const stopMs=Toast.durationFor?Toast.durationFor(stopText,stopKind,3900):4000;
            this.stopToastUntil=performance.now()+stopMs+150;
            setTimeout(()=>{
              const q=this.game.getSnapshot();
              if(q.playerSub?.mode!=='SUNK'&&q.campaign?.missionStatus!=='LOST')Toast.stop(stopText,stopKind);
            },90);
            buzz([20,50,20]);
          }
          break;
        }
      }
      if(T.transitUntil&&T.transitUntil<=T.elapsedSeconds){
        T.transitUntil=0;eng.log('Transit complete.','warn');Toast.ok('Transit complete');
      }
    }

      const snap=this.game.getSnapshot();
      globalThis.processPresentationEffects?.();
    // During transit the simulation, not 60-fps chart repainting, deserves the
    // CPU. Fifteen visual updates per second still show course, traffic and
    // day/night motion clearly, while freeing a large slice of a G88-class
    // frame for the accelerated patrol clock. A transit stop renders at once.
    const transitRunning=snap.time.transitUntil>snap.time.elapsedSeconds;
    const terminal=snap.playerSub?.mode==='SUNK'||snap.campaign?.missionStatus==='LOST';
    // A frozen wreck and accelerated transit both need information refresh,
    // not high-frequency repainting. 15 fps is ample for their mostly static
    // chart/death presentation and leaves far more room for screen recording.
    if((!transitRunning&&!terminal)||now-this.lastTransitRender>=66){
      const layout=LayoutService.get();
      this.cv.render(snap,layout);this.lastTransitRender=now;
    }

    // throttled DOM / HUD work
    this.domAcc+=dt;
    if(this.domAcc>=this.domInterval){
      this.domAcc=0;
      const layout=LayoutService.get(),touch=layout.shell==='touch';
      if(touch) this.tc.updateTouch(snap,layout);
      else this.dv.render(snap,layout);

      tutorial.update(snap,layout);

      const dn=DayNightCycle.update(snap);
      PresentationBridge.ui(snap,'dayNight',dn.daylight,dn.timeStr);

      const days=Math.floor(snap.time.elapsedSeconds/DayNightCycle.CYCLE_SECONDS);
      const base=new Date(snap.campaign.startDate||'1943-08-17');
      base.setDate(base.getDate()+days);
      const ds=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')} ${dn.timeStr}`;
      ['hDate','tDate'].forEach(id=>{const el=document.getElementById(id);if(el&&el.textContent!==ds)el.textContent=ds;});

      // new-event toasts + haptics. During compressed transit the patrol log
      // still records everything, but the screen does not build a toast stack.
      // After an interrupt, the dedicated stop toast owns the lane for four seconds.
      const log=snap.log;
      if(log.length>this.lastLogLen){
        const suppress=terminal||!!snap.time.transitUntil||performance.now()<this.stopToastUntil;
        if(!suppress){
          for(const entry of log.slice(0,log.length-this.lastLogLen)){
            const m=entry.message;
            if(m.includes('HIT ')){Toast.ok('💥 '+m.slice(0,58));buzz([40,50,90]);}
            else if(m.includes('DUD')){Toast.warn('⚠ '+m.slice(0,58));buzz(30);}
            else if(entry.level==='bad'||TOAST_RED.test(m)){
              Toast.auto(m.slice(0,64)); buzz([20,60,20]);
            }
          }
        }
      }
      this.lastLogLen=log.length;
    }

    gyroIndicator.render(snap.tdc,snap.playerSub);

    // Aircraft fly-by needs smooth bearing/range/Doppler updates, but the audio
    // engine internally throttles these to ~12 Hz and only keeps one nearby
    // BRIDGE/GUN aircraft alive. All heavier ambience remains on the 2 s tick.
    if(!terminal)audio.updateAircraftFlyby?.(snap);

    // AudioDirector owns slow ambience/mix updates. It is internally throttled
    // and never touches simulation timing or hidden tactical information.
    globalThis.audioDirector?.update?.(snap);

    // adaptive effect quality — keeps mid-range tablets smooth
    const ms=performance.now()-t0;
    this.frameMs=this.frameMs*0.92+ms*0.08;
    if(this.frameMs>24) this.cv.quality=Math.max(0.25,this.cv.quality-0.03);
    else if(this.frameMs<14) this.cv.quality=Math.min(1,this.cv.quality+0.01);
  }
}
