class HelmGauges{
  constructor(game,touch){
    this.game=game; this.touch=touch; this.views=[]; this.focus=null; this.raf=null;
    const host=document.getElementById('helmGauges');
    if(!host) return;
    this.host=host;
    for(const el of host.querySelectorAll('.hg')){
      const key=el.dataset.g, cv=el.querySelector('canvas');
      const v={key,el,cv,ctx:cv.getContext('2d'),geom:{cx:0,cy:0,R:0},dpr:1,drag:null,pointer:null,flash:0,lastDet:null};
      this.bind(v); this.views.push(v);
      el.querySelector('.hg-t').addEventListener('click',()=>{
        /* Focus shows ONE dial as large as the sheet allows and puts the
           other two away — the point of focusing is the last degree of a
           solution, and for that you want every pixel. Tap the name again
           to bring the bank back. */
        this.focus=this.focus===key?null:key;
        for(const w of this.views) w.el.classList.toggle('focus',w.key===this.focus);
        this.size(); buzz(8);
      },{passive:true});
    }
    window.addEventListener('resize',()=>this.scheduleSize(),{passive:true});
    document.addEventListener('helmshown',()=>this.scheduleSize(true),{passive:true});
    if(window.ResizeObserver){
      this._ro=new ResizeObserver(()=>this.scheduleSize());
      this._ro.observe(host);
    }
    this.size();
  }

