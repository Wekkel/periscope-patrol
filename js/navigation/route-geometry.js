/* ═══════════════════════════════════════════════════ WATER ROUTE GEOMETRY
   Convoys and Fleet intelligence must agree about where a shipping lane is.
   These helpers work in nautical-mile world coordinates and deliberately know
   nothing about rendering. A route may bend round an island; distance along
   the polyline, not a straight chord through the island, is the truth. */
function routeCum(path){
  const c=[0];
  for(let i=1;i<path.length;i++) c.push(c[i-1]+distNm(path[i-1],path[i]));
  return c;
}
function routeProject(path,p){
  if(!path||path.length<2) return{s:0,pos:path?.[0]||p,seg:0};
  const C=routeCum(path);let best=null;
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1],vx=b.xNm-a.xNm,vy=b.yNm-a.yNm;
    const vv=vx*vx+vy*vy||1e-9,wx=p.xNm-a.xNm,wy=p.yNm-a.yNm;
    const t=clamp((wx*vx+wy*vy)/vv,0,1);
    const q={xNm:a.xNm+vx*t,yNm:a.yNm+vy*t};const d=distNm(p,q);
    if(!best||d<best.d) best={d,s:C[i]+Math.sqrt(vv)*t,pos:q,seg:i};
  }
  return best;
}
function routePointAt(path,s){
  if(!path||!path.length) return{pos:{xNm:0,yNm:0},heading:0,s:0};
  if(path.length===1) return{pos:{...path[0]},heading:0,s:0};
  const C=routeCum(path),L=C[C.length-1];s=clamp(s,0,L);
  let i=0;while(i<C.length-2&&C[i+1]<s)i++;
  const a=path[i],b=path[i+1],seg=Math.max(1e-9,C[i+1]-C[i]);
  const t=clamp((s-C[i])/seg,0,1);
  return{pos:{xNm:lerp(a.xNm,b.xNm,t),yNm:lerp(a.yNm,b.yNm,t)},
         heading:bearingBetween(a,b),s};
}
function routeAdvance(path,s,dir,deltaNm){
  if(!path||path.length<2) return{...routePointAt(path,s),dir:dir>=0?1:-1};
  const C=routeCum(path),L=C[C.length-1];if(L<1e-6)return{...routePointAt(path,0),dir:1};
  // Unfold the out-and-back lane to a 2L loop. Signed delta works forwards
  // and backwards in time and naturally reflects at either end of the lane.
  let u=(dir>=0?s:2*L-s)+deltaNm, P=2*L;
  u=((u%P)+P)%P;
  const nd=u<=L?1:-1, ns=u<=L?u:2*L-u;
  const q=routePointAt(path,ns);
  q.dir=nd;q.heading=nd>0?q.heading:normDeg(q.heading+180);return q;
}
/* Mission-critical traffic follows a real one-way voyage, not the generic
   ambient out-and-back loop. At the end it holds on the final charted point;
   that is deliberately boring but fair, and prevents a distant HVT from
   reversing across the whole map while the player is chasing stale intel. */
function routeAdvanceOneWay(path,s,deltaNm){
  if(!path||path.length<2)return{...routePointAt(path,s),dir:1,ended:true};
  const C=routeCum(path),L=C[C.length-1],ns=clamp((Number(s)||0)+Math.max(0,deltaNm||0),0,L),q=routePointAt(path,ns);
  q.dir=1;q.ended=ns>=L-1e-6;return q;
}
function routeTrace(path,s,dir,deltaNm,stepNm=1.0){
  const out=[];const n=Math.max(1,Math.ceil(Math.abs(deltaNm)/Math.max(.2,stepNm)));
  for(let i=0;i<=n;i++) out.push(routeAdvance(path,s,dir,deltaNm*i/n));
  return out;
}

