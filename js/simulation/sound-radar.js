// ═══════════════════════════════════════════════════ SOUND ROOM + RADAR
// Patch 3 keeps this deliberately skipper-level.  The operator works the gear
// continuously; visiting SOUND merely lets the player squeeze more information
// from the same passive bearings.  No subsystem here is required to progress.
const SOUND_ROOM={
  maxPassiveNm:18,
  markConeDeg:16,
  qcMaxRangeNm:5.5,
  qcCooldownSec:8,
  operatorMinQuality:.16,
  operatorReportMinSec:34,
  sjSweepSec:2.0
};

function _soundDateNumber(date){
  const m=String(date||'1943-08-17').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?(+m[1])*10000+(+m[2])*100+(+m[3]):19430817;
}

/* Broad fleet-fit progression rather than per-hull paperwork.  SD reached the
   force first; SJ followed during 1942.  Late-war SJ can be worked at radar
   depth with the extensible mast. */
function radarFitForDate(date){
  const d=_soundDateNumber(date);
  return{
    sd:d>=19420401,
    sj:d>=19420701,
    sjRadarDepthFt:d>=19440101?48:12,
    label:d<19420401?'NO RADAR FIT':d<19420701?'SD AIR WARNING':'SD + SJ'
  };
}

function _soundHashUnit(seed,text,tag=0){
  let h=((Number(seed)||1)*2654435761+tag*1597334677)>>>0;
  const s=String(text||'');
  for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619)>>>0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967295;
}

function soundOwnNoiseFactor(state){
  const sub=state.playerSub,spd=Math.max(0,sub.propulsion.speedKnots||0);
  const speed=1/(1+Math.pow(spd/5.0,2));
  const pumps=sub.damage?.pumpActive?.82:1;
  const surface=sub.depthFeet<8?clamp(1-(state.world.environment.seaState||0)*.35,.48,1):1;
  return clamp(speed*pumps*surface,.055,1);
}

function soundBaseQuality(state,contact){
  if(!contact||contact.sunk||contact.stationary)return 0;
  const sub=state.playerSub,env=state.world.environment,rng=distNm(sub.position,contact.position);
  if(rng>SOUND_ROOM.maxPassiveNm)return 0;
  const machinery=clamp((contact.acousticBase||.18)+Math.pow((contact.speedKnots||0)/18,2)*.78,.08,1.25);
  const range=1/(1+Math.pow(rng/7.2,1.55));
  const wx=weatherBetween(state,sub.position,contact.position);
  const sea=clamp(1-(wx.seaState||0)*.33,.52,1);
  const depth=sub.depthFeet>20?1:sub.depthFeet>5?.78:.62;
  return clamp(machinery*range*sea*depth*soundOwnNoiseFactor(state)*wx.hydrophoneFactor,0,1);
}

function soundSignalAt(state,bearingDeg){
  let best=null,bestStrength=0,bestBase=0,bestOff=180;
  for(const c of state.world.contacts||[]){
    const base=soundBaseQuality(state,c);if(base<=.015)continue;
    const trueBearing=bearingBetween(state.playerSub.position,c.position);
    const off=Math.abs(shortDelta(bearingDeg,trueBearing));
    // JT/QC directionality is intentionally broad enough to sweep quickly,
    // with a weak shoulder so the player can hear which way to train.
    const angular=.035+.965*Math.exp(-.5*Math.pow(off/7.5,2));
    const strength=base*angular;
    if(strength>bestStrength){best=c;bestStrength=strength;bestBase=base;bestOff=off;}
  }
  if(!best)return{contact:null,strength:0,baseQuality:0,offsetDeg:180,cadenceHz:0};
  return{contact:best,strength:clamp(bestStrength,0,1),baseQuality:bestBase,offsetDeg:bestOff,
    cadenceHz:clamp(.7+(best.speedKnots||0)*.11,.7,3.1)};
}

function passiveSoundObservation(state,contact,quality){
  const sub=state.playerSub,seed=state.campaign?.scenarioSeed||1,bucket=Math.floor((state.time?.elapsedSeconds||0)/20);
  const q=clamp(Number(quality)||soundBaseQuality(state,contact),.02,1),spd=sub.propulsion.speedKnots||0;
  const bErrMax=1.2+(1-q)*10+spd*.28;
  const rErrMax=.10+(1-q)*.34+clamp(spd/18,0,1)*.12;
  const tag=`${contact.id}:${bucket}`;
  const bearing=normDeg(bearingBetween(sub.position,contact.position)+(_soundHashUnit(seed,tag,21)*2-1)*bErrMax);
  const trueRange=distNm(sub.position,contact.position),rangeNm=Math.max(.08,trueRange*(1+(_soundHashUnit(seed,tag,22)*2-1)*rErrMax));
  const r=degToRad(bearing);
  return{bearing,rangeNm,position:{xNm:sub.position.xNm+Math.sin(r)*rangeNm,yNm:sub.position.yNm-Math.cos(r)*rangeNm},
    bearingErrorMaxDeg:bErrMax,rangeErrorMaxPct:rErrMax};
}

