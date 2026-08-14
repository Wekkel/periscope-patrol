// ═══════════════════════════════════════════════════ CANVAS VIEW
// ═══════════════════════════════════════════════════ 3D PERISCOPE DATA
const NM_M=1852, EARTH_R=6371000;

/* MEGA PACIFIC — shared pseudo-3D camera contract.
   World renderers must consume only world state + this camera. Station-specific
   facts (periscope bearing, bridge look direction, gun train) belong in the
   station controller that constructs the camera. If a shared renderer reaches
   back into state.tactical for a station bearing, a new view will eventually
   inherit the wrong horizon/terrain/object projection. */
function makeWorldCamera(state,{position=null,heightM=1.8,bearingDeg=0,fovDeg=32,cx=0,cy=0,r=1,viewW=null,viewH=null,kind='WORLD'}={}){
  const p=position||state.playerSub.position,br=degToRad(bearingDeg),h=Math.max(.15,heightM),f=r/Math.tan(degToRad(fovDeg)/2),dip=Math.sqrt(2*h/EARTH_R);
  return{E:p.xNm*NM_M,N:-p.yNm*NM_M,h,f,cx,cy,r,fovDeg,bearingDeg:normDeg(bearingDeg),viewW:viewW??r*2,viewH:viewH??r*2,
    sin:Math.sin(br),cos:Math.cos(br),dip,horizonY:cy+f*dip,dHor:Math.sqrt(2*EARTH_R*h),halfFov:degToRad(fovDeg)/2,kind};
}
function setWorldCameraBearing(cam,bearingDeg){
  cam.bearingDeg=normDeg(bearingDeg);const br=degToRad(cam.bearingDeg);cam.sin=Math.sin(br);cam.cos=Math.cos(br);return cam;
}

/* Legacy contact data calls this field `lengthYards`, but the authored values
   are ship lengths in FEET: e.g. destroyer 350, merchant 420, tanker 520.
   Treating those numbers as yards made every optical model almost exactly 3×
   too large. Keep the save/schema field untouched for compatibility and fix
   only visual geometry through this one helper. */
function shipVisualLengthM(c,fallbackFt=400){
  return Math.max(2,(Number(c?.lengthYards)||fallbackFt)*0.3048);
}
function shipVisualLengthNm(c,fallbackFt=400){return shipVisualLengthM(c,fallbackFt)/NM_M;}

// Rudder and engine limits. A Fubuki-class destroyer needed roughly 90 s for a
// full circle at speed; a loaded freighter far longer.
const SHIP_TURN_RATE={ESCORT:3.2,WARSHIP:3.0,DESTROYER:3.4,KAIBOKAN:2.7,PATROL_CRAFT:2.4,HEAVY_CRUISER:1.8,CARRIER:1.35,MERCHANT:1.2,TANKER:0.85,TROOP:1.0,JUNK:1.5};
const SHIP_ACCEL={ESCORT:0.28,WARSHIP:0.28,DESTROYER:0.31,KAIBOKAN:0.23,PATROL_CRAFT:0.22,HEAVY_CRUISER:0.16,CARRIER:0.12,MERCHANT:0.10,TANKER:0.07,TROOP:0.09,JUNK:0.13};
// Angular acceleration prevents a ship from snapping instantly to full rudder.
// Values are intentionally modest: enough inertia to read on MAP/3-D without
// making convoy station-keeping or ASW responses sluggish.
const SHIP_TURN_ACCEL={ESCORT:2.5,WARSHIP:2.4,DESTROYER:2.8,KAIBOKAN:2.0,PATROL_CRAFT:1.8,HEAVY_CRUISER:1.25,CARRIER:.9,MERCHANT:0.75,TANKER:0.52,TROOP:0.64,JUNK:1.0};
// WWII echo-ranging gear
const SONAR={
  maxRangeNm:1.5,        // useful echo-ranging range
  deadZoneNm:0.16,       // beam cannot depress: contact is lost on the run-in
  patternSize:7,         // charges per attack
  sinkFps:8.5            // depth-charge sink rate
};
/* A destroyer's sonar is not an all-round oracle. Propeller/wake noise and
   hull geometry make the stern sector a poor listening/echo-ranging direction,
   especially at pursuit speed. The factor is intentionally continuous so an
   escort can regain contact by turning rather than crossing a magic boundary. */
