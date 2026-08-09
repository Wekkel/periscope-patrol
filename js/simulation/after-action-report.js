// ═══════════════════════════════════════════════════ PATCH 8 — AFTER ACTION REPORT
// A compact patrol recorder. It stores low-frequency, grouped samples only;
// there is no replay simulation and no render loop during the patrol.
const AAR_VERSION=1;
const AAR_ROUTE_SAMPLE_SEC=15;
const AAR_TRACK_SAMPLE_SEC=30;
const AAR_MAX_ROUTE=900;
const AAR_MAX_POINTS_PER_TRACK=480; // four hours at 30-second sampling
const AAR_MAX_EVENTS=500;
function _aarClone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function _aarPush(a,v,max){a.push(v);if(a.length>max)a.splice(0,a.length-max);}
function _aarTimelinePush(a,v,max){a.push(v);if(a.length>max){const q=a.filter((_,i)=>i%2===0||i===a.length-1);a.splice(0,a.length,...q);}}
function _aarPos(p){return p&&Number.isFinite(p.xNm)&&Number.isFinite(p.yNm)?{xNm:+p.xNm,yNm:+p.yNm}:null;}
function _aarSourceCode(src){src=String(src||'').toUpperCase();return src==='VISUAL'?1:src.includes('SJ')||src.includes('RADAR')?2:src.includes('QC')||src.includes('ECHO')?3:src.includes('TRIANG')?4:src.includes('SOUND')||src.includes('HYDRO')?5:0;}

