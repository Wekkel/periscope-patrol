// ═══════════════════════════════════════════════════ VESSEL COLLISION MODEL
class SimEngineCollision extends SimEngineASW {
  ensureCollisionState(){
    const W=this.state.world;
    W.collisionEvents=W.collisionEvents||[];
    W._collisionCooldowns=W._collisionCooldowns||{};
  }

  captureCollisionFrame(){
    this.ensureCollisionState();
    const sub=this.state.playerSub;
    sub._collisionPrev={position:{...sub.position},heading:sub.heading,depthFeet:sub.depthFeet};
    for(const c of this.state.world.contacts||[]) if(!c.sunk)
      c._collisionPrev={position:{...c.position},heading:c.heading};
  }

  surfaceAvoidance(){
    const ships=(this.state.world.contacts||[]).filter(c=>!c.sunk&&c.type!=='RAFT');
    // Remove only an avoidance order that is still exactly the one we wrote on
    // the previous step. If convoy/ASW logic changed the desired heading in the
    // meantime, that newer tactical/navigation order is the new base instead.
    for(const c of ships){
      if(c._collisionAvoidAppliedHeading!==undefined&&Math.abs(shortDelta(c._collisionAvoidAppliedHeading,c.desiredHeading??c.heading))<0.01)
        c.desiredHeading=c._collisionAvoidBaseHeading;
      delete c._collisionAvoidAppliedHeading;delete c._collisionAvoidBaseHeading;
    }
    const corrections=new Map();
    const addCorrection=(c,delta)=>{
      const old=corrections.get(c);
      if(old===undefined||Math.abs(delta)>Math.abs(old))corrections.set(c,delta);
    };
    for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){
      const a=ships[i],b=ships[j];
      if(a.stationary&&b.stationary)continue;
      const ca=HullGeometry.closestApproach(a,b,75,shipHull(a),shipHull(b));
      // Give normal convoy station-keeping plenty of room. Avoidance is only a
      // short-horizon navigation safety layer, not convoy tactics.
      if(ca.rawTimeSec<4||ca.rawTimeSec>75||ca.clearanceNm>0.065)continue;
      const urgency=clamp((0.065-ca.clearanceNm)/0.065,0,1)*clamp((75-ca.rawTimeSec)/45,0.25,1);
      const turn=7+urgency*16;
      if(!a.stationary)addCorrection(a,turn);
      if(!b.stationary)addCorrection(b,turn); // normal COLREG-like bias: both ease starboard
    }

    /* The bathymetry grid is intentionally coarse, while the visible coastline
       is a much finer polygon. Formation offsets in narrow home waters can put
       an escort on a chord that is 'water' to the grid yet clips a small island.
       Look a short physical distance ahead and borrow this same temporary
       avoidance layer to steer around exact land. This is navigation only: it
       never changes tactical AI state, and bounding-box cached polygon tests
       keep it cheap enough for the Helios G88. A hard post-move guard remains
       in updateWorld() as the final guarantee against tunnelling. */
    const waterProbe=(c,heading,dNm)=>{
      const r=degToRad(heading),p={xNm:c.position.xNm+Math.sin(r)*dNm,yNm:c.position.yNm-Math.cos(r)*dNm};
      const mid={xNm:(c.position.xNm+p.xNm)/2,yNm:(c.position.yNm+p.yNm)/2};
      if(this.checkTerrainCollision?.({position:p})?.collision||this.checkTerrainCollision?.({position:mid})?.collision)return false;
      return Bathy.feet(p.xNm,p.yNm)>=24&&Bathy.feet(mid.xNm,mid.yNm)>=24;
    };
    for(const c of ships){
      if(c.stationary||(c.speedKnots||0)<.6)continue;
      const base=c.desiredHeading===undefined?c.heading:c.desiredHeading;
      const look=clamp(knotsNmSec(Math.max(4,c.speedKnots))*90,.16,.62);
      if(waterProbe(c,base,look))continue;
      let turn=null;
      for(const d of [28,-28,48,-48,72,-72,105,-105,145,-145]){
        if(waterProbe(c,normDeg(base+d),look*1.05)){turn=d;break;}
      }
      if(turn!==null)addCorrection(c,turn);
      else c.desiredSpeed=Math.min(c.desiredSpeed??c.speedKnots,Math.max(1.5,(c.speedKnots||0)*.45));
    }

