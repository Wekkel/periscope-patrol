// ═══════════════════════════════════════════════════ AUDIO ENGINE
class AudioEngine{
  constructor(){this.ctx=null;this.enabled=true;this.masterGain=null;this.initialized=false;
    this.lastPing=0;this.lastDC=0;this.lastLaunch=0;this.lastCreak=0;
    this.battleNoiseSource=null;this.seaGain=null;this.rainGain=null;this.dieselOsc=null;this.dieselGain=null;this.torpedoOsc=null;this.torpedoGain=null;this.torpedoPan=null;
    // Aircraft fly-by is a deliberately tiny procedural engine. Only the nearest
    // visible aircraft in BRIDGE/GUN gets voices; this avoids turning ambient
    // sound into another sensor and keeps oscillator count bounded on G88-class
    // hardware. Nodes are reused while the aircraft/family stays the same.
    this.airFlyby=null;this.airFlybyLastUpdate=0;}

  init(){
    if(this.initialized)return;
    try{
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();
      this.masterGain=this.ctx.createGain();
      this.masterGain.gain.value=0.45;
      this.masterGain.connect(this.ctx.destination);
      this.initialized=true;
      this.startAmbient();
    }catch(e){this.enabled=false;}
  }

  ensure(){
    if(!this.initialized)this.init();
    if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();
  }

  startAmbient(){
    if(!this.ctx)return;
    const osc=this.ctx.createOscillator();
    const gain=this.ctx.createGain();
    const filt=this.ctx.createBiquadFilter();
    filt.type='lowpass';filt.frequency.value=100;
    osc.type='sawtooth';osc.frequency.value=38;
    gain.gain.value=0.012;
    osc.connect(filt);filt.connect(gain);gain.connect(this.masterGain);
    osc.start();this.ambientOsc=osc;this.ambientGain=gain;
  }

  setAmbient(depthFt,silent){
    if(!this.ambientGain||!this.ctx)return;
    const v=silent?0.006:0.014;
    this.ambientGain.gain.setTargetAtTime(v*(depthFt>50?1.4:1),this.ctx.currentTime,0.5);
    if(this.ambientOsc) this.ambientOsc.frequency.setTargetAtTime(38+depthFt*0.04,this.ctx.currentTime,1);
  }

  _route(node,bearingDeg=null,ownHeading=0){
    if(!node||!this.masterGain)return null;
    if(Number.isFinite(bearingDeg)&&this.ctx?.createStereoPanner){
      const p=this.ctx.createStereoPanner();p.pan.value=clamp(Math.sin(degToRad(shortDelta(ownHeading||0,bearingDeg))),-1,1);node.connect(p);p.connect(this.masterGain);return p;
    }
    node.connect(this.masterGain);return null;
  }

  _noise(dur,freq,type,vol,bearingDeg=null,ownHeading=0){
    if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
    f.type='bandpass';f.frequency.value=freq;f.Q.value=1.5;
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    o.connect(f);f.connect(g);this._route(g,bearingDeg,ownHeading);
    o.start();o.stop(this.ctx.currentTime+dur+0.05);
  }

  _white(dur,vol,bearingDeg=null,ownHeading=0){
    if(!this.ctx||!this.enabled)return;
    const sr=this.ctx.sampleRate;
    const buf=this.ctx.createBuffer(1,Math.max(1,Math.floor(sr*dur)),sr);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
    f.type='bandpass';f.frequency.value=300;f.Q.value=0.5;
    s.buffer=buf;g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    s.connect(f);f.connect(g);this._route(g,bearingDeg,ownHeading);
    s.start();s.stop(this.ctx.currentTime+dur);
  }

  playTorpedoLaunch(){
    this.ensure();if(Date.now()-this.lastLaunch<400)return;this.lastLaunch=Date.now();
    this._white(0.15,0.4);
    setTimeout(()=>this._noise(0.6,80,'sine',0.35),80);
    setTimeout(()=>this._noise(0.4,40,'sine',0.2),200);
  }

  playDepthCharge(dist=1){
    this.ensure();if(Date.now()-this.lastDC<300)return;this.lastDC=Date.now();
    const v=Math.max(0.04,0.8*(1-dist*0.8));
    this._noise(0.08,60,'sawtooth',v);
    setTimeout(()=>this._white(1.2,v*0.6),40);
    setTimeout(()=>this._noise(2.0,30,'sine',v*0.7),70);
    if(dist<0.5) for(let i=0;i<4;i++) setTimeout(()=>this._noise(0.1,120+Math.random()*80,'square',v*0.3),200+i*80);
  }

  playHit(){
    this.ensure();
    this._noise(0.1,80,'sawtooth',0.9);
    setTimeout(()=>this._white(2.0,0.7),50);
    setTimeout(()=>this._noise(3.0,25,'sine',0.6),100);
    setTimeout(()=>this._noise(1.5,55,'sawtooth',0.4),400);
  }

