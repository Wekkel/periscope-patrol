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
  return /CARRIER|CRUISER/i.test(c?.displayType||'')?2.7:(typeof isSurfaceCombatant==='function'&&isSurfaceCombatant(c))?1.55:c?.type==='TANKER'?1.25:1.0;
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
  D.visualTrim=Number.isFinite(D.visualTrim)?D.visualTrim:D.trim;
  D.visualList=Number.isFinite(D.visualList)?D.visualList:D.list;
  D.visualFlotation=Number.isFinite(D.visualFlotation)?D.visualFlotation:D.flotation;
  D.shudderAmp=Number.isFinite(D.shudderAmp)?D.shudderAmp:0;
  D.shudderTime=Number.isFinite(D.shudderTime)?D.shudderTime:0;
  if(!D.compartments||typeof D.compartments!=='object'){
    D.compartments={bow:0,forwardHold:0,midships:0,afterHold:0,stern:0};
  }
  D.hitSide=Number.isFinite(D.hitSide)?(D.hitSide>=0?1:-1):null;
  D.hitCount=Math.max(0,Number(D.hitCount)||0);
  D.lastHitAt=Number.isFinite(D.lastHitAt)?D.lastHitAt:-999;
  D.lastHitLocation=D.lastHitLocation||null;
  D.lastHitMaterial=D.lastHitMaterial||null;
  D.lastHitFrac=Number.isFinite(D.lastHitFrac)?D.lastHitFrac:null;
  D.lastWeapon=D.lastWeapon||null;
  D.lastWeaponId=D.lastWeaponId||null;
  D.rudderBiasDeg=Number.isFinite(D.rudderBiasDeg)?D.rudderBiasDeg:0;
  D.rudderJam=Number.isFinite(D.rudderJam)?clamp(D.rudderJam,-1,1):0;
  D.founderingAt=Number.isFinite(D.founderingAt)?D.founderingAt:null;
  D.abandonAt=Number.isFinite(D.abandonAt)?D.abandonAt:null;
  D.abandoned=!!D.abandoned;
  D.killCredited=!!D.killCredited;
  D.secondaryExplosions=Array.isArray(D.secondaryExplosions)?D.secondaryExplosions:[];
  D.boilerRuptured=!!D.boilerRuptured;
  D.boilerTimer=Number.isFinite(D.boilerTimer)?D.boilerTimer:0;
  D.magazineDetonated=!!D.magazineDetonated;
  D.magazineTimer=Number.isFinite(D.magazineTimer)?D.magazineTimer:0;

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
  const base=(1-D.propulsion*.88)*(1-D.flotation*.35)*(1-D.fire*.10);
  const bowDrag=clamp(Math.max(0,D.trim-.25)*.35,0,.30);
  const sternEmergence=clamp(Math.max(0,-D.trim-.25)*.45,0,.40);
  const listDrag=clamp(Math.abs(D.list)*.18,0,.22);
  return clamp(base*(1-bowDrag)*(1-sternEmergence)*(1-listDrag),.02,1);
}
function shipDamageTurnFactor(c){
  const D=ensureShipDamage(c);if(!D)return 1;
  const trimPenalty=clamp(Math.abs(D.trim)*.22,0,.30);
  const listPenalty=clamp(Math.abs(D.list)*.18,0,.25);
  return clamp((1-D.steering*.82)*(1-trimPenalty)*(1-listPenalty),.06,1);
}
function shipIsStraggler(c){
  if(!c||c.sunk||c.harborTarget||isSurfaceCombatant(c)||c.convoyId!=='MAIN')return false;
  const D=ensureShipDamage(c),base=Math.max(1,c.baseSpeed||c.speedKnots||8);
  return !!c.convoyNaturalStraggler||D.abandoned||D.propulsion>.55||D.flotation>.68||D.fire>.72||(c.speedKnots||0)<base*.58;
}
function shipTorpedoHitLocation(hitFrac){
  if(hitFrac>.28)return 'BOW';
  if(hitFrac>.08)return 'FORWARD_HOLD';
  if(hitFrac<-.35)return 'STERN';
  if(hitFrac<-.12)return 'AFTER_HOLD';
  return 'MIDSHIPS';
}
function shipAttitude(c, visual=false){
  const D=ensureShipDamage(c);
  if(!D)return {rollRad:0,pitchRad:0,draftOffsetM:0,listDeg:0,trimFt:0,listText:'EVEN KEEL',trimText:'EVEN KEEL',conditionSummary:'INTACT'};
  const effectiveList=visual&&Number.isFinite(D.visualList)?D.visualList:D.list;
  const effectiveTrim=visual&&Number.isFinite(D.visualTrim)?D.visualTrim:D.trim;
  let shudderRoll=0, shudderPitch=0;
  if(visual&&(D.shudderAmp||0)>0.005){
    const osc=Math.sin((D.shudderTime||0)*16.0)*D.shudderAmp*0.035;
    shudderRoll=osc*0.6;
    shudderPitch=osc*0.4;
  }
  const maxRollRad=0.436; // ~25 deg
  const rollRad=clamp(effectiveList*maxRollRad+shudderRoll,-maxRollRad,maxRollRad);
  const listDegVal=Math.round((rollRad*180)/Math.PI);
  const listText=Math.abs(listDegVal)<2?'EVEN KEEL':`LIST ${Math.abs(listDegVal)}° ${listDegVal>0?'STBD':'PORT'}`;

  const maxPitchRad=0.209; // ~12 deg
  const pitchRad=clamp(-effectiveTrim*maxPitchRad+shudderPitch,-maxPitchRad,maxPitchRad);
  const lenFt=(c.lengthYards||400)*3;
  const trimFtVal=Math.round(effectiveTrim*(lenFt*0.04));
  const trimText=Math.abs(effectiveTrim)<0.10?'EVEN KEEL':effectiveTrim>0?`TRIM ${Math.abs(trimFtVal)}FT HEAD`:`TRIM ${Math.abs(trimFtVal)}FT STERN`;

  const baseDraftM=(c.dimensions?.draftFt?c.dimensions.draftFt*0.3048:(c.lengthYards||400)*0.02);
  const effectiveFlot=visual&&Number.isFinite(D.visualFlotation)?D.visualFlotation:D.flotation;
  const draftOffsetM=clamp(effectiveFlot*baseDraftM*0.75,0,baseDraftM*1.5);
  const conditionSummary=listText==='EVEN KEEL'&&trimText==='EVEN KEEL'?'EVEN KEEL':`${listText} · ${trimText}`;
  return {rollRad,pitchRad,draftOffsetM,listDeg:listDegVal,trimFt:trimFtVal,listText,trimText,conditionSummary};
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
  if(D.flotation>=.985){
    if(D.founderingAt===null)D.founderingAt=now+14+h*10;
    return;
  }
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
  if(location==='ENGINE ROOM'||location==='MIDSHIPS'){
    f=.68;prop=.76;steer=.14;fire=.36;flood=.00036;trim=.02;
    D.compartments.midships=clamp((D.compartments.midships||0)+.85*p,0,1);
  }else if(location==='BOW'){
    f=.52;prop=.10;steer=.04;fire=.08;flood=.00030;trim=.74;
    D.compartments.bow=clamp((D.compartments.bow||0)+.75*p,0,1);
  }else if(location==='FORWARD_HOLD'){
    f=.60;prop=.18;steer=.06;fire=.18;flood=.00032;trim=.42;
    D.compartments.forwardHold=clamp((D.compartments.forwardHold||0)+.70*p,0,1);
  }else if(location==='AFTER_HOLD'){
    f=.56;prop=.38;steer=.22;fire=.14;flood=.00026;trim=-.38;
    D.compartments.afterHold=clamp((D.compartments.afterHold||0)+.68*p,0,1);
  }else if(location==='STERN'){
    f=.40;prop=.82;steer=.85;fire=.12;flood=.00022;trim=-.72;
    D.compartments.stern=clamp((D.compartments.stern||0)+.80*p,0,1);
  }else{
    f=.60;prop=.30;steer=.10;fire=.20;flood=.00030;trim=.05;
    D.compartments.midships=clamp((D.compartments.midships||0)+.60*p,0,1);
  }
  if(c.type==='TANKER')fire*=1.28;
  if(isSurfaceCombatant(c)){f*=1.06;prop*=.95;}
  _shipSetDamage(c,D,'flotation',f*p);_shipSetDamage(c,D,'propulsion',prop*p);
  _shipSetDamage(c,D,'steering',steer*p);_shipSetDamage(c,D,'fire',fire*p);
  D.floodRate=Math.max(D.floodRate,flood*p);
  D.fireRate=Math.max(D.fireRate,(D.fire>.28?.00008:.00002)*p);
  const hitSide=impact.hitSide!==undefined?(impact.hitSide>=0?1:-1):1;
  D.hitSide=hitSide;
  D.trim=clamp(D.trim+trim*p,-1,1);
  D.list=clamp(D.list+hitSide*(.14+.20*f*p),-1,1);
  D.shudderAmp=Math.min(1.0,(D.shudderAmp||0)+0.85*p);
  D.shudderTime=0;
  D.hitCount++;D.lastHitAt=now;D.lastHitLocation=location;D.lastHitFrac=impact.hitFrac;
  D.lastWeapon='TORPEDO';D.lastWeaponId=impact.torpedoId||null;D.lastAttackerSide='PLAYER';D.lastAttackerId='PLAYER_SUB';
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
  const len=hit?.lenNm||((c.lengthYards||400)*0.3048/1852);
  const frac=clamp((hit?.along||0)/(len||1),-.5,.5);
  const location=shipTorpedoHitLocation(frac),impactZ=Number(hit?.z)||0;
  const material=impactZ<2.7?'HULL':impactZ<7?'DECK':'SUPERSTRUCTURE';
  const heavy=/CARRIER|CRUISER/i.test(c.displayType||'');
  const typeScale=heavy ? .34 : isSurfaceCombatant(c) ? .62 : c.type==='TANKER' ? .86 : 1;
  const n=D.hitCount+1,h=.88+_shipHash01(`${c.id}:DG:${n}:${location}`)*.24;
  let f=.025,prop=.025,steer=.015,fire=.075;
  if(location==='ENGINE ROOM'){f=.018;prop=.095;fire=.11;}
  else if(location==='BOW'){f=.060;prop=.012;fire=.04;}
  else if(location==='STERN'){f=.030;prop=.035;steer=.12;fire=.045;}
  else {f=.050;prop=.025;fire=.09;}
  if(material==='HULL'){f*=1.35;fire*=.72;}else if(material==='SUPERSTRUCTURE'){f*=.35;prop*=.55;steer*=.65;fire*=1.55;}
  if(c.type==='TANKER')fire*=1.32;
  _shipSetDamage(c,D,'flotation',f*typeScale*h);_shipSetDamage(c,D,'propulsion',prop*typeScale*h);
  _shipSetDamage(c,D,'steering',steer*typeScale*h);_shipSetDamage(c,D,'fire',fire*typeScale*h);
  D.floodRate=Math.max(D.floodRate,(location==='BOW'||location==='MIDSHIPS'?.000025:.000010)*typeScale);
  D.fireRate=Math.max(D.fireRate,D.fire>.3?.000025:0);
  D.trim=clamp(D.trim+(location==='BOW'?.035:location==='STERN'?-.025:0)*typeScale,-1,1);
  const npcSurface=hit?.source==='NPC_SURFACE_GUN';
  D.hitCount++;D.lastHitAt=now;D.lastHitLocation=location;D.lastHitMaterial=material;D.lastHitFrac=frac;
  D.lastWeapon=npcSurface?'SURFACE_GUN':'DECK_GUN';
  D.lastWeaponId=npcSurface?`SG-${hit?.attackerId||'NPC'}-${D.hitCount}`:`DG-${engine.state.weapons.deckGun?.hits||D.hitCount}`;
  D.lastAttackerSide=npcSurface?(hit?.attackerSide||'ENEMY'):'PLAYER';
  D.lastAttackerId=npcSurface?(hit?.attackerId||null):'PLAYER_SUB';
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
  return{location,material,state:D,condition:shipDamageCondition(c)};
}