  /* ── the dial definitions, read straight off the boat ─────────────── */
  spec(key){
    const s=this.game.getSnapshot(), sub=s.playerSub, p=sub.propulsion;
    const seabed=sub.seabedFeet??3000, crush=sub.damage.crushDepthFeet||420;
    const test=crush*0.73;
    const surf=p.engineMode==='DIESEL', ms=surf?18:8.5;
    const knots=r=>ms*(1-Math.exp(-clamp(r,0,450)/170));
    const noise=r=>{const kn=knots(r);
      return clamp(((r/450)*0.6+Math.pow(kn/18,2)*0.8)*(sub.depthFeet>65?0.85:1),0,1.5);};
    const maxDepth=Math.max(0,Math.min(crush-10,seabed-25));

    if(key==='depth') return {
      key,start:-90,sweep:270,wrap:false,gain:1,
      max:this._dMax||200, unit:'FEET',
      ordered:sub.orderedDepthFeet, actual:sub.depthFeet,
      limit:[0,maxDepth], detents:[0,55,100,150,200,250].filter(d=>d<=maxDepth),
      step:(this._dMax||200)<=230?[10,50]:[25,100],
      send:v=>this.game.dispatch({type:'SET_ORDERED_DEPTH',depthFeet:Math.round(v)}),
      big:sub.depthFeet.toFixed(0), danger:sub.depthFeet>test,
      legend:[(this._dMax||200)<=230?'FINE':'DEEP','FEET'],
      ctx:{seabed,test,crush,maxDepth,scope:55,bottomed:!!sub.bottomed},
      lines:(()=>{
        const gap=sub.orderedDepthFeet-sub.depthFeet, fpm=sub.verticalSpeedFps*60, out=[];
        if(sub.bottomed) out.push(['on the bottom','ok']);
        else if(Math.abs(gap)<1.5) out.push(['steady','dim']);
        else if(Math.abs(fpm)<3) out.push([`${Math.abs(gap).toFixed(0)} ft to go — not answering`,'alert']);
        else out.push([`${fpm>0?'↓':'↑'} ${Math.abs(fpm).toFixed(0)} ft/min · ${Math.abs(gap/sub.verticalSpeedFps).toFixed(0)}s`,'dim']);
        const clr=seabed-sub.depthFeet;
        if(seabed<3000) out.push([`${clr.toFixed(0)} ft under keel`,clr<25?'danger':clr<60?'alert':'dim']);
        return out;})()
    };

    if(key==='course'){
      const tgt=s.tdc.bearing, wp=s.map.plottedCourse.length
        ? bearingBetween(sub.position,s.map.plottedCourse[0]) : null;
      const det=[]; if(tgt!=null)det.push(normDeg(tgt)); if(wp!=null)det.push(normDeg(wp));
      if(tgt!=null)det.push(normDeg(tgt+180));
      return {
        key,start:-90,sweep:360,wrap:true,gain:1/3,max:360,unit:'DEGREES',
        ordered:sub.orderedHeading, actual:sub.heading,
        limit:null, detents:det, soft:[0,45,90,135,180,225,270,315], step:[5,30],
        send:v=>this.game.dispatch({type:'SET_ORDERED_HEADING',heading:normDeg(v)}),
        big:String(Math.round(normDeg(sub.heading))).padStart(3,'0'), danger:false,
        legend:['GYRO','REPEATER'],
        ctx:{tgt,wp,heading:sub.heading},
        lines:(()=>{
          const d=shortDelta(sub.heading,sub.orderedHeading), out=[];   // to − from
          out.push(Math.abs(d)<0.7?['steady on','dim']
            :[`${d>0?'starboard':'port'} ${Math.abs(d).toFixed(0)}° to go`,'alert']);
          if(tgt!=null){const rel=shortDelta(sub.heading,tgt);          // to − from
            out.push([`target ${Math.abs(rel).toFixed(0)}° ${rel>0?'stbd':'port'} ${Math.abs(rel)<=90?'bow':'quarter'}`,
              Math.abs(rel)>90?'danger':'ok']);}
          else if(s.map.autoFollowPlot&&s.map.plottedCourse.length) out.push(['autopilot on the plot','ok']);
          return out;})()
      };
    }

    return {
      key,start:135,sweep:270,wrap:false,gain:1,max:450,unit:'RPM',
      ordered:p.orderedRpm, actual:p.actualRpm,
      limit:[0,450], detents:[0,120,200,250,350,450], step:[25,100],
      bells:[[0,'STOP'],[120,'SLOW'],[200,'2/3'],[250,'STD'],[350,'FULL'],[450,'FLANK']],
      send:v=>this.game.dispatch({type:'SET_ENGINE_RPM',rpm:Math.round(v)}),
      big:p.speedKnots.toFixed(1), danger:false,
      legend:[p.engineMode==='DIESEL'?'DIESEL':'BATTERY','RPM'],
      ctx:{knots,noise,ms,surf,silent:sub.stealth.silentRunning},
      lines:(()=>{
        const out=[[`${p.actualRpm.toFixed(0)} rpm`,'dim']], n=sub.stealth.acousticSignature;
        out.push([`noise ${(n*100).toFixed(0)}% — ${n>0.6?'heard for miles':n>0.35?'audible to an escort':'quiet'}`,
          n>0.6?'danger':n>0.35?'alert':'ok']);
        if(surf) out.push([p.chargeRate>0.0004?`charging · ${Math.round((100-p.battery)/(p.chargeRate*60))} min to full`
                                              :'not charging — screws have the engines',
                           p.chargeRate>0.0004?'ok':'alert']);
        else out.push([`battery ${p.battery.toFixed(0)}%`,p.battery<25?'danger':'dim']);
        return out;})()
    };
  }

  /* Two gauges in one, as the real boat had: a fine dial for shallow work
     and a deep one for everything else. Hysteresis so it cannot flutter,
     and the change slides instead of jumping. `_dMax` was declared in the
     spec and never actually computed — so the dial was stuck on the fine
     scale and anything ordered past 200 ft pinned the needle at the stop
     with nothing to show for further dragging. */
  stepScale(dt){
    const s=this.game.getSnapshot(), sub=s.playerSub;
    const deepest=Math.max(sub.depthFeet,sub.orderedDepthFeet);
    if(this._dFine===undefined) this._dFine=true;
    if(this._dFine&&deepest>150) this._dFine=false;
    if(!this._dFine&&deepest<120) this._dFine=true;
    const seabed=sub.seabedFeet??3000;
    const target=this._dFine?200
      :Math.max(300,Math.ceil((Math.min(seabed,sub.damage.crushDepthFeet||420)+40)/50)*50);
    this._dMax=this._dMax||200;
    this._dMax=this._dMax+(target-this._dMax)*clamp(dt*4.5,0,1);
  }

