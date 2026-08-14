// ═══════════════════════════════════════════════════ MULTI-THEATER CAMPAIGNS
/* P43–P50 authored catalogue. This file is loaded after the base Pacific and
   Atlantic catalogues and their compact coastline data. Only the selected
   patrol area's coastline is expanded by getPatrolTerrain(); this registry is
   metadata plus compact coordinate literals and stays within the mobile budget. */
const PP_CAMPAIGN_SCHEMA_VERSION=2,PP_CONTENT_SCHEMA_VERSION=1;
const _mtClone=x=>JSON.parse(JSON.stringify(x));
const _mtFreeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(_mtFreeze);Object.freeze(x);}return x;};

const MULTI_FACTION_PROFILES=_mtFreeze({
  italy:{id:'italy',displayName:'Regia Marina',shortName:'RM'}
});

function getDisposition(observerFactionId,targetFactionId,date,campaignId,missionContext={}){
  if(!observerFactionId||!targetFactionId)return'UNKNOWN';
  if(observerFactionId===targetFactionId)return'FRIENDLY';
  const c=CAMPAIGN_DEFINITIONS[campaignId];if(!c)return'UNKNOWN';
  const key=[observerFactionId,targetFactionId].sort().join(':');
  if((c.alliedPairs||[]).includes(key))return'ALLIED';
  if((c.hostilePairs||[]).includes(key))return'HOSTILE';
  if((c.neutralFactionIds||[]).includes(targetFactionId))return'NEUTRAL';
  return missionContext.declaredHostile===true?'HOSTILE':'UNKNOWN';
}

const _station=(id,base,patch)=>_mtFreeze(Object.assign(_mtClone(base),{id},patch));
const MULTI_STATION_PRESENTATION_PROFILES={
  'ijn-fleet-sub':_station('ijn-fleet-sub',STATION_PRESENTATION_PROFILES['us-fleet-submarine'],{theme:'ijn-fleet',language:'ja-JP',roles:{captain:'Kanchō',executive:'Fukuchō',engineer:'Kikanchō',radio:'Tsūshinin'},sensors:{room:'Hydrophone Room',operator:'hydrophone operator'},tubes:{prefix:'Tube ',forward:'BOW',aft:'STERN',forwardTitle:'Bow Tubes',aftTitle:'Stern Tubes',flood:'Flood',fire:'Fire',roomTitle:'Torpedoes'}}),
  'rn-submarine':_station('rn-submarine',STATION_PRESENTATION_PROFILES['us-fleet-submarine'],{theme:'rn-admiralty',language:'en-GB',roles:{captain:'Captain',executive:'First Lieutenant',engineer:'Engineer Officer',radio:'Wireless Operator'},sensors:{room:'Asdic Compartment',operator:'ASDIC operator'}}),
  'rm-submarine':_station('rm-submarine',STATION_PRESENTATION_PROFILES['km-type-vii'],{theme:'rm-brass',language:'it-IT',roles:{captain:'Comandante',executive:'Ufficiale in seconda',engineer:'Direttore di macchina',radio:'Radiotelegrafista'},sensors:{room:'Camera idrofonica',operator:'operatore idrofonico'}}),
  'vmf-submarine':_station('vmf-submarine',STATION_PRESENTATION_PROFILES['km-type-vii'],{theme:'vmf-red',language:'ru-RU',roles:{captain:'Commander',executive:'Executive Officer',engineer:'Chief Engineer',radio:'Radio Operator'},sensors:{room:'Hydroacoustic Post',operator:'hydroacoustic operator'}})
};
_mtFreeze(MULTI_STATION_PRESENTATION_PROFILES);

Object.assign(TORPEDO_SPECS,{
  'type95-mod1':{shortName:'T95',name:'Type 95 Mod 1',speedKnots:49,maxRangeNm:4.86,warheadKg:405,reliability:.91,acousticPenalty:.08,dudChanceBase:.07,visibleWake:true,note:'IJN submarine oxygen torpedo; performance is bounded for a 30-minute tactical chart.'},
  'mk-viii-rn':{shortName:'MK8',name:'British 21-inch Mark VIII',speedKnots:41,maxRangeNm:4.0,warheadKg:340,reliability:.90,acousticPenalty:.06,dudChanceBase:.08,visibleWake:true,note:'Royal Navy wet-heater baseline.'},
  'siluro-w270':{shortName:'W270',name:'Siluro Tipo W 270/533.4',speedKnots:46,maxRangeNm:4.32,warheadKg:270,reliability:.86,acousticPenalty:.06,dudChanceBase:.11,visibleWake:true,note:'Regia Marina 533 mm gameplay profile.'},
  '53-38':{shortName:'53-38',name:'Soviet 53-38',speedKnots:44,maxRangeNm:4.32,warheadKg:300,reliability:.84,acousticPenalty:.07,dudChanceBase:.12,visibleWake:true,note:'Soviet steam torpedo gameplay profile.'}
});

