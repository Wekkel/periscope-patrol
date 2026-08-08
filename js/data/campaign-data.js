// ═══════════════════════════════════════════════════ CAMPAIGN DATA
const PATROL_AREAS={
  'Solomon Sea':{
    description:'Vital Japanese supply route to Guadalcanal. Heavy convoy traffic expected.',
    convoyRoutes:[{from:{xNm:67,yNm:67},to:{xNm:-92,yNm:25},label:'NEW GEORGIA SOUND — "THE SLOT"'}],
    start:{xNm:-20,yNm:55},
    ports:[{name:'Munda',pos:{xNm:-20.2,yNm:1.8},side:'ENEMY'},{name:'Buin',pos:{xNm:-114.0,yNm:-93.0},side:'ENEMY'},{name:'Tulagi',pos:{xNm:151.4,yNm:48.0},side:'FRIENDLY'}],
    terrain:buildTerrain('Solomon Sea'),
    environment:{daylight:0.75,visibilityNm:14,seaState:0.3,layerDepthFt:210,weather:'CLEAR'},
    convoySpeedRange:[7,10],convoyCountRange:[3,5]
  },
  'Bismarck Sea':{
    description:'Northwest approach to New Britain. Truk resupply route.',
    convoyRoutes:[{from:{xNm:-68,yNm:-18},to:{xNm:49,yNm:-49},label:'RABAUL SUPPLY LANE'}],
    start:{xNm:-10,yNm:-35},
    ports:[{name:'Rabaul',pos:{xNm:76.0,yNm:-24.0},side:'ENEMY'},{name:'Kavieng',pos:{xNm:-6.0,yNm:-121.2},side:'ENEMY'},{name:'Cape Gloucester',pos:{xNm:-148.3,yNm:51.0},side:'FRIENDLY'}],
    terrain:buildTerrain('Bismarck Sea'),
    environment:{daylight:0.65,visibilityNm:12,seaState:0.4,layerDepthFt:185,weather:'PARTLY CLOUDY'},
    convoySpeedRange:[6,9],convoyCountRange:[2,4]
  },
  'Luzon Strait':{
    description:'Critical chokepoint. Okinawa to Philippines traffic. Well-escorted.',
    convoyRoutes:[{from:{xNm:92,yNm:25},to:{xNm:-92,yNm:25},label:'FORMOSA–LUZON CONVOY LANE'}],
    start:{xNm:-5,yNm:25},
    ports:[{name:'Basco',pos:{xNm:37.7,yNm:-9.0},side:'ENEMY'},{name:'Aparri',pos:{xNm:19.1,yNm:116.4},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:101.3,yNm:72.0},side:'FRIENDLY'}],
    terrain:buildTerrain('Luzon Strait'),
    environment:{daylight:0.55,visibilityNm:10,seaState:0.55,layerDepthFt:160,weather:'OVERCAST'},
    convoySpeedRange:[8,12],convoyCountRange:[3,6]
  },
  'Truk Approaches':{
    description:'Japanese Pacific fortress. Heavy patrol craft. High risk, high reward — Truk Anchorage can be penetrated through a mined, netted harbour approach.',
    convoyRoutes:[{from:{xNm:95,yNm:0},to:{xNm:-82,yNm:47},label:'TRUK RESUPPLY LANE'}],
    start:{xNm:10,yNm:30},
    ports:[{name:'Truk Anchorage',pos:{xNm:-1.2,yNm:-1.2},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:47.6,yNm:90.0},side:'FRIENDLY'}],
    terrain:buildTerrain('Truk Approaches'),
    environment:{daylight:0.8,visibilityNm:16,seaState:0.2,layerDepthFt:235,weather:'CLEAR'},
    convoySpeedRange:[9,13],convoyCountRange:[4,7]
  },
  'Java Sea':{
    description:'Shallow waters. Restricted submarine operations. Indonesian archipelago.',
    convoyRoutes:[{from:{xNm:-92,yNm:-25},to:{xNm:82,yNm:-48},label:'JAVA SEA COASTAL ROUTE'}],
    start:{xNm:-5,yNm:-35},
    ports:[{name:'Surabaya',pos:{xNm:32.8,yNm:81.0},side:'ENEMY'},{name:'Bawean',pos:{xNm:26.9,yNm:-7.2},side:'ENEMY'},{name:'Submarine rendezvous',pos:{xNm:83.6,yNm:-78.0},side:'FRIENDLY'}],
    terrain:buildTerrain('Java Sea'),
    environment:{daylight:0.9,visibilityNm:18,seaState:0.2,layerDepthFt:255,weather:'TROPICAL CLEAR'},
    convoySpeedRange:[6,8],convoyCountRange:[2,4]
  }
 };

