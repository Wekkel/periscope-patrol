// ═══════════════════════════════════════════════════ AUDIO DIRECTOR
// Phase 4 design rule: audio may reveal only what the boat/player can physically
// or procedurally perceive. Never key a tension cue from hidden AI state alone.
// The director changes mix/perspective only; it never writes simulation state.
class AudioDirector{
  constructor(engine){this.engine=engine;this.lastAt=-Infinity;this.state={base:'NORMAL_NAVIGATION',threat:'NONE',perspective:'INTERNAL_SURFACE',compressed:false};this.previewState=null;this.previewUntil=0;this.lastASWReminderAt=-Infinity;}

  _derive(s){
    const sub=s?.playerSub||{},T=s?.tactical||{},W=s?.world||{},camp=s?.campaign||{},depth=Number(sub.depthFeet)||0,station=T.activeStation||'TACTICAL',speed=Number(sub.propulsion?.speedKnots)||0;
    let base='NORMAL_NAVIGATION';
    if(camp.missionStatus==='RETURN TO BASE')base='RETURN_HOME';
    else if(sub.stealth?.silentRunning)base='SILENT_RUNNING';
    else if(station==='PERISCOPE'&&depth>=8&&depth<=70)base='PERISCOPE_STALK';
    else if(depth<8&&speed>7)base='SURFACED_TRANSIT';

    let perspective='SUBMERGED';
    if(depth<10&&(station==='BRIDGE'||station==='DECK_GUN'))perspective='EXPOSED_SURFACE';
    else if(depth<10)perspective='INTERNAL_SURFACE';
    else if(station==='PERISCOPE'&&depth<=70)perspective='PERISCOPE_INTERNAL';
    else if(station==='SOUND'&&T.soundDisplay==='PASSIVE')perspective='HYDROPHONE_FEED';

    // Threat mixing is permitted only when the threat is already perceptible.
    const visibleAir=(W.aircraft||[]).some(a=>a&&!a.shotDown&&a.seenBySub&&(a.state==='ATTACKING'||a.state==='STRAFING'));
    const chargesNear=(W.depthCharges||[]).some(dc=>dc?.status==='SINKING'&&dc.ageSec>=0&&distNm(sub.position,dc.position)<1.4);
    const firmASW=W.enemy?.alertState==='ATTACKING'&&(W.enemy?.contactHeld||W.enemy?.visualOnSub||chargesNear);
    const heardPing=(performance.now()-(this.engine.lastEnemyPingAt||-1e9))<8000;
    let threat='NONE';if(visibleAir)threat='AIR_ATTACK';else if(firmASW)threat='DETECTED_ASW';else if(heardPing)threat='ENEMY_SEARCH';
    return{base,threat,perspective,compressed:!!s?.time?.transitUntil||(Number(s?.time?.timeScale)||1)>1};
  }

  _profile(q){
    const m={system:1,command:1,sensor:1,world:1,machinery:1,weapons:1,mission:1};
    if(q.base==='SILENT_RUNNING')Object.assign(m,{system:.70,command:.82,sensor:1.12,world:.32,machinery:.48,mission:.82});
    else if(q.base==='PERISCOPE_STALK')Object.assign(m,{system:.82,sensor:1.05,world:.48,machinery:.70});
    else if(q.base==='SURFACED_TRANSIT')Object.assign(m,{world:1.05,machinery:1.02});
    else if(q.base==='RETURN_HOME')Object.assign(m,{world:.88,machinery:.86,mission:1.05});

    if(q.perspective==='HYDROPHONE_FEED')Object.assign(m,{system:m.system*.68,world:m.world*.22,machinery:m.machinery*.48,sensor:Math.min(1.28,m.sensor*1.16)});
    else if(q.perspective==='PERISCOPE_INTERNAL')Object.assign(m,{world:m.world*.72,machinery:m.machinery*.88});
    else if(q.perspective==='SUBMERGED')m.world*=.42;

    if(q.threat==='ENEMY_SEARCH')Object.assign(m,{sensor:Math.min(1.28,m.sensor*1.12),machinery:m.machinery*.78});
    else if(q.threat==='DETECTED_ASW')Object.assign(m,{sensor:Math.min(1.30,m.sensor*1.14),command:1.05,machinery:m.machinery*.72,world:m.world*.78,weapons:1.10});
    else if(q.threat==='AIR_ATTACK')Object.assign(m,{command:1.06,world:Math.min(1.15,m.world*1.08),machinery:m.machinery*.88,weapons:1.08});

    // Time compression suppresses routine chatter/controls, not critical weapon
    // or sensor events. A transit stop returns to the normal mix immediately.
    if(q.compressed){m.system*=.38;m.command*=.58;m.world*=.62;m.machinery*=.78;m.mission*=.72;}
    return m;
  }

  update(s,force=false){
    if(!s)return;const now=performance.now();if(!force&&now-this.lastAt<260)return;this.lastAt=now;
    const live=this._derive(s),prevThreat=this.state?.threat||'NONE';let q=live;
    // ASW warning cadence is wall-clock based, not simulation-time based. A
    // 32× clock may accelerate destroyers, but it must never machine-gun the
    // player's ears with alarm cues. Two strokes mark a fresh held attack; one
    // softer stroke roughly every 19 real seconds says that it is still live.
    if(live.threat==='DETECTED_ASW'&&!s.tactical?.impactObservation){
      if(prevThreat!=='DETECTED_ASW'&&now-this.lastASWReminderAt>8000){this.engine.playASWAlarm?.(false);this.lastASWReminderAt=now;}
      else if(now-this.lastASWReminderAt>19000){this.engine.playASWAlarm?.(true);this.lastASWReminderAt=now;}
    }
    if(this.previewState&&now<this.previewUntil)q={...q,...this.previewState};else if(this.previewState){this.previewState=null;this.previewUntil=0;}
    this.state=q;this.engine.setAmbient?.(s.playerSub?.depthFeet||0,!!s.playerSub?.stealth?.silentRunning,s.playerSub?.propulsion);this.engine.setBattleAmbience?.(s);this.engine.applyMixProfile?.(this._profile(q));
  }

  preview(base='SILENT_RUNNING',threat='NONE',perspective=null,durationMs=8000){this.previewState={base,threat};if(perspective)this.previewState.perspective=perspective;this.previewUntil=performance.now()+Math.max(500,durationMs);return{...this.previewState,untilMs:durationMs};}
  stopPreview(){this.previewState=null;this.previewUntil=0;return true;}
  stats(){return{...this.state,preview:this.previewState?{...this.previewState,remainingMs:Math.max(0,this.previewUntil-performance.now())}:null};}
}
globalThis.audioDirector=new AudioDirector(audio);
