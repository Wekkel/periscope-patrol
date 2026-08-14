// ═══════════════════════════════════════════════════ MEGA PACIFIC — MISSION FRAMEWORK
// Mission rules reuse the same world truth as normal patrol play. A critical
// target may be abstracted outside the tactical bubble for performance, but it
// keeps one identity and one route state; mission code must never respawn or
// relocate it merely because the player travelled a long way to find it.
const MISSION_PRIMARY_TYPES=[
  'CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD',
  'SPECIAL_TRANSPORT','MINELAYING','SHADOW_REPORT','ESCORT_HUNT','HARBOR_STRIKE',
  'RECON_INSERTION','RECON_EXTRACTION','WEATHER_AMBUSH'
];
const MISSION_DEFINITIONS={
  CONVOY_INTERDICTION:{title:'CONVOY INTERDICTION',reward:900,
    briefing:'Hunt enemy merchant traffic in the assigned patrol area. Locate the convoy, neutralize a meaningful share of shipping, survive the escort response and return.'},
  HIGH_VALUE_INTERCEPT:{title:'HIGH VALUE INTERCEPT',reward:1700,
    briefing:'Intelligence places a high-value ship on a known shipping route. Reports are imperfect but the target is persistent; intercept, identify and destroy or mission-kill it.'},
  RECONNAISSANCE:{title:'ANCHORAGE RECONNAISSANCE',reward:1500,
    briefing:'Approach the enemy anchorage, visually identify the assigned targets and withdraw. Weapons are discretionary; opening fire will compromise the reconnaissance.'},
  LIFEGUARD:{title:'LIFEGUARD',reward:1900,
    briefing:'Take station near a scheduled carrier strike. Locate a downed airman with bridge watch or SJ radar, recover him on the surface, then return.'},
  SPECIAL_TRANSPORT:{title:'SPECIAL TRANSPORT / COASTWATCHERS',reward:1750,
    briefing:'Make a night rendezvous close to enemy-held coast, remain surfaced and nearly stopped while the coastwatcher party and supplies go ashore, then clear the area.'},
  MINELAYING:{title:'MINELAYING',reward:1650,
    briefing:'Reach the assigned shipping lane or harbor approach and lay the complete pattern. Mine release is automatic once the boat is correctly positioned, submerged, slow and aligned.'},
  SHADOW_REPORT:{title:'SHADOW & REPORT',reward:1550,
    briefing:'Find the assigned convoy and shadow it without provoking the escort screen. Build a useful movement report, transmit it automatically when complete, then return.'},
  ESCORT_HUNT:{title:'ESCORT HUNT',reward:2100,
    briefing:'COMSUBPAC has prioritized a named Japanese destroyer or escort. Locate, identify and sink or mission-kill that warship.'},
  HARBOR_STRIKE:{title:'HARBOR STRIKE',reward:2600,
    briefing:'Penetrate the enemy anchorage, neutralize the assigned high-value unit and withdraw outside the harbor defenses.'},
  RECON_INSERTION:{title:'RECON PARTY INSERTION',reward:2050,
    briefing:'Land a reconnaissance party on an enemy-held coast at night. Surface nearly stopped at the rendezvous, complete the transfer, then clear the coast.'},
  RECON_EXTRACTION:{title:'RECON PARTY EXTRACTION',reward:2200,
    briefing:'Recover an Allied reconnaissance/coastwatcher party from enemy-held coast. Make the night pickup surfaced and nearly stopped, then escape before the patrol response closes.'},
  WEATHER_AMBUSH:{title:'SQUALL AMBUSH',reward:1800,
    briefing:'Use poor visibility as concealment. Locate the convoy and score a hit while rain, squall or darkness materially reduces visual range.'}
};

