/* Pure camera and optical geometry. No canvas, DOM or renderer state. */
function phaseSmooth01(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function dayPhaseRgb(dl,night,twilight,day){
  if(dl<=.36){const q=phaseSmooth01((dl-.04)/.32);return night.map((v,i)=>Math.round(lerp(v,twilight[i],q)));}
  const q=phaseSmooth01((dl-.36)/.30);return twilight.map((v,i)=>Math.round(lerp(v,day[i],q)));
}
function rgbCss(a){return `rgb(${a[0]},${a[1]},${a[2]})`;}

function setupViewCamera(state,fovDeg,cx,cy,r,opts={}){
  const sub=state.playerSub;
  const camH=opts.heightM??(sub.depthFeet<8?6.5:clamp(1.8-(sub.depthFeet-45)*.06,.35,1.9));
  return makeWorldCamera(state,{position:opts.position||sub.position,heightM:camH,
    bearingDeg:opts.bearingDeg??state.tactical.periscopeBearing,fovDeg,cx,cy,r,
    viewW:opts.viewW,viewH:opts.viewH,kind:opts.kind||'PERISCOPE'});
}

function projectWorldPoint(cam,E,N,Y){
  const dE=E-cam.E,dN=N-cam.N;
  const fwd=dE*cam.sin+dN*cam.cos;
  const rgt=dE*cam.cos-dN*cam.sin;
  if(fwd<3)return null;
  return{x:cam.cx+rgt/fwd*cam.f,y:cam.cy+((cam.h-Y)/fwd+fwd/(2*EARTH_R))*cam.f,d:fwd};
}

function seaSurfaceY(cam,d){return cam.cy+(cam.h/d+d/(2*EARTH_R))*cam.f;}

function projectAzimuthElevation(cam,azDeg,elRad){
  const rel=degToRad(shortDelta(radToDeg(Math.atan2(cam.sin,cam.cos)),azDeg));
  if(Math.abs(rel)>cam.halfFov*2.4)return null;
  return{x:cam.cx+Math.tan(rel)*cam.f,y:cam.horizonY-Math.tan(elRad)*cam.f};
}
