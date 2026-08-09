// ═══════════════════════════════════════════════════ CANVAS VIEW
// ═══════════════════════════════════════════════════ 3D PERISCOPE DATA
const NM_M=1852, EARTH_R=6371000;

// Rudder and engine limits. A Fubuki-class destroyer needed roughly 90 s for a
// full circle at speed; a loaded freighter far longer.
const SHIP_TURN_RATE={ESCORT:3.4,MERCHANT:1.2,TANKER:0.85,TROOP:1.0};
const SHIP_ACCEL={ESCORT:0.30,MERCHANT:0.10,TANKER:0.07,TROOP:0.09};
// Angular acceleration prevents a ship from snapping instantly to full rudder.
// Values are intentionally modest: enough inertia to read on MAP/3-D without
// making convoy station-keeping or ASW responses sluggish.
const SHIP_TURN_ACCEL={ESCORT:2.8,MERCHANT:0.75,TANKER:0.52,TROOP:0.64};
// WWII echo-ranging gear
const SONAR={
  maxRangeNm:1.5,        // useful echo-ranging range
  deadZoneNm:0.16,       // beam cannot depress: contact is lost on the run-in
  patternSize:7,         // charges per attack
  sinkFps:8.5            // depth-charge sink rate
};

// Historic fleet-boat attack scope: 1.5× search power, 6× attack power.
const SCOPE_OPTICS=[
  {mag:1.5,fov:32,label:'1.5×',name:'LOW POWER'},
  {mag:6,  fov:8, label:'6×',  name:'HIGH POWER'}
];

/* Ship models. Local axes: x = starboard, y = up from the waterline, z = forward.
   hull = [zFraction of length, half-beam as a fraction of beam/2]  */
const SHIP_MODELS={
  MERCHANT:{
    len:118,beam:16,fb:7.2,
    hull:[[-0.50,0.34],[-0.44,0.68],[-0.34,0.90],[-0.15,1.00],[0.10,1.00],
          [0.28,0.94],[0.40,0.72],[0.47,0.40],[0.50,0.05]],
    parts:[
      {t:'b',x:0,y:7.2,z:-44,w:13,h:4.5,d:20,c:'house',big:1},
      {t:'b',x:0,y:7.2,z:-4,w:13.5,h:7.5,d:22,c:'house',big:1},
      {t:'b',x:0,y:14.7,z:0,w:11,h:4,d:11,c:'house',big:1},
      {t:'b',x:0,y:18.7,z:1,w:8,h:3,d:7,c:'top'},
      {t:'f',x:0,y:18.7,z:-9,r:2.6,h:11,c:'funnel',rake:0.10,big:1},
      {t:'b',x:0,y:7.2,z:46,w:11,h:4,d:14,c:'house'},
      {t:'b',x:0,y:7.2,z:30,w:9,h:1.6,d:11,c:'dark'},
      {t:'b',x:0,y:7.2,z:16,w:9,h:1.6,d:11,c:'dark'},
      {t:'b',x:0,y:7.2,z:-24,w:9,h:1.6,d:11,c:'dark'}
    ],
    masts:[{x:0,y:7.2,z:26,h:26,yard:8},{x:0,y:7.2,z:-28,h:24,yard:7}],
    smoke:{x:0,y:30,z:-9}
  },
  TANKER:{
    len:152,beam:19.5,fb:6,
    hull:[[-0.50,0.36],[-0.44,0.72],[-0.32,0.94],[-0.10,1.00],[0.14,1.00],
          [0.30,0.95],[0.42,0.74],[0.48,0.36],[0.50,0.04]],
    parts:[
      {t:'b',x:0,y:6,z:-56,w:16,h:9,d:20,c:'house',big:1},
      {t:'b',x:0,y:15,z:-52,w:13,h:4,d:12,c:'house',big:1},
      {t:'b',x:0,y:19,z:-51,w:9,h:2.6,d:7,c:'top'},
      {t:'f',x:0,y:15,z:-64,r:2.9,h:12,c:'funnel',rake:0.08,big:1},
      {t:'b',x:0,y:6,z:2,w:9,h:3.4,d:12,c:'dark',big:1},
      {t:'b',x:0,y:8.5,z:-20,w:2.2,h:0.7,d:70,c:'dark'},
      {t:'b',x:0,y:6,z:62,w:12,h:3.6,d:12,c:'house'}
    ],
    masts:[{x:0,y:6,z:40,h:18},{x:0,y:15,z:-58,h:16}],
    smoke:{x:0,y:27,z:-64}
  },
  ESCORT:{
    len:88,beam:9.5,fb:5,
    hull:[[-0.50,0.42],[-0.42,0.80],[-0.25,0.98],[0.00,1.00],[0.20,0.94],
          [0.34,0.76],[0.44,0.44],[0.50,0.06]],
    parts:[
      {t:'b',x:0,y:5,z:26,w:5.5,h:1.8,d:6,c:'dark'},
      {t:'b',x:0,y:6.8,z:26,w:4,h:2.2,d:4.5,c:'gun',big:1},
      {t:'b',x:0,y:5,z:10,w:7.5,h:6,d:12,c:'house',big:1},
      {t:'b',x:0,y:11,z:12,w:4,h:2.6,d:4,c:'top'},
      {t:'f',x:0,y:5,z:-2,r:2.1,h:9,c:'funnel',rake:0.14,big:1},
      {t:'b',x:0,y:5,z:-18,w:7,h:3.4,d:14,c:'house'},
      {t:'b',x:0,y:8.4,z:-20,w:3.6,h:2,d:4,c:'gun'},
      {t:'b',x:0,y:5,z:-36,w:6,h:1.4,d:8,c:'dark'}
    ],
    masts:[{x:0,y:11,z:9,h:16,yard:4}],
    smoke:{x:0,y:14,z:-2}
  }
};
SHIP_MODELS.TROOP=SHIP_MODELS.MERCHANT;

