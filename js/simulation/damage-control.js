// ═══════════════════════════════════════════════════ SUBSYSTEM DAMAGE / DAMAGE CONTROL
// Phase 3 deliberately keeps the boat understandable: four added subsystem
// damage values, one repair priority, and a handful of persistent casualties.
// World damage remains continuous (0..1); repair parties merely decide where
// the scarce repair capacity goes first.
const REPAIR_PRIORITIES=['FLOODING','PROPULSION','STEERING','OPTICS_FIRE_CONTROL'];
const REPAIR_PRIORITY_LABELS={
  FLOODING:'FLOODING',PROPULSION:'PROPULSION',STEERING:'STEERING',OPTICS_FIRE_CONTROL:'OPTICS / FIRE CONTROL'
};

function _damageSeedUnit(seed,tag){
  // Stateless deterministic pseudo-random value. Same patrol seed + tag gives
  // the same bias/casualty direction every time, including after save/load.
  const x=Math.sin((Number(seed)||1)*12.9898+(Number(tag)||0)*78.233)*43758.5453123;
  return x-Math.floor(x);
}
function _damageSigned(seed,tag){return _damageSeedUnit(seed,tag)*2-1;}
function damageBiasesFor(state){
  const d=state?.playerSub?.damage||{}, seed=state?.campaign?.scenarioSeed||1;
  return{
    scopeBearingDeg:_damageSigned(seed,101)*2.4*clamp(d.periscopeDamage||0,0,1),
    scopeRangePct:_damageSigned(seed,102)*0.085*clamp(d.periscopeDamage||0,0,1),
    tdcBearingDeg:_damageSigned(seed,103)*1.8*clamp(d.tdcDamage||0,0,1),
    tdcRangePct:_damageSigned(seed,104)*0.055*clamp(d.tdcDamage||0,0,1),
    tdcCourseDeg:_damageSigned(seed,105)*2.2*clamp(d.tdcDamage||0,0,1),
    tdcSpeedKnots:_damageSigned(seed,106)*1.4*clamp(d.tdcDamage||0,0,1),
    gyroDeg:_damageSigned(seed,107)*3.2*clamp(d.gyroDamage||0,0,1),
    ballastTrimFps:_damageSigned(seed,108)*0.42*clamp(d.ballastDamage||0,0,1)
  };
}
function scopeMeasuredBearing(state,trueBearing){
  return normDeg((trueBearing||0)+damageBiasesFor(state).scopeBearingDeg);
}
function scopeMeasuredRangeNm(state,trueRangeNm){
  return Math.max(0,(trueRangeNm||0)*(1+damageBiasesFor(state).scopeRangePct));
}
function repairPriorityLabel(priority){return REPAIR_PRIORITY_LABELS[priority]||REPAIR_PRIORITY_LABELS.FLOODING;}
function scopeOpticProfile(damage){
  const d=clamp(Number(damage)||0,0,1);
  return{damage:d,unusable:d>=.92,blurPx:d<.28?0:clamp((d-.28)*4.6,0,3.1),
    contrast:clamp(1-d*.42,.55,1),haze:clamp(d*.30,0,.30),
    scratches:d<.07?0:Math.round(3+d*11),distortion:d<.42?0:clamp((d-.42)*.9,0,.52)};
}

class SimEngineDamage extends SimEngineCollision {
  ensureWorldExtensions(){
    super.ensureWorldExtensions();
    this.ensureDamageState();
  }

  ensureDamageState(){
    const sub=this.state.playerSub,d=sub.damage||(sub.damage={});
    const nums=['tdcDamage','gyroDamage','pumpDamage','electricalDamage'];
    for(const k of nums) if(!Number.isFinite(d[k])) d[k]=0;
    if(!REPAIR_PRIORITIES.includes(d.repairPriority)) d.repairPriority='FLOODING';
    if(d.driveBankOffline===undefined)d.driveBankOffline=false;
    if(d.pumpTripped===undefined)d.pumpTripped=false;
    if(!Number.isFinite(d.pumpLoadSec))d.pumpLoadSec=0;
    if(!Number.isFinite(d.damageEventSeq))d.damageEventSeq=0;
    d.repairFloor=d.repairFloor||{};
    const repairable=['ballastDamage','motorDamage','rudderDamage','periscopeDamage','tdcDamage','gyroDamage','pumpDamage','electricalDamage'];
    for(const k of repairable) if(!Number.isFinite(d.repairFloor[k]))d.repairFloor[k]=0;
    // A pre-Phase-3 save can already contain severe legacy ballast/motor/rudder/
    // periscope damage. Give that damage the same at-sea repair limit it would
    // have received had the casualty happened under the new model.
    for(const k of repairable) this._fieldRepairFloor(k,d[k]||0);
    d.instrumentBias=damageBiasesFor(this.state);
    return d;
  }