function _missionHash(seed,text){
  let h=((Number(seed)||1)*2654435761)>>>0;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967295;
}
function _missionObj(c,id){return (c.objectives||[]).find(o=>o.id===id);}
function _missionSetDone(c,id,done=true){const o=_missionObj(c,id);if(o)o.done=!!done;return o;}
function _missionPacingStage(c,m){
  if(m.result!=='ACTIVE')return'RETURN';const done=id=>!!_missionObj(c,id)?.done;
  if(['escape','evade','withdraw'].some(done))return'WITHDRAW';
  const actionId=m.type==='SHADOW_REPORT'?(m.contactKeeperVersion?'attack':'report'):{CONVOY_INTERDICTION:'attack',HIGH_VALUE_INTERCEPT:'neutralize',RECONNAISSANCE:'identify',LIFEGUARD:'recover',SPECIAL_TRANSPORT:'transfer',RECON_INSERTION:'transfer',RECON_EXTRACTION:'transfer',MINELAYING:'lay',ESCORT_HUNT:'neutralize',HARBOR_STRIKE:'neutralize',WEATHER_AMBUSH:'attack'}[m.type];
  if(done(actionId))return'ACTION';
  if(['locate','intercept','approach','zone','rendezvous','station'].some(done))return'CONTACT';
  return'TRANSIT';
}
function _missionUpdatePacing(engine,m,dt){
  const s=engine.state,c=s.campaign,p=m.pacing=m.pacing||{version:1,targetMinutes:30,activeSeconds:0,cues:{}};
  const scale=Number(s.time.timeScale)||0;if(scale>0&&!s.time.transitUntil)p.activeSeconds+=Math.min(1,dt/Math.max(1,scale));
  p.stage=_missionPacingStage(c,m);const min=p.activeSeconds/60,cue=(key,text)=>{if(p.cues[key])return;p.cues[key]=true;engine.captainLog?.('MISSION_PACING',text,{stage:p.stage,activeMinutes:Math.round(min)},`pacing:${key}`);engine.notify(text,'warn');};
  if(min>=8&&p.stage==='TRANSIT')cue('contact','NAVIGATOR — contact window is slipping. Plot the latest intelligence, choose a water-safe intercept and use TRANSIT for the empty sea miles.');
  if(min>=20&&['TRANSIT','CONTACT'].includes(p.stage))cue('action','CAPTAIN — the tactical window is narrowing. Recheck course, target movement and disengagement water before committing.');
  if(min>=26&&p.stage==='ACTION')cue('withdraw','EXECUTIVE OFFICER — primary action is complete. Break contact and preserve a clear route toward friendly water.');
}
function _missionSafePoint(engine,origin,bearingDeg,distanceNm,minDepthFt=24){
  const A=engine.areaBounds?.(),base=origin||engine.state.playerSub.position;
  for(let ring=0;ring<5;ring++)for(let side=0;side<12;side++){
    const br=normDeg(bearingDeg+(side===0?0:((side+1)>>1)*(side%2?15:-15))),r=degToRad(br),d=distanceNm+ring*.55;
    let p={xNm:base.xNm+Math.sin(r)*d,yNm:base.yNm-Math.cos(r)*d};
    if(A)p={xNm:clamp(p.xNm,A.x0+2,A.x1-2),yNm:clamp(p.yNm,A.y0+2,A.y1-2)};
    if(typeof Bathy==='undefined'||!engine.state.world.terrain?.length||Bathy.feet(p.xNm,p.yNm)>=minDepthFt)return p;
  }
  return engine.clampToArea?engine.clampToArea({...base}):{...base};
}
function _missionRoutePoint(engine,aheadNm=12){
  const W=engine.state.world,sub=engine.state.playerSub,route=(W.convoyRoutes||[])[0],path=route&&engine.ensureWaterRoute?.(route);
  if(path&&path.length>1){const pr=routeProject(path,sub.position),q=routeAdvanceOneWay(path,pr.s,aheadNm);return{pos:q.pos,heading:q.heading,routeS:q.s,routeDir:1};}
  const p=_missionSafePoint(engine,sub.position,sub.heading,aheadNm,30);return{pos:p,heading:sub.heading,routeS:null,routeDir:null};
}
function _missionNearEnemyPort(engine,rangeNm=2.2){
  const s=engine.state,sub=s.playerSub,ports=(s.world.ports||[]).filter(p=>p.side==='ENEMY');
  let port=ports[0]||null;if(ports.length>1)port=ports.slice().sort((a,b)=>distNm(sub.position,a.pos)-distNm(sub.position,b.pos))[0];
  if(!port)return{port:null,pos:_missionSafePoint(engine,sub.position,sub.heading,12,30)};
  const out=bearingBetween(port.pos,sub.position);return{port,pos:_missionSafePoint(engine,port.pos,out,rangeNm,20)};
}
function _missionLabel(type){return MISSION_DEFINITIONS[type]?.title||String(type||'PATROL').replaceAll('_',' ');}
function _missionShipNeutralized(c){
  if(!c)return false;if(c.sunk)return true;const D=typeof ensureShipDamage==='function'?ensureShipDamage(c):c.shipDamage;
  return !!(D&&(D.abandoned||D.founderingAt!=null||D.propulsion>=.90||D.flotation>=.94));
}
function _missionMainMerchants(engine){
  const W=engine.state.world,live=(W.contacts||[]).filter(x=>x.convoyId==='MAIN'&&!isSurfaceCombatant(x));
  if(live.length)return live;
  const g=W.traffic?.primaryGroup;
  return g?.state==='ABSTRACT'?(g.savedMembers||[]).filter(x=>!isSurfaceCombatant(x)):[];
}
function _missionMainCombatants(engine){
  const W=engine.state.world,live=(W.contacts||[]).filter(x=>x.convoyId==='MAIN'&&isSurfaceCombatant(x));
  if(live.length)return live;
  const g=W.traffic?.primaryGroup;
  return g?.state==='ABSTRACT'?(g.savedMembers||[]).filter(x=>isSurfaceCombatant(x)):[];
}
/* Resolve a mission contact whether it is currently simulated at full fidelity
   or parked inside the primary group's abstract LOD record. The returned
   abstract position is reconstructed from the group's current route position,
   so intelligence never points at the stale point where it dematerialized. */
