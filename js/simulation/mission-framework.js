// ═══════════════════════════════════════════════════ PATCH 6 — MISSION FRAMEWORK
// One primary mission per patrol; at most one intelligence-driven optional
// opportunity.  Mission logic deliberately reuses bridge, radar, weather,
// ship damage, radio and harbor systems instead of creating parallel minigames.
const MISSION_PRIMARY_TYPES=[
  'CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE',
  'LIFEGUARD','SPECIAL_TRANSPORT','MINELAYING'
];
const MISSION_DEFINITIONS={
  CONVOY_INTERDICTION:{title:'CONVOY INTERDICTION',reward:900,
    briefing:'Hunt enemy merchant traffic in the assigned patrol area. Locate the convoy, attack shipping, survive the escort response and return.'},
  HIGH_VALUE_INTERCEPT:{title:'HIGH VALUE INTERCEPT',reward:1700,
    briefing:'Intelligence places a high-value ship on a known shipping route. Solve the intercept before the window closes; destroy or mission-kill the target.'},
  RECONNAISSANCE:{title:'RECONNAISSANCE',reward:1500,
    briefing:'Approach the enemy anchorage, visually identify the assigned targets and withdraw. Weapons are discretionary; opening fire will make the reconnaissance harder.'},
  LIFEGUARD:{title:'LIFEGUARD',reward:1900,
    briefing:'Take station near a scheduled carrier strike. Locate a downed airman with bridge watch or SJ radar, recover him on the surface, then return.'},
  SPECIAL_TRANSPORT:{title:'SPECIAL TRANSPORT / COASTWATCHERS',reward:1750,
    briefing:'Make a night rendezvous close to enemy-held coast, remain surfaced and nearly stopped while the party goes ashore, then clear the area before the response arrives.'},
  MINELAYING:{title:'MINELAYING',reward:1650,
    briefing:'Reach the assigned shipping lane or harbor approach and lay the complete pattern. Mine release is automatic once the boat is correctly positioned, submerged, slow and aligned.'}
};

function _missionHash(seed,text){
  let h=((Number(seed)||1)*2654435761)>>>0;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967295;
}
function _missionObj(c,id){return (c.objectives||[]).find(o=>o.id===id);}
function _missionSetDone(c,id,done=true){const o=_missionObj(c,id);if(o)o.done=!!done;return o;}
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
  if(path&&path.length>1){const pr=routeProject(path,sub.position),q=routeAdvance(path,pr.s,1,aheadNm);return{pos:q.pos,heading:q.heading,routeS:q.s,routeDir:q.dir};}
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
function missionBriefingText(state){
  const m=state?.campaign?.primaryMission;if(!m)return'';let extra='';
  if(m.type==='HIGH_VALUE_INTERCEPT')extra=` Intelligence window: ${Math.round((m.deadlineAt||0)/60)} minutes from patrol start. Reported target: ${m.targetLabel||'high-value ship'}.`;
  else if(m.type==='RECONNAISSANCE')extra=` Assigned anchorage: ${m.siteName||'enemy anchorage'}.`;
  else if(m.type==='LIFEGUARD')extra=' Expect the strike after taking station; a raft is a very small visual/radar target.';
  else if(m.type==='SPECIAL_TRANSPORT')extra=` Rendezvous: ${m.siteName||'enemy coast'}. Night, surfaced, below 2 knots.`;
  else if(m.type==='MINELAYING')extra=` Pattern: ${m.mineCount||12} mines; release interval is automatic.`;
  return `${m.briefing||MISSION_DEFINITIONS[m.type]?.briefing||''}${extra}`;
}
function missionProgressText(state){
  const m=state?.campaign?.primaryMission;if(!m)return'';const now=state.time?.elapsedSeconds||0;
  if(m.result==='SUCCESS')return'PRIMARY COMPLETE — return to base';if(m.result==='FAILED')return`PRIMARY FAILED${m.failReason?` — ${m.failReason}`:''}`;
  if(m.type==='HIGH_VALUE_INTERCEPT')return`${m.targetLabel||'HVT'} · window ${Math.max(0,Math.ceil(((m.deadlineAt||0)-now)/60))} min`;
  if(m.type==='RECONNAISSANCE')return`${m.identifiedIds?.length||0}/${m.targetIds?.length||0} targets identified${m.compromised?' · anchorage alerted':''}`;
  if(m.type==='LIFEGUARD')return m.recovered?'Airman aboard':m.survivorSpawned?(m.survivorSeen?'Raft located — close surfaced and slow':'Search for downed airman'):'Proceed to lifeguard station';
  if(m.type==='SPECIAL_TRANSPORT')return m.dropComplete?(m.departed?'Party ashore — area clear':`Party ashore — clear ${m.escapeRadiusNm||4} nm`):`Transfer ${Math.round((m.holdProgress||0)/(m.holdRequired||90)*100)}%${m.compromised?' · enemy response inbound':''}`;
  if(m.type==='MINELAYING')return`Mine pattern ${m.minesLaid||0}/${m.mineCount||12}`;
  return'Enemy merchant traffic';
}

