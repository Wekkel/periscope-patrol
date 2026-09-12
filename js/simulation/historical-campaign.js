// ═══════════════════════════════════════════════════ HISTORICAL CAMPAIGN
// No XP tree. The calendar changes the boat, the enemy and the traffic world.
// Date-specific knowledge lives in the selected campaign profile; this module
// only materializes that authored data into the cheap runtime shape consumed by
// the simulation. Existing Pacific aliases remain during the Phase-1 migration.
const HISTORICAL_CAMPAIGN_VERSION=2;

function historicalDateNumber(date,fallbackDate='1943-08-17'){
  const raw=String(date||fallbackDate),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return(+m[1])*10000+(+m[2])*100+(+m[3]);
  const f=String(fallbackDate||'1943-08-17').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return f?(+f[1])*10000+(+f[2])*100+(+f[3]):19430817;
}
function historicalDateOnly(stamp,fallbackDate='1943-08-17'){return String(stamp||fallbackDate).slice(0,10);}
function _historicalRuleMatches(rule,dateNumber){
  return !!rule&&(rule.from===undefined||dateNumber>=rule.from)&&(rule.before===undefined||dateNumber<rule.before);
}
function _historicalBand(bands,dateNumber){
  return (bands||[]).find(b=>_historicalRuleMatches(b,dateNumber))||null;
}
function _historicalModel(campaignProfileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  const id=campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId;
  const model=typeof getCampaignHistoricalModel==='function'?getCampaignHistoricalModel(id):null;
  if(!model)throw new Error(`Historical campaign model missing: ${id}`);
  return model;
}
function historicalEraForDate(date,campaignProfileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  const model=_historicalModel(campaignProfileId),d=historicalDateNumber(date,model.defaultDate);
  return _historicalBand(model.eraBands,d)?.label||'WAR';
}
function _historicalSensorRuntime(model,dateNumber){
  const defs=model.equipment?.sensors||{},out={};
  for(const [capabilityId,def] of Object.entries(defs)){
    const available=def.availableFrom===undefined||dateNumber>=def.availableFrom;
    const band=_historicalBand(def.performanceBands,dateNumber)||{};
    out[capabilityId]=Object.freeze({capabilityId,available,...band});
  }
  return Object.freeze(out);
}
function _historicalAvailableTorpedoes(model,dateNumber){
  return (model.equipment?.torpedoes||[]).filter(x=>(x.availableFrom===undefined||dateNumber>=x.availableFrom)&&(x.before===undefined||dateNumber<x.before)).map(x=>x.specKey);
}
function _historicalApplyAreaProgression(values,model,areaKey,dateNumber){
  const rule=_historicalBand(model.areaProgression?.[areaKey],dateNumber);
  if(!rule?.multiply)return values;
  for(const [key,factor] of Object.entries(rule.multiply))values[key]=(values[key]??1)*factor;
  return values;
}
function historicalCampaignProfile(date,areaKey='',campaignProfileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  const model=_historicalModel(campaignProfileId),d=historicalDateNumber(date,model.defaultDate),era=historicalEraForDate(date,campaignProfileId);
  const torpedoDudFactor=_historicalBand(model.torpedoDudBands,d)?.value??1;
  const sensors=_historicalSensorRuntime(model,d);
  const airWarning=sensors.AIR_WARNING_RADAR||Object.freeze({capabilityId:'AIR_WARNING_RADAR',available:false});
  const surfaceSearch=sensors.SURFACE_SEARCH_RADAR||Object.freeze({capabilityId:'SURFACE_SEARCH_RADAR',available:false});
  const progression={...(_historicalBand(model.progressionBands,d)?.values||{})};
  _historicalApplyAreaProgression(progression,model,areaKey,d);
  const availableTorpedoes=_historicalAvailableTorpedoes(model,d);
  const radarLabel=_historicalBand(model.equipment?.radarFitLabelBands,d)?.label||'NO RADAR FIT';
  const availabilityLabel=(model.equipment?.torpedoes||[]).find(x=>x.availabilityLabel&&availableTorpedoes.includes(x.specKey))?.availabilityLabel;
  const equipment=[radarLabel,availabilityLabel||model.equipment?.defaultTorpedoLoadLabel||'TORPEDO LOAD'];

  return Object.freeze({
    version:HISTORICAL_CAMPAIGN_VERSION,campaignProfileId,date:historicalDateOnly(date,model.defaultDate),era,torpedoDudFactor,
    // Generic equipment boundary consumed by new code.
    sensorCapabilities:sensors,availableTorpedoes:Object.freeze(availableTorpedoes),equipment:Object.freeze(equipment),radarLabel,
    ...progression,
    // Save/UI compatibility aliases for the current Pacific build. Remove only
    // after every legacy consumer has crossed the generic capability boundary.
    sdAvailable:!!airWarning.available,sjAvailable:!!surfaceSearch.available,
    sjRangeNm:surfaceSearch.rangeNm??6.8,sjErrorFactor:surfaceSearch.errorFactor??1,
    sjSweepSec:surfaceSearch.sweepSec??2.0,sjRadarDepthFt:surfaceSearch.mastDepthFt??12
  });
}
function historicalProfileForState(state){
  return state?.campaign?.historicalProfile||historicalCampaignProfile(
    state?.campaign?.startDate||state?.time?.campaignDate,state?.campaign?.patrolArea||'',
    state?.campaign?.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId);
}
function historicalTorpedoDudFactor(state){return historicalProfileForState(state).torpedoDudFactor||1;}
function historicalTorpedoDudChance(state,specKey,mode){
  const profile=historicalProfileForState(state),fallbackKey=profile.availableTorpedoes?.[0];
  const spec=TORPEDO_SPECS?.[specKey]||TORPEDO_SPECS?.[fallbackKey]||{};
  return clamp((spec.dudChanceBase||0)*(DUD_MODES?.[mode]??1)*(profile.torpedoDudFactor||1),0,.97);
}
function isTorpedoAvailableForState(state,specKey){return historicalProfileForState(state).availableTorpedoes.includes(specKey);}
function historicalNextPatrolDate(endStamp,patrolNo=1,seed=1){
  const raw=historicalDateOnly(endStamp),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return raw;
  let h=((Number(seed)||1)*1103515245+(Number(patrolNo)||1)*12345)>>>0;h^=h>>>16;
  const refitDays=18+(h%11); // 18–28 days: repair, replenishment, crew rest and work-up.
  const ms=Date.UTC(+m[1],+m[2]-1,+m[3])+refitDays*86400000,q=new Date(ms),pad=n=>String(n).padStart(2,'0');
  return `${q.getUTCFullYear()}-${pad(q.getUTCMonth()+1)}-${pad(q.getUTCDate())}`;
}
function historicalRefitMessages(previous,next,campaignProfileId=DEFAULT_GAME_IDENTITY.campaignProfileId){
  if(!previous||!next)return[];const out=[],model=_historicalModel(campaignProfileId),defs=model.equipment?.sensors||{};
  const prevSensors=previous.sensorCapabilities||{},nextSensors=next.sensorCapabilities||{};
  const prevAir=prevSensors.AIR_WARNING_RADAR?.available??previous.sdAvailable,nextAir=nextSensors.AIR_WARNING_RADAR?.available??next.sdAvailable;
  const prevSurface=prevSensors.SURFACE_SEARCH_RADAR?.available??previous.sjAvailable,nextSurface=nextSensors.SURFACE_SEARCH_RADAR?.available??next.sjAvailable;
  const prevMast=prevSensors.SURFACE_SEARCH_RADAR?.mastDepthFt??previous.sjRadarDepthFt??12,nextMast=nextSensors.SURFACE_SEARCH_RADAR?.mastDepthFt??next.sjRadarDepthFt??12;
  if(!prevAir&&nextAir&&defs.AIR_WARNING_RADAR?.refitMessage)out.push(defs.AIR_WARNING_RADAR.refitMessage);
  if(!prevSurface&&nextSurface&&defs.SURFACE_SEARCH_RADAR?.refitMessage)out.push(defs.SURFACE_SEARCH_RADAR.refitMessage);
  else if(prevSurface&&nextSurface&&prevMast<nextMast&&defs.SURFACE_SEARCH_RADAR?.mastUpgradeMessage)out.push(defs.SURFACE_SEARCH_RADAR.mastUpgradeMessage);
  for(const torpedo of model.equipment?.torpedoes||[]){
    if(torpedo.refitMessage&&!previous.availableTorpedoes?.includes?.(torpedo.specKey)&&next.availableTorpedoes.includes(torpedo.specKey))out.push(torpedo.refitMessage);
  }
  if(previous.era!==next.era)out.push(`WAR CALENDAR — ${next.era}. Enemy tactics and traffic patterns have changed.`);
  return out;
}

