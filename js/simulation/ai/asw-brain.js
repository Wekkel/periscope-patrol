/* ═══════════════════════════════════════════════════ ASW BRAIN
   Escort doctrine lives here; sensors still decide what the enemy can know.
   The brain consumes only enemy solutions / noisy datum estimates.  It never
   asks for ownship's true position when choosing an escort course. */
const ASW_SCREEN_STATIONS=Object.freeze({
  FORWARD_SCREEN:{fwd:2.4,side:0},
  PORT_FLANK:{fwd:-0.3,side:-2.35},
  STARBOARD_FLANK:{fwd:-0.3,side:2.35},
  REAR_GUARD:{fwd:-3.5,side:0},
  ROAMING_SCOUT:{fwd:0.9,side:3.25}
});

function aswYear(dateLike){
  const m=String(dateLike||'').match(/(19\d{2})/);return m?+m[1]:1943;
}
function aswDoctrine(profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return getCampaignDoctrineProfile(profileId)?.asw||null;
}
function aswAreaRisk(areaKey,profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  return Number(aswDoctrine(profileId)?.areaRisk?.[areaKey]||0);
}
function aswEscortCount(areaKey,merchantCount,opts={},profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  const D=aswDoctrine(profileId),C=D?.escortCount;if(!C)return 1;
  const band=C.merchantBands?.find(x=>x.max===undefined||merchantCount<=x.max);
  let n=Number(band?.count??1)+aswAreaRisk(areaKey,profileId);
  const y=aswYear(opts.startDate);
  for(const m of C.yearModifiers||[])if((m.from===undefined||y>=m.from)&&(m.through===undefined||y<=m.through))n+=Number(m.add||0);
  n+=Number(C.difficultyModifiers?.[String(opts.difficulty||'').toUpperCase()]||0);
  return clamp(n,Number(C.min??1),Number(C.max??4));
}
function aswScreenRoles(count,areaKey,opts={},profileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  const D=aswDoctrine(profileId);if(!D)return['FORWARD_SCREEN'];
  const base=[...(D.screenRoles?.[count]||D.screenRoles?.[4]||['FORWARD_SCREEN'])];
  const R=D.roamingScout,y=aswYear(opts.startDate),difficulty=String(opts.difficulty||'').toUpperCase();
  if(R&&count>Number(R.replaceIndex??3)){
    const scout=aswAreaRisk(areaKey,profileId)>=Number(R.minAreaRisk??1)||difficulty===String(R.difficulty||'').toUpperCase()||y>=Number(R.fromYear??9999);
    if(scout)base[Number(R.replaceIndex??3)]=R.role||'ROAMING_SCOUT';
  }
  return base.slice(0,count);
}

/* Doctrine changes how an informed escort works a noisy datum; it never gives
   the escort a better source of knowledge. The small cache avoids allocating
   doctrine objects in the simulation loop. MAIN's authored opponent is Japan;
   campaign profiles can replace this baseline without changing ASW mechanics. */
const ASW_TACTICS_DEFAULT=Object.freeze({searchPattern:'EXPANDING_SQUARE',prosecutionFactor:1,searchGrowthFactor:1,
  speculativeAttackFactor:1,attackSpeedFactor:1,depthErrorFactor:1,training:.9});
const ASW_TACTICS_JAPAN=Object.freeze({id:'japan',searchPattern:'SECTOR',prosecutionFactor:.90,searchGrowthFactor:.88,
  speculativeAttackFactor:.82,attackSpeedFactor:.94,depthErrorFactor:1.16,training:.82,
  yearBands:Object.freeze([Object.freeze({from:1944,prosecutionFactor:1.02,searchGrowthFactor:1.02,speculativeAttackFactor:.96,training:.94})])});
