// ═══════════════════════════════════════════════════ MISSION FRAMEWORK
// Mission rules reuse the same world truth as normal patrol play. A critical
// target may be abstracted outside the tactical bubble for performance, but it
// keeps one identity and one route state; mission code must never respawn or
// relocate it merely because the player travelled a long way to find it.
const MISSION_PRIMARY_TYPES=[
  'CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD',
  'SPECIAL_TRANSPORT','MINELAYING','SHADOW_REPORT','ESCORT_HUNT','HARBOR_STRIKE',
  'RECON_INSERTION','RECON_EXTRACTION','WEATHER_AMBUSH'
];
function _missionProfile(state){
  const id=state?.campaign?.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId;
  return typeof getCampaignMissionProfile==='function'?getCampaignMissionProfile(id):null;
}
function _missionDefinition(state,type){return _missionProfile(state)?.definitions?.[type]||null;}
function _missionContent(state,key){return _missionProfile(state)?.content?.[key]||null;}
function _missionApplyVesselSpec(v,spec,state){
  if(!v||!spec)return v;Object.assign(v,spec);
  // Mission reassignment can change an existing convoy contact's tactical class.
  // Refresh all four identity axes together so a promoted carrier/tanker does
  // not retain the source merchant's gameplay/model identity.
  materializeVesselIdentity(v,state,{
    gameplayType:spec.gameplayType||spec.type||v.type,
    vesselProfileId:spec.vesselProfileId||v.vesselProfileId,
    factionId:spec.factionId!==undefined?spec.factionId:v.factionId,
    modelKey:spec.modelKey||(typeof getVesselProfile==='function'?getVesselProfile(spec.vesselProfileId)?.modelKey:null)||v.modelKey
  });
  return v;
}


function _missionHash(seed,text){
  let h=((Number(seed)||1)*2654435761)>>>0;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967295;
}
function _missionObj(c,id){return (c.objectives||[]).find(o=>o.id===id);}
function _missionSetDone(c,id,done=true){const o=_missionObj(c,id);if(o)o.done=!!done;return o;}

/* CONTACT KEEPER v3 carries the Phase-2 loop through the first torpedo attack
   and escape. Keep this as a narrow save migration rather than teaching generic
   mission code about B.d.U., wolfpacks or Atlantic doctrine. */
