// ═══════════════════════════════════════════════════ WEATHER SYSTEM
// Weather is spatial and slow-moving. A patrol carries at most a few compact
// squall cells; they move across the chart for hours and are sampled by the
// existing visual/acoustic/weapon systems. No per-frame particle simulation.
const WEATHER_SYSTEM_VERSION=1;
const WEATHER_STAGES=Object.freeze(['CLEAR','OVERCAST','BUILDING CLOUD','SQUALL','HEAVY RAIN','CLEARING']);

function _weatherNorthAtlantic(state){
  return state?.world?.environment?.climateId==='NORTH_ATLANTIC_1941';
}

function _weatherHash(seed,tag){
  let h=((Number(seed)||1)*2654435761)>>>0,s=String(tag||'');
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967295;
}
function _weatherBase(state){
  const env=state.world.environment;
  if(!Number.isFinite(env._weatherBaseVisibilityNm)) env._weatherBaseVisibilityNm=Number(env._baseVisibilityNm||env.visibilityNm)||12;
  if(!Number.isFinite(env._baseVisibilityNm)) env._baseVisibilityNm=env._weatherBaseVisibilityNm;
  if(!Number.isFinite(env._weatherBaseSeaState)) env._weatherBaseSeaState=clamp(Number(env.seaState)||.25,0,1);
  return env;
}
function _weatherCellInfluence(cell,pos){
  if(!cell||!pos)return 0;
  const d=distNm(cell.center,pos),r=Math.max(.8,cell.radiusNm||5);
  if(d>=r)return 0;
  const x=1-d/r;
  // Smooth core with a broad outer cloud band.
  return clamp(x*x*(3-2*x),0,1);
}
function _weatherClosing(cell,pos){
  const h=degToRad(cell.heading||0),vx=Math.sin(h),vy=-Math.cos(h);
  const dx=pos.xNm-cell.center.xNm,dy=pos.yNm-cell.center.yNm;
  return vx*dx+vy*dy>=0;
}
function _weatherStage(intensity,closing=true){
  if(intensity<.10)return 'CLEAR';
  if(intensity<.34)return closing?'BUILDING CLOUD':'CLEARING';
  if(intensity<.68)return 'SQUALL';
  return 'HEAVY RAIN';
}
function weatherMoonIllumination(state){
  const raw=String(state?.time?.campaignDate||state?.campaign?.startDate||'1943-08-17').slice(0,10);
  const d=new Date(raw+'T00:00:00Z');
  if(!Number.isFinite(d.getTime()))return .55;
  // Gameplay approximation: stable 29.53-day lunar cycle. Absolute epoch only
  // needs consistency, not an astronomy package.
  const days=d.getTime()/86400000,phase=((days-6.0)%29.53059+29.53059)%29.53059/29.53059;
  return clamp((1-Math.cos(phase*Math.PI*2))/2,.03,1);
}
function weatherAtPosition(state,pos){
  const env=_weatherBase(state),W=state.world,sys=W.weatherSystem;
  let intensity=0,cell=null;
  if(sys&&Array.isArray(sys.cells))for(const c of sys.cells){const q=_weatherCellInfluence(c,pos);if(q>intensity){intensity=q;cell=c;}}
  const atlantic=_weatherNorthAtlantic(state),closing=cell?_weatherClosing(cell,pos):true;
  let stage=_weatherStage(intensity,closing);
  // The 1941 North Atlantic slice has a low overcast background even between
  // moving fronts. Do not let weather initialization turn it into Pacific-like
  // clear sky merely because the nearest front is still over the horizon.
  if(atlantic&&intensity<.10)stage='OVERCAST';
  const baseSea=env._weatherBaseSeaState;
  const authoredBaseCloud=atlantic?.62:0;
  const authoredBaseRain=atlantic?.025:0;
  const cloud=clamp(Math.max(authoredBaseCloud,(stage==='CLEAR'?0.10:stage==='OVERCAST'?0.62:stage==='BUILDING CLOUD'?0.42:stage==='CLEARING'?0.32:stage==='SQUALL'?0.72:0.96)+intensity*.12),0,1);
  const precipitation=Math.max(authoredBaseRain,stage==='HEAVY RAIN'?clamp(.72+intensity*.28,0,1):stage==='SQUALL'?clamp(.22+intensity*.48,0,1):stage==='CLEARING'?intensity*.10:0);
  const seaState=clamp(baseSea+intensity*(atlantic?.36:.46)+(stage==='HEAVY RAIN'?.08:0),0,1);
  const visualFactor=clamp((atlantic?.92:1)-intensity*.76-precipitation*.12,.12,1);
  const moon=weatherMoonIllumination(state),moonFactor=clamp((.38+.62*moon)*(1-cloud*.68),.12,1);
  const day=clamp(env.daylight??.7,0,1),lightFactor=day>.08?(.28+.72*day):(.18+.20*moonFactor);
  const visibilityNm=Math.max(.35,env._weatherBaseVisibilityNm*lightFactor*visualFactor);
  return{stage,intensity,cloudCover:cloud,precipitation,seaState,visualFactor,visibilityNm,
    aircraftFactor:clamp(1-intensity*.68-precipitation*.18,.16,1),
    aircraftAttackFactor:clamp(1-intensity*.55-precipitation*.22,.18,1),
    searchlightFactor:clamp(1-intensity*.72-precipitation*.18,.12,1),
    deckGunDispersionFactor:1+seaState*.42+precipitation*.55,
    hydrophoneFactor:clamp(1-intensity*.12-precipitation*.08,.78,1),
    subVisualFactor:clamp(1-intensity*.58-precipitation*.18,.20,1),moonFactor,cell};
}
function weatherBetween(state,a,b){
  const mid={xNm:(a.xNm+b.xNm)/2,yNm:(a.yNm+b.yNm)/2};
  const q=[weatherAtPosition(state,a),weatherAtPosition(state,mid),weatherAtPosition(state,b)];
  return q.reduce((worst,x)=>x.visibilityNm<worst.visibilityNm?x:worst,q[0]);
}
function weatherVisibilityBetween(state,a,b){return weatherBetween(state,a,b).visibilityNm;}
function weatherIsWet(wx){return wx==='SQUALL'||wx==='HEAVY RAIN'||wx==='RAIN'||wx==='STORM';}