function escortSonarOwnshipFactor(esc,targetPos){
  if(!esc?.position||!targetPos)return 1;
  const rel=Math.abs(shortDelta(esc.heading||0,bearingBetween(esc.position,targetPos)));
  const aft=rel<=112?1:rel>=168?.14:lerp(1,.14,(rel-112)/56);
  const speedNoise=lerp(1,.68,clamp(((esc.speedKnots||0)-8)/16,0,1));
  return clamp(aft*speedNoise,.09,1);
}

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
SHIP_MODELS.MERCHANT_FORECASTLE={
  len:126,beam:17,fb:6.8,hull:SHIP_MODELS.MERCHANT.hull,
  parts:[{t:'b',x:0,y:6.8,z:47,w:13,h:5,d:18,c:'house',big:1},{t:'b',x:0,y:6.8,z:-34,w:14,h:8,d:25,c:'house',big:1},{t:'b',x:0,y:14.8,z:-31,w:10,h:4,d:11,c:'top'},{t:'f',x:0,y:14,z:-48,r:2.7,h:11,c:'funnel',rake:.08,big:1},{t:'b',x:0,y:6.8,z:10,w:9,h:1.7,d:14,c:'dark'},{t:'b',x:0,y:6.8,z:-8,w:9,h:1.7,d:14,c:'dark'}],
  masts:[{x:0,y:7,z:28,h:25,yard:8},{x:0,y:14,z:-38,h:20,yard:6}],smoke:{x:0,y:26,z:-48}
};
SHIP_MODELS.MERCHANT_ISLAND={
  len:108,beam:15.5,fb:6.5,hull:SHIP_MODELS.MERCHANT.hull,
  parts:[{t:'b',x:0,y:6.5,z:4,w:14,h:9,d:28,c:'house',big:1},{t:'b',x:0,y:15.5,z:7,w:10,h:4,d:13,c:'top',big:1},{t:'f',x:0,y:14,z:-13,r:2.5,h:10,c:'funnel',rake:.12,big:1},{t:'b',x:0,y:6.5,z:40,w:10,h:3.2,d:15,c:'house'},{t:'b',x:0,y:6.5,z:-42,w:10,h:3.2,d:15,c:'house'}],
  masts:[{x:0,y:7,z:34,h:22,yard:7},{x:0,y:7,z:-33,h:22,yard:7}],smoke:{x:0,y:24,z:-13}
};
SHIP_MODELS.MERCHANT_COASTAL={
  len:82,beam:13,fb:5.5,hull:SHIP_MODELS.MERCHANT.hull,
  parts:[{t:'b',x:0,y:5.5,z:-15,w:11,h:7,d:21,c:'house',big:1},{t:'b',x:0,y:12.5,z:-13,w:8,h:3,d:9,c:'top'},{t:'f',x:0,y:11,z:-29,r:2,h:8,c:'funnel',rake:.05,big:1},{t:'b',x:0,y:5.5,z:26,w:9,h:2.7,d:12,c:'house'}],
  masts:[{x:0,y:6,z:20,h:18,yard:5},{x:0,y:6,z:-24,h:16,yard:4}],smoke:{x:0,y:19,z:-29}
};
function shipVisualModelKey(c){if(!c)return'MERCHANT';if(!['MERCHANT','TROOP'].includes(c.type))return c.type;const d=String(c.displayType||'').toUpperCase();if(d.includes('COASTAL'))return'MERCHANT_COASTAL';if(d.includes('TRANSPORT')||d.includes('TROOP'))return'MERCHANT_ISLAND';let h=0;for(const ch of String(c.id||c.name||''))h=(h*33+ch.charCodeAt(0))>>>0;return['MERCHANT','MERCHANT_FORECASTLE','MERCHANT_ISLAND'][h%3];}
SHIP_MODELS.TROOP=SHIP_MODELS.MERCHANT_ISLAND;
/* Distinct warship silhouettes. These stay deliberately low-poly/vector: class
   identity comes from proportions, turrets, funnels and flight deck rather than
   textures. That keeps BRG/SCOPE/GUN cheap on the Helios G88 while making a
   destroyer, kaibokan, cruiser and carrier readable at useful attack ranges. */