function _bearingRayIntersection(a,b){
  const d1={x:Math.sin(degToRad(a.bearing)),y:-Math.cos(degToRad(a.bearing))};
  const d2={x:Math.sin(degToRad(b.bearing)),y:-Math.cos(degToRad(b.bearing))};
  const rx=b.own.xNm-a.own.xNm,ry=b.own.yNm-a.own.yNm,den=d1.x*d2.y-d1.y*d2.x;
  if(Math.abs(den)<.025)return null;
  const t=(rx*d2.y-ry*d2.x)/den,u=(rx*d1.y-ry*d1.x)/den;
  if(t<=0||u<=0||t>35||u>35)return null;
  return{xNm:a.own.xNm+d1.x*t,yNm:a.own.yNm+d1.y*t};
}

function triangulateSoundMarks(marks){
  const m=(marks||[]).slice(-4),pts=[];
  for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){
    const p=_bearingRayIntersection(m[i],m[j]);if(p)pts.push(p);
  }
  if(!pts.length)return null;
  const p={xNm:pts.reduce((s,x)=>s+x.xNm,0)/pts.length,yNm:pts.reduce((s,x)=>s+x.yNm,0)/pts.length};
  const spread=pts.reduce((s,x)=>s+distNm(p,x),0)/pts.length;
  return{position:p,spreadNm:spread,pairs:pts.length};
}

function radarObservation(state,contact){
  const seed=state.campaign?.scenarioSeed||1,bucket=Math.floor((state.time?.elapsedSeconds||0)/SOUND_ROOM.sjSweepSec),tag=`SJ:${contact.id}:${bucket}`;
  const trueB=bearingBetween(state.playerSub.position,contact.position),trueR=distNm(state.playerSub.position,contact.position);
  const b=trueB+(_soundHashUnit(seed,tag,31)*2-1)*.28,r=trueR*(1+(_soundHashUnit(seed,tag,32)*2-1)*.008);
  const br=degToRad(b);
  return{bearing:normDeg(b),rangeNm:r,position:{xNm:state.playerSub.position.xNm+Math.sin(br)*r,yNm:state.playerSub.position.yNm-Math.cos(br)*r}};
}

class SimEngineSoundRadar extends SimEngineSensors{
  ensureTacticalExtensions(){
    const T=super.ensureTacticalExtensions();
    if(!Number.isFinite(T.soundBearing))T.soundBearing=this.state.playerSub?.heading||0;
    if(!['PASSIVE','RADAR'].includes(T.soundDisplay))T.soundDisplay='PASSIVE';
    return T;
  }

  ensureWorldExtensions(){super.ensureWorldExtensions();this.ensureSoundRadarState();}

  ensureSoundRadarState(){
    const W=this.state.world,fit=radarFitForDate(this.state.campaign?.startDate||this.state.time?.campaignDate);
    const S=W.sound||(W.sound={});
    S.bearingMarks=S.bearingMarks||{};S.lastOperatorAt=Number.isFinite(S.lastOperatorAt)?S.lastOperatorAt:-999;
    S.lastOperatorReport=S.lastOperatorReport||null;S.qcLastAt=Number.isFinite(S.qcLastAt)?S.qcLastAt:-999;
    S._tick=Number.isFinite(S._tick)?S._tick:0;
    const R=W.radar||(W.radar={});
    R.sdAvailable=fit.sd;R.sjAvailable=fit.sj;R.sjRadarDepthFt=fit.sjRadarDepthFt;R.fitLabel=fit.label;
    R.sjTracks=R.sjTracks||{};R._tick=Number.isFinite(R._tick)?R._tick:0;R.lastSweepAt=Number.isFinite(R.lastSweepAt)?R.lastSweepAt:-999;
    W.airThreat=W.airThreat||{};W.airThreat.sdOn=!!fit.sd;
    return{S,R,fit};
  }

  currentSoundSignal(){this.ensureSoundRadarState();return soundSignalAt(this.state,this.state.tactical.soundBearing);}

