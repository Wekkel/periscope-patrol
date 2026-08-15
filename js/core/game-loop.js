// ═══════════════════════════════════════════════════ GAME LOOP
class GameLoop{
  constructor(game,cv,dv,tc,hud){
    this.game=game;this.cv=cv;this.dv=dv;this.tc=tc;this.hud=hud;
    this.fdt=1/10;this.acc=0;this.last=performance.now();
    this.domAcc=0;this.domInterval=1/5;      // DOM refresh at 5 Hz — huge saving on tablets
    this._renderErrorKey=null;
    this.frameMs=16;this.ambT=0;this.lastLogLen=0;this.stopToastUntil=0;this.lastTransitRender=0;this.transit=new TransitService(game,this._safeUpdate.bind(this));this.quality=new QualityGovernor(cv);
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
        try{PresentationBridge.toast(s).bad(`SIMULATION PAUSED — ${msg.slice(0,72)}`);}catch(_){ }
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
  _safeRender(state,layout){
    try{this.cv.render(state,layout);this._renderErrorKey=null;return true;}
    catch(err){const msg=String(err?.message||err||'unknown render error');if(this._renderErrorKey!==msg){this._renderErrorKey=msg;console.error('[RENDER] station render failed; navigation remains available',err);try{PresentationBridge.toast(state).warn(`DISPLAY RECOVERING — ${msg.slice(0,56)}`);}catch(_){}}return false;}
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
    // fixed-step simulation
    this.acc+=dt;
    let steps=0;
    while(this.acc>=this.fdt&&steps<8){
      const ok=this._safeUpdate(this.fdt);this.acc-=this.fdt;steps++;
      if(!ok){this.acc=0;break;}
    }
    if(this.acc>this.fdt*8) this.acc=0;

    if(this.game.getSnapshot().time.transitUntil)this.transit.run();

      const snap=this.game.getSnapshot();
      processPresentationEffects?.();
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
      this._safeRender(snap,layout);this.lastTransitRender=now;
    }

    this.hud?.tick(dt);

    gyroIndicator.render(snap.tdc,snap.playerSub);

    // Aircraft fly-by needs smooth bearing/range/Doppler updates, but the audio
    // engine internally throttles these to ~12 Hz and only keeps one nearby
    // BRIDGE/GUN aircraft alive. All heavier ambience remains on the 2 s tick.
    

    // AudioDirector owns slow ambience/mix updates. It is internally throttled
    // and never touches simulation timing or hidden tactical information.

    // adaptive effect quality — keeps mid-range tablets smooth
    const ms=performance.now()-t0;
    this.frameMs=this.quality.sample(ms);
  }
}