function _missionEnsureContactKeeperV3(state){
  const c=state?.campaign,m=c?.primaryMission,content=_missionContent(state,'shadowReport');
  if(!m||m.type!=='SHADOW_REPORT'||content?.mode!=='CONTACT_KEEPER'||!content.attackOrderCommand)return m;
  const prevVersion=Number(m.contactKeeperVersion||1);
  if(prevVersion>=3&&_missionObj(c,'attack')&&_missionObj(c,'evade')&&_missionObj(c,'withdraw'))return m; // hot-path
  const t=content.objectiveTexts||{},wanted=[
    ['locate',t.locate||'Locate the assigned convoy'],['develop',t.develop||'Develop convoy course and speed'],
    ['shadow',t.shadow||'Shadow the convoy without firm enemy contact'],['report',t.report||'Complete the movement report'],
    ['release',t.release||'Copy attack order'],['approach',t.approach||'Gain a night surface attack position'],
    ['attack',t.attack||'Launch the torpedo attack'],['evade',t.evade||'Break clear of escort prosecution'],
    ['withdraw',t.withdraw||'Withdraw clear of the convoy screen'],['return',t.return||'Return to base']
  ];
  const old=new Map((c.objectives||[]).filter(o=>o?.id).map(o=>[o.id,o]));
  c.objectives=wanted.map(([id,text])=>{const o=old.get(id);return o?{...o,text}:{id,text,done:false,failed:false};});
  const defaults={contactKeeperVersion:3,attackOrderCommand:content.attackOrderCommand,attackOrderQueued:false,
    attackOrderCopied:false,attackReleasedAt:null,reportTransmitAuthorized:false,approachSeconds:0,approachRequired:content.nightApproachHoldSec||30,
    approachMaxDaylight:content.nightApproachMaxDaylight??.18,approachSurfaceDepthFt:content.nightApproachSurfaceDepthFt||12,
    approachMinNm:content.nightApproachMinNm||.8,approachMaxNm:content.nightApproachMaxNm||3.5,
    approachForwardMinNm:content.nightApproachForwardMinNm??.15,approachLateralMaxNm:content.nightApproachLateralMaxNm||2.6,
    attackPositionReady:false,attackLaunchedAt:null,attackTorpedoId:null,escortReactionSeen:false,escortReactionAt:null,
    evasionSeconds:0,evasionRequired:content.evasionQuietHoldSec||45,withdrawalSeconds:0,
    withdrawalRequired:content.withdrawQuietHoldSec||60,withdrawMinNm:content.withdrawMinNm||6};
  for(const [k,v] of Object.entries(defaults))if(m[k]===undefined)m[k]=v;
  // Patch 13 completed CONTACT KEEPER at report transmission. Patch 14 reopened
  // those saves; retain the same one-way migration here so no reward can be
  // credited a second time.
  if(prevVersion<2&&_missionObj(c,'report')?.done&&Number.isFinite(m.reportedAt)&&m.result==='SUCCESS'&&c.missionStatus!=='COMPLETED'){
    m.result='ACTIVE';m.completedAt=null;m.failReason=null;c.missionStatus='PATROL';m.legacyReportRewardCredited=!!m.rewardCredited;
  }
  m.contactKeeperVersion=3;
  return m;
}
function _missionQueuePrioritySignal(state,m,content,now){
  if(!state?.world||!m||!content?.attackOrderCommand)return false;
  const R=state.world.radio=state.world.radio||{pending:null,inbox:[],unread:0,nextBroadcast:240,copying:0};
  const cmd=content.attackOrderCommand,already=R.pending?.missionCommand===cmd||(R.inbox||[]).some(x=>x?.missionCommand===cmd)||(R.priority||[]).some(x=>x?.signal?.missionCommand===cmd);
  if(already){m.attackOrderQueued=true;return false;}
  const delay=Math.max(0,content.attackOrderDelaySec||0),eligibleAt=now+delay;
  R.priority=Array.isArray(R.priority)?R.priority:[];
  R.priority.push({eligibleAt,tag:cmd,announce:content.attackOrderAnnounce,signal:{type:content.attackOrderType||'INFO',subject:content.attackOrderSubject||'ATTACK ORDER',text:content.attackOrderText||'Attack order.',missionCommand:cmd}});
  // Keep routine traffic from occupying the receiver immediately before the
  // priority reply. This affects only campaigns that explicitly queue it.
  R.nextBroadcast=Math.max(Number(R.nextBroadcast)||0,delay+75);
  m.attackOrderQueued=true;m.attackOrderEligibleAt=eligibleAt;return true;
}
function _missionContactKeeperGeometry(state,m){
  const W=state?.world,sub=state?.playerSub,g=W?.traffic?.primaryGroup;if(!W||!sub)return null;
  let center=g?.position||null,heading=Number(g?.heading);
  if(!center){const ships=(W.contacts||[]).filter(x=>x?.convoyId==='MAIN'&&!x.sunk);if(ships.length){center={xNm:ships.reduce((n,x)=>n+x.position.xNm,0)/ships.length,yNm:ships.reduce((n,x)=>n+x.position.yNm,0)/ships.length};heading=Number(ships[0]?.heading);}}
  if(!center||!Number.isFinite(heading))return null;
  const dx=sub.position.xNm-center.xNm,dy=sub.position.yNm-center.yNm,r=degToRad(heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
  return{center,heading,rangeNm:Math.hypot(dx,dy),forwardNm:dx*fx+dy*fy,lateralNm:Math.abs(dx*sx+dy*sy),daylight:W.environment?.daylight??1};
}
function _missionContactKeeperAttackRecord(engine,m){
  const s=engine?.state,A=s?.campaign?.afterAction,torps=A?.torpedoes;if(!Array.isArray(torps)||!Number.isFinite(m?.attackPositionAt))return null;
  const group=s.world?.traffic?.primaryGroup,ships=(s.world?.contacts||[]).filter(x=>x?.convoyId==='MAIN'&&!x.sunk);
  const center=group?.position||(ships.length?{xNm:ships.reduce((n,x)=>n+x.position.xNm,0)/ships.length,yNm:ships.reduce((n,x)=>n+x.position.yNm,0)/ships.length}:null);
  for(const r of torps){
    if(!r||!Number.isFinite(r.launchT)||r.launchT+1e-6<m.attackPositionAt)continue;
    const target=r.targetId&&r.targetId!=='MANUAL'?_missionContact(engine,r.targetId):null;
    if(target?.convoyId==='MAIN')return r;
    // Manual TDC remains valid: accept only a shot launched close to the main
    // convoy and pointed broadly into it, rather than treating any torpedo
    // fired elsewhere in the ocean as fulfillment of the attack objective.
    if(r.targetId==='MANUAL'&&center&&r.start){
      const range=distNm(r.start,center),toward=bearingBetween(r.start,center);
      if(range<=4.5&&Math.abs(shortDelta(r.launchHeading??toward,toward))<=40)return r;
    }
  }
  return null;
}
function _missionContactKeeperReaction(state,m){
  const W=state?.world,now=state?.time?.elapsedSeconds||0,after=Number(m?.attackLaunchedAt)||0;if(!W||!after)return false;
  if(W.enemy?.alertState==='ATTACKING'||W.enemy?.contactHeld)return true;
  if((W.enemy?.alertedEscortIds||[]).length)return true;
  return (W.contacts||[]).some(x=>x?.convoyId==='MAIN'&&!x.sunk&&((Number(x.surfaceAlarmAt)||0)>=after||(Number(x.alertedAt)||0)>=after||x.scattering&&now-after<900));
}
function _missionCoopTarget(engine,coop){
  const ships=(engine.state.world.contacts||[]).filter(x=>x?.convoyId==='MAIN'&&!x.sunk&&!isSurfaceCombatant(x));
  if(!ships.length)return null;
  const n=Math.max(0,Number(coop.eventsResolved)||0),h=_missionHash(engine.state.campaign?.scenarioSeed,`coop-target:${n}`);
  return ships[Math.min(ships.length-1,Math.floor(h*ships.length))];
}
function _missionApplyCoopAttack(engine,coop,content){
  const s=engine.state,W=s.world,now=s.time.elapsedSeconds||0,target=_missionCoopTarget(engine,coop);if(!target)return false;
  const cfg=content.supportAttack||{},n=Math.max(0,Number(coop.eventsResolved)||0),h=_missionHash(s.campaign?.scenarioSeed,`coop-damage:${n}`);
  const D=ensureShipDamage(target),damage=Number(cfg.damageMin||.16)+h*Number(cfg.damageSpread||.18);
  // A cheap external hit creates a real casualty/straggler but is deliberately
  // capped below foundering. It is world pressure, not free player tonnage.
  D.flotation=Math.max(D.flotation,clamp(damage*.78,0,.62));
  D.propulsion=Math.max(D.propulsion,clamp(damage*2.2,0,.76));
  D.fire=Math.max(D.fire,clamp(damage*.95,0,.54));
  D.lastHitAt=now;D.lastHitLocation='ENGINE ROOM';D.lastWeapon='OTHER_U_BOAT';
  D.lastWeaponId=`COOP-${n+1}`;D.lastAttackerSide='GERMANY';D.lastAttackerId=`ABSTRACT_U_BOAT_${n+1}`;
  target.convoyNaturalStraggler=true;target.convoyGuardEligible=true;target.externalAttackAt=now;
  engine.startMerchantEvasion?.(target,target.position,'SHIP_HIT',true);
  const explosions=s.weapons.explosions=s.weapons.explosions||[];explosions.push({position:{...target.position},ageSec:0,maxAgeSec:12,label:'DISTANT TORPEDO HIT',big:true,targetLengthFeet:Number(target.lengthYards)||300,external:true});
  const escorts=(W.contacts||[]).filter(x=>isASWCombatant(x)&&!x.sunk),nearest=escorts.slice().sort((a,b)=>distNm(a.position,target.position)-distNm(b.position,target.position))[0];
  if(nearest){nearest.remoteAlarmPosition={...target.position};nearest.remoteAlarmUntil=now+Number(cfg.escortDiversionSec||300);nearest.remoteAlarmPhase=n;}
  const tr=W.contactTracks?.[target.id],observed=!!(tr&&tr.confidence>.04&&(tr.staleSeconds||0)<240)||distNm(s.playerSub.position,target.position)<8;
  coop.eventsResolved=n+1;coop.lastEventAt=now;coop.lastTargetId=target.id;coop.status='ATTACKING_CONVOY';
  coop.events=Array.isArray(coop.events)?coop.events:[];coop.events.push({t:now,targetId:target.id,observed,escortId:nearest?.id||null});
  if(observed){engine.notify(cfg.observedNotice||'DISTANT TORPEDO HIT — another U-boat has attacked the convoy.','warn');engine.captainLog?.('WOLFPACK_ATTACK',`Another U-boat struck ${target.name}; part of the escort screen detached.`,{targetId:target.id,escortId:nearest?.id||null},`coop-attack:${n+1}`);engine._missionStopTransit?.('another U-boat attacked the convoy');}
  else engine.log('B.d.U. group traffic reports another boat attacking the convoy.');
  return true;
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
function _missionLabel(state,type){return _missionDefinition(state,type)?.title||String(type||'PATROL').replaceAll('_',' ');}
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
  else if(m.type==='SHADOW_REPORT'){const content=_missionContent(state,'shadowReport');extra=content?.briefingSuffix||' Hold the convoy at a useful shadowing range without a firm enemy prosecution.';}
  else if(m.type==='WEATHER_AMBUSH')extra=' A long-lived squall has been reported near the shipping lane. Poor visibility or darkness must materially cover the successful attack.';
  return `${m.briefing||_missionDefinition(state,m.type)?.briefing||''}${extra}`;
}
function missionProgressText(state){
  const m=state?.campaign?.primaryMission;if(!m)return'';
  if(m.result==='SUCCESS')return'PRIMARY COMPLETE — return to base';if(m.result==='FAILED')return`PRIMARY FAILED${m.failReason?` — ${m.failReason}`:''}`;
  if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT'){const age=(state.time.elapsedSeconds-(m.intelReportedAt||0))/60;return`${m.targetLabel||'TARGET'} · intel ${Math.max(0,Math.round(age))} min old · ±${(m.intelUncertaintyNm||0).toFixed(1)} nm`;}
  if(m.type==='RECONNAISSANCE')return`${m.identifiedIds?.length||0}/${m.targetIds?.length||0} targets identified${m.compromised?' · anchorage alerted':''}`;
  if(m.type==='LIFEGUARD')return m.recovered?'Airman aboard':m.survivorSpawned?(m.survivorSeen?'Raft located — close surfaced and slow':'Search for downed airman'):'Proceed to lifeguard station';
  if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type))return m.transferComplete?(m.departed?'Operation complete — coast clear':`Operation complete — clear ${m.escapeRadiusNm||4} nm`):`Transfer ${Math.round((m.holdProgress||0)/(m.holdRequired||90)*100)}%${m.compromised?' · response inbound':''}`;
  if(m.type==='MINELAYING')return`Mine pattern ${m.minesLaid||0}/${m.mineCount||12}`;
  if(m.type==='SHADOW_REPORT'){
    const content=_missionContent(state,'shadowReport');
    if(content?.mode==='CONTACT_KEEPER'){
      _missionEnsureContactKeeperV3(state);
      if(_missionObj(state.campaign,'withdraw')?.done)return'ATTACK COMPLETE — return to base';
      if(_missionObj(state.campaign,'evade')?.done){const q=_missionContactKeeperGeometry(state,m),r=q?.rangeNm??Infinity;return`WITHDRAW · convoy ${Number.isFinite(r)?r.toFixed(1):'?'} nm · hold clear ${Math.round(m.withdrawalSeconds||0)}/${Math.ceil(m.withdrawalRequired||60)} sec`;}
      if(_missionObj(state.campaign,'attack')?.done){
        const firm=state.world.enemy?.alertState==='ATTACKING'||state.world.enemy?.contactHeld;if(firm)return'ESCORT PROSECUTION — break firm contact';
        const reacted=!!m.escortReactionSeen,q=_missionContactKeeperGeometry(state,m);
        return`${reacted?'EVASION':'ATTACK AWAY'} · ${reacted?'contact broken':'clear the screen'} · ${q?`${q.rangeNm.toFixed(1)} nm · `:''}${Math.round(m.evasionSeconds||0)}/${Math.ceil(m.evasionRequired||45)} sec`;
      }
      if(_missionObj(state.campaign,'approach')?.done)return'NIGHT ATTACK POSITION — fire on convoy';
      if(_missionObj(state.campaign,'release')?.done){
        const q=_missionContactKeeperGeometry(state,m),dark=(state.world.environment?.daylight??1)<=(m.approachMaxDaylight??.18);
        if(!dark)return'ATTACK RELEASED · maintain contact and wait for darkness';
        if(!q)return'NIGHT APPROACH · regain convoy position';
        if(state.playerSub.depthFeet>(m.approachSurfaceDepthFt||12))return`NIGHT APPROACH · surface · convoy ${q.rangeNm.toFixed(1)} nm`;
        if(q.rangeNm>(m.approachMaxNm||3.5))return`NIGHT APPROACH · close surfaced · convoy ${q.rangeNm.toFixed(1)} nm`;
        if(q.rangeNm<(m.approachMinNm||.8))return`NIGHT APPROACH · too close · open range`;
        if(q.forwardNm<(m.approachForwardMinNm??.15))return`NIGHT APPROACH · get ahead of convoy · ${q.rangeNm.toFixed(1)} nm`;
        if(q.lateralNm>(m.approachLateralMaxNm||2.6))return`NIGHT APPROACH · work toward convoy track · ${q.rangeNm.toFixed(1)} nm`;
        if(state.world.enemy?.alertState==='ATTACKING'||state.world.enemy?.contactHeld)return'NIGHT APPROACH · escort has firm contact — break prosecution';
        return`NIGHT APPROACH · hold attack position ${Math.round(m.approachSeconds||0)}/${Math.ceil(m.approachRequired||30)} sec`;
      }
      if(_missionObj(state.campaign,'report')?.done){const waiting=state.world.radio?.pending?.missionCommand===m.attackOrderCommand;return waiting?'B.d.U. priority signal up · antenna depth to copy':'Contact report sent · stand by for B.d.U. attack order';}
      if(m.reportReady)return`Report ready · transmit surfaced ${Math.round(m.reportTransmitSeconds||0)}/${Math.ceil(m.reportTransmitRequired||25)} sec`;
      if(_missionObj(state.campaign,'develop')?.done)return`Contact held ${Math.round((m.shadowSeconds||0)/60)}/${Math.ceil((m.shadowRequired||360)/60)} min · ${m.detected?'escort alerted':'keep outside prosecution'}`;
      if(_missionObj(state.campaign,'locate')?.done)return`Developing contact ${Math.round(m.developSeconds||0)}/${Math.ceil(m.developRequired||90)} sec`;
      return'Find the reported convoy';
    }
    return`Shadowing ${Math.round((m.shadowSeconds||0)/60)}/${Math.ceil((m.shadowRequired||480)/60)} min${m.detected?' · escort alerted':''}`;
  }
  if(m.type==='HARBOR_STRIKE')return`${m.targetLabel||'HVT'} · ${m.neutralized?'neutralized — withdraw':'in anchorage'}`;
  if(m.type==='WEATHER_AMBUSH')return m.coveredHit?'Covered hit scored':'Find convoy · attack under squall/rain/darkness';
  if(m.type==='CONVOY_INTERDICTION'){
    const ships=Math.max(0,m.neutralizedShips||0),shipGoal=Math.max(1,m.requiredNeutralizedShips||2),tons=Math.max(0,m.neutralizedTonnage||0),initial=Math.max(1,m.initialMerchantTonnage||1),pct=Math.round(tons/initial*100),goal=Math.round((m.requiredNeutralizedTonnagePct||.45)*100);
    return`Neutralized ${ships}/${shipGoal} ships · ${pct}%/${goal}% convoy tonnage`;
  }
  return _missionLabel(state,m.type);
}

