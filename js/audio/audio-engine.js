// ═══════════════════════════════════════════════════ AUDIO ENGINE
class AudioEngine{
  constructor(){this.ctx=null;this.enabled=true;this.masterGain=null;this.musicGain=null;this.outputLimiter=null;this.initialized=false;
    this.sfxVolume=.62;this.musicVolume=.42;this.noiseBuffer=null;this.sonarVariant=3;
    this.busNodes={};this.mixTargets={system:1,command:1,sensor:1,world:1,machinery:1,weapons:1,mission:1};this.duckUntil=0;this.duckFactor=1;
    this.lastPing=0;this.lastEnemyPingAt=0;this.lastDC=0;this.lastLaunch=0;this.lastCreak=0;this.lastSystem=0;this.lastTdcBell=0;this.lastBattleStations=0;this.lastRadio=0;
    this.titleStartPlayed=false;this.titleCueGain=null;
    this.battleNoiseSource=null;this.seaGain=null;this.windGain=null;this.rainGain=null;this.harborGain=null;this.harborOsc=null;this.harborOscGain=null;this.dieselOsc=null;this.dieselGain=null;this.torpedoOsc=null;this.torpedoGain=null;this.torpedoPan=null;this.escortMachinery=null;
    this.soundIdentity={key:'US_FLEET_BOAT',electricPitch:1,dieselPitch:1,dieselLevel:1,hullMass:1,commandPitch:1};
    // Aircraft fly-by is a deliberately tiny procedural engine. Only the nearest
    // visible aircraft in BRIDGE/GUN gets voices; this avoids turning ambient
    // sound into another sensor and keeps oscillator count bounded on G88-class
    // hardware. Nodes are reused while the aircraft/family stays the same.
    this.airFlyby=null;this.airFlybyLastUpdate=0;}

  init(){
    if(this.initialized)return;
    try{
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();
      const ctx=this.ctx;
      this.masterGain=ctx.createGain();this.masterGain.gain.value=this.enabled?this.sfxVolume:0;
      this.musicGain=ctx.createGain();this.musicGain.gain.value=this.enabled?this.musicVolume:0;
      // Phase 4 mixer: presentation buses are cheap GainNodes. Simulation code
      // emits semantic events; the AudioDirector changes these buses without
      // ever changing physics, AI, detection or simulation timing.
      for(const name of ['system','command','sensor','world','machinery','weapons','mission']){const g=ctx.createGain();g.gain.value=1;g.connect(this.masterGain);this.busNodes[name]=g;}
      // A mild limiter is a safety rail for stacked combat transients, not a
      // loudness maximizer. Distance and dynamic range must remain audible.
      this.outputLimiter=ctx.createDynamicsCompressor();
      this.outputLimiter.threshold.value=-5;this.outputLimiter.knee.value=3;this.outputLimiter.ratio.value=6;this.outputLimiter.attack.value=.003;this.outputLimiter.release.value=.18;
      this.masterGain.connect(this.outputLimiter);this.musicGain.connect(this.outputLimiter);this.outputLimiter.connect(ctx.destination);
      this._ensureNoiseBuffer();this.initialized=true;this.startAmbient();
      document.addEventListener('visibilitychange',()=>{
        if(!this.ctx)return;
        if(document.hidden&&this.ctx.state==='running')this.ctx.suspend().catch(()=>{});
        // Resume remains gesture-gated by browsers; ensure() on the next player
        // input restores it. Do not queue old combat one-shots while backgrounded.
      },{passive:true});
    }catch(e){this.enabled=false;}
  }

  ensure(){
    if(!this.initialized)this.init();
    if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
  }

  _bus(name='system'){return this.busNodes?.[name]||this.masterGain;}

  applyMixProfile(profile={}){
    if(!this.ctx)return;const now=this.ctx.currentTime,wall=performance.now(),duck=wall<this.duckUntil?this.duckFactor:1;
    for(const name of Object.keys(this.mixTargets)){
      const raw=clamp(Number(profile[name]??1),0,1.35);this.mixTargets[name]=raw;
      const target=(name==='world'||name==='machinery')?raw*duck:raw;
      // World/machinery beds should crossfade when entering/leaving SILENT or
      // surfacing. Alert ducking remains fast in duck(), so this does not blunt
      // combat warnings or spoken command priority.
      const tau=(name==='world'||name==='machinery') ? .34 : .16;
      this._bus(name)?.gain.setTargetAtTime(target,now,tau);
    }
  }

  duck(priority=80,durationMs=550){
    const p=clamp((Number(priority)||0)/100,0,1),factor=clamp(1-p*.52,.42,.92);
    this.duckFactor=Math.min(this.duckFactor||1,factor);this.duckUntil=Math.max(this.duckUntil||0,performance.now()+Math.max(80,durationMs));
    if(this.ctx){const now=this.ctx.currentTime;for(const name of ['world','machinery'])this._bus(name)?.gain.setTargetAtTime((this.mixTargets[name]??1)*this.duckFactor,now,.025);}
  }

  _ensureNoiseBuffer(){
    if(!this.ctx||this.noiseBuffer)return;
    // Reuse one two-second noise bed instead of allocating/filling a new
    // AudioBuffer for every explosion. This removes avoidable combat GC work
    // on low-end mobile devices; random offsets keep repeated effects varied.
    const sr=this.ctx.sampleRate,buf=this.ctx.createBuffer(1,sr*2,sr),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noiseBuffer=buf;
  }

  _noiseSource(dur){
    if(!this.ctx)return null;this._ensureNoiseBuffer();const s=this.ctx.createBufferSource();s.buffer=this.noiseBuffer;
    // Always loop the shared noise bed so random offsets can never truncate a short one-shot.
    s.loop=true;return s;
  }

  startAmbient(){
    if(!this.ctx)return;const ctx=this.ctx;
    // Submerged ambience is intentionally machinery/pressure rather than a
    // broadband hiss. A single PeriodicWave supplies the approved low engine
    // hum while a very dark reusable-noise layer gives the hull/water mass.
    // Keep the electric-motor/hull bed dark. The earlier harmonic stack had a
    // conspicuous synthetic 'buzz'; this spectrum keeps a low mechanical body
    // while leaving enough harmonics for small phone speakers to reproduce it.
    const real=new Float32Array(6),imag=new Float32Array([0,1,.24,.08,.025,.008]);
    const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.setPeriodicWave(ctx.createPeriodicWave(real,imag,{disableNormalization:false}));o.frequency.value=29;
    f.type='lowpass';f.frequency.value=190;f.Q.value=.38;g.gain.value=0;o.connect(f);f.connect(g);g.connect(this._bus('machinery'));o.start();
    const n=this._noiseSource(999),nf=ctx.createBiquadFilter(),ng=ctx.createGain();nf.type='lowpass';nf.frequency.value=240;nf.Q.value=.35;ng.gain.value=0;
    n.connect(nf);nf.connect(ng);ng.connect(this._bus('machinery'));n.start(0,Math.random()*1.7);
    this.ambientOsc=o;this.ambientGain=g;this.ambientNoiseSource=n;this.ambientNoiseGain=ng;
  }

