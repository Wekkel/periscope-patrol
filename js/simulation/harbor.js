class SimEngineHarbor extends SimEngineCore {
  /* ══ ENEMY HARBOUR — first full prototype: TRUK ════════════════════
     Enemy ports used to be red squares on the chart and nothing more. Truk is
     now a place the player can deliberately penetrate: a persistent mine belt
     with a swept channel, a torpedo-net gate, harbour hydrophones, searchlights
     and coastal batteries, plus moored high-value targets that are generated
     once per patrol and then stay where they are. */
  ensureWorldExtensions(){
    const W=this.state.world, G=this.state.weapons;
    if(W.harborInitialized===undefined) W.harborInitialized=false; // migrate old saves
    if(!G.deckGun) G.deckGun={manned:false,ammo:120,trainDeg:0,elevationDeg:1.0,lastFireAt:-999,shots:0,hits:0,shells:[],splashes:[],lastFall:null,flashUntil:-1};
    G.deckGun.shells=G.deckGun.shells||[];G.deckGun.splashes=G.deckGun.splashes||[];
    if(!W.harborInitialized) this.setupHarbor(this.state.campaign.patrolArea);
  }

  setupHarbor(areaKey){
    const W=this.state.world, area=PATROL_AREAS[areaKey];
    W.harborInitialized=true; W.harbor=null;
    if(!area||areaKey!=='Truk Approaches') return;
    const port=(area.ports||[]).find(p=>p.side==='ENEMY'&&/Truk/i.test(p.name));
    if(!port) return;
    const H=W.harbor={
      name:port.name,center:{...port.pos},outerRadiusNm:5.6,innerRadiusNm:1.25,
      channelBearing:68,channelHalfWidthNm:0.42,
      mineInnerNm:2.15,mineOuterNm:4.75,
      netRangeNm:1.82,netHalfSpanNm:1.18,netGapHalfNm:0.28,
      hydrophoneRangeNm:4.6,batteryRangeNm:5.1,
      suspicion:0,alert:0,entered:false,inside:false,lastGunAt:-999,lastSweepAt:-999,
      mines:[]
    };
    // Physical mines: positions are randomised ONCE, not rerolled as the player
    // approaches. The chart only shows the belt and swept channel, never the
    // individual mines.
    let tries=0;
    while(H.mines.length<30&&tries++<300){
      const a=Math.random()*360;
      if(Math.abs(shortDelta(H.channelBearing,a))<13) continue; // swept approach
      const rr=H.mineInnerNm+Math.random()*(H.mineOuterNm-H.mineInnerNm);
      const r=degToRad(a);
      H.mines.push({xNm:H.center.xNm+Math.sin(r)*rr,
                    yNm:H.center.yNm-Math.cos(r)*rr,triggered:false});
    }

    if(!W.contacts.some(c=>c.harborTarget)){
      const put=(id,name,type,displayType,brg,rng,length,tons,value,profile=1)=>{
        const r=degToRad(brg);
        W.contacts.push({id,name,type,displayType,lengthYards:length,visualProfile:profile,
          acousticBase:0.05,tonsFactor:tons,harborValue:value,harborTarget:true,stationary:true,
          position:{xNm:H.center.xNm+Math.sin(r)*rng,yNm:H.center.yNm-Math.cos(r)*rng},
          heading:normDeg(brg+85),speedKnots:0,desiredSpeed:0,baseSpeed:0,convoyRole:'HARBOR'});
      };
      put('H-01','Fleet Oiler','TANKER','FLEET OILER',205,0.72,560,10500,2600,1.12);
      put('H-02','Army Transport','MERCHANT','TROOP TRANSPORT',318,0.62,500,7600,2200,1.02);
      put('H-03','Cargo Vessel','MERCHANT','CARGO SHIP',112,0.92,430,4800,1800,0.96);
      // The jackpot is deliberately uncertain. It is decided at patrol creation
      // and never respawned or moved later.
      if(Math.random()<0.38)
        put('H-04','Japanese Fleet Carrier','MERCHANT','FLEET CARRIER',28,0.46,820,26000,9000,1.45);
      else
        put('H-04','Heavy Cruiser','MERCHANT','HEAVY CRUISER',28,0.46,660,13500,5200,1.22);
    }
  }

  harborNetSegments(H){
    if(!H) return [];
    const r=degToRad(H.channelBearing), sx=Math.cos(r), sy=Math.sin(r);
    const gate={xNm:H.center.xNm+Math.sin(r)*H.netRangeNm,
                yNm:H.center.yNm-Math.cos(r)*H.netRangeNm};
    const at=d=>({xNm:gate.xNm+sx*d,yNm:gate.yNm+sy*d});
    return [{a:at(H.netGapHalfNm),b:at(H.netHalfSpanNm)},
            {a:at(-H.netGapHalfNm),b:at(-H.netHalfSpanNm)}];
  }

  pointSegNm(p,a,b){
    const vx=b.xNm-a.xNm,vy=b.yNm-a.yNm,wx=p.xNm-a.xNm,wy=p.yNm-a.yNm;
    const vv=vx*vx+vy*vy||1e-9,t=clamp((wx*vx+wy*vy)/vv,0,1);
    return Math.hypot(p.xNm-(a.xNm+vx*t),p.yNm-(a.yNm+vy*t));
  }

  harborTorpedoNetHit(pos){
    const H=this.state.world.harbor;if(!H) return false;
    return this.harborNetSegments(H).some(seg=>this.pointSegNm(pos,seg.a,seg.b)<0.024);
  }

  updateHarbor(dt){
    this.ensureWorldExtensions();
    const W=this.state.world,H=W.harbor,sub=this.state.playerSub;
    if(!H||sub.mode==='SUNK') return;
    const now=this.state.time.elapsedSeconds,rng=distNm(sub.position,H.center);
    if(rng<H.outerRadiusNm&&!H.entered){
      H.entered=true;
      this.notify(`ENEMY HARBOUR WATERS — ${H.name}. Mine belt and listening stations ahead. The swept channel is narrow; slow and quiet is the safe way in.`,'warn');
    }
    if(rng<H.innerRadiusNm&&!H.inside){
      H.inside=true;
      this.notify(`INSIDE ${H.name.toUpperCase()} — silhouettes at anchor. High-value targets are close, but the same gate is still your way out.`,'ok');
    }else if(rng>H.innerRadiusNm*1.35) H.inside=false;

    // Harbour hydrophones / indicator loops: not magical truth, but sustained
    // screw noise inside the defensive ring builds a suspicion plot.
    const hydro=clamp(1-rng/H.hydrophoneRangeNm,0,1);
    const noise=clamp(sub.stealth.acousticSignature,0,1.5);
    if(hydro>0){
      const prop=Math.max(0,noise-0.035)+Math.max(0,sub.propulsion.speedKnots-3)*0.012;
      H.suspicion+=dt*hydro*prop*0.62;
      if(sub.depthFeet<12) H.suspicion+=dt*hydro*(0.025+W.environment.daylight*0.045);
    }
    const quiet=noise<0.16&&sub.propulsion.speedKnots<4;
    H.suspicion=clamp(H.suspicion-dt*(quiet?0.045:0.012),0,100);

    if(H.suspicion>18&&H.alert<1){
      H.alert=1;
      this.notify(`${H.name}: harbour hydrophones have a possible contact. Searchlights and batteries are standing by.`,'warn');
    }
    if(H.suspicion>46&&H.alert<2){
      H.alert=2;
      this.notify(`HARBOR ALARM — ${H.name} has your approximate position. Searchlights sweeping; coastal batteries ready.`,'bad');
      W.enemy.searchCenter={...sub.position};
    }
    if(H.alert===2&&H.suspicion<12) H.alert=1;
    if(H.alert===1&&H.suspicion<4) H.alert=0;

    // Searchlight sweeps are warnings; the battery only has a useful target if
    // the boat is surfaced/awash. Diving under the beams is therefore real cover.
    if(H.alert>0&&sub.depthFeet<12&&rng<4.4&&now-H.lastSweepAt>22){
      H.lastSweepAt=now;
      this.notify('Searchlight beam sweeping the harbour entrance — keep the deck down or get under it.','warn');
      H.suspicion=clamp(H.suspicion+5,0,100);
    }
    if(H.alert>=2&&sub.depthFeet<12&&rng<H.batteryRangeNm&&now-H.lastGunAt>11){
      H.lastGunAt=now;
      const env=W.environment;
      const rangeF=clamp(1-rng/H.batteryRangeNm,0,1);
      const light=clamp(env.daylight+(H.alert>=2?0.35:0),0.2,1);
      const pHit=rangeF*rangeF*0.42*light*(1-env.seaState*0.28);
      if(Math.random()<pHit){
        const dmg=5+Math.random()*12;
        this.applyShock(dmg);
        W.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:5,label:'SHORE BATTERY'});
        this.notify(`COASTAL BATTERY HIT — ${dmg.toFixed(0)}% damage. Get below the searchlights!`,'bad');
        audio.playDepthCharge(0.55);
      }else{
        this.notify('Coastal battery firing — shell splashes close aboard.','bad');
        audio.playDepthCharge(0.9);
      }
    }

    // Mines are actual persistent points. No dice are rolled merely because the
    // player entered a zone: either the hull intersects a mine or it does not.
    if(sub.depthFeet>=4&&sub.depthFeet<=105){
      for(const m of H.mines){
        if(m.triggered||distNm(sub.position,m)>0.042) continue;
        m.triggered=true;H.alert=2;H.suspicion=100;
        const dmg=38+Math.random()*28;
        this.applyShock(dmg);
        W.explosions.push({position:{...sub.position},ageSec:0,maxAgeSec:12,label:'MINE'});
        this.notify(`MINE! Underwater explosion — ${dmg.toFixed(0)}% damage. The swept channel is the only safe water.`,'bad');
        audio.playDepthCharge(0.15);particles.spawnExplosion(sub.position.xNm,sub.position.yNm,1.25,false);
        break;
      }
    }

    // A submarine can foul a net just as a torpedo can. Stop and shove her back
    // rather than leaving the player irretrievably welded to the obstacle.
    if(sub.depthFeet>=4&&sub.depthFeet<=80&&now-(H.lastNetAt||-999)>8){
      for(const seg of this.harborNetSegments(H)){
        if(this.pointSegNm(sub.position,seg.a,seg.b)>=0.036) continue;
        H.lastNetAt=now;
        const back=degToRad(normDeg(sub.heading+180));
        sub.position.xNm+=Math.sin(back)*0.055;sub.position.yNm-=Math.cos(back)*0.055;
        sub.propulsion.actualRpm*=0.08;sub.propulsion.speedKnots*=0.05;
        sub.damage.rudderDamage=clamp(sub.damage.rudderDamage+0.04,0,1);
        this.notify('TORPEDO NET — screws fouled and way off the boat. Back clear and find the gate in the swept channel.','bad');
        H.suspicion=clamp(H.suspicion+18,0,100);
        break;
      }
    }
  }

  // ── WEAPONS ──
}