SHIP_MODELS.DESTROYER={
  len:111,beam:10.5,fb:4.7,hull:[[-.50,.30],[-.44,.66],[-.31,.92],[-.05,1],[.20,.94],[.36,.73],[.47,.32],[.50,.03]],
  parts:[
    {t:'b',x:0,y:4.7,z:38,w:6.4,h:2.2,d:7,c:'gun',big:1},{t:'b',x:0,y:6.9,z:37,w:3.9,h:1.8,d:4,c:'gun'},
    {t:'b',x:0,y:4.7,z:17,w:8.2,h:7.2,d:14,c:'house',big:1},{t:'b',x:0,y:11.9,z:19,w:5.2,h:3.1,d:7,c:'top'},
    {t:'f',x:-1.7,y:5,z:2,r:1.55,h:10,c:'funnel',rake:.13,big:1},{t:'f',x:1.7,y:5,z:-11,r:1.45,h:9,c:'funnel',rake:.13,big:1},
    {t:'b',x:0,y:4.7,z:-25,w:6.8,h:2.0,d:8,c:'gun',big:1},{t:'b',x:0,y:6.7,z:-26,w:3.8,h:1.6,d:4,c:'gun'},
    {t:'b',x:0,y:4.7,z:-39,w:6.0,h:1.7,d:7,c:'gun'}],
  masts:[{x:0,y:12,z:13,h:19,yard:6},{x:0,y:8,z:-20,h:11,yard:4}],smoke:{x:0,y:17,z:-4}
};
SHIP_MODELS.KAIBOKAN={
  len:78,beam:9.1,fb:4.0,hull:[[-.50,.38],[-.42,.76],[-.25,.97],[.02,1],[.24,.91],[.39,.66],[.48,.26],[.50,.04]],
  parts:[{t:'b',x:0,y:4,z:25,w:5.2,h:1.8,d:6,c:'gun',big:1},{t:'b',x:0,y:4,z:8,w:7.0,h:6.0,d:13,c:'house',big:1},
    {t:'b',x:0,y:10,z:10,w:4.2,h:2.4,d:5,c:'top'},{t:'f',x:0,y:4,z:-5,r:1.8,h:8,c:'funnel',rake:.10,big:1},
    {t:'b',x:0,y:4,z:-24,w:5.3,h:1.8,d:7,c:'gun',big:1}],
  masts:[{x:0,y:10,z:6,h:15,yard:4}],smoke:{x:0,y:13,z:-5}
};
SHIP_MODELS.HEAVY_CRUISER={
  len:202,beam:20.5,fb:6.8,hull:[[-.50,.28],[-.45,.63],[-.34,.88],[-.08,1],[.22,.96],[.38,.76],[.47,.36],[.50,.03]],
  parts:[
    {t:'b',x:0,y:6.8,z:72,w:13,h:3.3,d:13,c:'gun',big:1},{t:'b',x:0,y:10.1,z:72,w:7,h:2.0,d:7,c:'gun'},
    {t:'b',x:0,y:6.8,z:52,w:13,h:3.3,d:13,c:'gun',big:1},{t:'b',x:0,y:10.1,z:52,w:7,h:2.0,d:7,c:'gun'},
    {t:'b',x:0,y:6.8,z:18,w:15,h:9,d:32,c:'house',big:1},{t:'b',x:0,y:15.8,z:24,w:9,h:5,d:15,c:'top',big:1},
    {t:'f',x:-3,y:7,z:-3,r:2.8,h:14,c:'funnel',rake:.08,big:1},{t:'f',x:3,y:7,z:-25,r:2.8,h:14,c:'funnel',rake:.08,big:1},
    {t:'b',x:0,y:6.8,z:-62,w:13,h:3.1,d:13,c:'gun',big:1},{t:'b',x:0,y:9.9,z:-62,w:7,h:1.9,d:7,c:'gun'}],
  masts:[{x:0,y:20,z:18,h:25,yard:9},{x:0,y:12,z:-42,h:17,yard:7}],smoke:{x:0,y:25,z:-14}
};
SHIP_MODELS.CARRIER={
  len:240,beam:30,fb:8.0,hull:[[-.50,.30],[-.44,.68],[-.31,.91],[-.04,1],[.22,.96],[.39,.70],[.48,.30],[.50,.04]],
  parts:[{t:'b',x:0,y:8,z:0,w:29,h:2.2,d:218,c:'dark',big:1},
    {t:'b',x:9.5,y:10.2,z:-20,w:7.5,h:11,d:30,c:'house',big:1},{t:'b',x:9.5,y:21.2,z:-17,w:5.5,h:4.0,d:14,c:'top'},
    {t:'f',x:10,y:11,z:-42,r:3.1,h:15,c:'funnel',rake:.12,big:1}],
  masts:[{x:9.5,y:24,z:-10,h:22,yard:8}],smoke:{x:10,y:30,z:-42}
};
// Legacy saves may still say WARSHIP/ESCORT. Keep those keys valid, but new
// content should use the explicit class types above.
SHIP_MODELS.WARSHIP=SHIP_MODELS.DESTROYER;
/* A small patrol craft/subchaser is not a destroyer shrunk by a scale factor.
   Give it a low, continuous bridge/funnel silhouette so close periscope views
   read as one vessel rather than a stack of unrelated boxes. */
