// ═══════════════════════════════════════════════════ PATCH 10 — BATTLE ATMOSPHERE
// Effects are tactical information whenever possible.  This module stores only
// short-lived event records; renderers decide how much to draw for the current
// device quality.  No extra simulation loop is introduced.
const BATTLE_ATMOSPHERE_VERSION=1;
const BATTLE_MAX_TRACERS=28;
const BATTLE_MAX_SPLASHES=24;
const BATTLE_MAX_FLASHES=18;
const BATTLE_MAX_SIGNALS=8;

function battleAtmosphereFor(state){return state?.world?.atmosphere||null;}
function battleEventAlive(ev,now){return ev&&now<=(ev.until??ev.impactAt??ev.at??-1);}
function battlePredictPosition(p,heading,speedKnots,sec){
  const d=knotsNmSec(Math.max(0,speedKnots||0))*Math.max(0,sec||0),r=degToRad(heading||0);
  return{xNm:p.xNm+Math.sin(r)*d,yNm:p.yNm-Math.cos(r)*d};
}

(function installBattleAtmosphere(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureBattleAtmosphereState(reset=false){
      const W=this.state.world;
      if(reset||!W.atmosphere||W.atmosphere.version!==BATTLE_ATMOSPHERE_VERSION){
        W.atmosphere={version:BATTLE_ATMOSPHERE_VERSION,nextId:1,shells:[],tracers:[],splashes:[],muzzleFlashes:[],signals:[],
          lastSignalAt:-999,lastAmbientGunAt:-999};
      }
      const A=W.atmosphere;A.shells=A.shells||[];A.tracers=A.tracers||[];A.splashes=A.splashes||[];A.muzzleFlashes=A.muzzleFlashes||[];A.signals=A.signals||[];
      const H=W.harbor;
      if(H){
        H.searchlightWidthDeg=H.searchlightWidthDeg||12;
        if(!Array.isArray(H.batterySites)||!H.batterySites.length){
          const bearings=[318,18,108];H.batterySites=bearings.map((b,i)=>{const r=degToRad(b),rr=.72+i*.14;return{xNm:H.center.xNm+Math.sin(r)*rr,yNm:H.center.yNm-Math.cos(r)*rr};});
        }
      }
      return A;
    },

    startHarborSearchlightSweep(H){
      if(!H)return null;const now=this.state.time.elapsedSeconds,W=this.state.world,sub=this.state.playerSub;
      const datum=W.enemy?.searchCenter||sub.position,center=bearingBetween(H.center,datum),span=H.alert>=2?32:44;
      H.searchlightSweep={startedAt:now,duration:H.alert>=2?13:16,centerBearing:center,spanDeg:span,phase:Math.random()<.5?0:1};
      H.searchlightActiveUntil=now+H.searchlightSweep.duration;H.searchlightBearing=normDeg(center-span);
      H.searchlightContactUntil=Math.min(H.searchlightContactUntil||-1,now);
      return H.searchlightSweep;
    },

    updateHarborSearchlight(dt){
      const W=this.state.world,H=W.harbor,sub=this.state.playerSub;if(!H)return;
      const now=this.state.time.elapsedSeconds,sw=H.searchlightSweep;
      if(!sw||now>sw.startedAt+sw.duration)return;
      const u=clamp((now-sw.startedAt)/Math.max(.1,sw.duration),0,1);
      // One smooth sweep across the probable datum, then back.  The beam does
      // not know the submarine's true bearing until it actually crosses it.
      const tri=u<.5?u*2:2-u*2,dir=sw.phase?1:-1;
      H.searchlightBearing=normDeg(sw.centerBearing+dir*lerp(-sw.spanDeg,sw.spanDeg,tri));
      H.searchlightActiveUntil=sw.startedAt+sw.duration;
      if(sub.depthFeet>=12)return;
      const wx=weatherBetween(this.state,H.center,sub.position),rng=distNm(H.center,sub.position);
      if(rng>4.4*wx.searchlightFactor)return;
      const trueB=bearingBetween(H.center,sub.position),half=(H.searchlightWidthDeg||12)*.5;
      if(Math.abs(shortDelta(H.searchlightBearing,trueB))>half)return;
      const wasLit=now<(H.searchlightContactUntil||-1);
      H.searchlightContactUntil=now+1.25;H.suspicion=clamp(H.suspicion+dt*(H.alert>=2?16:10),0,100);
      W.enemy.searchCenter={...sub.position};W.enemy.lastKnownSubPosition={...sub.position};W.enemy.lastKnownConfidence=Math.max(W.enemy.lastKnownConfidence||0,.88);H.alert=2;
      if(!wasLit&&now-(H.lastSearchlightContactAt||-999)>45){
        H.lastSearchlightContactAt=now;
        const T=this.state.time;if((T.timeScale||1)>1||T.transitUntil){T.timeScale=1;T.transitUntil=0;T.transitOpen=false;T.stopReason='searchlight contact';T.stopReasonAt=now;}
        this.notify('SEARCHLIGHT CONTACT — the beam has you. Dive, turn hard or run out of it before the batteries correct.','bad');
        audio.event?.('SEARCHLIGHT_CONTACT');this.aarRecordEvent?.('SEARCHLIGHT_CONTACT','Caught in a harbour searchlight.',{},sub.position,H.center);
      }
    },

    scheduleCoastalBatteryShot(H,harborWx){
      const A=this.ensureBattleAtmosphereState(),s=this.state,sub=s.playerSub,now=s.time.elapsedSeconds;if(!H)return null;
      const sites=H.batterySites||[H.center],site=sites[(H._batterySiteCursor=(H._batterySiteCursor||0)+1)%sites.length],rng=distNm(site,sub.position);
      const flight=clamp(1.5+rng*1.25,2.0,8.5),lit=now<(H.searchlightContactUntil||-1),day=clamp(s.world.environment.daylight||0,0,1);
      const predicted=battlePredictPosition(sub.position,sub.heading,sub.propulsion.speedKnots,flight);
      let correction=clamp(H.batteryCorrection||1,.32,1.25);
      if(!lit)correction=Math.max(correction,.85);
      const baseErr=(lit?.012:.065)+(1-harborWx.searchlightFactor)*.08+harborWx.seaState*.025+(1-day)*.012;
      const err=baseErr*correction,ang=Math.random()*Math.PI*2,rad=err*(.25+Math.sqrt(Math.random())*.95);
      const impact={xNm:predicted.xNm+Math.cos(ang)*rad,yNm:predicted.yNm+Math.sin(ang)*rad};
      const id=`CB-${A.nextId++}`,ev={id,kind:'COASTAL',sourceId:'SHORE BATTERY',origin:{...site},targetAtFire:{...sub.position},impactPosition:impact,
        fireAt:now,impactAt:now+flight,damage:5+Math.random()*12,litAtFire:lit,resolved:false};
      A.shells.push(ev);if(A.shells.length>20)A.shells.shift();
      A.muzzleFlashes.push({id:`MF-${id}`,position:{...site},at:now,until:now+.34,power:1.0,kind:'COASTAL'});if(A.muzzleFlashes.length>BATTLE_MAX_FLASHES)A.muzzleFlashes.shift();
      const br=bearingBetween(sub.position,site);audio.playDistantGunfire?.(br,sub.heading,clamp(1-rng/7,.25,1));
      this.aarRecordEvent?.('COASTAL_GUNFIRE','Coastal battery opened fire.',{batteryShot:id,illuminated:lit},site,impact);
      return ev;
    },

    noteSurfaceGunfire(shooter,target,hit=false){
      if(!shooter?.position||!target?.position)return;const A=this.ensureBattleAtmosphereState(),now=this.state.time.elapsedSeconds;
      const id=`TR-${A.nextId++}`,dur=.42+distNm(shooter.position,target.position)*.10;
      A.muzzleFlashes.push({id:`MF-${id}`,position:{...shooter.position},at:now,until:now+.18,power:.72,kind:'SHIP'});
      A.tracers.push({id,start:{...shooter.position},end:{...target.position},at:now,until:now+dur,kind:'SURFACE_GUN',hit:!!hit});
      if(A.tracers.length>BATTLE_MAX_TRACERS)A.tracers.shift();if(A.muzzleFlashes.length>BATTLE_MAX_FLASHES)A.muzzleFlashes.shift();
      if(!hit){A.splashes.push({id:`SP-${id}`,position:{...target.position},at:now+dur*.86,until:now+dur*.86+3.0,size:.65,kind:'SHELL'});if(A.splashes.length>BATTLE_MAX_SPLASHES)A.splashes.shift();}
      const sub=this.state.playerSub,rng=distNm(sub.position,shooter.position);audio.playDistantGunfire?.(bearingBetween(sub.position,shooter.position),sub.heading,clamp(1-rng/8,.12,.72));
      if(!hit&&distNm(sub.position,target.position)<.10)audio.playShellPass?.(bearingBetween(sub.position,shooter.position),sub.heading);
    },

    resolveBattleShell(ev){
      if(ev.resolved)return;ev.resolved=true;const A=this.ensureBattleAtmosphereState(),s=this.state,sub=s.playerSub,now=s.time.elapsedSeconds;
      const miss=distNm(sub.position,ev.impactPosition),hit=sub.depthFeet<12&&miss<.020;
      if(hit){
        this.applyShock(ev.damage);s.weapons.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHORE BATTERY'});
        this.notify(`COASTAL BATTERY HIT — ${ev.damage.toFixed(0)}% damage. The battery has the range; get below or spoil the solution.`,'bad');
        audio.playShellImpact?.(bearingBetween(sub.position,ev.origin),sub.heading,.9);this.shake?.(1.2);
        if(s.world.harbor)s.world.harbor.batteryCorrection=.46;
      }else{
        A.splashes.push({id:`SP-${ev.id}`,position:{...ev.impactPosition},at:now,until:now+4,size:1.0,kind:'COASTAL'});if(A.splashes.length>BATTLE_MAX_SPLASHES)A.splashes.shift();
        const close=miss<.12;if(close)audio.playShellPass?.(bearingBetween(sub.position,ev.origin),sub.heading);
        audio.playShellSplash?.(clamp(miss/.3,0,1));
        const H=s.world.harbor;if(H){const lit=now<(H.searchlightContactUntil||-1);H.batteryCorrection=lit?clamp((H.batteryCorrection||1)*.76,.34,1):clamp((H.batteryCorrection||1)*.96,.7,1.15);}
      }
    },

    updateBattleSignals(dt){
      const s=this.state,A=this.ensureBattleAtmosphereState(),now=s.time.elapsedSeconds,env=s.world.environment;if((env.daylight||0)>.28)return;
      if(now-(A.lastSignalAt||-999)<26)return;
      const ships=s.world.contacts.filter(c=>!c.sunk&&!c.stationary&&c.type!=='RAFT'&&distNm(s.playerSub.position,c.position)<14);
      const alert=s.world.enemy?.alertState!=='UNAWARE';if(ships.length<2||(!alert&&Math.random()>.20))return;
      const from=ships.find(c=>isSurfaceCombatant(c))||ships[0],to=ships.find(c=>c.id!==from.id&&c.convoyId===from.convoyId)||ships.find(c=>c.id!==from.id);if(!to)return;
      A.lastSignalAt=now;const pattern=alert?[.0,.22,.46,.62,1.05,1.24]:[0,.34,.82];
      A.signals.push({id:`SIG-${A.nextId++}`,fromId:from.id,toId:to.id,at:now,until:now+2.1,pattern,alert});if(A.signals.length>BATTLE_MAX_SIGNALS)A.signals.shift();
    },

    updateBattleAtmosphere(dt){
      const A=this.ensureBattleAtmosphereState(),now=this.state.time.elapsedSeconds,H=this.state.world.harbor;
      this.updateHarborSearchlight(dt);
      for(const ev of A.shells)if(!ev.resolved&&now>=ev.impactAt)this.resolveBattleShell(ev);
      A.shells=A.shells.filter(e=>!e.resolved||now-e.impactAt<2);
      A.tracers=A.tracers.filter(e=>e.until>now);A.splashes=A.splashes.filter(e=>e.until>now);A.muzzleFlashes=A.muzzleFlashes.filter(e=>e.until>now);A.signals=A.signals.filter(e=>e.until>now);
      if(H&&H.batteryCorrection&&!((H.searchlightContactUntil||-1)>now))H.batteryCorrection=lerp(H.batteryCorrection,1,clamp(dt*.025,0,1));
      this.updateBattleSignals(dt);
    }
  });
})();