  _soundOperatorReport(){
    const s=this.state,W=s.world,S=W.sound,now=s.time.elapsedSeconds;
    let best=null,q=0;
    for(const c of W.contacts||[]){const x=soundBaseQuality(s,c);if(x>q){q=x;best=c;}}
    if(!best||q<SOUND_ROOM.operatorMinQuality)return;
    const min=SOUND_ROOM.operatorReportMinSec+(1-q)*25;if(now-S.lastOperatorAt<min)return;
    const obs=passiveSoundObservation(s,best,q),near=(W.contacts||[]).filter(c=>c!==best&&!c.sunk&&!c.stationary&&soundBaseQuality(s,c)>.12&&Math.abs(shortDelta(obs.bearing,bearingBetween(s.playerSub.position,c.position)))<28);
    let detail;
    if((best.speedKnots||0)>14||best.type==='ESCORT')detail='High-speed screws — probable escort.';
    else if(near.length)detail='Multiple screws. Slow cadence.';
    else detail=(best.speedKnots||0)>9?'Steady screws. Moderate cadence.':'Slow screws. Heavy cadence.';
    const text=`SOUND — screws bearing ${fmtDeg(obs.bearing)} · ${detail}`;
    S.lastOperatorAt=now;S.lastOperatorReport={t:now,until:now+7,text,bearing:obs.bearing,quality:q};
    this.log(text); // intentionally not notify(): operator chatter must not interrupt play
  }

  markSoundBearing(){
    this.ensureSoundRadarState();
    const s=this.state,W=s.world,S=W.sound,now=s.time.elapsedSeconds,sig=this.currentSoundSignal();
    if(!sig.contact||sig.strength<.055||sig.offsetDeg>SOUND_ROOM.markConeDeg){this.notify('SOUND — no bearing sharp enough to mark. Train through the strongest screws first.','warn');return null;}
    const c=sig.contact,q=clamp(sig.baseQuality*(.78+.22*Math.min(1,sig.strength/.25)),.04,1),seed=s.campaign.scenarioSeed||1;
    const errMax=.35+(1-q)*5.4+(s.playerSub.propulsion.speedKnots||0)*.18,tag=`MARK:${c.id}:${Math.floor(now/4)}`;
    const bearing=normDeg(bearingBetween(s.playerSub.position,c.position)+(_soundHashUnit(seed,tag,41)*2-1)*errMax);
    const mark={t:now,own:{...s.playerSub.position},bearing,quality:q};
    const arr=S.bearingMarks[c.id]||(S.bearingMarks[c.id]=[]);arr.push(mark);if(arr.length>8)arr.splice(0,arr.length-8);
    let tr=W.contactTracks[c.id];
    if(!tr){const o=passiveSoundObservation(s,c,q);tr={id:c.id,typeEstimate:'UNKNOWN',bearing:o.bearing,rangeEstimateNm:o.rangeNm,courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:.18,source:'HYDROPHONE',lastUpdated:now,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards,plotPosition:{...o.position},lastFixPosition:{...o.position},lastFixTime:now};W.contactTracks[c.id]=tr;}
    tr.soundBearingMarks=arr.slice(-4);tr.bearing=bearing;tr.lastUpdated=now;tr.staleSeconds=0;tr.confidence=clamp(Math.max(tr.confidence||0,.18)+.07,0,.92);tr.source='SOUND BEARING';
    const tri=triangulateSoundMarks(arr.filter(m=>now-m.t<420));
    if(tri&&arr.length>=2){
      tr.plotPosition={...tri.position};tr.lastFixPosition={...tri.position};tr.lastFixTime=now;tr.rangeEstimateNm=distNm(s.playerSub.position,tri.position);tr.bearing=bearingBetween(s.playerSub.position,tri.position);tr.soundUncertaintyNm=clamp(.12+tri.spreadNm,.12,3);tr.source='SOUND TRIANGULATION';tr.confidence=clamp(tr.confidence+.08*Math.min(3,arr.length-1),0,.94);
    }
    this.log(`SOUND mark ${arr.length} — ${fmtDeg(bearing)}${tri?` · plot cross ${tr.rangeEstimateNm.toFixed(1)} nm`:''}.`);
    return tr;
  }