  _soundProfile(state=null){
    const id=String(state?.playerSub?.profileId||'').toLowerCase(),fallback=id.includes('type-vii')
      ?{key:'TYPE_VII',electricPitch:1.08,dieselPitch:1.13,dieselLevel:.92,hullMass:.88,commandPitch:1.08}
      :{key:'US_FLEET_BOAT',electricPitch:1,dieselPitch:1,dieselLevel:1,hullMass:1,commandPitch:1};
    if(typeof getSubmarineProfile==='function')try{return{...fallback,...(getSubmarineProfile(state?.playerSub?.profileId)?.audio||{})};}catch(_){}
    return fallback;
  }

  setAmbient(depthFt,silent,propulsion=null,soundProfile=null){
    if(!this.ambientGain||!this.ctx)return;
    this.soundIdentity=soundProfile||this.soundIdentity;
    const now=this.ctx.currentTime,submerged=depthFt>8,deep=clamp((depthFt-45)/190,0,1);
    const rpm=clamp((Number(propulsion?.actualRpm)||0)/450,0,1);
    // Electric motors remain audible in silent running: quiet is tension, not a
    // dead soundtrack. Both level and pitch follow ACTUAL rpm, so helm changes
    // have the same physical lag the player sees on the tachometer.
    const drive=.56+rpm*.66;
    const identity=this.soundIdentity||{},mass=clamp(Number(identity.hullMass)||1,.7,1.3);
    const hum=submerged?(silent?.0105:.0165)*drive*(1+deep*.18)/mass:.0008;
    const water=submerged?(silent?.0036:.0062)*(.80+rpm*.22)*(1+deep*.25)*mass:0;
    this.ambientGain.gain.setTargetAtTime(hum,now,.82);
    this.ambientNoiseGain?.gain.setTargetAtTime(water,now,.95);
    if(this.ambientOsc){
      const hz=(25.5+rpm*15.5+deep*1.6)*clamp(Number(identity.electricPitch)||1,.8,1.25);
      this.ambientOsc.frequency.setTargetAtTime(hz,now,silent?.62:.38);
    }
  }

  _route(node,bearingDeg=null,ownHeading=0,destination='system'){
    const out=typeof destination==='string'?this._bus(destination):(destination||this._bus('system'));if(!node||!out)return null;
    if(Number.isFinite(bearingDeg)&&this.ctx?.createStereoPanner){
      const p=this.ctx.createStereoPanner();p.pan.value=clamp(Math.sin(degToRad(shortDelta(ownHeading||0,bearingDeg))),-1,1);node.connect(p);p.connect(out);return p;
    }
    node.connect(out);return null;
  }

  _noise(dur,freq,type,vol,bearingDeg=null,ownHeading=0,bus='system'){
    if(!this.ctx||!this.enabled)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter(),now=this.ctx.currentTime;
    f.type='bandpass';f.frequency.value=freq;f.Q.value=1.5;o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(Math.max(.0001,vol),now);g.gain.exponentialRampToValueAtTime(.001,now+dur);
    o.connect(f);f.connect(g);this._route(g,bearingDeg,ownHeading,bus);o.start();o.stop(now+dur+.05);
  }

  _filteredNoise(dur,vol,{type='lowpass',freq=300,q=.7,attack=.002,offset=null}={},bearingDeg=null,ownHeading=0,bus='system'){
    if(!this.ctx||!this.enabled)return null;const ctx=this.ctx,now=ctx.currentTime,src=this._noiseSource(dur),g=ctx.createGain(),f=ctx.createBiquadFilter();
    f.type=type;f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(Math.max(.0002,vol),now+attack);g.gain.exponentialRampToValueAtTime(.001,now+dur);
    src.connect(f);f.connect(g);this._route(g,bearingDeg,ownHeading,bus);src.start(now,offset??Math.random()*1.6);src.stop(now+dur+.03);return{source:src,gain:g,filter:f};
  }

  _white(dur,vol,bearingDeg=null,ownHeading=0,bus='system'){return this._filteredNoise(dur,vol,{type:'bandpass',freq:300,q:.5},bearingDeg,ownHeading,bus);}