(function installAfterActionRecorder(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureAfterActionReport(reset=false){
      const c=this.state.campaign;
      if(reset||!c.afterAction||c.afterAction.version!==AAR_VERSION){
        c.afterAction={version:AAR_VERSION,route:[],observedById:{},truthById:{},events:[],torpedoes:[],aircraftEvaded:0,
          _routeClock:999,_trackClock:999,_airStates:{},_seenTrackIds:{},_trukPenetrationLogged:false};
      }
      return c.afterAction;
    },

    aarRecordEvent(type,text,data={},position=null,targetPosition=null){
      const A=this.ensureAfterActionReport(),s=this.state,t=s.time.elapsedSeconds||0;
      const p=_aarPos(position)||_aarPos(s.playerSub?.position),tp=_aarPos(targetPosition);
      const ev={t,type:String(type||'EVENT'),text:String(text||type||'Event'),position:p,targetPosition:tp,data:_aarClone(data||{})};
      const k=data?.aarKey||data?.key;if(k&&A.events.some(x=>x.key===k))return null;if(k)ev.key=k;
      _aarPush(A.events,ev,AAR_MAX_EVENTS);return ev;
    },

    aarTorpedoLaunch(t){
      if(!t)return;const A=this.ensureAfterActionReport(),now=this.state.time.elapsedSeconds||0;
      if(A.torpedoes.some(x=>x.id===t.id))return;
      A.torpedoes.push({id:t.id,launchT:now,start:_aarPos(t.position),launchHeading:t.heading,courseSet:t.courseSet,
        targetId:t.targetId||null,endT:null,end:null,status:'RUNNING',contactId:null});
      if(A.torpedoes.length>80)A.torpedoes.shift();
      this.aarRecordEvent('TORPEDO_ATTACK',`${t.id} fired.`,{torpedoId:t.id,targetId:t.targetId||null},t.position);
    },

    aarTorpedoFinish(t,status,contactId=null){
      if(!t)return;const A=this.ensureAfterActionReport(),r=A.torpedoes.find(x=>x.id===t.id);if(!r)return;
      r.endT=this.state.time.elapsedSeconds||0;r.end=_aarPos(t.position);r.status=status||t.status||'ENDED';r.contactId=contactId||null;
    },

    updateAfterActionRecorder(dt){
      const s=this.state,c=s.campaign;if(c.missionStatus==='TRAINING')return;const A=this.ensureAfterActionReport(),now=s.time.elapsedSeconds||0,sub=s.playerSub,W=s.world;
      A._routeClock=(A._routeClock||0)+dt;A._trackClock=(A._trackClock||0)+dt;
      if(A._routeClock>=AAR_ROUTE_SAMPLE_SEC||A.route.length===0){
        A._routeClock=0;_aarTimelinePush(A.route,[Math.round(now),+sub.position.xNm.toFixed(4),+sub.position.yNm.toFixed(4),+sub.depthFeet.toFixed(1),+sub.heading.toFixed(1),+sub.propulsion.speedKnots.toFixed(1)],AAR_MAX_ROUTE);
      }
      if(A._trackClock>=AAR_TRACK_SAMPLE_SEC){
        A._trackClock=0;
        for(const tr of Object.values(W.contactTracks||{})){
          if(!tr||tr.confidence<.12)continue;const p=tr.plotPosition||tr.lastFixPosition;if(!p)continue;
          let g=A.observedById[tr.id];if(!g)g=A.observedById[tr.id]={id:tr.id,type:tr.typeEstimate||'UNKNOWN',affiliation:tr.affiliation||null,points:[]};
          g.type=tr.typeEstimate||g.type;g.affiliation=tr.affiliation||g.affiliation;
          _aarTimelinePush(g.points,[Math.round(now),+p.xNm.toFixed(4),+p.yNm.toFixed(4),+(tr.courseEstimate||0).toFixed(1),+(tr.speedEstimateKnots||0).toFixed(1),
            +tr.confidence.toFixed(2),+(tr.positionConfidence??tr.confidence).toFixed(2),_aarSourceCode(tr.source||tr.lastSensorSource),tr.visualHullConfirmed?1:0],AAR_MAX_POINTS_PER_TRACK);
          if(!A._seenTrackIds[tr.id]){A._seenTrackIds[tr.id]=true;this.aarRecordEvent('FIRST_SIGHTING',`First contact — ${tr.typeEstimate||tr.id}.`,{contactId:tr.id,source:tr.source||tr.lastSensorSource||'UNKNOWN'},p);}
        }
        for(const x of W.contacts||[]){
          if(!x||!x.position)continue;const known=!!W.contactTracks?.[x.id],near=distNm(sub.position,x.position)<=38,important=x.convoyId==='MAIN'||x.harborTarget;
          if(!known&&!near&&!important)continue;
          let g=A.truthById[x.id];if(!g)g=A.truthById[x.id]={id:x.id,type:x.displayType||x.type||'SHIP',side:x.side||'ENEMY',convoyId:x.convoyId||null,trafficGroupId:x.trafficGroupId||null,points:[]};
          _aarTimelinePush(g.points,[Math.round(now),+x.position.xNm.toFixed(4),+x.position.yNm.toFixed(4),+(x.heading||0).toFixed(1),+(x.speedKnots||0).toFixed(1),x.sunk?1:0],AAR_MAX_POINTS_PER_TRACK);
        }
      }
      const live={};for(const a of W.aircraft||[]){
        live[a.id]=true;const st=A._airStates[a.id]||(A._airStates[a.id]={attacked:false,seen:false,lastState:a.state,pos:_aarPos(a.position)});
        st.pos=_aarPos(a.position);st.seen=st.seen||!!a.seenBySub;
        if(!st.attacked&&(a.state==='ATTACKING'||a.state==='STRAFING')){st.attacked=true;this.aarRecordEvent('AIRCRAFT_ATTACK',`${a.name||'Aircraft'} attacking.`,{aircraftId:a.id,name:a.name||'Aircraft'},a.position);}
        st.lastState=a.state;st.shotDown=!!a.shotDown;
      }
      for(const [id,st] of Object.entries(A._airStates)){if(live[id]||st.finished)continue;st.finished=true;if(st.attacked&&!st.shotDown){A.aircraftEvaded++;this.aarRecordEvent('AIRCRAFT_EVADED','Aircraft attack evaded.',{aircraftId:id},st.pos);}}
      const I=W.harborIntel;if(I?.raid?.attempted&&!A._trukPenetrationLogged){A._trukPenetrationLogged=true;this.aarRecordEvent('TRUK_PENETRATION','Entered the Truk anchorage defenses.',{},sub.position);}
    },

    buildAfterActionReplay(){
      const A=this.ensureAfterActionReport();return{version:AAR_VERSION,route:_aarClone(A.route),observedTracks:_aarClone(Object.values(A.observedById||{})),truthTracks:_aarClone(Object.values(A.truthById||{})),
        events:_aarClone(A.events),torpedoes:_aarClone(A.torpedoes),aircraftEvaded:Number(A.aircraftEvaded)||0};
    }
  });
})();
