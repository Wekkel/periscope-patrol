/* Accelerated patrol transit. Simulation owns only time and interruption rules. */
class TransitService{
  constructor(game,safeUpdate){this.game=game;this.safeUpdate=safeUpdate;}
  run(){const s=this.game.getSnapshot(),T=s.time;if(!T.transitUntil||T.transitUntil<=T.elapsedSeconds)return false;const budget=Date.now()+11,eng=this.game.engine||this.game;
    while(Date.now()<budget&&T.transitUntil>T.elapsedSeconds){const advance=eng.canUseOpenSeaTransitStep?.()?3:2;if(!this.safeUpdate(advance/Math.max(T.timeScale,1))){T.transitUntil=0;T.transitOpen=false;break;}const why=eng.transitInterrupt&&eng.transitInterrupt();if(why){T.transitUntil=0;T.transitOpen=false;T.timeScale=1;T.transitReason=why;if(why!=='ok'){eng.log(`Transit broken off — ${why}.`,'warn');T.stopReason=why;T.stopReasonAt=T.elapsedSeconds;PresentationBridge.toast(s).warn('TRANSIT STOPPED — '+why);}break;}}
    if(T.transitUntil&&T.transitUntil<=T.elapsedSeconds){T.transitUntil=0;eng.log('Transit complete.','warn');PresentationBridge.toast(s).ok('Transit complete');}return true;}
}
