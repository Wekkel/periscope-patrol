import {readdir,readFile,stat} from 'node:fs/promises';import path from 'node:path';import process from 'node:process';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'.'),fail=[];async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','.github','tests','node_modules','audio-intake','PeriscopePatrol_Audio_Processed','Pariscope-Patrol-Sounds'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
const all=await files(root),sized=await Promise.all(all.map(async p=>[p,(await stat(p)).size])),sum=filter=>sized.filter(([p])=>filter(p)).reduce((n,[,b])=>n+b,0),rel=p=>path.relative(root,p).split(path.sep).join('/');
// Verhoogd voor het hybride audio-samplepack; volledig offline geluid is een bewuste keuze.
const budgets={repository:4_500_000,javascript:1_850_000,styles:220_000,audio:2_000_000,singleScript:145_000},values={repository:sum(()=>true),javascript:sum(p=>p.endsWith('.js')),styles:sum(p=>p.endsWith('.css')),audio:sum(p=>/\.(mp3|ogg|wav|m4a)$/i.test(p)),singleScript:Math.max(...sized.filter(([p])=>p.endsWith('.js')).map(([,b])=>b))};
for(const [k,v] of Object.entries(values))if(v>budgets[k])fail.push(`${k} ${v} > ${budgets[k]}`);
const ships=await readFile(path.join(root,'js/rendering/world-geometry.js'),'utf8');
for(const key of ['US_FLETCHER_DESTROYER','US_DESTROYER_ESCORT','GERMAN_TORPEDO_BOAT','GERMAN_MINESWEEPER','ITALIAN_SOLDATI_DESTROYER','ITALIAN_GABBIANO_CORVETTE','SOVIET_GNEVNY_DESTROYER','SOVIET_PATROL_ESCORT'])if(!ships.includes(`SHIP_MODELS.${key}=`))fail.push(`national silhouette missing: ${key}`);
const composedSystems=[['js/simulation/engine-core.js','CoreSystem','SimEngineCore'],['js/simulation/harbor.js','HarborSystem','SimEngineHarbor'],['js/simulation/weather-system.js','WeatherSystem','SimEngineWeather'],['js/simulation/sound-radar.js','SoundRadarSystem','SimEngineSoundRadar'],['js/simulation/radio-intel.js','IntelSystem','SimEngineIntel'],['js/simulation/sensors.js','SensorsSystem','SimEngineSensors'],['js/simulation/weapons/torpedoes.js','TorpedoSystem','SimEngineTorpedoes'],['js/simulation/weapons/deck-gun.js','DeckGunSystem','SimEngineDeckGun'],['js/simulation/weapons/aa-gun.js','AAGunSystem','SimEngineAAGun'],['js/simulation/ai/aircraft.js','AircraftSystem','SimEngineAircraft'],['js/simulation/ai/asw-brain.js','ASWBrainSystem','SimEngineASWBrain'],['js/simulation/ai/escort-asw.js','ASWSystem','SimEngineASW'],['js/simulation/ai/enemy-ai.js','EnemyAISystem','SimEngineEnemyAI'],['js/simulation/collision/vessel-collision.js','CollisionSystem','SimEngineCollision'],['js/simulation/damage-control.js','DamageSystem','SimEngineDamage'],['js/simulation/career-history.js','CareerSystem','SimEngineCareer']];
const compatibilityAllowlist=[];
for(const p of all.filter(p=>p.endsWith('.js'))){const src=await readFile(p,'utf8');if(/engine\.updateAircraft\s*=/.test(src)&&!compatibilityAllowlist.includes(rel(p)))fail.push(`unapproved compatibility entry point: ${rel(p)}: engine.updateAircraft`);}
/* Every simulation notification carries the reviewed importance. The ctx
   adapter is intentionally variadic: it forwards the caller's classification. */