SHIP_MODELS.PATROL_CRAFT={
  len:43,beam:6.2,fb:2.55,
  hull:[[-.50,.34],[-.43,.70],[-.28,.94],[.02,1.00],[.27,.91],[.41,.61],[.48,.28],[.50,.04]],
  parts:[
    {t:'b',x:0,y:2.55,z:5,w:4.9,h:2.0,d:13,c:'house',big:1,taper:.92},
    {t:'b',x:0,y:4.55,z:5.5,w:4.0,h:1.7,d:9,c:'house',big:1,taper:.86},
    {t:'b',x:0,y:6.25,z:6.2,w:2.8,h:1.25,d:5.6,c:'top',big:1,taper:.80},
    {t:'b',x:0,y:2.55,z:15.0,w:3.5,h:.8,d:4.6,c:'gun',big:1,taper:.76},
    {t:'f',x:0,y:2.65,z:-3.8,r:1.05,h:5.2,c:'funnel',rake:.10,big:1},
    {t:'b',x:0,y:2.55,z:-10.5,w:4.0,h:1.5,d:8.5,c:'house',big:1,taper:.90},
    {t:'b',x:0,y:2.55,z:-18,w:3.0,h:.65,d:4.0,c:'dark',taper:.82}
  ],
  masts:[{x:0,y:6.7,z:3.8,h:8.2,yard:2.4}],smoke:{x:0,y:8.0,z:-3.8}
};

/* National escort silhouettes are generated once from a tiny vector grammar.
   Funnel count/spacing, bridge position, mast plan and hull proportions make
   country families readable without textures, atlases or per-frame objects. */
