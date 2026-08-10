// ═══════════════════════════════════════════════════ TUTORIAL / TRAINING PATROL
const TUT_OBJECTIVE={ACK:'ACK',FRESH:'FRESH_ACTION',STATE:'STATE'};
const TUT_STEPS=[
  {id:'welcome',title:'Welcome aboard',
   body:'You are the skipper of USS Silversides on a <b>training patrol</b> off Java. Calm sea, clear sky, one unescorted merchant somewhere ahead — and torpedoes that always explode.<br><br>Four tabs at the bottom: <b>View</b> (the big picture), <b>Helm</b> (steering, depth, systems), <b>Attack</b> (torpedoes) and <b>Status</b> (damage &amp; log). The strip just above them is your permanent read-out.',
   goal:'Tap NEXT when you have had a look around', objective:TUT_OBJECTIVE.ACK},

  {id:'stations',title:'Six stations',
   body:'Top right of the picture you can switch between six stations:<br>• <b>TAC</b> — compass, depth column, stealth meters<br>• <b>BRG</b> — the surface bridge watch; wide view, binoculars and visual marks while surfaced or awash<br>• <b>SND</b> — optional sound room; train the hydrophones for a sharper bearing, or view SJ radar when fitted<br>• <b>SCOPE</b> — what the periscope sees<br>• <b>MAP</b> — the navigation plot<br>• <b>GUN</b> — the 3-inch deck-gun sight; entering it while surfaced automatically sends the crew topside<br><br>Open the map now.',
   goal:'Switch to the MAP station', hl:'ovlStations', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareStationsLesson(),
   check:s=>s.tactical.activeStation==='MAP'},

  {id:'map',title:'The navigation plot',
   body:'Drag to pan, pinch to zoom, <b>◎</b> re-centres on the boat, <b>✕</b> clears your plot. The amber dashed lane is a known convoy route; contacts are what your crew has actually plotted, not omniscient truth.<br><br>Tap open water to drop a waypoint — the autopilot then steers to it. Tap a waypoint again to delete it, and the moment you touch the helm yourself the autopilot lets go.<br><br>The <b>☁ WX</b> button overlays only the moving squall cells and your local visual range; toggle it briefly when visibility does not match what you expected.',
   goal:'Plot a waypoint on the map', hl:'ovlLeft', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareMapLesson(),
   check:s=>s.map.plottedCourse.length>0},

  {id:'helm',title:'Steering',
   body:'On the <b>TAC</b> station you can drag the compass rose to steer. In the <b>Helm</b> tab you get a slider, ±10° buttons and four cardinal presets.<br><br>The green needle is your real heading, the amber marker is what you ordered — a submarine turns slowly, so they differ during a turn. Steering by hand switches the autopilot off automatically.',
   goal:'Come to course 040 (±10°)', sta:'TACTICAL', pane:'paneHelm', hl:'mHdg', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareHelmLesson(),
   check:s=>Math.abs(shortDelta(s.playerSub.orderedHeading,40))<12},

  {id:'speed',title:'Engines and noise',
   body:'On the roof you run on <b>diesels</b> (up to ~18 kn). For playability the induction is treated as usable while the boat is only awash: diesels remain on to about 12 ft and come back by about 8 ft. Deeper than that you answer on the <b>electric</b> motors — about 8.5 kn flat out, and the battery drains fast. This boat still has <b>no snorkel</b>: periscope depth is battery-only.<br><br>Charging is slow and the screws have first call on the engines: she charges fastest <b>loafing at low revs</b> and barely at all at flank. From flat, reckon on three or four hours on the roof — dangerous hours. Run on the surface at night, dive by day.<br><br>Speed is noise. Flank speed can be heard from far away; that is the trade-off in every attack.',
   goal:'Order Standard speed (250 rpm)', pane:'paneHelm', hl:'mRpm', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareSpeedLesson(),
   check:s=>s.playerSub.propulsion.orderedRpm>=225&&s.playerSub.propulsion.orderedRpm<=300},

  {id:'depth',title:'Depth control',
   body:'Depth presets: <b>Surface</b>, <b>55 ft</b> (periscope depth), <b>100 ft</b>, <b>200 ft</b>. You can also drag the water column on the TAC station.<br><br>The amber triangle on the right is the ordered depth, the dashed red band is crush depth. Deeper is quieter and safer from depth charges — but the periscope only works above ~70 ft.',
   goal:'Go to periscope depth, 55 ft', pane:'paneHelm', hl:'mPeriscope', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareDepthLesson(),
   check:s=>s.playerSub.orderedDepthFeet>=45&&s.playerSub.orderedDepthFeet<=65&&Math.abs(s.playerSub.depthFeet-55)<12},

  {id:'sensors',title:'Finding the enemy',
   body:'You hunt first with two dependable senses:<br>• <b>Visual</b> — bridge lookouts when surfaced, periscope down to ~65 ft. Range depends on daylight, weather and sea state.<br>• <b>Hydrophone</b> — passive sonar, works at any depth. Loud, fast ships are heard from further away, and your <i>own</i> noise deafens you.<br><br><b>SJ surface-search radar</b> becomes available only on patrol dates when your boat has the fit. The enemy has active sonar too: if you hear a ping, they are searching for <i>you</i>.<br><br>Be patient and watch the map — a contact will build up.',
   goal:'Study the two sensor sources, then tap NEXT', objective:TUT_OBJECTIVE.ACK},

  {id:'sound',title:'Work the hydrophones',
   body:'Open <b>SND</b>. The passive hydrophones are directional: use <b>◀ Train / Train ▶</b> (or drag) until the screw noise is centred, then press <b>✚ Mark Bearing</b>. One mark is a line of bearing, not a magic range; after you move the boat, a second mark can triangulate a much better plot.<br><br><b>◉ Echo Range</b> sends an active QC ping and can give a short-range range fix — but every escort can hear the transmission. <b>SJ Radar</b> switches this station to surface-search radar only on patrol dates when the set is fitted. Slow or stop if your own screws are masking contacts.',
   goal:'Centre the screws and make one SOUND bearing mark', sta:'SOUND', hl:'soundControls', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareSoundLesson(),
   check:(s,T)=>T.soundMarkCount(s)>T._soundMarks0},

  {id:'track',title:'Reading a contact',
   body:'Each contact is a <b>track</b>, not a certainty:<br>• dashed circle = estimated position, the circle shrinks as you get surer<br>• solid arrow = confirmed position and course<br>• <b>C%</b> = confidence, <b>VISUAL</b> or <b>HYDROPHONE</b> = how you are seeing it, and the seconds since the last update<br><br>Keep watching it — confidence grows the longer you hold contact. In this lesson, take a moment to read the symbols before moving on; the crew may already have improved the track while you were working the sound bearing.',
   goal:'Study the contact symbols, then tap NEXT', objective:TUT_OBJECTIVE.ACK},

  {id:'scope',title:'The periscope',
   body:'Switch to <b>SCOPE</b> and drag left/right to train it. The number tape across the top is the bearing you are looking at, double-tap switches between the historically appropriate <b>1.5×</b> and <b>6×</b> powers.<br><br>Put the ship near the crosshair. The horizontal ladder on the vertical wire is a stadimeter scale — bigger ship in the optic means closer.',
   goal:'Train the scope onto the ship (within 10°)', sta:'PERISCOPE', hl:'ovlStations', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareScopeLesson(),
   check:(s,T)=>{
     const c=T.target(s); if(!c) return false;
     return Math.abs(shortDelta(s.tactical.periscopeBearing,bearingBetween(s.playerSub.position,c.position)))<10;}},

  {id:'lock',title:'Feeding the TDC',
   body:'The <b>Torpedo Data Computer</b> needs four numbers: bearing, range, the target\'s course and its speed.<br><br>Tap the ship in the optic — or use the <b>🎯 LOCK</b> button — and the current track is handed to the TDC automatically. On the map a tap on a contact does the same.',
   goal:'Lock the ship into the TDC', hl:'oLock', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareLockLesson(),
   check:s=>!!s.tdc.targetId},

  {id:'tdc',title:'Reading the solution',
   body:'The TDC now shows:<br>• <b>GYRO</b> — how far the torpedo turns after launch. Small angles are best; ±90° shots rarely work.<br>• <b>AoB</b> — angle on the bow, how much side of the target you can see. Near 90° is the fat broadside shot.<br>• <b>RUN</b> — seconds until impact.<br>• <b>SOL %</b> — overall quality, from contact confidence, range and gyro angle. Below 25% the crew refuses to shoot.<br><br>Hold the contact, close the range, and keep the gyro angle small.',
   goal:'Read the solution values, then tap NEXT', pane:'paneAttack', objective:TUT_OBJECTIVE.ACK},

  {id:'flood',title:'Flooding tubes',
   body:'A torpedo cannot leave a dry tube. In the <b>Attack</b> tab, tap a tube tile to flood it (blue = flooded and ready). Tubes 1–4 fire forward, 5–6 fire aft.<br><br>Flooding makes the tube ready; a selected live TDC track continues to update the firing solution until the instant you shoot.',
   goal:'Flood a tube', pane:'paneAttack', hl:'mTubes', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareFloodLesson(),
   check:s=>s.weapons.tubes.some(t=>t.status==='READY')},

  {id:'fire',title:'Shoot',
   body:'Tap a ready tube again to fire it, use <b>Fwd Spread</b> for everything at once, or hit the big <b>FIRE</b> button on the picture — it fires the first ready tube and shows the solution percentage. FIRE never floods a tube for you: if none is ready, it tells you to return here and flood one first.<br><br>Flood several tubes if you want several quick shots. A spread of two or three covers errors in the target\'s speed. Torpedoes reload in about two minutes.',
   goal:'Fire a torpedo', hl:'btnFire', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareFireLesson(),
   check:(s,T)=>T.fireLessonSatisfied(s)},

  {id:'impact',title:'The run',
   body:'Watch the torpedo on the map — the white line is its wake, which the enemy can spot too. A Mark 14 runs at 46 kn, so a 2 nm shot takes about 2½ minutes. Use the time-scale button if you are impatient.<br><br>Historically about a quarter of Mark 14s were duds; training has that switched off, but in a real patrol you can choose the dud rate in the Attack tab.',
   goal:'Score a hit', objective:TUT_OBJECTIVE.STATE,
   check:(s,T)=>s.weapons.hits.length>T._fireHits0},

  {id:'deckgun',title:'The 3-inch deck gun',
   body:'The deck gun is for a surfaced boat and is best used against a small or already-crippled target — not while an escort is bearing down on you. Training has put a harmless hulk ahead.<br><br>Enter <b>GUN</b>; the crew mans it automatically. Drag left/right for quick training. Vertical drag is deliberately coarse. Press <b>🎯 LAY</b> for the crew&apos;s range lay, then use the right-hand <b>ELEV slider</b> or ELEV+/− for tenths of a degree before firing. The sight ring moves vertically with the actual gun elevation.',
   goal:'Lay the deck gun and fire one practice round', sta:'DECK_GUN', hl:'gunElevPanel', objective:TUT_OBJECTIVE.FRESH,
   enter:T=>T.prepareGunLesson(),
   check:(s,T)=>(s.weapons.deckGun?.shots||0)>T._gunShots0},

  {id:'escortbrief',title:'Next exercise: evade an escort',
   body:'Your practice round is complete. <b>No escort is attacking yet.</b> Use this pause to find the depth and silent-running controls before you continue.<br><br>When you tap NEXT, an escort will be vectored onto your last known position and will begin searching with active sonar. Your first priorities will be: <b>silent running</b>, reduce speed, get <b>below 150 ft</b> (preferably under the thermal layer), and alter course after she loses contact.',
   goal:'Tap NEXT only when you are ready to start the escort exercise', sta:'TACTICAL', pane:'paneHelm', objective:TUT_OBJECTIVE.ACK},

  {id:'evade',title:'Now they know',
   body:'An escort has been vectored onto your launch point and is pinging. Four things save you, and they all work:<br>• <b>🔇 Silent running</b> and <b>slow</b> — she hunts noise<br>• <b>Get under the thermal layer</b> — the dashed blue line on the depth column. Below it her echoes go weak<br>• <b>Alter course</b> — her plot is built from successive echoes; every turn breaks it, and a hard turn leaves a knuckle of churned water that takes the echo instead of you<br>• <b>Wait her out</b> — she carries a finite number of charges, and her own explosions leave her deaf for half a minute<br><br>Watch the header: <b>SONAR: THEY HOLD YOU</b> means she has a firm echo. When it says <b>CONTACT LOST</b>, change depth and course before she finds you again.',
   goal:'Silent running on and below 150 ft', sta:'TACTICAL', pane:'paneHelm', hl:'oSilent', objective:TUT_OBJECTIVE.STATE,
   enter:T=>T.spawnEscort(),
   check:s=>s.playerSub.stealth.silentRunning&&s.playerSub.depthFeet>140},

  {id:'air',title:'Aircraft, and the gun',
   body:'Aeroplanes are the thing that kills submarines. A boat on the surface is visible from the air for miles, and the only real answer is <b>dive</b> — depth is what saves you. The crew now handles SD air-search radar automatically while it can be used.<br><br>The <b>20 mm</b> is an automatic last-ditch fallback, not another switch for the skipper. If an attack gets close while you are still surfaced, the crew mans it and tries to spoil the pilot\'s aim. Order a dive at any time: the crew clears the deck automatically, but the boat may be held for a few tense seconds until the hatch is shut.<br><br>Your decision is simply the important one: <b>stay and fight, or dive</b>.',
   goal:'Tap NEXT — you will not want to practise this one', objective:TUT_OBJECTIVE.ACK},

  {id:'systems',title:'Status, damage and radio',
   body:'The <b>Status</b> tab is where you check hull, flooding, battery, fuel, stores, mission objectives, radio traffic and the Captain&apos;s Log. Damage-control parties work automatically, but you can choose their repair priority; pumps help flooding at the cost of extra noise.<br><br>Not every patrol uses every system. Historical refits decide whether SJ radar is fitted, mission orders can be convoy attack, reconnaissance, lifeguard, transport or minelaying, and the green friendly rendezvous is your place to service the boat or end a successful patrol.',
   goal:'Tap NEXT when you know where to check the boat and your orders', objective:TUT_OBJECTIVE.ACK},

  {id:'done',title:'Qualified',
   body:'That is the whole loop: <b>find</b> with sonar and periscope, <b>build</b> a track, <b>feed</b> the TDC, <b>flood</b>, <b>shoot</b>, then <b>disappear</b>.<br><br>When the patrol changes to <b>RETURN TO BASE</b>, head for the green friendly rendezvous. Enter its 0.30 nm ring <b>surfaced</b> and order <b>Stop</b>; service or final return happens immediately once the boat is stopped in the harbor ring.<br><br>Good hunting, skipper.',
   goal:'Tap FINISH to pick a real patrol', objective:TUT_OBJECTIVE.ACK}
];

