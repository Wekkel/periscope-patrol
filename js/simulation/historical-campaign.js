// ═══════════════════════════════════════════════════ PATCH 9 — HISTORICAL CAMPAIGN
// No XP tree.  The calendar changes the boat, the enemy and the traffic world.
// Exact cut-over dates are intentionally broad gameplay bands rather than a
// per-hull refit database; historical scenarios can still force a specific fit.
const HISTORICAL_CAMPAIGN_VERSION=1;

function historicalDateNumber(date){
  const m=String(date||'1943-08-17').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?(+m[1])*10000+(+m[2])*100+(+m[3]):19430817;
}
function historicalDateOnly(stamp){return String(stamp||'1943-08-17').slice(0,10);}
function historicalEraForDate(date){
  const d=historicalDateNumber(date);
  return d<19430101?'EARLY WAR':d<19440101?'MID WAR':'LATE WAR';
}
function historicalCampaignProfile(date,areaKey=''){
  const d=historicalDateNumber(date),era=historicalEraForDate(date);
  // The Mark 14 trouble improves through 1943 and is mostly a solved weapon
  // problem by early 1944. This factor multiplies the player's chosen dud mode.
  let torpedoDudFactor=d<19430101?1.00:d<19430901?.78:d<19440101?.48:.26;
  let sjAvailable=d>=19420701,sjRangeNm=d<19430101?5.4:d<19440101?6.8:8.5;
  let sjErrorFactor=d<19430101?1.35:d<19440101?1.00:.72;
  let sjSweepSec=d<19430101?2.8:d<19440101?2.2:1.7;
  const sdAvailable=d>=19420401;
  const sjRadarDepthFt=d>=19440101?48:12;
  let soundFactor=d<19430101?.92:d<19440101?1.00:1.08;
  let aswSkill=d<19430101?.76:d<19440101?1.00:1.18;
  let sonarIntervalFactor=d<19430101?1.18:d<19440101?1.00:.86;
  let sonarErrorFactor=d<19430101?1.22:d<19440101?1.00:.82;
  let depthChargeErrorFactor=d<19430101?1.28:d<19440101?1.00:.82;
  let airThreatFactor=d<19430101?.72:d<19440101?1.00:1.28;
  let trafficDensityFactor=d<19430101?1.12:d<19440101?1.00:.74;
  let merchantTonnageFactor=d<19430101?.92:d<19440101?1.00:1.14;
  let merchantSpeedBonus=d<19430101?-.45:d<19440101?0:.65;
  let primaryMerchantCountFactor=d<19430101?1.08:d<19440101?1.00:.82;
  let surfaceOpportunity=d<19430101?1.22:d<19440101?1.00:.80;

  // Area flavour: a calendar change should alter routes differently rather
  // than applying one global difficulty slider to the whole Pacific.
  if(areaKey==='Truk Approaches'){
    airThreatFactor*=d>=19440101?1.16:1.05;aswSkill*=1.08;
  }else if(areaKey==='Luzon Strait'){
    if(d>=19440101){aswSkill*=1.08;merchantTonnageFactor*=1.08;trafficDensityFactor*=.92;}
  }else if(areaKey==='Java Sea'){
    if(d<19430101){surfaceOpportunity*=1.12;airThreatFactor*=.88;}
  }else if(areaKey==='Solomon Sea'&&d<19430101){
    trafficDensityFactor*=1.08;
  }

  const availableTorpedoes=['mk14fast','mk14slow','mk10'];
  // Mark 18 entered combat use during 1943. A broad September 1943 campaign
  // cut-over reflects late-1943 combat issue (including Wahoo's final patrol)
  // without pretending every boat received the weapon on the same day.
  if(d>=19430901)availableTorpedoes.push('mk18');
  const radarLabel=!sdAvailable?'NO RADAR FIT':!sjAvailable?'SD AIR WARNING':d<19430101?'SD + EARLY SJ':d<19440101?'SD + SJ':'SD + IMPROVED SJ';
  const equipment=[radarLabel,availableTorpedoes.includes('mk18')?'MARK 18 AVAILABLE':'STEAM TORPEDO LOAD'];
  return Object.freeze({version:HISTORICAL_CAMPAIGN_VERSION,date:historicalDateOnly(date),era,
    torpedoDudFactor,sdAvailable,sjAvailable,sjRangeNm,sjErrorFactor,sjSweepSec,sjRadarDepthFt,radarLabel,soundFactor,
    aswSkill,sonarIntervalFactor,sonarErrorFactor,depthChargeErrorFactor,airThreatFactor,
    trafficDensityFactor,merchantTonnageFactor,merchantSpeedBonus,primaryMerchantCountFactor,surfaceOpportunity,
    availableTorpedoes:Object.freeze(availableTorpedoes),equipment:Object.freeze(equipment)});
}
function historicalProfileForState(state){
  return state?.campaign?.historicalProfile||historicalCampaignProfile(state?.campaign?.startDate||state?.time?.campaignDate,state?.campaign?.patrolArea||'');
}
function historicalTorpedoDudFactor(state){return historicalProfileForState(state).torpedoDudFactor||1;}
function historicalTorpedoDudChance(state,specKey,mode){
  const spec=TORPEDO_SPECS?.[specKey]||TORPEDO_SPECS?.mk14fast||{};
  return clamp((spec.dudChanceBase||0)*(DUD_MODES?.[mode]??1)*historicalTorpedoDudFactor(state),0,.97);
}
function isTorpedoAvailableForState(state,specKey){return historicalProfileForState(state).availableTorpedoes.includes(specKey);}
function historicalNextPatrolDate(endStamp,patrolNo=1,seed=1){
  const raw=historicalDateOnly(endStamp),m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return raw;
  let h=((Number(seed)||1)*1103515245+(Number(patrolNo)||1)*12345)>>>0;h^=h>>>16;
  const refitDays=18+(h%11); // 18–28 days: repair, replenishment, crew rest and work-up.
  const ms=Date.UTC(+m[1],+m[2]-1,+m[3])+refitDays*86400000,q=new Date(ms),pad=n=>String(n).padStart(2,'0');
  return `${q.getUTCFullYear()}-${pad(q.getUTCMonth()+1)}-${pad(q.getUTCDate())}`;
}
function historicalRefitMessages(previous,next){
  if(!previous||!next)return[];const out=[];
  if(!previous.sdAvailable&&next.sdAvailable)out.push('REFIT COMPLETE — SD air-warning radar fitted.');
  if(!previous.sjAvailable&&next.sjAvailable)out.push('REFIT COMPLETE — SJ surface-search radar fitted.');
  else if(previous.sjAvailable&&next.sjAvailable&&previous.sjRadarDepthFt<next.sjRadarDepthFt)out.push('REFIT COMPLETE — improved SJ radar mast and display fitted.');
  if(!previous.availableTorpedoes?.includes?.('mk18')&&next.availableTorpedoes.includes('mk18'))out.push('REFIT COMPLETE — Mark 18 electric torpedoes now available.');
  if(previous.era!==next.era)out.push(`WAR CALENDAR — ${next.era}. Enemy tactics and traffic patterns have changed.`);
  return out;
}