    for(const [c,delta] of corrections){
      const base=c.desiredHeading===undefined?c.heading:c.desiredHeading;
      c._collisionAvoidBaseHeading=base;
      c._collisionAvoidAppliedHeading=normDeg(base+clamp(delta,-145,145));
      c.desiredHeading=c._collisionAvoidAppliedHeading;
    }
  }

  collisionRiskAhead(horizonSec=90){
    const sub=this.state.playerSub;
    if(sub.mode==='SUNK')return null;
    let best=null;
    for(const c of this.state.world.contacts||[]){
      if(c.sunk||c.type==='RAFT'||c.stationary&&c.harborTarget&&distNm(sub.position,c.position)>horizonSec*Math.max(0.001,knotsNmSec(sub.propulsion.speedKnots)))continue;
      const sh=subHull(sub),ch=shipHull(c);
      if(!HullGeometry.verticalOverlap(sh,ch))continue;
      const ca=HullGeometry.closestApproach(sub,c,horizonSec,sh,ch);
      if(ca.rawTimeSec<=0.25||ca.rawTimeSec>horizonSec||ca.clearanceNm>0.055)continue;
      if(!best||ca.rawTimeSec<best.rawTimeSec)best={contact:c,...ca,timeSec:ca.rawTimeSec};
    }
    return best;
  }

  collisionRiskText(risk){
    return `COLLISION RISK · CPA ${Math.max(0,risk.centerNm).toFixed(2)} NM · ${risk.contact.id} in ${Math.max(1,Math.round(risk.timeSec))} s`;
  }

  compressedCollisionWatch(){
    const t=this.state.time;
    if(t.transitUntil||(t.timeScale||1)<=1)return false;
    const risk=this.collisionRiskAhead(90);if(!risk)return false;
    const now=t.elapsedSeconds;
    if(now-(this._collisionWatchAt||-99)<8)return false;
    this._collisionWatchAt=now;
    const text=this.collisionRiskText(risk);
    t.timeScale=1;t.stopReason=text;t.stopReasonAt=now;
    this.notify(`TIME COMPRESSION STOPPED — ${text}. Take the conn.`,'bad');
    return true;
  }

  vesselMotionVelocity(prev,now,dt){
    const d=Math.max(dt,1e-6);
    return{x:(now.xNm-prev.xNm)/d,y:(now.yNm-prev.yNm)/d};
  }

  collisionImpact(sub,ship,hit,dt){
    const sp=sub._collisionPrev?.position||sub.position,cp=ship._collisionPrev?.position||ship.position;
    const sv=this.vesselMotionVelocity(sp,sub.position,dt),cv=this.vesselMotionVelocity(cp,ship.position,dt);
    const rv={x:cv.x-sv.x,y:cv.y-sv.y};
    const relKn=Math.hypot(rv.x,rv.y)*3600;
    const normalKn=Math.abs(rv.x*hit.normal.x+rv.y*hit.normal.y)*3600;
    const angleDeg=relKn>0.01?radToDeg(Math.asin(clamp(normalKn/relKn,0,1))):0;
    const mass=HullGeometry.massTons(ship);
    const damage=clamp(0.35+0.65*Math.pow(Math.max(0,normalKn),1.55)*Math.sqrt(mass/2424),0.35,95);
    return{relativeSpeedKnots:relKn,normalSpeedKnots:normalKn,impactAngleDeg:angleDeg,massTons:mass,damage};
  }

  resolveSubShipCollision(sub,c,hit,dt){
    const now=this.state.time.elapsedSeconds,key=`OWN_SUB|${c.id}`,last=this.state.world._collisionCooldowns[key]??-999;
    if(now-last<12)return null;
    this.state.world._collisionCooldowns[key]=now;
    const impact=this.collisionImpact(sub,c,hit,dt);
    const sp=sub._collisionPrev.position,cp=c._collisionPrev.position,t=Math.max(0,hit.t-0.002);
    sub.position={xNm:lerp(sp.xNm,sub.position.xNm,t)-hit.normal.x*0.00025,
                  yNm:lerp(sp.yNm,sub.position.yNm,t)-hit.normal.y*0.00025};
    c.position={xNm:lerp(cp.xNm,c.position.xNm,t)+hit.normal.x*0.00025,
                yNm:lerp(cp.yNm,c.position.yNm,t)+hit.normal.y*0.00025};
    sub.propulsion.speedKnots*=0.35;sub.propulsion.actualRpm*=0.55;
    c.speedKnots*=0.58;c.desiredSpeed=Math.min(c.desiredSpeed??c.speedKnots,c.speedKnots);
    this.applyShock(impact.damage);
    sub.stealth.acousticSignature=clamp(sub.stealth.acousticSignature+0.75,0,1.5);
    this.alertEscorts('COLLISION',{...sub.position},0.92);
    const ram=isSurfaceCombatant(c)&&this.state.world.enemy.alertState==='ATTACKING';
    const msg=`${ram?'RAMMING COLLISION':'COLLISION'} — ${c.name}: ${impact.relativeSpeedKnots.toFixed(1)} kn relative, ${impact.impactAngleDeg.toFixed(0)}° impact, ${impact.damage.toFixed(0)}% hull damage.`;
    this.notify(msg,'bad');audio.playHit?.();this.shake(clamp(impact.damage/5,1,8));
    const ev={t:now,a:'OWN_SUB',b:c.id,kind:ram?'RAM':'COLLISION',...impact,position:{...sub.position}};
    this.state.world.lastCollision=ev;this.state.world.collisionEvents.push(ev);
    if(this.state.world.collisionEvents.length>40)this.state.world.collisionEvents.shift();
    return ev;
  }

  resolveShipShipCollision(a,b,hit,dt){
    const now=this.state.time.elapsedSeconds,key=[a.id,b.id].sort().join('|'),last=this.state.world._collisionCooldowns[key]??-999;
    if(now-last<15)return null;
    this.state.world._collisionCooldowns[key]=now;
    const ap=a._collisionPrev.position,bp=b._collisionPrev.position,t=Math.max(0,hit.t-0.002);
    const av=this.vesselMotionVelocity(ap,a.position,dt),bv=this.vesselMotionVelocity(bp,b.position,dt);
    const rv={x:bv.x-av.x,y:bv.y-av.y},relKn=Math.hypot(rv.x,rv.y)*3600;
    const normalKn=Math.abs(rv.x*hit.normal.x+rv.y*hit.normal.y)*3600;
    a.position={xNm:lerp(ap.xNm,a.position.xNm,t)-hit.normal.x*0.0003,yNm:lerp(ap.yNm,a.position.yNm,t)-hit.normal.y*0.0003};
    b.position={xNm:lerp(bp.xNm,b.position.xNm,t)+hit.normal.x*0.0003,yNm:lerp(bp.yNm,b.position.yNm,t)+hit.normal.y*0.0003};
    for(const c of [a,b]){c.speedKnots*=0.5;c.desiredSpeed=Math.min(c.desiredSpeed??c.speedKnots,c.speedKnots);c.desiredHeading=normDeg((c.heading||0)+16);}
    const ev={t:now,a:a.id,b:b.id,kind:'SHIP_COLLISION',relativeSpeedKnots:relKn,normalSpeedKnots:normalKn,position:{xNm:(a.position.xNm+b.position.xNm)/2,yNm:(a.position.yNm+b.position.yNm)/2}};
    this.state.world.lastCollision=ev;this.state.world.collisionEvents.push(ev);
    if(this.state.world.collisionEvents.length>40)this.state.world.collisionEvents.shift();
    this.log(`NAVIGATION COLLISION — ${a.name} and ${b.name} made contact at ${relKn.toFixed(1)} kn relative.`,'warn');
    return ev;
  }

  updateVesselCollisions(dt){
    this.ensureCollisionState();
    const sub=this.state.playerSub,W=this.state.world;
    if(sub._collisionPrev&&sub.mode!=='SUNK')for(const c of W.contacts||[]){
      if(c.sunk||c.type==='RAFT'||!c._collisionPrev)continue;
      const sh0=subHull(sub,sub._collisionPrev.position,sub._collisionPrev.heading),sh1=subHull(sub,sub.position,sub.heading);
      const ch0=shipHull(c,c._collisionPrev.position,c._collisionPrev.heading),ch1=shipHull(c,c.position,c.heading);
      // A deep boat is physically below the surface ship's draft. Use the
      // shallowest depth reached during this step so a diving boat cannot phase
      // through a hull during the transition.
      const shallowDepth=Math.min(sub._collisionPrev.depthFeet??sub.depthFeet,sub.depthFeet);
      const proxy={...sub,depthFeet:shallowDepth};sh1.source=proxy;
      if(!HullGeometry.verticalOverlap(sh1,ch1))continue;
      const hit=movingHullIntersection(sh0,sh1,ch0,ch1);
      if(hit)this.resolveSubShipCollision(sub,c,hit,dt);
    }

    const ships=(W.contacts||[]).filter(c=>!c.sunk&&c.type!=='RAFT'&&c._collisionPrev);
    for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){
      const a=ships[i],b=ships[j];if(a.stationary&&b.stationary)continue;
      const hit=movingHullIntersection(shipHull(a,a._collisionPrev.position,a._collisionPrev.heading),shipHull(a),
        shipHull(b,b._collisionPrev.position,b._collisionPrev.heading),shipHull(b));
      if(hit)this.resolveShipShipCollision(a,b,hit,dt);
    }
  }
}
