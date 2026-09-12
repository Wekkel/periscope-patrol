import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.name.endsWith('.js'))out.push(p);}return out;}
function names(src){const out=new Set(),lines=src.split(/\r?\n/);let depth=0;
  for(const line of lines){if(depth===0){for(const re of [/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,/^\s*class\s+([A-Za-z_$][\w$]*)/]){const m=line.match(re);if(m)out.add(m[1]);}}
    depth+=((line.match(/{/g)||[]).length-(line.match(/}/g)||[]).length);if(depth<0)depth=0;}
  return out;}
const globals=new Set(['window','document','navigator','performance','requestAnimationFrame','cancelAnimationFrame','AudioContext','webkitAudioContext','localStorage','sessionStorage','visualViewport','matchMedia','fetch','URL','Blob','FileReader','ResizeObserver','IntersectionObserver','requestIdleCallback','cancelIdleCallback','setTimeout','clearTimeout','setInterval','clearInterval','console','Math','Date','JSON','Promise','Map','Set','WeakMap','WeakSet','Array','Object','String','Number','Boolean','RegExp','Error','TypeError','Float32Array','Uint8Array','Intl','crypto','globalThis','self','Image','Event','MouseEvent','KeyboardEvent','CustomEvent','AudioBuffer','AudioParam','GainNode','OscillatorNode','BufferSource','DOMException','getComputedStyle','innerWidth','innerHeight','location','URLSearchParams','structuredClone','TextEncoder','MessageChannel','prompt','processPresentationEffects','buildHudViewModel','hudRound','hudFixed','PP_CONTENT_SCHEMA_VERSION','EARTH_R']);
for(const file of await walk(path.join(root,'js')))for(const n of names(await readFile(file,'utf8')))globals.add(n);
const sorted=[...globals].sort();
await writeFile(path.join(root,'eslint.config.js'),`export default [{files:['js/**/*.js'],languageOptions:{ecmaVersion:2022,sourceType:'script',globals:Object.fromEntries(${JSON.stringify(sorted)}.map(name=>[name,'readonly']))},rules:{'no-undef':'error'}}];\n`);
console.log(`generated eslint.config.js with ${sorted.length} globals`);