(function installHistoricalCampaign(){
  if(typeof SimEngine==='undefined')return;
  Object.assign(SimEngine.prototype,{
    ensureHistoricalCampaignProfile(force=false,previous=null){
      const s=this.state,c=s.campaign,date=c.startDate||s.time.campaignDate||'1943-08-17';let changed=false;
      if(force||!c.historicalProfile||c.historicalProfile.version!==HISTORICAL_CAMPAIGN_VERSION||c.historicalProfile.date!==historicalDateOnly(date)){
        changed=true;
        const old=previous||c.historicalProfile||null,p=historicalCampaignProfile(date,c.patrolArea||'');
        c.historicalCampaignVersion=HISTORICAL_CAMPAIGN_VERSION;c.historicalProfile=p;c.equipment={radar:p.radarLabel,torpedoes:[...p.availableTorpedoes]};
        c.refitMessages=historicalRefitMessages(old,p);
      }
      const p=c.historicalProfile;
      if(changed&&s.world?.airThreat){const base=s.world.environment?.airThreat===undefined?.55:s.world.environment.airThreat;s.world.airThreat.level=clamp(base*p.airThreatFactor,0,1.5);}
      // Do not leave a boat carrying a future torpedo when the calendar is rewound
      // into an historical scenario. Mark 14 Fast is the safe fleet default.
      if(s.tdc&&!p.availableTorpedoes.includes(s.tdc.torpedoSpecKey)){
        const key='mk14fast',sp=TORPEDO_SPECS[key];s.tdc.torpedoSpecKey=key;s.tdc.torpedoType=sp.name;s.tdc.torpedoSpeedKnots=sp.speedKnots;s.tdc.torpedoMaxRangeNm=sp.maxRangeNm;
        for(const t of s.weapons?.tubes||[])if(t.status!=='EMPTY')t.specKey=key;
      }
      return p;
    }
  });
})();
