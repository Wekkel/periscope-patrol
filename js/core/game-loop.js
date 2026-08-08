// ═══════════════════════════════════════════════════ GAME LOOP
class GameLoop{
  constructor(game,cv,dv,tc){
    this.game=game;this.cv=cv;this.dv=dv;this.tc=tc;
    this.fdt=1/10;this.acc=0;this.last=performance.now();
    this.domAcc=0;this.domInterval=1/5;      // DOM refresh at 5 Hz — huge saving on tablets
    this.frameMs=16;this.ambT=0;this.lastLogLen=0;this.stopToastUntil=0;
    this._frame=this.frame.bind(this);
  }
  start(){requestAnimationFrame(this._frame);}

  frame(now){
    requestAnimationFrame(this._frame);
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
      if(Tq.transitUntil||performance.now()<this.stopToastUntil){ // running / final reason owns lane: hold them
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
    while(this.acc>=this.fdt&&steps<8){this.game.update(this.fdt);this.acc-=this.fdt;steps++;}
    if(this.acc>this.fdt*8) this.acc=0;

    // ── transit: burn through the empty hours, but keep a hand on the tiller ──
    const T=this.game.getSnapshot().time;
    if(T.transitUntil&&T.transitUntil>T.elapsedSeconds){
      const budget=performance.now()+11;              // never block a frame for long
      const eng=this.game.engine||this.game;
      while(performance.now()<budget&&T.transitUntil>T.elapsedSeconds){
        this.game.update(2.0/Math.max(T.timeScale,1));
        const why=eng.transitInterrupt&&eng.transitInterrupt();
        if(why){
          T.transitUntil=0;T.transitReason=why;
          if(why!=='ok'){
            eng.log(`Transit broken off — ${why}.`,'warn');
            // Give the stop reason the toast lane to itself. The queued context
            // may flash first, but this line clears it and then stays readable.
            T.stopReason=why; T.stopReasonAt=T.elapsedSeconds;
            this.stopToastUntil=performance.now()+4000;
            const stopKind=transitStopToastKind(why);
            setTimeout(()=>Toast.stop('TRANSIT STOPPED — '+why,stopKind),90);
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
    this.cv.render(snap);

    // throttled DOM / HUD work
    this.domAcc+=dt;
    if(this.domAcc>=this.domInterval){
      this.domAcc=0;
      const touch=document.documentElement.dataset.lay==='touch';
      if(touch) this.tc.updateTouch(snap);
      else this.dv.render(snap);

      tutorial.update(snap);

      const dn=DayNightCycle.update(snap);
      DayNightCycle.renderBar(dn.daylight,dn.timeStr);

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
        const suppress=!!snap.time.transitUntil||performance.now()<this.stopToastUntil;
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

    // ambient audio ~every 2 s
    this.ambT+=dt;
    if(this.ambT>2){this.ambT=0;audio.setAmbient(snap.playerSub.depthFeet,snap.playerSub.stealth.silentRunning);}

    // adaptive effect quality — keeps mid-range tablets smooth
    const ms=performance.now()-t0;
    this.frameMs=this.frameMs*0.92+ms*0.08;
    if(this.frameMs>24) this.cv.quality=Math.max(0.25,this.cv.quality-0.03);
    else if(this.frameMs<14) this.cv.quality=Math.min(1,this.cv.quality+0.01);
  }
}