const ASW_TACTICS_CACHE=new Map();
function aswTactics(state){
  const campaign=state?.campaign||{},profileId=campaign.campaignProfileId||'us-pacific';
  const authored=typeof getCampaignDoctrineProfile==='function'?getCampaignDoctrineProfile(profileId)?.asw?.tactics:null;
  const base=authored||ASW_TACTICS_JAPAN,year=aswYear(campaign.startDate||state?.time?.campaignDate),key=`${profileId}|${base.id||'default'}|${year}`;
  if(ASW_TACTICS_CACHE.has(key))return ASW_TACTICS_CACHE.get(key);
  const out={...ASW_TACTICS_DEFAULT,...base};delete out.yearBands;
  for(const band of base.yearBands||[])if((band.from===undefined||year>=band.from)&&(band.through===undefined||year<=band.through))Object.assign(out,band);
  delete out.from;delete out.through;Object.freeze(out);ASW_TACTICS_CACHE.set(key,out);return out;
}
function aswTraining(esc,state){
  const profile=typeof getVesselProfile==='function'?getVesselProfile(esc?.vesselProfileId):null;
  return clamp(Number(esc?.aswTraining??profile?.aswTraining??aswTactics(state).training),.55,1.25);
}

const ASWBrainSystem={
ensureASWState(){
    const W=this.state.world,e=W.enemy||(W.enemy={}),now=this.state.time.elapsedSeconds||0;
    const A=e.asw||(e.asw={});
    if(!Number.isFinite(A.generation))A.generation=0;
    if(!Number.isFinite(A.cueGeneration))A.cueGeneration=0;
    if(!Number.isFinite(A.roleGeneration))A.roleGeneration=0;
    if(!Number.isFinite(A.lastFixAt))A.lastFixAt=-999;
    if(!Number.isFinite(A.lastRoleAssignAt))A.lastRoleAssignAt=-999;
    if(!Number.isFinite(A.searchStartedAt))A.searchStartedAt=now;
    if(!Number.isFinite(A.searchRadiusNm))A.searchRadiusNm=.55;
    // ASW prosecution budget is deliberately separate from alertTimerSec.
    // Ordinary sonar reacquisition may keep the tactical plot alive, but it may
    // not reset the escort commander's willingness to leave the convoy for ever.
    // Strong new hostile acts (another torpedo, gunfire, collision etc.) can
    // legitimately start a fresh prosecution episode.
    if(!Number.isFinite(A.prosecutionStartedAt))A.prosecutionStartedAt=-1;
    if(!Number.isFinite(A.prosecutionSoftDeadlineAt))A.prosecutionSoftDeadlineAt=-1;
    if(!Number.isFinite(A.prosecutionHardDeadlineAt))A.prosecutionHardDeadlineAt=-1;
    if(!Array.isArray(A.pingEvents))A.pingEvents=[];
    const escorts=W.contacts.filter(c=>isASWCombatant(c));
    const campaign=this.state.campaign||{},fallback=aswScreenRoles(escorts.length,campaign.patrolArea,
      {startDate:campaign.startDate,difficulty:campaign.difficulty},campaign.campaignProfileId);
    for(let i=0;i<escorts.length;i++){
      const x=escorts[i];
      if(!ASW_SCREEN_STATIONS[x.screenRole])x.screenRole=fallback[i]||'REAR_GUARD';
      if(!x.aswRole)x.aswRole='SCREEN';
      if(!Number.isFinite(x.sonarMisses))x.sonarMisses=0;
      if(!Number.isFinite(x.sonarContactUntil))x.sonarContactUntil=-1;
      if(x.sonarContact===undefined)x.sonarContact=false;
    }
    return A;
  },
aswProsecutionLimits(){
    const d=String(this.state.campaign?.difficulty||'').toUpperCase();
    // Gameplay budget, in simulation seconds. A destroyer can continue beyond
    // the soft limit while it holds a firm contact, but an intermittent weak
    // echo cannot keep the whole screen detached from its convoy indefinitely.
    const f=aswTactics(this.state).prosecutionFactor;
    if(d==='HARD')return{softSec:24*60*f,hardSec:40*60*f};
    if(d==='EASY')return{softSec:14*60*f,hardSec:26*60*f};
    return{softSec:18*60*f,hardSec:32*60*f};
  },
armASWProsecution(reason='CONTACT',restart=false){
    const e=this.state.world.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds||0,L=this.aswProsecutionLimits();
    const strong=['SHIP_HIT','TORPEDO_LAUNCH','TORPEDO_SIGHTED','TORPEDO_DUD','DECK_GUN','COLLISION','EMERGENCY_BLOW','ACTIVE_ECHO','ACTIVE_QC'].includes(reason);
    const missing=A.prosecutionStartedAt<0||A.prosecutionSoftDeadlineAt<=now||A.prosecutionHardDeadlineAt<=now;
    if(restart||missing||strong){
      A.prosecutionStartedAt=now;A.prosecutionSoftDeadlineAt=now+L.softSec;A.prosecutionHardDeadlineAt=now+L.hardSec;A.prosecutionReason=reason;
    }
    return A;
  },
aswProsecutionExpiry(){
    const W=this.state.world,e=W.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds||0;
    if(e.alertState==='UNAWARE')return null;
    // Old saves have no episode timestamps. Start a fair fresh budget on the
    // first tick after upgrade rather than inventing elapsed prosecution time.
    if(A.prosecutionStartedAt<0||A.prosecutionHardDeadlineAt<=0)this.armASWProsecution('ONGOING_SEARCH',true);
    const firm=!!(e.contactHeld||e.visualOnSub);
    if(now>=A.prosecutionHardDeadlineAt&&!e.visualOnSub)return'HARD_LIMIT';
    if(now>=A.prosecutionSoftDeadlineAt&&!firm)return'SOFT_LIMIT';
    return null;
  },
resetASWProsecution(){
    const A=this.ensureASWState();A.prosecutionStartedAt=-1;A.prosecutionSoftDeadlineAt=-1;A.prosecutionHardDeadlineAt=-1;delete A.prosecutionReason;
  },
convoyFrame(){
    const W=this.state.world,all=W.contacts.filter(c=>c.convoyId==='MAIN'&&c.type!=='ESCORT'&&!c.sunk&&!c.harborTarget);
    if(!all.length)return null;
    const core=all.filter(c=>!shipIsStraggler(c)),ships=core.length?core:all;
    const lead=ships.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
    return{xNm:ships.reduce((v,c)=>v+c.position.xNm,0)/ships.length,
      yNm:ships.reduce((v,c)=>v+c.position.yNm,0)/ships.length,
      heading:lead.desiredHeading===undefined?lead.heading:lead.desiredHeading,
      speedKn:lead.baseSpeed||lead.speedKnots||8};
  },
damagedGuardShip(){
    const candidates=this.state.world.contacts.filter(c=>c.convoyId==='MAIN'&&shipIsStraggler(c)&&(c.convoyGuardEligible!==false||shipDamageSeverity(c)>.10));
    if(!candidates.length)return null;
    return candidates.slice().sort((a,b)=>shipDamageSeverity(b)-shipDamageSeverity(a)||
      distNm(a.position,this.convoyFrame()||a.position)-distNm(b.position,this.convoyFrame()||b.position))[0];
  },
damagedGuardTarget(esc,ship){
    if(!ship)return null;
    const r=degToRad(ship.heading||0),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
    const side=_shipHash01(`${esc.id}:guard-side`)<.5?-1:1;
    return{xNm:ship.position.xNm-fx*.45+sx*side*.60,yNm:ship.position.yNm-fy*.45+sy*side*.60};
  },
screenTarget(esc){
    const f=this.convoyFrame();if(!f)return null;
    const st=ASW_SCREEN_STATIONS[esc.screenRole]||ASW_SCREEN_STATIONS.REAR_GUARD;
    let fwd=st.fwd,side=st.side;
    if(esc.screenRole==='ROAMING_SCOUT'){
      const p=(this.state.time.elapsedSeconds||0)/5400*Math.PI*2+(esc.roamPhase??Math.PI/2);
      side*=.85*Math.sin(p);fwd+=.55*Math.cos(p);
    }else{
      const p=(this.state.time.elapsedSeconds||0)/95+(esc.formationIndex||0)*1.1;
      side+=Math.sin(p)*.22;fwd+=Math.cos(p*.7)*.16;
    }
    const r=degToRad(f.heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
    return{xNm:f.xNm+fx*fwd+sx*side,yNm:f.yNm+fy*fwd+sy*side};
  },
cueEstimate(pos,conf=0.5,reason='NOISE'){
    const base={SHIP_HIT:.07,TORPEDO_DUD:.16,TORPEDO_LAUNCH:.28,TORPEDO_SIGHTED:.22,EMERGENCY_BLOW:.18,
      DECK_GUN:.12,COLLISION:.05,AIR_ATTACK:.34,NOISE:.46,RADIO_BEARING:.72}[reason]??.32;
    const maxErr=base*clamp(1.35-conf*.55,.65,1.25)*aswTactics(this.state).depthErrorFactor,a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*maxErr;
    return{xNm:pos.xNm+Math.cos(a)*r,yNm:pos.yNm+Math.sin(a)*r,errNm:maxErr};
  },
noteASWCue(pos,conf,reason){
    const e=this.state.world.enemy,A=this.ensureASWState(),q=this.cueEstimate(pos,conf,reason),now=this.state.time.elapsedSeconds;
    e.lastKnownSubPosition={xNm:q.xNm,yNm:q.yNm};e.lastKnownConfidence=Math.max(e.lastKnownConfidence||0,conf||0);
    e.searchCenter={xNm:q.xNm,yNm:q.yNm};
    A.datum={xNm:q.xNm,yNm:q.yNm,errNm:q.errNm,source:reason};A.datumAt=now;A.searchStartedAt=now;
    A.searchRadiusNm=clamp(.45+q.errNm*1.6,.45,1.4);A.lastCue=reason;A.cueGeneration++;
    this.assignASWRoles(null,true);
    return q;
  },
freshStrongASWCue(s=null){
    const A=this.ensureASWState(),now=this.state.time.elapsedSeconds||0,source=A.datum?.source||A.lastCue;
    if(!['ACTIVE_QC','ACTIVE_ECHO'].includes(source)||now-(A.datumAt||-999)>48)return false;
    // A solution's age is the only knowledge-safe timestamp available on old
    // saves. The new acoustic cue wins only when it is actually newer; a fresh
    // visual/sonar fix remains superior.
    return !s||!Number.isFinite(s.ageSec)||(A.datumAt||-999)>now-s.ageSec+2;
  },
aswDatum(leadSec=0){
    const e=this.state.world.enemy,A=this.ensureASWState();
    const s=e.solution&&!e.solution.decoy?e.solution:null;
    const cueWins=this.freshStrongASWCue(s),base=!cueWins&&s?{xNm:s.xNm,yNm:s.yNm}:{...(A.datum||e.searchCenter||e.lastKnownSubPosition||{})};
    if(!Number.isFinite(base.xNm)||!Number.isFinite(base.yNm))return null;
    const crs=cueWins?A.estimatedCourseDeg:(s?.courseDeg??A.estimatedCourseDeg),spd=cueWins?A.estimatedSpeedKn:(s?.speedKn??A.estimatedSpeedKn);
    if(leadSec>0&&Number.isFinite(crs)&&Number.isFinite(spd)){
      const d=knotsNmSec(clamp(spd,0,14))*leadSec,r=degToRad(crs);
      base.xNm+=Math.sin(r)*d;base.yNm-=Math.cos(r)*d;
    }
    return base;
  },
noteASWFix(esc,source='ACTIVE',quality=.7){
    const e=this.state.world.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds,s=e.solution;
    if(!s)return;
    const wasHeld=!!e.contactHeld;
    A.datum={xNm:s.xNm,yNm:s.yNm,errNm:s.errNm||.05,source};A.datumAt=now;A.lastFixAt=now;A.lastFixOwnerId=esc?.id||null;A.lastFixSource=source;
    A.estimatedCourseDeg=s.courseDeg;A.estimatedSpeedKn=s.speedKn;A.searchRadiusNm=clamp(.25+(s.errNm||.03)*2,.25,.8);
    e.searchCenter={xNm:s.xNm,yNm:s.yNm};e.lastKnownSubPosition={xNm:s.xNm,yNm:s.yNm};
    if(!wasHeld||now-A.lastRoleAssignAt>50)this.assignASWRoles(esc?.id,true);
    if(!wasHeld){
      this.log(source==='VISUAL'
        ?`VISUAL CONTACT — ${esc?.name||'escort'} sighted the boat near the surface.`
        :`SONAR CONTACT — ${esc?.name||'escort'} has a firm echo.`, 'bad');
      A.generation++;
    }
    return quality;
  },
loseASWContact(){
    const e=this.state.world.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds;
    A.searchStartedAt=now;A.searchRadiusNm=clamp(.45+(e.solution?.errNm||A.datum?.errNm||.08)*2,.45,1.2);
    const d=this.aswDatum();if(d){e.searchCenter={xNm:d.xNm,yNm:d.yNm};A.datum={...A.datum,...d};}
    this.assignASWRoles(null,true);
    this.log('ASW plot: firm contact lost; escorts are widening the search box.');
  },
assignASWRoles(preferredId=null,force=false){
    const W=this.state.world,e=W.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds;
    if(!force&&now-A.lastRoleAssignAt<8)return;
    const escorts=W.contacts.filter(c=>isASWCombatant(c));if(!escorts.length)return;
    const informedIds=Array.isArray(e.alertedEscortIds)?e.alertedEscortIds.filter(id=>escorts.some(x=>x.id===id)):[];
    if(Array.isArray(e.alertedEscortIds)&&e.alertedEscortIds.length)e.alertedEscortIds=informedIds;
    const straggler=this.damagedGuardShip();
    let guard=null;
    if(straggler&&escorts.length>=2){
      guard=escorts.find(x=>x.guardShipId===straggler.id)||escorts.find(x=>x.screenRole==='REAR_GUARD')||
        escorts.slice().sort((a,b)=>distNm(a.position,straggler.position)-distNm(b.position,straggler.position))[0];
    }
    for(const x of escorts){delete x.guardShipId;if(x===guard){x.guardShipId=straggler.id;x.aswRole='DAMAGED_GUARD';}}
    const responders=e.alertState!=='UNAWARE'&&informedIds.length
      ?escorts.filter(x=>informedIds.includes(x.id))
      :escorts;
    const active=responders.filter(x=>x!==guard);
    // Uninformed escorts stay on the convoy screen. This keeps the shared ASW
    // plot as an implementation detail rather than a telepathic fleet network.
    if(e.alertState!=='UNAWARE'&&informedIds.length){
      for(const x of escorts)if(x!==guard&&!informedIds.includes(x.id)){x.aswRole='SCREEN';x.aswExpended=false;}
    }
    if(e.alertState==='UNAWARE'||!this.aswDatum()){
      for(const x of active){x.aswRole='SCREEN';x.aswExpended=false;}A.lastRoleAssignAt=now;
      A.roles=Object.fromEntries(escorts.map(x=>[x.id,x.aswRole]));return;
    }
    // Escorts that can no longer throw a complete pattern return to convoy
    // protection instead of continuing to orbit the datum as a fake prosecutor.
    const depleted=active.filter(x=>(x.dcRemaining===undefined?28:x.dcRemaining)<SONAR.patternSize);
    for(const x of depleted){x.aswExpended=true;x.aswRole='CONVOY_GUARD';}
    const hunting=active.filter(x=>!depleted.includes(x));
    const datum=this.aswDatum(),withCharges=hunting.filter(x=>(x.dcRemaining===undefined?28:x.dcRemaining)>=SONAR.patternSize);
    let prosecutor=withCharges.find(x=>x.id===preferredId)||withCharges.slice().sort((a,b)=>distNm(a.position,datum)-distNm(b.position,datum))[0]||null;
    for(const x of hunting)x.aswRole='SWEEP';
    if(prosecutor)prosecutor.aswRole='PROSECUTOR';
    let rem=hunting.filter(x=>x!==prosecutor);
    if(hunting.length>=4){
      const frame=this.convoyFrame();let convoyGuard=rem.find(x=>x.screenRole==='REAR_GUARD');
      if(!convoyGuard&&frame)convoyGuard=rem.slice().sort((a,b)=>distNm(a.position,frame)-distNm(b.position,frame))[0];
      if(convoyGuard){convoyGuard.aswRole='CONVOY_GUARD';rem=rem.filter(x=>x!==convoyGuard);}
    }
    if(rem.length){
      const c=rem.slice().sort((a,b)=>distNm(a.position,datum)-distNm(b.position,datum))[0];c.aswRole='CONTAINMENT';rem=rem.filter(x=>x!==c);
    }
    for(const x of rem)x.aswRole='SWEEP';
    A.roleGeneration++;A.lastRoleAssignAt=now;
    A.roles=Object.fromEntries(escorts.map(x=>[x.id,x.aswRole]));
    this.log(`ASW roles: ${escorts.map(x=>`${x.id} ${x.aswRole.replace('_',' ')}`).join(' · ')}`);
  },
updateASWBrain(dt){
    const W=this.state.world,e=W.enemy,A=this.ensureASWState(),now=this.state.time.elapsedSeconds;
    const escorts=W.contacts.filter(c=>isASWCombatant(c));
    for(const x of escorts)if(x.sonarContact&&now>(x.sonarContactUntil||-1))x.sonarContact=false;
    const straggler=this.damagedGuardShip(),guard=escorts.find(x=>x.aswRole==='DAMAGED_GUARD');
    if((straggler&&escorts.length>=2&&(!guard||guard.guardShipId!==straggler.id))||(!straggler&&guard))this.assignASWRoles(null,true);
    if(e.alertState==='UNAWARE'){
      if(escorts.some(x=>x.aswRole!=='SCREEN'&&x.aswRole!=='DAMAGED_GUARD'))this.assignASWRoles(null,true);
      return;
    }
    if(e.solution&&!e.solution.decoy&&!this.freshStrongASWCue(e.solution)){
      A.estimatedCourseDeg=e.solution.courseDeg;A.estimatedSpeedKn=e.solution.speedKn;
      A.datum={xNm:e.solution.xNm,yNm:e.solution.yNm,errNm:e.solution.errNm||.05,source:A.lastFixSource||'PLOT'};
    }
    if(e.alertState==='SEARCHING'){
      const lost=Math.max(0,now-(A.lastFixAt>-900?A.lastFixAt:A.searchStartedAt));
      const f=aswTactics(this.state).searchGrowthFactor;
      A.searchRadiusNm=clamp((A.searchRadiusNm||.55)+dt*(.0085+Math.min(lost,360)/360*.006)*f,.45,5.5);
      const d=this.aswDatum();if(d)e.searchCenter={xNm:d.xNm,yNm:d.yNm};
    }
  },
searchTarget(esc){
    const e=this.state.world.enemy,A=this.ensureASWState(),datum=this.aswDatum();if(!datum)return this.screenTarget(esc);
    const role=esc.aswRole||'SWEEP',r=clamp(A.searchRadiusNm||.7,.4,5.5),t=(e.searchPhase||0),course=e.solution?.courseDeg??A.estimatedCourseDeg??0;
    if(role==='CONVOY_GUARD'||role==='SCREEN')return this.screenTarget(esc)||datum;
    if(role==='CONTAINMENT'){
      const rr=1.15+Math.min(1.0,r*.35),a=degToRad(course),side=(esc.formationIndex||0)%2?1:-1;
      return{xNm:datum.xNm+Math.sin(a)*rr+Math.cos(a)*side*.35,yNm:datum.yNm-Math.cos(a)*rr+Math.sin(a)*side*.35};
    }
    if(role==='SWEEP'){
      // Parallel sweep: long legs across the likely escape axis, each pass moved
      // outward as the search box grows.
      const leg=Math.floor(t/55+(esc.formationIndex||0))%4,along=leg<2?-r:r;
      const cross=((t%55)/55*2-1)*r*(leg%2===0?1:-1),a=degToRad(course),sx=Math.cos(a),sy=Math.sin(a),fx=Math.sin(a),fy=-Math.cos(a);
      return{xNm:datum.xNm+fx*along+sx*cross,yNm:datum.yNm+fy*along+sy*cross};
    }
    const pattern=aswTactics(this.state).searchPattern;
    if(pattern==='SECTOR'){
      const spoke=Math.floor(t/34)%6,rr=Math.min(r,.42+((t%34)/34)*r),a=degToRad(normDeg(course+spoke*60));
      return{xNm:datum.xNm+Math.sin(a)*rr,yNm:datum.yNm-Math.cos(a)*rr};
    }
    if(pattern==='CIRCULAR'){
      const a=degToRad(normDeg(course+t*2.2+(esc.formationIndex||0)*80)),rr=Math.min(r,.55+Math.floor(t/110)*.38);
      return{xNm:datum.xNm+Math.sin(a)*rr,yNm:datum.yNm-Math.cos(a)*rr};
    }
    // Default prosecutor pattern: expanding square on the dead-reckoned datum.
    const leg=Math.floor(t/38)%4,dirs=[0,90,180,270],rings=1+Math.floor(t/152),rr=Math.min(r,.45+rings*.42),a=degToRad(normDeg(course+dirs[leg]));
    return{xNm:datum.xNm+Math.sin(a)*rr,yNm:datum.yNm-Math.cos(a)*rr};
  }
};