  echoRange(){
    this.ensureSoundRadarState();const s=this.state,W=s.world,S=W.sound,now=s.time.elapsedSeconds;
    if(now-S.qcLastAt<SOUND_ROOM.qcCooldownSec){this.notify(`QC recharging — ${Math.ceil(SOUND_ROOM.qcCooldownSec-(now-S.qcLastAt))} seconds.`,'warn');return null;}
    S.qcLastAt=now;audio.playOwnSonarPing?.();
    // The transmission itself is a datum for enemy hydrophones, whether or not
    // the player's echo comes back.
    this.alertEscorts('ACTIVE_QC',{...s.playerSub.position},.88);
    const sig=this.currentSoundSignal(),c=sig.contact;
    if(!c||sig.offsetDeg>24||distNm(s.playerSub.position,c.position)>SOUND_ROOM.qcMaxRangeNm){this.notify('QC — NO USEFUL ECHO. Every hydrophone in the area heard that transmission.','bad');return null;}
    const seed=s.campaign.scenarioSeed||1,tag=`QC:${c.id}:${Math.floor(now/3)}`,trueR=distNm(s.playerSub.position,c.position),rangeNm=trueR*(1+(_soundHashUnit(seed,tag,51)*2-1)*.018);
    const bearing=normDeg(s.tactical.soundBearing+clamp(shortDelta(s.tactical.soundBearing,bearingBetween(s.playerSub.position,c.position)),-4,4));
    const br=degToRad(bearing),pos={xNm:s.playerSub.position.xNm+Math.sin(br)*rangeNm,yNm:s.playerSub.position.yNm-Math.cos(br)*rangeNm};
    let tr=W.contactTracks[c.id]||{id:c.id,typeEstimate:'UNKNOWN',courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,contactType:c.type,lengthYards:c.lengthYards};
    Object.assign(tr,{bearing,rangeEstimateNm:rangeNm,plotPosition:pos,lastFixPosition:{...pos},lastFixTime:now,lastUpdated:now,staleSeconds:0,confidence:clamp(Math.max(tr.confidence||0,.72),0,1),source:'QC ECHO'});
    W.contactTracks[c.id]=tr;this.notify(`QC — ECHO RANGE ${rangeNm.toFixed(2)} nm on ${fmtDeg(bearing)}. Transmission heard by the enemy.`,'bad');return tr;
  }

  _updateSJRadar(dt){
    const s=this.state,W=s.world,R=W.radar,sub=s.playerSub,now=s.time.elapsedSeconds;
    R._tick+=dt;if(R._tick<SOUND_ROOM.sjSweepSec)return;R._tick=0;
    const usable=R.sjAvailable&&sub.depthFeet<=R.sjRadarDepthFt&&sub.mode!=='SUNK';
    R.active=!!usable;if(!usable){R.sjTracks={};return;}
    R.lastSweepAt=now;const seen={};
    for(const c of W.contacts||[]){
      if(c.sunk)continue;const rng=distNm(sub.position,c.position),size=c.lengthYards||400;
      const max=clamp(4.5+size/500*1.8+(c.type==='ESCORT'?.5:0),4.7,7.2);if(rng>max)continue;
      const o=radarObservation(s,c);seen[c.id]={id:c.id,bearing:o.bearing,rangeNm:o.rangeNm,position:o.position,t:now,strength:clamp(1-rng/max,.15,1)};
      const old=W.contactTracks[c.id],known=old?.source==='VISUAL'&&old.confidence>.6;
      const tr=old||{id:c.id,typeEstimate:'SURFACE SHIP',courseEstimate:c.heading,speedEstimateKnots:c.speedKnots,confidence:0,contactType:'UNKNOWN',lengthYards:c.lengthYards};
      Object.assign(tr,{bearing:o.bearing,rangeEstimateNm:o.rangeNm,plotPosition:{...o.position},lastFixPosition:{...o.position},lastFixTime:now,lastUpdated:now,staleSeconds:0,confidence:clamp(Math.max(tr.confidence||0,.70)+.035,0,.92),source:'SJ RADAR'});
      if(!known){tr.typeEstimate=tr.typeEstimate==='UNKNOWN'?'SURFACE SHIP':tr.typeEstimate;tr.contactType=tr.contactType||'UNKNOWN';}
      W.contactTracks[c.id]=tr;
    }
    R.sjTracks=seen;
  }

  updateSoundRadar(dt){
    this.ensureSoundRadarState();const s=this.state,S=s.world.sound;
    S._tick+=dt;if(S._tick>=.25){S._tick=0;this._soundOperatorReport();
      if(s.tactical.activeStation==='SOUND'&&s.tactical.soundDisplay==='PASSIVE'){
        const sig=this.currentSoundSignal();S.monitor={strength:sig.strength,offsetDeg:sig.offsetDeg,cadenceHz:sig.cadenceHz,id:sig.contact?.id||null};audio.setHydrophoneMonitor?.(sig.strength,sig.cadenceHz,sig.offsetDeg);
      }else{S.monitor={strength:0,offsetDeg:180,cadenceHz:0,id:null};audio.stopHydrophoneMonitor?.();}
    }
    this._updateSJRadar(dt);
  }
}