function SHIP_PALETTE(seed,night){
  const v=seed%3;
  const hull=v===0?[34,38,44]:v===1?[54,58,62]:[64,50,40];
  const house=v===2?[126,122,110]:[144,148,144];
  const n=clamp(night,0,1)*0.84;
  const mix=c=>[Math.round(c[0]*(1-n)+8*n),Math.round(c[1]*(1-n)+13*n),Math.round(c[2]*(1-n)+24*n)];
  return{hull:mix(hull),deck:mix([94,82,64]),house:mix(house),top:mix([164,168,162]),
    funnel:mix([28,30,34]),funnelLit:mix([66,68,72]),dark:mix([48,52,56]),
    gun:mix([98,102,100]),mast:mix([178,180,172])};
}

const CLOUDS=Array.from({length:14},(_,i)=>({az:(i*47.3)%360,el:4+((i*23)%16),w:0.22+((i*13)%9)/28}));
const GULLS=Array.from({length:6},(_,i)=>({az:(i*61.7)%360,el:1.4+((i*17)%7)*0.55,
  s:0.6+((i*7)%5)*0.22,spd:(i%2?1:-1)*(0.5+(i%3)*0.3)}));

// project a ship-local point with no sinking transform
function V0(cv,cam,it,cosH,sinH,S,lx,ly,lz){
  const x=lx*S,y=ly*S,z=lz*S;
  return cv.proj(cam,it.E+x*cosH+z*sinH,it.N-x*sinH+z*cosH,y);
}

/* ═══════════════════════════════════════════════════ BATHYMETRY
   The sea floor. Built once per patrol area from the coastlines (see the
   comment on the map wash for how), and now shared: the chart draws from
   it and — as of this round — the boat is bound by it. A hundred fathoms
   is six hundred feet, twice the test depth of a fleet boat. Outside that
   line the bottom is a fact you may ignore; inside it, it decides
   everything you are allowed to do.

   Depths are in FATHOMS in the grid, because that is what the charts of
   1943 were printed in, and -1 marks land. */
