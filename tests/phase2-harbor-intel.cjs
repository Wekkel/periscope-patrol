#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');let failed=0;
function pass(n,d){console.log(`PASS: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function fail(n,d){failed++;console.error(`FAIL: ${n}${d!==undefined?' — '+JSON.stringify(d):''}`)}
function assert(n,c,d){c?pass(n,d):fail(n,d)}

const jsFiles=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?walk(p):e.isFile()&&p.endsWith('.js')&&jsFiles.push(p)}})(path.join(root,'js'));
for(const f of jsFiles){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail('syntax '+path.relative(root,f),r.stderr);process.exit(1)}}
pass('JavaScript syntaxcheck',{files:jsFiles.length});

const store=new Map(), els=new Map();
const element=id=>{if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],appendChild(){},addEventListener(){}});return els.get(id)};
const base={console,Math,Date,JSON,performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>store.has(String(k))?store.get(String(k)):null,setItem:(k,v)=>store.set(String(k),String(v)),removeItem:k=>store.delete(String(k)),clear:()=>store.clear()},
 audio:new Proxy({}, {get:()=>()=>{}}),Toast:{show(){},ok(){},warn(){},bad(){},auto(){},stop(){}},showBriefing(){},particles:{draw(){},spawnExplosion(){},spawnWake(){},update(){}},
 navigator:{deviceMemory:8},window:{devicePixelRatio:1},document:{getElementById:element,querySelectorAll:()=>[]},innerWidth:1280,innerHeight:800};base.globalThis=base;
const ctx=vm.createContext(base);
const load=['js/core/utilities.js','js/data/torpedo-data.js','js/data/campaign-data.js','js/navigation/route-geometry.js','js/simulation/collision/hull-geometry.js','js/simulation/weapons/tdc-math.js','js/simulation/surface-watch.js','js/core/state.js','js/core/command-bus.js','js/persistence/save-system.js','js/simulation/engine-core.js','js/simulation/harbor.js','js/simulation/weapons/torpedoes.js','js/simulation/ai/enemy-ai.js','js/simulation/ai/aircraft.js','js/simulation/weapons/deck-gun.js','js/simulation/weapons/aa-gun.js','js/simulation/radio-intel.js','js/simulation/sensors.js','js/simulation/ai/asw-brain.js','js/simulation/ai/escort-asw.js','js/simulation/collision/vessel-collision.js','js/simulation/damage-control.js','js/simulation/career-history.js','js/simulation/physics-navigation.js','js/core/game.js','js/rendering/world-geometry.js','js/rendering/canvas-core.js','js/rendering/tactical.js','js/rendering/deck-gun-3d.js','js/rendering/periscope-3d.js','js/rendering/bridge-3d.js','js/rendering/map.js','js/ui/dom-view.js'];
for(const f of load)vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});

const result=vm.runInContext(`(()=>{
 const out={};
 const g=new Game();g.dispatch({type:'NEW_PATROL',areaKey:'Truk Approaches'});g.update(0);
 const s=g.state,e=g.engine,H=s.world.harbor,I=s.world.harborIntel,heavy=s.world.contacts.find(c=>c.id==='H-04');
 out.start={optional:s.campaign.optionalObjectives.length,harbor:!!H,heavy:heavy&&{id:heavy.id,displayType:heavy.displayType,sunk:!!heavy.sunk},knowledge:{mine:I.minefield.level,channel:I.channel.level,net:I.net.known,reported:I.heavyUnit.reported,identified:I.heavyUnit.identified},truthMines:H.mines.length};

 // Force the scheduled special broadcast to be the next transmission. Keep the boat deep so it cannot copy it yet.
 I.specialSignal.eligibleAt=0;s.world.radio.nextBroadcast=0;s.playerSub.depthFeet=100;e.updateRadio(1);
 out.pending={type:s.world.radio.pending?.type,text:s.world.radio.pending?.text,broadcast:I.specialSignal.broadcast,copied:I.specialSignal.copied,optional:s.campaign.optionalObjectives.length};

 // Now come to antenna depth and actually copy the message.
 s.playerSub.depthFeet=0;e.updateRadio(41);
 const O=()=>s.campaign.optionalObjectives.find(o=>o.id==='truk-raid');
 out.copied={inbox:s.world.radio.inbox.length,copied:I.specialSignal.copied,optional:s.campaign.optionalObjectives.length,objective:O()?.text,mine:I.minefield.level,channel:I.channel.level,net:I.net.known,result:I.raid.result};

 // Real map renderer labels: reported minefield/channel but no exact torpedo-net gate.
 const ops=[];const fakeCtx=new Proxy({},{get:(o,k)=>{if(k==='fillText')return (txt,x,y)=>ops.push(['text',String(txt)]);if(k==='fill'||k==='stroke'||k==='lineTo'||k==='moveTo'||k==='arc')return (...a)=>ops.push([String(k),...a]);if(!(k in o))o[k]=()=>{};return o[k]},set:(o,k,v)=>(o[k]=v,true)});
 const fakeCanvas={width:800,height:600,clientWidth:800,clientHeight:600,getContext:()=>fakeCtx,getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})};
 const cv=new CanvasView(fakeCanvas);cv.zoom=30;cv.k=1;const w2s=(x,y)=>({x:400+x*30,y:300+y*30});
 cv.drawMapHarbor(fakeCtx,H,I,w2s,s.time.elapsedSeconds);out.reportedMap={labels:ops.filter(x=>x[0]==='text').map(x=>x[1]),ops:ops.length};

 // Approach reconnaissance tightens the mine/channel picture without inventing the net gate.
 const br=degToRad(H.channelBearing),rr=H.mineOuterNm-.25;s.playerSub.position={xNm:H.center.xNm+Math.sin(br)*rr,yNm:H.center.yNm-Math.cos(br)*rr};s.playerSub.depthFeet=55;e.updateHarborKnowledge(1);
 out.approach={mine:I.minefield.level,channel:I.channel.level,net:I.net.known};

 // Close visual pass at the real net reveals the net itself.
 const seg=e.harborNetSegments(H)[0],mx=(seg.a.xNm+seg.b.xNm)/2,my=(seg.a.yNm+seg.b.yNm)/2,dx=seg.b.xNm-seg.a.xNm,dy=seg.b.yNm-seg.a.yNm,ll=Math.hypot(dx,dy)||1;
 s.playerSub.position={xNm:mx-dy/ll*.28,yNm:my+dx/ll*.28};s.playerSub.depthFeet=55;e.updateHarborKnowledge(1);
 const ops2=[];const ctx2=new Proxy({},{get:(o,k)=>{if(k==='fillText')return txt=>ops2.push(String(txt));if(!(k in o))o[k]=()=>{};return o[k]},set:(o,k,v)=>(o[k]=v,true)});cv.drawMapHarbor(ctx2,H,I,w2s,s.time.elapsedSeconds);
 out.netReveal={known:I.net.known,source:I.net.source,labels:ops2};

 // Use the real contact tracker repeatedly, not a hand-written identity flag.
 s.playerSub.position={xNm:heavy.position.xNm-.35,yNm:heavy.position.yNm};s.playerSub.depthFeet=55;s.world.environment.visibilityNm=16;
 for(let n=0;n<7;n++){e.updateDetection(5);e.updateHarborKnowledge(5)}
 const tr=s.world.contactTracks['H-04'];out.identify={track:{source:tr?.source,confidence:tr?.confidence,type:tr?.typeEstimate},known:I.heavyUnit,objective:O()?.text};

 // UI-level evidence: desktop mission panel renders the optional objective with OPTIONAL prefix.
 const dv=new DomView();dv.missionStatus=document.getElementById('missionStatus');dv.ordersGrid=document.getElementById('ordersGrid');dv.renderOrders(s.playerSub,s);out.ui={missionHTML:dv.missionStatus.innerHTML};

 // Persist the knowledge/objective through the existing full-state save/load path.
 SaveSystem.save(3,s);const loaded=SaveSystem.load(3);out.save={identified:loaded.world.harborIntel.heavyUnit.identified,identity:loaded.world.harborIntel.heavyUnit.identity,objective:loaded.campaign.optionalObjectives[0]?.text};

 // A single real deck-gun damage calculation on the heavy unit registers DAMAGED without needing a mission-specific fake hit path.
 heavy.gunDamage=0;heavy.sunk=false;e.damageShipByDeckGun(heavy,{along:0,lateral:.001,lenNm:.3});out.damaged={result:I.raid.result,gunDamage:heavy.gunDamage,objectiveResult:O()?.result};
 // A sunk heavy unit upgrades the same result to SUNK.
 heavy.sunk=true;e.noteHarborAttack(heavy);out.sunk={result:I.raid.result,done:O()?.done,failed:O()?.failed};

 // Separate clean patrol: copied intel may be ignored completely; completing the patrol does not fail the optional raid.
 const s2=createState('Truk Approaches'),e2=new SimEngine(s2,new CommandBus());s2.world.contacts=e2.makeConvoy(PATROL_AREAS['Truk Approaches']);e2.setupHarbor('Truk Approaches');e2.grantHarborSpecialIntel();const o2=s2.campaign.optionalObjectives[0];e2.completeMission('Submarine rendezvous');
 out.ignored={mission:s2.campaign.missionStatus,result:s2.world.harborIntel.raid.result,failed:o2.failed,done:o2.done,text:o2.text};

 // Separate clean patrol: entering the anchorage then withdrawing without damaging H-04 records ABANDONED.
 const s3=createState('Truk Approaches'),e3=new SimEngine(s3,new CommandBus());s3.world.contacts=e3.makeConvoy(PATROL_AREAS['Truk Approaches']);e3.setupHarbor('Truk Approaches');e3.grantHarborSpecialIntel();const h3=s3.world.harbor,i3=s3.world.harborIntel;
 s3.playerSub.position={...h3.center};s3.playerSub.depthFeet=55;e3.updateHarborKnowledge(1);s3.playerSub.position={xNm:h3.center.xNm+h3.outerRadiusNm+1,yNm:h3.center.yNm};e3.updateHarborKnowledge(1);out.abandoned={attempted:i3.raid.attempted,result:i3.raid.result,failed:s3.campaign.optionalObjectives[0].failed};

 // Searchlight is absent from the chart when inactive and becomes a real transient drawing only while active.
 const s4=createState('Truk Approaches'),e4=new SimEngine(s4,new CommandBus());s4.world.contacts=e4.makeConvoy(PATROL_AREAS['Truk Approaches']);e4.setupHarbor('Truk Approaches');const h4=s4.world.harbor,i4=s4.world.harborIntel,ops4=[];
 const c4=new Proxy({},{get:(o,k)=>{if(!(k in o))o[k]=(...a)=>ops4.push(String(k));return o[k]},set:(o,k,v)=>(o[k]=v,true)});cv.drawMapHarbor(c4,h4,i4,w2s,0);const inactive=ops4.length;h4.searchlightActiveUntil=8;h4.searchlightBearing=90;h4.searchlightWidthDeg=14;cv.drawMapHarbor(c4,h4,i4,w2s,1);out.searchlight={inactiveOps:inactive,activeOps:ops4.length-inactive};

 // Acoustic-only tracking of H-04 may locate a surface ship, but cannot reveal carrier/cruiser identity.
 const s5=createState('Truk Approaches'),e5=new SimEngine(s5,new CommandBus());s5.world.contacts=e5.makeConvoy(PATROL_AREAS['Truk Approaches']);e5.setupHarbor('Truk Approaches');const h5=s5.world.contacts.find(c=>c.id==='H-04');
 h5.acousticBase=.8;h5.speedKnots=12;s5.playerSub.position={xNm:h5.position.xNm-.6,yNm:h5.position.yNm};s5.playerSub.depthFeet=180;s5.playerSub.propulsion.speedKnots=0;s5.playerSub.stealth.acousticSignature=0;s5.world.environment.visibilityNm=0.2;s5.world.environment.seaState=0;
 for(let n=0;n<20;n++)e5.updateDetection(5);const tr5=s5.world.contactTracks['H-04'];out.acousticIdentity={source:tr5?.source,confidence:tr5?.confidence,type:tr5?.typeEstimate,known:s5.world.harborIntel.heavyUnit.identified};

 // Truth remains lethal while unknown: an uncharted net still catches a torpedo point, and a physical mine still damages the boat.
 const s6=createState('Truk Approaches'),e6=new SimEngine(s6,new CommandBus());s6.world.contacts=e6.makeConvoy(PATROL_AREAS['Truk Approaches']);e6.setupHarbor('Truk Approaches');const H6=s6.world.harbor,I6=s6.world.harborIntel,sg6=e6.harborNetSegments(H6)[0],mid6={xNm:(sg6.a.xNm+sg6.b.xNm)/2,yNm:(sg6.a.yNm+sg6.b.yNm)/2};
 const netPhysical=e6.harborTorpedoNetHit(mid6);const m6=H6.mines[0];s6.playerSub.position={xNm:m6.xNm,yNm:m6.yNm};s6.playerSub.depthFeet=55;const hull6=s6.playerSub.damage.hullIntegrity;e6.updateHarbor(.1);out.truthVsKnowledge={netKnownBefore:false,netPhysical,mineKnownBefore:'NONE',mineTriggered:m6.triggered,hullBefore:hull6,hullAfter:s6.playerSub.damage.hullIntegrity};

 // Battery markers are created only by observed fire and remain possible positions, not range circles.
 const s7=createState('Truk Approaches'),e7=new SimEngine(s7,new CommandBus());s7.world.contacts=e7.makeConvoy(PATROL_AREAS['Truk Approaches']);e7.setupHarbor('Truk Approaches');const H7=s7.world.harbor,I7=s7.world.harborIntel;s7.time.elapsedSeconds=100;s7.playerSub.position={xNm:H7.center.xNm+2,yNm:H7.center.yNm};s7.playerSub.depthFeet=0;H7.alert=2;H7.suspicion=80;H7.lastGunAt=-999;e7.updateHarbor(.1);const ops7=[];const c7=new Proxy({},{get:(o,k)=>{if(k==='fillText')return txt=>ops7.push(String(txt));if(!(k in o))o[k]=()=>{};return o[k]},set:(o,k,v)=>(o[k]=v,true)});cv.drawMapHarbor(c7,H7,I7,w2s,s7.time.elapsedSeconds);out.battery={estimates:I7.batteries.length,labels:ops7.filter(x=>/BATTERY/.test(x))};
 return out;
})()`,ctx);

assert('new Truk patrol has physical harbor + heavy unit but no optional objective',result.start.harbor&&result.start.heavy&&result.start.optional===0&&result.start.knowledge.mine==='NONE'&&result.start.knowledge.net===false,result.start);
assert('special intel broadcast pending but not copied creates no objective',result.pending.type==='SPECIAL INTELLIGENCE'&&/HEAVY UNIT REPORTED AT TRUK ANCHORAGE/.test(result.pending.text||'')&&result.pending.broadcast&&!result.pending.copied&&result.pending.optional===0,result.pending);
assert('copying special intel creates optional objective and only reported defensive knowledge',result.copied.copied&&result.copied.optional===1&&result.copied.objective==='Investigate Truk Anchorage'&&result.copied.mine==='REPORTED'&&result.copied.channel==='REPORTED'&&!result.copied.net,result.copied);
assert('reported harbor chart shows fuzzy mine/channel report but no exact net gate',result.reportedMap.labels.includes('REPORTED MINEFIELDS')&&result.reportedMap.labels.includes('REPORTED SWEPT CHANNEL')&&!result.reportedMap.labels.some(x=>/NET/.test(x)),result.reportedMap);
assert('approach observation improves minefield/channel confidence without auto-revealing net',result.approach.mine==='OBSERVED'&&result.approach.channel==='OBSERVED'&&!result.approach.net,result.approach);
assert('close visual/contact reconnaissance reveals torpedo net and map line',result.netReveal.known&&result.netReveal.labels.includes('OBSERVED TORPEDO NET'),result.netReveal);
assert('real visual contact tracking identifies the actual heavy unit',result.identify.track.source==='VISUAL'&&result.identify.track.confidence>=.65&&result.identify.known.identified&&/identified at Truk Anchorage$/.test(result.identify.objective||''),result.identify);
assert('optional objective is rendered at UI level with OPTIONAL prefix',/OPTIONAL — (Heavy cruiser|Fleet carrier) identified at Truk Anchorage/.test(result.ui.missionHTML),result.ui);
assert('harbor knowledge and optional objective persist through save/load',result.save.identified&&result.save.identity&&/identified at Truk Anchorage$/.test(result.save.objective||''),result.save);
assert('heavy-unit deck-gun damage registers optional result DAMAGED',result.damaged.result==='damaged'&&result.damaged.gunDamage>0&&result.damaged.objectiveResult==='damaged',result.damaged);
assert('heavy-unit destruction upgrades optional result to SUNK without failure',result.sunk.result==='sunk'&&result.sunk.done&&result.sunk.failed===false,result.sunk);
assert('returning without raid completes patrol with NOT ATTEMPTED and no optional failure',result.ignored.mission==='COMPLETED'&&result.ignored.result==='not_attempted'&&result.ignored.failed===false,result.ignored);
assert('raid entered then abandoned is recorded as ABANDONED, not failed',result.abandoned.attempted&&result.abandoned.result==='abandoned'&&result.abandoned.failed===false,result.abandoned);
assert('searchlight has no map drawing while inactive and a transient drawing while active',result.searchlight.inactiveOps===0&&result.searchlight.activeOps>0,result.searchlight);
assert('acoustic-only H-04 track does not reveal carrier/cruiser identity',result.acousticIdentity.source==='HYDROPHONE'&&result.acousticIdentity.type!=='FLEET CARRIER'&&result.acousticIdentity.type!=='HEAVY CRUISER'&&!result.acousticIdentity.known,result.acousticIdentity);
assert('unknown physical net and mine still exist and function independently of chart knowledge',result.truthVsKnowledge.netPhysical&&result.truthVsKnowledge.mineTriggered&&result.truthVsKnowledge.hullAfter<result.truthVsKnowledge.hullBefore,result.truthVsKnowledge);
assert('coastal battery appears only as POSSIBLE BATTERY estimate after actual fire',result.battery.estimates>0&&result.battery.labels.includes('POSSIBLE BATTERY'),result.battery);
const mapSource=fs.readFileSync(path.join(root,'js/rendering/map.js'),'utf8');
const harborFn=(mapSource.match(/drawMapHarbor\(ctx,H,I,w2s,now\)\{([\s\S]*?)\n  \}\n\n  drawMapTrail/)||[])[1]||'';
assert('harbor map draws no hydrophone or coastal-battery range circles',!harborFn.includes('hydrophoneRangeNm')&&!harborFn.includes('batteryRangeNm'),{hydroRangeRef:harborFn.includes('hydrophoneRangeNm'),batteryRangeRef:harborFn.includes('batteryRangeNm')});
if(failed)process.exit(1);console.log('PHASE 2 TRUK OPTIONAL RAID CONTRACT: PASS');