const SINK_TRAJECTORIES={
  0:'PLUNGE_BOW',
  1:'PLUNGE_STERN',
  2:'BREAK_MIDSHIPS',
  3:'SETTLE_LIST',
  4:'CAPSIZE'
};

function shipDetermineSinkTrajectory(c,D){
  const frac=Number.isFinite(D?.lastHitFrac)?D.lastHitFrac:0;
  // Tankers or ships with severe listing capsize onto their beam ends
  if(c?.type==='TANKER'||Math.abs(D?.list||0)>=0.40){
    return {style:4,trajectory:SINK_TRAJECTORIES[4]};
  }
  // Long cargo / merchants breaking midships under midships blast
  const longHull=(c?.lengthYards||0)>=360||c?.type==='CARGO'||c?.type==='MERCHANT';
  if(longHull&&((D?.compartments&&D.compartments.midships>=0.55)||D?.lastHitLocation==='MIDSHIPS'||D?.lastHitLocation==='ENGINE ROOM')){
    return {style:2,trajectory:SINK_TRAJECTORIES[2]};
  }
  // Steep plunge bow / stern
  if((D?.compartments&&D.compartments.bow>=0.50)||frac>0.20||(D?.trim||0)>=0.35){
    return {style:0,trajectory:SINK_TRAJECTORIES[0]};
  }
  if((D?.compartments&&D.compartments.stern>=0.50)||frac<-0.20||(D?.trim||0)<=-0.35){
    return {style:1,trajectory:SINK_TRAJECTORIES[1]};
  }
  const h=_shipHash01(`${c?.id||'X'}:${D?.lastWeaponId||D?.hitCount||0}:sink`);
  const style=h<0.50?2:3;
  return {style,trajectory:SINK_TRAJECTORIES[style]};
}