class SimEngineWeather extends SimEngineSoundRadar{
  ensureWeatherSystem(fresh=false){
    const W=this.state.world,env=_weatherBase(this.state),now=this.state.time.elapsedSeconds||0;
    let S=W.weatherSystem;
    if(!S||S.version!==WEATHER_SYSTEM_VERSION||fresh){
      const atlantic=_weatherNorthAtlantic(this.state);
      S=W.weatherSystem={version:WEATHER_SYSTEM_VERSION,cells:[],seq:0,nextCellAt:now+(atlantic?3900:5400),
        tickAcc:0,lastLocalIntensity:0,lastLocalStage:atlantic?'OVERCAST':'CLEAR',lastStageLogAt:-999};
      // One distant cell puts weather in motion without forcing an immediate
      // storm on every new patrol. North Atlantic cells are broader frontal
      // systems, but the count remains capped at three for low-spec devices.
      this._spawnWeatherCell(atlantic?9:(/OVERCAST|ROUGH|RAIN|STORM/i.test(String(env.weather||''))?8:15));
      this._syncLocalWeather(true);
    }
    S.cells=Array.isArray(S.cells)?S.cells:[];
    if(!Number.isFinite(S.nextCellAt))S.nextCellAt=now+5400;
    return S;
  }
  _spawnWeatherCell(startNm=16){
    const S=this.state.world.weatherSystem,sub=this.state.playerSub,seed=this.state.campaign?.scenarioSeed||1,n=++S.seq;
    const bearing=360*_weatherHash(seed,`wx:${n}:bearing`),jitter=(_weatherHash(seed,`wx:${n}:jitter`)-.5)*6;
    const r=degToRad(bearing),d=startNm+_weatherHash(seed,`wx:${n}:range`)*9;
    const center={xNm:sub.position.xNm+Math.sin(r)*d,yNm:sub.position.yNm-Math.cos(r)*d};
    const aim={xNm:sub.position.xNm+jitter,yNm:sub.position.yNm+jitter*.4};
    const atlantic=_weatherNorthAtlantic(this.state);
    S.cells.push({id:`WX-${n}`,center,heading:bearingBetween(center,aim),
      speedKnots:(atlantic?12:9)+_weatherHash(seed,`wx:${n}:speed`)*(atlantic?8:8),
      radiusNm:(atlantic?7.5:5.0)+_weatherHash(seed,`wx:${n}:radius`)*(atlantic?4.8:3.2),
      bornAt:this.state.time.elapsedSeconds||0,lifeSec:(atlantic?18000:13500)+_weatherHash(seed,`wx:${n}:life`)*(atlantic?10800:7200)});
    if(S.cells.length>3)S.cells.shift();
  }
  _syncLocalWeather(force=false){
    const env=_weatherBase(this.state),S=this.state.world.weatherSystem,sub=this.state.playerSub,q=weatherAtPosition(this.state,sub.position);
    env.weather=q.stage;env.weatherIntensity=q.intensity;env.cloudCover=q.cloudCover;env.precipitation=q.precipitation;
    env.seaState=q.seaState;env.visibilityNm=q.visibilityNm;env.moonIllumination=weatherMoonIllumination(this.state);
    const prev=S.lastLocalStage;
    if((force||prev!==q.stage)&&q.stage!==prev){
      const now=this.state.time.elapsedSeconds||0;
      if(now-(S.lastStageLogAt||-999)>60){
        const text=q.stage==='OVERCAST'?'Low Atlantic overcast — broken horizons and grey light.'
          :q.stage==='BUILDING CLOUD'?'Weather building — low cloud and a dark line on the horizon.'
          :q.stage==='SQUALL'?'Squall line crossing the patrol area — visibility falling.'
          :q.stage==='HEAVY RAIN'?'Heavy rain — visibility down hard; gun and air work degraded.'
          :q.stage==='CLEARING'?'Weather clearing astern — visibility improving.'
          :'Skies opening — clear weather returning.';
        this.log(text);S.lastStageLogAt=now;
      }
    }
    S.lastLocalIntensity=q.intensity;S.lastLocalStage=q.stage;S.local=q;
    return q;
  }
  updateWeather(dt){
    const S=this.ensureWeatherSystem();S.tickAcc=(S.tickAcc||0)+dt;if(S.tickAcc<5)return;
    const step=S.tickAcc;S.tickAcc=0;const now=this.state.time.elapsedSeconds||0,sub=this.state.playerSub;
    for(const c of S.cells){const d=knotsNmSec(c.speedKnots||12)*step,h=degToRad(c.heading||0);c.center.xNm+=Math.sin(h)*d;c.center.yNm-=Math.cos(h)*d;}
    S.cells=S.cells.filter(c=>now-(c.bornAt||0)<(c.lifeSec||18000)&&distNm(c.center,sub.position)<55);
    if(now>=S.nextCellAt){const atlantic=_weatherNorthAtlantic(this.state);this._spawnWeatherCell(atlantic?14:18);S.nextCellAt=now+(atlantic?4800:7200)+_weatherHash(this.state.campaign?.scenarioSeed||1,`next:${S.seq}`)*(atlantic?3600:5400);}
    this._syncLocalWeather(false);
  }
}
