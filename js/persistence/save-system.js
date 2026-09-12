// ═══════════════════════════════════════════════════ SAVE / LOAD SYSTEM
const SaveSystem={
  KEY:PP_BUILD.storageKey('ss2_save_'), CAREER:PP_BUILD.storageKey('ss2_career'), REPLAY:PP_BUILD.storageKey('ss2_replay'), MAX:5,
  QUICK:PP_BUILD.storageKey('ss2_quick'),
  CAREER_PROFILE_MAX_BYTES:1000000, SAVE_MAX_BYTES:450000,
  LEGACY_STORAGE_KEYS:['pp_autosave','pp_quick','pp_career','pp_save_0','pp_save_1','pp_save_2','pp_save_3','pp_save_4',PP_BUILD.storageKey('ss2_replays')],

  /* Portable profile envelope. Keep this version independent from individual
     save-slot/fullState versions: future builds can migrate the envelope while
     the simulation keeps its own additive save migrations. The checksum is for
     corruption detection only. In a client-only MIT/open-source game it is NOT
     an anti-cheat boundary; any embedded secret would also be public. */
  PROFILE_FORMAT:'periscope-patrol-player-profile', PROFILE_VERSION:1, PROFILE_MAX_BYTES:12*1024*1024,
  // STATE_SCHEMA_VERSION belongs to the serialized simulation state, not the
  // portable-profile envelope. Keep those version lines independent: a future
  // release can migrate old patrol states without gratuitously invalidating or
  // redesigning the backup container itself. Schema 0 means a pre-Mega save;
  // the current runtime already upgrades those through its ensure* extensions.
  STATE_SCHEMA_VERSION:4,
  _importedResumePending:false,lastLoadError:null,_careerStorageMigrated:false,

  cleanupLegacyStorageKeys(){
    let removed=0,bytes=0;
    for(const key of this.LEGACY_STORAGE_KEYS){
      try{const value=localStorage.getItem(key);if(value!==null){bytes+=value.length;localStorage.removeItem(key);removed++;}}catch{}
    }
    if(removed)console.info(`[SAVE MIGRATION] Removed ${removed} legacy Periscope key(s), ${bytes} bytes.`);
    return{removed,bytes};
  },

  _replayStore(){
    try{const raw=localStorage.getItem(this.REPLAY);const parsed=raw?JSON.parse(raw):null;return parsed&&parsed.replay?parsed:{version:1,replay:null};}
    catch(error){throw new Error(`Replay storage is invalid: ${error?.message||error}`);}
  },
  _writeReplayStore(store){localStorage.setItem(this.REPLAY,JSON.stringify(store));},
  saveReplay(patrolId,replay,record=null){
    if(!replay)return false;
    try{
      const r=record?{id:record.id,missionName:record.missionName,missionType:record.missionType,area:record.area,outcome:record.outcome,startDate:record.startDate,endDate:record.endDate,ownBoat:record.ownBoat||{},shipsSunk:record.shipsSunk||0,tonnage:record.tonnage||0,torpedoesFired:record.torpedoesFired||0,torpedoHits:record.torpedoHits||0,torpedoDuds:record.torpedoDuds||0,deckGunRounds:record.deckGunRounds||0,deckGunHits:record.deckGunHits||0,aircraftKills:record.aircraftKills||0}:null;
      this._writeReplayStore({version:1,replay:{id:'last',patrolId:patrolId||null,createdAt:new Date().toISOString(),record:r,replay:this._compactReplay(replay)}});return true;
    }catch(error){console.warn('Replay save failed',error);return false;}
  },
  loadReplay(){try{return this._replayStore().replay?.replay||null;}catch(error){console.warn('Replay load failed',error);return null;}},
  loadReplayEnvelope(){try{return this._replayStore().replay||null;}catch(error){console.warn('Replay load failed',error);return null;}},
  replayStorageStats(){try{const raw=localStorage.getItem(this.REPLAY)||'';return{bytes:raw.length,count:this._replayStore().replay?1:0};}catch{return{bytes:0,count:0};}},

  _migrateCareerStorage(){
    if(this._careerStorageMigrated)return;
    this._careerStorageMigrated=true;this.cleanupLegacyStorageKeys();
    try{
      const raw=localStorage.getItem(this.CAREER);if(!raw)return;
      const original=JSON.parse(raw),before=raw.length;
      if(Number(original?.version)>=4&&!Array.isArray(original?.patrolHistory)){localStorage.setItem(this.CAREER,JSON.stringify(this._normalizeCareer(original)));return;}
      const records=Array.isArray(original?.patrolHistory)?original.patrolHistory:[],c=this._careerDefault();let replayCandidate=null;
      for(const record of records){this._aggregateRecord(c,record);if(record?.replay)replayCandidate=record.replay;}
      if(!records.some(record=>record?.patrolScore!==undefined)&&Number.isFinite(Number(original?.totalScore)))c.totals.score=Number(original.totalScore);
      for(const award of original?.commendations||[]){const a=typeof award==='string'?{id:award,title:award}:{...award};if(a.id&&!c.totals.commendations.some(x=>x.id===a.id))c.totals.commendations.push({id:a.id,title:a.title||a.id,earnedCount:Number(a.earnedCount)||1,firstEarnedAt:a.earnedAt||null});}
      const replayBefore=(localStorage.getItem(this.REPLAY)||'').length;
      if(replayCandidate)this.saveReplay(records.at(-1)?.id||null,replayCandidate,records.at(-1)||null);
      const after=JSON.stringify(c).length;localStorage.setItem(this.CAREER,JSON.stringify(c));
      const replayAfter=(localStorage.getItem(this.REPLAY)||'').length;
      console.info(`[SAVE MIGRATION] Aggregated ${records.length} career records; preserved totals and progress; ${replayCandidate?'moved 1 replay':'moved 0 replays'}; legacy records removed; career bytes ${before} -> ${after}; replay bytes ${replayBefore} -> ${replayAfter}.`);
    }catch(error){this.lastLoadError=`Career migration failed: ${error?.message||error}`;console.warn(this.lastLoadError);}
  },

  _decimateArray(a,max=120){
    if(!Array.isArray(a)||a.length<=max)return Array.isArray(a)?a:[];
    const out=[],step=(a.length-1)/(max-1);for(let i=0;i<max;i++)out.push(a[Math.round(i*step)]);
    return out;
  },

  _compactReplay(replay){
    if(!replay||replay.compacted)return replay||null;
    const compactTrack=g=>({...g,points:this._decimateArray(g.points||[],60)});
    const allowedEvent=ev=>/CONTACT|TORPEDO|GUN|WEAPON|DAMAGE|MISSION|PATROL|HIT|SINK|AIRCRAFT|DEPTH|HARBOR/i.test(String(ev?.type||''));
    return{version:replay.version||1,compacted:true,
      route:this._decimateArray(replay.route||[],120),
      observedTracks:(replay.observedTracks||[]).map(compactTrack),
      truthTracks:(replay.truthTracks||[]).map(compactTrack),
      events:this._decimateArray((replay.events||[]).filter(allowedEvent),140),
      torpedoes:(replay.torpedoes||[]).slice(-40),
      gunRounds:(replay.gunRounds||[]).slice(-60),
      enemyResponses:(replay.enemyResponses||[]).slice(-40),
      aircraftEvaded:Number(replay.aircraftEvaded)||0};
  },

  _cloneStateForStorage(state){
    // Capture any runtime fields created since the last tick before cloning;
    // initRuntime also converts legacy underscore fields to non-enumerable
    // accessors, so they cannot leak into a serialized snapshot.
    if(typeof initRuntime==='function')initRuntime(state);
    const s=JSON.parse(JSON.stringify(state));const obs=s?.tactical?.impactObservation;
    if(obs){s.tactical.impactObservation=null;if((s.time?.timeScale??0)===0)s.time.timeScale=Number(s.time?.preModalScale)>0?Number(s.time.preModalScale):1;}
    // Runtime is rebuilt by initRuntime() after load; never serialize it.
    delete s.runtime;
    if(s.time){s.time.modalPauses=0;s.time.preModalScale=Number(s.time.timeScale)||1;}
    return s;
  },

  _normalizeLoadedState(state){
    if(!state)return state;const obs=state.tactical?.impactObservation;if(obs){state.tactical.impactObservation=null;if((state.time?.timeScale??0)===0)state.time.timeScale=Number(state.time?.preModalScale)>0?Number(state.time.preModalScale):1;}if(state.time){state.time.modalPauses=0;state.time.preModalScale=Number(state.time.timeScale)||1;}if(typeof initRuntime==='function')initRuntime(state);
    // Phase-1 game identity is additive for historical Pacific saves, but an
    // explicit unknown/mismatched future identity must fail rather than load as
    // Silversides in the Pacific.
    const identity=typeof materializeGameIdentity==='function'?materializeGameIdentity(state):null;
    if(typeof materializePatrolRuntimeContext==='function')materializePatrolRuntimeContext(state);
    if(identity&&typeof materializeSubmarinePropulsionCharacteristics==='function'&&state.playerSub?.propulsion)
      state.playerSub.propulsion.characteristics=materializeSubmarinePropulsionCharacteristics(identity.submarineProfileId);
    // Phase-1 vessel identity is additive. Old saves keep their exact `type`
    // values; we stamp the new orthogonal fields on load rather than bumping
    // the serialized schema for a non-destructive metadata extension.
    if(typeof materializeVesselIdentity==='function'){
      for(const c of state.world?.contacts||[])materializeVesselIdentity(c,state);
      for(const g of state.world?.traffic?.groups||[])for(const c of g?.savedMembers||[])materializeVesselIdentity(c,state);
      for(const c of state.world?.traffic?.primaryGroup?.savedMembers||[])materializeVesselIdentity(c,state);
    }
    // Schema services are lifecycle initialization, not simulation work. Keep
    // the legacy load path equivalent to the v3 migration path without putting
    // ensure* calls back into the tick loop.
    if(typeof SimEngine==='function'&&typeof initializeStateSchema==='function')
      initializeStateSchema(new SimEngine(state,typeof CommandBus==='function'?new CommandBus():null));
    return state;
  },

  _migrateV3(state){
    if(!state||typeof state!=='object')throw new Error('Schema v3 migration requires a game state.');
    if(typeof initRuntime==='function')initRuntime(state);
    // The ensure functions are the authoritative inventory of fields used by
    // the pre-v3 hot path. Run each schema initializer once during migration;
    // 8c will remove their per-tick calls after the equivalence test passes.
    const names=['ensureAfterActionReport','ensureASWState','ensureBattleAtmosphereState','ensureCareerPatrolState','ensureCollisionState','ensureDamageState','ensureWorldExtensions','ensurePatrolRuntimeContext','ensureTacticalExtensions','ensureHarborWorldState','ensureHarborIntel','ensureHistoricalCampaignProfile','ensureMissionFramework','ensureRadioOperations','ensureSoundRadarState','ensureTrafficDirector','ensureWeatherSystem'];
    if(typeof SimEngine!=='function')throw new Error('Schema v3 migration cannot initialize simulation services.');
    const engine=new SimEngine(state,typeof CommandBus==='function'?new CommandBus():null);
    for(const name of names){
      const fn=engine[name]||engine.sys?.harbor?.[name]||engine.sys?.weather?.[name]||engine.sys?.soundRadar?.[name]||engine.sys?.intel?.[name]||engine.sys?.collision?.[name]||engine.sys?.damage?.[name]||engine.sys?.career?.[name]||engine.sys?.aswBrain?.[name];
      if(typeof fn!=='function')throw new Error(`Schema v3 migration missing initializer ${name}.`);
      try{fn.call(engine);}catch(error){throw new Error(`Schema v3 migration failed in ${name}: ${error?.message||error}`);}
    }
    // Run the zero-time ensure pass once more through the public coordinator.
    // This covers Core-owned initializers whose adapters are installed only
    // after the coordinator is constructed, without advancing simulation time.
    try{engine.update(0);}catch(error){throw new Error(`Schema v3 migration finalization failed: ${error?.message||error}`);}
    if(typeof initRuntime==='function')initRuntime(state);
    return state;
  },

  _migrateV4TypeAliases(state){
    // V4 step 1: repair old vessel type aliases so gameplayType is canonical.
    const vessels=[];const add=v=>{if(v&&typeof v==='object')vessels.push(v);};
    for(const c of state.world?.contacts||[])add(c);
    for(const g of state.world?.traffic?.groups||[])for(const c of g?.savedMembers||[])add(c);
    for(const c of state.world?.traffic?.primaryGroup?.savedMembers||[])add(c);
    for(const c of vessels){if(!c.gameplayType&&c.type)c.gameplayType=String(c.type).toUpperCase();if(!c.type&&c.gameplayType)c.type=c.gameplayType;}
  },
  _migrateV4ContactSources(state){
    // V4 step 2: convert QC ECHO and SJ RADAR track labels to generic IDs.
    const sourceMap=v=>v==='QC ECHO'?'ACTIVE_ECHO':v==='SJ RADAR'?'SURFACE_RADAR':v;
    for(const tr of Object.values(state.world?.contactTracks||{}))for(const key of ['source','lastSensorSource','positionSource'])if(tr[key]!==undefined)tr[key]=sourceMap(tr[key]);
  },
  _migrateV4RadarAliases(state){
    // V4 step 3: convert serialized sd*/sj* radar aliases to generic names.
    const radar=state.world?.radar;if(radar){
      if(radar.airWarningAvailable===undefined&&radar.sdAvailable!==undefined)radar.airWarningAvailable=!!radar.sdAvailable;
      if(radar.surfaceSearchAvailable===undefined&&radar.sjAvailable!==undefined)radar.surfaceSearchAvailable=!!radar.sjAvailable;
      if(radar.surfaceSearchMastDepthFt===undefined&&radar.sjRadarDepthFt!==undefined)radar.surfaceSearchMastDepthFt=radar.sjRadarDepthFt;
      if(radar.surfaceSearchRangeNm===undefined&&radar.sjRangeNm!==undefined)radar.surfaceSearchRangeNm=radar.sjRangeNm;
      if(radar.surfaceSearchErrorFactor===undefined&&radar.sjErrorFactor!==undefined)radar.surfaceSearchErrorFactor=radar.sjErrorFactor;
      if(radar.surfaceSearchSweepSec===undefined&&radar.sjSweepSec!==undefined)radar.surfaceSearchSweepSec=radar.sjSweepSec;
      if(radar.surfaceSearchTracks===undefined&&radar.sjTracks!==undefined)radar.surfaceSearchTracks=radar.sjTracks;
      for(const key of ['sdAvailable','sjAvailable','sjRadarDepthFt','sjRangeNm','sjErrorFactor','sjSweepSec','sjTracks'])delete radar[key];
    }
    if(state.world?.airThreat?.sdOn!==undefined){if(state.world.airThreat.airWarningOn===undefined)state.world.airThreat.airWarningOn=!!state.world.airThreat.sdOn;delete state.world.airThreat.sdOn;}
  },
  _migrateV4(state){
    if(!state||typeof state!=='object')throw new Error('Schema v4 migration requires a game state.');
    this._migrateV4TypeAliases(state);
    this._migrateV4ContactSources(state);
    this._migrateV4RadarAliases(state);
    return state;
  },

  _careerDefault(){return{version:4,totals:{patrols:{total:0,completed:0,failed:0,boatLost:0},score:0,highestPatrolScore:0,tonnageSunk:0,shipsSunk:0,shipsSunkByType:{},torpedoes:{fired:0,hits:0,misses:0,duds:0},deckGun:{rounds:0,hits:0},aircraftShotDown:0,patrolDurationSeconds:0,distanceNm:0,firstPatrolAt:null,lastPatrolAt:null,commendations:[]},progress:{campaigns:{},patrols:{},missionTypes:{},missionVariants:{}}};},

  _progressKey(record){return String(record?.specialOperationId||record?.missionName||record?.missionType||'UNKNOWN').trim().toUpperCase().replace(/\s+/g,'_');},
  _bumpProgress(bucket,key,record){if(!key)return;const x=bucket[key]||(bucket[key]={played:0,completed:0,failed:0});x.played++;if(record?.outcome==='COMPLETED')x.completed++;if(record?.outcome==='LOST'||record?.outcome==='FAILED')x.failed++;},
  _aggregateRecord(c,r){
    const t=c.totals,p=t.patrols,outcome=String(r?.outcome||'UNKNOWN').toUpperCase();p.total++;if(outcome==='COMPLETED')p.completed++;if(outcome==='LOST')p.boatLost++;if(outcome==='FAILED'||outcome==='LOST')p.failed++;
    t.score+=Number(r?.patrolScore||0);t.highestPatrolScore=Math.max(t.highestPatrolScore,Number(r?.patrolScore||0));t.tonnageSunk+=Number(r?.tonnage||0);t.shipsSunk+=Number(r?.shipsSunk||0);
    for(const ship of r?.sunkShips||[]){const key=String(ship?.type||'UNKNOWN').toUpperCase();t.shipsSunkByType[key]=(t.shipsSunkByType[key]||0)+1;}
    t.torpedoes.fired+=Number(r?.torpedoesFired||0);t.torpedoes.hits+=Number(r?.torpedoHits||0);t.torpedoes.duds+=Number(r?.torpedoDuds||0);t.torpedoes.misses+=Math.max(0,Number(r?.torpedoesFired||0)-Number(r?.torpedoHits||0)-Number(r?.torpedoDuds||0));
    t.deckGun.rounds+=Number(r?.deckGunRounds||0);t.deckGun.hits+=Number(r?.deckGunHits||0);t.aircraftShotDown+=Number(r?.aircraftKills||0);t.patrolDurationSeconds+=Number(r?.durationSeconds||0);t.distanceNm+=Number(r?.distanceNm||0);
    const stamp=r?.endDate||r?.startDate||null;if(stamp){if(!t.firstPatrolAt||stamp<t.firstPatrolAt)t.firstPatrolAt=stamp;if(!t.lastPatrolAt||stamp>t.lastPatrolAt)t.lastPatrolAt=stamp;}
    this._bumpProgress(c.progress.campaigns,r?.campaignId,r);this._bumpProgress(c.progress.patrols,r?.patrolId||r?.specialOperationId||r?.missionName||r?.missionType,r);this._bumpProgress(c.progress.missionTypes,r?.missionType,r);this._bumpProgress(c.progress.missionVariants,r?.specialOperationId||r?.missionName,r);
  },

  _normalizeCareer(raw){
    const c=this._careerDefault(),r=raw&&typeof raw==='object'?raw:{};
    c.version=4;
    if(r.totals&&r.progress){c.totals=JSON.parse(JSON.stringify({...c.totals,...r.totals}));c.totals.patrols={...c.totals.patrols,...(r.totals.patrols||{})};c.totals.torpedoes={...c.totals.torpedoes,...(r.totals.torpedoes||{})};c.totals.deckGun={...c.totals.deckGun,...(r.totals.deckGun||{})};c.progress=JSON.parse(JSON.stringify({...c.progress,...r.progress}));}
    return c;
  },

  getCareer(){
    try{this._migrateCareerStorage();const r=localStorage.getItem(this.CAREER);return this._normalizeCareer(r?JSON.parse(r):null);}
    catch{return this._careerDefault();}
  },

  _award(c,id,title,record){
    if(c.totals.commendations.some(x=>x.id===id))return false;
    c.totals.commendations.push({id,title,earnedCount:1,firstEarnedAt:record?.endDate||new Date().toISOString()});return true;
  },

  _updateCommendations(c,r){
    if(c.totals.patrols.total===1)this._award(c,'first-war-patrol','First War Patrol',r);
    if(c.totals.tonnageSunk>=50000)this._award(c,'50000-tons','50,000 tons sunk',r);
    const campaignProfileId=r.campaignProfileId||r.historicalProfile?.campaignProfileId||DEFAULT_GAME_IDENTITY.campaignProfileId;
    const specialOp=getCampaignHarborOperationProfile(campaignProfileId);
    if(r.outcome==='COMPLETED'&&r.specialOperationId===specialOp?.id&&r.harborRaid?.attempted&&specialOp?.careerAward)
      this._award(c,specialOp.careerAward.id,specialOp.careerAward.title,r);
    if(r.outcome==='COMPLETED'&&(r.hullAtEnd??100)<=25)
      this._award(c,'critical-hull-return','Returned with critical hull damage',r);
  },

  recordPatrol(record){
    try{
      if(!record||!record.id)return null;
      const c=this.getCareer(),full=JSON.parse(JSON.stringify(record));
      this._aggregateRecord(c,full);if(full.replay)this.saveReplay(full.id,full.replay,full);this._updateCommendations(c,full);
      try{localStorage.setItem(this.CAREER,JSON.stringify(c));}
      catch(first){
        throw new Error(`Career save exceeds the storage budget: ${first?.message||first}`);
      }
      return Object.assign(JSON.parse(JSON.stringify(full)),{replay:full.replay||null});
    }catch(e){console.warn('Career save failed',e);return null;}
  },

  // Compatibility shim for older callers. Phase 4 finalizes whole patrol
  // records instead of incrementally mutating three career counters.
  updateCareer(camp){
    const c=this.getCareer();
    c.totals.score=Math.max(c.totals.score||0,camp?.totalScore||0);
    try{localStorage.setItem(this.CAREER,JSON.stringify(c));}catch(e){console.warn('Career save failed',e);}
    return c;
  },

  listSlots(){
    return Array.from({length:this.MAX},(_,i)=>{
      try{const r=localStorage.getItem(this.KEY+i);return r?{slot:i,...JSON.parse(r),empty:false}:{slot:i,empty:true};}
      catch{return{slot:i,empty:true};}
    });
  },

  _snapshot(state){
    return{
        savedAt:new Date().toISOString(),version:9,stateSchemaVersion:this.STATE_SCHEMA_VERSION,
        campaignId:state.campaign.campaignId,warPartyId:state.campaign.warPartyId,campaignProfileId:state.campaign.campaignProfileId,
        area:state.campaign.patrolArea,score:state.campaign.score,
        patrol:state.campaign.patrolNumber,totalScore:state.campaign.totalScore,
        tonnage:state.campaign.tonnageSunk,missionStatus:state.campaign.missionStatus,
        hullIntegrity:state.playerSub.damage.hullIntegrity,
        torpedoInventory:state.weapons.torpedoInventory,
        elapsedSeconds:state.time.elapsedSeconds,
        fullState:this._cloneStateForStorage(state)
      };
  },

  save(slot,state){
    try{
      const value=JSON.stringify(this._snapshot(state));if(value.length>this.SAVE_MAX_BYTES)throw new Error(`Save is ${value.length} bytes; limit is ${this.SAVE_MAX_BYTES}.`);
      localStorage.setItem(this.KEY+slot,value);
      return true;
    }catch(e){this.lastLoadError=e?.message||String(e);console.warn('Save failed',e);if(typeof PresentationBridge!=='undefined')PresentationBridge.emit?.(state,'NOTIFY',{text:'Save failed — storage is full. Delete an old save or replay, then try again.',importance:'NUTTIG'});return false;}
  },

  _migrateSnapshot(snapshot){
    if(!snapshot?.fullState)throw new Error('Save snapshot has no game state.');
    const from=Number(snapshot.stateSchemaVersion??0);
    if(!Number.isFinite(from)||from<0)throw new Error('Save snapshot has an invalid state schema.');
    if(from>this.STATE_SCHEMA_VERSION)throw new Error(`Save state format ${from} is newer than this game supports (${this.STATE_SCHEMA_VERSION}). Update the game before loading it.`);
    // v0 → v1 is intentionally additive: engine.ensureTacticalExtensions(),
    // ensureWorldExtensions(), traffic/mission setup and the subsystem-specific
    // ensure methods supply every field introduced since the old save. Put any
    // future destructive/renaming migration HERE before advancing the version.
    if(from<=1){
      const c=snapshot.fullState.campaign=snapshot.fullState.campaign||{},runtime=c.campaignProfileId||'us-pacific';
      const p=typeof resolveCampaignForRuntimeProfile==='function'?resolveCampaignForRuntimeProfile(runtime):null;
      c.campaignId=c.campaignId||p?.campaignId||'pacific-submarine-war';c.warPartyId=c.warPartyId||p?.id||'pacific-usa';
      c.campaignSchemaVersion=PP_CAMPAIGN_SCHEMA_VERSION;c.contentSchemaVersion=PP_CONTENT_SCHEMA_VERSION;snapshot.stateSchemaVersion=2;
    }
    if(snapshot.stateSchemaVersion<3){this._migrateV3(snapshot.fullState);snapshot.stateSchemaVersion=3;}
    if(snapshot.stateSchemaVersion<4){this._migrateV4(snapshot.fullState);snapshot.stateSchemaVersion=4;}
    snapshot.fullState=this._normalizeLoadedState(snapshot.fullState);return snapshot;
  },

  load(slot){
    this.lastLoadError=null;
    try{const r=localStorage.getItem(this.KEY+slot);return r?this._migrateSnapshot(JSON.parse(r)).fullState:null;}
    catch(e){this.lastLoadError=e?.message||String(e);return null;}
  },

  quickSave(state){
    try{const value=JSON.stringify(this._snapshot(state));if(value.length>this.SAVE_MAX_BYTES)throw new Error(`Save is ${value.length} bytes; limit is ${this.SAVE_MAX_BYTES}.`);localStorage.setItem(this.QUICK,value);return true;}
    catch(e){this.lastLoadError=e?.message||String(e);console.warn('Quick save failed',e);if(typeof PresentationBridge!=='undefined')PresentationBridge.emit?.(state,'NOTIFY',{text:'Quick save failed — storage is full. Delete an old save or replay, then try again.',importance:'NUTTIG'});return false;}
  },

  quickLoad(){
    this.lastLoadError=null;
    try{const raw=localStorage.getItem(this.QUICK);return raw?this._migrateSnapshot(JSON.parse(raw)).fullState:null;}
    catch(e){this.lastLoadError=e?.message||String(e);return null;}
  },

  delete(slot){try{localStorage.removeItem(this.KEY+slot);return true;}catch{return false;}},

  _stableJson(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(v=>this._stableJson(v)).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+this._stableJson(value[k])).join(',')+'}';
  },

  _fnv1a32(text){
    let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,'0');
  },

  async _profileDigest(payload,algorithm='SHA-256'){
    const canonical=this._stableJson(payload);
    if(algorithm==='SHA-256'&&globalThis.crypto?.subtle&&typeof TextEncoder!=='undefined'){
      const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
      return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
    }
    // FNV is deliberately only a compatibility fallback for non-secure/file://
    // contexts. It detects common corruption but makes no security claim.
    return this._fnv1a32(canonical);
  },

  _portableResume(state){
    if(!state?.playerSub||state.playerSub.mode==='SUNK'||state.campaign?.missionStatus==='LOST'||state.campaign?.missionStatus==='TRAINING')return null;
    if((state.time?.elapsedSeconds||0)<20)return null;
    return{
      savedAt:new Date().toISOString(),version:10,stateSchemaVersion:this.STATE_SCHEMA_VERSION,why:'profile-export',
      area:state.campaign?.patrolArea||'',score:Number(state.campaign?.score)||0,
      elapsedSeconds:Number(state.time?.elapsedSeconds)||0,
      hullIntegrity:Number(state.playerSub?.damage?.hullIntegrity??100),
      tonnage:Number(state.campaign?.tonnageSunk)||0,
      fullState:this._cloneStateForStorage(state)
    };
  },

  async exportProfile(activeState=null){
    const saves=[];
    for(let slot=0;slot<this.MAX;slot++){
      const raw=localStorage.getItem(this.KEY+slot);if(!raw)continue;
      try{const snapshot=this._migrateSnapshot(JSON.parse(raw));if(snapshot?.fullState)saves.push({slot,snapshot});}catch(e){throw new Error(`Save slot ${slot+1} cannot be exported: ${e?.message||e}`);}
    }
    // Prefer the boat currently in memory: an export made during a patrol should
    // be enough to move devices even if the player forgot to press Save first.
    const autosave=this._portableResume(activeState)||this.autoRead();
    let quick=null;try{const raw=localStorage.getItem(this.QUICK);if(raw)quick=this._migrateSnapshot(JSON.parse(raw));}catch{}
    const payload={career:this.getCareer(),replay:this._replayStore(),saves,quick:quick?.fullState?quick:null,autosave:autosave?.fullState?autosave:null};
    const algorithm=(globalThis.crypto?.subtle&&typeof TextEncoder!=='undefined')?'SHA-256':'FNV-1A-32';
    const value=await this._profileDigest(payload,algorithm);
    return JSON.stringify({
      format:this.PROFILE_FORMAT,formatVersion:this.PROFILE_VERSION,
      exportedAt:new Date().toISOString(),appVersion:(typeof AppVersion!=='undefined'?AppVersion.value:null)||null,
      integrity:{algorithm,value,purpose:'corruption-detection'},payload
    },null,2);
  },

  _migrateProfile(doc){
    if(!doc||doc.format!==this.PROFILE_FORMAT)throw new Error('Not a Periscope Patrol player profile.');
    const v=Number(doc.formatVersion)||0;
    if(v>this.PROFILE_VERSION)throw new Error(`Profile format ${v} is newer than this game supports (${this.PROFILE_VERSION}). Update the game before importing.`);
    // Version 1 is the first public portable format. Future migrations belong
    // here and should return a fresh object rather than rewriting old backups.
    if(v===1)return doc;
    throw new Error(`Unsupported legacy profile format ${v}.`);
  },

  _validateProfilePayload(payload){
    if(!payload||typeof payload!=='object')throw new Error('Player profile has no payload.');
    const saves=Array.isArray(payload.saves)?payload.saves:[];
    if(saves.length>this.MAX)throw new Error('Player profile contains too many save slots.');
    const seen=new Set();
    for(const item of saves){
      const slot=Number(item?.slot);
      if(!Number.isInteger(slot)||slot<0||slot>=this.MAX||seen.has(slot)||!item?.snapshot?.fullState)throw new Error('Player profile contains an invalid save slot.');
      seen.add(slot);
    }
    if(payload.autosave!=null&&!payload.autosave?.fullState)throw new Error('Player profile contains an invalid resumable patrol.');
    if(payload.quick!=null&&!payload.quick?.fullState)throw new Error('Player profile contains an invalid quick save.');
    return{saves,replay:payload.replay&&payload.replay.replay?payload.replay:{version:1,replay:null}};
  },

  async importProfile(text){
    if(typeof text!=='string'||!text.trim())throw new Error('Player profile is empty.');
    if(text.length>this.PROFILE_MAX_BYTES)throw new Error('Player profile is unexpectedly large.');
    let doc;try{doc=JSON.parse(text);}catch{throw new Error('Player profile is not valid JSON.');}
    doc=this._migrateProfile(doc);const {saves,replay}=this._validateProfilePayload(doc.payload);
    const alg=doc.integrity?.algorithm,value=String(doc.integrity?.value||'');
    if(!alg||!value)throw new Error('Player profile has no integrity checksum.');
    if(!['SHA-256','FNV-1A-32'].includes(alg))throw new Error(`Unsupported profile checksum: ${alg}.`);
    const actual=await this._profileDigest(doc.payload,alg);
    if(actual.toLowerCase()!==value.toLowerCase())throw new Error('Player profile checksum failed. The backup may be damaged or edited.');

    // Verify the envelope BEFORE migration: the checksum describes the backup
    // exactly as exported. Only after it is known intact may old state schemas
    // be upgraded for storage on this device.
    const migratedSaves=saves.map(item=>({slot:Number(item.slot),snapshot:this._migrateSnapshot(JSON.parse(JSON.stringify(item.snapshot)))}));
    const migratedAutosave=doc.payload.autosave?.fullState?this._migrateSnapshot(JSON.parse(JSON.stringify(doc.payload.autosave))):null;
    const migratedQuick=doc.payload.quick?.fullState?this._migrateSnapshot(JSON.parse(JSON.stringify(doc.payload.quick))):null;

    const keys=[this.CAREER,this.REPLAY,...Array.from({length:this.MAX},(_,i)=>this.KEY+i),this.QUICK,this.AUTO];
    const before=new Map(keys.map(k=>[k,localStorage.getItem(k)]));
    try{
      // Normalize career on entry so old career layouts remain importable while
      // full simulation states keep their original version for runtime migration.
      localStorage.setItem(this.CAREER,JSON.stringify(this._normalizeCareer(doc.payload.career)));
      localStorage.setItem(this.REPLAY,JSON.stringify(replay));
      for(let i=0;i<this.MAX;i++)localStorage.removeItem(this.KEY+i);
      for(const item of migratedSaves)localStorage.setItem(this.KEY+item.slot,JSON.stringify(item.snapshot));
      if(migratedQuick?.fullState)localStorage.setItem(this.QUICK,JSON.stringify(migratedQuick));
      else localStorage.removeItem(this.QUICK);
      if(migratedAutosave?.fullState)localStorage.setItem(this.AUTO,JSON.stringify(migratedAutosave));
      else localStorage.removeItem(this.AUTO);
    }catch(e){
      // localStorage has no transaction primitive. Roll back every profile key
      // if quota/private-mode failure occurs mid-import so a backup import can
      // never leave half an old career and half a new one behind.
      for(const [k,v] of before){try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}}
      throw new Error(`Import could not be stored: ${e?.message||e}`);
    }
    this._importedResumePending=!!migratedAutosave?.fullState;
    this._careerStorageMigrated=false;
    const career=this.getCareer();
    return{ok:true,formatVersion:doc.formatVersion,appVersion:doc.appVersion||null,integrityVerified:true,
      saves:migratedSaves.length,patrols:career.totals.patrols.total,commendations:career.totals.commendations.length,
      stateSchemaVersion:this.STATE_SCHEMA_VERSION,resumeState:migratedAutosave?.fullState||null};
  },

  releaseImportedResume(){this._importedResumePending=false;},

  /* ══ AUTOSAVE ═══════════════════════════════════════════════════════
     A phone does not close an app, it freezes it and reclaims the memory
     when it feels like it. A patrol you have been running for two hours
     can therefore vanish between putting the phone in your pocket and
     taking it out again, with no warning and nothing to reload.

     So the boat writes herself down whenever the screen goes away — on
     visibilitychange, on pagehide, on blur — and on a slow tick besides.
     It lives in its own key, outside the five manual slots, so it can
     never overwrite a save the player made deliberately. */
  AUTO:PP_BUILD.storageKey('pp_autosave'),

  autoSave(state,why){
    try{
      // Do not let the current device overwrite a just-imported resumable patrol
      // before the player has accepted or discarded it.
      if(this._importedResumePending)return false;
      if(!state||!state.playerSub) return false;
      if(state.playerSub.mode==='SUNK'||state.campaign?.missionStatus==='LOST'){this.autoClear();return false;} // terminal patrol: never resurrect an earlier checkpoint
      if(state.campaign.missionStatus==='TRAINING') return false;
      if((state.time.elapsedSeconds||0)<20) return false;      // not worth a record yet
      const snap={
        savedAt:new Date().toISOString(),version:9,stateSchemaVersion:this.STATE_SCHEMA_VERSION,why:why||'auto',
        area:state.campaign.patrolArea,score:state.campaign.score,
        elapsedSeconds:state.time.elapsedSeconds,
        hullIntegrity:state.playerSub.damage.hullIntegrity,
        tonnage:state.campaign.tonnageSunk,
        fullState:this._cloneStateForStorage(state)
      };
      localStorage.setItem(this.AUTO,JSON.stringify(snap));
      return true;
    }catch(e){ console.warn('Autosave failed',e); return false; }
  },

  autoRead(){
    try{const r=localStorage.getItem(this.AUTO);return r?this._migrateSnapshot(JSON.parse(r)):null;}
    catch(e){console.warn('Autosave cannot be loaded',e);return null;}
  },

  autoClear(){this._importedResumePending=false;try{localStorage.removeItem(this.AUTO);}catch{}}
};