function _missionContact(engine,id){
  const W=engine.state.world,live=(W.contacts||[]).find(x=>x.id===id);if(live)return live;
  const g=W.traffic?.primaryGroup,saved=g?.state==='ABSTRACT'&&(g.savedMembers||[]).find(x=>x.id===id);if(!saved)return null;
  const r=degToRad(g.heading||0),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r),f=saved._trafficPrimaryFwd||0,side=saved._trafficPrimarySide||0;
  return{...saved,position:{xNm:g.position.xNm+fx*f+sx*side,yNm:g.position.yNm+fy*f+sy*side},heading:g.heading,speedKnots:saved.speedKnots||saved.baseSpeed||g.speedKnots,_abstractMissionContact:true};
}
function _missionVisualTrack(W,id){
  const tr=W.contactTracks?.[id];return tr&&tr.confidence>=.60&&(tr.positionSource==='VISUAL'||tr.source==='VISUAL'||tr.lastSensorSource==='VISUAL')?tr:null;
}
function _missionRefreshIntel(engine,m,force=false){
  const s=engine.state,W=s.world,now=s.time.elapsedSeconds||0;if(!m?.targetId)return false;
  if(!force&&now<(m.nextIntelAt||0))return false;
  const t=_missionContact(engine,m.targetId);if(!t?.position)return false;
  const seq=(m.intelSeq||0)+1,seed=s.campaign.scenarioSeed||1;
  // Reports improve modestly as the patrol develops, but remain uncertain. No
  // GPS breadcrumb: the player still has to solve an intercept from old intel.
  const unc=clamp(4.2-seq*.32+_missionHash(seed,`${m.type}:intel-unc:${seq}`)*1.5,1.25,5.2),br=degToRad(_missionHash(seed,`${m.type}:intel-brg:${seq}`)*360),err=unc*(.25+.65*_missionHash(seed,`${m.type}:intel-err:${seq}`));
  m.intelSeq=seq;m.intelFix=engine.clampToArea({xNm:t.position.xNm+Math.sin(br)*err,yNm:t.position.yNm-Math.cos(br)*err});
  m.intelUncertaintyNm=unc;m.intelCourse=t.heading;m.intelSpeedKn=t.speedKnots;m.intelReportedAt=now;
  m.nextIntelAt=now+(22+_missionHash(seed,`${m.type}:intel-next:${seq}`)*20)*60;
  if(!force){engine.captainLog?.('INTELLIGENCE_UPDATE',`${m.targetLabel||'Mission target'} reported course ${fmtDeg(m.intelCourse||0)}, speed ${Math.round(m.intelSpeedKn||0)} kn.`,{missionType:m.type},`intel:${m.type}:${seq}`);engine.notify(`RADIO INTELLIGENCE — ${m.targetLabel||'target'} reported within ±${unc.toFixed(1)} nm.`, 'warn');}
  return true;
}
function _missionWeatherAmbushCondition(state,target){
  if(!target?.position)return false;const wx=weatherBetween(state,state.playerSub.position,target.position),base=state.world.environment?._weatherBaseVisibilityNm||12;
  return wx.precipitation>.12||wx.intensity>.20||wx.visibilityNm<Math.max(4.5,base*.62)||(state.world.environment.daylight??1)<.18;
}
function missionBriefingText(state){
  const m=state?.campaign?.primaryMission;if(!m)return'';let extra='';
  if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT')extra=` Reported target: ${m.targetLabel||'mission target'}. Radio intelligence will update periodically; there is no arbitrary expiry clock.`;
  else if(m.type==='RECONNAISSANCE'||m.type==='HARBOR_STRIKE')extra=` Assigned anchorage: ${m.siteName||'enemy anchorage'}.`;
  else if(m.type==='LIFEGUARD')extra=' The strike clock begins only after you reach lifeguard station; a raft is a very small visual/radar target.';
  else if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type))extra=` Rendezvous: ${m.siteName||'enemy coast'}. Night, surfaced, below 2 knots.`;
  else if(m.type==='MINELAYING')extra=` Pattern: ${m.mineCount||12} mines; release interval is automatic.`;
  else if(m.type==='SHADOW_REPORT')extra=' Hold the convoy at a useful shadowing range without a firm enemy prosecution.';
  else if(m.type==='WEATHER_AMBUSH')extra=' A long-lived squall has been reported near the shipping lane. Poor visibility or darkness must materially cover the successful attack.';
  return `${m.briefing||MISSION_DEFINITIONS[m.type]?.briefing||''}${extra}`;
}
function missionProgressText(state){
  const m=state?.campaign?.primaryMission;if(!m)return'';
  if(m.result==='SUCCESS')return'PRIMARY COMPLETE — return to base';if(m.result==='FAILED')return`PRIMARY FAILED${m.failReason?` — ${m.failReason}`:''}`;
  if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT'){const age=(state.time.elapsedSeconds-(m.intelReportedAt||0))/60;return`${m.targetLabel||'TARGET'} · intel ${Math.max(0,Math.round(age))} min old · ±${(m.intelUncertaintyNm||0).toFixed(1)} nm`;}
  if(m.type==='RECONNAISSANCE')return`${m.identifiedIds?.length||0}/${m.targetIds?.length||0} targets identified${m.compromised?' · anchorage alerted':''}`;
  if(m.type==='LIFEGUARD')return m.recovered?'Airman aboard':m.survivorSpawned?(m.survivorSeen?'Raft located — close surfaced and slow':'Search for downed airman'):'Proceed to lifeguard station';
  if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type))return m.transferComplete?(m.departed?'Operation complete — coast clear':`Operation complete — clear ${m.escapeRadiusNm||4} nm`):`Transfer ${Math.round((m.holdProgress||0)/(m.holdRequired||90)*100)}%${m.compromised?' · response inbound':''}`;
  if(m.type==='MINELAYING')return`Mine pattern ${m.minesLaid||0}/${m.mineCount||12}`;
  if(m.type==='SHADOW_REPORT')return`Shadowing ${Math.round((m.shadowSeconds||0)/60)}/${Math.ceil((m.shadowRequired||480)/60)} min${m.detected?' · escort alerted':''}`;
  if(m.type==='HARBOR_STRIKE')return`${m.targetLabel||'HVT'} · ${m.neutralized?'neutralized — withdraw':'in anchorage'}`;
  if(m.type==='WEATHER_AMBUSH')return m.coveredHit?'Covered hit scored':'Find convoy · attack under squall/rain/darkness';
  if(m.type==='CONVOY_INTERDICTION'){
    const ships=Math.max(0,m.neutralizedShips||0),shipGoal=Math.max(1,m.requiredNeutralizedShips||2),tons=Math.max(0,m.neutralizedTonnage||0),initial=Math.max(1,m.initialMerchantTonnage||1),pct=Math.round(tons/initial*100),goal=Math.round((m.requiredNeutralizedTonnagePct||.45)*100);
    return`Neutralized ${ships}/${shipGoal} ships · ${pct}%/${goal}% convoy tonnage`;
  }
  return _missionLabel(m.type);
}