const Bathy = {
  ref:null, data:null,

  ensure(T){
    if(this.ref===T) return this.data;
    this.ref=T; this.data=null;
    if(!T||!T.length) return null;
    // collect coast sample points (edges subsampled, not just vertices)
    const pts=[]; let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
    for(const f of T){
      if(!f.points||f.points.length<3) continue;
      const reef=f.type==='REEF';
      const P=f.points;
      for(let i=0;i<P.length;i++){
        const a=P[i],b=P[(i+1)%P.length];
        const dx=b.xNm-a.xNm,dy=b.yNm-a.yNm;
        const L=Math.hypot(dx,dy), n=Math.max(1,Math.ceil(L/0.9));
        for(let s=0;s<n;s++){
          const x=a.xNm+dx*s/n,y=a.yNm+dy*s/n;
          pts.push({x,y,reef});
          if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        }
      }
    }
    if(!pts.length) return null;
    minX-=34;maxX+=34;minY-=34;maxY+=34;
    const span=Math.max(maxX-minX,maxY-minY);
    const cell=span/116;
    const nx=Math.ceil((maxX-minX)/cell)+1, ny=Math.ceil((maxY-minY)/cell)+1;
    /* Distance to the coast by chamfer transform: seed the cells that hold
       a coastline sample, then two sweeps across the grid — O(cells), a few
       milliseconds, instead of a nearest-point search per cell which cost
       nearly half a second on the Java Sea coastlines. A second field does
       the same for reefs alone. */
    const chamfer=(seedTest)=>{
      const D2=new Float32Array(nx*ny).fill(1e9);
      for(const p of pts){ if(!seedTest(p)) continue;
        const i=Math.round((p.x-minX)/cell), j=Math.round((p.y-minY)/cell);
        if(i>=0&&i<nx&&j>=0&&j<ny) D2[j*nx+i]=0; }
      const A=1,B=1.41421356;
      for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
        const k=j*nx+i; let v=D2[k];
        if(i>0)v=Math.min(v,D2[k-1]+A);
        if(j>0){v=Math.min(v,D2[k-nx]+A);
          if(i>0)v=Math.min(v,D2[k-nx-1]+B);
          if(i<nx-1)v=Math.min(v,D2[k-nx+1]+B);}
        D2[k]=v;}
      for(let j=ny-1;j>=0;j--)for(let i=nx-1;i>=0;i--){
        const k=j*nx+i; let v=D2[k];
        if(i<nx-1)v=Math.min(v,D2[k+1]+A);
        if(j<ny-1){v=Math.min(v,D2[k+nx]+A);
          if(i<nx-1)v=Math.min(v,D2[k+nx+1]+B);
          if(i>0)v=Math.min(v,D2[k+nx-1]+B);}
        D2[k]=v;}
      return D2;
    };
    const coastD=chamfer(()=>true);
    const hasReef=pts.some(p=>p.reef);
    const reefD=hasReef?chamfer(p=>p.reef):null;
    /* Land mask by scanline: one pass per grid row per polygon, spans
       filled between edge crossings. Point-in-polygon per cell was half a
       second on the big Java Sea coastlines; this is a few milliseconds. */
    const landMask=new Uint8Array(nx*ny);
    for(const f of T){
      if(!f.points||f.points.length<3||f.type==='REEF') continue;
      const P=f.points;
      let b0=1e9,b1=-1e9;
      for(const p of P){if(p.yNm<b0)b0=p.yNm;if(p.yNm>b1)b1=p.yNm;}
      const j0=Math.max(0,Math.ceil((b0-minY)/cell)), j1=Math.min(ny-1,Math.floor((b1-minY)/cell));
      for(let j=j0;j<=j1;j++){
        const y=minY+j*cell; const xs=[];
        for(let i2=0,k2=P.length-1;i2<P.length;k2=i2++){
          const yi=P[i2].yNm,yk=P[k2].yNm;
          if((yi>y)!==(yk>y)) xs.push(P[k2].xNm+(P[i2].xNm-P[k2].xNm)*(y-yk)/(yi-yk));
        }
        xs.sort((a,b)=>a-b);
        for(let s2=0;s2+1<xs.length;s2+=2){
          const ia=Math.max(0,Math.ceil((xs[s2]-minX)/cell)), ib=Math.min(nx-1,Math.floor((xs[s2+1]-minX)/cell));
          for(let i2=ia;i2<=ib;i2++) landMask[j*nx+i2]=1;
        }
      }
    }
    const grid=new Float32Array(nx*ny);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const x=minX+i*cell,y=minY+j*cell;
      if(landMask[j*nx+i]){grid[j*nx+i]=-1;continue;}
      const k=j*nx+i;
      const dNm=Math.min(coastD[k]*cell,60);
      const ns=Math.sin(x*0.53+y*1.31)*Math.sin(x*1.17-y*0.41)*0.5+0.5;   // fixed noise
      let fm=4+Math.pow(dNm,1.15)*(6+ns*9);
      if(reefD){const rd=reefD[k]*cell; if(rd<3.5) fm=Math.min(fm,4+rd*3);}
      grid[k]=Math.min(fm,900);
    }
    this.data={grid,nx,ny,x0:minX,y0:minY,cell};
    return this.data;
  },

  /* fathoms at a point, or null outside the surveyed box (open ocean) */
  sample(x,y){
    const b=this.data; if(!b) return null;
    const i=Math.round((x-b.x0)/b.cell), j=Math.round((y-b.y0)/b.cell);
    if(i<0||j<0||i>=b.nx||j>=b.ny) return null;
    const v=b.grid[j*b.nx+i];
    return v<0?0:v;                                    // <0 marks land
  },

  /* feet under the keel line, generous beyond the surveyed box */
  feet(x,y){ const f=this.sample(x,y); return f===null?3000:f*6; },

  /* What she would settle on. A boat can lie all day on sand or mud; on
     coral or rock she tears her tanks open, and in deep soft ooze she can
     be held down by suction — which is why bottoming was a thing skippers
     did carefully and only when they had to. */
  bottomType(x,y){
    const fm=this.sample(x,y);
    if(fm===null||fm>120) return 'DEEP';
    const n=Math.sin(x*0.91+y*1.7)*Math.sin(x*2.3-y*0.61)*0.5+0.5;
    if(fm<8)  return n>0.58?'CORAL':'SAND';
    if(fm<35) return n>0.74?'ROCK':'SAND';
    return n>0.82?'ROCK':'MUD';
  },
  restable(kind){ return kind==='SAND'||kind==='MUD'; }
};