const notifyMissing=[];
for(const p of all.filter(p=>rel(p).startsWith('js/simulation/')&&p.endsWith('.js'))){const src=await readFile(p,'utf8');for(const m of src.matchAll(/(?:this|engine|ctx)\.notify\([\s\S]*?\);/g)){const call=m[0];if(/\.notify\(\.\.\.args\)/.test(call))continue;if(!/,\s*['"](?:KRITIEK|NUTTIG|RUIS)['"]\s*\);$/.test(call))notifyMissing.push(`${rel(p)}:${src.slice(0,m.index).split('\n').length}`);}}
if(notifyMissing.length)fail.push(`notify importance missing: ${notifyMissing.join(', ')}`);
/* Toast is materialized only by the presentation bridge's UI drain. The
   implementation and that drain are the two deliberate sinks. */
const toastDirect=[];
// UI-only action feedback remains a deliberate sink; simulation notifications
// never use it. Each entry is documented here rather than silently ignored.
const toastUiAllowlist=new Set(['js/controllers/bridge-controller.js','js/controllers/touch-controller.js','js/persistence/autosave.js','js/pwa/version.js','js/tutorial/tutorial.js']);
for(const p of all.filter(p=>p.endsWith('.js'))){const r=rel(p);if(r==='js/ui/toast.js'||r==='js/ui/presentation-bridge.js'||r==='js/bootstrap/wiring.js'||toastUiAllowlist.has(r))continue;const src=await readFile(p,'utf8');if(/\bToast(?:\.|\[)/.test(src))toastDirect.push(r);}
if(toastDirect.length)fail.push(`direct Toast use outside presentation route: ${toastDirect.join(', ')}`);
/* Automatic time-scale resets have one writer. SET/CYCLE_TIME_SCALE and the
   explicit resume-from-pause command remain player commands. */
const timeWrites=[];const timeWriteAllowlist=new Set(['js/tutorial/tutorial.js','js/persistence/save-system.js','js/core/game-loop.js','js/bootstrap/wiring.js']);
for(const p of all.filter(p=>p.endsWith('.js'))){const r=rel(p),lines=(await readFile(p,'utf8')).split('\n');for(let i=0;i<lines.length;i++){if(!/\.timeScale\s*=/.test(lines[i]))continue;const context=lines.slice(Math.max(0,i-2),i+1).join('\n');const command=/timeScale===0/.test(lines[i])||/SET_TIME_SCALE|CYCLE_TIME_SCALE|pauseForModal|resumeFromModal|START_TRANSIT/.test(context);const central=/PP_AUTOMATIC_TIMESCALE_WRITER/.test(context);if(!command&&!central&&!timeWriteAllowlist.has(r))timeWrites.push(`${r}:${i+1}`);}}
if(timeWrites.length)fail.push(`direct automatic timeScale writes: ${timeWrites.join(', ')}`);
for(const p of all.filter(p=>p.endsWith('.js'))){const src=await readFile(p,'utf8');if(/(?:state|s|u)\.ui\s*=.*(?:toasts|toastSeq)|ui\.(?:toasts|toastSeq)\s*=/.test(src))fail.push(`legacy state toast queue write: ${rel(p)}`);}
for(const [file,symbol,oldClass] of composedSystems){const src=await readFile(path.join(root,file),'utf8');if(!src.includes(`const ${symbol}=`))fail.push(`composed system missing: ${symbol}`);if(new RegExp(`class\\s+${oldClass}\\b`).test(src))fail.push(`composed class remains: ${oldClass}`);}
for(const p of all.filter(p=>p.endsWith('.js'))){const src=await readFile(p,'utf8');for(const [,,oldClass] of composedSystems)if(new RegExp(`extends\\s+${oldClass}\\b`).test(src))fail.push(`old composed inheritance remains: ${rel(p)} extends ${oldClass}`);}
const renderComposition=[['js/rendering/world-3d.js','World3D','CanvasViewPeriscope'],['js/rendering/periscope-3d.js','PeriscopeStation','CanvasViewPeriscope'],['js/rendering/bridge-3d.js','BridgeStation','CanvasViewBridge'],['js/rendering/sound-room.js','SoundStation','CanvasViewSound'],['js/rendering/tactical.js','TacticalStation','CanvasViewTactical'],['js/rendering/deck-gun-3d.js','DeckGunStation','CanvasViewDeckGun'],['js/rendering/map.js','MapStation',null],['js/rendering/battle-atmosphere.js','BattleAtmosphere',null]];
const forbiddenInheritance=[];
for(const p of all.filter(p=>p.endsWith('.js')&&(rel(p).startsWith('js/rendering/')||rel(p).startsWith('js/simulation/')))){const src=await readFile(p,'utf8');for(const m of src.matchAll(/^\s*class\s+[A-Za-z_$][\w$]*\s+extends\s+[A-Za-z_$][\w$]*/gm))forbiddenInheritance.push(`${rel(p)}:${src.slice(0,m.index).split('\n').length}`);}
if(forbiddenInheritance.length)fail.push(...forbiddenInheritance.map(v=>`forbidden inheritance: ${v}`));
for(const [file,symbol,oldClass] of renderComposition){const src=await readFile(path.join(root,file),'utf8');if(!src.includes(`const ${symbol}={`))fail.push(`render composition missing: ${symbol}`);if(oldClass&&new RegExp(`class\\s+${oldClass}\\b`).test(src))fail.push(`render class remains: ${oldClass}`);}
const campaignCatalog=await readFile(path.join(root,'js/data/multi-theater-campaigns.js'),'utf8');
if(/x\.specialOperationsProfile\s*=\s*null\s*;/.test(campaignCatalog))fail.push('runtime campaign profiles discard specialOperationsProfile');
if(!/x\.specialOperationsProfile\s*=\s*base\.specialOperationsProfile\s*\?/.test(campaignCatalog))fail.push('runtime campaign profiles do not preserve authored special operations');
const callGraphPath=path.join(root,'tests/call-graph-current.json');
const callGraph=JSON.parse(await readFile(callGraphPath,'utf8'));
const callGraphMtime=(await stat(callGraphPath)).mtimeMs;
const newestSimulationMtime=Math.max(...await Promise.all(all.filter(p=>rel(p).startsWith('js/simulation/')&&p.endsWith('.js')).map(async p=>(await stat(p)).mtimeMs)));
if(callGraphMtime<newestSimulationMtime)fail.push('call graph is stale; run tests/generate-call-graph.mjs before quality-gates');
const duplicateMethodAllowlist=new Set(['constructor','update']);
const methodOwners=new Map();
for(const method of callGraph.methods||[]){
  if(!methodOwners.has(method.name))methodOwners.set(method.name,[]);
  methodOwners.get(method.name).push(method);
}
for(const [name,definitions] of methodOwners){
  const owners=[...new Set(definitions.map(item=>item.class))];
  if(owners.length>1&&!duplicateMethodAllowlist.has(name))fail.push(`duplicate simulation method: ${name} — ${definitions.map(item=>`${item.class}@${item.file}:${item.line}`).join(', ')}`);
}
const strictPatterns=[/(^|[^\w.])Toast\./,/(^|[^\w.])audio\./,/(^|[^\w.])SaveSystem\./,/(^|[^\w.])globalThis\./,/(^|[^\w.])document\./,/(^|[^\w.])setTimeout\b/,/(^|[^\w.])performance\.now\b/];
/* Step 8a runtime boundary. initRuntime is the single compatibility seam:
   underscore-prefixed legacy state fields and simulation caches are moved
   behind non-enumerable accessors, while storage drops the complete runtime
   branch. Keep this contract explicit so a future refactor cannot silently
   restore selective runtime serialization. */
const stateSource=await readFile(path.join(root,'js/core/state.js'),'utf8');
const saveSource=await readFile(path.join(root,'js/persistence/save-system.js'),'utf8');
if(!/function\s+initRuntime\s*\(/.test(stateSource)||!/key\.startsWith\(['"]_['"]\)/.test(stateSource))fail.push('runtime boundary missing underscore-field migration in initRuntime');
if(!/delete\s+s\.runtime\s*;/.test(saveSource))fail.push('storage boundary must omit the complete state.runtime branch');
if(!/typeof initRuntime==='function'\)initRuntime\(state\)/.test(saveSource))fail.push('loaded states do not rebuild runtime through initRuntime');
/* Runtime underscore fields must never be written back onto persistent state.
   This is intentionally a write check (not a read check): legacy reads are
   handled only at the migration boundary, while new writes must name the
   runtime bucket explicitly. */
const runtimeUnderscoreWrites=[];
for(const p of all.filter(p=>p.endsWith('.js')&&rel(p).startsWith('js/'))){
  const lines=(await readFile(p,'utf8')).split('\n');
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/(?:^|[({;,\s])(state|this\.state|s|sub|tdc|env|W|S|G)\.[A-Za-z_$][\w$]*\._[A-Za-z_$][\w$]*\s*=/.test(line)&&!line.includes('.runtime.'))
      runtimeUnderscoreWrites.push(`${rel(p)}:${i+1}`);
  }
}
if(runtimeUnderscoreWrites.length)fail.push(`underscore state writes outside state.runtime: ${runtimeUnderscoreWrites.join(', ')}`);
const layerViolations=[];let layerCalls=0;const layerFiles=new Set();
for(const p of all.filter(p=>rel(p).startsWith('js/simulation/')&&p.endsWith('.js'))){const src=await readFile(p,'utf8');let fileCalls=0;for(const re of strictPatterns){const hits=src.match(new RegExp(re.source,'g'))||[];fileCalls+=hits.length;if(hits.length)layerViolations.push(`${rel(p)}: ${re}`);}if(fileCalls){layerCalls+=fileCalls;layerFiles.add(p);}}
if(layerViolations.length)fail.push(...layerViolations.map(v=>`simulation layer violation: ${v}`));
const coreViolations=[];let coreCalls=0;const coreFiles=new Set();
const coreAllowlist=new Set(['js/core/layout-service.js','js/core/utilities.js']);
for(const p of all.filter(p=>rel(p).startsWith('js/core/')&&p.endsWith('.js'))){const r=rel(p);if(coreAllowlist.has(r))continue;const src=await readFile(p,'utf8');let n=0;for(const re of strictPatterns){if(r==='js/core/game-loop.js'&&(re.source.includes('performance\\.now')||re.source.includes('document\\.')))continue;n+=(src.match(new RegExp(re.source,'g'))||[]).length;}if(n){coreCalls+=n;coreFiles.add(p);coreViolations.push(`${r}: ${n}`);}}
if(coreViolations.length)fail.push(...coreViolations.map(v=>`core layer violation: ${v}`));
const renderSource=await readFile(path.join(root,'js/core/game-loop.js'),'utf8');
if(/\.cv\.render\(snap\s*,?\s*\)/.test(renderSource))fail.push('GameLoop render path omits layout parameter');
const wiringSource=await readFile(path.join(root,'js/bootstrap/wiring.js'),'utf8');
if(wiringSource.includes('PP_DEV_TEST_CONSOLE')&&!/if\(!PP_BUILD\.isDev\)return/.test(wiringSource))fail.push('dev test console is not guarded by PP_BUILD.isDev');
const layoutPatterns=[/dataset/i,/matchMedia/i,/innerWidth/i,/innerHeight/i,/clientWidth/i,/clientHeight/i,/getBoundingClientRect/i,/offsetWidth/i,/offsetHeight/i,/window\.screen/i,/visualViewport/i];
const layoutHits=[];let layoutCalls=0;const layoutFiles=new Set();
for(const p of all.filter(p=>{const r=rel(p);return (r.startsWith('js/rendering/')||r.startsWith('js/simulation/'))&&p.endsWith('.js');})){const src=await readFile(p,'utf8');let n=0;for(const re of layoutPatterns)n+=(src.match(new RegExp(re.source,'gi'))||[]).length;if(n){layoutCalls+=n;layoutFiles.add(p);layoutHits.push(`${rel(p)}: ${n}`);}}
if(layoutCalls)console.warn(`layout-read warnings: ${layoutCalls} layoutlezingen in ${layoutFiles.size} bestanden`);
/* STEP 9a: presenter methods must consume the pure HUD viewmodel. Keep the
   check scoped to the public presenter methods so their event/input helpers
   may still use browser geometry and arithmetic. */
const hudVmSource=await readFile(path.join(root,'js/ui/hud-viewmodel.js'),'utf8');
if(!/function\s+buildHudViewModel\s*\(/.test(hudVmSource))fail.push('HUD viewmodel function missing');
/* STEP 9b-1: desktop mirrors the permanent mobile vitals contract without
   changing the mobile shell. Only depth and speed may expose order menus. */
const indexSource=await readFile(path.join(root,'index.html'),'utf8');
const cssSource=await readFile(path.join(root,'css/app.css'),'utf8');
const swSource=await readFile(path.join(root,'sw.js'),'utf8');
const gameCatalogSource=await readFile(path.join(root,'js/data/game-catalog.js'),'utf8');
/* P58 9b boot repair: the cache revision must move with this cumulative UI
   delivery, and the convoy catalog must be loaded and exported before the
   engine constructs the initial game. */
const catalogScript=indexSource.indexOf('<script src="./js/data/game-catalog.js"></script>'),engineScript=indexSource.indexOf('<script src="./js/simulation/engine-core.js"></script>');
if(catalogScript<0||engineScript<0||catalogScript>engineScript)fail.push('primary convoy catalog does not load before engine-core');
if(!/function\s+getPrimaryConvoyProfile\s*\(/.test(gameCatalogSource)||!/globalThis\.getPrimaryConvoyProfile=getPrimaryConvoyProfile/.test(gameCatalogSource))fail.push('primary convoy bootstrap contract is not explicitly exported');
if(!/const VERSION = '1\.0\.1';/.test(swSource)||!/\.\/js\/data\/game-catalog\.js/.test(swSource))fail.push('P58 9b service-worker cache revision/catalog shell entry missing');
const deskVitals=indexSource.match(/<section id="deskVitals"[\s\S]*?<\/section>/)?.[0]||'';
const deskVitalOrder=['deskVitalDepth','deskVitalKeel','deskVitalHeading','deskVitalSpeed','deskVitalTorps','deskVitalBattery','deskVitalFuel','deskVitalThreat','deskVitalHull'];
let lastVital=-1;for(const id of deskVitalOrder){const at=deskVitals.indexOf(`id="${id}"`);if(at<0)fail.push(`desktop vital missing: ${id}`);else if(at<=lastVital)fail.push(`desktop vital order incorrect: ${id}`);lastVital=at;}
const actionable=[...deskVitals.matchAll(/class="desk-vital actionable" id="([^"]+)"/g)].map(m=>m[1]);
if(actionable.join(',')!=='deskVitalDepth,deskVitalHeading,deskVitalSpeed,deskVitalTorps')fail.push(`desktop actionable vitals incorrect: ${actionable.join(',')}`);
if(!/id="deskFireButton"/.test(indexSource)||!/Toast\.warn\(viewModel\.fire\.reason/.test(await readFile(path.join(root,'js/controllers/bridge-controller.js'),'utf8')))fail.push('desktop permanent FIRE/reason route missing');
if(!/html\[data-lay="desk"\] #desktopShell\{[\s\S]*?overflow:hidden;/.test(cssSource))fail.push('desktop page scroll is not locked');
/* STEP 9b-2: the desktop bridge is no longer a grid column. Navigation and
   emergencies are permanent, while manual helm/TDC/weapons use a drawer. */
const navToolbar=indexSource.match(/<nav id="deskNavToolbar"[\s\S]*?<\/nav>/)?.[0]||'';
for(const id of ['clearPlotButton','plotInterceptButton','mapWeatherButton','followPlotButton','portButton'])if(!navToolbar.includes(`id="${id}"`))fail.push(`desktop navigation toolbar missing: ${id}`);
const emergencyCluster=indexSource.match(/<div id="deskEmergencyCluster"[\s\S]*?<\/div>/)?.[0]||'';
for(const id of ['crashDiveButton','emergencyBlowButton','silentButton','pumpButton'])if(!emergencyCluster.includes(`id="${id}"`))fail.push(`desktop emergency cluster missing: ${id}`);
if(!/grid-template-columns:minmax\(620px,1fr\) clamp\(220px,18vw,260px\)/.test(cssSource))fail.push('desktop fixed left grid column remains or right information column is not narrow');
if(!/html\[data-lay="desk"\] #deskBridge\{[\s\S]*?position:absolute/.test(cssSource))fail.push('desktop command drawer is not out of layout flow');
const topActions=indexSource.slice(indexSource.indexOf('<header id="deskHeader"'),indexSource.indexOf('</header>'));
for(const id of ['newScenarioButton','saveGameButton','loadGameButton'])if(!topActions.includes(`id="${id}"`))fail.push(`desktop top action missing: ${id}`);
/* STEP 9b-3: the narrow desktop information column mirrors the richer mobile
   readouts through five accordions. Two may be open; wiring closes the oldest
   before a third opens. Panels, unlike the command drawer, are not tabs. */
const deskRight=indexSource.slice(indexSource.indexOf('<div id="deskRight">'),indexSource.indexOf('<footer id="deskLog"'));
const deskPanelKeys=[...deskRight.matchAll(/data-desk-panel="([^"]+)"/g)].map(m=>m[1]);
if(deskPanelKeys.join(',')!=='mission,intel,fire,boat,radio')fail.push(`desktop information panels incorrect: ${deskPanelKeys.join(',')}`);
if((deskRight.match(/class="desk-info-panel panel open"/g)||[]).length!==2)fail.push('desktop information column must start with exactly two panels open');
for(const id of ['deskTargetOverview','deskIntel','deskTdcOverview','deskTorpStores','deskRightTubes','deskDeckGunInfo','deskCrewStatus','deskAaStatus','deskRadioState','deskRadioMessages'])if(!deskRight.includes(`id="${id}"`))fail.push(`desktop information view missing: ${id}`);
if(/role="tab"|desk-info-tabs/.test(deskRight))fail.push('desktop information column uses tabs instead of collapsible panels');
if(!/while\(deskInfoOpenOrder\.length>=2\)setDeskInfoPanel\(deskInfoOpenOrder\.shift\(\),false\)/.test(wiringSource))fail.push('desktop information panels do not close the longest-open panel');
if(!/\.desk-info-panel\.open\{flex:1 1 0;/.test(cssSource)||!/\.desk-info-panel\.open \.desk-info-body\{display:block;flex:1 1 auto;/.test(cssSource))fail.push('desktop information panels do not scroll within bounded open panels');
/* STEP 9b-4: one bounded log chooses one source, and desktop type scaling is a
   namespaced persisted display preference expressed through --ui-scale. */
const deskLog=indexSource.match(/<footer id="deskLog"[\s\S]*?<\/footer>/)?.[0]||'';
const logKinds=[...deskLog.matchAll(/data-desk-log="([^"]+)"/g)].map(m=>m[1]);
if(logKinds.join(',')!=='captain,patrol'||!deskLog.includes('id="deskLogEntries"'))fail.push('desktop combined log switch is incomplete');
if(!/grid-template-rows:68px 38px minmax\(0,1fr\) 58px clamp\(66px,7vh,78px\)/.test(cssSource)||!/#deskLogEntries\{[\s\S]*?overflow-y:auto/.test(cssSource))fail.push('desktop log is not bounded to four-to-six internally scrolling lines');
const scaleInput=indexSource.match(/<input id="uiScaleInput"[^>]+>/)?.[0]||'';
if(!/min="0\.85"/.test(scaleInput)||!/max="1\.35"/.test(scaleInput)||!/step="0\.05"/.test(scaleInput))fail.push('desktop interface scale range is missing or incorrect');
if(!/storageKey\('ss_ui_scale'\)/.test(wiringSource)||!/style\.setProperty\('--ui-scale'/.test(wiringSource)||!/:root\{[^}]*--ui-scale:1/.test(cssSource))fail.push('desktop interface scale is not persisted through --ui-scale');
/* Mobile is the reference design for all 9b work. Pin both its shell markup and
   presenter controller so a desktop patch cannot silently alter it. */
const lf=value=>String(value).replace(/\r\n/g,'\n'),indexSourceLf=lf(indexSource);
const touchStart=indexSourceLf.indexOf('<div id="touchShell">'),touchNeedle='</div><!-- end touchShell -->',touchEnd=indexSourceLf.indexOf(touchNeedle,touchStart)+touchNeedle.length;
const touchMarkup=indexSourceLf.slice(touchStart,touchEnd+2),touchMarkupLf=touchMarkup,sha=value=>createHash('sha256').update(value).digest('hex');
if(touchMarkupLf.length!==16599||sha(touchMarkupLf)!=='eee6d3739c5e95c058710d4e6951d00ad2091a73f87a9e95debef5e2a7b2efb4')fail.push('mobile touch shell changed during desktop 9b work');
if(sha(lf(await readFile(path.join(root,'js/controllers/touch-controller.js'),'utf8')))!=='ce9f1e28bfadd92fb51a2e18502691cf9193ccd771e53596ca5e8e1b4e2e3700')fail.push('mobile TouchCtrl changed during desktop 9b work');
for(const [file,method] of [['js/ui/dom-view.js','render'],['js/controllers/touch-controller.js','updateTouch']]){
  const src=await readFile(path.join(root,file),'utf8'),start=src.indexOf(`\n  ${method}(`),end=src.indexOf('\n  }',start);
  const body=start>=0&&end>start?src.slice(start,end):'';
  if(/\.toFixed\s*\(|\bMath\./.test(body))fail.push(`HUD presenter contains formatting/calculation: ${file} ${method}`);
}
console.log(JSON.stringify({ok:!fail.length,root,files:all.length,bytes:values,budgets,fail},null,2));if(fail.length)process.exit(1);
