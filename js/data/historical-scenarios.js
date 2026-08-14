// ═══════════════════════════════════════════════════ HISTORICAL SCENARIOS
/* These are playable scenarios grounded in real patrol dates/areas, not exact
   hour-by-hour reconstructions. Keep the start date and theatre aligned with
   the historical boat before adding gameplay-specific mission variation. */
const HISTORICAL_SCENARIOS=[
  {id:'WAHOO_1943',name:'USS Wahoo — Fourth War Patrol',date:'1943-02-23',area:'Yellow Sea',missionType:'CONVOY_INTERDICTION',
    description:'Wahoo heads for the far northern Yellow Sea on the aggressive fourth patrol that made Morton and O’Kane famous.',
    difficulty:'HARD',environment:{daylight:0.6,visibilityNm:10,seaState:0.5,layerDepthFt:195,weather:'OVERCAST'},
    briefing:'Work into the shallow Yellow Sea, find coastal shipping and strike hard before the escorts can pin you down.',
    patrolBonus:3000},
  {id:'SILVERSIDES_1942',name:'USS Silversides — First War Patrol',date:'1942-04-30',area:'Kii Suido / Honshu Approaches',missionType:'CONVOY_INTERDICTION',
    description:'Silversides departs Pearl Harbor for her first war patrol in Japanese home waters around Kii Suido.',
    difficulty:'HARD',environment:{daylight:0.68,visibilityNm:12,seaState:0.35,layerDepthFt:180,weather:'PARTLY CLOUDY',airThreat:.82},
    briefing:'First combat patrol in Japanese home waters. Early-war Mark 14 reliability is poor; make every firing position count.',
    patrolBonus:2000,forceDudMode:'historical'},
  {id:'FLASHER_1944',name:'USS Flasher — Philippine Wolf Pack',date:'1944-08-30',area:'Luzon Strait',missionType:'CONVOY_INTERDICTION',
    description:'Flasher begins her fourth war patrol as leader of a coordinated attack group in the Philippines.',
    difficulty:'MEDIUM',environment:{daylight:0.55,visibilityNm:12,seaState:0.4,layerDepthFt:195,weather:'PARTLY CLOUDY'},
    briefing:'Heavy Philippine traffic. Locate the convoy, coordinate your approach and exploit improved late-war torpedoes.',
    patrolBonus:2000,forceTorpedo:'mk18'},
  {id:'HARDER_1944',name:'USS Harder — Fifth War Patrol',date:'1944-05-26',area:'Sulu Sea / Tawi-Tawi',missionType:'ESCORT_HUNT',
    description:'Harder leaves Fremantle for the Celebes and Sulu Seas, operating around Tawi-Tawi and hunting Japanese destroyers.',
    difficulty:'HARD',environment:{daylight:0.7,visibilityNm:18,seaState:0.2,layerDepthFt:195,weather:'CLEAR'},
    briefing:'Intelligence places important fleet movements and destroyers around Tawi-Tawi. Find the named escort and survive the counterattack.',
    patrolBonus:4000},
  {id:'TRIGGER_1943',name:'USS Trigger — East China Sea Tanker Hunt',date:'1943-09-01',area:'East China Sea / Formosa Approaches',missionType:'CONVOY_INTERDICTION',
    description:'Trigger begins her sixth war patrol north of Formosa, where tankers, freighters and maddening torpedo duds await.',
    difficulty:'HARD',environment:{daylight:0.55,visibilityNm:11,seaState:0.45,layerDepthFt:195,weather:'PARTLY CLOUDY'},
    briefing:'Patrol the East China Sea north of Formosa. Attack valuable tanker traffic and expect escorts and unreliable hits.',
    patrolBonus:2500,forceDudMode:'historical'},
  {id:'U973_ARCTIC_1944',name:'U-973 — Narvik Arctic Departure',date:'1944-03-01',area:'Norwegian Arctic Fjord Approaches',missionType:'CONVOY_INTERDICTION',campaignProfileId:'german-atlantic-1941',
    description:'A Type VIIC leaves Narvik into the Arctic approaches. The chart is a gameplay-scale fjord composite; the date, boat type and northern convoy task are historically grounded.',
    difficulty:'HARD',environment:{daylight:.30,visibilityNm:6,seaState:.48,layerDepthFt:145,weather:'ARCTIC OVERCAST',airThreat:.72,radioTerrainMask:.22},
    briefing:'Work out through the deep central channel, keep clear of skerries and shore patrols, then intercept Allied Arctic shipping without losing the return route.',
    patrolBonus:3200}
];
