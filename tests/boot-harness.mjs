import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const html=await readFile(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,errors=[],draw={count:0,methods:new Set()},audio={count:0,methods:new Set()};
const originalError=window.console.error.bind(window.console);window.console.error=(...args)=>{const first=args[0];if(String(first).includes('[RENDER]'))errors.push({kind:'render',message:args.map(String).join(' '),stack:args.find(x=>x?.stack)?.stack||''});originalError(...args);};
window.onerror=(message,source,line,col,error)=>{errors.push({kind:'window.onerror',message,source,line,col,stack:error?.stack||''});};
window.addEventListener('unhandledrejection',e=>errors.push({kind:'unhandledrejection',message:String(e.reason),stack:e.reason?.stack||''}));
const methodNames=['setTransform','fillRect','strokeRect','clearRect','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','arcTo','ellipse','rect','fill','stroke','clip','save','restore','translate','rotate','scale','setLineDash','fillText','strokeText','measureText','createRadialGradient','createLinearGradient','createPattern','drawImage'];
const canvasContext={};for(const name of methodNames)canvasContext[name]=(...args)=>{draw.count++;draw.methods.add(name);return name.includes('Gradient')?{addColorStop(){}}:name==='measureText'?{width:0}:undefined;};
Object.defineProperty(window.HTMLCanvasElement.prototype,'getContext',{value(){return canvasContext;}});
Object.defineProperty(window.HTMLCanvasElement.prototype,'clientWidth',{get(){return 1280;}});
Object.defineProperty(window.HTMLCanvasElement.prototype,'clientHeight',{get(){return 800;}});
window.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,width:1280,height:800,right:1280,bottom:800,toJSON(){return this;}};};
window.matchMedia=()=>({matches:false,media:'',addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
window.visualViewport={width:1280,height:800,addEventListener(){},removeEventListener(){}};
window.navigator.vibrate=()=>true;
const audioCall=(name)=>{audio.count++;audio.methods.add(name);};
const param=()=>({value:0,setValueAtTime(){audioCall('AudioParam.setValueAtTime');},linearRampToValueAtTime(){audioCall('AudioParam.linearRampToValueAtTime');},exponentialRampToValueAtTime(){audioCall('AudioParam.exponentialRampToValueAtTime');},setTargetAtTime(){audioCall('AudioParam.setTargetAtTime');},cancelScheduledValues(){audioCall('AudioParam.cancelScheduledValues');}});
const node=(kind)=>({kind,connect(){audioCall(`${kind}.connect`);return this;},disconnect(){audioCall(`${kind}.disconnect`);},start(){audioCall(`${kind}.start`);},stop(){audioCall(`${kind}.stop`);},gain:param(),frequency:param(),detune:param(),Q:param(),pan:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),type:'sine',setPeriodicWave(){audioCall(`${kind}.setPeriodicWave`);}});
class StubAudioContext{
  constructor(){audioCall('AudioContext.constructor');this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination=node('Destination');}
  createGain(){audioCall('AudioContext.createGain');return node('GainNode');}
  createOscillator(){audioCall('AudioContext.createOscillator');return node('OscillatorNode');}
  createBiquadFilter(){audioCall('AudioContext.createBiquadFilter');return node('BiquadFilterNode');}
  createDynamicsCompressor(){audioCall('AudioContext.createDynamicsCompressor');return node('DynamicsCompressorNode');}
  createBufferSource(){audioCall('AudioContext.createBufferSource');return Object.assign(node('BufferSource'),{buffer:null,loop:false});}
  createStereoPanner(){audioCall('AudioContext.createStereoPanner');return node('StereoPannerNode');}
  createBuffer(channels,length,rate){audioCall('AudioContext.createBuffer');return {numberOfChannels:channels,length,sampleRate:rate,getChannelData(){return new Float32Array(length);}};}
  createPeriodicWave(){audioCall('AudioContext.createPeriodicWave');return {};}
  decodeAudioData(){audioCall('AudioContext.decodeAudioData');return Promise.resolve(this.createBuffer(1,1,this.sampleRate));}
  resume(){audioCall('AudioContext.resume');this.state='running';return Promise.resolve();}
  suspend(){audioCall('AudioContext.suspend');this.state='suspended';return Promise.resolve();}
  close(){audioCall('AudioContext.close');return Promise.resolve();}
}
window.AudioContext=StubAudioContext;window.webkitAudioContext=StubAudioContext;
window.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){audioCall('ResizeObserver.observe');}unobserve(){}disconnect(){}};
window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(){audioCall('IntersectionObserver.observe');}unobserve(){}disconnect(){}};
window.requestIdleCallback=(fn)=>setTimeout(()=>fn({didTimeout:false,timeRemaining:()=>10}),0);
window.cancelIdleCallback=(id)=>clearTimeout(id);
window.navigator.wakeLock={request:async()=>({release:async()=>{},addEventListener(){}})};
let rafId=0;const rafQueue=[];window.requestAnimationFrame=fn=>{if(rafQueue.length<8)rafQueue.push(fn);return ++rafId;};window.cancelAnimationFrame=()=>{};
const scripts=[...dom.window.document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
const context=dom.getInternalVMContext();
for(const src of scripts){const file=src.replace(/^\.\//,'');try{vm.runInContext(await readFile(path.join(root,file),'utf8')+`\n//# sourceURL=${file}`,context,{filename:file});}catch(error){errors.push({kind:'script',file,message:error.message,stack:error.stack});break;}}
const gestureStates=[];
window.document.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,button:0}));
await Promise.resolve();
gestureStates.push({event:'mousedown',state:vm.runInContext("typeof audio!=='undefined' ? (audio.ctx?.state||'none') : 'missing'",context)});
window.document.dispatchEvent(new window.Event('touchstart',{bubbles:true}));
await Promise.resolve();
gestureStates.push({event:'touchstart',state:vm.runInContext("typeof audio!=='undefined' ? (audio.ctx?.state||'none') : 'missing'",context)});
const patrolSmoke=vm.runInContext("(()=>{game.dispatch({type:'NEW_PATROL',areaKey:'Truk Approaches',missionType:'HARBOR_STRIKE',gameIdentity:{campaignId:'pacific-submarine-war',warPartyId:'pacific-usa',theaterId:'pacific',playerFactionId:'usa',campaignProfileId:'us-pacific',submarineProfileId:'gato-silversides'}});game.engine.processCommands();game.update(0.5);return {harbor:!!game.state.world.harbor,initialized:!!game.state.world.harborInitialized,area:game.state.campaign.patrolArea,profile:game.state.campaign.campaignProfileId,op:!!getCampaignHarborOperationProfile(game.state.campaign.campaignProfileId)};})()",context);
const torpedoSmoke=vm.runInContext("(()=>{const t0=game.state.world.contacts.find(c=>c.harborTarget);if(!t0)return {launched:false,hit:false,reason:'no target'};game.state.world.harbor.netRangeNm=0;game.state.playerSub.depthFeet=60;const ready=game.state.weapons.tubes[0];ready.status='READY';game.state.tdc.targetId=t0.id;game.state.tdc.autoTrack=false;game.state.tdc.bearing=90;game.state.tdc.rangeNm=.7;game.state.tdc.targetCourse=0;game.state.tdc.targetSpeedKnots=0;game.state.tdc.torpedoSpecKey='mk14fast';game.state.tdc.gyroAngle=0;game.state.tdc.solutionCourse=game.state.playerSub.heading;game.state.tdc.solutionQuality=1;game.state.tdc.launchBank=null;game.engine.fireTorpedo(ready.id);const t=game.state.weapons.activeTorpedoes[0];if(!t)return {launched:false,hit:false,reason:'fire rejected'};t.position={...t0.position};t.speedKnots=0;t.armedAfterNm=0;t.rangeRunNm=1;const hit=game.engine.torpedoShipSweepHit(t,t.position,t0);game.update(0.05);return {launched:true,hit:!!hit||t0.damage?.hits>0||t0.health<t0.maxHealth||game.state.tactical.impactObservation?.weapon==='TORPEDO'};})()",context);
const impactAge=vm.runInContext("(()=>{const s=game.state;s.tactical.impactObservation={token:9001,position:{xNm:0,yNm:0},impactPosition:{xNm:0,yNm:0},viewerPos:{xNm:0,yNm:0},durationMs:9000,preImpactMs:0,weapon:'TORPEDO',torpedoWakeVisible:false};s.runtime.presentation={impactToken:9001,impactStartedWall:performance.now()-1000};canvasView.render(s,LayoutService.get());return canvasView.lastImpactAge||0;})()",context);
const cinematicChecks=vm.runInContext("(()=>{const mk=t=>({token:t,position:{xNm:0,yNm:0},impactPosition:{xNm:0,yNm:0},viewerPos:{xNm:0,yNm:0},durationMs:9000,preImpactMs:0,weapon:'TORPEDO',torpedoWakeVisible:false});const s=game.state;s.time.modalPauses=0;s.time.timeScale=1;s.tactical.impactObservation=null;s.runtime.presentation={};const ages=[];[9101,9102,9103].forEach(t=>{game.engine.startImpactObservation(mk(t));processPresentationEffects();s.runtime.presentation.impactStartedWall=performance.now()-500;canvasView.render(s,LayoutService.get());ages.push({token:t,age:canvasView.lastImpactAge,hint:canvasView.lastImpactSkipHintVisible});});const fourth=game.engine.startImpactObservation(mk(9104));processPresentationEffects();const p=s.runtime.presentation,queued=p.impactQueue?.map(x=>x.token)||[];s.runtime.presentation.impactStartedWall=performance.now()-1000;canvasView.render(s,LayoutService.get());const hintAfterCooldown=canvasView.lastImpactSkipHintVisible;const saved=SaveSystem._cloneStateForStorage(s),loaded=SaveSystem._normalizeLoadedState(saved);return{active:s.tactical.impactObservation?.token,queued,ages,fourth,hintAfterCooldown,pauses:s.time.modalPauses,save:{timeScale:loaded.time.timeScale,modalPauses:loaded.time.modalPauses,impact:!!loaded.tactical.impactObservation,presentation:loaded.runtime?.presentation||null}};})()",context);
for(let i=0;i<5&&rafQueue.length;i++){const fn=rafQueue.shift();try{fn(i*16.67);}catch(error){errors.push({kind:'raf',message:error.message,stack:error.stack});}}
const stationResults=[];
for(const station of [...new Set([...window.document.querySelectorAll('[data-sta]')].map(b=>b.dataset.sta).filter(Boolean))]){const button=[...window.document.querySelectorAll('[data-sta]')].find(b=>b.dataset.sta===station),beforeErrors=errors.length;try{button.dispatchEvent(new window.Event('click',{bubbles:true}));}catch(error){errors.push({kind:'station-dispatch',station,message:error.message,stack:error.stack});}stationResults.push({station,rendered:errors.length===beforeErrors,ok:errors.length===beforeErrors});}
const gameLoopStarted=errors.every(e=>e.file!=='js/bootstrap/start.js')&&rafId>0;
const canvases=[...window.document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}));
dom.window.close();
console.log(JSON.stringify({root,firstException:errors[0]||null,errors,gameLoopStarted,drawCalls:draw.count,audioCalls:audio.count,gestureStates,patrolSmoke,torpedoSmoke,impactAge,cinematicChecks,audioMethods:[...audio.methods],drawMethods:[...draw.methods],canvases,stations:stationResults},null,2));
if(errors.length||!draw.count||!audio.count||!patrolSmoke.harbor||!torpedoSmoke.launched||!torpedoSmoke.hit||impactAge<=0||cinematicChecks.active!==9101||cinematicChecks.queued.length!==2||cinematicChecks.fourth!==false||cinematicChecks.pauses!==1||cinematicChecks.ages.some(x=>x.age<=0||x.hint)||!cinematicChecks.hintAfterCooldown||cinematicChecks.save.timeScale===0||cinematicChecks.save.modalPauses!==0||cinematicChecks.save.impact||Object.keys(cinematicChecks.save.presentation).length||gestureStates.some(g=>g.state!=='running')||canvases.some(c=>c.width<=0||c.height<=0)||stationResults.some(s=>!s.rendered))process.exitCode=1;
