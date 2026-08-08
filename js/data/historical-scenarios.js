// ═══════════════════════════════════════════════════ HISTORICAL SCENARIOS
const HISTORICAL_SCENARIOS=[
  {id:'WAHOO_1943',name:'USS Wahoo — Yellow Sea Rampage',date:'1943-10-01',area:'Yellow Sea',
    description:'Commander Dudley Morton\'s legendary patrol. Hunt for Japanese shipping in shallow, dangerous waters. Highly aggressive attack profile required.',
    difficulty:'HARD',environment:{daylight:0.6,visibilityNm:10,seaState:0.5,layerDepthFt:195,weather:'OVERCAST'},
    briefing:'Patrol the Yellow Sea. High merchant traffic but shallow water and active ASW patrols. Strike fast and evade.',
    patrolBonus:3000},
  {id:'SILVERSIDES_1942',name:'USS Silversides — First Pacific Patrol',date:'1942-06-15',area:'Solomon Sea',
    description:'Early war patrol with unreliable Mark 14 torpedoes. Dud rates historically high. Test your patience and marksmanship.',
    difficulty:'MEDIUM',environment:{daylight:0.8,visibilityNm:16,seaState:0.2,layerDepthFt:195,weather:'CLEAR'},
    briefing:'First combat patrol. Expect significant torpedo reliability issues. Mark 14 magnetic exploders are known to be faulty.',
    patrolBonus:1500,forceDudMode:'historical'},
  {id:'FLASHER_1944',name:'USS Flasher — Wolf Pack Hunt',date:'1944-09-22',area:'Luzon Strait',
    description:'Late-war patrol with improved Mark 18 electrics. Heavy tanker traffic in Luzon Strait.',
    difficulty:'MEDIUM',environment:{daylight:0.55,visibilityNm:12,seaState:0.4,layerDepthFt:195,weather:'PARTLY CLOUDY'},
    briefing:'Heavy tanker convoy en route Manila. Mark 18 electrics available. Multiple high-value targets.',
    patrolBonus:2000,forceTorpedo:'mk18'},
  {id:'HARDER_1944',name:'USS Harder — Destroyer Killer',date:'1944-06-06',area:'Truk Approaches',
    description:'Commander Sam Dealey\'s legendary final patrol. Aggressively engage escorts head-on.',
    difficulty:'HARD',environment:{daylight:0.7,visibilityNm:18,seaState:0.15,layerDepthFt:195,weather:'CLEAR'},
    briefing:'Attack the escorts first. Draw them in and fire point-blank. High risk, high glory.',
    patrolBonus:4000},
  {id:'TRIGGER_1943',name:'USS Trigger — Night Surface Attack',date:'1943-03-15',area:'Bismarck Sea',
    description:'Night patrol in enemy-dominated waters. Low visibility, rough seas. Surface attacks only.',
    difficulty:'MEDIUM',environment:{daylight:0.08,visibilityNm:5,seaState:0.65,layerDepthFt:195,weather:'ROUGH SEAS'},
    briefing:'Night surface attack. Stay surfaced as long as possible. Crash dive if illuminated.',
    patrolBonus:2500}
];

