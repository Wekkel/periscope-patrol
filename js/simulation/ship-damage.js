// ═══════════════════════════════════════════════════ SURFACE SHIP DAMAGE
// Patch 5: ships do not use a single life bar. Four readable casualties drive
// what a damaged ship can still do: FLOTATION, PROPULSION, STEERING and FIRE.
// c.sunk remains only the terminal state. c.gunDamage is retained as legacy
// telemetry/save compatibility, but it is never consulted as a kill threshold.
const SHIP_DAMAGE_VERSION=1;

function _shipHash01(key){
  let h=2166136261>>>0;
  const s=String(key||'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;
  return (h>>>0)/4294967295;
}
function _shipLegacyGunThreshold(c){
  return /CARRIER|CRUISER/i.test(c?.displayType||'')?2.7:['ESCORT','WARSHIP','PATROL_CRAFT'].includes(c?.type)?1.55:c?.type==='TANKER'?1.25:1.0;
}
function ensureShipDamage(c){
  if(!c)return null;
  let D=c.shipDamage;
  if(!D||typeof D!=='object')D=c.shipDamage={};
  D.version=SHIP_DAMAGE_VERSION;
  for(const k of ['flotation','propulsion','steering','fire'])D[k]=clamp(Number(D[k])||0,0,1);
  D.floodRate=Math.max(0,Number(D.floodRate)||0);       // damage points / second
  D.fireRate=Number.isFinite(D.fireRate)?D.fireRate:0;  // + grows, - is being contained
  D.trim=clamp(Number(D.trim)||0,-1,1);                 // + down by bow, - down by stern
  D.list=clamp(Number(D.list)||0,-1,1);
  D.hitCount=Math.max(0,Number(D.hitCount)||0);
  D.lastHitAt=Number.isFinite(D.lastHitAt)?D.lastHitAt:-999;
  D.lastHitLocation=D.lastHitLocation||null;
  D.lastHitFrac=Number.isFinite(D.lastHitFrac)?D.lastHitFrac:null;
  D.lastWeapon=D.lastWeapon||null;
  D.lastWeaponId=D.lastWeaponId||null;
  D.rudderBiasDeg=Number.isFinite(D.rudderBiasDeg)?D.rudderBiasDeg:0;
  D.rudderJam=Number.isFinite(D.rudderJam)?clamp(D.rudderJam,-1,1):0;
  D.founderingAt=Number.isFinite(D.founderingAt)?D.founderingAt:null;
  D.abandonAt=Number.isFinite(D.abandonAt)?D.abandonAt:null;
  D.abandoned=!!D.abandoned;
  D.killCredited=!!D.killCredited;

  // Old saves can contain the former cumulative deck-gun "HP" value. Preserve
  // the fact that a ship was already damaged by translating it once into the
  // four-state model. This is migration only; new hits never use this number
  // to decide whether the ship sinks.
  if(!D.legacyMigrated&&(c.gunDamage||0)>0){
    const ratio=clamp((c.gunDamage||0)/_shipLegacyGunThreshold(c),0,1.35);
    D.flotation=Math.max(D.flotation,clamp(ratio*.64,0,.88));
    D.propulsion=Math.max(D.propulsion,clamp(ratio*.55,0,.88));
    D.steering=Math.max(D.steering,clamp(ratio*.28,0,.7));
    D.fire=Math.max(D.fire,clamp(ratio*.48,0,.82));
    D.floodRate=Math.max(D.floodRate,ratio*.00010);
    D.legacyNearSink=ratio>=.86;
    D.legacyMigrated=true;
  }else if(D.legacyMigrated===undefined){
    D.legacyMigrated=true;
  }
  return D;
}

function shipDamageSeverity(c){
  const D=ensureShipDamage(c);if(!D)return 0;
  return clamp(Math.max(D.flotation,D.fire*.92,D.propulsion*.82,D.steering*.62),0,1);
}
function shipDamageCondition(c){
  const D=ensureShipDamage(c);if(!D)return 'INTACT';
  if(c.sunk)return 'SINKING';
  if(D.abandoned)return 'ABANDONED';
  if(D.founderingAt!==null||D.flotation>.88)return 'FOUNDERING';
  if(D.fire>.58)return 'BURNING';
  if(D.propulsion>.82)return 'DEAD IN WATER';
  if(shipDamageSeverity(c)>.58)return 'CRIPPLED';
  if(shipDamageSeverity(c)>.15)return 'DAMAGED';
  return 'INTACT';
}
function shipDamageSpeedFactor(c){
  const D=ensureShipDamage(c);if(!D)return 1;
  if(c.sunk||D.abandoned)return 0;
  return clamp((1-D.propulsion*.88)*(1-D.flotation*.35)*(1-D.fire*.10),.04,1);
}
function shipDamageTurnFactor(c){
  const D=ensureShipDamage(c);if(!D)return 1;
  return clamp(1-D.steering*.82,.10,1);
}
function shipIsStraggler(c){
  if(!c||c.sunk||c.harborTarget||isSurfaceCombatant(c)||c.convoyId!=='MAIN')return false;
  const D=ensureShipDamage(c),base=Math.max(1,c.baseSpeed||c.speedKnots||8);
  return D.abandoned||D.propulsion>.55||D.flotation>.68||D.fire>.72||(c.speedKnots||0)<base*.58;
}
function shipTorpedoHitLocation(hitFrac){
  if(hitFrac>.24)return 'BOW';
  if(hitFrac<-.32)return 'STERN';
  if(hitFrac<-.07)return 'ENGINE ROOM';
  return 'MIDSHIPS';
}
function shipDamageSummary(c){
  const D=ensureShipDamage(c);if(!D)return '';
  const bits=[];
  if(D.flotation>.2)bits.push(`flotation ${Math.round(D.flotation*100)}%`);
  if(D.propulsion>.2)bits.push(`propulsion ${Math.round(D.propulsion*100)}%`);
  if(D.steering>.2)bits.push(`steering ${Math.round(D.steering*100)}%`);
  if(D.fire>.15)bits.push(`fire ${Math.round(D.fire*100)}%`);
  return bits.join(' · ');
}

function _shipSetDamage(c,D,key,add){D[key]=clamp(D[key]+Math.max(0,add),0,1);}
function _shipScheduleOutcome(engine,c,D,impactKey){
  const now=engine.state.time.elapsedSeconds||0;
  const h=_shipHash01(`${c.id}:${impactKey}:outcome`);
  if(D.flotation>=.985){D.founderingAt=now;return;}
  if(D.flotation>.86&&D.founderingAt===null){
    const delay=50+(1-D.flotation)*520+h*80;
    D.founderingAt=now+clamp(delay,35,190);
  }
  if(!D.abandoned&&D.abandonAt===null&&(
      D.fire>.86||(D.fire>.78&&D.flotation>.52)||(D.flotation>.91&&D.propulsion>.55))){
    D.abandonAt=now+80+h*150;
  }
}

function applyTorpedoShipDamage(engine,c,impact){
  const D=ensureShipDamage(c),now=engine.state.time.elapsedSeconds||0;
  const location=shipTorpedoHitLocation(impact.hitFrac||0);
  const warhead=Number(impact.warheadKg)||292;
  const length=Number(c.lengthYards)||400;
  const size=clamp(430/length,.68,1.30);
  const angle=clamp(.78+.22*((Number(impact.incidence)||60)/90),.72,1.02);
  const variance=.90+_shipHash01(`${c.id}:${impact.torpedoId||D.hitCount}:${location}`)*.20;
  const p=clamp(warhead/292,.72,1.08)*size*angle*variance;
  let f=0,prop=0,steer=0,fire=0,flood=0,trim=0;
  if(location==='ENGINE ROOM'){
    f=.25;prop=.78;steer=.08;fire=.34;flood=.00010;trim=-.10;
  }else if(location==='BOW'){
    f=.54;prop=.12;steer=.03;fire=.08;flood=.00028;trim=.72;
  }else if(location==='STERN'){
    f=.34;prop=.38;steer=.73;fire=.10;flood=.00016;trim=-.48;
  }else{
    f=.69;prop=.29;steer=.10;fire=.27;flood=.00034;trim=.05;
  }
  if(c.type==='TANKER')fire*=1.28;
  if(isSurfaceCombatant(c)){f*=1.06;prop*=.95;}
  _shipSetDamage(c,D,'flotation',f*p);_shipSetDamage(c,D,'propulsion',prop*p);
  _shipSetDamage(c,D,'steering',steer*p);_shipSetDamage(c,D,'fire',fire*p);
  D.floodRate=Math.max(D.floodRate,flood*p);
  D.fireRate=Math.max(D.fireRate,(D.fire>.28?.00008:.00002)*p);
  D.trim=clamp(D.trim+trim*p,-1,1);
  D.list=clamp(D.list+(impact.hitSide||1)*(.12+.18*f*p),-1,1);
  D.hitCount++;D.lastHitAt=now;D.lastHitLocation=location;D.lastHitFrac=impact.hitFrac;
  D.lastWeapon='TORPEDO';D.lastWeaponId=impact.torpedoId||null;
  if(D.steering>.62&&Math.abs(D.rudderBiasDeg)<1){
    const side=_shipHash01(`${c.id}:${impact.torpedoId}:rudder`)<.5?-1:1;
    D.rudderBiasDeg=side*(4+D.steering*9);
    if(D.steering>.84)D.rudderJam=side*clamp((D.steering-.80)/.20,.35,1);
  }
  // A square, heavy amidships hit can open the structure enough to turn a
  // delayed foundering into a rapid one, but it is still a subsystem outcome,
  // not a random HP threshold.
  if(location==='MIDSHIPS'&&p>.86&&_shipHash01(`${c.id}:${impact.torpedoId}:break`)>.70){
    D.flotation=Math.max(D.flotation,.91);D.floodRate=Math.max(D.floodRate,.00072);
  }
  _shipScheduleOutcome(engine,c,D,`${impact.torpedoId||'T'}:${location}`);
  return{location,power:p,state:D,condition:shipDamageCondition(c)};
}

function applyDeckGunShipDamage(engine,c,hit){
  const D=ensureShipDamage(c),now=engine.state.time.elapsedSeconds||0;
  const len=hit?.lenNm||((c.lengthYards||400)*0.9144/1852);
  const frac=clamp((hit?.along||0)/(len||1),-.5,.5);
  const location=shipTorpedoHitLocation(frac);
  const heavy=/CARRIER|CRUISER/i.test(c.displayType||'');
  const typeScale=heavy ? .34 : isSurfaceCombatant(c) ? .62 : c.type==='TANKER' ? .86 : 1;
  const n=D.hitCount+1,h=.88+_shipHash01(`${c.id}:DG:${n}:${location}`)*.24;
  let f=.025,prop=.025,steer=.015,fire=.075;
  if(location==='ENGINE ROOM'){f=.018;prop=.095;fire=.11;}
  else if(location==='BOW'){f=.060;prop=.012;fire=.04;}
  else if(location==='STERN'){f=.030;prop=.035;steer=.12;fire=.045;}
  else {f=.050;prop=.025;fire=.09;}
  if(c.type==='TANKER')fire*=1.32;
  _shipSetDamage(c,D,'flotation',f*typeScale*h);_shipSetDamage(c,D,'propulsion',prop*typeScale*h);
  _shipSetDamage(c,D,'steering',steer*typeScale*h);_shipSetDamage(c,D,'fire',fire*typeScale*h);
  D.floodRate=Math.max(D.floodRate,(location==='BOW'||location==='MIDSHIPS'?.000025:.000010)*typeScale);
  D.fireRate=Math.max(D.fireRate,D.fire>.3?.000025:0);
  D.trim=clamp(D.trim+(location==='BOW'?.035:location==='STERN'?-.025:0)*typeScale,-1,1);
  D.hitCount++;D.lastHitAt=now;D.lastHitLocation=location;D.lastHitFrac=frac;D.lastWeapon='DECK_GUN';D.lastWeaponId=`DG-${engine.state.weapons.deckGun?.hits||D.hitCount}`;
  if(D.steering>.68&&Math.abs(D.rudderBiasDeg)<1){
    const side=_shipHash01(`${c.id}:DG:${n}:rudder`)<.5?-1:1;D.rudderBiasDeg=side*(3+D.steering*7);
  }
  // Compatibility for a ship loaded from a pre-Patch-5 save that was already
  // within one hit of the old deck-gun sink threshold. Translate that imminent
  // loss into severe flooding/fire once, rather than keeping an invisible HP bar.
  if(D.legacyNearSink){
    D.flotation=Math.max(D.flotation,.985);D.fire=Math.max(D.fire,.72);D.legacyNearSink=false;
  }
  _shipScheduleOutcome(engine,c,D,`DG:${n}:${location}`);
  return{location,state:D,condition:shipDamageCondition(c)};
}

function _shipSinkStyle(c,D){
  const frac=Number.isFinite(D.lastHitFrac)?D.lastHitFrac:0;
  if(frac>.22)return 0;
  if(frac<-.22)return 1;
  return _shipHash01(`${c.id}:${D.lastWeaponId||D.hitCount}:sink`)<.58?2:3;
}
function beginShipSinking(engine,c,reason='FLOODING'){
  if(!c||c.sunk)return false;
  const D=ensureShipDamage(c),now=engine.state.time.elapsedSeconds||0,W=engine.state.weapons,camp=engine.state.campaign;
  c.sunk=true;c.sinkingProgress=0;c.speedKnots=0;c.desiredSpeed=0;c.sunkAt=now;
  c.hitFrac=Number.isFinite(D.lastHitFrac)?D.lastHitFrac:(c.hitFrac??0);
  c.hitSide=c.hitSide??(D.list>=0?1:-1);
  c.sinkStyle=_shipSinkStyle(c,D);
  const fast=D.flotation>.995||reason==='STRUCTURAL';
  c.sinkDurationSec=fast?(isSurfaceCombatant(c)?25:34)+_shipHash01(`${c.id}:sinkdur`)*18
                    :(isSurfaceCombatant(c)?36:56)+_shipHash01(`${c.id}:sinkdur`)*34;
  const tr=engine.state.world.contactTracks[c.id];if(tr){tr.sunk=true;tr.lastFixPosition={...c.position};tr.plotPosition={...c.position};delete tr.truePosition;}
  if(!D.killCredited){
    const gun=D.lastWeapon==='DECK_GUN',side=c.side||'ENEMY';
    if(side==='FRIENDLY'||side==='NEUTRAL'){
      const pts=side==='FRIENDLY'?-2500:-1000;camp.score+=pts;D.killCredited=true;D.killPoints=pts;
      engine.notify(`${side==='FRIENDLY'?'FRIENDLY SHIP':'NEUTRAL CRAFT'} LOST — ${c.name}. ${pts.toLocaleString()} pts.`,'bad');
      engine.log(`${c.name} is sinking — ${side.toLowerCase()} traffic hit. No enemy tonnage credited.`,'bad');
      engine.captainLog?.(side==='FRIENDLY'?'FRIENDLY_FIRE':'NEUTRAL_LOSS',`${c.name} lost to our fire.`,{contactId:c.id,type:c.displayType||c.type,weapon:D.lastWeapon||'DAMAGE'},`nonenemy-loss:${c.id}`);
    }else{
      const pts=Math.round((c.harborValue||(c.type==='ESCORT'||c.type==='WARSHIP'||c.type==='PATROL_CRAFT'?(gun?1800:2200):(gun?1000:1400)))*(gun ? .85 : 1));
      camp.score+=pts;camp.tonnageSunk+=(c.tonsFactor||3000);if(c.type==='ESCORT'||c.type==='WARSHIP'||c.type==='PATROL_CRAFT')camp.escortsSunk++;
      const attackObj=camp.objectives?.find?.(o=>o.id==='attack')||(!camp.missionType?camp.objectives?.[1]:null);
      if(attackObj)attackObj.done=true;
      D.killCredited=true;D.killPoints=pts;
      engine.notify(`${D.lastWeapon==='DECK_GUN'?'DECK GUN':'TORPEDO DAMAGE'} — ${c.name} is going down. +${pts} pts.`,'ok');
      engine.log(`${c.name} is sinking — ${reason.toLowerCase()}. ${camp.tonnageSunk.toLocaleString()} tons sunk.`,'bad');
      engine.captainLog?.('SHIP_SUNK',`${c.name} sunk.`,{contactId:c.id,type:c.displayType||c.type,tons:c.tonsFactor||0,weapon:D.lastWeapon||'DAMAGE'},`sunk:${c.id}`);
    }
  }
  if(c.harborTarget){engine.noteHarborAttack?.(c);if(engine.state.world.harbor){engine.state.world.harbor.alert=2;engine.state.world.harbor.suspicion=100;}}
  if(!c.side||c.side==='ENEMY')engine.alertEscorts?.('SHIP_HIT',{...c.position},1);engine.checkMissionObjectives?.();
  return true;
}

function updateShipDamage(engine,c,dt){
  if(!c||c.sunk)return;
  const D=ensureShipDamage(c),now=engine.state.time.elapsedSeconds||0;
  if(dt>0){
    // Progressive flooding is strongest immediately after the hit, then slows as
    // compartments are isolated. There is no magical full repair at sea.
    if(D.floodRate>0){D.flotation=clamp(D.flotation+D.floodRate*dt,0,1);D.floodRate*=Math.exp(-dt/780);}
    if(D.fire>.03){
      if(D.fire>.68)D.fire=clamp(D.fire+(.000035+D.fireRate)*dt,0,1);
      else D.fire=clamp(D.fire-(.000045-Math.min(.000035,D.fireRate))*dt,0,1);
      if(D.fire>.72){D.propulsion=clamp(D.propulsion+dt*.000020*D.fire,0,1);D.flotation=clamp(D.flotation+dt*.000009*D.fire,0,1);}
    }
  }
  if(D.flotation>.70){
    const targetTrim=D.lastHitLocation==='BOW'?.9:D.lastHitLocation==='STERN'?-.72:D.trim;
    D.trim+=clamp(targetTrim-D.trim,-dt*.003,dt*.003);
    if(Math.abs(D.list)<.12)D.list=(D.list>=0?1:-1)*.12;
  }
  if(D.steering>.84&&Math.abs(D.rudderJam)<.2){
    const side=_shipHash01(`${c.id}:persistent-rudder`)<.5?-1:1;D.rudderJam=side*.45;
  }
  if(D.abandonAt!==null&&!D.abandoned&&now>=D.abandonAt){
    D.abandoned=true;c.desiredSpeed=0;engine.log(`${c.name} — crew abandoning ship.`,'warn');
  }
  if(D.abandoned)c.desiredSpeed=0;
  _shipScheduleOutcome(engine,c,D,`progress:${D.hitCount}`);
  if(D.founderingAt!==null&&now>=D.founderingAt){beginShipSinking(engine,c,D.flotation>.985?'STRUCTURAL':'FLOODING');return;}
  const cap=(c.baseSpeed??c.speedKnots??0)*shipDamageSpeedFactor(c);
  c.damageSpeedCap=cap;
  c.desiredSpeed=Math.min(c.desiredSpeed===undefined?c.speedKnots:c.desiredSpeed,cap);
}