function _sub(id,name,className,factionId,theaterId,presentationId,torpedoSpecKey,baseId='type-viic-1941'){
  const x=_mtClone(SUBMARINE_PROFILES[baseId]);Object.assign(x,{id,displayName:name,className,factionId,theaterId,stationPresentationId:presentationId,visualModelKey:id.toUpperCase()});x.weapons.defaultTorpedoSpecKey=torpedoSpecKey;
  const guns={japan:{label:'14 cm/40 deck gun',shortLabel:'14 CM',muzzleVelocityMS:700},britain:{label:'4-inch deck gun',shortLabel:'4-IN',muzzleVelocityMS:716},italy:{label:'100 mm deck gun',shortLabel:'100 MM',muzzleVelocityMS:840},soviet:{label:'100 mm deck gun',shortLabel:'100 MM',muzzleVelocityMS:800}};
  if(guns[factionId])Object.assign(x.weapons.deckGun,guns[factionId]);
  if(factionId==='japan')x.sensors={passiveSound:{capabilityId:'PASSIVE_SOUND',label:'Hydrophones'},activeEcho:{capabilityId:'ACTIVE_ECHO',label:'Active echo-ranging',shortLabel:'ECHO',fixLabel:'ECHO FIX'}};
  return _mtFreeze(x);
}
const MULTI_SUBMARINE_PROFILES=_mtFreeze({
  'ijn-i-class-1942':_sub('ijn-i-class-1942','IJN I-class patrol submarine','I-15 class','japan','pacific','ijn-fleet-sub','type95-mod1','gato-silversides'),
  'rn-t-class-1942':_sub('rn-t-class-1942','Royal Navy T-class submarine','T class','britain','atlantic','rn-submarine','mk-viii-rn'),
  'rn-u-class-med':_sub('rn-u-class-med','Royal Navy U-class submarine','U class','britain','mediterranean','rn-submarine','mk-viii-rn'),
  'rm-marcello-1941':_sub('rm-marcello-1941','Regia Marina Marcello-class submarine','Marcello class','italy','mediterranean','rm-submarine','siluro-w270'),
  'km-viic-baltic':_sub('km-viic-baltic','Type VIIC Baltic boat','Type VIIC','germany','baltic','km-type-vii','g7e-t3'),
  'vmf-s-class-1942':_sub('vmf-s-class-1942','Soviet S-class submarine','S class','soviet','baltic','vmf-submarine','53-38'),
  'ijn-i-class-indian':_sub('ijn-i-class-indian','IJN I-class Indian Ocean boat','I-15 class','japan','indian-ocean','ijn-fleet-sub','type95-mod1','gato-silversides'),
  'rn-t-class-eastern':_sub('rn-t-class-eastern','Royal Navy T-class Eastern Fleet boat','T class','britain','indian-ocean','rn-submarine','mk-viii-rn')
});

const _vehicle=(id,factionId,gameplayType,modelKey,recognition,doctrine)=>_mtFreeze({id,factionId,gameplayType,modelKey,recognition,doctrine,availableFrom:19400101});
const MULTI_VESSEL_PROFILES={};
for(const [f,name] of Object.entries({usa:'US',japan:'Japanese',germany:'German',britain:'British',italy:'Italian',soviet:'Soviet'})){
  MULTI_VESSEL_PROFILES[`${f}-merchant`]=_vehicle(`${f}-merchant`,f,'MERCHANT',f==='britain'?'ATLANTIC_FREIGHTER':'MERCHANT',`${name} cargo vessel`,`Campaign-authored ${name} merchant routing and emergency turn.`);
  MULTI_VESSEL_PROFILES[`${f}-tanker`]=_vehicle(`${f}-tanker`,f,'TANKER','TANKER',`${name} tanker`,`Protected high-value logistics traffic.`);
  MULTI_VESSEL_PROFILES[`${f}-destroyer`]=_vehicle(`${f}-destroyer`,f,'DESTROYER','DESTROYER',`${name} destroyer`,`Area/date ASW screen and datum attack.`);
  MULTI_VESSEL_PROFILES[`${f}-escort`]=_vehicle(`${f}-escort`,f,'ESCORT',f==='britain'?'FLOWER_CORVETTE_1941':'KAIBOKAN',`${name} escort`,`Close screen, search and depth-charge response.`);
  MULTI_VESSEL_PROFILES[`${f}-raft`]=_vehicle(`${f}-raft`,f,'RAFT','RAFT',`${name} survival raft`,'Stationary rescue target.');
}
_mtFreeze(MULTI_VESSEL_PROFILES);
const MULTI_AIRCRAFT_PROFILES=_mtFreeze(Object.fromEntries(Object.entries({usa:'US Navy patrol aircraft',japan:'IJN maritime patrol aircraft',germany:'Luftwaffe maritime patrol aircraft',britain:'RAF Coastal Command aircraft',italy:'Regia Aeronautica maritime aircraft',soviet:'Soviet naval patrol aircraft'}).map(([f,name])=>[`${f}-maritime-air`,{id:`${f}-maritime-air`,factionId:f,name,kind:'BOMBER',availableFrom:19400101,engines:2,spanM:24,lengthM:18,speedKnots:[150,220],ordnance:'DEPTH_CHARGE',recognition:`${name}; identification remains sensor-dependent`,doctrine:'Area/date patrol, report, attack and re-attack.'}])));

