// ═══════════════════════════════════════════════════ CAMPAIGN DATA — MEGA PACIFIC
/* Patrol definitions are metadata only. Terrain is intentionally NOT expanded
   here: getPatrolTerrain() builds just the selected chart when a patrol starts.
   That lazy boundary matters on low-memory Android hardware as the Pacific map
   catalogue grows. */
/* Thermal layers are patrol conditions, not permanent contour lines.  The
   nominal depth belongs to an area profile; each NEW patrol perturbs it once
   and then saves that value with the world.  Keeping the randomisation here
   prevents TAC from becoming a memorised "always dive to 210 ft" answer. */
function makePatrolEnvironment(base){
  const env={...(base||{})},nominal=Number(env.layerDepthFt)||190;
  const span=clamp(28+Math.abs(nominal-190)*.12,28,46);
  // Triangular noise avoids putting every patrol at an extreme while still
  // producing enough variation that the skipper must actually inspect TAC.
  const jitter=((Math.random()+Math.random())-1)*span;
  env.layerNominalDepthFt=nominal;
  env.layerDepthFt=Math.round(clamp(nominal+jitter,90,290)/5)*5;
  return env;
}
function rerollPatrolThermalLayer(env,nominalFt=null){
  if(!env)return env;
  const base={...env,layerDepthFt:Number(nominalFt)||Number(env.layerNominalDepthFt)||Number(env.layerDepthFt)||190};
  const rolled=makePatrolEnvironment(base);env.layerNominalDepthFt=rolled.layerNominalDepthFt;env.layerDepthFt=rolled.layerDepthFt;return env;
}

