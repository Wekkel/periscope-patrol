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
for(let i=0;i<5&&rafQueue.length;i++){const fn=rafQueue.shift();try{fn(i*16.67);}catch(error){errors.push({kind:'raf',message:error.message,stack:error.stack});}}
const stationResults=[];
for(const station of [...new Set([...window.document.querySelectorAll('[data-sta]')].map(b=>b.dataset.sta).filter(Boolean))]){const button=[...window.document.querySelectorAll('[data-sta]')].find(b=>b.dataset.sta===station),beforeErrors=errors.length;try{button.dispatchEvent(new window.Event('click',{bubbles:true}));}catch(error){errors.push({kind:'station-dispatch',station,message:error.message,stack:error.stack});}stationResults.push({station,rendered:errors.length===beforeErrors,ok:errors.length===beforeErrors});}
const gameLoopStarted=errors.every(e=>e.file!=='js/bootstrap/start.js')&&rafId>0;
const canvases=[...window.document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}));
dom.window.close();
console.log(JSON.stringify({root,firstException:errors[0]||null,errors,gameLoopStarted,drawCalls:draw.count,audioCalls:audio.count,gestureStates,audioMethods:[...audio.methods],drawMethods:[...draw.methods],canvases,stations:stationResults},null,2));
if(errors.length||!draw.count||!audio.count||gestureStates.some(g=>g.state!=='running')||canvases.some(c=>c.width<=0||c.height<=0)||stationResults.some(s=>!s.rendered))process.exitCode=1;