(function installMissionFramework(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureMissionFramework(){
      const s=this.state,c=s.campaign,W=s.world;if(c.missionStatus==='TRAINING'||c.missionStatus==='MENU')return null;c.optionalObjectives=Array.isArray(c.optionalObjectives)?c.optionalObjectives:[];W.missionObjects=Array.isArray(W.missionObjects)?W.missionObjects:[];
      if(!MISSION_PRIMARY_TYPES.includes(c.missionType))c.missionType='CONVOY_INTERDICTION';
      if(!c.primaryMission){const d=MISSION_DEFINITIONS[c.missionType];c.primaryMission={type:c.missionType,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:s.time.elapsedSeconds||0,legacy:true,pacing:{version:1,targetMinutes:30,activeSeconds:0,cues:{}}};}
      c.primaryMission.pacing=c.primaryMission.pacing||{version:1,targetMinutes:30,activeSeconds:0,cues:{}};
      const ids=c.missionType==='CONVOY_INTERDICTION'?['locate','attack','evade','return']:[];if(ids.length&&(c.objectives||[]).every(o=>!o.id))(c.objectives||[]).forEach((o,i)=>o.id=ids[i]||`objective-${i+1}`);
      return c.primaryMission;
    },

    chooseMissionType(requested='AUTO'){
      if(MISSION_PRIMARY_TYPES.includes(requested))return requested;
      const c=this.state.campaign,area=c.patrolArea,seed=c.scenarioSeed||1;
      const pools={
        'Truk Approaches':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','HARBOR_STRIKE','MINELAYING','LIFEGUARD','SHADOW_REPORT','WEATHER_AMBUSH'],
        'Java Sea':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','SPECIAL_TRANSPORT','RECON_INSERTION','MINELAYING','RECONNAISSANCE','WEATHER_AMBUSH','SHADOW_REPORT'],
        'Yellow Sea':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH'],
        'Kii Suido / Honshu Approaches':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','RECONNAISSANCE','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH'],
        'East China Sea / Formosa Approaches':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','SHADOW_REPORT','WEATHER_AMBUSH','LIFEGUARD','MINELAYING'],
        'Sulu Sea / Tawi-Tawi':['CONVOY_INTERDICTION','ESCORT_HUNT','RECON_INSERTION','RECON_EXTRACTION','SPECIAL_TRANSPORT','SHADOW_REPORT','WEATHER_AMBUSH'],
        'Kurile / Hokkaido Approaches':['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','ESCORT_HUNT','LIFEGUARD','WEATHER_AMBUSH','SHADOW_REPORT']
      };
      const pool=pools[area]||['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD','SPECIAL_TRANSPORT','MINELAYING','SHADOW_REPORT','ESCORT_HUNT','RECON_INSERTION','RECON_EXTRACTION','WEATHER_AMBUSH'];
      return pool[Math.floor(_missionHash(seed,`${area}:${c.patrolNumber}:mission`)*pool.length)%pool.length];
    },

    configureMission(requested='AUTO',options={}){
      const s=this.state,c=s.campaign,W=s.world,type=this.chooseMissionType(requested),d=MISSION_DEFINITIONS[type],now=s.time.elapsedSeconds||0;
      c.missionType=type;c.primaryMission={type,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:now,pacing:{version:1,targetMinutes:Number(options.targetMinutes)||30,activeSeconds:0,cues:{}}};c.optionalObjectives=[];W.missionObjects=[];
      const m=c.primaryMission,setObjs=rows=>{c.objectives=rows.map(([id,text])=>({id,text,done:false,failed:false}));};
      if(type==='CONVOY_INTERDICTION'){
        setObjs([['locate','Locate enemy convoy'],['attack','Neutralize a meaningful share of enemy shipping'],['evade','Evade escort vessels'],['return','Return to friendly port']]);
        const merchants=_missionMainMerchants(this),tons=merchants.reduce((n,x)=>n+(x.tonsFactor||0),0);Object.assign(m,{initialMerchantCount:merchants.length,initialMerchantTonnage:tons,requiredNeutralizedShips:Math.max(1,Math.min(2,merchants.length)),requiredNeutralizedTonnagePct:.45,neutralizedShips:0,neutralizedTonnage:0});
      }else if(type==='HIGH_VALUE_INTERCEPT'){
        setObjs([['intercept','Reach the reported target area'],['identify','Identify the high-value target'],['neutralize','Sink or disable the high-value target'],['return','Return to friendly port']]);
        const merchants=_missionMainMerchants(this);let t=merchants.find(x=>x.type==='TANKER')||merchants[0],roll=_missionHash(c.scenarioSeed,`hvt:${c.patrolNumber}`),kind=roll<.46?'TANKER':roll<.82?'TRANSPORT':'CARRIER';
        if(t){if(kind==='TANKER')Object.assign(t,{name:'Fleet Oiler',type:'TANKER',displayType:'FLEET OILER',lengthYards:560,tonsFactor:9200,visualProfile:1.16});else if(kind==='TRANSPORT')Object.assign(t,{name:'Army Transport',type:'MERCHANT',displayType:'TROOP TRANSPORT',lengthYards:500,tonsFactor:7600,visualProfile:1.04});else Object.assign(t,{name:'Light Carrier',type:'CARRIER',displayType:'LIGHT CARRIER',lengthYards:680,tonsFactor:18000,visualProfile:1.34,hasSonar:false});t.missionRole='HIGH_VALUE_TARGET';Object.assign(m,{targetId:t.id,targetLabel:t.displayType||t.name,targetKind:kind,intelSeq:0,nextIntelAt:now});_missionRefreshIntel(this,m,true);}
      }else if(type==='RECONNAISSANCE'){
        setObjs([['approach','Approach the reconnaissance area'],['identify','Visually identify the assigned anchorage targets'],['escape','Withdraw at least 8 nm from the anchorage'],['return','Return to friendly port']]);
        const q=_missionNearEnemyPort(this,2.0),center=q.pos,targets=[];
        if(c.patrolArea==='Truk Approaches')for(const id of ['H-02','H-03']){const x=W.contacts.find(z=>z.id===id);if(x){x.missionRole='RECON_TARGET';targets.push(x);}}
        if(targets.length<2){const names=[['REC-01','Naval Auxiliary','NAVAL AUXILIARY',430,4700],['REC-02','Army Transport','TROOP TRANSPORT',490,7100]];for(let i=targets.length;i<2;i++){const br=normDeg(bearingBetween(center,s.playerSub.position)+(i?78:-72)),pos=_missionSafePoint(this,center,br,.7+i*.35,18),spec=names[i],x={id:spec[0],name:spec[1],type:'MERCHANT',displayType:spec[2],lengthYards:spec[3],tonsFactor:spec[4],visualProfile:.95,acousticBase:.08,position:pos,heading:normDeg(br+90),desiredHeading:normDeg(br+90),speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyRole:'ANCHORAGE',convoyId:'RECON',missionRole:'RECON_TARGET'};W.contacts.push(x);targets.push(x);}}
        Object.assign(m,{siteName:q.port?.name||'enemy anchorage',center:{...center},radiusNm:3.2,escapeRadiusNm:8,targetIds:targets.map(x=>x.id),identifiedIds:[],weaponBaseline:{torps:(s.weapons.nextTorpedoId||1)-1,gun:s.weapons.deckGun?.shots||0},compromised:false});
      }else if(type==='LIFEGUARD'){
        setObjs([['station','Take lifeguard station'],['locate','Locate the downed airman'],['recover','Recover the airman'],['return','Return to friendly port']]);const q=_missionRoutePoint(this,10+_missionHash(c.scenarioSeed,'lifeguard-range')*6);Object.assign(m,{station:{...q.pos},stationRadiusNm:2.5,stationArrivedAt:null,stationWaitSec:180+_missionHash(c.scenarioSeed,'lifeguard-time')*300,strikeAt:null,survivorId:'LIFE-01',survivorSpawned:false,survivorSeen:false,recovered:false,rescueHold:0});
      }else if(type==='SPECIAL_TRANSPORT'||type==='RECON_INSERTION'||type==='RECON_EXTRACTION'){
        const pickup=type==='RECON_EXTRACTION',insert=type==='RECON_INSERTION';setObjs([['rendezvous',pickup?'Reach the extraction rendezvous at night':insert?'Reach the reconnaissance landing at night':'Reach the coastal rendezvous at night'],['transfer',pickup?'Recover the reconnaissance party':insert?'Put the reconnaissance party ashore':'Put the coastwatcher party and supplies ashore'],['escape','Clear the enemy coast'],['return','Return to friendly port']]);
        const q=_missionNearEnemyPort(this,pickup?2.8:2.4);Object.assign(m,{siteName:q.port?.name||'enemy coast',rendezvous:{...q.pos},radiusNm:.18,escapeRadiusNm:4.5,holdRequired:pickup?60:insert?75:90,holdProgress:0,transferComplete:false,departed:false,responseAt:null,compromised:false,operationLabel:pickup?'RECON PARTY ABOARD':insert?'RECON PARTY ASHORE':'COASTWATCHERS ASHORE'});
      }else if(type==='MINELAYING'){
        setObjs([['zone','Reach the assigned minefield box'],['lay','Lay the complete mine pattern'],['return','Return to friendly port']]);const q=_missionRoutePoint(this,12+_missionHash(c.scenarioSeed,'mine-range')*7);Object.assign(m,{zone:{...q.pos},zoneRadiusNm:.75,layHeading:q.heading,mineCount:12,minesLaid:0,layClock:0,mines:[]});
      }else if(type==='SHADOW_REPORT'){
        setObjs([['locate','Locate the assigned convoy'],['shadow','Shadow the convoy without firm enemy contact'],['report','Complete the movement report'],['return','Return to friendly port']]);Object.assign(m,{shadowSeconds:0,shadowRequired:480,shadowMinNm:2.2,shadowMaxNm:8.0,detected:false});
      }else if(type==='ESCORT_HUNT'){
        setObjs([['locate','Reach the reported escort area'],['identify','Identify the assigned warship'],['neutralize','Sink or disable the assigned escort'],['return','Return to friendly port']]);let t=_missionMainCombatants(this).find(x=>x.type==='DESTROYER')||_missionMainCombatants(this)[0];if(!t){const q=_missionRoutePoint(this,16),pos={...q.pos};t={id:'EH-01',name:'Named Fleet Destroyer',type:'DESTROYER',displayType:'DESTROYER',lengthYards:350,tonsFactor:1900,visualProfile:.75,acousticBase:.68,hasSonar:true,side:'ENEMY',position:pos,heading:q.heading,desiredHeading:q.heading,speedKnots:18,baseSpeed:18,desiredSpeed:18,convoyId:'MAIN',convoyRole:'ESCORT',formationIndex:99,screenRole:'ROAMING_SCOUT',aswRole:'SCREEN',dcRemaining:38};W.contacts.push(t);}t.missionRole='ESCORT_HUNT_TARGET';t.name=t.type==='DESTROYER'?'Named Fleet Destroyer':'Named Kaibokan Escort';Object.assign(m,{targetId:t.id,targetLabel:t.displayType||t.name,intelSeq:0,nextIntelAt:now});_missionRefreshIntel(this,m,true);
      }else if(type==='HARBOR_STRIKE'){
        setObjs([['approach','Penetrate the enemy anchorage'],['neutralize','Neutralize the assigned high-value unit'],['escape','Withdraw outside the harbor defenses'],['return','Return to friendly port']]);const H=W.harbor,q=H?{port:{name:H.name},pos:{...H.center}}:_missionNearEnemyPort(this,1.5),targets=W.contacts.filter(x=>x.harborTarget&&!x.sunk);let t=targets.find(x=>x.type==='CARRIER'||x.type==='HEAVY_CRUISER')||targets[0];if(!t){const pos={...q.pos};t={id:'HS-01',name:'Anchorage Naval Auxiliary',type:'MERCHANT',displayType:'NAVAL AUXILIARY',lengthYards:455,tonsFactor:5600,visualProfile:1.0,acousticBase:.05,side:'ENEMY',position:pos,heading:90,desiredHeading:90,speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyRole:'ANCHORAGE',convoyId:'HARBOR_STRIKE'};W.contacts.push(t);}t.missionRole='HARBOR_STRIKE_TARGET';Object.assign(m,{siteName:H?.name||q.port?.name||'enemy anchorage',center:H?{...H.center}:{...q.pos},radiusNm:H?.innerRadiusNm||2,escapeRadiusNm:(H?.outerRadiusNm||5)+1,targetId:t.id,targetLabel:t.displayType||t.name,neutralized:false});
      }else if(type==='WEATHER_AMBUSH'){
        setObjs([['locate','Locate the assigned convoy'],['cover','Enter useful rain/squall or darkness'],['attack','Score a covered hit on enemy shipping'],['return','Return to friendly port']]);Object.assign(m,{hitBaseline:(s.weapons.hits||[]).length,coveredHit:false});const ws=W.weatherSystem;if(ws?.cells?.length){const q=_missionRoutePoint(this,10+_missionHash(c.scenarioSeed,'wx-ambush')*10),cell=ws.cells[0];cell.center={...q.pos};cell.radiusNm=Math.max(cell.radiusNm||6,7);cell.speedKnots=Math.min(cell.speedKnots||10,8);cell.lifeSec=Math.max(cell.lifeSec||0,10*3600);cell.bornAt=now;m.weatherCellId=cell.id;}
      }
      this.captainLog?.('MISSION_ASSIGNED',`${d.title} orders received.`,{missionType:type},'mission-assigned');this.log(`PRIMARY MISSION — ${d.title}. ${d.briefing}`,'warn');return m;
    },

    _missionStopTransit(reason){const t=this.state.time;if((t.timeScale||1)>1||t.transitUntil){t.timeScale=1;t.transitUntil=0;t.transitOpen=false;t.stopReason=reason;t.stopReasonAt=t.elapsedSeconds;}},
    _missionFinish(success,reason){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework();if(m.result!=='ACTIVE')return false;m.result=success?'SUCCESS':'FAILED';m.completedAt=s.time.elapsedSeconds;m.failReason=success?null:reason;if(success&&!m.rewardCredited){c.score+=(m.reward||0);m.rewardCredited=true;}c.missionStatus='RETURN TO BASE';this.captainLog?.(success?'MISSION_COMPLETED':'MISSION_FAILED',`${m.title} ${success?'completed':'failed'}${reason?`: ${reason}`:''}.`,{missionType:m.type,reward:success?m.reward:0},`mission-result:${m.type}`);this.notify(`${m.title} — ${success?'PRIMARY OBJECTIVE COMPLETE':'MISSION FAILED'}${success&&m.reward?` · +${m.reward} pts`:''}. Return to base.`,success?'ok':'bad');audio.event?.(success?'PRIMARY_OBJECTIVE_COMPLETE':'MISSION_FAILED');this._missionStopTransit(success?'mission complete':'mission failed');return true;
    },

    _spawnLifeguardSurvivor(m){
      const s=this.state,W=s.world;if(m.survivorSpawned)return;const br=_missionHash(s.campaign.scenarioSeed,'raft-brg')*360,r=.8+_missionHash(s.campaign.scenarioSeed,'raft-rng')*1.6,p=_missionSafePoint(this,m.station,br,r,10),raft={id:m.survivorId,name:'Downed Airman',type:'RAFT',displayType:'LIFE RAFT',lengthYards:7,tonsFactor:0,visualProfile:.12,acousticBase:0,side:'FRIENDLY',position:p,heading:0,desiredHeading:0,speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyId:'LIFEGUARD',convoyRole:'SURVIVOR',missionRole:'SURVIVOR'};W.contacts.push(raft);m.survivorSpawned=true;m.survivorPos={...p};m.searchCenter={xNm:p.xNm+(_missionHash(s.campaign.scenarioSeed,'raft-x')-.5)*2.4,yNm:p.yNm+(_missionHash(s.campaign.scenarioSeed,'raft-y')-.5)*2.4};m.searchUncertaintyNm=1.6;this.captainLog?.('AIRMAN_DOWN','Carrier strike reports an airman down in the lifeguard sector.',{},'airman-down');this.notify('LIFEGUARD — AIRMAN DOWN. Search the assigned sector by bridge watch or SJ radar.','warn');this._missionStopTransit('airman down in lifeguard sector');
    },

    updateMissionFramework(dt){
      const s=this.state,c=s.campaign;if(c.missionStatus==='TRAINING'||c.missionStatus==='MENU')return;const m=this.ensureMissionFramework(),sub=s.playerSub,W=s.world,now=s.time.elapsedSeconds||0;if(!m||m.result!=='ACTIVE'||c.missionStatus!=='PATROL')return;_missionUpdatePacing(this,m,dt);
      if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT')_missionRefreshIntel(this,m,false);
      if(m.type==='LIFEGUARD'){
        if(Number.isFinite(m.strikeAt)&&now>=m.strikeAt&&!m.survivorSpawned)this._spawnLifeguardSurvivor(m);const raft=m.survivorSpawned&&W.contacts.find(x=>x.id===m.survivorId),tr=raft&&W.contactTracks[m.survivorId];if(raft&&tr&&!m.survivorSeen&&((tr.positionSource||tr.source)==='VISUAL'||(tr.positionSource||tr.source)==='SJ RADAR'||tr.lastSensorSource==='SJ RADAR')){m.survivorSeen=true;m.survivorPos={...(tr.plotPosition||raft.position)};_missionSetDone(c,'locate');this.notify('LIFEGUARD — LIFE RAFT LOCATED. Close surfaced and slow for recovery.','ok');}if(raft&&m.survivorSeen){const close=distNm(sub.position,raft.position)<=.08&&sub.depthFeet<8&&sub.propulsion.speedKnots<=2.5;m.rescueHold=close?m.rescueHold+dt:Math.max(0,m.rescueHold-dt*.5);if(m.rescueHold>=15&&!m.recovered){m.recovered=true;_missionSetDone(c,'recover');W.contacts=W.contacts.filter(x=>x.id!==m.survivorId);delete W.contactTracks[m.survivorId];this.captainLog?.('AIRMAN_RECOVERED','Downed airman recovered.',{},'airman-recovered');this._missionFinish(true);}}
      }else if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type)){
        const rng=distNm(sub.position,m.rendezvous),night=(W.environment.daylight??1)<.30,surf=sub.depthFeet<8,slow=sub.propulsion.speedKnots<=2;if(rng<=.55)_missionSetDone(c,'rendezvous');if(rng<=m.radiusNm&&night&&surf&&slow&&!m.transferComplete){if(m.responseAt==null)m.responseAt=now+480;m.holdProgress+=dt;if(m.holdProgress>=m.holdRequired){m.transferComplete=true;_missionSetDone(c,'transfer');const event=m.type==='RECON_EXTRACTION'?'RECON_PARTY_RECOVERED':m.type==='RECON_INSERTION'?'RECON_PARTY_LANDED':'COASTWATCHERS_ASHORE';this.captainLog?.(event,m.operationLabel.replaceAll('_',' ').toLowerCase()+'.',{missionType:m.type},event.toLowerCase());this.notify(`${m.title} — ${m.operationLabel}. Clear the enemy coast.`, 'ok');}}if(m.responseAt!=null&&now>=m.responseAt&&!m.departed&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.45,0,1.5);W.airThreat.nextCheck=Math.min(W.airThreat.nextCheck||60,3);this.notify('ENEMY PATROL RESPONSE — aircraft reported approaching the rendezvous.','bad');this._missionStopTransit('enemy patrol response');}if(m.transferComplete&&rng>=m.escapeRadiusNm&&!m.departed){m.departed=true;_missionSetDone(c,'escape');this._missionFinish(true);}
      }else if(m.type==='MINELAYING'){
        const rng=distNm(sub.position,m.zone),aligned=Math.abs(shortDelta(sub.heading,m.layHeading))<=30,depth=sub.depthFeet>=35&&sub.depthFeet<=90,slow=sub.propulsion.speedKnots>=2&&sub.propulsion.speedKnots<=5;if(rng<=m.zoneRadiusNm)_missionSetDone(c,'zone');if(rng<=m.zoneRadiusNm&&aligned&&depth&&slow&&m.minesLaid<m.mineCount){m.layClock+=dt;while(m.layClock>=8&&m.minesLaid<m.mineCount){m.layClock-=8;m.minesLaid++;const side=(m.minesLaid%2?1:-1)*.025,hr=degToRad(sub.heading),p={xNm:sub.position.xNm+Math.cos(hr)*side,yNm:sub.position.yNm+Math.sin(hr)*side};m.mines.push({n:m.minesLaid,pos:p,t:now});if(m.minesLaid===1)this.notify('MINE LAYING — pattern started. Maintain 2–5 kn, 35–90 ft and assigned heading.','warn');}}else m.layClock=Math.max(0,m.layClock-dt*.25);if(m.minesLaid>=m.mineCount){_missionSetDone(c,'lay');this.captainLog?.('MINEFIELD_LAID',`Mine pattern laid — ${m.mineCount} mines.`,{count:m.mineCount},'minefield-laid');this._missionFinish(true);}
      }else if(m.type==='RECONNAISSANCE'){
        const rng=distNm(sub.position,m.center);if(rng<=m.radiusNm)_missionSetDone(c,'approach');const fired=(s.weapons.nextTorpedoId||1)-1>(m.weaponBaseline?.torps||0)||(s.weapons.deckGun?.shots||0)>(m.weaponBaseline?.gun||0);if(fired&&rng<=m.escapeRadiusNm&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.35,0,1.5);this.alertEscorts?.('DECK_GUN',{...sub.position},.62);this.notify('RECONNAISSANCE COMPROMISED — weapons fire has alerted the anchorage. Complete identification and withdraw.','bad');}
      }else if(m.type==='SHADOW_REPORT'){
        const g=W.traffic?.primaryGroup,center=g?.position||(_missionMainMerchants(this)[0]?.position),rng=center?distNm(sub.position,center):Infinity,known=Object.keys(W.contactTracks||{}).some(id=>{const x=_missionContact(this,id);return x?.convoyId==='MAIN'&&W.contactTracks[id].confidence>.08;});if(known)_missionSetDone(c,'locate');const safe=W.enemy.alertState!=='ATTACKING'&&!W.enemy.contactHeld,inBand=rng>=m.shadowMinNm&&rng<=m.shadowMaxNm;if(known&&safe&&inBand){m.shadowSeconds+=dt;if(m.shadowSeconds>=m.shadowRequired){_missionSetDone(c,'shadow');_missionSetDone(c,'report');this.captainLog?.('CONVOY_SHADOWED','Convoy movement report completed without a firm enemy prosecution.',{minutes:Math.round(m.shadowSeconds/60)},'convoy-shadowed');this._missionFinish(true);}}else if(W.enemy.alertState==='ATTACKING'){m.detected=true;m.shadowSeconds=Math.max(0,m.shadowSeconds-dt*.22);}
      }else if(m.type==='WEATHER_AMBUSH'){
        const merchants=_missionMainMerchants(this),known=Object.keys(W.contactTracks||{}).some(id=>{const x=_missionContact(this,id);return x?.convoyId==='MAIN'&&W.contactTracks[id].confidence>.08;});if(known)_missionSetDone(c,'locate');const near=merchants.slice().sort((a,b)=>distNm(sub.position,a.position||{xNm:999,yNm:999})-distNm(sub.position,b.position||{xNm:999,yNm:999}))[0],cover=near&&_missionWeatherAmbushCondition(s,near);_missionSetDone(c,'cover',!!cover);const hits=s.weapons.hits||[];for(let i=m.hitBaseline||0;i<hits.length;i++){const hit=hits[i],t=_missionContact(this,hit.contactId);if(t?.convoyId==='MAIN'&&_missionWeatherAmbushCondition(s,t)){m.coveredHit=true;_missionSetDone(c,'attack');this.captainLog?.('WEATHER_AMBUSH','Successful attack made under concealment of poor visibility.',{contactId:t.id},'weather-ambush');this._missionFinish(true);break;}}m.hitBaseline=hits.length;
      }
    },

    checkPrimaryMission(){
      const s=this.state,c=s.campaign;if(c.missionStatus==='TRAINING'||c.missionStatus==='MENU')return false;const m=this.ensureMissionFramework(),W=s.world;if(!m||!MISSION_PRIMARY_TYPES.includes(m.type))return false;if(m.result!=='ACTIVE')return true;
      if(m.type==='CONVOY_INTERDICTION'){
        const members=_missionMainMerchants(this),convoyIds=new Set([...W.contacts.filter(x=>x.convoyId==='MAIN').map(x=>x.id),...(W.traffic?.primaryGroup?.savedMembers||[]).map(x=>x.id)]),located=Object.keys(W.contactTracks).some(id=>convoyIds.has(id));if(located&&!_missionObj(c,'locate')?.done){_missionSetDone(c,'locate');this.captainLog?.('CONVOY_SIGHTED','Enemy convoy sighted.',{},'convoy-sighted');}const neutralized=members.filter(_missionShipNeutralized),neutralizedTonnage=neutralized.reduce((n,x)=>n+(x.tonsFactor||0),0);m.neutralizedShips=neutralized.length;m.neutralizedTonnage=neutralizedTonnage;const initialCount=Math.max(1,m.initialMerchantCount||members.length),initialTons=Math.max(1,m.initialMerchantTonnage||members.reduce((n,x)=>n+(x.tonsFactor||0),0)),shipGoal=Math.max(1,Math.min(m.requiredNeutralizedShips||2,initialCount)),tonGoal=initialTons*(m.requiredNeutralizedTonnagePct||.45),allGone=!members.some(x=>!x.sunk)&&!this.primaryConvoyExists?.(),tacticalWin=neutralized.length>=shipGoal&&neutralizedTonnage>=tonGoal;_missionSetDone(c,'attack',allGone||tacticalWin);if(allGone||tacticalWin)this._missionFinish(true);return true;
      }
      if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT'){
        const t=_missionContact(this,m.targetId),rng=t?.position?distNm(s.playerSub.position,t.position):Infinity,tr=_missionVisualTrack(W,m.targetId);if(rng<=Math.max(5,m.intelUncertaintyNm||3))_missionSetDone(c,m.type==='ESCORT_HUNT'?'locate':'intercept');if(tr)_missionSetDone(c,'identify');if(_missionShipNeutralized(t)){_missionSetDone(c,'neutralize');this._missionFinish(true);}return true;
      }
      if(m.type==='RECONNAISSANCE'){
        m.identifiedIds=m.identifiedIds||[];for(const id of m.targetIds||[]){const tr=_missionVisualTrack(W,id);if(tr&&tr.typeEstimate&&!/UNKNOWN|SURFACE SHIP/i.test(tr.typeEstimate)&&!m.identifiedIds.includes(id)){m.identifiedIds.push(id);this.captainLog?.('RECON_TARGET_IDENTIFIED',`${tr.typeEstimate} identified in ${m.siteName}.`,{contactId:id},`recon:${id}`);}}if(m.identifiedIds.length>=(m.targetIds?.length||2))_missionSetDone(c,'identify');if(_missionObj(c,'identify')?.done&&distNm(s.playerSub.position,m.center)>=m.escapeRadiusNm){_missionSetDone(c,'escape');this._missionFinish(true);}return true;
      }
      if(m.type==='LIFEGUARD'){
        if(distNm(s.playerSub.position,m.station)<=m.stationRadiusNm){const first=!_missionObj(c,'station')?.done;_missionSetDone(c,'station');if(first||!Number.isFinite(m.stationArrivedAt)){m.stationArrivedAt=s.time.elapsedSeconds||0;m.strikeAt=m.stationArrivedAt+(m.stationWaitSec||240);this.notify(`LIFEGUARD STATION — on station. Carrier strike expected in about ${Math.ceil((m.stationWaitSec||240)/60)} minutes.`,'ok');}}return true;
      }
      if(m.type==='HARBOR_STRIKE'){
        const t=_missionContact(this,m.targetId),rng=distNm(s.playerSub.position,m.center);if(rng<=Math.max(3,m.radiusNm||2))_missionSetDone(c,'approach');if(_missionShipNeutralized(t)){m.neutralized=true;_missionSetDone(c,'neutralize');}if(m.neutralized&&rng>=m.escapeRadiusNm){_missionSetDone(c,'escape');this._missionFinish(true);}return true;
      }
      if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH'].includes(m.type))return true;
      return true;
    }
  });
})();
