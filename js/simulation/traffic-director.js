// ═══════════════════════════════════════════════════ PATCH 7 — PACIFIC TRAFFIC DIRECTOR
// The ocean is populated without simulating every hull at full fidelity all
// patrol long. Distant traffic is a tiny abstract route track. Only groups
// inside the tactical bubble are expanded into normal world contacts, where
// all existing physics, sensing, collision and ship-damage systems take over.
const TRAFFIC_DIRECTOR_VERSION=1;
const TRAFFIC_TICK_SEC=10;
const TRAFFIC_ACTIVATE_NM=23;
const TRAFFIC_DEACTIVATE_NM=34;
const TRAFFIC_MAX_TACTICAL_GROUPS=3;
const TRAFFIC_OBSERVED_TACTICAL_HOLD_SEC=180;

const TRAFFIC_KIND_LABELS={
  LONE_FREIGHTER:'lone freighter',
  COASTAL_MERCHANT:'coastal merchant traffic',
  SMALL_TANKER:'small tanker',
  FISHING_CRAFT:'local fishing craft',
  PATROL_CRAFT:'patrol craft',
  SMALL_CONVOY:'small convoy',
  TASK_GROUP:'naval task group',
  FRIENDLY_TRAFFIC:'friendly coastal traffic'
};

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
function _trafficManifest(group){
  const H=(tag)=>_trafficHash(group.seed,tag), enemy='ENEMY';
  const mk=(suffix,name,type,displayType,lengthYards,tonsFactor,side=enemy,extra={})=>({
    suffix,name,type,displayType,lengthYards,tonsFactor,side,
    visualProfile:extra.visualProfile??(type==='TANKER'?1.0:type==='WARSHIP'?.72:type==='PATROL_CRAFT'?.52:type==='JUNK'?.28:.82),
    acousticBase:extra.acousticBase??(type==='TANKER'?.38:type==='WARSHIP'?.62:type==='PATROL_CRAFT'?.46:type==='JUNK'?.10:.28),
    speedBias:extra.speedBias||0
  });
  switch(group.kind){
    case'LONE_FREIGHTER':return[mk('A','Lone Freighter','MERCHANT','FREIGHTER',330+Math.round(H('len')*80),3000+Math.round(H('tons')*1700))];
    case'COASTAL_MERCHANT':return[mk('A','Coastal Maru','MERCHANT','COASTAL FREIGHTER',230+Math.round(H('len')*70),1700+Math.round(H('tons')*1200))];
    case'SMALL_TANKER':return[mk('A','Small Tanker','TANKER','SMALL TANKER',330+Math.round(H('len')*60),4300+Math.round(H('tons')*1700))];
    case'FISHING_CRAFT':return[mk('A','Fishing Sampan','JUNK','FISHING SAMPAN',45+Math.round(H('len')*30),70+Math.round(H('tons')*80),'NEUTRAL',{visualProfile:.24,acousticBase:.07})];
    case'PATROL_CRAFT':return[mk('A','Patrol Craft','PATROL_CRAFT','PATROL CRAFT',120+Math.round(H('len')*45),420+Math.round(H('tons')*350),enemy,{visualProfile:.50,acousticBase:.48})];
    case'SMALL_CONVOY':{
      const n=2+(H('count')>.55?1:0),out=[];
      for(let i=0;i<n;i++)out.push(i===1&&H('tanker')>.56
        ?mk(String.fromCharCode(65+i),'Coastal Tanker','TANKER','TANKER',350,5000,enemy,{speedBias:-.3})
        :mk(String.fromCharCode(65+i),`Merchant ${i+1}`,'MERCHANT','FREIGHTER',300+Math.round(H('m'+i)*110),2500+Math.round(H('t'+i)*2300)));
      if(H('guard')>.68)out.push(mk('P','Convoy Patrol Craft','PATROL_CRAFT','PATROL CRAFT',135,550,enemy,{speedBias:3}));
      return out;
    }
    case'TASK_GROUP':return[
      mk('A','Task Group Destroyer','WARSHIP','DESTROYER',335,1900,enemy,{visualProfile:.72,acousticBase:.68,speedBias:4}),
      mk('B','Task Group Escort','WARSHIP','ESCORT VESSEL',285,1250,enemy,{visualProfile:.65,acousticBase:.60,speedBias:3}),
      ...(H('transport')>.5?[mk('C','Fast Transport','MERCHANT','FAST TRANSPORT',360,3600,enemy,{speedBias:1})]:[])
    ];
    case'FRIENDLY_TRAFFIC':return[mk('A','Allied Coastal Transport','MERCHANT','ALLIED COASTAL TRANSPORT',280,2200,'FRIENDLY',{visualProfile:.75,acousticBase:.24})];
    default:return[];
  }
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
      const path=this.ensureWaterRoute(route);if(!path||path.length<2)return T;
      const C=routeCum(path),L=C[C.length-1];if(L<10)return T;
      const area=s.campaign.patrolArea||'Patrol Area',seed=s.campaign.scenarioSeed||1,hp=s.campaign.historicalProfile||null;
      const baseDensity={'Java Sea':10,'Luzon Strait':11,'Truk Approaches':9,'Solomon Sea':9,'Bismarck Sea':8}[area]||8;
      const density=clamp(Math.round(baseDensity*(hp?.trafficDensityFactor||1)),6,12);
      const base=['LONE_FREIGHTER','COASTAL_MERCHANT','SMALL_TANKER','FISHING_CRAFT','PATROL_CRAFT','SMALL_CONVOY'];
      const kinds=[];for(let i=0;i<density;i++)kinds.push(i<base.length?base[i]:base[Math.floor(_trafficHash(seed,`kind:${i}`)*base.length)%base.length]);
      if(_trafficHash(seed,`${area}:task-group`)<.32)kinds[Math.max(0,kinds.length-2)]='TASK_GROUP';
      if(area!=='Truk Approaches'&&_trafficHash(seed,`${area}:friendly`)<.24)kinds[kinds.length-1]='FRIENDLY_TRAFFIC';
      T.groups=kinds.map((kind,i)=>{
        const h=_trafficHash(seed,`${area}:traffic:${i}`),dir=_trafficHash(seed,`dir:${i}`)<.5?-1:1;
        const s0=((i+.22+h*.56)/kinds.length)*L;
        const speedBase={LONE_FREIGHTER:8,COASTAL_MERCHANT:6.5,SMALL_TANKER:8,FISHING_CRAFT:4.5,PATROL_CRAFT:14,SMALL_CONVOY:8,TASK_GROUP:17,FRIENDLY_TRAFFIC:8}[kind]||8;
        const laneBase=kind==='FISHING_CRAFT'?2.2:kind==='COASTAL_MERCHANT'?1.25:kind==='PATROL_CRAFT'?-1.0:kind==='FRIENDLY_TRAFFIC'?-1.5:0;
        const q=routeAdvance(path,s0,dir,0),side=(laneBase?laneBase*(h<.5?-1:1):(_trafficHash(seed,`lane:${i}`)-.5)*1.2);
        const p=_trafficWaterPoint(this,_trafficSideOffset(q.pos,q.heading,side),q.pos);
        const id=`T${String(i+1).padStart(2,'0')}`,merchantKind=['LONE_FREIGHTER','COASTAL_MERCHANT','SMALL_TANKER','SMALL_CONVOY'].includes(kind),histSpeed=merchantKind?(hp?.merchantSpeedBonus||0):0;
        return{id,seed:Math.floor((seed*9973+i*7919+17)%2147483647),kind,label:TRAFFIC_KIND_LABELS[kind]||kind,side:kind==='FISHING_CRAFT'?'NEUTRAL':kind==='FRIENDLY_TRAFFIC'?'FRIENDLY':'ENEMY',
          state:'ABSTRACT',routeS:q.s,routeDir:q.dir,laneOffsetNm:side,position:p,heading:q.heading,speedKnots:clamp(speedBase+histSpeed+(h-.5)*2.0,3,22),
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
      const route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route),pr=path?.length?routeProject(path,center):null,lead=use.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
      T.primaryGroup={id:'MAIN',label:'convoy',kind:'CONVOY',side:'ENEMY',missionCritical:true,state:'TACTICAL',position:center,heading:lead?.heading||0,
        speedKnots:lead?.baseSpeed||lead?.speedKnots||8,routeS:pr?.s??0,routeDir:W.convoyLeg||1,memberIds:ships.map(c=>c.id),savedMembers:null,abstractedAt:null,materializedAt:s.time.elapsedSeconds||0,destroyed:false};
      return T.primaryGroup;
    },

    primaryConvoyExists(){
      const W=this.state.world,g=W.traffic?.primaryGroup;if(!g||g.destroyed)return false;
      if(g.state==='TACTICAL')return (W.contacts||[]).some(c=>c.convoyId==='MAIN'&&c.type!=='ESCORT'&&!c.sunk);
      if(g.state==='ABSTRACT')return (g.savedMembers||[]).some(c=>c.type!=='ESCORT'&&!c.sunk);
      return false;
    },

    syncPrimaryConvoy(g){
      const W=this.state.world,ships=(W.contacts||[]).filter(c=>c.convoyId==='MAIN'),alive=ships.filter(c=>!c.sunk);if(!ships.length)return;
      if(!alive.length){g.destroyed=true;g.state='TACTICAL';return;}
      const center={xNm:alive.reduce((a,c)=>a+c.position.xNm,0)/alive.length,yNm:alive.reduce((a,c)=>a+c.position.yNm,0)/alive.length},route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route),pr=path?.length?routeProject(path,center):null,lead=alive.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0];
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
      const q=routeAdvance(path,g.routeS||0,g.routeDir||1,0),off=_trafficSideOffset(q.pos,q.heading,0),r=degToRad(q.heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r),ids=[];
      for(const saved of g.savedMembers){const c=JSON.parse(JSON.stringify(saved)),f=c._trafficPrimaryFwd||0,side=c._trafficPrimarySide||0;delete c._trafficPrimaryFwd;delete c._trafficPrimarySide;c.position={xNm:off.xNm+fx*f+sx*side,yNm:off.yNm+fy*f+sy*side};c.heading=q.heading;c.desiredHeading=q.heading;c.speedKnots=clamp(c.speedKnots||c.baseSpeed||g.speedKnots,0,30);c.desiredSpeed=c.baseSpeed||c.speedKnots;W.contacts.push(c);if(W.contactTracks[c.id])W.contactTracks[c.id].worldContactAbstract=false;ids.push(c.id);}
      g.memberIds=ids;g.state='TACTICAL';g.position={...off};g.heading=q.heading;g.routeDir=q.dir;g.materializedAt=s.time.elapsedSeconds||0;W.convoyLeg=q.dir;this.assignASWRoles?.(null,true);return true;
    },

    updatePrimaryTraffic(g,path,step){
      if(!g||g.destroyed)return;const s=this.state,W=s.world,sub=s.playerSub;
      if(g.state==='TACTICAL'){
        this.syncPrimaryConvoy(g);if(g.destroyed)return;
        const d=distNm(sub.position,g.position);if(d>38)this.abstractPrimaryConvoy(g);
      }else if(g.state==='ABSTRACT'){
        const q=routeAdvance(path,g.routeS||0,g.routeDir||1,knotsNmSec(g.speedKnots||8)*step);g.routeS=q.s;g.routeDir=q.dir;g.heading=q.heading;g.position={...q.pos};
        if(distNm(sub.position,g.position)<=28)this.materializePrimaryConvoy(g,path);
      }
    },

    materializeTrafficGroup(g){
      const s=this.state,W=s.world,T=W.traffic;if(!g||g.state==='TACTICAL')return g;
      const route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route);if(!path?.length)return g;
      const {q,pos}=this.trafficGroupPosition(g,path),defs=_trafficManifest(g);g.memberIds=[];
      for(let i=0;i<defs.length;i++){
        const d=defs[i],o=_trafficFormation(i),r=degToRad(q.heading),fx=Math.sin(r),fy=-Math.cos(r),sx=Math.cos(r),sy=Math.sin(r);
        const p0={xNm:pos.xNm+fx*o.fwd+sx*o.side,yNm:pos.yNm+fy*o.fwd+sy*o.side},p=_trafficWaterPoint(this,p0,pos);
        const hp=s.campaign.historicalProfile||null,isEnemyMerchant=d.side==='ENEMY'&&(d.type==='MERCHANT'||d.type==='TANKER'),scale=isEnemyMerchant?(hp?.merchantTonnageFactor||1):1;
        const id=`${g.id}-${d.suffix}`,contact={id,name:d.name,type:d.type,displayType:d.displayType,lengthYards:Math.round(d.lengthYards*(1+(scale-1)*.28)),tonsFactor:Math.round(d.tonsFactor*scale),
          visualProfile:d.visualProfile,acousticBase:d.acousticBase,side:d.side,position:p,heading:normDeg(q.heading+(_trafficHash(g.seed,`hdg:${i}`)-.5)*2),
          desiredHeading:q.heading,speedKnots:clamp(g.speedKnots+d.speedBias+(_trafficHash(g.seed,`spd:${i}`)-.5)*.35,2,26),
          baseSpeed:clamp(g.speedKnots+d.speedBias,2,26),desiredSpeed:clamp(g.speedKnots+d.speedBias,2,26),trafficAmbient:true,trafficGroupId:g.id,
          convoyId:`TRAFFIC-${g.id}`,convoyRole:'TRAFFIC',formationIndex:i,trafficFormationFwd:o.fwd,trafficFormationSide:o.side};
        W.contacts.push(contact);if(W.contactTracks[id])W.contactTracks[id].worldContactAbstract=false;g.memberIds.push(id);
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
      const route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route);if(path?.length>1){const pr=routeProject(path,center);g.routeS=pr.s;}
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
      const route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route);if(!path?.length)return;
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
      const main=W.contacts.filter(c=>c.convoyId==='MAIN'&&c.type!=='ESCORT'&&!c.sunk),pg=T?.primaryGroup;
      if(main.length){const lead=main.slice().sort((a,b)=>(a.formationIndex||0)-(b.formationIndex||0))[0],route=(W.convoyRoutes||[])[0],path=route&&this.ensureWaterRoute(route),pr=path?.length?routeProject(path,lead.position):null;
        out.push({id:'MAIN',label:'convoy',kind:'CONVOY',count:main.length,side:'ENEMY',missionCritical:true,position:{xNm:main.reduce((a,c)=>a+c.position.xNm,0)/main.length,yNm:main.reduce((a,c)=>a+c.position.yNm,0)/main.length},
          heading:lead.heading,speedKnots:lead.speedKnots,routeS:pr?.s??null,routeDir:W.convoyLeg||1});}
      else if(pg&&!pg.destroyed&&pg.state==='ABSTRACT')out.push({id:'MAIN',label:'convoy',kind:'CONVOY',count:(pg.savedMembers||[]).filter(c=>c.type!=='ESCORT'&&!c.sunk).length,side:'ENEMY',missionCritical:true,
        position:{...pg.position},heading:pg.heading,speedKnots:pg.speedKnots,routeS:pg.routeS,routeDir:pg.routeDir});
      if(T?.enabled)for(const g of T.groups||[]){
        if(g.side!=='ENEMY')continue;
        const live=g.state==='TACTICAL'?(W.contacts||[]).filter(c=>c.trafficGroupId===g.id&&!c.sunk):null;
        if(live&&live.length===0)continue;
        const pos=live?.length?{xNm:live.reduce((a,c)=>a+c.position.xNm,0)/live.length,yNm:live.reduce((a,c)=>a+c.position.yNm,0)/live.length}:{...g.position};
        const lead=live?.[0];out.push({id:g.id,label:g.label,kind:g.kind,count:live?.length||_trafficManifest(g).length,side:g.side,missionCritical:false,
          position:pos,heading:lead?.heading??g.heading,speedKnots:lead?.speedKnots??g.speedKnots,routeS:g.routeS,routeDir:g.routeDir});
      }
      return out;
    }
  });
})();
