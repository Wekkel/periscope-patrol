// ═══════════════════════════════════════════════════ PATCH 7 — PACIFIC TRAFFIC DIRECTOR
// The ocean is populated without simulating every hull at full fidelity all
// patrol long. Distant traffic is a tiny abstract route track. Only groups
// inside the tactical bubble are expanded into normal world contacts, where
// all existing physics, sensing, collision and ship-damage systems take over.
const TRAFFIC_DIRECTOR_VERSION=2;
const TRAFFIC_TICK_SEC=10;
const TRAFFIC_ACTIVATE_NM=23;
const TRAFFIC_DEACTIVATE_NM=34;
const TRAFFIC_MAX_TACTICAL_GROUPS=3;
const TRAFFIC_OBSERVED_TACTICAL_HOLD_SEC=180;

function _trafficHash(seed,text){
  let h=((Number(seed)||1)*2654435761)>>>0;
  for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967295;
}
function _trafficSideOffset(pos,heading,sideNm){
  const r=degToRad(heading+90);
  return{xNm:pos.xNm+Math.sin(r)*sideNm,yNm:pos.yNm-Math.cos(r)*sideNm};
}
function _trafficWaterPoint(engine,pos,fallback){
  if(typeof Bathy==='undefined'||!engine.state.world.terrain?.length)return pos;
  return Bathy.feet(pos.xNm,pos.yNm)>=18?pos:{...fallback};
}
function _trafficNumber(spec,H,tagOverride=null){
  if(Number.isFinite(spec))return spec;
  if(!spec||!Number.isFinite(spec.base))return 0;
  return spec.base+Math.round(H(tagOverride||spec.hash||'value')*(spec.spread||0));
}
function _trafficManifest(group,state=null){
  const traffic=getAmbientTrafficProfile(state?.campaign?.campaignProfileId),kind=traffic?.kinds?.[group.kind],recipe=kind?.manifest;
  if(!recipe)return[];
  const H=(tag)=>_trafficHash(group.seed,tag);
  const signature=type=>({TANKER:[1.0,.38],DESTROYER:[.74,.68],KAIBOKAN:[.64,.58],WARSHIP:[.72,.62],PATROL_CRAFT:[.52,.46],HEAVY_CRUISER:[1.20,.72],CARRIER:[1.42,.76],JUNK:[.28,.10]}[type]||[.82,.28]);
  const mk=(spec,suffix='A',name=spec.name,lengthTag=null,tonsTag=null)=>{const sig=signature(spec.type);return{
    suffix:spec.suffix||suffix,name,type:spec.type,vesselProfileId:spec.vesselProfileId,modelKey:spec.modelKey,displayType:spec.displayType,
    lengthYards:_trafficNumber(spec.length,H,lengthTag),tonsFactor:_trafficNumber(spec.tons,H,tonsTag),side:spec.side||kind.side,
    visualProfile:spec.visualProfile??sig[0],acousticBase:spec.acousticBase??sig[1],speedBias:spec.speedBias||0,hasSonar:spec.hasSonar
  };};
  if(recipe.style==='SINGLE')return[mk(recipe.member)];
  if(recipe.style==='SMALL_CONVOY'){
    const n=recipe.countBase+(H(recipe.countExtraHash)>recipe.countExtraAbove?1:0),out=[];
    for(let i=0;i<n;i++)out.push(i===recipe.tankerIndex&&H(recipe.tankerHash)>recipe.tankerAbove
      ?mk(recipe.tanker,String.fromCharCode(65+i))
      :mk(recipe.merchant,String.fromCharCode(65+i),`${recipe.merchant.namePrefix}${i+1}`,`m${i}`,`t${i}`));
    if(H(recipe.guardHash)>recipe.guardAbove)out.push(H(recipe.guardTypeHash)>recipe.guardTypeAbove?mk(recipe.guardHigh,'P'):mk(recipe.guardLow,'P'));
    return out;
  }
  if(recipe.style==='TASK_GROUP'){
    const out=(recipe.fixed||[]).map(spec=>mk(spec,spec.suffix)),rare=H(recipe.coreHash);
    const core=rare>recipe.heavyAbove?recipe.heavy:rare>recipe.carrierAbove?recipe.carrier:(H(recipe.transportHash)>recipe.transportAbove?recipe.transport:null);
    if(core)out.push(mk(core,core.suffix));return out;
  }
  return[];
}
function _trafficFormation(i){
  const a=[{fwd:0,side:0},{fwd:-.55,side:-.36},{fwd:-.55,side:.36},{fwd:-1.10,side:0},{fwd:-1.35,side:-.52},{fwd:-1.35,side:.52}];
  return a[i]||{fwd:-i*.45,side:(i%2?-.4:.4)};
}