  _fieldRepairFloor(field,value){
    // Flooding can be stopped at sea, but a smashed motor, bent rudder stock or
    // nearly severed scope cannot be made factory-new between depth charges.
    const d=this.state.playerSub.damage;
    if(value<0.68)return;
    const frac=field==='periscopeDamage'?0.52:(field==='tdcDamage'||field==='gyroDamage'?0.38:0.34);
    d.repairFloor[field]=Math.max(d.repairFloor[field]||0,value*frac);
  }

  applyShock(amount){
    this.ensureDamageState();
    this.shake(clamp(amount/6,0.5,7));
    const sub=this.state.playerSub,dm=sub.damage,d=Math.max(0,Number(amount)||0);
    dm.damageEventSeq=(dm.damageEventSeq||0)+1;
    const seq=dm.damageEventSeq,seed=(this.state.campaign.scenarioSeed||1)+seq*7919;

    // Preserve the pre-Phase-3 hull/basic-system damage law exactly.
    dm.hullIntegrity=clamp(dm.hullIntegrity-d,0,100);
    if(d>=3)this.aarRecordEvent?.('DAMAGE',`Boat damaged — ${d.toFixed(0)}% shock.`,{damage:d,hullAfter:dm.hullIntegrity},sub.position);
    dm.flooding=clamp(dm.flooding+d/180,0,1);
    dm.ballastDamage=clamp(dm.ballastDamage+d/230,0,1);
    dm.motorDamage=clamp(dm.motorDamage+d/270,0,1);
    dm.rudderDamage=clamp(dm.rudderDamage+d/310,0,1);
    if(d>12)dm.periscopeDamage=clamp(dm.periscopeDamage+d/260,0,1);

    // New subsystem casualties are selective, but deterministic for a patrol
    // seed and event sequence. No per-frame random flicker is involved.
    const hit=(field,divisor,chance,tag)=>{
      if(_damageSeedUnit(seed,tag)>=clamp(chance,0,1))return false;
      const spread=.72+_damageSeedUnit(seed,tag+40)*.56;
      dm[field]=clamp((dm[field]||0)+d/divisor*spread,0,1);
      this._fieldRepairFloor(field,dm[field]);
      return true;
    };
    const p=clamp(.10+d/48,0.10,.88);
    hit('tdcDamage',245,p*.68,1);
    hit('gyroDamage',275,p*.62,2);
    hit('pumpDamage',235,p*.72,3);
    hit('electricalDamage',225,p*.76,4);

    for(const k of ['ballastDamage','motorDamage','rudderDamage','periscopeDamage'])this._fieldRepairFloor(k,dm[k]||0);

    if(!dm.driveBankOffline&&(dm.motorDamage>=.68||dm.electricalDamage>=.68)){
      dm.driveBankOffline=true;
      this.notify('PROPULSION CASUALTY — one drive bank is offline until the motor/electrical plant is repaired.','bad');
    }
    dm.instrumentBias=damageBiasesFor(this.state);
    if(dm.hullIntegrity<=0&&sub.mode!=='SUNK'){
      sub.mode='SUNK';this.state.campaign.missionStatus='LOST';
      this.log('HULL FAILURE — boat lost. Open ⚓ Missions to start a new patrol.','bad');
    }
  }

  setRepairPriority(priority){
    const d=this.ensureDamageState();
    if(!REPAIR_PRIORITIES.includes(priority))return false;
    if(d.repairPriority===priority)return true;
    d.repairPriority=priority;
    this.notify(`Damage control priority: ${repairPriorityLabel(priority)}. Other casualties receive stabilization only.`,'warn');
    return true;
  }