(function installMissionFramework(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureMissionFramework(){
      const s=this.state,c=s.campaign,W=s.world;c.optionalObjectives=Array.isArray(c.optionalObjectives)?c.optionalObjectives:[];W.missionObjects=Array.isArray(W.missionObjects)?W.missionObjects:[];
      const profile=_missionProfile(s);if(!profile)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no mission profile`);
      if(!MISSION_PRIMARY_TYPES.includes(c.missionType)||!profile.definitions?.[c.missionType])c.missionType=profile.defaultMissionType||'CONVOY_INTERDICTION';
      if(!c.primaryMission){const d=profile.definitions[c.missionType];c.primaryMission={type:c.missionType,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:s.time.elapsedSeconds||0,legacy:true};}
      const ids=c.missionType==='CONVOY_INTERDICTION'?['locate','attack','evade','return']:[];if(ids.length&&(c.objectives||[]).every(o=>!o.id))(c.objectives||[]).forEach((o,i)=>o.id=ids[i]||`objective-${i+1}`);
      _missionEnsureContactKeeperV3(s);
      return c.primaryMission;
    },

    chooseMissionType(requested='AUTO'){
      const c=this.state.campaign,profile=_missionProfile(this.state);if(!profile)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no mission profile`);
      if(MISSION_PRIMARY_TYPES.includes(requested)&&profile.definitions?.[requested])return requested;
      const area=c.patrolArea,seed=c.scenarioSeed||1,era=c.historicalProfile?.era;
      const areaPool=profile.missionPoolsByArea?.[area]||profile.defaultMissionPool||[],eraPool=profile.missionPoolsByEra?.[era]||null;
      const authored=eraPool?areaPool.filter(x=>eraPool.includes(x)):areaPool;
      const pool=(authored.length?authored:areaPool).filter(type=>MISSION_PRIMARY_TYPES.includes(type)&&profile.definitions?.[type]);
      if(!pool.length)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no missions for ${area||'UNKNOWN AREA'}`);
      return pool[Math.floor(_missionHash(seed,`${area}:${c.patrolNumber}:mission`)*pool.length)%pool.length];
    },

    configureMission(requested='AUTO',options={}){
      const s=this.state,c=s.campaign,W=s.world,type=this.chooseMissionType(requested),d=_missionDefinition(s,type),now=s.time.elapsedSeconds||0;if(!d)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no definition for mission ${type}`);
      c.missionType=type;c.primaryMission={type,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:now};c.optionalObjectives=[];W.missionObjects=[];
      const m=c.primaryMission,setObjs=rows=>{c.objectives=rows.map(([id,text])=>({id,text,done:false,failed:false}));};
      if(type==='CONVOY_INTERDICTION'){
        setObjs([['locate','Locate enemy convoy'],['attack','Neutralize a meaningful share of enemy shipping'],['evade','Evade escort vessels'],['return','Return to friendly port']]);
        const merchants=_missionMainMerchants(this),tons=merchants.reduce((n,x)=>n+(x.tonsFactor||0),0);Object.assign(m,{initialMerchantCount:merchants.length,initialMerchantTonnage:tons,requiredNeutralizedShips:Math.max(1,Math.min(2,merchants.length)),requiredNeutralizedTonnagePct:.45,neutralizedShips:0,neutralizedTonnage:0});
      }else if(type==='HIGH_VALUE_INTERCEPT'){
        setObjs([['intercept','Reach the reported target area'],['identify','Identify the high-value target'],['neutralize','Sink or disable the high-value target'],['return','Return to friendly port']]);
        const content=_missionContent(s,'highValueIntercept'),merchants=_missionMainMerchants(this),roll=_missionHash(c.scenarioSeed,`hvt:${c.patrolNumber}`),variant=content?.variants?.find(x=>x.below==null||roll<x.below);let t=merchants.find(x=>vesselGameplayType(x)==='TANKER')||merchants[0];
        if(!variant)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no high-value target content`);
        if(t){_missionApplyVesselSpec(t,variant.vessel,s);t.missionRole='HIGH_VALUE_TARGET';Object.assign(m,{targetId:t.id,targetLabel:t.displayType||t.name,targetKind:variant.kind,intelSeq:0,nextIntelAt:now});_missionRefreshIntel(this,m,true);}
      }else if(type==='RECONNAISSANCE'){
        setObjs([['approach','Approach the reconnaissance area'],['identify','Visually identify the assigned anchorage targets'],['escape','Withdraw at least 8 nm from the anchorage'],['return','Return to friendly port']]);
        const content=_missionContent(s,'reconnaissance'),q=_missionNearEnemyPort(this,2.0),center=q.pos,targets=[],preferred=content?.preferredExistingIdsByArea?.[c.patrolArea]||[];
        for(const id of preferred){const x=W.contacts.find(z=>z.id===id);if(x){x.missionRole='RECON_TARGET';targets.push(x);}}
        if(targets.length<2){const specs=content?.fallbackTargets||[];for(let i=targets.length;i<2;i++){const spec=specs[i];if(!spec)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has insufficient reconnaissance target content`);const br=normDeg(bearingBetween(center,s.playerSub.position)+(i?78:-72)),pos=_missionSafePoint(this,center,br,.7+i*.35,18),x={...spec,position:pos,heading:normDeg(br+90),desiredHeading:normDeg(br+90),speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyRole:'ANCHORAGE',convoyId:'RECON',missionRole:'RECON_TARGET'};materializeVesselIdentity(x,s);W.contacts.push(x);targets.push(x);}}
        Object.assign(m,{siteName:q.port?.name||'enemy anchorage',center:{...center},radiusNm:3.2,escapeRadiusNm:8,targetIds:targets.map(x=>x.id),identifiedIds:[],weaponBaseline:{torps:(s.weapons.nextTorpedoId||1)-1,gun:s.weapons.deckGun?.shots||0},compromised:false});
      }else if(type==='LIFEGUARD'){
        setObjs([['station','Take lifeguard station'],['locate','Locate the downed airman'],['recover','Recover the airman'],['return','Return to friendly port']]);const q=_missionRoutePoint(this,10+_missionHash(c.scenarioSeed,'lifeguard-range')*6);Object.assign(m,{station:{...q.pos},stationRadiusNm:2.5,stationArrivedAt:null,stationWaitSec:180+_missionHash(c.scenarioSeed,'lifeguard-time')*300,strikeAt:null,survivorId:'LIFE-01',survivorSpawned:false,survivorSeen:false,recovered:false,rescueHold:0});
      }else if(type==='SPECIAL_TRANSPORT'||type==='RECON_INSERTION'||type==='RECON_EXTRACTION'){
        const pickup=type==='RECON_EXTRACTION',insert=type==='RECON_INSERTION';setObjs([['rendezvous',pickup?'Reach the extraction rendezvous at night':insert?'Reach the reconnaissance landing at night':'Reach the coastal rendezvous at night'],['transfer',pickup?'Recover the reconnaissance party':insert?'Put the reconnaissance party ashore':'Put the coastwatcher party and supplies ashore'],['escape','Clear the enemy coast'],['return','Return to friendly port']]);
        const q=_missionNearEnemyPort(this,pickup?2.8:2.4);Object.assign(m,{siteName:q.port?.name||'enemy coast',rendezvous:{...q.pos},radiusNm:.18,escapeRadiusNm:4.5,holdRequired:pickup?60:insert?75:90,holdProgress:0,transferComplete:false,departed:false,responseAt:null,compromised:false,operationLabel:pickup?'RECON PARTY ABOARD':insert?'RECON PARTY ASHORE':'COASTWATCHERS ASHORE'});
      }else if(type==='MINELAYING'){
        setObjs([['zone','Reach the assigned minefield box'],['lay','Lay the complete mine pattern'],['return','Return to friendly port']]);const q=_missionRoutePoint(this,12+_missionHash(c.scenarioSeed,'mine-range')*7);Object.assign(m,{zone:{...q.pos},zoneRadiusNm:.75,layHeading:q.heading,mineCount:12,minesLaid:0,layClock:0,mines:[]});
      }else if(type==='SHADOW_REPORT'){
        const content=_missionContent(s,'shadowReport');
        if(content?.mode==='CONTACT_KEEPER'){
          const t=content.objectiveTexts||{};setObjs([['locate',t.locate||'Locate the assigned convoy'],['develop',t.develop||'Develop convoy course and speed'],['shadow',t.shadow||'Shadow the convoy without firm enemy contact'],['report',t.report||'Complete the movement report'],['release',t.release||'Copy attack order'],['approach',t.approach||'Gain a night surface attack position'],['attack',t.attack||'Launch the torpedo attack'],['evade',t.evade||'Break clear of escort prosecution'],['withdraw',t.withdraw||'Withdraw clear of the convoy screen'],['return',t.return||'Return to friendly port']]);
          Object.assign(m,{contactKeeperVersion:3,developSeconds:0,developRequired:content.developRequiredSec||90,developConfidence:content.developConfidence||.42,locateConfidence:content.locateConfidence||.08,shadowSeconds:0,shadowRequired:content.shadowRequiredSec||360,shadowMinNm:content.shadowMinNm||2.8,shadowMaxNm:content.shadowMaxNm||8.5,reportTransmitSeconds:0,reportTransmitRequired:content.reportTransmitSec||25,reportMaxDepthFt:content.reportMaxDepthFt||12,reportReady:false,reportTransmitAuthorized:false,detected:false,attackOrderCommand:content.attackOrderCommand,attackOrderQueued:false,attackOrderCopied:false,attackReleasedAt:null,approachSeconds:0,approachRequired:content.nightApproachHoldSec||30,approachMaxDaylight:content.nightApproachMaxDaylight??.18,approachSurfaceDepthFt:content.nightApproachSurfaceDepthFt||12,approachMinNm:content.nightApproachMinNm||.8,approachMaxNm:content.nightApproachMaxNm||3.5,approachForwardMinNm:content.nightApproachForwardMinNm??.15,approachLateralMaxNm:content.nightApproachLateralMaxNm||2.6,attackPositionReady:false,attackLaunchedAt:null,attackTorpedoId:null,escortReactionSeen:false,escortReactionAt:null,evasionSeconds:0,evasionRequired:content.evasionQuietHoldSec||45,withdrawalSeconds:0,withdrawalRequired:content.withdrawQuietHoldSec||60,withdrawMinNm:content.withdrawMinNm||6});
        }else{setObjs([['locate','Locate the assigned convoy'],['shadow','Shadow the convoy without firm enemy contact'],['report','Complete the movement report'],['return','Return to friendly port']]);Object.assign(m,{shadowSeconds:0,shadowRequired:480,shadowMinNm:2.2,shadowMaxNm:8.0,detected:false});}
      }else if(type==='ESCORT_HUNT'){
        setObjs([['locate','Reach the reported escort area'],['identify','Identify the assigned warship'],['neutralize','Sink or disable the assigned escort'],['return','Return to friendly port']]);const content=_missionContent(s,'escortHunt'),combatants=_missionMainCombatants(this),preferred=content?.preferredGameplayTypes||[];let t=combatants.find(x=>preferred.includes(vesselGameplayType(x)))||combatants[0];if(!t){const spec=content?.fallbackTarget;if(!spec)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no escort-hunt target content`);const q=_missionRoutePoint(this,16),pos={...q.pos};t={...spec,position:pos,heading:q.heading,desiredHeading:q.heading};materializeVesselIdentity(t,s);W.contacts.push(t);}t.missionRole='ESCORT_HUNT_TARGET';const targetType=vesselGameplayType(t);t.name=content?.targetNamesByGameplayType?.[targetType]||content?.targetNamesByGameplayType?.default||t.name;Object.assign(m,{targetId:t.id,targetLabel:t.displayType||t.name,intelSeq:0,nextIntelAt:now});_missionRefreshIntel(this,m,true);
      }else if(type==='HARBOR_STRIKE'){
        setObjs([['approach','Penetrate the enemy anchorage'],['neutralize','Neutralize the assigned high-value unit'],['escape','Withdraw outside the harbor defenses'],['return','Return to friendly port']]);const content=_missionContent(s,'harborStrike'),H=W.harbor,q=H?{port:{name:H.name},pos:{...H.center}}:_missionNearEnemyPort(this,1.5),targets=W.contacts.filter(x=>x.harborTarget&&!x.sunk),preferred=content?.preferredGameplayTypes||[];let t=targets.find(x=>preferred.includes(vesselGameplayType(x)))||targets[0];if(!t){const spec=content?.fallbackTarget;if(!spec)throw new Error(`Campaign ${c.campaignProfileId||'UNKNOWN'} has no harbor-strike target content`);const pos={...q.pos};t={...spec,position:pos,heading:90,desiredHeading:90};materializeVesselIdentity(t,s);W.contacts.push(t);}t.missionRole='HARBOR_STRIKE_TARGET';Object.assign(m,{siteName:H?.name||q.port?.name||'enemy anchorage',center:H?{...H.center}:{...q.pos},radiusNm:H?.innerRadiusNm||2,escapeRadiusNm:(H?.outerRadiusNm||5)+1,targetId:t.id,targetLabel:t.displayType||t.name,neutralized:false});
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
      const s=this.state,W=s.world;if(m.survivorSpawned)return;const content=_missionContent(s,'lifeguard'),spec=content?.survivor;if(!spec)throw new Error(`Campaign ${s.campaign.campaignProfileId||'UNKNOWN'} has no lifeguard survivor content`);const br=_missionHash(s.campaign.scenarioSeed,'raft-brg')*360,r=.8+_missionHash(s.campaign.scenarioSeed,'raft-rng')*1.6,p=_missionSafePoint(this,m.station,br,r,10),raft={...spec,id:m.survivorId,position:p,heading:0,desiredHeading:0};materializeVesselIdentity(raft,s);W.contacts.push(raft);m.survivorSpawned=true;m.survivorPos={...p};m.searchCenter={xNm:p.xNm+(_missionHash(s.campaign.scenarioSeed,'raft-x')-.5)*2.4,yNm:p.yNm+(_missionHash(s.campaign.scenarioSeed,'raft-y')-.5)*2.4};m.searchUncertaintyNm=1.6;this.captainLog?.('AIRMAN_DOWN',content.airmanDownLog,{},'airman-down');this.notify(content.airmanDownNotice,'warn');this._missionStopTransit('airman down in lifeguard sector');
    },

    updateMissionFramework(dt){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework(),sub=s.playerSub,W=s.world,now=s.time.elapsedSeconds||0;if(m.result!=='ACTIVE'||c.missionStatus!=='PATROL')return;
      const coop=W.cooperativeSubmarines,shadowContent=m.type==='SHADOW_REPORT'?_missionContent(s,'shadowReport'):null,coopCfg=shadowContent?.supportAttack;
      if(coop&&coopCfg&&_missionObj(c,'release')?.done){
        if(!Number.isFinite(coop.eventsResolved))coop.eventsResolved=0;
        if(!Number.isFinite(coop.nextAttackAt))coop.nextAttackAt=now+Number(coopCfg.firstDelaySec||360)+_missionHash(c.scenarioSeed,'coop-first')*Number(coopCfg.delaySpreadSec||420);
        const max=Math.min(Number(coopCfg.maxEvents||1),Math.max(1,Number(coop.count)||1));
        if(coop.eventsResolved<max&&now>=coop.nextAttackAt&&_missionApplyCoopAttack(this,coop,shadowContent)){
          coop.nextAttackAt=now+Number(coopCfg.repeatDelaySec||540)+_missionHash(c.scenarioSeed,`coop-next:${coop.eventsResolved}`)*180;
        }
      }
      if(m.type==='HIGH_VALUE_INTERCEPT'||m.type==='ESCORT_HUNT')_missionRefreshIntel(this,m,false);
      if(m.type==='LIFEGUARD'){
        if(Number.isFinite(m.strikeAt)&&now>=m.strikeAt&&!m.survivorSpawned)this._spawnLifeguardSurvivor(m);const raft=m.survivorSpawned&&W.contacts.find(x=>x.id===m.survivorId),tr=raft&&W.contactTracks[m.survivorId];if(raft&&tr&&!m.survivorSeen&&((tr.positionSource||tr.source)==='VISUAL'||isSurfaceRadarFixSource(tr.positionSource||tr.source)||isSurfaceRadarFixSource(tr.lastSensorSource))){m.survivorSeen=true;m.survivorPos={...(tr.plotPosition||raft.position)};_missionSetDone(c,'locate');this.notify(_missionContent(s,'lifeguard')?.locatedNotice||'LIFE RAFT LOCATED. Close surfaced and slow for recovery.','ok');}if(raft&&m.survivorSeen){const close=distNm(sub.position,raft.position)<=.08&&sub.depthFeet<8&&sub.propulsion.speedKnots<=2.5;m.rescueHold=close?m.rescueHold+dt:Math.max(0,m.rescueHold-dt*.5);if(m.rescueHold>=15&&!m.recovered){m.recovered=true;_missionSetDone(c,'recover');W.contacts=W.contacts.filter(x=>x.id!==m.survivorId);delete W.contactTracks[m.survivorId];this.captainLog?.('AIRMAN_RECOVERED','Downed airman recovered.',{},'airman-recovered');this._missionFinish(true);}}
      }else if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION'].includes(m.type)){
        const rng=distNm(sub.position,m.rendezvous),night=(W.environment.daylight??1)<.30,surf=sub.depthFeet<8,slow=sub.propulsion.speedKnots<=2;if(rng<=.55)_missionSetDone(c,'rendezvous');if(rng<=m.radiusNm&&night&&surf&&slow&&!m.transferComplete){if(m.responseAt==null)m.responseAt=now+480;m.holdProgress+=dt;if(m.holdProgress>=m.holdRequired){m.transferComplete=true;_missionSetDone(c,'transfer');const event=m.type==='RECON_EXTRACTION'?'RECON_PARTY_RECOVERED':m.type==='RECON_INSERTION'?'RECON_PARTY_LANDED':'COASTWATCHERS_ASHORE';this.captainLog?.(event,m.operationLabel.replaceAll('_',' ').toLowerCase()+'.',{missionType:m.type},event.toLowerCase());this.notify(`${m.title} — ${m.operationLabel}. Clear the enemy coast.`, 'ok');}}if(m.responseAt!=null&&now>=m.responseAt&&!m.departed&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.45,0,1.5);W.airThreat.nextCheck=Math.min(W.airThreat.nextCheck||60,3);this.notify('ENEMY PATROL RESPONSE — aircraft reported approaching the rendezvous.','bad');this._missionStopTransit('enemy patrol response');}if(m.transferComplete&&rng>=m.escapeRadiusNm&&!m.departed){m.departed=true;_missionSetDone(c,'escape');this._missionFinish(true);}
      }else if(m.type==='MINELAYING'){
        const rng=distNm(sub.position,m.zone),aligned=Math.abs(shortDelta(sub.heading,m.layHeading))<=30,depth=sub.depthFeet>=35&&sub.depthFeet<=90,slow=sub.propulsion.speedKnots>=2&&sub.propulsion.speedKnots<=5;if(rng<=m.zoneRadiusNm)_missionSetDone(c,'zone');if(rng<=m.zoneRadiusNm&&aligned&&depth&&slow&&m.minesLaid<m.mineCount){m.layClock+=dt;while(m.layClock>=8&&m.minesLaid<m.mineCount){m.layClock-=8;m.minesLaid++;const side=(m.minesLaid%2?1:-1)*.025,hr=degToRad(sub.heading),p={xNm:sub.position.xNm+Math.cos(hr)*side,yNm:sub.position.yNm+Math.sin(hr)*side};m.mines.push({n:m.minesLaid,pos:p,t:now});if(m.minesLaid===1)this.notify('MINE LAYING — pattern started. Maintain 2–5 kn, 35–90 ft and assigned heading.','warn');}}else m.layClock=Math.max(0,m.layClock-dt*.25);if(m.minesLaid>=m.mineCount){_missionSetDone(c,'lay');this.captainLog?.('MINEFIELD_LAID',`Mine pattern laid — ${m.mineCount} mines.`,{count:m.mineCount},'minefield-laid');this._missionFinish(true);}
      }else if(m.type==='RECONNAISSANCE'){
        const rng=distNm(sub.position,m.center);if(rng<=m.radiusNm)_missionSetDone(c,'approach');const fired=(s.weapons.nextTorpedoId||1)-1>(m.weaponBaseline?.torps||0)||(s.weapons.deckGun?.shots||0)>(m.weaponBaseline?.gun||0);if(fired&&rng<=m.escapeRadiusNm&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.35,0,1.5);this.alertEscorts?.('DECK_GUN',{...sub.position},.62);this.notify('RECONNAISSANCE COMPROMISED — weapons fire has alerted the anchorage. Complete identification and withdraw.','bad');}
      }else if(m.type==='SHADOW_REPORT'){
        const content=_missionContent(s,'shadowReport');
        if(content?.mode==='CONTACT_KEEPER'){
          const g=W.traffic?.primaryGroup,center=g?.position||(_missionMainMerchants(this)[0]?.position),rng=center?distNm(sub.position,center):Infinity;
          const tracks=Object.entries(W.contactTracks||{}).map(([id,tr])=>({tr,x:_missionContact(this,id)})).filter(q=>q.x?.convoyId==='MAIN'&&q.tr&&!q.tr.sunk);
          const best=tracks.sort((a,b)=>(b.tr.confidence||0)-(a.tr.confidence||0))[0]?.tr||null,known=!!best&&(best.confidence||0)>=(m.locateConfidence||.08);
          if(known)_missionSetDone(c,'locate');
          const safe=W.enemy.alertState!=='ATTACKING'&&!W.enemy.contactHeld,inBand=rng>=m.shadowMinNm&&rng<=m.shadowMaxNm;
          const developed=known&&(best.confidence||0)>=(m.developConfidence||.42)&&Number.isFinite(best.courseEstimate)&&Number.isFinite(best.speedEstimateKnots);
          if(!_missionObj(c,'develop')?.done){if(developed&&safe&&inBand)m.developSeconds+=dt;else m.developSeconds=Math.max(0,m.developSeconds-dt*.35);if(m.developSeconds>=m.developRequired){_missionSetDone(c,'develop');this.captainLog?.('CONVOY_CONTACT_DEVELOPED','Convoy course and speed developed for contact-keeper report.',{},'convoy-contact-developed');this.notify(content.developedNotice,'ok');}}
          if(_missionObj(c,'develop')?.done&&!m.reportReady){if(known&&safe&&inBand)m.shadowSeconds+=dt;else if(W.enemy.alertState==='ATTACKING'){m.detected=true;m.shadowSeconds=Math.max(0,m.shadowSeconds-dt*.22);}if(m.shadowSeconds>=m.shadowRequired){_missionSetDone(c,'shadow');m.reportReady=true;this.notify(content.reportReadyNotice,'warn');this._missionStopTransit('contact report ready');}}
          if(m.reportReady&&!_missionObj(c,'report')?.done){const canTransmit=m.reportTransmitAuthorized&&!W.radio?.txSilence&&sub.depthFeet<=(m.reportMaxDepthFt||12)&&sub.damage.hullIntegrity>5&&safe;if(canTransmit)m.reportTransmitSeconds+=dt;else if(sub.depthFeet>(m.reportMaxDepthFt||12)||W.radio?.txSilence)m.reportTransmitSeconds=Math.max(0,m.reportTransmitSeconds-dt*.5);if(m.reportTransmitSeconds>=m.reportTransmitRequired){_missionSetDone(c,'report');m.reportedAt=now;m.reportTransmitAuthorized=false;const lo=content.supportMinBoats||1,hi=Math.max(lo,content.supportMaxBoats||lo),n=lo+Math.min(hi-lo,Math.floor(_missionHash(c.scenarioSeed,`contact-support:${c.patrolNumber}`)*(hi-lo+1))),eta=Math.round((content.supportEtaMin||35)+_missionHash(c.scenarioSeed,`contact-eta:${c.patrolNumber}`)*(content.supportEtaSpreadMin||55));W.cooperativeSubmarines={mode:'ABSTRACT',count:n,status:'CONVERGING',etaMinutes:eta,reportedAt:now,campaignProfileId:c.campaignProfileId};_missionQueuePrioritySignal(s,m,content,now);const exposure=content.radioExposure,risk=clamp(Number(c.historicalProfile?.hfdfRisk)||0,0,.9);if(exposure&&_missionHash(c.scenarioSeed,`hfdf:${c.patrolNumber}`)<risk){m.radioBearingRisk=true;this.notify(exposure.warning||'ENEMY D/F MAY HAVE OBTAINED A ROUGH BEARING.','warn');this.alertEscorts?.(exposure.reason||'RADIO_BEARING',{...sub.position},Number(exposure.confidence)||.28);}this.captainLog?.('CONTACT_REPORT_SENT',content.reportLog||'Convoy contact report transmitted.',{supportBoats:n,etaMinutes:eta,hfdfRisk:m.radioBearingRisk},'contact-report-sent');this.notify(content.reportSentNotice,'ok');this._missionStopTransit('contact report sent');}}
          if(_missionObj(c,'report')?.done&&!m.attackOrderQueued&&!_missionObj(c,'release')?.done)_missionQueuePrioritySignal(s,m,content,now);
          if(_missionObj(c,'report')?.done&&!_missionObj(c,'release')?.done){const copied=(W.radio?.inbox||[]).find(x=>x?.missionCommand===m.attackOrderCommand);if(copied){_missionSetDone(c,'release');m.attackOrderCopied=true;m.attackReleasedAt=copied.time||now;if(W.cooperativeSubmarines)W.cooperativeSubmarines.status='ATTACK_RELEASED';this.captainLog?.('BDU_ATTACK_ORDER',content.attackOrderLog||'Attack order copied.',{supportBoats:W.cooperativeSubmarines?.count||0},'bdu-attack-order');this.notify(content.attackOrderCopiedNotice||'ATTACK ORDER COPIED','ok');this._missionStopTransit('B.d.U. attack order copied');}}
          if(_missionObj(c,'release')?.done&&!_missionObj(c,'approach')?.done){const q=_missionContactKeeperGeometry(s,m),dark=(W.environment?.daylight??1)<=(m.approachMaxDaylight??.18),surfaced=sub.depthFeet<=(m.approachSurfaceDepthFt||12),positioned=!!q&&q.rangeNm>=(m.approachMinNm||.8)&&q.rangeNm<=(m.approachMaxNm||3.5)&&q.forwardNm>=(m.approachForwardMinNm??.15)&&q.lateralNm<=(m.approachLateralMaxNm||2.6),contact=known,safeApproach=W.enemy.alertState!=='ATTACKING'&&!W.enemy.contactHeld;if(dark&&surfaced&&positioned&&contact&&safeApproach)m.approachSeconds+=dt;else m.approachSeconds=Math.max(0,m.approachSeconds-dt*.4);if(m.approachSeconds>=m.approachRequired){_missionSetDone(c,'approach');m.attackPositionReady=true;m.attackPositionAt=now;if(W.cooperativeSubmarines)W.cooperativeSubmarines.status='ATTACK_IN_PROGRESS';this.captainLog?.('NIGHT_ATTACK_POSITION',content.nightApproachLog||'Night surface attack position gained.',{rangeNm:q?.rangeNm,forwardNm:q?.forwardNm,lateralNm:q?.lateralNm},'night-attack-position');this.notify(content.nightApproachNotice||'NIGHT ATTACK POSITION — attack at discretion.','ok');this._missionStopTransit('night attack position');}}
          if(_missionObj(c,'approach')?.done&&!_missionObj(c,'attack')?.done){const shot=_missionContactKeeperAttackRecord(this,m);if(shot){_missionSetDone(c,'attack');m.attackLaunchedAt=shot.launchT??now;m.attackTorpedoId=shot.id||null;if(W.cooperativeSubmarines)W.cooperativeSubmarines.status='ATTACK_IN_PROGRESS';this.captainLog?.('CONVOY_TORPEDO_ATTACK',content.attackLog||'Torpedo attack launched.',{torpedoId:m.attackTorpedoId,targetId:shot.targetId||null},'contact-keeper-attack');this.notify(content.attackNotice||'TORPEDO ATTACK UNDERWAY — clear the convoy screen.','warn');this._missionStopTransit('torpedo attack underway');}}
          if(_missionObj(c,'attack')?.done&&!_missionObj(c,'evade')?.done){
            const reaction=_missionContactKeeperReaction(s,m);if(reaction&&!m.escortReactionSeen){m.escortReactionSeen=true;m.escortReactionAt=now;this.captainLog?.('CONVOY_ALARM',content.escortReactionLog||'Escort screen reacting after the attack.',{},'contact-keeper-alarm');this.notify(content.escortReactionNotice||'CONVOY ALARM — break firm contact.','bad');this._missionStopTransit('escort reaction');}
            const q=_missionContactKeeperGeometry(s,m),firm=W.enemy.alertState==='ATTACKING'||W.enemy.contactHeld,quietRange=q?.rangeNm??0;
            // A silent attack need not conjure an escort reaction. If no firm
            // contact develops, opening beyond the inner screen is a valid
            // evasion just as losing an actual prosecution is.
            const canCount=!firm&&(m.escortReactionSeen||quietRange>=(content.evasionNoAlarmRangeNm||3.8));
            if(canCount)m.evasionSeconds+=dt;else if(firm)m.evasionSeconds=Math.max(0,m.evasionSeconds-dt*.75);
            if(m.evasionSeconds>=m.evasionRequired){_missionSetDone(c,'evade');m.evadedAt=now;if(W.cooperativeSubmarines)W.cooperativeSubmarines.status='PLAYER_CLEARING';this.captainLog?.('ESCORT_CONTACT_BROKEN',content.evasionLog||'Firm escort contact broken after the attack.',{reactionSeen:m.escortReactionSeen},'contact-keeper-evaded');this.notify(content.evasionNotice||'FIRM CONTACT BROKEN — keep opening the range.','ok');}
          }
          if(_missionObj(c,'evade')?.done&&!_missionObj(c,'withdraw')?.done){const q=_missionContactKeeperGeometry(s,m),firm=W.enemy.alertState==='ATTACKING'||W.enemy.contactHeld,clear=!!q&&q.rangeNm>=(m.withdrawMinNm||6)&&!firm;if(clear)m.withdrawalSeconds+=dt;else m.withdrawalSeconds=Math.max(0,m.withdrawalSeconds-dt*.5);if(m.withdrawalSeconds>=m.withdrawalRequired){_missionSetDone(c,'withdraw');m.withdrawnAt=now;if(W.cooperativeSubmarines)W.cooperativeSubmarines.status='ATTACK_COMPLETE';this.captainLog?.('CONVOY_ATTACK_WITHDRAWAL',content.withdrawalLog||'Boat withdrew clear of the convoy screen after the attack.',{rangeNm:q?.rangeNm,reactionSeen:m.escortReactionSeen},'contact-keeper-withdrawal');this.notify(content.withdrawalNotice||'ATTACK COMPLETE — clear of the convoy screen. Return to base.','ok');this._missionFinish(true);}}
        }else{const g=W.traffic?.primaryGroup,center=g?.position||(_missionMainMerchants(this)[0]?.position),rng=center?distNm(sub.position,center):Infinity,known=Object.keys(W.contactTracks||{}).some(id=>{const x=_missionContact(this,id);return x?.convoyId==='MAIN'&&W.contactTracks[id].confidence>.08;});if(known)_missionSetDone(c,'locate');const safe=W.enemy.alertState!=='ATTACKING'&&!W.enemy.contactHeld,inBand=rng>=m.shadowMinNm&&rng<=m.shadowMaxNm;if(known&&safe&&inBand){m.shadowSeconds+=dt;if(m.shadowSeconds>=m.shadowRequired){_missionSetDone(c,'shadow');_missionSetDone(c,'report');this.captainLog?.('CONVOY_SHADOWED','Convoy movement report completed without a firm enemy prosecution.',{minutes:Math.round(m.shadowSeconds/60)},'convoy-shadowed');this._missionFinish(true);}}else if(W.enemy.alertState==='ATTACKING'){m.detected=true;m.shadowSeconds=Math.max(0,m.shadowSeconds-dt*.22);}}
      }else if(m.type==='WEATHER_AMBUSH'){
        const merchants=_missionMainMerchants(this),known=Object.keys(W.contactTracks||{}).some(id=>{const x=_missionContact(this,id);return x?.convoyId==='MAIN'&&W.contactTracks[id].confidence>.08;});if(known)_missionSetDone(c,'locate');const near=merchants.slice().sort((a,b)=>distNm(sub.position,a.position||{xNm:999,yNm:999})-distNm(sub.position,b.position||{xNm:999,yNm:999}))[0],cover=near&&_missionWeatherAmbushCondition(s,near);_missionSetDone(c,'cover',!!cover);const hits=s.weapons.hits||[];for(let i=m.hitBaseline||0;i<hits.length;i++){const hit=hits[i],t=_missionContact(this,hit.contactId);if(t?.convoyId==='MAIN'&&_missionWeatherAmbushCondition(s,t)){m.coveredHit=true;_missionSetDone(c,'attack');this.captainLog?.('WEATHER_AMBUSH','Successful attack made under concealment of poor visibility.',{contactId:t.id},'weather-ambush');this._missionFinish(true);break;}}m.hitBaseline=hits.length;
      }
    },

    checkPrimaryMission(){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework(),W=s.world;if(!MISSION_PRIMARY_TYPES.includes(m.type))return false;if(m.result!=='ACTIVE')return true;
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
        if(distNm(s.playerSub.position,m.station)<=m.stationRadiusNm){const first=!_missionObj(c,'station')?.done;_missionSetDone(c,'station');if(first||!Number.isFinite(m.stationArrivedAt)){m.stationArrivedAt=s.time.elapsedSeconds||0;m.strikeAt=m.stationArrivedAt+(m.stationWaitSec||240);const content=_missionContent(s,'lifeguard');this.notify(`${content?.stationPrefix||'Lifeguard station — on station. Air operation expected in about '}${Math.ceil((m.stationWaitSec||240)/60)}${content?.stationSuffix||' minutes.'}`,'ok');}}return true;
      }
      if(m.type==='HARBOR_STRIKE'){
        const t=_missionContact(this,m.targetId),rng=distNm(s.playerSub.position,m.center);if(rng<=Math.max(3,m.radiusNm||2))_missionSetDone(c,'approach');if(_missionShipNeutralized(t)){m.neutralized=true;_missionSetDone(c,'neutralize');}if(m.neutralized&&rng>=m.escapeRadiusNm){_missionSetDone(c,'escape');this._missionFinish(true);}return true;
      }
      if(['SPECIAL_TRANSPORT','RECON_INSERTION','RECON_EXTRACTION','MINELAYING','SHADOW_REPORT','WEATHER_AMBUSH'].includes(m.type))return true;
      return true;
    }
  });
})();