const MISSION_MECHANICS=['CONVOY_INTERDICTION','HIGH_VALUE_INTERCEPT','SHADOW_REPORT','RECONNAISSANCE','MINELAYING','SPECIAL_TRANSPORT','HARBOR_STRIKE','LIFEGUARD','ESCORT_HUNT','WEATHER_AMBUSH'];
const MISSION_LABELS={CONVOY_INTERDICTION:'Area Patrol',HIGH_VALUE_INTERCEPT:'Priority Intercept',SHADOW_REPORT:'Shadow and Report',RECONNAISSANCE:'Coastal Reconnaissance',MINELAYING:'Mine Operation',SPECIAL_TRANSPORT:'Clandestine Transport',HARBOR_STRIKE:'Chokepoint Penetration',LIFEGUARD:'Rescue Coordination',ESCORT_HUNT:'Warship Intercept',WEATHER_AMBUSH:'Campaign Climax'};
function _missionProfile(id,party,base,opponent){
  const content=Object.assign(_mtClone(US_PACIFIC_MISSION_PROFILE.content),_mtClone(base.content||{})),defs={};
  for(const [i,type] of MISSION_MECHANICS.entries())defs[type]={
    id:`${id}-${String(i+1).padStart(2,'0')}`,title:`${party.shortName} ${MISSION_LABELS[type].toUpperCase()}`,reward:1200+i*140,
    briefing:`${party.commandName} assigns ${MISSION_LABELS[type].toLowerCase()} under ${party.doctrine}. Intelligence is uncertain; identify before committing and return to the designated friendly water.`,
    mechanic:type,objectives:['develop player-held contact','complete the mission-specific action','survive the reaction','return'],
    choices:['route and transit policy','surface/submerged approach','engage, report or disengage','return timing'],requirements:{dateWindow:party.dateWindow,boatProfileId:party.submarineProfileId},
    seedVariants:[`${type}-A`,`${type}-B`,`${type}-C`],expectedDurationMin:[24,36],failStates:['assigned target or window irrecoverably lost','boat lost','return condition abandoned'],returnCriteria:['primary result resolved','friendly return area reached surfaced and stopped'],
    aarQuestions:['What did you actually know before committing?','Which choice changed enemy reaction?'],aarLessons:[`Review ${party.doctrine}.`,'Separate plotted estimates from simulation truth.','Preserve fuel, battery and an escape route.']};
  const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(k==='vesselProfileId'){const p=x.side==='FRIENDLY'?party.factionId:opponent,g=String(x.gameplayType||x.type||'MERCHANT').toUpperCase();x[k]=`${p}-${g==='TANKER'?'tanker':g==='DESTROYER'?'destroyer':['ESCORT','WARSHIP','PATROL_CRAFT'].includes(g)?'escort':g==='RAFT'?'raft':'merchant'}`;}else walk(v);}};walk(content);
  return _mtFreeze({id:`${id}-missions-v2`,defaultMissionType:MISSION_MECHANICS[0],autoDescription:`Ten distinct ${party.shortName} operations; AUTO follows area, date and seed.`,definitions:defs,missionPoolsByArea:Object.fromEntries(party.patrolAreaIds.map(a=>[a,[...MISSION_MECHANICS]])),defaultMissionPool:[...MISSION_MECHANICS],content});
}