  updateDmgCtrl(sub,dt){
    const d=this.ensureDamageState();
    const repairFields=['ballastDamage','motorDamage','rudderDamage','periscopeDamage','tdcDamage','gyroDamage','pumpDamage','electricalDamage'];
    const needDC=sub.mode!=='SUNK'&&(d.flooding>0.005||repairFields.some(k=>(d[k]||0)>(d.repairFloor[k]||0)+0.003)||d.driveBankOffline||d.pumpTripped);
    if(needDC!==!!d.damageControlActive){
      d.damageControlActive=needDC;
      this.log(needDC?`Damage control parties deployed — priority ${repairPriorityLabel(d.repairPriority)}.`:'Damage control reports all field-repairable work complete — parties stood down.');
    }

    if(sub.depthFeet>8)d.oxygen=clamp(d.oxygen-dt*0.006*(sub.stealth.silentRunning?1.2:1),0,100);
    else d.oxygen=clamp(d.oxygen+dt*0.15,0,100);
    if(sub.stealth.silentRunning)d.crewFatigue=clamp(d.crewFatigue+dt/900,0,1);
    else d.crewFatigue=clamp(d.crewFatigue-dt/1500,0,1);

    // Pumps remain a captain's choice because they are noisy. Damage lowers
    // capacity; a badly hurt pump can trip once under sustained heavy load.
    if(d.pumpActive&&!d.pumpTripped){
      const cap=clamp(1-(d.pumpDamage||0)*.78,.16,1);
      d.flooding=clamp(d.flooding-dt/240*cap,0,1);
      sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.025,0,1.5);
      if((d.pumpDamage||0)>.64&&d.flooding>.22){
        d.pumpLoadSec=(d.pumpLoadSec||0)+dt;
        const tripAt=clamp(58-(d.pumpDamage||0)*42,15,42);
        if(d.pumpLoadSec>=tripAt){
          d.pumpTripped=true;d.pumpActive=false;d.pumpLoadSec=0;
          this.notify('PUMP CASUALTY — damaged dewatering pump tripped under load. Repair it before restarting.','bad');
        }
      }else d.pumpLoadSec=Math.max(0,(d.pumpLoadSec||0)-dt*.5);
    }else if(!d.pumpActive)d.pumpLoadSec=Math.max(0,(d.pumpLoadSec||0)-dt*.25);

    if(d.damageControlActive&&sub.mode!=='SUNK'){
      const fatigue=1-d.crewFatigue*.65,base=dt/420*fatigue;
      const P=d.repairPriority;
      // Stabilization is deliberately small: the chosen priority must matter.
      const mult={
        ballastDamage:P==='FLOODING'?.62:P==='STEERING'?.24:.06,
        motorDamage:P==='PROPULSION'?.66:.06,
        rudderDamage:P==='STEERING'?.82:.06,
        periscopeDamage:P==='OPTICS_FIRE_CONTROL'?.46:.045,
        tdcDamage:P==='OPTICS_FIRE_CONTROL'?.58:.05,
        gyroDamage:P==='OPTICS_FIRE_CONTROL'?.58:.05,
        pumpDamage:P==='FLOODING'?.72:P==='PROPULSION'?.28:.05,
        electricalDamage:P==='PROPULSION'?.72:.05
      };
      // Flooding is a live leak, not a broken component. Even off-priority the
      // crew shore bulkheads; as priority it gets essentially the whole party.
      d.flooding=clamp(d.flooding-base*(P==='FLOODING'?1.18:.10),0,1);
      for(const field of repairFields){
        const floor=d.repairFloor[field]||0;
        d[field]=Math.max(floor,clamp((d[field]||0)-base*mult[field],0,1));
      }
      if(d.driveBankOffline&&P==='PROPULSION'&&d.motorDamage<.42&&d.electricalDamage<.42){
        d.driveBankOffline=false;this.notify('PROPULSION — damaged drive bank restored to service.','ok');
      }
      if(d.pumpTripped&&P==='FLOODING'&&d.pumpDamage<.46){
        d.pumpTripped=false;d.pumpLoadSec=0;this.notify('DEWATERING PUMP RESET — available again; pumps remain stopped until ordered on.','ok');
      }
    }

    d.instrumentBias=damageBiasesFor(this.state);
    if(d.flooding>=.98&&sub.mode!=='SUNK'){
      sub.mode='SUNK';this.state.campaign.missionStatus='LOST';
      this.log('Flooding uncontrolled. Boat lost. Open ⚓ Missions to start a new patrol.','bad');
    }
  }
}