class Tutorial{
  constructor(game,cv,tc){
    this.game=game;this.cv=cv;this.tc=tc;
    this.active=false;this.idx=0;this.doneAt=0;this.lastRender='';
    const g=id=>document.getElementById(id);
    g('tutNext')?.addEventListener('click',()=>this.next());
    g('tutQuit')?.addEventListener('click',()=>this.stop(true));
    ['tutStartBtn','mTutorial','tutHelpBtn'].forEach(id=>g(id)?.addEventListener('click',()=>{
      sceneSelector.close();document.getElementById('hotkeyOverlay')?.classList.remove('open');
      this.start();
    }));
    /* The whole title row is the grip. Tapping it folds the card away —
       and once the skipper has folded or unfolded it himself, we stop
       second-guessing him for the rest of that step. */
    g('coachBar')?.addEventListener('click',()=>{
      if(!this.active) return;
      const c=g('coach'); if(!c) return;
      this.userMin=!c.classList.contains('min');
      clearTimeout(this._minT);
      this.layout();
      buzz(8);
    });
    window.addEventListener('resize',()=>{if(this.active)this.layout();},{passive:true});
    window.addEventListener('orientationchange',()=>{if(this.active)setTimeout(()=>this.layout(),260);},{passive:true});
    /* Touching anything outside the card while it is open folds it — the
       natural gesture when the thing is in your way is to reach past it. */
    window.addEventListener('pointerdown',e=>{
      if(!this.active) return;
      const c=g('coach');
      if(!c||c.classList.contains('min')||!this.narrow()) return;
      // On a read-only step the only way on is the NEXT button inside the
      // card, so folding it would strand the skipper. Only fold when the
      // step wants him to touch something else anyway.
      if(!TUT_STEPS[this.idx]?.check) return;
      if(c.contains(e.target)) return;
      this.userMin=true;clearTimeout(this._minT);this.layout();
    },{passive:true,capture:true});
  }