  /* ── shared mapping ───────────────────────────────────────────────── */
  a2v(G,a){
    const d=normDeg(a-G.start);
    if(G.wrap) return d;
    if(d<=G.sweep) return d/G.sweep*G.max;
    return (d-G.sweep)<(360-d)?G.max:0;         // dead sector: nearer end
  }
  v2a(G,v){ return G.start+G.sweep*(G.wrap?normDeg(v)/360:clamp(v,0,G.max)/G.max); }

  order(v,G,val,snap=true){
    if(G.limit) val=clamp(val,G.limit[0],G.limit[1]);
    if(snap){
      const tol=G.wrap?2.4:G.max/60;
      /* A detent you are already sitting in holds a little wider than one you
         are approaching — otherwise the needle chatters on the boundary. */
      for(const [list,t] of [[G.detents||[],tol],[G.soft||[],tol*0.75]]){
        for(const d of list){
          if(G.limit&&(d<G.limit[0]||d>G.limit[1])) continue;
          const off=G.wrap?Math.abs(shortDelta(val,d)):Math.abs(val-d);
          const held=v.lastDet===d?t*1.45:t;
          if(off<held){
            if(v.lastDet!==d){ buzz(12); v.flash=1; v.lastDet=d; }
            G.send(d); return d;
          }
        }
      }
      v.lastDet=null;
    }
    G.send(val); return val;
  }

  /* One angular step of a face drag. Pulled out of the event handler so a
     test can drive it: the sign error above lived here for two rounds
     precisely because the tests all called order() directly and never went
     through the gesture. */
  relStep(v,G,dialDeg){
    const stepU=dialDeg/G.sweep*G.max*G.gain;
    v.drag.acc=G.wrap?normDeg(v.drag.acc+stepU)
                     :clamp(v.drag.acc+stepU,...(G.limit||[0,G.max]));
    this.order(v,G,v.drag.acc);
    return v.drag.acc;
  }

  bind(v){
    const local=e=>{const r=v.cv.getBoundingClientRect();
      return{x:(e.clientX-r.left)*(v.cv.width/v.dpr)/r.width,
             y:(e.clientY-r.top )*(v.cv.height/v.dpr)/r.height};};
    const ang=p=>Math.atan2(p.y-v.geom.cy,p.x-v.geom.cx)*180/Math.PI;
    v.cv.addEventListener('pointerdown',e=>{
      const G=this.spec(v.key), p=local(e);
      const r=Math.hypot(p.x-v.geom.cx,p.y-v.geom.cy);
      if(r>v.geom.R*1.12) return;
      v.cv.setPointerCapture(e.pointerId); v.pointer=p;
      if(r>v.geom.R*0.78){ v.drag={mode:'abs'}; this.order(v,G,this.a2v(G,ang(p))); }
      else v.drag={mode:'rel',lastAng:ang(p),acc:G.ordered};
      this.chipShow(this.spec(v.key),e.clientY);
      e.preventDefault(); e.stopPropagation();
    },{passive:false});
    v.cv.addEventListener('pointermove',e=>{
      if(!v.drag) return;
      const G=this.spec(v.key), p=local(e); v.pointer=p;
      if(v.drag.mode==='abs') this.order(v,G,this.a2v(G,ang(p)));
      else{
        /* shortDelta(from,to) returns to − from. Written the other way round
           this negated the finger's travel: dragging the natural way pushed
           the value DOWN into the clamp at zero and the needle sat still,
           and it only answered when the thumb went round backwards. */
        const a=ang(p), d=shortDelta(v.drag.lastAng,a);
        v.drag.lastAng=a;
        /* THE ACCUMULATOR MUST STAY RAW.
           This used to read `acc = this.order(...)`, which writes the SNAPPED
           value back. The consequence: once the needle caught a detent, every
           following frame started again from the detent, and a frame of a
           normal swipe moves about 2 ft against a 3.3 ft detent window — so
           the value could never climb out. The thumb kept sliding, the phone
           kept buzzing, and the needle sat still. Keep the true value here;
           snap only on the way out to the boat. */
        this.relStep(v,G,d);
      }
      this.chipShow(this.spec(v.key),e.clientY);
      e.preventDefault(); e.stopPropagation();
    },{passive:false});
    const end=()=>{v.drag=null;v.pointer=null;v.lastDet=null;this.chipHide();};
    v.cv.addEventListener('pointerup',end);
    v.cv.addEventListener('pointercancel',end);
  }