const WAR_PARTY_PROFILES={
  'pacific-usa':{id:'pacific-usa',campaignId:'pacific-submarine-war',factionId:'usa',shortName:'USN',commandName:'COMSUBPAC',conflictSide:'ALLIES',submarineProfileId:'gato-silversides',runtimeCampaignProfileId:'us-pacific',patrolAreaIds:['Solomon Sea','Truk Approaches','Sulu Sea / Tawi-Tawi'],dateWindow:['1942-01-01','1945-08-15'],doctrine:'independent commerce interdiction and fleet support',tutorials:['intercept plotting','radar and night surface approach'],honors:['Navy Unit Commendation'],aarIdentity:'United States submarine patrol report'},
  'pacific-japan':{id:'pacific-japan',campaignId:'pacific-submarine-war',factionId:'japan',shortName:'IJN',commandName:'Sixth Fleet',conflictSide:'AXIS',submarineProfileId:'ijn-i-class-1942',runtimeCampaignProfileId:'japanese-pacific',patrolAreaIds:['Philippine Sea Fleet Routes — IJN'],dateWindow:['1942-01-01','1945-08-15'],doctrine:'fleet scouting, long-range patrol and special transport',tutorials:['Type 95 geometry','fleet reconnaissance'],honors:['Distinguished Patrol Citation'],aarIdentity:'Imperial Japanese Navy patrol report'},
  'atlantic-germany':{id:'atlantic-germany',campaignId:'battle-atlantic',factionId:'germany',shortName:'KM',commandName:'B.d.U.',conflictSide:'AXIS',submarineProfileId:'type-viic-1941',runtimeCampaignProfileId:'german-atlantic-1941',patrolAreaIds:['North Atlantic Convoy Lanes','Western Approaches','Norwegian Arctic Fjord Approaches'],dateWindow:['1941-01-01','1944-12-31'],doctrine:'contact keeping, convoy concentration and survival under growing air cover',tutorials:['contact report','night attack position'],honors:['Frontspange'],aarIdentity:'Kriegsmarine war patrol report'},
  'atlantic-britain':{id:'atlantic-britain',campaignId:'battle-atlantic',factionId:'britain',shortName:'RN',commandName:'Admiralty',conflictSide:'ALLIES',submarineProfileId:'rn-t-class-1942',runtimeCampaignProfileId:'british-atlantic',patrolAreaIds:['Bay of Biscay / Norwegian Route — RN'],dateWindow:['1941-01-01','1944-12-31'],doctrine:'offensive patrol against Axis shipping and warships under Admiralty control',tutorials:['ASDIC interpretation','recognition discipline'],honors:['Distinguished Service Order'],aarIdentity:'Royal Navy submarine patrol report'},
  'med-italy':{id:'med-italy',campaignId:'mediterranean-war',factionId:'italy',shortName:'RM',commandName:'Maricosom',conflictSide:'AXIS',submarineProfileId:'rm-marcello-1941',runtimeCampaignProfileId:'italian-mediterranean',patrolAreaIds:['Central Mediterranean Supply Route — RM'],dateWindow:['1941-01-01','1943-09-08'],doctrine:'night surface approach through clear, shallow chokepoints',tutorials:['coastal air warning','minefield passage'],honors:['Medaglia al Valore'],aarIdentity:'Regia Marina mission report'},
  'med-britain':{id:'med-britain',campaignId:'mediterranean-war',factionId:'britain',shortName:'RN',commandName:'Tenth Submarine Flotilla',conflictSide:'ALLIES',submarineProfileId:'rn-u-class-med',runtimeCampaignProfileId:'british-mediterranean',patrolAreaIds:['Central Mediterranean Supply Route — RN'],dateWindow:['1941-01-01','1943-12-31'],doctrine:'close coastal ambush and interdiction of Axis North Africa supply',tutorials:['clear-water exposure','chokepoint escape'],honors:['Malta patrol citation'],aarIdentity:'Royal Navy Mediterranean patrol report'},
  'baltic-germany':{id:'baltic-germany',campaignId:'baltic-war',factionId:'germany',shortName:'KM',commandName:'Führer der Unterseeboote Ost',conflictSide:'AXIS',submarineProfileId:'km-viic-baltic',runtimeCampaignProfileId:'german-baltic',patrolAreaIds:['Gulf of Finland Barriers — KM'],dateWindow:['1941-06-22','1944-09-30'],doctrine:'confined-water patrol behind mine, net and coastal observation belts',tutorials:['barrier navigation','seasonal visibility'],honors:['Baltic patrol clasp'],aarIdentity:'Baltic U-boat patrol report'},
  'baltic-soviet':{id:'baltic-soviet',campaignId:'baltic-war',factionId:'soviet',shortName:'VMF',commandName:'Red Banner Baltic Fleet',conflictSide:'ALLIES',submarineProfileId:'vmf-s-class-1942',runtimeCampaignProfileId:'soviet-baltic',patrolAreaIds:['Gulf of Finland Barriers — VMF'],dateWindow:['1941-06-22','1944-12-31'],doctrine:'break through dense barriers for constrained Baltic patrols',tutorials:['mine and net exits','coastal hydrophones'],honors:['Order of the Red Banner'],aarIdentity:'Soviet Baltic Fleet patrol report'},
  'indian-japan':{id:'indian-japan',campaignId:'indian-ocean-war',factionId:'japan',shortName:'IJN',commandName:'Eighth Submarine Squadron',conflictSide:'AXIS',submarineProfileId:'ijn-i-class-indian',runtimeCampaignProfileId:'japanese-indian-ocean',patrolAreaIds:['Bay of Bengal Monsoon Routes — IJN'],dateWindow:['1942-01-01','1944-12-31'],doctrine:'long-range reconnaissance, commerce attack and special operations',tutorials:['monsoon visibility','fuel planning'],honors:['Indian Ocean patrol citation'],aarIdentity:'IJN Indian Ocean patrol report'},
  'indian-britain':{id:'indian-britain',campaignId:'indian-ocean-war',factionId:'britain',shortName:'RN',commandName:'Eastern Fleet',conflictSide:'ALLIES',submarineProfileId:'rn-t-class-eastern',runtimeCampaignProfileId:'british-indian-ocean',patrolAreaIds:['Bay of Bengal Monsoon Routes — RN'],dateWindow:['1942-01-01','1944-12-31'],doctrine:'long-range interception, reconnaissance and regional fleet support',tutorials:['monsoon fronts','limited-base endurance'],honors:['Eastern Fleet patrol citation'],aarIdentity:'Royal Navy Eastern Fleet patrol report'}
};