(function installTrafficDirector(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureTrafficDirector(reset=false){
      const s=this.state,W=s.world;
      if(reset||!W.traffic||W.traffic.version!==TRAFFIC_DIRECTOR_VERSION){
        const legacy=!Object.prototype.hasOwnProperty.call(W,'traffic');
        W.traffic={version:TRAFFIC_DIRECTOR_VERSION,enabled:reset||legacy,groups:[],nextId:1,clock:0,lastTickAt:s.time.elapsedSeconds||0,
          activateRadiusNm:TRAFFIC_ACTIVATE_NM,deactivateRadiusNm:TRAFFIC_DEACTIVATE_NM,maxTacticalGroups:TRAFFIC_MAX_TACTICAL_GROUPS,
          generated:false,materializeCount:0,dematerializeCount:0};
      }
      const T=W.traffic;
      if(T.enabled&&(!T.generated||reset))this.generateTrafficDirector();
      return T;
    },

    generateTrafficDirector(){
      const s=this.state,W=s.world,T=W.traffic,route=(W.convoyRoutes||[])[0];
      if(!T||!T.enabled||!route)return T;
      const path=this.resolveWaterRoute(route);if(!path||path.length<2)return T;
      const C=routeCum(path),L=C[C.length-1];if(L<10)return T;
      const area=s.campaign.patrolArea||'Patrol Area',seed=s.campaign.scenarioSeed||1,hp=s.campaign.historicalProfile||null;
      const traffic=getAmbientTrafficProfile(s.campaign?.campaignProfileId);
      if(!traffic)throw new Error(`Campaign ${s.campaign?.campaignProfileId||'UNKNOWN'} has no ambient traffic profile`);
      const baseDensity=traffic.densityByArea?.[area]??traffic.defaultDensity??8;
      const density=clamp(Math.round(baseDensity*(hp?.trafficDensityFactor||1)),traffic.minDensity??6,traffic.maxDensity??12),base=traffic.baseKinds||[];
      const kinds=[];for(let i=0;i<density;i++)kinds.push(i<base.length?base[i]:base[Math.floor(_trafficHash(seed,`kind:${i}`)*base.length)%base.length]);
      const task=traffic.taskGroup;if(task&&_trafficHash(seed,`${area}:${task.hashSuffix}`)<task.chance)kinds[Math.max(0,kinds.length-(task.replaceFromEnd||1))]=task.kind;
      // Friendly/neutral traffic remains campaign-authored content; the engine
      // only applies the profile's deterministic replacement rule.
      const friendly=traffic.friendlyTraffic;
      if(friendly&&!friendly.excludedAreas?.includes(area)&&_trafficHash(seed,`${area}:${friendly.hashSuffix}`)<friendly.chance)kinds[Math.max(0,kinds.length-(friendly.replaceFromEnd||1))]=friendly.kind;
      T.groups=kinds.map((kindId,i)=>{
        const kind=traffic.kinds?.[kindId];if(!kind)throw new Error(`Ambient traffic kind ${kindId} is not defined by ${traffic.id}`);
        const h=_trafficHash(seed,`${area}:traffic:${i}`),dir=_trafficHash(seed,`dir:${i}`)<.5?-1:1,s0=((i+.22+h*.56)/kinds.length)*L;
        const laneBase=kind.laneBase||0,q=routeAdvance(path,s0,dir,0),side=(laneBase?laneBase*(h<.5?-1:1):(_trafficHash(seed,`lane:${i}`)-.5)*1.2),p=_trafficWaterPoint(this,_trafficSideOffset(q.pos,q.heading,side),q.pos);
        const id=`T${String(i+1).padStart(2,'0')}`,histSpeed=kind.historicalMerchantSpeed?(hp?.merchantSpeedBonus||0):0;
        return{id,seed:Math.floor((seed*9973+i*7919+17)%2147483647),kind:kindId,label:kind.label||kindId,side:kind.side||'ENEMY',
          state:'ABSTRACT',routeS:q.s,routeDir:q.dir,laneOffsetNm:side,position:p,heading:q.heading,speedKnots:clamp((kind.speedBase??8)+histSpeed+(h-.5)*2.0,3,22),
          memberIds:[],materializedAt:null,lastAbstractAt:s.time.elapsedSeconds||0};
      });
      this.adoptPrimaryConvoy();T.generated=true;T.lastTickAt=s.time.elapsedSeconds||0;return T;
    },

    trafficGroupPosition(g,path){
      const q=routeAdvance(path,g.routeS||0,g.routeDir||1,0),off=_trafficSideOffset(q.pos,q.heading,g.laneOffsetNm||0);
      return{q,pos:_trafficWaterPoint(this,off,q.pos)};
    },

    adoptPrimaryConvoy(){
      const s=this.state,W=s.world,T=W.traffic,ships=(W.contacts||[]).filter(c=>c.convoyId==='MAIN');if(!ships.length)return null;
      const alive=ships.filter(c=>!c.sunk),use=alive.length?alive:ships,center={xNm:use.reduce((a,c)=>a+c.position.xNm,0)/use.length,yNm:use.reduce((a,c)=>a+c.position.yNm,0)/use.length};
      const route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route),pr=path?.length?routeProject(path,center):null,lead=use.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
      T.primaryGroup={id:'MAIN',label:'convoy',kind:'CONVOY',side:'ENEMY',missionCritical:true,state:'TACTICAL',position:center,heading:lead?.heading||0,
        speedKnots:lead?.baseSpeed||lead?.speedKnots||8,routeS:pr?.s??0,routeDir:W.convoyLeg||1,memberIds:ships.map(c=>c.id),savedMembers:null,abstractedAt:null,materializedAt:s.time.elapsedSeconds||0,destroyed:false};
      return T.primaryGroup;
    },

    primaryConvoyExists(){
      const W=this.state.world,g=W.traffic?.primaryGroup;if(!g||g.destroyed)return false;
      if(g.state==='TACTICAL')return (W.contacts||[]).some(c=>c.convoyId==='MAIN'&&!isSurfaceCombatant(c)&&!c.sunk);
      if(g.state==='ABSTRACT')return (g.savedMembers||[]).some(c=>!isSurfaceCombatant(c)&&!c.sunk);
      return false;
    },

    syncPrimaryConvoy(g){
      const W=this.state.world,ships=(W.contacts||[]).filter(c=>c.convoyId==='MAIN'),alive=ships.filter(c=>!c.sunk);if(!ships.length)return;
      if(!alive.length){g.destroyed=true;g.state='TACTICAL';return;}
      const center={xNm:alive.reduce((a,c)=>a+c.position.xNm,0)/alive.length,yNm:alive.reduce((a,c)=>a+c.position.yNm,0)/alive.length},route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route),pr=path?.length?routeProject(path,center):null,lead=alive.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
      g.position=center;g.heading=lead?.heading??g.heading;g.speedKnots=lead?.baseSpeed||lead?.speedKnots||g.speedKnots;if(pr)g.routeS=pr.s;g.routeDir=W.convoyLeg||g.routeDir||1;g.memberIds=ships.map(c=>c.id);
    },

    abstractPrimaryConvoy(g){
      const s=this.state,W=s.world,ships=(W.contacts||[]).filter(c=>c.convoyId==='MAIN');if(!ships.length||g.state!=='TACTICAL')return false;
      if(ships.some(c=>c.sunk||shipDamageSeverity(c)>.02)||ships.some(c=>{const tr=W.contactTracks[c.id];return tr&&tr.confidence>.04&&(tr.staleSeconds||0)<TRAFFIC_OBSERVED_TACTICAL_HOLD_SEC;}))return false;
      if((s.weapons.activeTorpedoes||[]).some(t=>ships.some(c=>c.id===t.targetId)&&t.status==='RUNNING'))return false;
      this.syncPrimaryConvoy(g);const r=degToRad(g.heading||0),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
      g.savedMembers=ships.map(c=>{const dx=c.position.xNm-g.position.xNm,dy=c.position.yNm-g.position.yNm,copy=JSON.parse(JSON.stringify(c));copy._trafficPrimaryFwd=dx*fx+dy*fy;copy._trafficPrimarySide=dx*sx+dy*sy;delete copy.position;return copy;});
      const ids=new Set(ships.map(c=>c.id));W.contacts=W.contacts.filter(c=>!ids.has(c.id));
      for(const id of ids){const tr=W.contactTracks[id];if(tr){tr.worldContactAbstract=true;tr.abstractedAt=s.time.elapsedSeconds||0;}}
      g.memberIds=[];g.state='ABSTRACT';g.abstractedAt=s.time.elapsedSeconds||0;return true;
    },

    materializePrimaryConvoy(g,path){
      const s=this.state,W=s.world;if(!g||g.state!=='ABSTRACT'||!g.savedMembers?.length)return false;
      const q=routeAdvanceOneWay(path,g.routeS||0,0),off=_trafficSideOffset(q.pos,q.heading,0),r=degToRad(q.heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r),ids=[];
      for(const saved of g.savedMembers){const c=JSON.parse(JSON.stringify(saved)),f=c._trafficPrimaryFwd||0,side=c._trafficPrimarySide||0;delete c._trafficPrimaryFwd;delete c._trafficPrimarySide;c.position={xNm:off.xNm+fx*f+sx*side,yNm:off.yNm+fy*f+sy*side};c.heading=q.heading;c.desiredHeading=q.heading;c.speedKnots=clamp(c.speedKnots||c.baseSpeed||g.speedKnots,0,30);c.desiredSpeed=c.baseSpeed||c.speedKnots;materializeVesselIdentity(c,s);W.contacts.push(c);if(W.contactTracks[c.id])W.contactTracks[c.id].worldContactAbstract=false;ids.push(c.id);}
      g.memberIds=ids;g.state='TACTICAL';g.position={...off};g.heading=q.heading;g.routeDir=q.dir;g.materializedAt=s.time.elapsedSeconds||0;W.convoyLeg=q.dir;this.sys.aswBrain.assignASWRoles?.(null,true);return true;
    },

    updatePrimaryTraffic(g,path,step){
      if(!g||g.destroyed)return;const s=this.state,W=s.world,sub=s.playerSub;
      if(g.state==='TACTICAL'){
        this.syncPrimaryConvoy(g);if(g.destroyed)return;
        const d=distNm(sub.position,g.position);if(d>38)this.abstractPrimaryConvoy(g);
      }else if(g.state==='ABSTRACT'){
        const q=routeAdvanceOneWay(path,g.routeS||0,knotsNmSec(g.speedKnots||8)*step);g.routeS=q.s;g.routeDir=1;g.heading=q.heading;g.position={...q.pos};g.routeEnded=!!q.ended;
        if(distNm(sub.position,g.position)<=28)this.materializePrimaryConvoy(g,path);
      }
    },

    materializeTrafficGroup(g){
      const s=this.state,W=s.world,T=W.traffic;if(!g||g.state==='TACTICAL')return g;
      const route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route);if(!path?.length)return g;
      const {q,pos}=this.trafficGroupPosition(g,path),defs=_trafficManifest(g,s);g.memberIds=[];
      for(let i=0;i<defs.length;i++){
        const d=defs[i],o=_trafficFormation(i),r=degToRad(q.heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
        const p0={xNm:pos.xNm+fx*o.fwd+sx*o.side,yNm:pos.yNm+fy*o.fwd+sy*o.side},p=_trafficWaterPoint(this,p0,pos);
        const hp=s.campaign.historicalProfile||null,isEnemyMerchant=d.side==='ENEMY'&&(d.type==='MERCHANT'||d.type==='TANKER'),scale=isEnemyMerchant?(hp?.merchantTonnageFactor||1):1;
        const id=`${g.id}-${d.suffix}`,contact={id,name:d.name,type:d.type,vesselProfileId:d.vesselProfileId,modelKey:d.modelKey,displayType:d.displayType,lengthYards:Math.round(d.lengthYards*(1+(scale-1)*.28)),tonsFactor:Math.round(d.tonsFactor*scale),
          visualProfile:d.visualProfile,acousticBase:d.acousticBase,side:d.side,position:p,heading:normDeg(q.heading+(_trafficHash(g.seed,`hdg:${i}`)-.5)*2),
          desiredHeading:q.heading,speedKnots:clamp(g.speedKnots+d.speedBias+(_trafficHash(g.seed,`spd:${i}`)-.5)*.35,2,26),
          baseSpeed:clamp(g.speedKnots+d.speedBias,2,26),desiredSpeed:clamp(g.speedKnots+d.speedBias,2,26),trafficAmbient:true,trafficGroupId:g.id,
          convoyId:`TRAFFIC-${g.id}`,convoyRole:'TRAFFIC',formationIndex:i,trafficFormationFwd:o.fwd,trafficFormationSide:o.side};
        materializeVesselIdentity(contact,s);W.contacts.push(contact);if(W.contactTracks[id])W.contactTracks[id].worldContactAbstract=false;g.memberIds.push(id);
      }
      g.state='TACTICAL';g.materializedAt=s.time.elapsedSeconds||0;T.materializeCount=(T.materializeCount||0)+1;return g;
    },

    trafficGroupObserved(g){
      const W=this.state.world;if(!g?.memberIds?.length)return false;
      return g.memberIds.some(id=>{const tr=W.contactTracks[id];return tr&&tr.confidence>.04&&(tr.staleSeconds||0)<TRAFFIC_OBSERVED_TACTICAL_HOLD_SEC;});
    },

    dematerializeTrafficGroup(g){
      const s=this.state,W=s.world,T=W.traffic;if(!g||g.state!=='TACTICAL')return g;
      const members=W.contacts.filter(c=>c.trafficGroupId===g.id);
      if(!members.length){g.state='ABSTRACT';g.memberIds=[];return g;}
      if(this.trafficGroupObserved(g))return g;
      if(members.some(c=>c.sunk||shipDamageSeverity(c)>.025||c.missionRole||c.harborTarget))return g;
      const center={xNm:members.reduce((a,c)=>a+c.position.xNm,0)/members.length,yNm:members.reduce((a,c)=>a+c.position.yNm,0)/members.length};
      const route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route);if(path?.length>1){const pr=routeProject(path,center);g.routeS=pr.s;}
      g.position=center;g.heading=members[0]?.heading??g.heading;g.speedKnots=members.reduce((a,c)=>a+c.speedKnots,0)/members.length;
      const ids=new Set(g.memberIds);W.contacts=W.contacts.filter(c=>!ids.has(c.id));
      for(const id of ids){const tr=W.contactTracks[id];if(tr){tr.worldContactAbstract=true;tr.abstractedAt=s.time.elapsedSeconds||0;}}
      g.memberIds=[];g.state='ABSTRACT';g.lastAbstractAt=s.time.elapsedSeconds||0;
      T.dematerializeCount=(T.dematerializeCount||0)+1;return g;
    },

    updateMaterializedTrafficGroup(g,path){
      const W=this.state.world,members=W.contacts.filter(c=>c.trafficGroupId===g.id&&!c.sunk);if(!members.length)return;
      const leader=members.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
      const pr=routeProject(path,leader.position),aim=routeAdvance(path,pr.s,g.routeDir||1,1.0);g.routeS=pr.s;g.routeDir=aim.dir;g.heading=aim.heading;
      g.position={xNm:members.reduce((a,c)=>a+c.position.xNm,0)/members.length,yNm:members.reduce((a,c)=>a+c.position.yNm,0)/members.length};
      g.speedKnots=members.reduce((a,c)=>a+c.speedKnots,0)/members.length;
      if(!leader.scattering){leader.desiredHeading=bearingBetween(leader.position,aim.pos);leader.desiredSpeed=leader.baseSpeed||g.speedKnots;}
      const hr=degToRad(leader.desiredHeading??leader.heading),fx=Math.sin(hr),fy=-Math.cos(hr),sx=Math.cos(hr),sy=Math.sin(hr);
      for(const c of members){
        if(c===leader||c.scattering||shipIsStraggler(c))continue;
        const o={fwd:c.trafficFormationFwd||0,side:c.trafficFormationSide||0},target={xNm:leader.position.xNm+fx*o.fwd+sx*o.side,yNm:leader.position.yNm+fy*o.fwd+sy*o.side};
        const err=distNm(c.position,target);c.desiredHeading=bearingBetween(c.position,target);c.desiredSpeed=clamp((leader.baseSpeed||g.speedKnots)+err*.45,2,24);
      }
    },

    updateTrafficDirector(dt){
      const s=this.state,W=s.world,T=this.ensureTrafficDirector();if(!T?.enabled||!T.generated)return;
      T.clock=(T.clock||0)+dt;if(T.clock<TRAFFIC_TICK_SEC)return;const step=T.clock;T.clock=0;
      const route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route);if(!path?.length)return;
      const sub=s.playerSub,groups=T.groups||[];
      this.updatePrimaryTraffic(T.primaryGroup,path,step);
      // Abstract motion is paid only once every ten simulated seconds.
      for(const g of groups){
        if(g.state==='ABSTRACT'){
          const move=knotsNmSec(g.speedKnots||8)*step,q=routeAdvance(path,g.routeS||0,g.routeDir||1,move);g.routeS=q.s;g.routeDir=q.dir;g.heading=q.heading;
          const off=_trafficSideOffset(q.pos,q.heading,g.laneOffsetNm||0);g.position=_trafficWaterPoint(this,off,q.pos);
        }else this.updateMaterializedTrafficGroup(g,path);
      }
      // Let only the nearest few ambient groups enter full simulation.
      const ranked=groups.map(g=>({g,d:distNm(sub.position,g.position)})).sort((a,b)=>a.d-b.d);
      let tactical=groups.filter(g=>g.state==='TACTICAL').length;
      for(const x of ranked){
        if(x.g.state==='ABSTRACT'&&x.d<=T.activateRadiusNm&&tactical<T.maxTacticalGroups){
          this.materializeTrafficGroup(x.g);tactical++;
        }
      }
      for(const x of ranked){
        if(x.g.state!=='TACTICAL'||x.d<=T.deactivateRadiusNm)continue;
        const before=x.g.state;this.dematerializeTrafficGroup(x.g);if(before==='TACTICAL'&&x.g.state==='ABSTRACT')tactical--;
      }
      T.lastTickAt=s.time.elapsedSeconds||0;T.tacticalGroups=tactical;T.abstractGroups=groups.length-tactical;
    },

    trafficIntelCandidates(){
      const s=this.state,W=s.world,T=this.ensureTrafficDirector(),out=[];
      const main=W.contacts.filter(c=>c.convoyId==='MAIN'&&!isSurfaceCombatant(c)&&!c.sunk),pg=T?.primaryGroup;
      if(main.length){const lead=main.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0],route=(W.convoyRoutes||[])[0],path=route&&this.resolveWaterRoute(route),pr=path?.length?routeProject(path,lead.position):null;
        out.push({id:'MAIN',label:'convoy',kind:'CONVOY',count:main.length,side:'ENEMY',missionCritical:true,position:{xNm:main.reduce((a,c)=>a+c.position.xNm,0)/main.length,yNm:main.reduce((a,c)=>a+c.position.yNm,0)/main.length},
          heading:lead.heading,speedKnots:lead.speedKnots,routeS:pr?.s??null,routeDir:1});}
      else if(pg&&!pg.destroyed&&pg.state==='ABSTRACT')out.push({id:'MAIN',label:'convoy',kind:'CONVOY',count:(pg.savedMembers||[]).filter(c=>!isSurfaceCombatant(c)&&!c.sunk).length,side:'ENEMY',missionCritical:true,
        position:{...pg.position},heading:pg.heading,speedKnots:pg.speedKnots,routeS:pg.routeS,routeDir:1});
      if(T?.enabled)for(const g of T.groups||[]){
        if(g.side!=='ENEMY')continue;
        const live=g.state==='TACTICAL'?(W.contacts||[]).filter(c=>c.trafficGroupId===g.id&&!c.sunk):null;
        if(live&&live.length===0)continue;
        const pos=live?.length?{xNm:live.reduce((a,c)=>a+c.position.xNm,0)/live.length,yNm:live.reduce((a,c)=>a+c.position.yNm,0)/live.length}:{...g.position};
        const lead=live?.[0];out.push({id:g.id,label:g.label,kind:g.kind,count:live?.length||_trafficManifest(g,s).length,side:g.side,missionCritical:false,
          position:pos,heading:lead?.heading??g.heading,speedKnots:lead?.speedKnots??g.speedKnots,routeS:g.routeS,routeDir:g.routeDir});
      }
      return out;
    }
  });
})();