(function installMissionFramework(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureMissionFramework(){
      const s=this.state,c=s.campaign,W=s.world;c.optionalObjectives=Array.isArray(c.optionalObjectives)?c.optionalObjectives:[];
      W.missionObjects=Array.isArray(W.missionObjects)?W.missionObjects:[];
      if(!MISSION_PRIMARY_TYPES.includes(c.missionType))c.missionType='CONVOY_INTERDICTION';
      if(!c.primaryMission){
        const d=MISSION_DEFINITIONS[c.missionType];c.primaryMission={type:c.missionType,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:s.time.elapsedSeconds||0,legacy:true};
      }
      const ids=c.missionType==='CONVOY_INTERDICTION'?['locate','attack','evade','return']:[];
      if(ids.length&&(c.objectives||[]).every(o=>!o.id))(c.objectives||[]).forEach((o,i)=>o.id=ids[i]||`objective-${i+1}`);
      return c.primaryMission;
    },

    chooseMissionType(requested='AUTO'){
      if(MISSION_PRIMARY_TYPES.includes(requested))return requested;
      const s=this.state,c=s.campaign,area=c.patrolArea,seed=c.scenarioSeed||1;
      const pool=area==='Truk Approaches'
        ?['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','MINELAYING','LIFEGUARD','SPECIAL_TRANSPORT']
        :area==='Java Sea'
          ?['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','SPECIAL_TRANSPORT','MINELAYING','RECONNAISSANCE','LIFEGUARD']
          :['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','RECONNAISSANCE','LIFEGUARD','SPECIAL_TRANSPORT','MINELAYING'];
      return pool[Math.floor(_missionHash(seed,`${area}:${c.patrolNumber}:mission`)*pool.length)%pool.length];
    },

    configureMission(requested='AUTO',options={}){
      const s=this.state,c=s.campaign,W=s.world,type=this.chooseMissionType(requested),d=MISSION_DEFINITIONS[type],now=s.time.elapsedSeconds||0;
      c.missionType=type;c.primaryMission={type,title:d.title,briefing:d.briefing,reward:d.reward,result:'ACTIVE',startedAt:now};
      c.optionalObjectives=[];W.missionObjects=[];
      const setObjs=rows=>{c.objectives=rows.map(([id,text])=>({id,text,done:false,failed:false}));};
      if(type==='CONVOY_INTERDICTION'){
        setObjs([['locate','Locate enemy convoy'],['attack','Attack merchant shipping'],['evade','Evade escort vessels'],['return','Return to friendly port']]);
      }
      else if(type==='HIGH_VALUE_INTERCEPT'){
        setObjs([['intercept','Reach the reported intercept area'],['identify','Identify the high-value target'],['neutralize','Sink or disable the high-value target'],['return','Return to friendly port']]);
        const merchants=W.contacts.filter(x=>x.convoyId==='MAIN'&&x.type!=='ESCORT');let t=merchants.find(x=>x.type==='TANKER')||merchants[0];
        const roll=_missionHash(c.scenarioSeed,`hvt:${c.patrolNumber}`),kind=roll<.46?'TANKER':roll<.82?'TRANSPORT':'CARRIER';
        if(t){
          if(kind==='TANKER')Object.assign(t,{name:'Fleet Oiler',type:'TANKER',displayType:'FLEET OILER',lengthYards:560,tonsFactor:9200,visualProfile:1.16});
          else if(kind==='TRANSPORT')Object.assign(t,{name:'Army Transport',type:'MERCHANT',displayType:'TROOP TRANSPORT',lengthYards:500,tonsFactor:7600,visualProfile:1.04});
          else Object.assign(t,{name:'Light Carrier',type:'MERCHANT',displayType:'LIGHT CARRIER',lengthYards:680,tonsFactor:18000,visualProfile:1.34});
          t.missionRole='HIGH_VALUE_TARGET';
          const err=1.2+_missionHash(c.scenarioSeed,'hvt-error')*1.4,br=degToRad(_missionHash(c.scenarioSeed,'hvt-brg')*360);
          const fix=this.clampToArea({xNm:t.position.xNm+Math.sin(br)*err,yNm:t.position.yNm-Math.cos(br)*err});
          Object.assign(c.primaryMission,{targetId:t.id,targetLabel:t.displayType||t.name,targetKind:kind,deadlineAt:now+4*3600,intelFix:fix,intelUncertaintyNm:err+1.0,intelCourse:t.heading,intelSpeedKn:t.speedKnots});
        }
      }
      else if(type==='RECONNAISSANCE'){
        setObjs([['approach','Approach the reconnaissance area'],['identify','Visually identify the assigned anchorage targets'],['escape','Withdraw at least 8 nm from the anchorage'],['return','Return to friendly port']]);
        const q=_missionNearEnemyPort(this,2.0),center=q.pos,targets=[];
        if(s.campaign.patrolArea==='Truk Approaches'){
          for(const id of ['H-02','H-03']){const x=W.contacts.find(z=>z.id===id);if(x){x.missionRole='RECON_TARGET';targets.push(x);}}
        }
        if(targets.length<2){
          const names=[['REC-01','Naval Auxiliary','NAVAL AUXILIARY',430,4700],['REC-02','Army Transport','TROOP TRANSPORT',490,7100]];
          for(let i=targets.length;i<2;i++){
            const br=normDeg(bearingBetween(center,s.playerSub.position)+(i?78:-72)),pos=_missionSafePoint(this,center,br,0.7+i*.35,18);
            const spec=names[i];const x={id:spec[0],name:spec[1],type:'MERCHANT',displayType:spec[2],lengthYards:spec[3],tonsFactor:spec[4],visualProfile:.95,acousticBase:.08,position:pos,heading:normDeg(br+90),desiredHeading:normDeg(br+90),speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyRole:'ANCHORAGE',convoyId:'RECON',missionRole:'RECON_TARGET'};
            W.contacts.push(x);targets.push(x);
          }
        }
        Object.assign(c.primaryMission,{siteName:q.port?.name||'enemy anchorage',center:{...center},radiusNm:3.2,escapeRadiusNm:8,targetIds:targets.map(x=>x.id),identifiedIds:[],weaponBaseline:{torps:(s.weapons.nextTorpedoId||1)-1,gun:s.weapons.deckGun?.shots||0},compromised:false});
      }
      else if(type==='LIFEGUARD'){
        setObjs([['station','Take lifeguard station'],['locate','Locate the downed airman'],['recover','Recover the airman'],['return','Return to friendly port']]);
        const q=_missionRoutePoint(this,10+_missionHash(c.scenarioSeed,'lifeguard-range')*6);
        Object.assign(c.primaryMission,{station:{...q.pos},stationRadiusNm:2.5,strikeAt:now+720+_missionHash(c.scenarioSeed,'lifeguard-time')*360,survivorId:'LIFE-01',survivorSpawned:false,survivorSeen:false,recovered:false,rescueHold:0});
      }
      else if(type==='SPECIAL_TRANSPORT'){
        setObjs([['rendezvous','Reach the coastal rendezvous at night'],['transfer','Put the coastwatcher party and supplies ashore'],['escape','Clear the rendezvous area'],['return','Return to friendly port']]);
        const q=_missionNearEnemyPort(this,2.4);
        Object.assign(c.primaryMission,{siteName:q.port?.name||'enemy coast',rendezvous:{...q.pos},radiusNm:.18,escapeRadiusNm:4,holdRequired:90,holdProgress:0,dropComplete:false,departed:false,responseAt:null,compromised:false});
      }
      else if(type==='MINELAYING'){
        setObjs([['zone','Reach the assigned minefield box'],['lay','Lay the complete mine pattern'],['return','Return to friendly port']]);
        const q=_missionRoutePoint(this,12+_missionHash(c.scenarioSeed,'mine-range')*7);
        Object.assign(c.primaryMission,{zone:{...q.pos},zoneRadiusNm:.75,layHeading:q.heading,mineCount:12,minesLaid:0,layClock:0,mines:[]});
      }
      this.captainLog?.('MISSION_ASSIGNED',`${d.title} orders received.`,{missionType:type},'mission-assigned');
      this.log(`PRIMARY MISSION — ${d.title}. ${d.briefing}`,'warn');
      return c.primaryMission;
    },

    _missionStopTransit(reason){
      const t=this.state.time;if((t.timeScale||1)>1||t.transitUntil){t.timeScale=1;t.transitUntil=0;t.transitOpen=false;t.stopReason=reason;t.stopReasonAt=t.elapsedSeconds;}
    },
    _missionFinish(success,reason){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework();if(m.result!=='ACTIVE')return false;
      m.result=success?'SUCCESS':'FAILED';m.completedAt=s.time.elapsedSeconds;m.failReason=success?null:reason;
      if(success&&!m.rewardCredited){c.score+=(m.reward||0);m.rewardCredited=true;}
      c.missionStatus='RETURN TO BASE';
      this.captainLog?.(success?'MISSION_COMPLETED':'MISSION_FAILED',`${m.title} ${success?'completed':'failed'}${reason?`: ${reason}`:''}.`,{missionType:m.type,reward:success?m.reward:0},`mission-result:${m.type}`);
      this.notify(`${m.title} — ${success?'PRIMARY OBJECTIVE COMPLETE':'MISSION FAILED'}${success&&m.reward?` · +${m.reward} pts`:''}. Return to base.`,success?'ok':'bad');
      this._missionStopTransit(success?'mission complete':'mission failed');return true;
    },

    _spawnLifeguardSurvivor(m){
      const s=this.state,W=s.world;if(m.survivorSpawned)return;const br=_missionHash(s.campaign.scenarioSeed,'raft-brg')*360,r=.8+_missionHash(s.campaign.scenarioSeed,'raft-rng')*1.6;
      const p=_missionSafePoint(this,m.station,br,r,10),raft={id:m.survivorId,name:'Downed Airman',type:'RAFT',displayType:'LIFE RAFT',lengthYards:7,tonsFactor:0,visualProfile:.12,acousticBase:0,position:p,heading:0,desiredHeading:0,speedKnots:0,baseSpeed:0,desiredSpeed:0,stationary:true,convoyId:'LIFEGUARD',convoyRole:'SURVIVOR',missionRole:'SURVIVOR'};
      W.contacts.push(raft);m.survivorSpawned=true;m.survivorPos={...p};m.searchCenter={xNm:p.xNm+(_missionHash(s.campaign.scenarioSeed,'raft-x')-.5)*2.4,yNm:p.yNm+(_missionHash(s.campaign.scenarioSeed,'raft-y')-.5)*2.4};m.searchUncertaintyNm=1.6;
      this.captainLog?.('AIRMAN_DOWN','Carrier strike reports an airman down in the lifeguard sector.',{},'airman-down');
      this.notify('LIFEGUARD — AIRMAN DOWN. Search the assigned sector by bridge watch or SJ radar.','warn');this._missionStopTransit('airman down in lifeguard sector');
    },

    updateMissionFramework(dt){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework(),sub=s.playerSub,W=s.world,now=s.time.elapsedSeconds||0;if(m.result!=='ACTIVE'||c.missionStatus!=='PATROL')return;
      if(m.type==='LIFEGUARD'){
        if(now>=m.strikeAt&&!m.survivorSpawned)this._spawnLifeguardSurvivor(m);
        const raft=m.survivorSpawned&&W.contacts.find(x=>x.id===m.survivorId),tr=raft&&W.contactTracks[m.survivorId];
        if(raft&&tr&&!m.survivorSeen&&((tr.positionSource||tr.source)==='VISUAL'||(tr.positionSource||tr.source)==='SJ RADAR'||tr.lastSensorSource==='SJ RADAR')){
          m.survivorSeen=true;m.survivorPos={...(tr.plotPosition||raft.position)};_missionSetDone(c,'locate');this.notify('LIFEGUARD — LIFE RAFT LOCATED. Close surfaced and slow for recovery.','ok');
        }
        if(raft&&m.survivorSeen){const close=distNm(sub.position,raft.position)<=.08&&sub.depthFeet<8&&sub.propulsion.speedKnots<=2.5;
          m.rescueHold=close?m.rescueHold+dt:Math.max(0,m.rescueHold-dt*.5);
          if(m.rescueHold>=15&&!m.recovered){m.recovered=true;_missionSetDone(c,'recover');W.contacts=W.contacts.filter(x=>x.id!==m.survivorId);delete W.contactTracks[m.survivorId];this.captainLog?.('AIRMAN_RECOVERED','Downed airman recovered.',{},'airman-recovered');this._missionFinish(true);}
        }
      }else if(m.type==='SPECIAL_TRANSPORT'){
        const rng=distNm(sub.position,m.rendezvous),night=(W.environment.daylight??1)<.30,surf=sub.depthFeet<8,slow=sub.propulsion.speedKnots<=2;
        if(rng<=.55)_missionSetDone(c,'rendezvous');
        if(rng<=m.radiusNm&&night&&surf&&slow&&!m.dropComplete){if(m.responseAt==null)m.responseAt=now+480;m.holdProgress+=dt;if(m.holdProgress>=m.holdRequired){m.dropComplete=true;_missionSetDone(c,'transfer');this.captainLog?.('COASTWATCHERS_ASHORE','Coastwatcher party and supplies put ashore.',{},'coastwatchers-ashore');this.notify('SPECIAL TRANSPORT — PARTY ASHORE. Clear the rendezvous before the patrol response arrives.','ok');}}
        if(m.responseAt!=null&&now>=m.responseAt&&!m.departed&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.45,0,1.5);W.airThreat.nextCheck=Math.min(W.airThreat.nextCheck||60,3);this.notify('ENEMY PATROL RESPONSE — aircraft reported approaching the coastwatcher rendezvous.','bad');this._missionStopTransit('enemy patrol response');}
        if(m.dropComplete&&rng>=m.escapeRadiusNm&&!m.departed){m.departed=true;_missionSetDone(c,'escape');this._missionFinish(true);}
      }else if(m.type==='MINELAYING'){
        const rng=distNm(sub.position,m.zone),aligned=Math.abs(shortDelta(sub.heading,m.layHeading))<=30,depth=sub.depthFeet>=35&&sub.depthFeet<=90,slow=sub.propulsion.speedKnots>=2&&sub.propulsion.speedKnots<=5;
        if(rng<=m.zoneRadiusNm)_missionSetDone(c,'zone');
        if(rng<=m.zoneRadiusNm&&aligned&&depth&&slow&&m.minesLaid<m.mineCount){m.layClock+=dt;while(m.layClock>=8&&m.minesLaid<m.mineCount){m.layClock-=8;m.minesLaid++;const side=(m.minesLaid%2?1:-1)*.025,hr=degToRad(sub.heading),p={xNm:sub.position.xNm+Math.cos(hr)*side,yNm:sub.position.yNm+Math.sin(hr)*side};m.mines.push({n:m.minesLaid,pos:p,t:now});if(m.minesLaid===1)this.notify('MINE LAYING — pattern started. Maintain 2–5 kn, 35–90 ft and assigned heading.','warn');}}
        else m.layClock=Math.max(0,m.layClock-dt*.25);
        if(m.minesLaid>=m.mineCount){_missionSetDone(c,'lay');this.captainLog?.('MINEFIELD_LAID',`Mine pattern laid — ${m.mineCount} mines.`,{count:m.mineCount},'minefield-laid');this._missionFinish(true);}
      }else if(m.type==='RECONNAISSANCE'){
        const rng=distNm(sub.position,m.center);if(rng<=m.radiusNm)_missionSetDone(c,'approach');
        const fired=(s.weapons.nextTorpedoId||1)-1>(m.weaponBaseline?.torps||0)||(s.weapons.deckGun?.shots||0)>(m.weaponBaseline?.gun||0);
        if(fired&&rng<=m.escapeRadiusNm&&!m.compromised){m.compromised=true;W.airThreat.level=clamp((W.airThreat.level||.5)+.35,0,1.5);this.alertEscorts?.('DECK_GUN',{...sub.position},.62);this.notify('RECONNAISSANCE COMPROMISED — weapons fire has alerted the anchorage. Complete identification and withdraw.','bad');}
      }
    },

    checkPrimaryMission(){
      const s=this.state,c=s.campaign,m=this.ensureMissionFramework(),W=s.world;if(!MISSION_PRIMARY_TYPES.includes(m.type))return false;if(m.result!=='ACTIVE')return true;
      if(m.type==='CONVOY_INTERDICTION'){
        const convoyIds=new Set(W.contacts.filter(x=>x.convoyId==='MAIN').map(x=>x.id)),located=Object.keys(W.contactTracks).some(id=>convoyIds.has(id));
        if(located&&!_missionObj(c,'locate')?.done){_missionSetDone(c,'locate');this.captainLog?.('CONVOY_SIGHTED','Enemy convoy sighted.',{},'convoy-sighted');}
        if(s.weapons.hits.some(h=>convoyIds.has(h.contactId)))_missionSetDone(c,'attack');
        const alive=W.contacts.filter(x=>x.convoyId==='MAIN'&&x.type!=='ESCORT'&&!x.sunk);
        if(!alive.length&&!this.primaryConvoyExists?.())this._missionFinish(true);return true;
      }
      if(m.type==='HIGH_VALUE_INTERCEPT'){
        const t=W.contacts.find(x=>x.id===m.targetId),rng=t?distNm(s.playerSub.position,t.position):Infinity,tr=t&&W.contactTracks[t.id];
        if(rng<=Math.max(5,m.intelUncertaintyNm||3))_missionSetDone(c,'intercept');
        if(tr&&tr.confidence>=.62&&(tr.positionSource==='VISUAL'||tr.source==='VISUAL')&&tr.typeEstimate&& !/UNKNOWN|SURFACE SHIP/i.test(tr.typeEstimate))_missionSetDone(c,'identify');
        if(_missionShipNeutralized(t)){_missionSetDone(c,'neutralize');this._missionFinish(true);}
        else if((s.time.elapsedSeconds||0)>m.deadlineAt)this._missionFinish(false,'intercept window expired');
        return true;
      }
      if(m.type==='RECONNAISSANCE'){
        m.identifiedIds=m.identifiedIds||[];
        for(const id of m.targetIds||[]){const tr=W.contactTracks[id];if(tr&&tr.confidence>=.62&&(tr.positionSource==='VISUAL'||tr.source==='VISUAL')&&tr.typeEstimate&&!/UNKNOWN|SURFACE SHIP/i.test(tr.typeEstimate)&&!m.identifiedIds.includes(id)){m.identifiedIds.push(id);this.captainLog?.('RECON_TARGET_IDENTIFIED',`${tr.typeEstimate} identified in ${m.siteName}.`,{contactId:id},`recon:${id}`);}}
        if(m.identifiedIds.length>=(m.targetIds?.length||2))_missionSetDone(c,'identify');
        if(_missionObj(c,'identify')?.done&&distNm(s.playerSub.position,m.center)>=m.escapeRadiusNm){_missionSetDone(c,'escape');this._missionFinish(true);}return true;
      }
      if(m.type==='LIFEGUARD'){
        if(distNm(s.playerSub.position,m.station)<=m.stationRadiusNm)_missionSetDone(c,'station');return true;
      }
      if(m.type==='SPECIAL_TRANSPORT'||m.type==='MINELAYING')return true;
      return true;
    }
  });
})();