const CAMPAIGN_DEFINITIONS=_mtFreeze({
  'pacific-submarine-war':{id:'pacific-submarine-war',displayName:'Pacific Submarine War, 1942–45',theaterId:'pacific',regionId:'pacific-ocean',conflict:'Pacific War',dateWindow:['1942-01-01','1945-08-15'],areas:['western and central Pacific'],playableWarPartyIds:['pacific-usa','pacific-japan'],missionSetIds:['pacific-usa-missions-v2','pacific-japan-missions-v2'],terrainBoundary:'ONE_ACTIVE_PATROL_AREA',historicalContext:'Submarine reconnaissance, fleet support and commerce interdiction.',availability:'PLAYABLE',hostilePairs:['japan:usa'],alliedPairs:['britain:usa'],neutralFactionIds:[]},
  'battle-atlantic':{id:'battle-atlantic',displayName:'Battle of the Atlantic / European Atlantic, 1941–44',theaterId:'atlantic',regionId:'north-atlantic',conflict:'Battle of the Atlantic',dateWindow:['1941-01-01','1944-12-31'],areas:['North Atlantic','Western Approaches','Norwegian routes'],playableWarPartyIds:['atlantic-germany','atlantic-britain'],missionSetIds:['atlantic-germany-missions-v2','atlantic-britain-missions-v2'],terrainBoundary:'ONE_ACTIVE_PATROL_AREA',historicalContext:'Convoy war, weather, air coverage and coastal approaches.',availability:'PLAYABLE',hostilePairs:['britain:germany'],alliedPairs:['britain:canada'],neutralFactionIds:[]},
  'mediterranean-war':{id:'mediterranean-war',displayName:'Mediterranean Submarine War, 1941–43',theaterId:'mediterranean',regionId:'mediterranean',conflict:'Mediterranean campaign',dateWindow:['1941-01-01','1943-12-31'],areas:['central Mediterranean chokepoints'],playableWarPartyIds:['med-italy','med-britain'],missionSetIds:['med-italy-missions-v2','med-britain-missions-v2'],terrainBoundary:'ONE_ACTIVE_PATROL_AREA',historicalContext:'Clear shallow water, mines, air power and North Africa supply routes.',availability:'PLAYABLE',hostilePairs:['britain:italy'],alliedPairs:['germany:italy'],neutralFactionIds:[]},
  'baltic-war':{id:'baltic-war',displayName:'Baltic Submarine War, 1941–44',theaterId:'baltic',regionId:'baltic-sea',conflict:'Baltic naval war',dateWindow:['1941-06-22','1944-12-31'],areas:['Gulf of Finland and Baltic exits'],playableWarPartyIds:['baltic-germany','baltic-soviet'],missionSetIds:['baltic-germany-missions-v2','baltic-soviet-missions-v2'],terrainBoundary:'ONE_ACTIVE_PATROL_AREA',historicalContext:'Confined exits, dense barriers, coastal observation and seasonal light.',availability:'PLAYABLE',hostilePairs:['germany:soviet'],alliedPairs:[],neutralFactionIds:[]},
  'indian-ocean-war':{id:'indian-ocean-war',displayName:'Indian Ocean Submarine War, 1942–44',theaterId:'indian-ocean',regionId:'indian-ocean',conflict:'Indian Ocean operations',dateWindow:['1942-01-01','1944-12-31'],areas:['Bay of Bengal and eastern trade routes'],playableWarPartyIds:['indian-japan','indian-britain'],missionSetIds:['indian-japan-missions-v2','indian-britain-missions-v2'],terrainBoundary:'ONE_ACTIVE_PATROL_AREA',historicalContext:'Long endurance, monsoon visibility, reconnaissance and trade routes.',availability:'PLAYABLE',hostilePairs:['britain:japan'],alliedPairs:['britain:usa'],neutralFactionIds:[]}
});

function getCampaignDefinition(id){return CAMPAIGN_DEFINITIONS[id]||null;}
function getWarPartyProfile(id){return WAR_PARTY_PROFILES[id]||null;}
function getSelectableCampaignDefinitions(){return Object.freeze(Object.values(CAMPAIGN_DEFINITIONS).filter(c=>c.availability==='PLAYABLE'&&c.playableWarPartyIds.every(id=>warPartyCompleteness(id).ready)));}
function getSelectableWarParties(campaignId){const c=getCampaignDefinition(campaignId);return Object.freeze((c?.playableWarPartyIds||[]).map(getWarPartyProfile).filter(p=>warPartyCompleteness(p?.id).ready));}