const PATROL_AREAS={
  'Solomon Sea':{
    description:'Vital Japanese supply route to Guadalcanal. Heavy convoy traffic expected.',terrainKey:'Solomon Sea',
    convoyRoutes:[{from:{xNm:67,yNm:67},to:{xNm:-92,yNm:25},label:'NEW GEORGIA SOUND — "THE SLOT"'}],start:{xNm:-20,yNm:55},
    ports:[{name:'Munda',pos:{xNm:-20.2,yNm:1.8},side:'ENEMY'},{name:'Buin',pos:{xNm:-114.0,yNm:-93.0},side:'ENEMY'},{name:'Tulagi',pos:{xNm:151.4,yNm:48.0},side:'FRIENDLY'}],
    environment:{daylight:.75,visibilityNm:14,seaState:.3,layerDepthFt:210,weather:'CLEAR'},convoySpeedRange:[7,10],convoyCountRange:[3,5],difficulty:'MEDIUM'},
  'Bismarck Sea':{
    description:'Northwest approach to New Britain. Rabaul and Truk resupply traffic.',terrainKey:'Bismarck Sea',
    convoyRoutes:[{from:{xNm:-68,yNm:-18},to:{xNm:49,yNm:-49},label:'RABAUL SUPPLY LANE'}],start:{xNm:-10,yNm:-35},
    ports:[{name:'Rabaul',pos:{xNm:76.0,yNm:-24.0},side:'ENEMY'},{name:'Kavieng',pos:{xNm:-6.0,yNm:-121.2},side:'ENEMY'},{name:'Cape Gloucester',pos:{xNm:-148.3,yNm:51.0},side:'FRIENDLY'}],
    environment:{daylight:.65,visibilityNm:12,seaState:.4,layerDepthFt:185,weather:'PARTLY CLOUDY'},convoySpeedRange:[6,9],convoyCountRange:[2,4],difficulty:'MEDIUM'},
  'Luzon Strait':{
    description:'Critical chokepoint between Formosa and Luzon. Fast, well-escorted traffic.',terrainKey:'Luzon Strait',
    convoyRoutes:[{from:{xNm:92,yNm:25},to:{xNm:-92,yNm:25},label:'FORMOSA–LUZON CONVOY LANE'}],start:{xNm:-5,yNm:25},
    ports:[{name:'Basco',pos:{xNm:37.7,yNm:-9.0},side:'ENEMY'},{name:'Aparri',pos:{xNm:19.1,yNm:116.4},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:75.0,yNm:72.0},side:'FRIENDLY'}],
    environment:{daylight:.55,visibilityNm:10,seaState:.55,layerDepthFt:160,weather:'OVERCAST'},convoySpeedRange:[8,12],convoyCountRange:[3,6],difficulty:'HARD'},
  'Truk Approaches':{
    description:'Japanese Pacific fortress. Heavy patrol craft and a dangerous anchorage approach.',terrainKey:'Truk Approaches',
    convoyRoutes:[{from:{xNm:95,yNm:0},to:{xNm:-82,yNm:47},label:'TRUK RESUPPLY LANE'}],start:{xNm:10,yNm:30},
    ports:[{name:'Truk Anchorage',pos:{xNm:-1.2,yNm:-1.2},side:'ENEMY',scene:'FORTIFIED_ATOLL',heading:42,known:true},{name:'Submarine rendezvous',pos:{xNm:47.6,yNm:90.0},side:'FRIENDLY'}],
    environment:{daylight:.8,visibilityNm:16,seaState:.2,layerDepthFt:235,weather:'CLEAR'},convoySpeedRange:[9,13],convoyCountRange:[4,7],difficulty:'HARD'},
  'Java Sea':{
    description:'Shallow restricted waters among the Indonesian islands. Excellent ambush country, poor diving room.',terrainKey:'Java Sea',
    convoyRoutes:[{from:{xNm:-92,yNm:-25},to:{xNm:82,yNm:-48},label:'JAVA SEA COASTAL ROUTE'}],start:{xNm:-5,yNm:-35},
    ports:[{name:'Surabaya',pos:{xNm:32.8,yNm:81.0},scenePos:{xNm:38.8,yNm:81.0},side:'ENEMY',scene:'CONVOY_PORT',heading:18,known:true},{name:'Bawean',pos:{xNm:26.9,yNm:-7.2},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:83.6,yNm:-78.0},side:'FRIENDLY'}],
    environment:{daylight:.9,visibilityNm:18,seaState:.2,layerDepthFt:255,weather:'TROPICAL CLEAR'},convoySpeedRange:[6,8],convoyCountRange:[2,4],difficulty:'MEDIUM'},

  'Yellow Sea':{
    description:'Cold, shallow hunting ground off Korea and China. Dense coastal traffic and little depth for escape.',terrainKey:'Yellow Sea',
    convoyRoutes:[{from:{xNm:86,yNm:-104},to:{xNm:-92,yNm:82},label:'KOREA–CHINA COASTAL LANE'}],start:{xNm:36,yNm:105},
    ports:[{name:'Yantai',pos:{xNm:-127,yNm:-120},side:'ENEMY'},{name:'Inchon',pos:{xNm:132,yNm:-117},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:78,yNm:126},side:'FRIENDLY'}],
    environment:{daylight:.52,visibilityNm:9,seaState:.48,layerDepthFt:125,weather:'HAZE'},convoySpeedRange:[6,10],convoyCountRange:[4,7],difficulty:'HARD'},
  'Kii Suido / Honshu Approaches':{
    description:'Japanese home waters off Kii Suido. Heavy coastal traffic, fishing craft and aggressive air patrols.',terrainKey:'Kii Suido / Honshu Approaches',
    convoyRoutes:[{from:{xNm:-118,yNm:94},to:{xNm:96,yNm:-112},label:'HONSHU COASTAL SHIPPING LANE'}],start:{xNm:66,yNm:112},
    ports:[{name:'Wakayama',pos:{xNm:9,yNm:-38},side:'ENEMY'},{name:'Osaka approaches',pos:{xNm:25,yNm:-65},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:85,yNm:105},side:'FRIENDLY'}],
    environment:{daylight:.68,visibilityNm:12,seaState:.38,layerDepthFt:175,weather:'PARTLY CLOUDY',airThreat:.85},convoySpeedRange:[7,11],convoyCountRange:[4,7],difficulty:'HARD'},
  'East China Sea / Formosa Approaches':{
    description:'Wide shipping approaches between Formosa, China and the Ryukyus. Tankers, troop traffic and task groups.',terrainKey:'East China Sea / Formosa Approaches',
    convoyRoutes:[{from:{xNm:-104,yNm:70},to:{xNm:124,yNm:-88},label:'FORMOSA–RYUKYU SEA LANE'}],start:{xNm:98,yNm:116},
    ports:[{name:'Keelung',pos:{xNm:-95,yNm:64},side:'ENEMY'},{name:'Formosa east anchorage',pos:{xNm:-116,yNm:112},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:102,yNm:120},side:'FRIENDLY'}],
    environment:{daylight:.62,visibilityNm:13,seaState:.42,layerDepthFt:205,weather:'PARTLY CLOUDY'},convoySpeedRange:[8,12],convoyCountRange:[4,7],difficulty:'HARD'},
  'Sulu Sea / Tawi-Tawi':{
    description:'Confined waters around Tawi-Tawi, Sulu and northern Borneo. Destroyers train and fleet movements pass close to islands.',terrainKey:'Sulu Sea / Tawi-Tawi',
    convoyRoutes:[{from:{xNm:112,yNm:-82},to:{xNm:-78,yNm:92},label:'TAWI-TAWI / SULU PASSAGE'}],start:{xNm:86,yNm:112},
    ports:[{name:'Tawi-Tawi anchorage',pos:{xNm:-28,yNm:69},side:'ENEMY'},{name:'Sandakan approaches',pos:{xNm:-142,yNm:22},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:119,yNm:-96},side:'FRIENDLY'}],
    environment:{daylight:.78,visibilityNm:15,seaState:.25,layerDepthFt:190,weather:'TROPICAL CLEAR',airThreat:.72},convoySpeedRange:[9,15],convoyCountRange:[3,6],difficulty:'HARD'},
  'Kurile / Hokkaido Approaches':{
    description:'Cold northern approaches. Long visibility can turn quickly to fog; sparse traffic includes valuable northern supply ships.',terrainKey:'Kurile / Hokkaido Approaches',
    convoyRoutes:[{from:{xNm:-116,yNm:88},to:{xNm:126,yNm:-76},label:'HOKKAIDO–KURILE SHIPPING LANE'}],start:{xNm:84,yNm:108},
    ports:[{name:'Nemuro',pos:{xNm:25,yNm:16},side:'ENEMY'},{name:'Kushiro',pos:{xNm:-27,yNm:37},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:87,yNm:108},side:'FRIENDLY'}],
    environment:{daylight:.58,visibilityNm:11,seaState:.52,layerDepthFt:225,weather:'COLD OVERCAST'},convoySpeedRange:[7,11],convoyCountRange:[2,5],difficulty:'MEDIUM'},

  /* Atlantic chart windows use authored macro-contours and a shared generated
     bathymetry layer. Tactical coordinates preserve playability rather than
     claiming chart-grade georeferencing; named coast relationships and open
     water connections remain explicit and testable. */
  'North Atlantic Convoy Lanes':{
    description:'Mid-ocean convoy hunting across the broad North Atlantic air gap.',terrainKey:'North Atlantic Convoy Lanes',
    convoyRoutes:[{from:{xNm:-130,yNm:15},to:{xNm:130,yNm:15},label:'NORTH ATLANTIC CONVOY LANE'}],start:{xNm:0,yNm:85},
    ports:[{name:'B.d.U. return rendezvous',pos:{xNm:0,yNm:125},side:'FRIENDLY'}],
    environment:{daylight:.48,visibilityNm:10,seaState:.58,layerDepthFt:210,weather:'ATLANTIC OVERCAST',climateId:'NORTH_ATLANTIC_1941',visualTone:'NORTH_ATLANTIC',airThreat:.42},convoySpeedRange:[7,9],convoyCountRange:[5,9],difficulty:'MEDIUM'},
  'Western Approaches':{
    description:'Heavily patrolled eastern convoy approaches with better air coverage and frequent foul weather.',terrainKey:'Western Approaches',
    convoyRoutes:[{from:{xNm:-132,yNm:34},to:{xNm:96,yNm:-28},label:'WESTERN APPROACHES CONVOY ROUTE'}],start:{xNm:-18,yNm:92},
    ports:[{name:'B.d.U. return rendezvous',pos:{xNm:0,yNm:125},side:'FRIENDLY'},
      {name:'Liverpool outer approaches',pos:{xNm:104,yNm:-26},side:'ENEMY',scene:'CONVOY_PORT',heading:286,known:true}],
    environment:{daylight:.42,visibilityNm:8,seaState:.62,layerDepthFt:185,weather:'ATLANTIC OVERCAST',climateId:'NORTH_ATLANTIC_1941',visualTone:'NORTH_ATLANTIC',airThreat:.88},convoySpeedRange:[7,10],convoyCountRange:[6,9],difficulty:'HARD'},
  'Greenland–Iceland Gap':{
    description:'Cold northern convoy route: long swell, low horizons and a tighter escort screen.',terrainKey:'Greenland–Iceland Gap',
    convoyRoutes:[{from:{xNm:-118,yNm:-72},to:{xNm:116,yNm:76},label:'GREENLAND–ICELAND CONVOY ROUTE'}],start:{xNm:-34,yNm:108},
    ports:[{name:'B.d.U. return rendezvous',pos:{xNm:0,yNm:126},side:'FRIENDLY'},
      {name:'Hvalfjörður roadstead',pos:{xNm:76,yNm:-48},side:'ENEMY',scene:'ROADSTEAD',heading:210,known:true}],
    environment:{daylight:.36,visibilityNm:7,seaState:.70,layerDepthFt:240,weather:'ATLANTIC OVERCAST',climateId:'NORTH_ATLANTIC_1941',visualTone:'NORTH_ATLANTIC',airThreat:.58},convoySpeedRange:[7,9],convoyCountRange:[5,8],difficulty:'HARD'},
  'Norwegian Arctic Fjord Approaches':{
    description:'A separate 1942–44 Arctic coastal slice: a deep, confined Norwegian fjord approach with high shores, skerries and short sight lines. It is a gameplay-scale composite, not a navigation chart.',terrainKey:'Norwegian Arctic Fjord Approaches',
    convoyRoutes:[{from:{xNm:0,yNm:118},to:{xNm:0,yNm:-74},label:'ARCTIC COASTAL CONVOY CHANNEL'}],start:{xNm:0,yNm:-111},
    ports:[{name:'Narvik U-boat berth',pos:{xNm:0,yNm:-118},side:'FRIENDLY',scene:'SUB_BASE',heading:0,known:true},
      {name:'Outer fjord roadstead',pos:{xNm:3,yNm:88},side:'ENEMY',scene:'ROADSTEAD',heading:180,known:true}],
    environment:{daylight:.28,visibilityNm:6,seaState:.46,layerDepthFt:145,weather:'ARCTIC OVERCAST',climateId:'ARCTIC_1942',visualTone:'ARCTIC_FJORD',airThreat:.62,radioTerrainMask:.22},convoySpeedRange:[6,9],convoyCountRange:[3,6],difficulty:'HARD'}
};

