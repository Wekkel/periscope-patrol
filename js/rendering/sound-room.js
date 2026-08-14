// ═══════════════════════════════════════════════════ SOUND ROOM + SJ PLOT
// One lightweight instrument canvas.  PASSIVE is the default; RADAR is simply
// another page on the same station, not a second station or render engine.
class CanvasViewSound extends CanvasViewBridge {
  drawSound(ctx,w,h,state){
    const radar=state.tactical.soundDisplay==='RADAR';
    ctx.fillStyle='#02090b';ctx.fillRect(0,0,w,h);
    if(radar)this.drawSJPlot(ctx,w,h,state);else this.drawHydrophone(ctx,w,h,state);
  }

  drawHydrophone(ctx,w,h,state){
    const k=this.k,T=state.tactical,S=state.world.sound||{},sig=soundSignalAt(state,T.soundBearing),cx=w/2,cy=this.portrait?h*.43:h*.49;
    const r=Math.min(w*(this.portrait?.38:.30),h*(this.portrait?.27:.36),210*k);
    this.soundGeom={cx,cy,r};
    // Bakelite receiver / bearing dial.
    ctx.fillStyle='rgba(7,22,25,.96)';ctx.beginPath();ctx.arc(cx,cy,r*1.08,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(88,139,124,.65)';ctx.lineWidth=Math.max(1,1.4*k);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    for(let d=0;d<360;d+=10){const a=degToRad(d),maj=d%30===0,rr=r*(maj?.88:.93);ctx.strokeStyle=maj?'rgba(205,236,220,.68)':'rgba(113,153,141,.34)';ctx.lineWidth=maj?1.5*k:k;ctx.beginPath();ctx.moveTo(cx+Math.sin(a)*rr,cy-Math.cos(a)*rr);ctx.lineTo(cx+Math.sin(a)*r,cy-Math.cos(a)*r);ctx.stroke();if(maj){ctx.fillStyle='rgba(205,236,220,.72)';ctx.font=this.fnt(7.2,true);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(d).padStart(3,'0'),cx+Math.sin(a)*r*.76,cy-Math.cos(a)*r*.76);}}
    // A transmitted QC pulse is visible only as a short, directional wave on
    // the operator's trained bearing. It communicates the action without
    // fabricating an echo or painting a target position.
    if(S.qcVisual){
      const wallNow=typeof performance!=='undefined'?performance.now():Date.now(),age=(wallNow-(S.qcVisual.wallAt||wallNow))/1000;
      if(age>=0&&age<1.65){
        const qa=degToRad(S.qcVisual.bearing||0),fade=1-age/1.65;
        ctx.save();ctx.strokeStyle=`rgba(239,106,88,${(.16+.34*fade).toFixed(3)})`;ctx.lineWidth=Math.max(1,1.7*k);
        for(let i=0;i<3;i++){
          const phase=(age/1.65+i/3)%1,rr=r*(.16+.78*phase),spread=degToRad(11+phase*7);
          ctx.beginPath();ctx.arc(cx,cy,rr,qa-Math.PI/2-spread,qa-Math.PI/2+spread);ctx.stroke();
        }
        ctx.restore();
      }
    }
    const a=degToRad(T.soundBearing||0);ctx.strokeStyle='#f5c65c';ctx.lineWidth=Math.max(2,2.4*k);ctx.beginPath();ctx.moveTo(cx-Math.sin(a)*r*.12,cy+Math.cos(a)*r*.12);ctx.lineTo(cx+Math.sin(a)*r*.92,cy-Math.cos(a)*r*.92);ctx.stroke();
    ctx.fillStyle='#f5c65c';ctx.beginPath();ctx.arc(cx,cy,4.5*k,0,Math.PI*2);ctx.fill();

    // Headphones and signal meter: intentionally simple and readable on phones.
    const hx=cx,hy=cy+r*1.24;ctx.strokeStyle='rgba(190,218,205,.72)';ctx.lineWidth=Math.max(2,2*k);ctx.beginPath();ctx.arc(hx,hy,22*k,Math.PI,Math.PI*2);ctx.stroke();ctx.strokeRect(hx-25*k,hy-2*k,7*k,15*k);ctx.strokeRect(hx+18*k,hy-2*k,7*k,15*k);
    const meterW=Math.min(w*.58,280*k),mx=cx-meterW/2;
    /* On short touch screens the SND button strip occupies the lower edge of
       the canvas. Reserve its measured top edge so the signal-strength bar
       moves upward when necessary instead of disappearing underneath Train,
       Mark, Radar or Echo. */
    const canvasRect=this.canvas?.getBoundingClientRect?.(),controls=document.getElementById('soundControls'),controlRect=controls?.getBoundingClientRect?.();
    const controlTop=canvasRect&&controlRect&&controlRect.width>0?controlRect.top-canvasRect.top:Infinity;
    const meterCeiling=Number.isFinite(controlTop)?controlTop-14*k:Infinity;
    const my=Math.min(h-54*k,hy+28*k,meterCeiling-10*k);
    ctx.strokeStyle='rgba(70,115,103,.8)';ctx.strokeRect(mx,my,meterW,10*k);ctx.fillStyle=sig.strength>.35?'#6fe08f':sig.strength>.13?'#f5c65c':'#315c54';ctx.fillRect(mx+1,my+1,(meterW-2)*clamp(sig.strength*1.8,0,1),8*k);

    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#d7f5e7';ctx.font=this.fnt(10,true);ctx.fillText('SOUND ROOM — PASSIVE LISTENING',12*k,22*k);
    ctx.font=this.fnt(8.4);ctx.fillStyle='rgba(205,233,220,.78)';ctx.fillText(`TRAIN ${fmtDeg(T.soundBearing)} · OWN SPEED ${state.playerSub.propulsion.speedKnots.toFixed(1)} kn · LISTEN ${Math.round(soundOwnNoiseFactor(state)*100)}%`,12*k,39*k);
    const line=sig.contact&&sig.strength>.035?`SCREWS ${sig.offsetDeg<3?'CENTRED':sig.offsetDeg<12?'BUILDING':'FAINT'} · signal ${Math.round(sig.strength*100)}%`:'NO DISTINCT SCREWS ON THIS BEARING';
    ctx.fillStyle=sig.strength>.10?'#f5c65c':'#71988c';ctx.font=this.fnt(9,true);ctx.textAlign='center';ctx.fillText(line,cx,Math.min(h-20*k,my+31*k));
    if(state.playerSub.propulsion.speedKnots>7){ctx.fillStyle='rgba(239,106,88,.86)';ctx.font=this.fnt(8.5,true);ctx.fillText('OWN SCREW NOISE MASKING CONTACTS — SLOW OR STOP TO LISTEN',cx,Math.min(h-7*k,my+47*k));}
    ctx.textAlign='left';
  }

  drawSJPlot(ctx,w,h,state){
    const k=this.k,R=state.world.radar||{},T=state.tactical,cx=w/2,cy=this.portrait?h*.44:h*.50,r=Math.min(w*(this.portrait?.39:.32),h*(this.portrait?.30:.40),220*k),range=R.sjRangeNm||8;
    ctx.fillStyle='#001109';ctx.beginPath();ctx.arc(cx,cy,r*1.04,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(99,220,137,.68)';ctx.lineWidth=Math.max(1,1.3*k);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    for(let n=1;n<=4;n++){ctx.strokeStyle='rgba(81,171,111,.25)';ctx.lineWidth=k;ctx.beginPath();ctx.arc(cx,cy,r*n/4,0,Math.PI*2);ctx.stroke();}
    for(let d=0;d<360;d+=45){const a=degToRad(d);ctx.strokeStyle='rgba(81,171,111,.18)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(a)*r,cy-Math.cos(a)*r);ctx.stroke();}
    const fit=R.fitLabel||'NO RADAR FIT',usable=!!R.sjAvailable&&state.playerSub.depthFeet<=(R.sjRadarDepthFt||12);
    if(usable){
      const sweep=degToRad((state.time.elapsedSeconds*42)%360);ctx.strokeStyle='rgba(116,255,154,.42)';ctx.lineWidth=Math.max(1,1.5*k);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(sweep)*r,cy-Math.cos(sweep)*r);ctx.stroke();
      for(const b of Object.values(R.sjTracks||{})){
        if(b.rangeNm>range)continue;const a=degToRad(shortDelta(state.playerSub.heading,b.bearing)),rr=b.rangeNm/range*r,x=cx+Math.sin(a)*rr,y=cy-Math.cos(a)*rr;
        ctx.fillStyle=`rgba(132,255,166,${clamp(.42+(b.strength||0)*.58,.4,1)})`;ctx.beginPath();ctx.arc(x,y,Math.max(2.2*k,3),0,Math.PI*2);ctx.fill();
      }
    }
    ctx.fillStyle='#a6f3b8';ctx.font=this.fnt(10,true);ctx.fillText(`SJ SURFACE-SEARCH RADAR — ${range.toFixed(1)} NM`,12*k,22*k);ctx.font=this.fnt(8.2);ctx.fillStyle='rgba(158,220,174,.75)';ctx.fillText(`${fit} · heading-up plot · ${usable?'SCANNING':'STANDBY'}`,12*k,39*k);
    if(!R.sjAvailable){ctx.fillStyle='#f5c65c';ctx.font=this.fnt(12,true);ctx.textAlign='center';ctx.fillText('SJ NOT FITTED ON THIS PATROL DATE',cx,cy);ctx.textAlign='left';}
    else if(!usable){ctx.fillStyle='#f5c65c';ctx.font=this.fnt(11,true);ctx.textAlign='center';ctx.fillText(`SJ MAST BELOW WATER — usable to ${R.sjRadarDepthFt||12} ft`,cx,cy);ctx.textAlign='left';}
    ctx.fillStyle='rgba(166,243,184,.74)';ctx.font=this.fnt(7.5);ctx.textAlign='center';for(let n=1;n<=4;n++)ctx.fillText(`${(range*n/4).toFixed(range<7?1:0)}`,cx+3*k,cy-r*n/4+10*k);ctx.textAlign='left';
  }
}