  playDud(){this.ensure();this._noise(0.3,120,'sine',0.25);setTimeout(()=>this._noise(0.2,80,'sine',0.15),150);}

  playDeckGun(power=1){
    this.ensure();const v=clamp(power,0.2,1);this._noise(0.055,72,'sawtooth',0.55*v);
    setTimeout(()=>this._white(0.18,0.42*v),18);setTimeout(()=>this._noise(0.42,36,'sine',0.30*v),45);
  }

  playSonarPing(bearingDeg=null,ownHeading=0){
    this.ensure();if(Date.now()-this.lastPing<1000)return;this.lastPing=Date.now();
    if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(1200,this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(800,this.ctx.currentTime+0.8);
    g.gain.setValueAtTime(0.35,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+1.2);
    o.connect(g);this._route(g,bearingDeg,ownHeading);o.start();o.stop(this.ctx.currentTime+1.3);
    const ping=document.getElementById('sonarPing');
    if(ping){ping.classList.remove('ping');void ping.offsetWidth;ping.classList.add('ping');}
  }


  playDistantGunfire(bearingDeg=null,ownHeading=0,strength=.5){
    this.ensure();const v=clamp(strength,.08,.8);this._noise(.055,64,'sawtooth',.26*v,bearingDeg,ownHeading);
    setTimeout(()=>this._white(.22,.15*v,bearingDeg,ownHeading),28);
  }

  playShellPass(bearingDeg=null,ownHeading=0){
    this.ensure();this._white(.34,.18,bearingDeg,ownHeading);setTimeout(()=>this._noise(.22,190,'sine',.08,bearingDeg,ownHeading),30);
  }

  playShellSplash(distanceFactor=.5){this.ensure();const v=clamp(.28*(1-distanceFactor*.65),.05,.28);this._white(.32,v);setTimeout(()=>this._noise(.5,52,'sine',v*.55),20);}
  playShellImpact(bearingDeg=null,ownHeading=0,power=1){this.ensure();const v=clamp(power,.2,1);this._noise(.08,52,'sawtooth',.55*v,bearingDeg,ownHeading);setTimeout(()=>this._white(.8,.38*v,bearingDeg,ownHeading),20);}
  playCreak(){this.ensure();this._noise(.55,86,'sine',.09);setTimeout(()=>this._noise(.7,54,'sine',.055),180);}

  _ensureBattleLoops(){
    if(!this.ctx||this.battleNoiseSource)return;
    const sr=this.ctx.sampleRate,buf=this.ctx.createBuffer(1,sr,sr),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource();src.buffer=buf;src.loop=true;
    const seaF=this.ctx.createBiquadFilter(),rainF=this.ctx.createBiquadFilter(),seaG=this.ctx.createGain(),rainG=this.ctx.createGain();
    seaF.type='lowpass';seaF.frequency.value=700;rainF.type='highpass';rainF.frequency.value=1100;seaG.gain.value=0;rainG.gain.value=0;
    src.connect(seaF);seaF.connect(seaG);seaG.connect(this.masterGain);src.connect(rainF);rainF.connect(rainG);rainG.connect(this.masterGain);src.start();
    this.battleNoiseSource=src;this.seaGain=seaG;this.rainGain=rainG;
    const diesel=this.ctx.createOscillator(),dg=this.ctx.createGain();diesel.type='sawtooth';diesel.frequency.value=32;dg.gain.value=0;diesel.connect(dg);dg.connect(this.masterGain);diesel.start();this.dieselOsc=diesel;this.dieselGain=dg;
  }

  _setTorpedoMonitor(state){
    if(!this.ctx)return;const s=state,sub=s.playerSub,active=(s.weapons?.activeTorpedoes||[]).filter(t=>t.status==='RUNNING');
    let best=null,br=0,rng=99;for(const t of active){const r=distNm(sub.position,t.position);if(r<rng){rng=r;best=t;br=bearingBetween(sub.position,t.position);}}
    const on=s.tactical?.activeStation==='SOUND'&&sub.depthFeet>8&&best&&rng<6;
    if(on&&!this.torpedoOsc){
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sawtooth';o.frequency.value=235;g.gain.value=0;o.connect(g);
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();g.connect(p);p.connect(this.masterGain);this.torpedoPan=p;}else g.connect(this.masterGain);
      o.start();this.torpedoOsc=o;this.torpedoGain=g;
    }
    if(this.torpedoGain){const now=this.ctx.currentTime,target=on?clamp(.004+(1-rng/6)*.035,.004,.04):0;this.torpedoGain.gain.setTargetAtTime(target,now,.12);this.torpedoOsc.frequency.setTargetAtTime(210+(best?.speedKnots||40)*1.3,now,.15);if(this.torpedoPan)this.torpedoPan.pan.setTargetAtTime(clamp(Math.sin(degToRad(shortDelta(sub.heading,br))),-1,1),now,.1);}
  }