/* Cheap port dress is materialized once. It is visual/navigation context, not
   a permanent population of AI vessels. Offsets are deterministic so save/load
   and time compression cannot reshuffle a harbor around the player. */
function materializePortScenes(area){
  const out=[];for(const port of area?.ports||[]){if(!port.scene)continue;
    let seed=2166136261;for(const ch of port.name)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
    const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const features=[],heading=Number(port.heading)||0,counts=port.scene==='CONVOY_PORT'?{warehouse:5,tank:3,crane:3,pier:3}:port.scene==='SUB_BASE'?{warehouse:4,tank:2,crane:2,pier:4}:{warehouse:3,tank:1,crane:1,pier:2};
    for(const [kind,count] of Object.entries(counts))for(let i=0;i<count;i++)features.push({kind,
      alongNm:(rnd()-.45)*.72,lateralNm:.08+rnd()*.26,heightM:kind==='crane'?18+rnd()*10:kind==='warehouse'?6+rnd()*5:kind==='tank'?7+rnd()*4:1.2,
      sizeM:kind==='pier'?80+rnd()*90:kind==='warehouse'?24+rnd()*20:10+rnd()*8});
    out.push({id:`PORT-${port.name.replace(/[^a-z0-9]+/gi,'-').toUpperCase()}`,name:port.name,side:port.side,position:{...(port.scenePos||port.pos)},heading,style:port.scene,known:port.known!==false,features});
  }return out;
}