function _nationalEscortModel(o){
  const hull=[[-.50,.30],[-.44,.66],[-.30,.92],[-.04,1],[.21,.94],[.37,.70],[.47,.30],[.50,.03]],parts=[
    {t:'b',x:0,y:o.fb,z:o.len*.34,w:o.beam*.58,h:2,d:7,c:'gun',big:1},
    {t:'b',x:0,y:o.fb,z:o.bridgeZ,w:o.beam*.72,h:o.bridgeH,d:14,c:'house',big:1},
    {t:'b',x:0,y:o.fb+o.bridgeH,z:o.bridgeZ+2,w:o.beam*.43,h:2.6,d:6,c:'top'},
    {t:'b',x:0,y:o.fb,z:-o.len*.31,w:o.beam*.54,h:1.8,d:7,c:'gun',big:1}
  ];
  for(let i=0;i<o.funnels;i++){const spread=(i-(o.funnels-1)/2)*o.funnelGap;parts.push({t:'f',x:0,y:o.fb,z:o.funnelZ+spread,r:o.funnelR,h:o.funnelH,c:'funnel',rake:o.rake,big:1});}
  if(o.aftHouse)parts.push({t:'b',x:0,y:o.fb,z:-o.len*.18,w:o.beam*.62,h:2.8,d:12,c:'house'});
  return{len:o.len,beam:o.beam,fb:o.fb,hull,parts,masts:[{x:0,y:o.fb+o.bridgeH,z:o.bridgeZ-1,h:o.mastH,yard:o.yard},...(o.aftMast?[{x:0,y:o.fb+3,z:-o.len*.20,h:o.mastH*.55,yard:o.yard*.65}]:[])],smoke:{x:0,y:o.fb+o.funnelH,z:o.funnelZ}};
}
SHIP_MODELS.US_FLETCHER_DESTROYER=_nationalEscortModel({len:114,beam:12,fb:5.0,bridgeZ:24,bridgeH:8.2,funnels:2,funnelZ:-2,funnelGap:13,funnelR:1.65,funnelH:10,rake:.10,mastH:20,yard:6.5,aftHouse:true,aftMast:true});
SHIP_MODELS.US_DESTROYER_ESCORT=_nationalEscortModel({len:93,beam:11.1,fb:4.6,bridgeZ:17,bridgeH:6.4,funnels:1,funnelZ:-7,funnelGap:0,funnelR:1.9,funnelH:9,rake:.05,mastH:17,yard:5.2,aftHouse:true,aftMast:false});
SHIP_MODELS.GERMAN_TORPEDO_BOAT=_nationalEscortModel({len:110,beam:10.2,fb:4.5,bridgeZ:19,bridgeH:6.1,funnels:2,funnelZ:-1,funnelGap:11,funnelR:1.45,funnelH:9.2,rake:.16,mastH:18,yard:5.6,aftHouse:false,aftMast:true});
SHIP_MODELS.GERMAN_MINESWEEPER=_nationalEscortModel({len:69,beam:9,fb:4.1,bridgeZ:9,bridgeH:5.5,funnels:1,funnelZ:-10,funnelGap:0,funnelR:1.7,funnelH:8,rake:.02,mastH:15,yard:4.2,aftHouse:true,aftMast:false});
SHIP_MODELS.ITALIAN_SOLDATI_DESTROYER=_nationalEscortModel({len:106,beam:10.2,fb:4.4,bridgeZ:22,bridgeH:7.4,funnels:2,funnelZ:-1,funnelGap:7,funnelR:1.55,funnelH:10.5,rake:.18,mastH:21,yard:6.2,aftHouse:false,aftMast:true});
SHIP_MODELS.ITALIAN_GABBIANO_CORVETTE=_nationalEscortModel({len:64,beam:8.7,fb:3.9,bridgeZ:8,bridgeH:5.8,funnels:1,funnelZ:-9,funnelGap:0,funnelR:1.45,funnelH:8.8,rake:.08,mastH:15,yard:4.4,aftHouse:true,aftMast:false});
SHIP_MODELS.SOVIET_GNEVNY_DESTROYER=_nationalEscortModel({len:112,beam:10.5,fb:4.6,bridgeZ:21,bridgeH:6.8,funnels:2,funnelZ:-2,funnelGap:10,funnelR:1.5,funnelH:9.5,rake:.06,mastH:19,yard:6,aftHouse:true,aftMast:true});
SHIP_MODELS.SOVIET_PATROL_ESCORT=_nationalEscortModel({len:58,beam:8.2,fb:3.6,bridgeZ:7,bridgeH:5.0,funnels:1,funnelZ:-8,funnelGap:0,funnelR:1.35,funnelH:7.4,rake:0,mastH:13,yard:4,aftHouse:false,aftMast:false});
SHIP_MODELS.JUNK={
  len:22,beam:5.2,fb:1.3,
  hull:[[-.50,.28],[-.40,.70],[-.18,.96],[.22,.92],[.43,.48],[.50,.06]],
  parts:[{t:'b',x:0,y:1.3,z:-4,w:3.8,h:1.7,d:7,c:'house',big:1}],
  masts:[{x:0,y:2.4,z:2,h:8,yard:2.5}],smoke:null
};

SHIP_MODELS.RAFT={
  len:5.5,beam:2.2,fb:.35,
  hull:[[-.50,.32],[-.40,.85],[.25,1],[.46,.52],[.50,.08]],
  parts:[{t:'b',x:0,y:.35,z:0,w:1.7,h:.35,d:3.4,c:'house',big:1}],
  masts:[],smoke:null
};

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
    const authored=T.chartBounds;
    if(authored&&Number.isFinite(authored.x0)&&Number.isFinite(authored.y0)&&Number.isFinite(authored.x1)&&Number.isFinite(authored.y1)){
      minX=authored.x0;minY=authored.y0;maxX=authored.x1;maxY=authored.y1;
    }else{minX-=34;maxX+=34;minY-=34;maxY+=34;}
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