  setBattleAmbience(state){
    this.ensure();if(!this.ctx||!state)return;this._ensureBattleLoops();const sub=state.playerSub,env=state.world.environment||{},sta=state.tactical?.activeStation||'TACTICAL',now=this.ctx.currentTime;
    const outside=(sta==='BRIDGE'||sta==='DECK_GUN'||sta==='PERISCOPE')&&sub.depthFeet<75,sea=clamp(env.seaState||0,0,1),rain=clamp(env.precipitation||0,0,1);
    this.seaGain?.gain.setTargetAtTime(outside?.006+sea*.028:.0015+sea*.003,now,.5);this.rainGain?.gain.setTargetAtTime(outside?rain*.038:rain*.006,now,.4);
    const diesel=outside&&sub.propulsion?.engineMode==='DIESEL'&&sub.depthFeet<12;if(this.dieselGain)this.dieselGain.gain.setTargetAtTime(diesel?.006+clamp(sub.propulsion.actualRpm/450,0,1)*.018:0,now,.35);if(this.dieselOsc)this.dieselOsc.frequency.setTargetAtTime(28+clamp(sub.propulsion.actualRpm||0,0,450)*.045,now,.35);
    const wall=Date.now();if(sub.depthFeet>170&&wall-this.lastCreak>clamp(12000-sub.depthFeet*14,4500,10000)){this.lastCreak=wall;this.playCreak();}
    this._setTorpedoMonitor(state);
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
    if(pan){out.connect(pan);pan.connect(this.masterGain);}else out.connect(this.masterGain);
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
    this.ensure();
    [440,550,440,550,440].forEach((f,i)=>setTimeout(()=>this._noise(0.18,f,'square',0.28),i*160));
    setTimeout(()=>this._white(0.4,0.14),850);
  }

  playAlarm(){this.ensure();this._noise(0.2,660,'square',0.22);setTimeout(()=>this._noise(0.2,880,'square',0.18),260);}
  playDive(){this.ensure();this._white(0.5,0.1);setTimeout(()=>this._noise(1.0,50,'sine',0.18),100);}
  playSurface(){this.ensure();this._noise(0.8,80,'sine',0.16);setTimeout(()=>this._white(0.6,0.1),300);}
  playWaypoint(){this.ensure();this._noise(0.1,880,'sine',0.14);setTimeout(()=>this._noise(0.1,1100,'sine',0.11),120);}
  playMissionComplete(){this.ensure();[523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._noise(0.3,f,'sine',0.2),i*150));}

  /* SOUND room monitor: two oscillators only, created while the player is
     actually listening.  This keeps the low-end-device cost negligible. */
  setHydrophoneMonitor(strength,cadenceHz=1.2,offsetDeg=0){
    this.ensure();if(!this.ctx||!this.enabled)return;
    const s=clamp(Number(strength)||0,0,1);if(s<.008){this.stopHydrophoneMonitor();return;}
    if(!this.hydroCarrier){
      const carrier=this.ctx.createOscillator(),gain=this.ctx.createGain(),lfo=this.ctx.createOscillator(),mod=this.ctx.createGain();
      carrier.type='sawtooth';carrier.frequency.value=72;gain.gain.value=0;
      lfo.type='sine';lfo.frequency.value=1.2;mod.gain.value=.012;
      carrier.connect(gain);gain.connect(this.masterGain);lfo.connect(mod);mod.connect(gain.gain);
      carrier.start();lfo.start();this.hydroCarrier=carrier;this.hydroGain=gain;this.hydroLfo=lfo;this.hydroMod=mod;
    }
    const now=this.ctx.currentTime,centre=1-clamp(Math.abs(offsetDeg||0)/18,0,.85);
    this.hydroCarrier.frequency.setTargetAtTime(58+clamp(cadenceHz,.5,3.5)*13,now,.08);
    this.hydroLfo.frequency.setTargetAtTime(clamp(cadenceHz,.55,3.4),now,.08);
    this.hydroGain.gain.setTargetAtTime(.004+s*.040*centre,now,.10);
    this.hydroMod.gain.setTargetAtTime(.002+s*.012,now,.10);
  }

  stopHydrophoneMonitor(){
    if(!this.hydroCarrier)return;
    try{this.hydroCarrier.stop();this.hydroLfo?.stop();}catch(_){}
    this.hydroCarrier=null;this.hydroGain=null;this.hydroLfo=null;this.hydroMod=null;
  }

  playOwnSonarPing(){
    this.ensure();if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';
    o.frequency.setValueAtTime(1450,this.ctx.currentTime);o.frequency.exponentialRampToValueAtTime(980,this.ctx.currentTime+.42);
    g.gain.setValueAtTime(.48,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+.65);
    o.connect(g);g.connect(this.masterGain);o.start();o.stop(this.ctx.currentTime+.7);
  }

  toggle(){this.enabled=!this.enabled;if(this.masterGain)this.masterGain.gain.value=this.enabled?0.45:0;return this.enabled;}
}

const audio=new AudioEngine();