  /* ── FIT THE DIALS TO WIDTH, NOT TO A MOVING MOBILE VIEWPORT ────────
     #tSheetBody scrolls vertically, so height is not a scarce resource here.
     Measuring visualViewport height while browser chrome / PWA chrome is in
     motion created a race: one transient short measurement wrote tiny fixed
     canvas sizes and they could survive after the viewport recovered.

     Portrait therefore has a stable two-column bank with the third dial below;
     landscape uses three columns. A focused dial gets the full bank width.
     The controls below simply scroll, which is both predictable and usable. */
  scheduleSize(doubleFrame=false){
    if(this._sizeRaf) cancelAnimationFrame(this._sizeRaf);
    const run=()=>{this._sizeRaf=0;this.size();};
    this._sizeRaf=requestAnimationFrame(doubleFrame?()=>requestAnimationFrame(run):run);
  }

  size(){
    if(!this.host) return;
    const W=this.host.clientWidth;
    if(!W) return;                                   // pane is hidden: leave it alone
    const GAP=6;
    const touch=document.documentElement.dataset.lay==='touch';
    const portrait=window.matchMedia?window.matchMedia('(orientation: portrait)').matches:(innerHeight>=innerWidth);
    const vis=this.views.filter(v=>!this.focus||v.key===this.focus);
    const n=Math.max(1,vis.length);
    const cols=this.focus?1:(touch?(portrait?Math.min(2,n):Math.min(3,n)):Math.min(3,n));
    const raw=(W-GAP*(cols-1))/cols;
    // On a very narrow phone the physical width can be below the preferred
    // 152 px floor; never overflow the bank just to satisfy the preference.
    const floor=Math.min(152,raw);
    const S=Math.round(clamp(raw,floor,320));

    for(const v of this.views){
      const shown=!this.focus||v.key===this.focus;
      v.el.style.display=shown?'':'none';
      if(!shown) continue;
      v.el.style.flex=`0 0 ${S}px`;
      v.el.style.width=S+'px';
      v.el.style.maxWidth=S+'px';
      v.dpr=Math.min(window.devicePixelRatio||1,2.5);
      v.cv.style.width=S+'px'; v.cv.style.height=S+'px';
      v.cv.width=Math.floor(S*v.dpr); v.cv.height=Math.floor(S*v.dpr);
      v.ctx.setTransform(v.dpr,0,0,v.dpr,0,0);
      v.geom={cx:S/2,cy:S/2,R:S*0.44};
    }
    this._lastFit={W,S,cols};
  }

  /* ── drawing ──────────────────────────────────────────────────────── */
  draw(v,dt){
    const G=this.spec(v.key), {ctx,geom}=v, {cx,cy,R}=geom;
    /* Three tiers, not one cliff. At 165 px — what a phone in portrait
       actually gives us — the dial must still show its scale, or it is a
       picture of an instrument rather than an instrument. */
    const tiny=R<52, small=R<72, F=small?0.9:1;
    v.flash=Math.max(0,v.flash-dt*2.2);
    ctx.clearRect(0,0,v.cv.width,v.cv.height);
    const bg=ctx.createRadialGradient(cx,cy-R*0.3,R*0.1,cx,cy,R);
    bg.addColorStop(0,'#0d2029'); bg.addColorStop(1,'#050f13');
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fill();
    ctx.strokeStyle='#2f5f56'; ctx.lineWidth=Math.max(2,R*0.02);
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();

    const rOut=R*0.90, rIn=R*0.70, A=val=>degToRad(this.v2a(G,val));
    const arc=(v0,v1,r0,r1)=>{ctx.beginPath();ctx.arc(cx,cy,r1,A(v0),A(v1));
      ctx.arc(cx,cy,r0,A(v1),A(v0),true);ctx.closePath();};

    if(G.key==='depth'){
      const C=G.ctx;
      if(C.seabed<G.max){
        ctx.save(); arc(C.seabed,G.max,rIn*0.86,rOut); ctx.clip();
        ctx.fillStyle='rgba(70,58,40,.42)'; ctx.fillRect(cx-R,cy-R,R*2,R*2);
        ctx.strokeStyle='rgba(190,160,110,.30)'; ctx.lineWidth=1.4;
        for(let i=-2*R;i<2*R;i+=Math.max(5,R*0.05)){
          ctx.beginPath();ctx.moveTo(cx-R+i,cy-R);ctx.lineTo(cx-R+i+R*2,cy+R);ctx.stroke();}
        ctx.restore();
        if(C.maxDepth<G.max){arc(C.maxDepth,Math.min(C.seabed,G.max),rIn*0.86,rOut);
          ctx.fillStyle='rgba(245,198,92,.13)';ctx.fill();}
      }
      if(C.test<G.max){arc(C.test,G.max,rOut*0.965,rOut);
        ctx.fillStyle='rgba(239,106,88,.75)';ctx.fill();}
      const a=A(C.scope);
      ctx.strokeStyle='rgba(111,224,143,.85)';ctx.lineWidth=Math.max(2,R*0.018);
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*rIn*0.86,cy+Math.sin(a)*rIn*0.86);
      ctx.lineTo(cx+Math.cos(a)*rOut,cy+Math.sin(a)*rOut);ctx.stroke();
    }