  /* Is the screen narrow enough that a full card is genuinely in the way?
     A phone upright, essentially — a tablet has room for both. */
  narrow(){
    const w=typeof innerWidth==='number'?innerWidth:960;
    const h=typeof innerHeight==='number'?innerHeight:560;
    return !!(this.tc&&this.tc.touch)&&(h>w||w<680);
  }

  /* Fold state and dock side, worked out from the step and the screen. */
  layout(){
    const c=document.getElementById('coach');
    if(!c||!this.active) return;
    const st=TUT_STEPS[this.idx];
    const done=!!this.doneAt;
    let min;
    if(this.userMin!==null&&this.userMin!==undefined) min=this.userMin;
    else min=this.narrow()&&!!st.check&&!done&&this._readDone===this.idx;
    c.classList.toggle('min',!!min);

    /* Dodge: if the card covers the very control we are pointing at, send it
       to the other end of the screen. If neither end is clear — a tall step
       on a small phone — fold it instead, which always clears. */
    const hl=this.hlEl;
    if(hl&&hl.getBoundingClientRect){
      const r=hl.getBoundingClientRect();
      if(r.width||r.height){
        const clear=up=>{
          c.classList.toggle('up',up);
          const b=c.getBoundingClientRect();
          return !(b.top<r.bottom&&b.bottom>r.top&&b.left<r.right&&b.right>r.left);
        };
        const cur=c.classList.contains('up');
        if(!clear(cur)&&!clear(!cur)){
          c.classList.toggle('up',cur);
          if(!min){c.classList.add('min');min=true;}
          if(!clear(cur)) clear(!cur);
        }
      }
    }
  }