function _historical(base,party,torpedo){const x=_mtClone(base);x.id=`${party.id}-history-v2`;x.defaultDate=party.dateWindow[0];if(x.equipment?.torpedoes)x.equipment.torpedoes=x.equipment.torpedoes.slice(0,1).map(q=>({...q,specKey:torpedo,availableFrom:Number(party.dateWindow[0].replaceAll('-',''))}));return _mtFreeze(x);}
function _runtimeProfile(party){
  const base=party.runtimeCampaignProfileId==='us-pacific'?CAMPAIGN_PROFILES['us-pacific']:party.runtimeCampaignProfileId==='german-atlantic-1941'?CAMPAIGN_PROFILES['german-atlantic-1941']:(party.conflictSide==='AXIS'?CAMPAIGN_PROFILES['german-atlantic-1941']:CAMPAIGN_PROFILES['us-pacific']);
  const opponent=(CAMPAIGN_DEFINITIONS[party.campaignId].hostilePairs[0]||'').split(':').find(x=>x!==party.factionId)||'unknown',sub=MULTI_SUBMARINE_PROFILES[party.submarineProfileId]||SUBMARINE_PROFILES[party.submarineProfileId],torp=sub.weapons.defaultTorpedoSpecKey;
  const x=_mtClone(base);Object.assign(x,{id:party.runtimeCampaignProfileId,displayName:`${CAMPAIGN_DEFINITIONS[party.campaignId].displayName} — ${party.shortName}`,theaterId:CAMPAIGN_DEFINITIONS[party.campaignId].theaterId,playerFactionId:party.factionId,opposingFactionIds:[opponent],submarineProfileId:party.submarineProfileId,commandName:party.commandName,defaultArea:party.patrolAreaIds[0],patrolAreaIds:[...party.patrolAreaIds],defaultStartDate:party.dateWindow[0],campaignId:party.campaignId,warPartyId:party.id,devSelectable:true,developmentStage:'COMPLETE_VERTICAL_SLICE'});
  x.missionProfile=_missionProfile(party.id,party,base.missionProfile||US_PACIFIC_MISSION_PROFILE,opponent);x.historicalModel=_historical(base.historicalModel,party,torp);x.verticalSliceAcceptance=_mtClone(VERTICAL_SLICE_ACCEPTED);
  x.specialOperationsProfile=null;
  x.radioIntelProfile=_mtClone(base.radioIntelProfile||US_PACIFIC_RADIO_INTEL_PROFILE);x.radioIntelProfile.id=`${party.id}-radio-v2`;
  const radioWords=z=>{if(!z||typeof z!=='object')return;for(const [k,v] of Object.entries(z)){if(typeof v==='string')z[k]=v.replaceAll('COMSUBPAC',party.commandName).replaceAll('B.d.U.',party.commandName).replaceAll('ULTRA',`${party.commandName} INTEL`);else radioWords(v);}};radioWords(x.radioIntelProfile);
  const normalize=z=>{if(!z||typeof z!=='object')return;for(const [k,v] of Object.entries(z)){if(k==='vesselProfileId'){const owner=z.side==='FRIENDLY'?party.factionId:opponent,g=String(z.gameplayType||z.type||'MERCHANT').toUpperCase();z[k]=`${owner}-${g==='TANKER'?'tanker':g==='DESTROYER'?'destroyer':['ESCORT','WARSHIP','PATROL_CRAFT'].includes(g)?'escort':'merchant'}`;z.factionId=owner;}else if(k==='aircraftProfileId')z[k]=`${opponent}-maritime-air`;else normalize(v);}};
  normalize(x.primaryConvoyProfile);normalize(x.ambientTrafficProfile);normalize(x.doctrineProfile);return _mtFreeze(x);
}
const MULTI_CAMPAIGN_PROFILES={};for(const p of Object.values(WAR_PARTY_PROFILES))MULTI_CAMPAIGN_PROFILES[p.runtimeCampaignProfileId]=_runtimeProfile(p);_mtFreeze(MULTI_CAMPAIGN_PROFILES);_mtFreeze(WAR_PARTY_PROFILES);
const MULTI_CAMPAIGN_LOAD_BOUNDARIES=_mtFreeze(Object.fromEntries(Object.keys(MULTI_CAMPAIGN_PROFILES).map(id=>[id,{catalogPartition:id,terrainStrategy:'PATROL_SCOPED',maximumResidentLargeAreas:1}])));

function warPartyCompleteness(id){
  const p=WAR_PARTY_PROFILES[id],r=p&&MULTI_CAMPAIGN_PROFILES[p.runtimeCampaignProfileId],missing=[];
  if(!p)missing.push('WarPartyProfile');if(!r)missing.push('runtimeCampaignProfile');
  if(Object.keys(r?.missionProfile?.definitions||{}).length!==10)missing.push('exactlyTenMissions');
  for(const d of Object.values(r?.missionProfile?.definitions||{})){if(!d.objectives?.length||d.choices?.length<2||d.seedVariants?.length<3||!d.failStates?.length||d.expectedDurationMin?.[0]>30||d.expectedDurationMin?.[1]<30||!d.returnCriteria?.length||d.aarLessons?.length<2)missing.push(`missionContract:${d.id}`);}
  if(!getSubmarineProfile(p?.submarineProfileId))missing.push('submarine');if(!p?.tutorials?.length)missing.push('tutorials');if(!p?.aarIdentity)missing.push('aarIdentity');
  if(!(p?.patrolAreaIds||[]).every(a=>PATROL_AREAS[a]))missing.push('patrolGeography');
  return Object.freeze({ready:missing.length===0,missing:Object.freeze([...new Set(missing)])});
}

function _makeArea(spec){return{description:spec.description,terrainKey:spec.description,chartStartZoom:spec.chartStartZoom||2.1,
  convoyRoutes:[{...spec.route}],start:{...spec.start},ports:spec.ports.map(p=>({...p,known:p.known!==false})),navigationCorridors:(spec.navigationCorridors||[]).map(c=>({...c,points:c.points.map(p=>({...p}))})),
  pacingProfile:{targetMinutes:30,contactRangeNm:spec.contactRangeNm||[14,23]},environment:{daylight:.5,visibilityNm:9,seaState:.48,layerDepthFt:170,weather:'OVERCAST',airThreat:.65,...spec.environment},
  convoySpeedRange:spec.convoySpeedRange||[7,11],convoyCountRange:spec.convoyCountRange||[4,7],difficulty:spec.difficulty||'HARD'};}
