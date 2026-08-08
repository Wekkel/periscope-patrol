#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}

const jsFiles=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&jsFiles.push(p)}})(path.join(root,'js'));
for(const f of jsFiles){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr.trim());process.exit(1)}}
pass('JavaScript syntaxcheck',{files:jsFiles.length});
const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert('damage-control priority UI + new runtime module are wired in HTML',
  ['dcFloodButton','dcPropButton','dcSteerButton','dcOpticsButton','mDcFlood','mDcProp','mDcSteer','mDcOptics','mDcStatus'].every(id=>indexHtml.includes(`id="${id}"`))&&
  indexHtml.includes('./js/simulation/damage-control.js')&&!/Toggle Damage Control/i.test(indexHtml),
  {priorityButtons:8,module:indexHtml.includes('./js/simulation/damage-control.js'),oldToggle:/Toggle Damage Control/i.test(indexHtml)});

const store=new Map(),els=new Map();
const el=id=>{if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},querySelectorAll:()=>[]});return els.get(id)};
const base={console,Math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},
 particles:{draw(){},update(){},spawnWake(){},spawnExplosion(){}},navigator:{deviceMemory:8},
 window:{devicePixelRatio:1},document:{hidden:false,documentElement:{dataset:{lay:'desk'}},getElementById:el,querySelectorAll:()=>[]},innerWidth:1280,innerHeight:800};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js',
 'js/simulation/weapons/tdc-math.js','js/core/state.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js',
 'js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js',
 'js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js',
 'js/simulation/physics-navigation.js','js/core/game.js','js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js',
 'js/rendering/periscope-3d.js','js/rendering/map.js','js/ui/dom-view.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const result=vm.runInContext(`(()=>{
 const out={};
 const mk=seed=>{const s=createState('Solomon Sea');s.campaign.scenarioSeed=seed;s.world.contacts=[];s.world.terrain=[];s.world.convoyRoutes=[];s.world.ports=[];const e=new SimEngine(s,new CommandBus());e.ensureDamageState();return{s,e};};
 const pick=d=>({tdcDamage:d.tdcDamage,gyroDamage:d.gyroDamage,pumpDamage:d.pumpDamage,electricalDamage:d.electricalDamage,periscopeDamage:d.periscopeDamage,
   driveBankOffline:d.driveBankOffline,bias:d.instrumentBias,repairFloor:d.repairFloor});

 // Same seed + same shock sequence must make exactly the same subsystem casualty pattern and calibration errors.
 {const A=mk(4242),B=mk(4242);A.e.applyShock(36);B.e.applyShock(36);out.repro={a:pick(A.s.playerSub.damage),b:pick(B.s.playerSub.damage)};}

 // Existing rudder penalty remains physical and measurable.
 {const A=mk(10),B=mk(10);for(const X of [A,B]){X.s.playerSub.heading=0;X.s.playerSub.orderedHeading=90;X.s.playerSub.propulsion.speedKnots=12;}B.s.playerSub.damage.rudderDamage=.72;
  A.e.updateHeading(A.s.playerSub,10);B.e.updateHeading(B.s.playerSub,10);out.rudder={cleanDeg:A.s.playerSub.heading,damagedDeg:B.s.playerSub.heading};}

 // Ballast damage slows a dive and adds stable trim error rather than random hunting.
 {const A=mk(11),B=mk(11);for(const X of [A,B]){const q=X.s.playerSub;q.depthFeet=0;q.orderedDepthFeet=120;q.propulsion.speedKnots=8;q.verticalSpeedFps=0;}B.s.playerSub.damage.ballastDamage=.75;B.e.ensureDamageState();
  for(let i=0;i<30;i++){A.e.updateDepth(A.s.playerSub,1);B.e.updateDepth(B.s.playerSub,1);}out.ballast={cleanDepth:A.s.playerSub.depthFeet,damagedDepth:B.s.playerSub.depthFeet,trimBias:B.s.playerSub.damage.instrumentBias.ballastTrimFps};}

 // TDC and gyro error is fixed until repair: two updates give the identical wrong answer.
 {const A=mk(5150),B=mk(5150);const tr={id:'T1',bearing:40,rangeEstimateNm:3.2,courseEstimate:120,speedEstimateKnots:10,confidence:.92};
  for(const X of [A,B]){X.s.world.contactTracks={T1:{...tr}};X.s.tdc.targetId='T1';X.s.playerSub.heading=20;X.e.updateTdc();}
  const clean=A.s.tdc.gyroAngle;B.s.playerSub.damage.tdcDamage=.62;B.s.playerSub.damage.gyroDamage=.70;B.e.ensureDamageState();B.e.updateTdc();const first=B.s.tdc.gyroAngle;B.e.updateTdc();const second=B.s.tdc.gyroAngle;
  out.fireControl={clean,first,second,bias:B.s.playerSub.damage.instrumentBias,solution:B.s.tdc.solutionQuality};}

 // Pumps lower flooding but remain acoustically expensive; damage reduces their pumping capacity.
 {const off=mk(21),on=mk(21);for(const X of [off,on]){const d=X.s.playerSub.damage;d.flooding=.60;d.pumpDamage=.40;d.repairPriority='PROPULSION';X.e.ensureDamageState();}on.s.playerSub.damage.pumpActive=true;
  off.e.updateDmgCtrl(off.s.playerSub,120);on.e.updateDmgCtrl(on.s.playerSub,120);off.e.updateSigs(off.s.playerSub);on.e.updateSigs(on.s.playerSub);
  out.pumps={offFlooding:off.s.playerSub.damage.flooding,onFlooding:on.s.playerSub.damage.flooding,offNoise:off.s.playerSub.stealth.acousticSignature,onNoise:on.s.playerSub.stealth.acousticSignature,capacity:1-on.s.playerSub.damage.pumpDamage*.78};}

 // Repair priority must dominate stabilization elsewhere.
 {const P=mk(31),S=mk(31);for(const X of [P,S]){const d=X.s.playerSub.damage;Object.assign(d,{motorDamage:.50,electricalDamage:.50,rudderDamage:.50,periscopeDamage:.50,tdcDamage:.50,gyroDamage:.50,pumpDamage:.50,flooding:.30});X.e.ensureDamageState();}
  P.e.setRepairPriority('PROPULSION');S.e.setRepairPriority('STEERING');P.e.updateDmgCtrl(P.s.playerSub,180);S.e.updateDmgCtrl(S.s.playerSub,180);
  out.priority={propulsion:{motor:P.s.playerSub.damage.motorDamage,rudder:P.s.playerSub.damage.rudderDamage,electrical:P.s.playerSub.damage.electricalDamage},steering:{motor:S.s.playerSub.damage.motorDamage,rudder:S.s.playerSub.damage.rudderDamage,electrical:S.s.playerSub.damage.electricalDamage}};}

 // Severe damage has an at-sea repair floor.
 {const X=mk(41),d=X.s.playerSub.damage;d.periscopeDamage=.92;X.e._fieldRepairFloor('periscopeDamage',d.periscopeDamage);X.e.setRepairPriority('OPTICS_FIRE_CONTROL');X.e.updateDmgCtrl(X.s.playerSub,4000);out.fieldRepair={floor:d.repairFloor.periscopeDamage,remaining:d.periscopeDamage};}

 // A badly hurt pump trips under sustained load and stays off until repaired/reset.
 {const X=mk(51),d=X.s.playerSub.damage;Object.assign(d,{pumpDamage:.80,flooding:.65,pumpActive:true,repairPriority:'PROPULSION'});X.e.ensureDamageState();X.e.updateDmgCtrl(X.s.playerSub,30);out.pumpTrip={tripped:d.pumpTripped,active:d.pumpActive,damage:d.pumpDamage};}

 // One drive bank offline is a persistent propulsion casualty with a real speed cost.
 {const A=mk(61),B=mk(61);for(const X of [A,B]){const q=X.s.playerSub;q.depthFeet=40;q.propulsion.orderedRpm=400;q.propulsion.actualRpm=0;}B.s.playerSub.damage.driveBankOffline=true;
  A.e.updatePropulsion(A.s.playerSub,8);B.e.updatePropulsion(B.s.playerSub,8);out.driveBank={cleanKn:A.s.playerSub.propulsion.speedKnots,offlineKn:B.s.playerSub.propulsion.speedKnots,actualRpm:B.s.playerSub.propulsion.actualRpm};}

 // Optical degradation is a renderer-level effect: light scratches, then blur, then near-loss of image.
 {const fakeCtx=(()=>{const stack=[];return{filter:'none',fillStyle:'',strokeStyle:'',lineWidth:1,setTransform(){},save(){stack.push(this.filter)},restore(){this.filter=stack.pop()??'none'},beginPath(){},arc(){},clip(){},fillRect(){}}})();
  const fakeCanvas={width:800,height:600,clientWidth:800,clientHeight:600,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})};
  const cv=new CanvasView(fakeCanvas);cv.setupCam=()=>({horizonY:300,fovDeg:32,f:1000,cx:400,cy:300,r:240});cv.drawScopeFrame=()=>{};cv.drawScopeHUD=()=>{};
  const run=dmg=>{const x=mk(71);x.s.playerSub.damage.periscopeDamage=dmg;x.e.ensureDamageState();let overlay=false,severe=false,scene=false,filter='';cv.drawScopeScene=(c)=>{scene=true;filter=c.filter};cv.drawScopeDamageOverlay=()=>{overlay=true};cv.drawScopeDamaged=()=>{severe=true};cv.drawPeriscope(fakeCtx,800,600,x.s);return{profile:scopeOpticProfile(dmg),overlay,severe,scene,filter}};
  out.optics={light:run(.16),moderate:run(.58),heavy:run(.95)};}

 // UI reports the new subsystem state and selected priority, not only a hidden simulation field.
 {const X=mk(81),d=X.s.playerSub.damage;Object.assign(d,{tdcDamage:.41,gyroDamage:.32,pumpDamage:.27,electricalDamage:.36,repairPriority:'OPTICS_FIRE_CONTROL'});const v=new DomView();v.renderDamage(X.s.playerSub);out.ui={html:document.getElementById('damageReport').innerHTML};}

 // Pre-Phase-3 saves migrate on first engine update without changing the save format.
 {const X=mk(91),legacy=JSON.parse(JSON.stringify(X.s));legacy.playerSub.damage.periscopeDamage=.90;for(const k of ['tdcDamage','gyroDamage','pumpDamage','electricalDamage','repairPriority','driveBankOffline','pumpTripped','pumpLoadSec','damageEventSeq','repairFloor','instrumentBias'])delete legacy.playerSub.damage[k];
  const E=new SimEngine(legacy,new CommandBus());E.update(0);const d=legacy.playerSub.damage;out.migration={tdcDamage:d.tdcDamage,gyroDamage:d.gyroDamage,pumpDamage:d.pumpDamage,electricalDamage:d.electricalDamage,repairPriority:d.repairPriority,driveBankOffline:d.driveBankOffline,pumpTripped:d.pumpTripped,legacyPeriscopeFloor:d.repairFloor.periscopeDamage};}
 return out;
})()`,ctx);

assert('same damage seed reproduces subsystem casualty pattern + instrument biases',JSON.stringify(result.repro.a)===JSON.stringify(result.repro.b),result.repro);
assert('damaged rudder turns materially slower',result.rudder.damagedDeg<result.rudder.cleanDeg*.7,result.rudder);
assert('ballast damage materially slows dive and carries stable trim bias',result.ballast.damagedDepth<result.ballast.cleanDepth*.8&&Math.abs(result.ballast.trimBias)>0,result.ballast);
assert('damaged TDC/gyro has measurable but perfectly consistent bias',Math.abs(result.fireControl.first-result.fireControl.clean)>.15&&Math.abs(result.fireControl.first-result.fireControl.second)<1e-12,result.fireControl);
assert('pumps reduce flooding while increasing acoustic signature',result.pumps.onFlooding<result.pumps.offFlooding&&result.pumps.onNoise>result.pumps.offNoise&&result.pumps.capacity<1,result.pumps);
assert('PROPULSION priority repairs motor/electrical much faster than rudder stabilization',result.priority.propulsion.motor<result.priority.propulsion.rudder-.15&&result.priority.propulsion.electrical<result.priority.propulsion.rudder-.15,result.priority);
assert('STEERING priority repairs rudder much faster than propulsion stabilization',result.priority.steering.rudder<result.priority.steering.motor-.15,result.priority);
assert('severe periscope damage cannot be field-repaired below its repair floor',result.fieldRepair.remaining>=result.fieldRepair.floor-.000001&&result.fieldRepair.floor>.40,result.fieldRepair);
assert('heavily damaged pump trips under sustained flooding load',result.pumpTrip.tripped===true&&result.pumpTrip.active===false,result.pumpTrip);
assert('offline drive bank has real persistent speed penalty',result.driveBank.offlineKn<result.driveBank.cleanKn*.8,result.driveBank);
assert('light optics damage visibly adds scratches without blur',result.optics.light.scene&&result.optics.light.overlay&&!result.optics.light.severe&&result.optics.light.profile.blurPx===0,result.optics.light);
assert('moderate optics damage applies renderer blur/distortion',result.optics.moderate.scene&&result.optics.moderate.overlay&&/blur\(/.test(result.optics.moderate.filter)&&result.optics.moderate.profile.distortion>0,result.optics.moderate);
assert('heavy optics damage becomes mostly unusable instead of instantly failing at moderate damage',result.optics.heavy.severe&&!result.optics.heavy.scene&&result.optics.heavy.profile.unusable,result.optics.heavy);
assert('damage report UI exposes new subsystem damage and repair priority',/Electrical/.test(result.ui.html)&&/TDC/.test(result.ui.html)&&/Gyro/.test(result.ui.html)&&/Pumps/.test(result.ui.html)&&/OPTICS \/ FIRE CONTROL/.test(result.ui.html),result.ui);
assert('pre-Phase-3 save state migrates new fields and preserves severe legacy repair limits',result.migration.tdcDamage===0&&result.migration.gyroDamage===0&&result.migration.pumpDamage===0&&result.migration.electricalDamage===0&&result.migration.repairPriority==='FLOODING'&&!result.migration.driveBankOffline&&!result.migration.pumpTripped&&result.migration.legacyPeriscopeFloor>.40,result.migration);
if(failed){console.error(`PHASE 3 SUBSYSTEM DAMAGE CONTRACT: FAIL (${failed})`);process.exit(1)}
console.log('PHASE 3 SUBSYSTEM DAMAGE CONTRACT: PASS');