  target(s){return s.world.contacts.find(c=>c.id==='TGT-1'&&!c.sunk)||s.world.contacts.find(c=>c.type!=='ESCORT'&&!c.sunk);}

  /* controlled sandbox: one slow merchant, good weather, no duds */
  setupScenario(){
    const g=this.game;
    g.dispatch({type:'NEW_PATROL',areaKey:'Java Sea'});
    g.update(0.001);                       // drain the command queue
    const s=g.getSnapshot();
    s.time.elapsedSeconds=0;s.time.timeScale=1;
    s.world.contacts=[{
      id:'TGT-1',name:'Kaiyo Maru',type:'MERCHANT',lengthYards:430,
      visualProfile:1.05,acousticBase:0.42,tonsFactor:5000,
      position:{xNm:2.6,yNm:-3.4},heading:262,speedKnots:8,
      convoyRole:'MERCHANT',formationIndex:0
    }];
    s.world.contactTracks={};s.world.depthCharges=[];
    s.weapons.activeTorpedoes=[];s.weapons.hits=[];s.weapons.duds=[];s.weapons.explosions=[];
    s.weapons.torpedoInventory=16;
    for(const t of s.weapons.tubes){t.status='LOADED_DRY';t.flooded=false;t.reloadProgress=1;}
    s.world.environment={daylight:0.9,visibilityNm:16,seaState:0.15,weather:'CLEAR',_baseVisibilityNm:16};
    s.world.enemy={alertState:'UNAWARE',alertTimerSec:0,lastKnownSubPosition:null,lastKnownConfidence:0,
      searchPattern:'RANDOM',searchCenter:{xNm:0,yNm:0},searchAngle:0};
    s.tdc.dudMode='none';s.tdc.targetId=null;s.tdc.solutionQuality=0;
    s.tactical.selectedTrackId=null;s.tactical.activeStation='TACTICAL';s.tactical.periscopeBearing=20;
    s.map.plottedCourse=[];s.map.ownshipTrail=[];s.map.exploredCells={};
    const sub=s.playerSub;
    sub.position={xNm:0,yNm:0};sub.heading=20;sub.orderedHeading=20;
    sub.depthFeet=0;sub.orderedDepthFeet=0;sub.verticalSpeedFps=0;
    sub.propulsion.orderedRpm=0;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;
    sub.propulsion.fuel=100;sub.propulsion.battery=100;sub.propulsion.chargeRate=0;sub.cannotHoldDepth=false;sub._nhdWarned=false;
    sub.stealth.silentRunning=false;
    Object.assign(sub.damage,{hullIntegrity:100,flooding:0,ballastDamage:0,motorDamage:0,
      rudderDamage:0,periscopeDamage:0,tdcDamage:0,gyroDamage:0,pumpDamage:0,electricalDamage:0,
      oxygen:100,pumpActive:false,pumpTripped:false,pumpLoadSec:0,damageControlActive:false,
      repairPriority:'FLOODING',driveBankOffline:false,damageEventSeq:0,repairFloor:{},instrumentBias:{}});
    s.campaign.missionStatus='TRAINING';
    s.campaign.objectives=[
      {text:'Find the merchant',done:false},{text:'Sink it',done:false},
      {text:'Evade the escort',done:false},{text:'Finish the training',done:false}];
    s.log=[{t:0,level:'warn',message:'=== TRAINING PATROL — Java Sea ==='}];
    const sel=document.getElementById('mDudSel');if(sel)sel.value='none';
  }