    if(G.key==='course'){
      const C=G.ctx;
      ctx.save(); arc(normDeg(C.heading-90),normDeg(C.heading+90),rIn*0.55,rIn*0.86);
      ctx.fillStyle='rgba(111,224,143,.07)'; ctx.fill(); ctx.restore();
      const d=shortDelta(G.actual,G.ordered);                          // to − from
      if(Math.abs(d)>0.7){
        ctx.beginPath();ctx.arc(cx,cy,rIn*0.94,A(G.actual),A(G.ordered),d<0);
        ctx.strokeStyle='rgba(245,198,92,.55)';ctx.lineWidth=Math.max(3,R*0.045);ctx.stroke();
      }
      for(const [brg,col,txt] of [[C.tgt,'#ef6a58','T'],[C.wp,'#7fbcff','W']]){
        if(brg==null) continue;
        const a=A(brg); ctx.fillStyle=col;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*rOut,cy+Math.sin(a)*rOut);
        ctx.lineTo(cx+Math.cos(a+0.05)*(rOut+R*0.075),cy+Math.sin(a+0.05)*(rOut+R*0.075));
        ctx.lineTo(cx+Math.cos(a-0.05)*(rOut+R*0.075),cy+Math.sin(a-0.05)*(rOut+R*0.075));
        ctx.closePath();ctx.fill();
        if(!tiny){ctx.font=this.fnt(R*0.075,true);ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(txt,cx+Math.cos(a)*(rOut+R*0.14),cy+Math.sin(a)*(rOut+R*0.14));}
      }
    }

    if(G.key==='power'){
      const C=G.ctx;
      let rAud=null,rLoud=null;
      for(let r=0;r<=450;r+=5){const n=C.noise(r);
        if(rAud===null&&n>0.35)rAud=r; if(rLoud===null&&n>0.60)rLoud=r;}
      if(rAud!==null){arc(rAud,rLoud??450,rOut*0.93,rOut);ctx.fillStyle='rgba(245,198,92,.55)';ctx.fill();}
      if(rLoud!==null){arc(rLoud,450,rOut*0.93,rOut);ctx.fillStyle='rgba(239,106,88,.72)';ctx.fill();}
      if(C.surf){
        let rStop=450;
        for(let r=0;r<=450;r+=5){ if(clamp(1-Math.pow(r/450,2)*1.15,0,1)<0.05){rStop=r;break;} }
        arc(0,rStop,rIn*0.72,rIn*0.80);ctx.fillStyle='rgba(111,224,143,.30)';ctx.fill();
      }
      const NORM=1-Math.exp(-450/170);
      for(let k=2;k<=Math.floor(C.ms);k+=2){
        const r=-170*Math.log(1-(k/C.ms)*NORM);
        if(!isFinite(r)||r>450) continue;
        const a=A(r);
        ctx.strokeStyle='rgba(143,179,168,.55)';ctx.lineWidth=Math.max(1,R*0.007);
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*rIn*0.62,cy+Math.sin(a)*rIn*0.62);
        ctx.lineTo(cx+Math.cos(a)*rIn*0.72,cy+Math.sin(a)*rIn*0.72);ctx.stroke();
        if(!tiny&&k%4===0){ctx.fillStyle='rgba(143,179,168,.75)';ctx.font=this.fnt(R*0.062);
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(String(k),cx+Math.cos(a)*rIn*0.54,cy+Math.sin(a)*rIn*0.54);}
      }
      for(const [r,name] of G.bells){
        const a=A(r);
        ctx.strokeStyle='rgba(223,238,232,.75)';ctx.lineWidth=Math.max(1.6,R*0.013);
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*rOut,cy+Math.sin(a)*rOut);
        ctx.lineTo(cx+Math.cos(a)*(rOut-R*0.10),cy+Math.sin(a)*(rOut-R*0.10));ctx.stroke();
        if(!tiny){ctx.fillStyle='rgba(223,238,232,.8)';ctx.font=this.fnt(R*0.068);
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(name,cx+Math.cos(a)*(rOut-R*0.185),cy+Math.sin(a)*(rOut-R*0.185));}
      }
    }

    const [st,maj]=G.step, top=G.wrap?360-st*0.5:G.max;
    for(let val=0;val<=top+1e-6;val+=st){
      const a=A(val), isM=Math.abs(val%maj)<1e-6, len=isM?R*0.115:R*0.055;
      ctx.strokeStyle=(G.key==='depth'&&val>=G.ctx.test)?'rgba(239,106,88,.9)'
        :isM?'rgba(223,238,232,.85)':'rgba(143,179,168,.42)';
      ctx.lineWidth=isM?Math.max(1.6,R*0.012):Math.max(1,R*0.006);
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*rOut,cy+Math.sin(a)*rOut);
      ctx.lineTo(cx+Math.cos(a)*(rOut-len),cy+Math.sin(a)*(rOut-len));ctx.stroke();
      if(isM&&G.key!=='power'&&!tiny){
        const rr=rOut-len-R*0.085;
        ctx.fillStyle='rgba(223,238,232,.78)';ctx.font=this.fnt(R*0.085*F);
        ctx.textAlign='center';ctx.textBaseline='middle';
        const t=G.wrap?(val===0?'N':val===90?'E':val===180?'S':val===270?'W':String(val)):String(Math.round(val));
        ctx.fillText(t,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);
      }
    }

    if(!small){
      ctx.fillStyle='rgba(92,125,116,.9)';ctx.font=this.fnt(R*0.072);
      ctx.textAlign='center';ctx.textBaseline='middle';
      const lx=G.wrap?cx:cx-R*0.45, ly=G.wrap?cy-R*0.44:cy-R*0.45;
      ctx.fillText(G.legend[0],lx,ly);ctx.fillText(G.legend[1],lx,ly+R*0.10);
    }

    {const a=A(G.ordered);
     ctx.save();ctx.translate(cx,cy);ctx.rotate(a);
     ctx.fillStyle='rgba(245,198,92,.95)';
     ctx.beginPath();
     ctx.moveTo(rOut*0.99,0);ctx.lineTo(rOut*0.86,-R*0.030);
     ctx.lineTo(R*0.10,-R*0.012);ctx.lineTo(R*0.10,R*0.012);
     ctx.lineTo(rOut*0.86,R*0.030);ctx.closePath();ctx.fill();ctx.restore();
     ctx.fillStyle='#f5c65c';
     ctx.beginPath();ctx.arc(cx+Math.cos(a)*R*0.955,cy+Math.sin(a)*R*0.955,Math.max(3,R*0.028),0,7);ctx.fill();}

    {const a=A(G.actual);
     ctx.save();ctx.translate(cx,cy);ctx.rotate(a);
     ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=R*0.05;ctx.shadowOffsetY=R*0.012;
     ctx.fillStyle=G.danger?'#ef6a58':'#dfeee8';
     ctx.beginPath();
     ctx.moveTo(rOut*0.93,0);ctx.lineTo(rOut*0.74,-R*0.055);
     ctx.lineTo(-R*0.16,-R*0.026);ctx.lineTo(-R*0.16,R*0.026);
     ctx.lineTo(rOut*0.74,R*0.055);ctx.closePath();ctx.fill();ctx.restore();}
    ctx.fillStyle='#0a1a20';ctx.beginPath();ctx.arc(cx,cy,R*0.085,0,7);ctx.fill();
    ctx.strokeStyle='rgba(143,179,168,.5)';ctx.lineWidth=1.5;ctx.stroke();

    const low=v.pointer&&v.pointer.y>cy, ty=low?cy-R*0.30:cy+R*0.30;
    ctx.textAlign='center';ctx.textBaseline='alphabetic';
    ctx.fillStyle=G.danger?'#ef6a58':'#dfeee8';
    ctx.font=this.fnt(R*0.30*F,true);
    ctx.fillText(G.big,cx,ty);
    ctx.font=this.fnt(R*0.095*F);ctx.fillStyle='rgba(143,179,168,.85)';
    ctx.fillText(G.key==='power'?'KNOTS':G.unit,cx,ty+R*0.11);
    if(!tiny){
      const cols={dim:'rgba(143,179,168,.9)',alert:'#f5c65c',danger:'#ef6a58',ok:'#6fe08f'};
      ctx.font=this.fnt(Math.max(8.5,R*0.082));
      // a small dial gets the one line that matters most; a big one gets all
      const lines=small?G.lines.slice(0,1):G.lines;
      lines.forEach((l,i)=>{ctx.fillStyle=cols[l[1]]||cols.dim;
        ctx.fillText(l[0],cx,ty+R*(0.245+i*0.115));});
    }

    if(v.flash>0){
      const a=A(G.ordered);
      ctx.strokeStyle=`rgba(111,224,143,${v.flash*0.9})`;ctx.lineWidth=Math.max(2,R*0.03);
      ctx.beginPath();ctx.arc(cx,cy,R*0.955,a-0.06,a+0.06);ctx.stroke();
    }
  }
  fnt(px,bold){ return `${bold?'bold ':''}${Math.round(px)}px ui-monospace,"SF Mono",Menlo,monospace`; }

  /* ── THE VALUE YOU ARE SETTING ─────────────────────────────────────
     It used to be drawn on the dial a short way above the touch point,
     which on a 170 px gauge is directly under the fingertip — you could
     not read the number you were setting. It now lives outside the canvas
     altogether, pinned to the top or the bottom of the screen depending on
     which half your hand is in. The finger cannot be in both. */
  chipShow(G,clientY){
    let el=document.getElementById('hgChip');
    if(!el){
      el=document.createElement('div');
      el.id='hgChip';
      document.body.appendChild(el);
    }
    const label=G.key==='course'?'COURSE':G.key==='depth'?'DEPTH':'ENGINE';
    const val=G.wrap?String(Math.round(G.ordered)).padStart(3,'0')+'°'
                    :G.key==='power'?Math.round(G.ordered)+' rpm'
                    :Math.round(G.ordered)+' ft';
    el.innerHTML=`<span>ORDER ${label}</span><b>${val}</b>`;
    const h=(typeof innerHeight==='number'?innerHeight:800);
    el.classList.toggle('low',clientY<h*0.45);       // hand high → chip low
    el.classList.add('on');
  }
  chipHide(){ document.getElementById('hgChip')?.classList.remove('on'); }

  /* Only run while the helm is actually on screen: a needle wants 60 Hz,
     and 60 Hz of canvas nobody is looking at is 60 Hz of battery. */
  visible(){
    const el=document.getElementById('paneHelm');
    if(!el||!this.host) return false;
    if(document.hidden) return false;
    return !!(el.offsetParent!==null&&this.host.clientWidth>0);
  }
  start(){
    if(this.raf||!this.host) return;
    let last=performance.now(), lastKey='';
    const loop=now=>{
      const dt=Math.min((now-last)/1000,0.1); last=now;
      if(this.visible()){
        const body=document.getElementById('tSheetBody');
        const key=`${this.host.clientWidth}x${(body&&body.clientHeight)||0}x${this.focus||''}`;
        if(key!==lastKey){ lastKey=key; this.size(); }
        this.stepScale(dt);
        for(const v of this.views) this.draw(v,dt);
      }
      this.raf=requestAnimationFrame(loop);
    };
    this.raf=requestAnimationFrame(loop);
  }
}