  _metalClack(weight=.5,lowHz=105,ringHz=650,bus='system'){
    if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime;
    this._filteredNoise(.10,.12*weight,{type:'bandpass',freq:900,q:.55,attack:.001},null,0,bus);
    for(const [f,v,d] of [[lowHz,.16*weight,.16],[ringHz,.045*weight,.18]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(v,now);g.gain.exponentialRampToValueAtTime(.001,now+d);o.connect(g);g.connect(this._bus(bus));o.start();o.stop(now+d+.02);}
  }

  playTorpedoLaunch(){
    this.ensure();if(Date.now()-this.lastLaunch<400)return;this.lastLaunch=Date.now();this.duck(72,380);
    this._white(.15,.4,null,0,'weapons');
    setTimeout(()=>this._noise(.6,80,'sine',.35,null,0,'weapons'),80);
    setTimeout(()=>this._noise(.4,40,'sine',.2,null,0,'weapons'),200);
  }

  playDepthCharge(dist=1){
    this.ensure();if(Date.now()-this.lastDC<210)return;this.lastDC=Date.now();if(!this.ctx||!this.enabled)return;
    const ctx=this.ctx,now=ctx.currentTime,near=clamp(1-(Number(dist)||0),0,1),far=near<.18,mid=!far&&near<.58;
    const scale=far?.42:mid?.68:.96,bodyDur=far?.84:mid?1.04:1.24;this.duck(near>.7?98:mid?90:80,near>.7?900:620);
    // Pressure-first design: short dark broadband WHUMP excites broad low-Q
    // water/steel resonances. Avoid clean low oscillators here: they read as a
    // synth bass note instead of an underwater explosion.
    this._filteredNoise(far?.08:.095,.76*scale,{type:'lowpass',freq:820,q:.34,attack:.0006},null,0,'weapons');
    this._filteredNoise(far?.14:.17,.56*scale,{type:'lowpass',freq:175,q:.38,attack:.0006},null,0,'weapons');
    const src=this._noiseSource(bodyDur),body=ctx.createGain();body.gain.setValueAtTime(.54*scale,now+.005);body.gain.exponentialRampToValueAtTime(.001,now+bodyDur);
    for(const [f0,q,w] of [[38,.72,.34],[56,.86,.42],[79,1.0,.38],[108,1.10,.30],[146,1.20,.20],[205,1.28,.10]]){const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=f0;f.Q.value=q;g.gain.value=w;src.connect(f);f.connect(g);g.connect(body);}body.connect(this._bus('weapons'));src.start(now+.005,Math.random()*1.2);src.stop(now+bodyDur+.02);
    if(!far){const hd=mid?.72:.96,hs=this._noiseSource(hd),hg=ctx.createGain();hg.gain.setValueAtTime(.11*scale,now+.045);hg.gain.exponentialRampToValueAtTime(.001,now+hd);
      for(const [f0,q,w] of [[72,1.35,.50],[118,1.55,.39],[177,1.8,.24],[268,2.0,.10]]){const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=f0;f.Q.value=q;g.gain.value=w;hs.connect(f);f.connect(g);g.connect(hg);}hg.connect(this._bus('weapons'));hs.start(now+.045,Math.random()*1.1);hs.stop(now+hd+.05);}
    // Distant/medium charges get a little more lingering low water mass; near
    // charges keep the already-approved compact impact with only a subtle tail.
    const glow=far?1.00:mid?.88:.72,glowVol=far?.030:mid?.036:.032;
    this._filteredNoise(glow,glowVol,{type:'lowpass',freq:215,q:.42,attack:.12},null,0,'weapons');
  }

  playDepthChargeSplash(distanceFactor=.5){
    this.ensure();const v=clamp(.17*(1-clamp(distanceFactor,0,1)*.58),.045,.17);
    // Three physical layers: the thin surface slap, displaced-water body and
    // an irregular bubble wash. Keeping them broadband avoids the old digital
    // click while remaining much lighter than the later detonation.
    this._filteredNoise(.075,v*.88,{type:'highpass',freq:1450,q:.34,attack:.001},null,0,'weapons');
    this._filteredNoise(.32,v,{type:'bandpass',freq:820,q:.38,attack:.006},null,0,'weapons');
    this._filteredNoise(.52,v*.40,{type:'lowpass',freq:190,q:.42,attack:.012},null,0,'weapons');
    setTimeout(()=>this._filteredNoise(.26,v*.24,{type:'bandpass',freq:1280,q:.30,attack:.025},null,0,'weapons'),95);
  }

  playHit(){
    // Compact shell/deck-gun hull strike. Torpedoes use playTorpedoHit(), whose
    // much larger pressure body would make a 3-inch hit sound absurdly heavy.
    this.ensure();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime;
    this.duck(88,520);this._filteredNoise(.055,.48,{type:'lowpass',freq:1450,q:.36,attack:.0005},null,0,'weapons');
    this._filteredNoise(.22,.27,{type:'bandpass',freq:430,q:.55,attack:.002},null,0,'weapons');
    const dur=.68,src=this._noiseSource(dur),body=ctx.createGain();body.gain.setValueAtTime(.24,now+.003);body.gain.exponentialRampToValueAtTime(.001,now+dur);
    for(const [f0,q,w] of [[74,.9,.30],[118,1.0,.25],[205,1.2,.13]]){const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=f0;f.Q.value=q;g.gain.value=w;src.connect(f);f.connect(g);g.connect(body);}body.connect(this._bus('weapons'));src.start(now+.003,Math.random());src.stop(now+dur+.03);
  }

  playTorpedoHit(){
    this.ensure();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime;
    // A Mk14-sized warhead striking a steel hull is deliberately NOT a short,
    // dry bang. The first pressure face is broad and dark; a turbulent water/
    // hull body follows for almost three seconds, with inharmonic low-Q steel
    // resonances and a low tail that remains audible on small mobile speakers.
    this.duck(100,1900);
    this._filteredNoise(.095,.98,{type:'lowpass',freq:1050,q:.28,attack:.0004},null,0,'weapons');
    this._filteredNoise(.24,.82,{type:'lowpass',freq:185,q:.34,attack:.0007},null,0,'weapons');
    this._filteredNoise(.48,.38,{type:'bandpass',freq:980,q:.38,attack:.002},null,0,'weapons');
    const dur=2.85,src=this._noiseSource(dur),body=ctx.createGain();body.gain.setValueAtTime(.92,now+.006);body.gain.setValueAtTime(.82,now+.12);body.gain.exponentialRampToValueAtTime(.001,now+dur);
    for(const [f0,q,w] of [[34,.62,.48],[49,.70,.54],[71,.78,.50],[101,.90,.42],[143,1.02,.31],[207,1.14,.19],[292,1.22,.09]]){const f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=f0;f.Q.value=q;g.gain.value=w;src.connect(f);f.connect(g);g.connect(body);}body.connect(this._bus('weapons'));src.start(now+.006,Math.random());src.stop(now+dur+.04);
    this._filteredNoise(2.35,.115,{type:'lowpass',freq:245,q:.38,attack:.055},null,0,'weapons');
    setTimeout(()=>this._filteredNoise(.90,.055,{type:'bandpass',freq:118,q:.82,attack:.015},null,0,'weapons'),165);
  }

  playDud(){this.ensure();this._noise(.22,105,'sine',.18,null,0,'weapons');setTimeout(()=>this._metalClack(.22,88,310,'weapons'),70);}

  playDeckGun(power=1){
    this.ensure();const v=clamp(power,.2,1);this.duck(86,320);this._noise(.055,72,'sawtooth',.55*v,null,0,'weapons');
    setTimeout(()=>this._white(.18,.42*v,null,0,'weapons'),18);setTimeout(()=>this._noise(.42,36,'sine',.30*v,null,0,'weapons'),45);
  }

  _sonarConfig(index=this.sonarVariant,own=false){
    // Round 10 listening result. Variant 3 is canonical for release testing:
    // 695 Hz, ~18 ms hard body, then two decay slopes of the SAME stable tone.
    // No vibrato, detuning, pitch bend, moving delays or separate sea-tail.
    const set=[
      {freq:700,hold:.022,fast:.22,slow:1.15,mix:.34},
      {freq:700,hold:.016,fast:.20,slow:1.30,mix:.38},
      {freq:695,hold:.018,fast:.24,slow:1.38,mix:.36}
    ],c={...set[clamp((index|0)-1,0,set.length-1)]};if(own)c.freq+=72;return c;
  }

  setSonarVariant(index){this.sonarVariant=clamp(index|0,1,3);return this.sonarVariant;}

  _playSelfDecaySonar(bearingDeg=null,ownHeading=0,index=this.sonarVariant,own=false,levelScale=1){
    this.ensure();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,c=this._sonarConfig(index,own),now=ctx.currentTime,level=(own?.48:.62)*clamp(Number(levelScale)||0,0,1.2),dur=Math.max(2.9,c.slow*5.0),out=ctx.createGain();
    this._route(out,bearingDeg,ownHeading,'sensor');
    // Two parallel gain paths create a quick release from the hard PING plus a
    // quieter long ring. Both paths carry the exact same oscillator: the decay
    // therefore remains recognisably the original ping instead of becoming a
    // different 'reverb sound'.
    const fast=ctx.createGain(),slow=ctx.createGain();fast.gain.setValueAtTime(.0001,now);slow.gain.setValueAtTime(.0001,now);fast.connect(out);slow.connect(out);
    const fastTop=level*(1-c.mix),slowTop=level*c.mix;
    for(const [g,top,tau] of [[fast,fastTop,c.fast],[slow,slowTop,c.slow]]){g.gain.linearRampToValueAtTime(top,now+.004);g.gain.setValueAtTime(top,now+c.hold);g.gain.exponentialRampToValueAtTime(.001,now+c.hold+tau*5.0);}
    for(const [r,v,phase] of [[1,1,0],[2,.020,.25],[.5,.018,.6]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=c.freq*r;g.gain.value=v;o.connect(g);g.connect(fast);g.connect(slow);o.start(now);o.stop(now+dur+.05);}
    // Tiny dark projector edge only. It must never determine pitch identity.
    this._filteredNoise(.014,own?.012:.018,{type:'bandpass',freq:720,q:.35,attack:.0005},bearingDeg,ownHeading,'sensor');
    if(!own){this.lastEnemyPingAt=performance.now();this.duck(76,420);}
  }

  playSonarPing(bearingDeg=null,ownHeading=0,variant=this.sonarVariant,levelScale=1){
    this.ensure();if(Date.now()-this.lastPing<700)return;this.lastPing=Date.now();this._playSelfDecaySonar(bearingDeg,ownHeading,variant,false,levelScale);
    const ping=document.getElementById('sonarPing');if(ping){ping.classList.remove('ping');void ping.offsetWidth;ping.classList.add('ping');}
  }


  playStationSwitch(){this.ensure();if(Date.now()-this.lastSystem<80)return;this.lastSystem=Date.now();this._metalClack(.55,102,1120,'system');setTimeout(()=>this._metalClack(.25,92,760,'system'),115);}

  playTdcSolution(){
    this.ensure();if(Date.now()-this.lastTdcBell<650)return;this.lastTdcBell=Date.now();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime;
    // A single small period-style confirmation bell replaces electronic rising
    // beeps. It is intentionally symbolic UI feedback, not machinery telemetry.
    for(const [f,v,d] of [[980,.075,.30],[1375,.050,.24],[1830,.034,.19],[2470,.018,.14]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(v,now);g.gain.exponentialRampToValueAtTime(.001,now+d);o.connect(g);g.connect(this._bus('system'));o.start();o.stop(now+d+.03);}
  }

  playTubeFlood(){
    this.ensure();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime,dur=.95,src=this._noiseSource(dur),out=ctx.createGain(),low=ctx.createBiquadFilter(),mid=ctx.createBiquadFilter(),lg=ctx.createGain(),mg=ctx.createGain();
    low.type='lowpass';low.frequency.value=430;mid.type='bandpass';mid.frequency.value=480;mid.Q.value=.65;lg.gain.value=.72;mg.gain.value=.23;src.connect(low);low.connect(lg);lg.connect(out);src.connect(mid);mid.connect(mg);mg.connect(out);out.connect(this._bus('system'));
    // Water starts through a small opening and reaches full flow in ~55 ms —
    // fast enough to feel pressurised, but without the hard 'impact' edge.
    out.gain.setValueAtTime(.0001,now);out.gain.linearRampToValueAtTime(.19,now+.055);out.gain.exponentialRampToValueAtTime(.001,now+.90);src.start(now,Math.random()*1.4);src.stop(now+.95);
  }

  playTubeReady(){this.ensure();this._metalClack(.78,112,430,'system');setTimeout(()=>this._metalClack(.20,96,620,'system'),72);}

  playPeriscopeMove(direction='extend'){
    this.ensure();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime,dur=1.18,extend=direction!=='retract',out=ctx.createGain();out.gain.setValueAtTime(.0001,now);out.gain.linearRampToValueAtTime(.055,now+.10);out.gain.setValueAtTime(.050,now+.90);out.gain.exponentialRampToValueAtTime(.001,now+dur);out.connect(this._bus('system'));
    const a=extend?[430,340]:[340,430],b=extend?[820,650]:[650,820];for(const [pair,v] of [[a,.52],[b,.22]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(pair[0],now);o.frequency.linearRampToValueAtTime(pair[1],now+dur);g.gain.value=v;o.connect(g);g.connect(out);o.start();o.stop(now+dur+.02);}this._filteredNoise(dur,.014,{type:'bandpass',freq:420,q:.5,attack:.07},null,0,'system');
  }

  playAirBomb(dist=.7){this.ensure();const v=clamp(1-dist*.72,.18,.75);this.duck(84,420);this._filteredNoise(.18,.42*v,{type:'bandpass',freq:180,q:.45,attack:.001},null,0,'weapons');this._filteredNoise(.72,.20*v,{type:'lowpass',freq:420,q:.45,attack:.008},null,0,'weapons');}
  playMineStrike(){this.ensure();this.duck(99,900);this._filteredNoise(.10,.64,{type:'lowpass',freq:700,q:.35,attack:.0006},null,0,'weapons');this._filteredNoise(1.05,.34,{type:'lowpass',freq:190,q:.55,attack:.006},null,0,'weapons');setTimeout(()=>this._metalClack(.75,82,260,'weapons'),45);}
  playStrafe(){this.ensure();for(let i=0;i<5;i++)setTimeout(()=>this._filteredNoise(.055,.12,{type:'bandpass',freq:1150,q:.55,attack:.001},null,0,'weapons'),i*62);}

  playUiConfirm(weight=.28){this.ensure();this._metalClack(weight,96,820,'system');}
  playWaypoint(){this.ensure();this._metalClack(.24,92,620,'system');}
  playRadioMessage(){
    this.ensure();if(Date.now()-this.lastRadio<550)return;this.lastRadio=Date.now();
    const pitch=clamp(Number(this.soundIdentity?.commandPitch)||1,.85,1.2);
    this._metalClack(.18,100*pitch,1280*pitch,'system');
    // Brief keying/operator activity: an acknowledgement of a copied signal,
    // never a continuous score and never triggered by an unreceived message.
    for(const [i,d] of [0,72,160,232].entries())setTimeout(()=>this._noise(.028,(720+i*42)*pitch,'sine',.022,null,0,'command'),d);
    setTimeout(()=>this._metalClack(.12,96*pitch,980*pitch,'system'),315);
  }
  playBattleStations(){
    this.ensure();if(Date.now()-this.lastBattleStations<1800)return;this.lastBattleStations=Date.now();if(!this.ctx||!this.enabled)return;const ctx=this.ctx,now=ctx.currentTime;
    // Short electro-mechanical klaxon: an inharmonic motor/body pair, uneven
    // rise and a little housing rattle. No clean two-note computer beep.
    this._filteredNoise(.78,.045,{type:'bandpass',freq:310,q:2.1,attack:.018},null,0,'command');
    for(const [f0,f1,v] of [[151,166,.052],[287,271,.019]]){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(f0,now);o.frequency.linearRampToValueAtTime(f1,now+.53);g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(v,now+.055);g.gain.setValueAtTime(v*.82,now+.34);g.gain.exponentialRampToValueAtTime(.001,now+.76);o.connect(g);g.connect(this._bus('command'));o.start();o.stop(now+.80);}this.duck(82,820);
  }

  stopTitleCue(fade=.24){
    if(!this.ctx||!this.titleCueGain)return false;const now=this.ctx.currentTime,g=this.titleCueGain;
    try{g.gain.cancelScheduledValues(now);g.gain.setValueAtTime(Math.max(.0001,g.gain.value||1),now);g.gain.exponentialRampToValueAtTime(.001,now+Math.max(.05,fade));}catch(_){ }
    this.titleCueGain=null;return true;
  }

  playTitleCue(kind='START'){
    this.ensure();if(!this.ctx||!this.enabled||this.musicVolume<=0)return false;
    if(kind==='START'&&this.titleStartPlayed)return false;
    if(kind==='START')this.titleStartPlayed=true;
    this.stopTitleCue(.06);const ctx=this.ctx,now=ctx.currentTime,dur=kind==='COMPLETE'?4.2:5.4,cue=ctx.createGain();cue.gain.value=1;cue.connect(this.musicGain);this.titleCueGain=cue;
    // Short original low-brass identity only; no melody and no external assets.
    // Procedural brass is intentionally used sparingly because natural brass
    // articulation is the least convincing category without recorded samples.
    const chord=kind==='COMPLETE'?[73.42,110,146.83]:[65.41,98,130.81,155.56];
    for(const f0 of chord){for(const [h,w] of [[1,.034],[2,.021],[3,.013],[4,.007]]){const o=ctx.createOscillator(),g=ctx.createGain(),lp=ctx.createBiquadFilter();o.type='sawtooth';o.frequency.value=f0*h;lp.type='lowpass';lp.frequency.value=1450;g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(w,now+.045);g.gain.setValueAtTime(w,now+.72);g.gain.exponentialRampToValueAtTime(.001,now+dur);o.connect(lp);lp.connect(g);g.connect(cue);o.start();o.stop(now+dur+.08);}}
    setTimeout(()=>{if(this.titleCueGain===cue)this.titleCueGain=null;},(dur+.15)*1000);return true;
  }

  event(type,opts={}){
    this.ensure();
    const key=String(type||'').toUpperCase();
    switch(key){
      case'SAVE_CONFIRMED':case'RESUME_CONFIRMED':case'TUTORIAL_STEP':return this.playUiConfirm(.22);
      case'WAYPOINT_REACHED':return this.playWaypoint();
      case'RADIO_MESSAGE':return this.playRadioMessage();
      case'HARBOR_REACHED':return this.playUiConfirm(.42);
      case'MISSION_START':return this.stopTitleCue(.28);
      case'PRIMARY_OBJECTIVE_COMPLETE':return this.playUiConfirm(.46);
      case'MISSION_FAILED':return this._metalClack(.34,78,390,'mission');
      case'PATROL_COMPLETE':case'MISSION_COMPLETE':return this.playTitleCue('COMPLETE');
      case'AIRCRAFT_SPOTTED':case'AIRCRAFT_ATTACK':case'SUB_DETECTED':case'SEARCHLIGHT_CONTACT':return this.playBattleStations();
      case'DEPTH_CHARGE_SPLASH':return this.playDepthChargeSplash(opts.distanceFactor??.5);
      default:return this.playUiConfirm(.18);
    }
  }

  debugPlay(name,opts={}){
    const key=String(name||'').toUpperCase();
    if(key==='SONAR')return this.playSonarPing(opts.bearing??null,opts.heading??0,opts.variant??this.sonarVariant);
    if(key==='OWN_SONAR')return this._playSelfDecaySonar(null,0,opts.variant??this.sonarVariant,true);
    if(key==='DEPTH_FAR')return this.playDepthCharge(.92);if(key==='DEPTH_MEDIUM')return this.playDepthCharge(.55);if(key==='DEPTH_NEAR')return this.playDepthCharge(.05);if(key==='DEPTH_SPLASH')return this.playDepthChargeSplash(.25);
    if(key==='TUBE_FLOOD')return this.playTubeFlood();if(key==='TUBE_READY')return this.playTubeReady();if(key==='TDC')return this.playTdcSolution();if(key==='STATION')return this.playStationSwitch();
    if(key==='SCOPE_EXTEND')return this.playPeriscopeMove('extend');if(key==='SCOPE_RETRACT')return this.playPeriscopeMove('retract');if(key==='MINE')return this.playMineStrike();if(key==='AIR_BOMB')return this.playAirBomb(.3);if(key==='TORPEDO_HIT')return this.playTorpedoHit();if(key==='TITLE')return this.playTitleCue('START');if(key==='BATTLE_STATIONS')return this.playBattleStations();
    throw new Error(`Unknown audio review sound: ${name}`);
  }

  audioStats(){return{initialized:this.initialized,context:this.ctx?.state||'none',enabled:this.enabled,sonarVariant:this.sonarVariant,sfxVolume:this.sfxVolume,musicVolume:this.musicVolume,sampleRate:this.ctx?.sampleRate||null,sharedNoiseBufferSeconds:this.noiseBuffer?this.noiseBuffer.length/this.noiseBuffer.sampleRate:0,busMix:{...this.mixTargets},duckUntilMs:Math.max(0,(this.duckUntil||0)-performance.now()),lastEnemyPingAgeMs:this.lastEnemyPingAt?performance.now()-this.lastEnemyPingAt:null,nearbyEscort:this.escortMachinery?{id:this.escortMachinery.id,rangeNm:this.escortMachinery.rangeNm}:null};}

  playDistantGunfire(bearingDeg=null,ownHeading=0,strength=.5){
    this.ensure();const v=clamp(strength,.08,.8);this._noise(.055,64,'sawtooth',.26*v,bearingDeg,ownHeading,'weapons');
    setTimeout(()=>this._white(.22,.15*v,bearingDeg,ownHeading,'weapons'),28);
  }

  playShellPass(bearingDeg=null,ownHeading=0){
    this.ensure();this._white(.34,.18,bearingDeg,ownHeading,'weapons');setTimeout(()=>this._noise(.22,190,'sine',.08,bearingDeg,ownHeading,'weapons'),30);
  }

  playShellSplash(distanceFactor=.5){this.ensure();const v=clamp(.28*(1-distanceFactor*.65),.05,.28);this._white(.32,v,null,0,'weapons');setTimeout(()=>this._noise(.5,52,'sine',v*.55,null,0,'weapons'),20);}
  playShellImpact(bearingDeg=null,ownHeading=0,power=1){this.ensure();const v=clamp(power,.2,1);this.duck(88,420);this._noise(.08,52,'sawtooth',.55*v,bearingDeg,ownHeading,'weapons');setTimeout(()=>this._white(.8,.38*v,bearingDeg,ownHeading,'weapons'),20);}
  playDeckGunImpact(distanceFactor=.5){
    this.ensure();if(!this.ctx||!this.enabled)return;
    // Fall-of-shot is deliberately range-scaled. A distant hit is a small dark
    // crack/thump, not the same close explosion merely played at full volume.
    const d=clamp(Number(distanceFactor)||0,0,1),v=clamp(.34*(1-d*.76),.055,.34);
    this._filteredNoise(.055,.42*v,{type:'bandpass',freq:420,q:.48,attack:.001},null,0,'weapons');
    this._filteredNoise(.46,.78*v,{type:'lowpass',freq:170,q:.55,attack:.004},null,0,'weapons');
  }
  playCreak(){this.ensure();this._noise(.55,86,'sine',.09,null,0,'machinery');setTimeout(()=>this._noise(.7,54,'sine',.055,null,0,'machinery'),180);}

  _ensureBattleLoops(){
    if(!this.ctx||this.battleNoiseSource)return;
    // All procedural broadband layers share the engine's single noise buffer.
    const src=this._noiseSource(999);
    const seaF=this.ctx.createBiquadFilter(),windF=this.ctx.createBiquadFilter(),rainF=this.ctx.createBiquadFilter(),harborF=this.ctx.createBiquadFilter(),seaG=this.ctx.createGain(),windG=this.ctx.createGain(),rainG=this.ctx.createGain(),harborG=this.ctx.createGain();
    seaF.type='lowpass';seaF.frequency.value=700;windF.type='bandpass';windF.frequency.value=940;windF.Q.value=.32;rainF.type='highpass';rainF.frequency.value=1100;harborF.type='bandpass';harborF.frequency.value=310;harborF.Q.value=1.1;seaG.gain.value=0;windG.gain.value=0;rainG.gain.value=0;harborG.gain.value=0;
    for(const [f,g] of [[seaF,seaG],[windF,windG],[rainF,rainG],[harborF,harborG]]){src.connect(f);f.connect(g);g.connect(this._bus('world'));}src.start();
    this.battleNoiseSource=src;this.seaGain=seaG;this.windGain=windG;this.rainGain=rainG;this.harborGain=harborG;
    const harborOsc=ctx.createOscillator(),hog=ctx.createGain();harborOsc.type='triangle';harborOsc.frequency.value=24;hog.gain.value=0;harborOsc.connect(hog);hog.connect(this._bus('world'));harborOsc.start();this.harborOsc=harborOsc;this.harborOscGain=hog;
    // One reusable diesel voice. A triangle through a dark low-pass reads as a
    // heavy low-speed engine rather than an electronic saw wave, while remaining
    // far cheaper than a looping sample on low-end Android hardware.
    const diesel=this.ctx.createOscillator(),df=this.ctx.createBiquadFilter(),dg=this.ctx.createGain();
    diesel.type='triangle';diesel.frequency.value=28;df.type='lowpass';df.frequency.value=220;df.Q.value=.42;dg.gain.value=0;
    diesel.connect(df);df.connect(dg);dg.connect(this._bus('machinery'));diesel.start();this.dieselOsc=diesel;this.dieselFilter=df;this.dieselGain=dg;
  }

  _setTorpedoMonitor(state){
    if(!this.ctx)return;const s=state,sub=s.playerSub,active=(s.weapons?.activeTorpedoes||[]).filter(t=>t.status==='RUNNING');
    let best=null,br=0,rng=99;for(const t of active){const r=distNm(sub.position,t.position);if(r<rng){rng=r;best=t;br=bearingBetween(sub.position,t.position);}}
    const on=s.tactical?.activeStation==='SOUND'&&sub.depthFeet>8&&best&&rng<6;
    if(on&&!this.torpedoOsc){
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sawtooth';o.frequency.value=235;g.gain.value=0;o.connect(g);
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();g.connect(p);p.connect(this._bus('sensor'));this.torpedoPan=p;}else g.connect(this._bus('sensor'));
      o.start();this.torpedoOsc=o;this.torpedoGain=g;
    }
    if(this.torpedoGain){const now=this.ctx.currentTime,target=on?clamp(.004+(1-rng/6)*.035,.004,.04):0;this.torpedoGain.gain.setTargetAtTime(target,now,.12);this.torpedoOsc.frequency.setTargetAtTime(210+(best?.speedKnots||40)*1.3,now,.15);if(this.torpedoPan)this.torpedoPan.pan.setTargetAtTime(clamp(Math.sin(degToRad(shortDelta(sub.heading,br))),-1,1),now,.1);}
  }

  _ensureEscortMachinery(){
    if(!this.ctx||this.escortMachinery)return this.escortMachinery;const ctx=this.ctx,out=ctx.createGain();out.gain.value=0;
    const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){out.connect(pan);pan.connect(this._bus('sensor'));}else out.connect(this._bus('sensor'));
    const mech=ctx.createOscillator(),mg=ctx.createGain();mech.type='triangle';mech.frequency.value=55;mg.gain.value=0;mech.connect(mg);mg.connect(out);mech.start();
    const whine=ctx.createOscillator(),wg=ctx.createGain();whine.type='triangle';whine.frequency.value=650;wg.gain.value=0;whine.connect(wg);wg.connect(out);whine.start();
    const ns=this._noiseSource(999),nf=ctx.createBiquadFilter(),ng=ctx.createGain();nf.type='bandpass';nf.frequency.value=900;nf.Q.value=.62;ng.gain.value=0;ns.connect(nf);nf.connect(ng);ng.connect(out);ns.start(0,Math.random()*1.5);
    this.escortMachinery={out,pan,mech,mg,whine,wg,noise:ns,filter:nf,ng,id:null,rangeNm:null};return this.escortMachinery;
  }

  _setNearbyEscortMachinery(state){
    if(!this.ctx||!state)return;const sub=state.playerSub,now=this.ctx.currentTime,E=this._ensureEscortMachinery();let best=null,bestR=Infinity;
    if((sub.depthFeet||0)>8){for(const c of state.world?.contacts||[]){const kind=String(c?.type||'').toUpperCase(),asw=(typeof isASWCombatant==='function'?isASWCombatant(c):/DESTROYER|ESCORT|PATROL|KAIBOKAN/.test(kind));if(!asw||c.sunk||!c.position)continue;const r=distNm(sub.position,c.position);if(r<bestR){best=c;bestR=r;}}}
    const on=best&&bestR<1.55;if(!on){E.out.gain.setTargetAtTime(0,now,.28);E.rangeNm=null;return;}
    const speed=clamp(Number(best.speedKnots)||0,0,35),rpm=clamp(speed/24,0,1.25),near=clamp(1-bestR/1.55,0,1),cad=.65+speed*.15;
    // The same fixed node set moves continuously from slow heavy machinery to
    // the higher mechanical/cavitation scream of an attacking destroyer. Actual
    // contact speed and range drive it; there is no extra audio-only AI state.
    E.mech.frequency.setTargetAtTime(42+cad*20,now,.18);E.whine.frequency.setTargetAtTime(430+cad*390,now,.22);E.filter.frequency.setTargetAtTime(520+cad*360,now,.24);
    E.mg.gain.setTargetAtTime(.24+rpm*.12,now,.20);E.wg.gain.setTargetAtTime(.015+Math.pow(rpm,1.7)*.18,now,.25);E.ng.gain.setTargetAtTime(.012+Math.pow(rpm,1.6)*.14,now,.28);
    E.out.gain.setTargetAtTime((.006+near*near*.105)*(speed<.8?.25:1),now,.24);if(E.pan){const br=bearingBetween(sub.position,best.position),rel=shortDelta(sub.heading||0,br);E.pan.pan.setTargetAtTime(clamp(Math.sin(degToRad(rel))*.22,-.22,.22),now,.22);}E.id=best.id;E.rangeNm=bestR;
  }

  setBattleAmbience(state){
    this.ensure();if(!this.ctx||!state)return;this._ensureBattleLoops();const sub=state.playerSub,env=state.world.environment||{},sta=state.tactical?.activeStation||'TACTICAL',now=this.ctx.currentTime;
    const outside=(sta==='BRIDGE'||sta==='DECK_GUN')&&sub.depthFeet<10,internalSurface=!outside&&sub.depthFeet<10,submerged=sub.depthFeet>=10,sea=clamp(env.seaState||0,0,1),rain=clamp(env.precipitation||0,0,1),wind=clamp(Number(env.windSpeedKnots||env.windKnots)||sea*28,0,45)/45;
    // SCOPE is an optical outside view but an acoustic inside-the-pressure-hull
    // perspective. Never let rain/wind turn the periscope into an open bridge.
    const seaLevel=outside?(.006+sea*.028):(internalSurface?(.0015+sea*.004):0),windLevel=outside?(.002+wind*.022):(internalSurface?wind*.002:0),rainLevel=outside?rain*.038:(internalSurface?rain*.001:0);
    this.seaGain?.gain.setTargetAtTime(seaLevel,now,.5);this.windGain?.gain.setTargetAtTime(windLevel,now,.55);this.rainGain?.gain.setTargetAtTime(rainLevel,now,.4);
    const H=state.world?.harbor,hr=H?.center?distNm(sub.position,H.center):Infinity,harborNear=clamp(1-hr/4.2,0,1),harborAudible=sub.depthFeet<10&&harborNear>0;
    const harborPerspective=outside?1:(internalSurface?.22:0);
    this.harborGain?.gain.setTargetAtTime(harborAudible*harborPerspective*(.002+harborNear*.013),now,.75);
    this.harborOscGain?.gain.setTargetAtTime(harborAudible*harborPerspective*(.001+harborNear*.008),now,.85);
    this.harborOsc?.frequency.setTargetAtTime(21+harborNear*11,now,.9);
    const diesel=sub.propulsion?.engineMode==='DIESEL'&&sub.depthFeet<10;
    const rpm=clamp((Number(sub.propulsion?.actualRpm)||0)/450,0,1);
    // Surface diesels should dominate the own-boat machinery bed. The slower
    // gain/frequency response gives the big engines audible inertia without
    // changing simulation acceleration or AI noise calculations.
    const identity=this._soundProfile(state);this.soundIdentity=identity;
    const dieselLevel=(diesel?(outside?(.015+rpm*.036):(.010+rpm*.026)):0)*clamp(Number(identity.dieselLevel)||1,.7,1.25);
    if(this.dieselGain)this.dieselGain.gain.setTargetAtTime(dieselLevel,now,.72);
    if(this.dieselOsc)this.dieselOsc.frequency.setTargetAtTime((25.5+clamp(sub.propulsion.actualRpm||0,0,maxRpm)/maxRpm*23.4)*clamp(Number(identity.dieselPitch)||1,.8,1.25),now,.62);
    if(this.dieselFilter)this.dieselFilter.frequency.setTargetAtTime(150+rpm*115,now,.70);
    const wall=Date.now();if(sub.depthFeet>170&&wall-this.lastCreak>clamp(12000-sub.depthFeet*14,4500,10000)){this.lastCreak=wall;this.playCreak();}
    this._setTorpedoMonitor(state);this._setNearbyEscortMachinery(state);
  }


  _aircraftAudioProfile(a){
    const name=String(a?.name||'').toUpperCase(),kind=String(a?.kind||'').toUpperCase();
    // The exact engine note is intentionally impressionistic: the useful cues
    // are mass, propeller blade-pass and multiple engines beating against one
    // another. Keeping profiles data-driven lets future aircraft reuse this
    // engine without adding samples or bespoke audio code.
    if(name.includes('PBY')||name.includes('CATALINA'))return{key:'PBY',engines:2,rpm:2050,blades:3,weight:1.10,dark:.88};
    if(name.includes('TYPE 97')||name.includes('H6K'))return{key:'H6K',engines:4,rpm:2180,blades:3,weight:1.22,dark:.84};
    if(kind==='FLYING_BOAT')return{key:'FLYING_BOAT',engines:4,rpm:2100,blades:3,weight:1.18,dark:.86};
    if(kind==='FIGHTER')return{key:'FIGHTER',engines:1,rpm:2450,blades:3,weight:.90,dark:.96};
    if(kind==='FLOATPLANE')return{key:'FLOATPLANE',engines:1,rpm:2250,blades:3,weight:.96,dark:.92};
    return{key:'SINGLE_RADIAL',engines:1,rpm:2300,blades:3,weight:1.02,dark:.90};
  }

  _stopAircraftFlyby(){
    const F=this.airFlyby;if(!F)return;
    const now=this.ctx?.currentTime||0;
    try{F.gain?.gain.setTargetAtTime(0,now,.08);}catch(_){}
    // Let the short fade complete before stopping. Creating/stopping happens
    // only on aircraft/family changes, never every render frame.
    setTimeout(()=>{for(const o of F.oscs||[])try{o.stop();}catch(_){}},180);
    this.airFlyby=null;
  }

  _startAircraftFlyby(a,profile){
    if(!this.ctx||!this.masterGain)return null;
    const ctx=this.ctx,out=ctx.createGain(),filter=ctx.createBiquadFilter();
    filter.type='lowpass';filter.Q.value=.48;filter.frequency.value=650;
    out.gain.value=0;filter.connect(out);
    const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
    if(pan){out.connect(pan);pan.connect(this._bus('world'));}else out.connect(this._bus('world'));
    const oscs=[];
    const add=(type,freq,gain)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.value=gain;
      o.connect(g);g.connect(filter);o.start();oscs.push(o);return o;
    };
    const rev=profile.rpm/60,blade=rev*profile.blades;
    // Low radial-engine throb + blade-pass. Multi-engine aircraft get one cheap
    // blade voice per engine with deliberately tiny RPM offsets. Their natural
    // interference produces the characteristic slow beating without samples,
    // convolution or an LFO network.
    const rumble=add('sawtooth',rev*.78,.34*profile.weight);
    const offsets=profile.engines===4?[-.010,-.0035,.004,.011]:profile.engines===2?[-.0075,.0075]:[0];
    const props=offsets.map((d)=>add('triangle',blade*(1+d),(.32/Math.sqrt(profile.engines))*profile.weight));
    const harmonic=add('sine',blade*2.02,.055*profile.weight);
    const F={id:a.id,key:profile.key,profile,gain:out,filter,pan,oscs,rumble,props,harmonic,baseRev:rev,baseBlade:blade};
    this.airFlyby=F;return F;
  }

  updateAircraftFlyby(state){
    this.ensure();if(!this.ctx||!this.enabled||!state)return;
    const ctx=this.ctx,now=ctx.currentTime;
    // 10–12 control updates per second are ample because AudioParams interpolate
    // smoothly. This avoids dozens of WebAudio parameter writes per render frame.
    if(now-this.airFlybyLastUpdate<.085)return;this.airFlybyLastUpdate=now;
    const sub=state.playerSub,sta=state.tactical?.activeStation||'TACTICAL';
    const stationOK=(sta==='BRIDGE'||sta==='DECK_GUN')&&(sub.depthFeet||0)<10;
    let best=null,bestR=Infinity;
    if(stationOK){for(const a of state.world?.aircraft||[]){
      if(a.shotDown||!a.seenBySub||a.state==='DEPARTING'||!a.position)continue;
      const r=distNm(sub.position,a.position);if(r<bestR&&r<2.6){best=a;bestR=r;}
    }}
    if(!best){if(this.airFlyby){this.airFlyby.gain.gain.setTargetAtTime(0,now,.12);}return;}
    const profile=this._aircraftAudioProfile(best);
    let F=this.airFlyby;
    if(!F||F.id!==best.id||F.key!==profile.key){this._stopAircraftFlyby();F=this._startAircraftFlyby(best,profile);}
    if(!F)return;
    const brg=bearingBetween(sub.position,best.position),rel=shortDelta(sub.heading||0,brg);
    const pan=clamp(Math.sin(degToRad(rel)),-.92,.92);if(F.pan)F.pan.pan.setTargetAtTime(pan,now,.07);
    // Radial velocity: positive while the aircraft is closing. A restrained
    // acoustic Doppler factor is enough to sell the pass without cartoon pitch.
    const hr=degToRad(best.heading||0),toSub=degToRad(normDeg(brg+180));
    const aircraftMps=(best.speedKnots||150)*.514444;
    const radial=aircraftMps*Math.cos(hr-toSub); // + = moving toward listener
    const dop=clamp(343/(343-radial),.90,1.12);
    const rev=F.baseRev*dop,blade=F.baseBlade*dop;
    F.rumble.frequency.setTargetAtTime(rev*.78,now,.06);
    const offsets=profile.engines===4?[-.010,-.0035,.004,.011]:profile.engines===2?[-.0075,.0075]:[0];
    F.props.forEach((o,i)=>o.frequency.setTargetAtTime(blade*(1+(offsets[i]||0)),now,.055));
    F.harmonic.frequency.setTargetAtTime(blade*2.02,now,.06);
    const near=clamp(1-bestR/2.6,0,1),close=clamp(1-bestR/.65,0,1);
    // V2 tonal balance: dark and comparatively smooth, but the close pass is
    // lifted several dB over the original preview so a low aircraft has physical
    // presence without competing with alarms, gunfire or depth-charge impacts.
    const level=clamp((.006+near*near*.100+close*.105)*profile.weight,0,.225);
    F.gain.gain.setTargetAtTime(level,now,.07);
    F.filter.frequency.setTargetAtTime((390+near*720+close*850)*profile.dark,now,.10);
  }

  playCrashDive(){
    this.ensure();this.playBattleStations();this._filteredNoise(.55,.095,{type:'lowpass',freq:360,q:.45,attack:.018},null,0,'command');
  }

  playAlarm(){return this.playBattleStations();}
  playDive(){this.ensure();this._filteredNoise(.42,.075,{type:'lowpass',freq:420,q:.45,attack:.035},null,0,'command');setTimeout(()=>this._noise(.72,48,'sine',.10,null,0,'machinery'),80);}
  playSurface(){this.ensure();this._noise(.58,72,'sine',.10,null,0,'machinery');setTimeout(()=>this._filteredNoise(.48,.065,{type:'lowpass',freq:520,q:.45,attack:.08},null,0,'world'),180);}
  playMissionComplete(){return this.event('MISSION_COMPLETE');}

  /* SOUND room monitor: deliberately small and continuously parameterised.
     The contact model already supplies strength/cadence, so audio never invents
     a hidden target. Slow cadence is heavy machinery; fast cadence adds the
     higher mechanical/cavitation 'scream' approved in Phase 2. */
  setHydrophoneMonitor(strength,cadenceHz=1.2,offsetDeg=0){
    this.ensure();if(!this.ctx||!this.enabled)return;
    const s=clamp(Number(strength)||0,0,1);if(s<.008){this.stopHydrophoneMonitor();return;}
    if(!this.hydroCarrier){
      const ctx=this.ctx,carrier=ctx.createOscillator(),gain=ctx.createGain(),whine=ctx.createOscillator(),wg=ctx.createGain(),lfo=ctx.createOscillator(),mod=ctx.createGain();
      carrier.type='triangle';carrier.frequency.value=48;gain.gain.value=0;whine.type='triangle';whine.frequency.value=620;wg.gain.value=0;lfo.type='sine';lfo.frequency.value=1.2;mod.gain.value=.004;
      carrier.connect(gain);gain.connect(this._bus('sensor'));whine.connect(wg);wg.connect(this._bus('sensor'));lfo.connect(mod);mod.connect(gain.gain);
      const ns=this._noiseSource(999),nf=ctx.createBiquadFilter(),ng=ctx.createGain();nf.type='bandpass';nf.frequency.value=900;nf.Q.value=.75;ng.gain.value=0;ns.connect(nf);nf.connect(ng);ng.connect(this._bus('sensor'));
      carrier.start();whine.start();lfo.start();ns.start(0,Math.random()*1.4);this.hydroCarrier=carrier;this.hydroGain=gain;this.hydroWhine=whine;this.hydroWhineGain=wg;this.hydroLfo=lfo;this.hydroMod=mod;this.hydroNoiseSource=ns;this.hydroNoiseFilter=nf;this.hydroNoiseGain=ng;
    }
    const now=this.ctx.currentTime,cad=clamp(cadenceHz,.55,3.4),centre=1-clamp(Math.abs(offsetDeg||0)/18,0,.85),fast=clamp((cad-.9)/2.5,0,1),level=s*centre;
    this.hydroCarrier.frequency.setTargetAtTime(42+cad*18,now,.10);
    this.hydroLfo.frequency.setTargetAtTime(cad,now,.08);
    this.hydroWhine.frequency.setTargetAtTime(480+cad*390,now,.12);
    this.hydroNoiseFilter.frequency.setTargetAtTime(520+cad*330,now,.15);
    this.hydroGain.gain.setTargetAtTime(.0025+level*.025,now,.12);
    this.hydroMod.gain.setTargetAtTime(.0015+level*.0045,now,.10);
    this.hydroWhineGain.gain.setTargetAtTime(level*(.0015+fast*.024),now,.15);
    this.hydroNoiseGain.gain.setTargetAtTime(level*(.001+fast*.012),now,.18);
  }

  stopHydrophoneMonitor(){
    if(!this.hydroCarrier)return;
    try{this.hydroCarrier.stop();this.hydroWhine?.stop();this.hydroLfo?.stop();this.hydroNoiseSource?.stop();}catch(_){}
    this.hydroCarrier=null;this.hydroGain=null;this.hydroWhine=null;this.hydroWhineGain=null;this.hydroLfo=null;this.hydroMod=null;this.hydroNoiseSource=null;this.hydroNoiseFilter=null;this.hydroNoiseGain=null;
  }

  playOwnSonarPing(){this.ensure();if(!this.ctx||!this.enabled)return;this._playSelfDecaySonar(null,0,this.sonarVariant,true,1);}

  setSfxVolume(v){this.sfxVolume=clamp(Number(v)||0,0,1);if(this.masterGain&&this.ctx)this.masterGain.gain.setTargetAtTime(this.enabled?this.sfxVolume:0,this.ctx.currentTime,.04);return this.sfxVolume;}
  setMusicVolume(v){this.musicVolume=clamp(Number(v)||0,0,1);if(this.musicGain&&this.ctx)this.musicGain.gain.setTargetAtTime(this.enabled?this.musicVolume:0,this.ctx.currentTime,.04);return this.musicVolume;}
  toggle(){this.enabled=!this.enabled;if(this.masterGain)this.masterGain.gain.value=this.enabled?this.sfxVolume:0;if(this.musicGain)this.musicGain.gain.value=this.enabled?this.musicVolume:0;return this.enabled;}
}

const audio=new AudioEngine();