  soundMarkCount(s){
    const marks=s?.world?.sound?.bearingMarks||{};return Object.values(marks).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
  }

  objectiveKind(st){return st?.objective||(st?.check?TUT_OBJECTIVE.STATE:TUT_OBJECTIVE.ACK);}

  rawObjectiveSatisfied(st,state){
    if(!st?.check)return false;
    try{return !!st.check(state,this);}catch(e){return false;}
  }

  armObjective(st){
    this._freshArmed=true;
    if(this.objectiveKind(st)!==TUT_OBJECTIVE.FRESH)return;
    // Fresh-action lessons are deliberately entered in an unmet state. This
    // latch is a final guard against a future refactor accidentally making a
    // new lesson arrive already green: it then has to become false once before
    // it is allowed to complete.
    const initiallyDone=this.rawObjectiveSatisfied(st,this.game.getSnapshot());
    this._freshArmed=!initiallyDone;
    if(initiallyDone&&typeof console!=='undefined')console.warn(`Training fresh-action objective entered pre-satisfied: ${st.id}`);
  }

  prepareStationsLesson(){
    this.game.dispatch({type:'SET_ACTIVE_STATION',station:'TACTICAL'});
  }

  prepareMapLesson(){
    const s=this.game.getSnapshot();s.map.plottedCourse=[];s.map.autoFollowPlot=false;
  }

