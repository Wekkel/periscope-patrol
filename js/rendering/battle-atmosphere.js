const BattleAtmosphere={
    battlePoint(cam,p,z=0){return p?projectWorldPoint(cam,p.xNm*NM_M,-p.yNm*NM_M,z):null;},

    drawBattleAtmosphereBack(ctx,cam,state,dl,t){
      this.drawPortScenes3D(ctx,cam,state,dl);
      this.drawHarborSearchlight3D(ctx,cam,state,dl,t);
      this.drawDistantDamageCues3D(ctx,cam,state,dl,t);
      this.drawSignalLamps3D(ctx,cam,state,dl,t);
    },

    drawPortScenes3D(ctx,cam,state,dl){
      const own=state.playerSub.position,k=this.k,maxFeatures=this.lowSpec?12:24;let drawn=0;
      for(const scene of state.world.portScenes||[]){if(!scene.known||distNm(own,scene.position)>10)continue;const a=degToRad(scene.heading||0),sin=Math.sin(a),cos=Math.cos(a);
        for(const f of scene.features||[]){if(drawn++>=maxFeatures)return;const q={xNm:scene.position.xNm+sin*f.alongNm+cos*f.lateralNm,yNm:scene.position.yNm-cos*f.alongNm+sin*f.lateralNm},p=this.battlePoint(cam,q,0);if(!p)continue;
          const scale=cam.f/Math.max(120,p.d),height=Math.max(1.5,(f.heightM||5)*scale),width=Math.max(1.5,(f.sizeM||12)*scale);
          if(f.kind==='crane'){ctx.strokeStyle=`rgba(145,145,130,${.38+.34*dl})`;ctx.lineWidth=Math.max(1,k);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-height);ctx.lineTo(p.x+width*.65,p.y-height);ctx.stroke();}
          else if(f.kind==='pier'){ctx.strokeStyle='rgba(112,105,84,.58)';ctx.lineWidth=Math.max(1.5,2*k);ctx.beginPath();ctx.moveTo(p.x-width*.45,p.y);ctx.lineTo(p.x+width*.45,p.y);ctx.stroke();}
          else{ctx.fillStyle=f.kind==='tank'?`rgba(154,158,145,${.30+.40*dl})`:`rgba(116,111,94,${.38+.42*dl})`;ctx.fillRect(p.x-width*.45,p.y-height,width*.9,height);}
        }
      }
    },

    drawBattleAtmosphereFront(ctx,cam,state,dl,t){
      const A=state.world.atmosphere;if(!A)return;const now=state.time.elapsedSeconds,k=this.k;
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
      const H=state.world.harbor,now=state.time.elapsedSeconds;if(!H||(H.searchlightActiveUntil||-1)<=now)return;
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

    drawSignalLamps3D(ctx,cam,state,dl,t){
      if(dl>.30)return;const A=state.world.atmosphere,now=state.time.elapsedSeconds;if(!A)return;
      for(const sig of A.signals||[]){if(now<sig.at||now>sig.until)continue;const c=state.world.contacts.find(x=>x.id===sig.fromId&&!x.sunk);if(!c)continue;const age=now-sig.at,blink=(sig.pattern||[]).some(v=>age>=v&&age<v+.11);if(!blink)continue;const p=this.battlePoint(cam,c.position,18);if(!p)continue;const rr=clamp(5*this.k*cam.f/Math.max(p.d,450),1.2*this.k,8*this.k),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*5);g.addColorStop(0,`rgba(235,255,220,${sig.alert?.95:.72})`);g.addColorStop(1,'rgba(190,255,190,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,rr*5,0,Math.PI*2);ctx.fill();}
    },

    drawBridgeDeckSpray(ctx,w,h,state,t){
      const sub=state.playerSub,sea=clamp(state.world.environment?.seaState||0,0,1),spd=clamp((sub.propulsion?.speedKnots||0)/18,0,1),wet=clamp((sea-.38)*1.55,0,1)*clamp((spd-.22)*1.4,0,1);if(wet<.04)return;
      const n=this.lowSpec?5:9,k=this.k;ctx.save();ctx.strokeStyle=`rgba(220,239,244,${.11+.18*wet})`;ctx.lineWidth=Math.max(1,1.15*k);for(let i=0;i<n;i++){const phase=(t*(1.4+sea*.7)+i*.173)%1,x=w*(.08+((i*0.271+phase*.22)%1)*.84),y=h*(.78+phase*.18),len=(18+wet*42)*k*(.6+(i%3)*.16);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+(i%2?1:-1)*len*.32,y-len*.55,x+(i%2?1:-1)*len*.5,y-len);ctx.stroke();}ctx.restore();
    },

    drawPeriscopeBroachWash(ctx,w,h,state,t){
      const sub=state.playerSub,sea=clamp(state.world.environment?.seaState||0,0,1),depth=sub.depthFeet||0,band=clamp(1-Math.abs(depth-58)/14,0,1),wave=.5+.5*Math.sin(t*(1.05+sea*.55)+depth*.11),vertical=clamp(Math.abs(sub.verticalSpeedFps||0)/3,0,1),a=band*(.16+sea*.64)*(wave*.75+vertical*.35);if(a<.08)return;
      const k=this.k,n=this.lowSpec?4:7;ctx.save();const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,`rgba(130,178,194,${.20*a})`);g.addColorStop(.38,`rgba(35,84,104,${.11*a})`);g.addColorStop(1,'rgba(20,55,70,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h*.62);ctx.strokeStyle=`rgba(215,237,242,${.18*a})`;ctx.lineWidth=Math.max(1,1.2*k);for(let i=0;i<n;i++){const x=((i*.173+t*.037)%1)*w,y=((i*.281+t*.11)%1)*h*.58;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+10*k,y+18*k,x+4*k,y+42*k);ctx.stroke();}ctx.restore();
    }
};