const _newAreas={
  'Philippine Sea Fleet Routes — IJN':_makeArea({description:'Philippine Sea Fleet Routes — IJN',route:{from:{xNm:-116,yNm:-52},to:{xNm:104,yNm:46},label:'FLEET SCOUTING ROUTE'},start:{xNm:-82,yNm:86},ports:[{name:'IJN rendezvous',pos:{xNm:-82,yNm:94},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Allied fleet anchorage',pos:{xNm:109,yNm:57},side:'ENEMY',scene:'ROADSTEAD',heading:248}],navigationCorridors:[{label:'REEF-GAP APPROACH',side:'ENEMY',widthNm:1.5,minDepthFeet:40,points:[{xNm:73,yNm:35},{xNm:91,yNm:46},{xNm:109,yNm:57}]}],environment:{weather:'TROPICAL SQUALLS',visibilityNm:13,layerDepthFt:220}}),
  'Bay of Biscay / Norwegian Route — RN':_makeArea({description:'Bay of Biscay / Norwegian Route — RN',route:{from:{xNm:-122,yNm:-42},to:{xNm:96,yNm:37},label:'AXIS COASTAL ROUTE'},start:{xNm:-70,yNm:95},ports:[{name:'RN rendezvous',pos:{xNm:-70,yNm:103},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Axis roadstead',pos:{xNm:108,yNm:52},side:'ENEMY',scene:'ROADSTEAD',heading:248}],navigationCorridors:[{label:'COASTAL APPROACH',side:'ENEMY',widthNm:1.8,minDepthFeet:50,points:[{xNm:68,yNm:30},{xNm:88,yNm:40},{xNm:108,yNm:52}]}],environment:{weather:'ATLANTIC OVERCAST',visibilityNm:8}}),
  'Central Mediterranean Supply Route — RM':_makeArea({description:'Central Mediterranean Supply Route — RM',route:{from:{xNm:-118,yNm:-38},to:{xNm:106,yNm:43},label:'MALTA SUPPLY ROUTE'},start:{xNm:-76,yNm:90},ports:[{name:'Augusta rendezvous',pos:{xNm:-76,yNm:98},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Allied anchorage',pos:{xNm:110,yNm:58},side:'ENEMY',scene:'CONVOY_PORT',heading:246}],navigationCorridors:[{label:'ISLAND PASSAGE',side:'ENEMY',widthNm:1.3,minDepthFeet:35,points:[{xNm:73,yNm:37},{xNm:93,yNm:47},{xNm:110,yNm:58}]}],contactRangeNm:[12,21],environment:{weather:'MEDITERRANEAN CLEAR',visibilityNm:18,seaState:.24,layerDepthFt:105}}),
  'Central Mediterranean Supply Route — RN':_makeArea({description:'Central Mediterranean Supply Route — RN',route:{from:{xNm:-118,yNm:-38},to:{xNm:106,yNm:43},label:'NORTH AFRICA SUPPLY ROUTE'},start:{xNm:-76,yNm:90},ports:[{name:'Malta submarine berth',pos:{xNm:-76,yNm:98},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Axis supply port',pos:{xNm:110,yNm:58},side:'ENEMY',scene:'CONVOY_PORT',heading:246}],navigationCorridors:[{label:'NORTH AFRICA APPROACH',side:'ENEMY',widthNm:1.3,minDepthFeet:35,points:[{xNm:73,yNm:37},{xNm:93,yNm:47},{xNm:110,yNm:58}]}],contactRangeNm:[12,21],environment:{weather:'MEDITERRANEAN CLEAR',visibilityNm:18,seaState:.24,layerDepthFt:105}}),
  'Gulf of Finland Barriers — KM':_makeArea({description:'Gulf of Finland Barriers — KM',route:{from:{xNm:-112,yNm:-38},to:{xNm:105,yNm:42},label:'BALTIC COASTAL LANE'},start:{xNm:-68,yNm:102},ports:[{name:'German Baltic base',pos:{xNm:-68,yNm:110},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Soviet roadstead',pos:{xNm:108,yNm:54},side:'ENEMY',scene:'ROADSTEAD',heading:250}],navigationCorridors:[{label:'CHARTED BARRIER GAP',side:'ENEMY',widthNm:.9,minDepthFeet:30,points:[{xNm:61,yNm:27},{xNm:83,yNm:38},{xNm:108,yNm:54}]}],contactRangeNm:[10,18],environment:{weather:'BALTIC HAZE',visibilityNm:7,seaState:.35,layerDepthFt:80,airThreat:.72}}),
  'Gulf of Finland Barriers — VMF':_makeArea({description:'Gulf of Finland Barriers — VMF',route:{from:{xNm:-112,yNm:-38},to:{xNm:105,yNm:42},label:'BALTIC COASTAL LANE'},start:{xNm:-68,yNm:102},ports:[{name:'Kronstadt exit',pos:{xNm:-68,yNm:110},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Axis roadstead',pos:{xNm:108,yNm:54},side:'ENEMY',scene:'ROADSTEAD',heading:250}],navigationCorridors:[{label:'CHARTED BARRIER GAP',side:'ENEMY',widthNm:.9,minDepthFeet:30,points:[{xNm:61,yNm:27},{xNm:83,yNm:38},{xNm:108,yNm:54}]}],contactRangeNm:[10,18],environment:{weather:'BALTIC HAZE',visibilityNm:7,seaState:.35,layerDepthFt:80,airThreat:.72}}),
  'Bay of Bengal Monsoon Routes — IJN':_makeArea({description:'Bay of Bengal Monsoon Routes — IJN',route:{from:{xNm:-121,yNm:-51},to:{xNm:106,yNm:46},label:'BAY OF BENGAL TRADE ROUTE'},start:{xNm:-88,yNm:100},ports:[{name:'IJN eastern rendezvous',pos:{xNm:-88,yNm:108},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Allied trade anchorage',pos:{xNm:110,yNm:58},side:'ENEMY',scene:'ROADSTEAD',heading:248}],navigationCorridors:[{label:'DELTA OFFING',side:'ENEMY',widthNm:2.2,minDepthFeet:45,points:[{xNm:68,yNm:34},{xNm:90,yNm:46},{xNm:110,yNm:58}]}],environment:{weather:'MONSOON SQUALLS',visibilityNm:8,seaState:.68,layerDepthFt:235}}),
  'Bay of Bengal Monsoon Routes — RN':_makeArea({description:'Bay of Bengal Monsoon Routes — RN',route:{from:{xNm:-121,yNm:-51},to:{xNm:106,yNm:46},label:'EASTERN TRADE ROUTE'},start:{xNm:-88,yNm:100},ports:[{name:'Trincomalee rendezvous',pos:{xNm:-88,yNm:108},side:'FRIENDLY',scene:'SUB_BASE',heading:180},{name:'Axis forward anchorage',pos:{xNm:110,yNm:58},side:'ENEMY',scene:'ROADSTEAD',heading:248}],navigationCorridors:[{label:'MONSOON APPROACH',side:'ENEMY',widthNm:2.2,minDepthFeet:45,points:[{xNm:68,yNm:34},{xNm:90,yNm:46},{xNm:110,yNm:58}]}],environment:{weather:'MONSOON SQUALLS',visibilityNm:8,seaState:.68,layerDepthFt:235}})
};Object.assign(PATROL_AREAS,_newAreas);
const _edgeCoast=(name,seed)=>[{n:`${name} mainland`,pk:800,a:4200,j:.12,seed,p:[172,-172,172,172,128,162,119,126,126,92,116,64,123,31,114,-4,121,-37,112,-73,121,-108,128,-145]},{n:`${name} outer island`,pk:210,a:74,j:.05,seed:seed+1,p:[67,-19,78,-27,91,-20,88,-8,75,-5]},{n:`${name} approach island`,pk:95,a:28,j:.04,seed:seed+2,p:[118,69,124,64,130,69,126,77,119,76]}];
const _geoProfiles={
  'Philippine Sea Fleet Routes — IJN':_edgeCoast('Philippine island chain',2101),
  'Bay of Biscay / Norwegian Route — RN':_edgeCoast('European Atlantic coast',2201),
  'Central Mediterranean Supply Route — RM':_edgeCoast('Central Mediterranean coast',2301),
  'Central Mediterranean Supply Route — RN':_edgeCoast('Central Mediterranean coast',2301),
  'Gulf of Finland Barriers — KM':_edgeCoast('Gulf of Finland coast',2401).concat([{n:'Barrier skerry',pk:34,a:6,j:.02,seed:2404,p:[35,8,40,4,45,9,42,15,36,14]}]),
  'Gulf of Finland Barriers — VMF':_edgeCoast('Gulf of Finland coast',2401).concat([{n:'Barrier skerry',pk:34,a:6,j:.02,seed:2404,p:[35,8,40,4,45,9,42,15,36,14]}]),
  'Bay of Bengal Monsoon Routes — IJN':_edgeCoast('Bay of Bengal delta coast',2501),
  'Bay of Bengal Monsoon Routes — RN':_edgeCoast('Bay of Bengal delta coast',2501)
};
for(const key of Object.keys(_newAreas))COASTLINES[key]=_geoProfiles[key];

function resolveCampaignForRuntimeProfile(runtimeId){return Object.values(WAR_PARTY_PROFILES).find(p=>p.runtimeCampaignProfileId===runtimeId)||null;}
function validateCampaignCatalog(){const errors=[];for(const c of Object.values(CAMPAIGN_DEFINITIONS)){if(c.playableWarPartyIds.length!==2)errors.push(`${c.id}: exactly two war parties required`);for(const id of c.playableWarPartyIds){const q=warPartyCompleteness(id);if(!q.ready)errors.push(`${id}: ${q.missing.join(', ')}`);}}return{ok:errors.length===0,errors,campaigns:Object.keys(CAMPAIGN_DEFINITIONS).length,warParties:Object.keys(WAR_PARTY_PROFILES).length,missions:Object.values(WAR_PARTY_PROFILES).reduce((n,p)=>n+Object.keys(MULTI_CAMPAIGN_PROFILES[p.runtimeCampaignProfileId].missionProfile.definitions).length,0)};}