  prepareHelmLesson(){
    const s=this.game.getSnapshot(),sub=s.playerSub;
    s.map.autoFollowPlot=false;sub.orderedHeading=20;
    this.tc?.setHeadingSlider?.(20);
  }

  prepareSpeedLesson(){
    const s=this.game.getSnapshot(),sub=s.playerSub;
    sub.propulsion.orderedRpm=0;
    const m=document.getElementById('mRpm'),d=document.getElementById('rpmInput');
    if(m)m.value=0;if(d)d.value=0;
  }

  prepareDepthLesson(){
    const s=this.game.getSnapshot(),sub=s.playerSub;
    // Do not teleport the boat. Only reset the order so the skipper must issue
    // the 55 ft command during this lesson; if already near 55 ft, pressing the
    // control is still a real fresh action and may complete immediately.
    sub.orderedDepthFeet=0;
    const m=document.getElementById('mDpt'),d=document.getElementById('depthInput');
    if(m)m.value=0;if(d)d.value=0;
  }

  prepareSoundLesson(){
    const s=this.game.getSnapshot(),sub=s.playerSub;
    // A quiet boat makes the first hydrophone lesson deterministic rather than
    // teaching the player through an own-screw masking warning.
    sub.propulsion.orderedRpm=0;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.maneuveringThrust=0;
    this._soundMarks0=this.soundMarkCount(s);
  }

  prepareScopeLesson(){
    const s=this.game.getSnapshot(),c=this.target(s);if(!c)return;
    // Make this an actual optics exercise even when the crew has already built
    // a strong 360° visual track at periscope depth. Crew awareness and where
    // the player is physically pointing the scope are intentionally separate.
    const br=bearingBetween(s.playerSub.position,c.position);
    s.tactical.periscopeBearing=normDeg(br+48);
  }

  prepareLockLesson(){
    const s=this.game.getSnapshot();
    s.tdc.targetId=null;s.tdc.autoTrack=false;s.tdc.trackSource=null;
    s.tactical.selectedTrackId=null;
  }

  prepareFloodLesson(){
    const s=this.game.getSnapshot();
    // Training owns this sandbox. Re-arm the lesson so a tube flooded while
    // exploring ATTACK cannot make the instruction arrive already completed.
    for(const t of s.weapons.tubes||[]){
      if(t.status!=='RELOADING'&&t.status!=='EMPTY'){
        t.status='LOADED_DRY';t.flooded=false;t.reloadProgress=1;
      }
    }
  }

