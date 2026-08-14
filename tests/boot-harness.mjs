import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const html=await readFile(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,errors=[],draw={count:0,methods:new Set()};
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
let rafId=0;const rafQueue=[];window.requestAnimationFrame=fn=>{if(rafQueue.length<8)rafQueue.push(fn);return ++rafId;};window.cancelAnimationFrame=()=>{};
const scripts=[...dom.window.document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'));
const context=dom.getInternalVMContext();
for(const src of scripts){const file=src.replace(/^\.\//,'');try{vm.runInContext(await readFile(path.join(root,file),'utf8')+`\n//# sourceURL=${file}`,context,{filename:file});}catch(error){errors.push({kind:'script',file,message:error.message,stack:error.stack});break;}}
for(let i=0;i<5&&rafQueue.length;i++){const fn=rafQueue.shift();try{fn(i*16.67);}catch(error){errors.push({kind:'raf',message:error.message,stack:error.stack});}}
for(const button of [...window.document.querySelectorAll('[data-sta]')]){try{button.dispatchEvent(new window.Event('click',{bubbles:true}));for(let i=0;i<2&&rafQueue.length;i++){const fn=rafQueue.shift();try{fn(100+i*16.67);}catch(error){errors.push({kind:'station',station:button.dataset.sta,message:error.message,stack:error.stack});}}}catch(error){errors.push({kind:'station-dispatch',station:button.dataset.sta,message:error.message,stack:error.stack});}}
const gameLoopStarted=errors.every(e=>e.file!=='js/bootstrap/start.js')&&rafId>0;
const canvases=[...window.document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}));
dom.window.close();
console.log(JSON.stringify({root,firstException:errors[0]||null,errors,gameLoopStarted,drawCalls:draw.count,drawMethods:[...draw.methods],canvases},null,2));
if(errors.length||!draw.count||canvases.some(c=>c.width<=0||c.height<=0))process.exitCode=1;
