// ═══════════════════════════════════════════════════ AUDIO ENGINE
class AudioEngine{
  constructor(){this.ctx=null;this.enabled=true;this.masterGain=null;this.initialized=false;
    this.lastPing=0;this.lastDC=0;this.lastLaunch=0;}

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

  _noise(dur,freq,type,vol){
    if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
    f.type='bandpass';f.frequency.value=freq;f.Q.value=1.5;
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    o.connect(f);f.connect(g);g.connect(this.masterGain);
    o.start();o.stop(this.ctx.currentTime+dur+0.05);
  }

  _white(dur,vol){
    if(!this.ctx||!this.enabled)return;
    const sr=this.ctx.sampleRate;
    const buf=this.ctx.createBuffer(1,sr*dur,sr);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
    f.type='bandpass';f.frequency.value=300;f.Q.value=0.5;
    s.buffer=buf;g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    s.connect(f);f.connect(g);g.connect(this.masterGain);
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

  playSonarPing(){
    this.ensure();if(Date.now()-this.lastPing<1000)return;this.lastPing=Date.now();
    if(!this.ctx||!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(1200,this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(800,this.ctx.currentTime+0.8);
    g.gain.setValueAtTime(0.35,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+1.2);
    o.connect(g);g.connect(this.masterGain);o.start();o.stop(this.ctx.currentTime+1.3);
    const ping=document.getElementById('sonarPing');
    if(ping){ping.classList.remove('ping');void ping.offsetWidth;ping.classList.add('ping');}
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

  toggle(){this.enabled=!this.enabled;if(this.masterGain)this.masterGain.gain.value=this.enabled?0.45:0;return this.enabled;}
}

const audio=new AudioEngine();