  prepareFireLesson(){
    const s=this.game.getSnapshot();
    this._fireInventory0=Number(s.weapons.torpedoInventory)||0;
    this._fireHits0=(s.weapons.hits||[]).length;
    this._fireActive0=new Set((s.weapons.activeTorpedoes||[]).map(t=>t.id));
  }

  fireLessonSatisfied(s){
    if((Number(s.weapons.torpedoInventory)||0)<this._fireInventory0)return true;
    if((s.weapons.hits||[]).length>this._fireHits0)return true;
    return (s.weapons.activeTorpedoes||[]).some(t=>!this._fireActive0?.has(t.id));
  }

  prepareGunLesson(){
    const s=this.game.getSnapshot(),sub=s.playerSub,W=s.world,now=s.time.elapsedSeconds||0;
    sub.depthFeet=0;sub.orderedDepthFeet=0;sub.verticalSpeedFps=0;sub.mode='SURFACED';
    sub.propulsion.orderedRpm=0;sub.propulsion.actualRpm=0;sub.propulsion.speedKnots=0;sub.maneuveringThrust=0;
    let c=W.contacts.find(q=>q.id==='GUN-T');
    if(!c){
      const b=degToRad(sub.heading),d=.82;c={id:'GUN-T',name:'Training Hulk',type:'PATROL_CRAFT',displayType:'PATROL CRAFT',lengthYards:145,visualProfile:.9,acousticBase:.1,tonsFactor:0,
        position:{xNm:sub.position.xNm+Math.sin(b)*d,yNm:sub.position.yNm-Math.cos(b)*d},heading:normDeg(sub.heading+90),speedKnots:0,desiredSpeed:0,stationary:true,side:'ENEMY'};
      W.contacts.push(c);
    }
    W.contactTracks[c.id]={id:c.id,typeEstimate:'PATROL CRAFT',affiliation:'ENEMY',bearing:bearingBetween(sub.position,c.position),rangeEstimateNm:distNm(sub.position,c.position),
      courseEstimate:c.heading,speedEstimateKnots:0,confidence:1,source:'VISUAL',lastSensorSource:'VISUAL',lastUpdated:now,staleSeconds:0,contactType:c.type,lengthYards:c.lengthYards,
      plotPosition:{...c.position},lastFixPosition:{...c.position},lastFixTime:now,plotUpdatedAt:now,positionFixAt:now,positionSource:'VISUAL',positionConfidence:1,positionUncertaintyNm:.01,visualHullConfirmed:true,hullConfirmedAt:now,visualLastSeenAt:now};
    s.tactical.selectedTrackId=c.id;s.tdc.targetId=c.id;s.tdc.autoTrack=true;s.tdc.trackSource='VISUAL';
    this._gunShots0=s.weapons.deckGun?.shots||0;
  }

  spawnEscort(){
    const s=this.game.getSnapshot(), sub=s.playerSub;
    s.world.contacts=s.world.contacts.filter(c=>c.id!=='GUN-T');delete s.world.contactTracks?.['GUN-T'];
    if(s.world.contacts.some(c=>c.id==='ESC-T')) return;
    const b=degToRad(normDeg(sub.heading+150));
    s.world.contacts.push({
      id:'ESC-T',name:'Patrol Vessel',type:'ESCORT',lengthYards:290,
      visualProfile:0.7,acousticBase:0.6,tonsFactor:0,
      position:{xNm:sub.position.xNm+Math.sin(b)*2.4,yNm:sub.position.yNm-Math.cos(b)*2.4},
      heading:normDeg(sub.heading-30),speedKnots:14,
      convoyRole:'ESCORT_FWD',formationIndex:0,zigzagPhase:0,zigzagTimer:0,dcRemaining:24+Math.floor(Math.random()*18)
    });
    s.world.enemy.alertState='SEARCHING';
    s.world.enemy.alertTimerSec=0;
    s.world.enemy.lastKnownSubPosition={...sub.position};
    s.world.enemy.lastKnownConfidence=0.7;
    s.world.enemy.searchCenter={...sub.position};
    audio.playSonarPing();
  }

