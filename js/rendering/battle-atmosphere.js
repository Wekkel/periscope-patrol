const BattleAtmosphere={
    battlePoint(cam,p,z=0){return p?projectWorldPoint(cam,p.xNm*NM_M,-p.yNm*NM_M,z):null;},

    drawBattleAtmosphereBack(ctx,cam,state,dl,t){
      this.drawPortScenes3D(ctx,cam,state,dl);
      this.drawHarborNet3D(ctx,cam,state,dl);
      this.drawHarborSearchlight3D(ctx,cam,state,dl,t);
      this.drawDistantDamageCues3D(ctx,cam,state,dl,t);
      this.drawSignalLamps3D(ctx,cam,state,dl,t);
    },

    drawPortScenes3D(ctx,cam,state,dl){
      const own=state.playerSub.position,k=this.k,maxFeatures=this.lowSpec?12:28;let drawn=0;
      const H=state.world.harbor,blackout=(H?.alert||0)>=2;
      for(const scene of state.world.portScenes||[]){if(!scene.known||distNm(own,scene.position)>10)continue;const a=degToRad(scene.heading||0),sin=Math.sin(a),cos=Math.cos(a);
        for(const f of scene.features||[]){if(drawn++>=maxFeatures)return;const q={xNm:scene.position.xNm+sin*f.alongNm+cos*f.lateralNm,yNm:scene.position.yNm-cos*f.alongNm+sin*f.lateralNm},p=this.battlePoint(cam,q,0);if(!p)continue;
          const scale=cam.f/Math.max(120,p.d),height=Math.max(1.5,(f.heightM||5)*scale),width=Math.max(1.5,(f.sizeM||12)*scale);
          if(f.kind==='pier'){
            // 2.5D Stone & Timber Wharf Wall
            const wharfTop=Math.max(1.5,2.2*k),wharfDrop=Math.max(2,3.5*k);
            ctx.fillStyle=`rgba(92,88,80,${.42+.38*dl})`;
            ctx.fillRect(p.x-width*.5,p.y-wharfTop,width,wharfTop+wharfDrop);
            // Waterline contact shadow
            ctx.fillStyle=`rgba(18,22,26,${.45+.30*dl})`;
            ctx.fillRect(p.x-width*.5,p.y+wharfDrop*.75,width,Math.max(1,1.5*k));
            // Wooden pilings / fender posts
            ctx.strokeStyle=`rgba(55,50,42,${.50+.35*dl})`;ctx.lineWidth=Math.max(1,1.2*k);
            const pilings=Math.max(2,Math.min(6,Math.floor(width/(12*k))));
            ctx.beginPath();
            for(let i=0;i<=pilings;i++){
              const px=p.x-width*.48+(width*.96)*(i/pilings);
              ctx.moveTo(px,p.y-wharfTop-1.5*k);ctx.lineTo(px,p.y+wharfDrop+1.5*k);
            }
            ctx.stroke();
          }else if(f.kind==='warehouse'){
            // 2.5D Warehouse with Pitched Roof (Zadeldak)
            const wallH=height*.64;
            // Wall body
            ctx.fillStyle=`rgba(112,96,78,${.38+.44*dl})`;
            ctx.fillRect(p.x-width*.48,p.y-wallH,width*.96,wallH);
            // Triangular gable and pitched roof
            ctx.fillStyle=`rgba(86,76,66,${.44+.42*dl})`;
            ctx.beginPath();ctx.moveTo(p.x-width*.5,p.y-wallH);ctx.lineTo(p.x,p.y-height);ctx.lineTo(p.x+width*.5,p.y-wallH);ctx.closePath();ctx.fill();
            // Cargo loading door
            ctx.fillStyle=`rgba(38,34,30,${.45+.35*dl})`;
            ctx.fillRect(p.x-width*.12,p.y-wallH*.58,width*.24,wallH*.58);
            // Nighttime dock lantern (extinguished under blackout/alert >= 2)
            if(dl<.28&&!blackout&&scale>.018){
              ctx.fillStyle='rgba(255,185,75,.85)';ctx.fillRect(p.x-k,p.y-wallH*.72-k,2*k,2*k);
              ctx.fillStyle='rgba(255,180,50,.18)';ctx.beginPath();ctx.arc(p.x,p.y-wallH*.72,Math.max(2.5,4*k),0,Math.PI*2);ctx.fill();
            }
          }else if(f.kind==='tank'){
            // 2.5D Cylindrical Oil Storage Tank with directional shading
            const tankH=height*.85,roofH=height*.15,tankW=width*.84;
            const g=ctx.createLinearGradient(p.x-tankW*.5,0,p.x+tankW*.5,0);
            g.addColorStop(0,`rgba(162,168,158,${.34+.46*dl})`);
            g.addColorStop(.5,`rgba(138,144,134,${.32+.42*dl})`);
            g.addColorStop(1,`rgba(92,96,90,${.30+.40*dl})`);
            ctx.fillStyle=g;
            ctx.fillRect(p.x-tankW*.5,p.y-tankH,tankW,tankH);
            // Low-profile dome cap
            ctx.fillStyle=`rgba(148,154,144,${.36+.44*dl})`;
            ctx.beginPath();ctx.ellipse(p.x,p.y-tankH,tankW*.5,Math.max(1,roofH),0,Math.PI,0);ctx.fill();
            // Vertical ladder / service conduit
            ctx.strokeStyle=`rgba(68,72,66,${.35+.35*dl})`;ctx.lineWidth=Math.max(1,k*.85);
            ctx.beginPath();ctx.moveTo(p.x+tankW*.32,p.y);ctx.lineTo(p.x+tankW*.32,p.y-tankH);ctx.stroke();
          }else if(f.kind==='crane'){
            // 2.5D Gantry Truss Crane
            ctx.strokeStyle=`rgba(138,140,132,${.40+.38*dl})`;ctx.lineWidth=Math.max(1,k);
            ctx.beginPath();
            // A-frame portal legs
            ctx.moveTo(p.x-width*.32,p.y);ctx.lineTo(p.x-width*.14,p.y-height*.42);
            ctx.moveTo(p.x+width*.32,p.y);ctx.lineTo(p.x+width*.14,p.y-height*.42);
            // Portal crossbeam
            ctx.moveTo(p.x-width*.22,p.y-height*.42);ctx.lineTo(p.x+width*.22,p.y-height*.42);
            // Angled boom / jib
            ctx.moveTo(p.x,p.y-height*.42);ctx.lineTo(p.x+width*.58,p.y-height);
            // Cable down from boom tip
            ctx.moveTo(p.x+width*.58,p.y-height);ctx.lineTo(p.x+width*.58,p.y-height*.38);
            ctx.stroke();
            // Cab body
            ctx.fillStyle=`rgba(85,88,82,${.44+.40*dl})`;
            ctx.fillRect(p.x-width*.10,p.y-height*.58,width*.20,height*.16);
          }else if(f.kind==='breakwater'){
            const bH=Math.max(2,height),bW=Math.max(3,width);
            ctx.fillStyle=`rgba(125,122,115,${.45+.40*dl})`;ctx.fillRect(p.x-bW*.5,p.y-bH,bW,bH);
            ctx.fillStyle=`rgba(145,142,135,${.48+.42*dl})`;ctx.fillRect(p.x-bW*.5,p.y-bH*1.18,bW,bH*.24);
            ctx.fillStyle=`rgba(24,28,32,${.55+.35*dl})`;ctx.fillRect(p.x-bW*.5,p.y-bH*.15,bW,bH*.35);
          }else if(f.kind==='quay'){
            const qH=Math.max(1.8,height),qW=Math.max(3,width);
            ctx.fillStyle=`rgba(110,108,102,${.44+.40*dl})`;ctx.fillRect(p.x-qW*.5,p.y-qH,qW,qH);
            ctx.fillStyle=`rgba(140,136,128,${.48+.42*dl})`;ctx.fillRect(p.x-qW*.5,p.y-qH*1.12,qW,qH*.16);
            ctx.fillStyle=`rgba(20,24,28,${.50+.30*dl})`;ctx.fillRect(p.x-qW*.5,p.y-qH*.1,qW,qH*.25);
            if(scale>.014){
              ctx.fillStyle=`rgba(45,45,48,${.60+.30*dl})`;
              const bollards=Math.max(2,Math.min(5,Math.floor(qW/(14*k))));
              for(let b=0;b<=bollards;b++)ctx.fillRect(p.x-qW*.46+(qW*.92)*(b/bollards)-k,p.y-qH*1.3,2*k,qH*.3);
            }
          }else if(f.kind==='lighthouse'){
            const lH=Math.max(4,height),lW=Math.max(2,width);
            ctx.fillStyle=`rgba(215,212,205,${.52+.42*dl})`;ctx.beginPath();ctx.moveTo(p.x-lW*.6,p.y);ctx.lineTo(p.x-lW*.35,p.y-lH*.82);ctx.lineTo(p.x+lW*.35,p.y-lH*.82);ctx.lineTo(p.x+lW*.6,p.y);ctx.closePath();ctx.fill();
            ctx.fillStyle=`rgba(165,42,42,${.48+.44*dl})`;ctx.fillRect(p.x-lW*.48,p.y-lH*.55,lW*.96,lH*.22);
            ctx.fillStyle=`rgba(55,55,58,${.60+.35*dl})`;ctx.fillRect(p.x-lW*.5,p.y-lH*.88,lW,lH*.08);
            ctx.fillStyle=`rgba(40,42,46,${.55+.35*dl})`;ctx.fillRect(p.x-lW*.3,p.y-lH,lW*.6,lH*.14);
            ctx.fillStyle=`rgba(60,65,70,${.55+.35*dl})`;ctx.beginPath();ctx.moveTo(p.x-lW*.34,p.y-lH);ctx.lineTo(p.x,p.y-lH*1.15);ctx.lineTo(p.x+lW*.34,p.y-lH);ctx.closePath();ctx.fill();
            const pulse=Math.sin((state.time?.elapsedSeconds||0)*2.4+p.d*.01);
            if((dl<.35||pulse>.7)&&!blackout){
              const glow=dl<.35?Math.max(0,pulse):Math.max(0,(pulse-.7)*3.3);
              if(glow>.05){
                const bRad=Math.max(3*k,8*k*scale*(1+glow));
                const g=ctx.createRadialGradient(p.x,p.y-lH*.93,0,p.x,p.y-lH*.93,bRad*4);
                g.addColorStop(0,`rgba(255,255,220,${.9*glow})`);g.addColorStop(.25,`rgba(255,230,130,${.45*glow})`);g.addColorStop(1,'rgba(255,200,80,0)');
                ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y-lH*.93,bRad*4,0,Math.PI*2);ctx.fill();
              }
            }
          }else if(f.kind==='control_tower'){
            const tH=Math.max(4,height),tW=Math.max(2,width);
            ctx.fillStyle=`rgba(105,108,104,${.46+.40*dl})`;ctx.fillRect(p.x-tW*.35,p.y-tH*.72,tW*.7,tH*.72);
            ctx.fillStyle=`rgba(72,82,88,${.55+.38*dl})`;ctx.fillRect(p.x-tW*.55,p.y-tH*.95,tW*1.1,tH*.24);
            ctx.fillStyle=`rgba(145,175,190,${.35+.45*dl})`;ctx.fillRect(p.x-tW*.48,p.y-tH*.91,tW*.96,tH*.10);
            ctx.strokeStyle=`rgba(55,60,65,${.45+.35*dl})`;ctx.lineWidth=Math.max(1,k);
            ctx.beginPath();ctx.moveTo(p.x,p.y-tH*.95);ctx.lineTo(p.x,p.y-tH*1.28);ctx.stroke();
          }else if(f.kind==='coastal_battery'){
            const bH=Math.max(2,height*.85),bW=Math.max(3,width*1.1);
            ctx.fillStyle=`rgba(88,86,78,${.48+.42*dl})`;ctx.beginPath();ctx.moveTo(p.x-bW*.55,p.y);ctx.lineTo(p.x-bW*.42,p.y-bH);ctx.lineTo(p.x+bW*.42,p.y-bH);ctx.lineTo(p.x+bW*.55,p.y);ctx.closePath();ctx.fill();
            ctx.fillStyle=`rgba(70,78,64,${.45+.40*dl})`;ctx.beginPath();ctx.ellipse(p.x,p.y-bH,bW*.46,Math.max(1,bH*.22),0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle=`rgba(18,18,20,${.75+.20*dl})`;ctx.fillRect(p.x-bW*.26,p.y-bH*.68,bW*.52,bH*.36);
            const subBrg=bearingBetween(q,own),barrelAngle=degToRad(subBrg-(scene.heading||0));
            ctx.strokeStyle=`rgba(32,34,36,${.80+.18*dl})`;ctx.lineWidth=Math.max(1.2,k*1.6);
            ctx.beginPath();ctx.moveTo(p.x,p.y-bH*.5);ctx.lineTo(p.x+Math.sin(barrelAngle)*bW*.55,p.y-bH*.5-bH*.15);ctx.stroke();
          }else if(f.kind==='channel_buoy'){
            const bRad=Math.max(1.5,3.5*k*scale),now=state.time?.elapsedSeconds||0;
            const by=p.y+Math.sin(now*1.8+q.xNm*4+q.yNm*4)*2*k,isPort=f.buoySide==='PORT';
            ctx.fillStyle=isPort?`rgba(185,45,40,${.62+.35*dl})`:`rgba(35,145,65,${.62+.35*dl})`;
            ctx.beginPath();ctx.moveTo(p.x-bRad,by);ctx.lineTo(p.x,by-bRad*2.2);ctx.lineTo(p.x+bRad,by);ctx.closePath();ctx.fill();
            ctx.fillStyle=`rgba(45,45,45,${.65+.30*dl})`;ctx.fillRect(p.x-bRad*.3,by-bRad*2.6,bRad*.6,bRad*.45);
            if(dl<.35&&!blackout&&Math.sin(now*2.5+(isPort?0:Math.PI))>.35){
              const gColor=isPort?'rgba(255,60,50,':'rgba(60,255,90,';
              const g=ctx.createRadialGradient(p.x,by-bRad*2.6,0,p.x,by-bRad*2.6,Math.max(2*k,6*k*scale));
              g.addColorStop(0,gColor+'0.95)');g.addColorStop(1,gColor+'0)');
              ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,by-bRad*2.6,Math.max(2*k,6*k*scale),0,Math.PI*2);ctx.fill();
            }
          }
        }
      }
    },

    drawHarborNet3D(ctx,cam,state,dl){
      const H=state.world.harbor;if(!H)return;
      const own=state.playerSub.position,rng=distNm(own,H.center);
      if(rng>H.netRangeNm+3.2||rng<H.netRangeNm-3.2)return;
      const k=this.k,step=6,gapHalfDeg=radToDeg(Math.asin(clamp(H.netGapHalfNm/Math.max(.1,H.netRangeNm),0,.95)));
      const brCenter=normDeg(bearingBetween(H.center,own));
      const at=b=>{const r=degToRad(b);return{xNm:H.center.xNm+Math.sin(r)*H.netRangeNm,yNm:H.center.yNm-Math.cos(r)*H.netRangeNm};};
      ctx.save();
      for(let a=0;a<360;a+=step){
        const mid=normDeg(a+step*.5);
        if(Math.abs(shortDelta(brCenter,mid))>54)continue;
        const inGap=Math.abs(shortDelta(H.channelBearing,mid))<=gapHalfDeg;
        const p1=this.battlePoint(cam,at(a),0),p2=this.battlePoint(cam,at(a+step),0);
        if(inGap){
          if(Math.abs(shortDelta(H.channelBearing,a))<=gapHalfDeg&&Math.abs(shortDelta(H.channelBearing,a-step))>gapHalfDeg&&p1){
            const scale=cam.f/Math.max(120,p1.d),br=Math.max(2,4*scale*k);
            ctx.fillStyle=`rgba(45,185,95,${.65+.35*dl})`;ctx.beginPath();ctx.arc(p1.x,p1.y-br,br,0,Math.PI*2);ctx.fill();
            if(dl<.28){ctx.fillStyle='rgba(111,224,143,.9)';ctx.fillRect(p1.x-k,p1.y-br*2-k,2*k,2*k);}
          }
          if(Math.abs(shortDelta(H.channelBearing,a+step))<=gapHalfDeg&&Math.abs(shortDelta(H.channelBearing,a+step*2))>gapHalfDeg&&p2){
            const scale=cam.f/Math.max(120,p2.d),br=Math.max(2,4*scale*k);
            ctx.fillStyle=`rgba(225,85,75,${.65+.35*dl})`;ctx.beginPath();ctx.arc(p2.x,p2.y-br,br,0,Math.PI*2);ctx.fill();
            if(dl<.28){ctx.fillStyle='rgba(239,106,88,.9)';ctx.fillRect(p2.x-k,p2.y-br*2-k,2*k,2*k);}
          }
          continue;
        }
        if(!p1||!p2)continue;
        ctx.strokeStyle=`rgba(72,70,65,${.45+.35*dl})`;ctx.lineWidth=Math.max(1,1.1*k);
        ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
        const scale=cam.f/Math.max(120,p1.d),fr=Math.max(1.2,2.2*scale*k);
        ctx.fillStyle=`rgba(58,56,52,${.50+.40*dl})`;
        ctx.beginPath();ctx.arc(p1.x,p1.y-fr*.6,fr,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    },

    drawBattleAtmosphereFront(ctx,cam,state,dl,t){
      const A=state.world.atmosphere;if(!A)return;const now=state.time.elapsedSeconds,k=this.k;
      this.drawStarshells3D(ctx,cam,state,dl,t);
      // Muzzle flashes: a brief point source before the later fall of shot.
      for(const f of A.muzzleFlashes||[]){if(now<f.at||now>f.until)continue;const p=this.battlePoint(cam,f.position,f.kind==='COASTAL'?18:10);if(!p)continue;
        const a=clamp((f.until-now)/Math.max(.05,f.until-f.at),0,1),rr=clamp((f.power||1)*11*k*cam.f/Math.max(p.d,600),1.6*k,18*k);
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*5);g.addColorStop(0,`rgba(255,248,205,${.96*a})`);g.addColorStop(.15,`rgba(255,165,55,${.72*a})`);g.addColorStop(1,'rgba(255,100,20,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*5,0,Math.PI*2);ctx.fill();
      }
      // Tracers: short luminous segment advancing along the real shooter→target line.
      for(const tr of A.tracers||[]){if(now<tr.at||now>tr.until)continue;const u=clamp((now-tr.at)/Math.max(.05,tr.until-tr.at),0,1),u0=Math.max(0,u-.16);
        const lerpP=q=>({xNm:lerp(tr.start.xNm,tr.end.xNm,q),yNm:lerp(tr.start.yNm,tr.end.yNm,q)}),p0=this.battlePoint(cam,lerpP(u0),8+Math.sin(u0*Math.PI)*6),p1=this.battlePoint(cam,lerpP(u),8+Math.sin(u*Math.PI)*6);if(!p0||!p1)continue;
        ctx.strokeStyle=`rgba(255,205,95,${.72*(1-u*.28)})`;ctx.lineWidth=Math.max(1,1.35*k);ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();
      }
      // Delayed shell splashes are deliberately readable as fall-of-shot cues.
      for(const sp of A.splashes||[]){if(now<sp.at||now>sp.until)continue;const p=this.battlePoint(cam,sp.position,0);if(!p)continue;const age=now-sp.at,life=Math.max(.2,sp.until-sp.at),q=clamp(age/life,0,1),rise=Math.sin(clamp(q/.55,0,1)*Math.PI),rr=clamp((5+18*(sp.size||.7))*cam.f/Math.max(p.d,260),1.5*k,34*k);
        ctx.fillStyle=`rgba(230,241,246,${.48*(1-q)})`;ctx.beginPath();ctx.ellipse(p.x,p.y-rr*1.9*rise,rr*.38,rr*2.15*rise+.8,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=`rgba(235,247,252,${.32*(1-q)})`;ctx.lineWidth=Math.max(1,k);ctx.beginPath();ctx.ellipse(p.x,p.y,rr*(.4+q*1.4),rr*(.10+q*.18),0,0,Math.PI*2);ctx.stroke();
      }
      // At night even a distant real explosion is a bearing cue on the horizon.
      if(dl<.28)for(const ex of state.weapons?.explosions||[]){const age=ex.ageSec||0;if(age>1.6)continue;const p=this.battlePoint(cam,ex.position,8);if(!p)continue;const a=clamp(1-age/1.6,0,1),rr=clamp(22*k*cam.f/Math.max(p.d,500),2*k,24*k);const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*6);g.addColorStop(0,`rgba(255,210,105,${.45*a})`);g.addColorStop(1,'rgba(255,120,30,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*6,0,Math.PI*2);ctx.fill();}
    },

    drawHarborSearchlight3D(ctx,cam,state,dl,t){
      const H=state.world.harbor,now=state.time.elapsedSeconds;if(!H||(H.searchlightActiveUntil||-1)<=now||dl>=0.35)return;
      const wx=weatherAtPosition(state,H.center),maxNm=4.4*wx.searchlightFactor,br=degToRad(H.searchlightBearing||0),wid=degToRad((H.searchlightWidthDeg||12)*.5),steps=this.lowSpec?6:9;
      const pts=[];for(let i=0;i<=steps;i++){const f=i/steps,rng=.18+maxNm*f,z=lerp(18,3,f);for(const side of [-1,1]){const a=br+side*wid*(.15+.85*f),q={xNm:H.center.xNm+Math.sin(a)*rng,yNm:H.center.yNm-Math.cos(a)*rng},p=this.battlePoint(cam,q,z);if(p)pts.push({p,side,i});}}
      // Draw paired cross-sections as translucent strips. Missing off-screen
      // points simply break the strip instead of inventing a giant polygon.
      ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<steps;i++){const a=pts.find(x=>x.i===i&&x.side===-1),b=pts.find(x=>x.i===i&&x.side===1),c=pts.find(x=>x.i===i+1&&x.side===1),d=pts.find(x=>x.i===i+1&&x.side===-1);if(!a||!b||!c||!d)continue;const alpha=(.028+.042*(1-i/steps))*wx.searchlightFactor;ctx.fillStyle=`rgba(255,244,184,${alpha})`;ctx.beginPath();ctx.moveTo(a.p.x,a.p.y);ctx.lineTo(b.p.x,b.p.y);ctx.lineTo(c.p.x,c.p.y);ctx.lineTo(d.p.x,d.p.y);ctx.closePath();ctx.fill();}
      // bright core gives direction without turning the beam into a chart line
      ctx.strokeStyle=`rgba(255,248,205,${.20*wx.searchlightFactor})`;ctx.lineWidth=Math.max(1,1.4*this.k);ctx.beginPath();let started=false;for(let i=0;i<=steps;i++){const rng=.18+maxNm*i/steps,q={xNm:H.center.xNm+Math.sin(br)*rng,yNm:H.center.yNm-Math.cos(br)*rng},p=this.battlePoint(cam,q,lerp(18,3,i/steps));if(!p){started=false;continue;}if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.restore();
    },

    drawDistantDamageCues3D(ctx,cam,state,dl,t){
      const own=state.playerSub.position,env=state.world.environment||{},vis=Math.max(.5,env.visibilityNm||.5),night=clamp(1-dl*2.6,0,1),gloom=Math.max(night,clamp(((env.cloudCover||0)*.28+(env.precipitation||0)*.38)*(1-dl*.72),0,.38)),maxN=this.lowSpec?4:7;let drawn=0;
      for(const c of state.world.contacts||[]){if(drawn>=maxN||c.sunk)continue;const SD=c.shipDamage,sev=SD?clamp(Math.max(SD.fire||0,(SD.propulsion||0)*.72),0,1):0;if(sev<.16)continue;const rng=distNm(own,c.position),smokeRange=Math.min(26,vis*(1.18+sev*.65));if(rng>smokeRange)continue;
        const brg=bearingBetween(own,c.position),off=Math.abs(shortDelta(cam.bearingDeg??state.tactical.periscopeBearing,brg));if(off>cam.fovDeg*.68)continue;const p=this.battlePoint(cam,c.position,22+sev*20);if(!p)continue;drawn++;
        const scale=cam.f/Math.max(p.d,300),puffs=this.lowSpec?2:4;if(rng>=2.2)for(let i=0;i<puffs;i++){const ff=(i+1)/puffs,rr=clamp((12+ff*34)*scale*(.8+sev),1.2*this.k,16*this.k),drift=((t*5+i*17)%55)*scale;ctx.fillStyle=`rgba(18,18,19,${(.13+.22*sev)*(1-ff*.58)*clamp(1-rng/smokeRange,.22,1)})`;ctx.beginPath();ctx.arc(p.x+drift*ff*1.5,p.y-ff*28*scale-drift*.25,rr,0,Math.PI*2);ctx.fill();}
        if(gloom>.02&&SD.fire>.22){const base=this.battlePoint(cam,c.position,2);if(base){const rr=clamp((18+45*SD.fire)*scale,2*this.k,34*this.k);ctx.save();ctx.globalCompositeOperation='screen';const g=ctx.createRadialGradient(base.x,base.y,0,base.x,base.y,rr*7);g.addColorStop(0,`rgba(255,150,48,${.34*gloom*SD.fire})`);g.addColorStop(.32,`rgba(255,98,24,${.16*gloom*SD.fire})`);g.addColorStop(1,'rgba(255,70,14,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(base.x,base.y,rr*7,0,Math.PI*2);ctx.fill();const rg=ctx.createRadialGradient(base.x,base.y,0,base.x,base.y,rr*8);rg.addColorStop(0,`rgba(255,132,35,${.13*gloom*SD.fire})`);rg.addColorStop(1,'rgba(255,70,12,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.ellipse(base.x,base.y+rr*.4,rr*8,rr*1.65,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
      }
    },

    drawStarshells3D(ctx,cam,state,dl,t){
      const A=state.world.atmosphere;if(!A||!A.starshells||!A.starshells.length)return;
      const now=state.time.elapsedSeconds,k=this.k;
      for(const s of A.starshells){
        if(now<s.at||now>s.until)continue;
        const age=now-s.at,dur=s.until-s.at,life=clamp(1-age/dur,0,1);
        const alt=Math.max(18,s.startAlt-(age*(s.descentRate||3.8)));
        const p=this.battlePoint(cam,s.position,alt);if(!p)continue;
        const scale=cam.f/Math.max(180,p.d);
        const rr=clamp(24*k*scale,3*k,36*k);
        const pSea=this.battlePoint(cam,s.position,0);
        if(pSea){
          const sRad=rr*3.5;
          const gSea=ctx.createRadialGradient(pSea.x,pSea.y,0,pSea.x,pSea.y,sRad);
          gSea.addColorStop(0,`rgba(255,250,210,${.22*life})`);
          gSea.addColorStop(.5,`rgba(255,230,160,${.08*life})`);
          gSea.addColorStop(1,'rgba(255,200,100,0)');
          ctx.fillStyle=gSea;ctx.beginPath();ctx.ellipse(pSea.x,pSea.y,sRad,sRad*.28,0,0,Math.PI*2);ctx.fill();
        }
        const py=p.y-rr*1.3;
        ctx.fillStyle=`rgba(220,225,230,${.45*life})`;ctx.strokeStyle=`rgba(180,185,190,${.35*life})`;ctx.lineWidth=Math.max(1,k*.8);
        ctx.beginPath();ctx.ellipse(p.x,py,rr*.85,rr*.42,0,Math.PI,0);ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(p.x-rr*.7,py);ctx.lineTo(p.x,p.y);ctx.moveTo(p.x+rr*.7,py);ctx.lineTo(p.x,p.y);ctx.stroke();
        const flicker=1+Math.sin(now*14+s.at)*.08;
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*flicker*4);
        g.addColorStop(0,`rgba(255,255,248,${.95*life})`);
        g.addColorStop(.15,`rgba(255,242,175,${.75*life})`);
        g.addColorStop(.45,`rgba(255,215,115,${.28*life})`);
        g.addColorStop(1,'rgba(255,160,50,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*flicker*4,0,Math.PI*2);ctx.fill();
      }
    },

    drawSignalLamps3D(ctx,cam,state,dl,t){
      if(dl>.30)return;const A=state.world.atmosphere,now=state.time.elapsedSeconds;if(!A)return;
      for(const sig of A.signals||[]){if(now<sig.at||now>sig.until)continue;const c=state.world.contacts.find(x=>x.id===sig.fromId&&!x.sunk);if(!c)continue;const age=now-sig.at,blink=(sig.pattern||[]).some(v=>age>=v&&age<v+.11);if(!blink)continue;const p=this.battlePoint(cam,c.position,18);if(!p)continue;const rr=clamp(5*this.k*cam.f/Math.max(p.d,450),1.2*this.k,8*this.k),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*5);g.addColorStop(0,`rgba(235,255,220,${sig.alert?.95:.72})`);g.addColorStop(1,'rgba(190,255,190,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*5,0,Math.PI*2);ctx.fill();}
    },

    drawBridgeDeckSpray(ctx,w,h,state,t){
      const sub=state.playerSub,sea=clamp(state.world.environment?.seaState||0,0,1),spd=clamp((sub.propulsion?.speedKnots||0)/18,0,1),wet=clamp((sea-.38)*1.55,0,1)*clamp((spd-.22)*1.4,0,1);if(wet<.04)return;
      const n=this.lowSpec?5:9,k=this.k;ctx.save();ctx.strokeStyle=`rgba(220,239,244,${.11+.18*wet})`;ctx.lineWidth=Math.max(1,1.15*k);for(let i=0;i<n;i++){const phase=(t*(1.4+sea*.7)+i*.173)%1,x=w*(.08+((i*0.271+phase*.22)%1)*.84),y=h*(.78+phase*.18),len=(18+wet*42)*k*(.6+(i%3)*.16);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(i%2?1:-1)*len*.32,y-len*.55,x+(i%2?1:-1)*len*.5,y-len);ctx.stroke();}ctx.restore();
    },

    drawPeriscopeBroachWash(ctx,w,h,state,t){
      const sub=state.playerSub,sea=clamp(state.world.environment?.seaState||0,0,1),depth=sub.depthFeet||0;
      const broachBand=clamp(1-Math.abs(depth-46)/8,0,1);
      const deepBroach=clamp(1-Math.abs(depth-58)/14,0,1);
      const band=Math.max(broachBand,deepBroach);
      const wave=.5+.5*Math.sin(t*(1.05+sea*.55)+depth*.11);
      const vertical=clamp(Math.abs(sub.verticalSpeedFps||0)/2.5,0,1);
      const a=band*(.22+sea*.68)*(wave*.75+vertical*.45);
      if(a<.06)return;
      const k=this.k,n=this.lowSpec?5:9;
      ctx.save();
      const g=ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,`rgba(110,168,188,${.28*a})`);
      g.addColorStop(.35,`rgba(30,78,98,${.16*a})`);
      g.addColorStop(.75,`rgba(18,50,65,${.06*a})`);
      g.addColorStop(1,'rgba(10,35,45,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,w,h*.75);
      ctx.strokeStyle=`rgba(220,242,248,${.24*a})`;
      ctx.lineWidth=Math.max(1,1.3*k);
      for(let i=0;i<n;i++){
        const seed=i*0.173;
        const x=((seed+t*0.045)%1)*w;
        const dripSpeed=1.8+((i%3)*0.6);
        const y=((i*0.281+t*dripSpeed*0.12)%1)*h*0.72;
        const len=(24+i*6)*k;
        ctx.beginPath();
        ctx.moveTo(x,y);
        ctx.quadraticCurveTo(x+(i%2?1:-1)*8*k,y+len*0.5,x+(i%2?2:-2)*k,y+len);
        ctx.stroke();
        ctx.fillStyle=`rgba(235,250,255,${.35*a})`;
        ctx.beginPath();
        ctx.arc(x+(i%2?2:-2)*k,y+len,Math.max(1,1.8*k),0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
};