function _shipSinkStyle(c,D){
  return shipDetermineSinkTrajectory(c,D).style;
}
function shipCaptainLog(engine,...args){
  const captainLog=engine?.captainLog||engine?.ctx?.captainLog;
  return captainLog?.(...args);
}
function beginShipSinking(engine,c,reason='FLOODING'){
  if(!c||c.sunk)return false;
  const D=ensureShipDamage(c),now=engine.state.time.elapsedSeconds||0,W=engine.state.weapons,camp=engine.state.campaign;
  c.sunk=true;c.sinkingProgress=0;c.speedKnots=0;c.desiredSpeed=0;c.sunkAt=now;
  c.hitFrac=Number.isFinite(D.lastHitFrac)?D.lastHitFrac:(c.hitFrac??0);
  c.hitSide=c.hitSide??(D.list>=0?1:-1);
  const sinkInfo=shipDetermineSinkTrajectory(c,D);
  c.sinkStyle=sinkInfo.style;
  c.sinkTrajectory=sinkInfo.trajectory;
  const fast=D.flotation>.995||reason==='STRUCTURAL';
  c.sinkDurationSec=fast?(isSurfaceCombatant(c)?25:34)+_shipHash01(`${c.id}:sinkdur`)*18
                    :(isSurfaceCombatant(c)?36:56)+_shipHash01(`${c.id}:sinkdur`)*34;
  const tr=engine.state.world.contactTracks[c.id];if(tr){tr.sunk=true;tr.lastFixPosition={...c.position};tr.plotPosition={...c.position};delete tr.truePosition;}
  if(!D.killCredited){
    const gun=D.lastWeapon==='DECK_GUN',side=c.side||'ENEMY';
    if(side==='FRIENDLY'||side==='NEUTRAL'){
      const hostileNpc=D.lastAttackerSide==='ENEMY'&&D.lastAttackerId&&D.lastAttackerId!=='PLAYER_SUB';
      if(hostileNpc){
        D.killCredited=true;D.killPoints=0;
        const tr=engine.state.world.contactTracks?.[c.id],known=!!(tr&&tr.confidence>.04)||distNm(engine.state.playerSub.position,c.position)<10;
        if(known){
          engine.notify(`${side==='FRIENDLY'?'FRIENDLY SHIP':'NEUTRAL CRAFT'} LOST — ${c.name} sunk by enemy surface gunfire.`,'warn', 'KRITIEK');
          engine.log(`${c.name} is sinking under enemy gunfire. No player penalty or enemy tonnage credited.`,'warn');
        shipCaptainLog(engine,'FRIENDLY_LOST_TO_ENEMY',`${c.name} lost to enemy surface gunfire.`,{contactId:c.id,type:c.displayType||c.type,attackerId:D.lastAttackerId},`friendly-enemy-loss:${c.id}`);
        }
      }else{
        const pts=side==='FRIENDLY'?-2500:-1000;camp.score+=pts;D.killCredited=true;D.killPoints=pts;
        engine.notify(`${side==='FRIENDLY'?'FRIENDLY SHIP':'NEUTRAL CRAFT'} LOST — ${c.name}. ${pts.toLocaleString()} pts.`,'bad', 'KRITIEK');
        engine.log(`${c.name} is sinking — ${side.toLowerCase()} traffic hit. No enemy tonnage credited.`,'bad');
        shipCaptainLog(engine,side==='FRIENDLY'?'FRIENDLY_FIRE':'NEUTRAL_LOSS',`${c.name} lost to our fire.`,{contactId:c.id,type:c.displayType||c.type,weapon:D.lastWeapon||'DAMAGE'},`nonenemy-loss:${c.id}`);
      }
    }else{
      const combatant=typeof isSurfaceCombatant==='function'&&isSurfaceCombatant(c);
      const pts=Math.round((c.harborValue||(combatant?(gun?1800:2200):(gun?1000:1400)))*(gun ? .85 : 1));
      camp.score+=pts;camp.tonnageSunk+=(c.tonsFactor||3000);if(combatant)camp.escortsSunk++;
      const attackObj=camp.objectives?.find?.(o=>o.id==='attack')||(!camp.missionType?camp.objectives?.[1]:null);
      if(attackObj)attackObj.done=true;
      D.killCredited=true;D.killPoints=pts;
      engine.notify(`${D.lastWeapon==='DECK_GUN'?'DECK GUN':'TORPEDO DAMAGE'} — ${c.name} is going down. +${pts} pts.`,'ok', 'KRITIEK');
      engine.log(`${c.name} is sinking — ${reason.toLowerCase()}. ${camp.tonnageSunk.toLocaleString()} tons sunk.`,'bad');
      shipCaptainLog(engine,'SHIP_SUNK',`${c.name} sunk.`,{contactId:c.id,type:c.displayType||c.type,tons:c.tonsFactor||0,weapon:D.lastWeapon||'DAMAGE'},`sunk:${c.id}`);
    }
  }
  if(c.harborTarget){
    if(engine.sys?.harbor?.noteHarborAttack)engine.sys.harbor.noteHarborAttack(c);
    else engine.noteHarborAttack?.(c);
    if(engine.state.world.harbor){engine.state.world.harbor.alert=2;engine.state.world.harbor.suspicion=100;}
  }
  if(!c.side||c.side==='ENEMY')engine.sys?.enemyAI?.alertEscorts?.('SHIP_HIT',{...c.position},1);
  if(engine.sys?.mission?.checkObjectives)engine.sys.mission.checkObjectives();
  else engine.checkMissionObjectives?.();
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
    // Secondary boiler rupture under sustained engine room / midships fire
    if(D.fire>.55&&!D.boilerRuptured&&((D.compartments&&D.compartments.midships>.30)||D.lastHitLocation==='MIDSHIPS'||D.lastHitLocation==='ENGINE ROOM')){
      D.boilerTimer+=dt;
      const boilerThresh=12+_shipHash01(`${c.id}:boiler`)*10;
      if(D.boilerTimer>=boilerThresh){
        D.boilerRuptured=true;
        D.secondaryExplosions.push({type:'BOILER_EXPLOSION',time:now,location:'MIDSHIPS'});
        D.flotation=clamp(D.flotation+.18,0,1);
        D.floodRate=Math.max(D.floodRate,.00045);
        D.propulsion=clamp(D.propulsion+.35,0,1);
        engine.log?.(`${c.name} — boiler explosion amidships! Steam and debris erupted.`,'bad');
        engine.notify?.(`BOILER EXPLOSION — ${c.name} steam rupture!`, 'warn', 'KRITIEK');
        if(typeof particles!=='undefined'&&particles.spawnBoilerSteam&&c.position){
          particles.spawnBoilerSteam(c.position.xNm,c.position.yNm,1.2);
        }
        if(typeof particles!=='undefined'&&particles.spawnExplosion&&c.position){
          particles.spawnExplosion(c.position.xNm,c.position.yNm,1.0,true);
        }
      }
    }
    // Secondary magazine detonation under heavy fire on armed / ammunition vessels
    const armedShip=(typeof isSurfaceCombatant==='function'&&isSurfaceCombatant(c))||/AMMUNITION|MUNITION/i.test(c.displayType||'')||(c.type==='CARGO'&&_shipHash01(`${c.id}:ammoCargo`)<.22);
    if(D.fire>.65&&!D.magazineDetonated&&armedShip){
      D.magazineTimer+=dt;
      const magThresh=16+_shipHash01(`${c.id}:mag`)*14;
      if(D.magazineTimer>=magThresh){
        D.magazineDetonated=true;
        D.secondaryExplosions.push({type:'MAGAZINE_DETONATION',time:now,location:'AFTER_HOLD'});
        D.flotation=1.0;
        D.fire=1.0;
        engine.log?.(`${c.name} — catastrophic magazine detonation! Hull breaking apart.`,'bad');
        engine.notify?.(`SECONDARY DETONATION — ${c.name} magazine ruptured!`, 'warn', 'KRITIEK');
        if(typeof particles!=='undefined'&&particles.spawnFireBurst&&c.position){
          particles.spawnFireBurst(c.position.xNm,c.position.yNm,1.8);
        }
        if(typeof particles!=='undefined'&&particles.spawnExplosion&&c.position){
          particles.spawnExplosion(c.position.xNm,c.position.yNm,2.2,true);
        }
        beginShipSinking(engine,c,'STRUCTURAL');
        return;
      }
    }
    if((D.shudderAmp||0)>0.005){
      D.shudderTime=(D.shudderTime||0)+dt;
      D.shudderAmp*=Math.exp(-dt/1.15);
    }else{
      D.shudderAmp=0;D.shudderTime=0;
    }
    const tau=Math.max(10,((c.lengthYards||400)/400)*16);
    const frac=1-Math.exp(-dt/tau);
    if(Number.isFinite(D.visualTrim))D.visualTrim+=(D.trim-D.visualTrim)*frac;
    if(Number.isFinite(D.visualList))D.visualList+=(D.list-D.visualList)*frac;
    if(Number.isFinite(D.visualFlotation))D.visualFlotation+=(D.flotation-D.visualFlotation)*frac;
  }
  if(dt>0&&D.compartments){
    const targetTrim=clamp((D.compartments.bow*.85+D.compartments.forwardHold*.45)-(D.compartments.stern*.80+D.compartments.afterHold*.40),-1,1);
    if(Math.abs(targetTrim)>.05)D.trim+=clamp(targetTrim-D.trim,-dt*.004,dt*.004);
    const targetList=clamp((D.hitSide||(D.list>=0?1:-1))*(D.compartments.midships*.42+D.compartments.forwardHold*.25+D.compartments.afterHold*.25+D.compartments.bow*.12+D.compartments.stern*.12),-1,1);
    if(Math.abs(targetList)>.05)D.list+=clamp(targetList-D.list,-dt*.003,dt*.003);
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