  start(){
    this.setupScenario();
    this.active=true;this.idx=0;this.doneAt=0;
    this._freshArmed=true;
    this.userMin=null;this._readDone=-1;clearTimeout(this._minT);
    document.getElementById('briefingOverlay').style.display='none';
    document.getElementById('coach')?.classList.add('on');
    this.tc.setPane?.('view');
    this.enter();
    Toast.ok('Training patrol started');
  }

  stop(byUser){
    this.active=false;
    clearTimeout(this._minT);
    document.getElementById('coach')?.classList.remove('on','min','up');
    this.clearHl();
    if(byUser) Toast.ok('Training ended');
  }

  next(){
    if(this.idx>=TUT_STEPS.length-1){this.stop();sceneSelector.open();return;}
    this.idx++;this.doneAt=0;this.enter();
  }

  enter(){
    const st=TUT_STEPS[this.idx];
    if(st.sta) this.game.dispatch({type:'SET_ACTIVE_STATION',station:st.sta});
    if(st.pane&&this.tc.touch) this.tc.setPane(st.pane);
    if(st.enter) st.enter(this);
    this.armObjective(st);
    this.applyHl(st.hl);
    this.render(true);
    /* A new step always opens: you have to be able to read it. Then, if it
       asks you to DO something on a small screen, it folds itself away after
       long enough to read — the controls are the point, not the card. */
    this.userMin=null;
    this._readDone=-1;
    clearTimeout(this._minT);
    this.layout();
    if(st.check&&this.narrow()){
      const words=String(st.body||'').replace(/<[^>]*>/g,' ').split(/\s+/).length;
      const readMs=clamp(4500+words*150,6500,15000);
      const forStep=this.idx;
      this._minT=setTimeout(()=>{
        if(!this.active||this.idx!==forStep||this.userMin!==null) return;
        this._readDone=forStep;
        this.layout();
      },readMs);
    }
    buzz(10);
  }

  applyHl(id){
    this.clearHl();
    if(!id) return;
    const el=document.getElementById(id);
    if(el){el.classList.add('tut-hl');this.hlEl=el;}
  }
  clearHl(){if(this.hlEl){this.hlEl.classList.remove('tut-hl');this.hlEl=null;}}

  update(state){
    if(!this.active) return;
    const st=TUT_STEPS[this.idx];
    const kind=this.objectiveKind(st);
    let ok=false;
    if(st.check){
      const raw=this.rawObjectiveSatisfied(st,state);
      if(kind===TUT_OBJECTIVE.FRESH){
        if(!this._freshArmed){
          if(!raw)this._freshArmed=true;
          ok=false;
        }else ok=raw;
      }else ok=raw;
    }
    if(ok&&st.check&&!this.doneAt){
      this.doneAt=performance.now();
      audio.playWaypoint();buzz([15,40,15]);
      // Objective complete: open the lesson so the player can read the result.
      // Progress is deliberately manual; a pre-satisfied objective must never
      // consume the next explanation before a new player can read it.
      clearTimeout(this._minT);this.userMin=null;this._readDone=-1;
      this.render(true);this.layout();
    }
    this.render(false);
  }

  render(force){
    const st=TUT_STEPS[this.idx];
    const done=!!this.doneAt;
    const sig=`${this.idx}|${done}`;
    if(!force&&sig===this.lastRender) return;
    this.lastRender=sig;
    const g=id=>document.getElementById(id);
    const t=g('tutTitle'),b=g('tutBody'),go=g('tutGoal'),pr=g('tutProg'),nx=g('tutNext');
    if(t) t.textContent=st.title;
    if(b) b.innerHTML=st.body;
    if(go){
      go.innerHTML=st.goal?`<span class="tick">${st.check?(done?'✓':'○'):'›'}</span> ${st.goal}`:'';
      go.classList.toggle('done',done);
    }
    if(pr) pr.textContent=`${this.idx+1}/${TUT_STEPS.length}`;
    if(b&&!this.tc.touch) b.innerHTML+='<br><br><span style="color:var(--alert)">Desktop layout: '+
      'the Helm and Attack tabs do not exist here — use the Bridge panel on the left instead. '+
      'Tap <b>⇄ TOUCH UI</b> in the header for the tablet interface.</span>';
    if(nx) nx.textContent=this.idx>=TUT_STEPS.length-1?'FINISH':(done?'CONTINUE ▸':(st.check?'SKIP ▸':'NEXT ▸'));
  }
}