(function installHistoricalCampaign(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureHistoricalCampaignProfile(force=false,previous=null){
      const s=this.state,c=s.campaign,campaignProfileId=c.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId;
      const defaultDate=getCampaignProfile(campaignProfileId)?.defaultStartDate||_historicalModel(campaignProfileId).defaultDate;
      const date=c.startDate||s.time.campaignDate||defaultDate;let changed=false;
      if(force||!c.historicalProfile||c.historicalProfile.version!==HISTORICAL_CAMPAIGN_VERSION||c.historicalProfile.date!==historicalDateOnly(date)||c.historicalProfile.campaignProfileId!==campaignProfileId){
        changed=true;
        const old=previous||c.historicalProfile||null,p=historicalCampaignProfile(date,c.patrolArea||'',campaignProfileId);
        c.historicalCampaignVersion=HISTORICAL_CAMPAIGN_VERSION;c.historicalProfile=p;c.equipment={radar:p.radarLabel,torpedoes:[...p.availableTorpedoes]};
        c.refitMessages=historicalRefitMessages(old,p,campaignProfileId);
      }
      const p=c.historicalProfile;
      if(changed&&s.world?.airThreat){const base=s.world.environment?.airThreat===undefined?.55:s.world.environment.airThreat;s.world.airThreat.level=clamp(base*p.airThreatFactor,0,1.5);}
      // Do not leave a boat carrying a future torpedo when the calendar is rewound
      // into a historical scenario. The campaign profile's first available spec
      // is the safe fallback instead of a hard-coded US weapon.
      if(s.tdc&&!p.availableTorpedoes.includes(s.tdc.torpedoSpecKey)){
        const key=p.availableTorpedoes[0],sp=TORPEDO_SPECS[key];
        if(key&&sp){s.tdc.torpedoSpecKey=key;s.tdc.torpedoType=sp.name;s.tdc.torpedoSpeedKnots=sp.speedKnots;s.tdc.torpedoMaxRangeNm=sp.maxRangeNm;
          for(const t of s.weapons?.tubes||[])if(t.status!=='EMPTY')t.specKey=key;}
      }
      return p;
    }
  });
})();
