import {readdir,readFile,stat} from 'node:fs/promises';import path from 'node:path';import process from 'node:process';
const root=path.resolve(process.argv[2]||'.'),fail=[];async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','tests','node_modules'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
const all=await files(root),sized=await Promise.all(all.map(async p=>[p,(await stat(p)).size])),sum=filter=>sized.filter(([p])=>filter(p)).reduce((n,[,b])=>n+b,0),rel=p=>path.relative(root,p);
// Verhoogd voor het hybride audio-samplepack; volledig offline geluid is een bewuste keuze.
const budgets={repository:4_500_000,javascript:1_850_000,styles:220_000,audio:2_000_000,singleScript:145_000},values={repository:sum(()=>true),javascript:sum(p=>p.endsWith('.js')),styles:sum(p=>p.endsWith('.css')),audio:sum(p=>/\.(mp3|ogg|wav|m4a)$/i.test(p)),singleScript:Math.max(...sized.filter(([p])=>p.endsWith('.js')).map(([,b])=>b))};
for(const [k,v] of Object.entries(values))if(v>budgets[k])fail.push(`${k} ${v} > ${budgets[k]}`);
const ships=await readFile(path.join(root,'js/rendering/world-geometry.js'),'utf8');
for(const key of ['US_FLETCHER_DESTROYER','US_DESTROYER_ESCORT','GERMAN_TORPEDO_BOAT','GERMAN_MINESWEEPER','ITALIAN_SOLDATI_DESTROYER','ITALIAN_GABBIANO_CORVETTE','SOVIET_GNEVNY_DESTROYER','SOVIET_PATROL_ESCORT'])if(!ships.includes(`SHIP_MODELS.${key}=`))fail.push(`national silhouette missing: ${key}`);
const strictPatterns=[/(^|[^\w.])Toast\./,/(^|[^\w.])audio\./,/(^|[^\w.])SaveSystem\./,/(^|[^\w.])globalThis\./,/(^|[^\w.])document\./,/(^|[^\w.])setTimeout\b/,/(^|[^\w.])performance\.now\b/];
const layerViolations=[];let layerCalls=0;const layerFiles=new Set();
for(const p of all.filter(p=>rel(p).startsWith('js/simulation/')&&p.endsWith('.js'))){const src=await readFile(p,'utf8');let fileCalls=0;for(const re of strictPatterns){const hits=src.match(new RegExp(re.source,'g'))||[];fileCalls+=hits.length;if(hits.length)layerViolations.push(`${rel(p)}: ${re}`);}if(fileCalls){layerCalls+=fileCalls;layerFiles.add(p);}}
if(layerViolations.length){const message=`strict simulation-layer warnings: ${layerCalls} calls in ${layerFiles.size} files`;if(process.env.PP_STRICT_LAYERS==='1')fail.push(...layerViolations.map(v=>`simulation layer violation: ${v}`));else console.warn(message);}
const coreViolations=[];let coreCalls=0;const coreFiles=new Set();
for(const p of all.filter(p=>rel(p).startsWith('js/core/')&&p.endsWith('.js'))){const src=await readFile(p,'utf8');let n=0;for(const re of strictPatterns){if(rel(p)==='js/core/game-loop.js'&&(re.source.includes('performance\\.now')||re.source.includes('document\\.')))continue;n+=(src.match(new RegExp(re.source,'g'))||[]).length;}if(n){coreCalls+=n;coreFiles.add(p);coreViolations.push(`${rel(p)}: ${n}`);}}
if(coreCalls){const message=`strict core-layer warnings: ${coreCalls} calls in ${coreFiles.size} files`;if(process.env.PP_STRICT_LAYERS==='1')fail.push(...coreViolations.map(v=>`core layer violation: ${v}`));else console.warn(message);}
const renderSource=await readFile(path.join(root,'js/core/game-loop.js'),'utf8');
if(/\.cv\.render\(snap\s*,?\s*\)/.test(renderSource))fail.push('GameLoop render path omits layout parameter');
const layoutPatterns=[/dataset/i,/matchMedia/i,/innerWidth/i,/innerHeight/i,/clientWidth/i,/clientHeight/i,/getBoundingClientRect/i,/offsetWidth/i,/offsetHeight/i,/window\.screen/i,/visualViewport/i];
const layoutHits=[];let layoutCalls=0;const layoutFiles=new Set();
for(const p of all.filter(p=>{const r=rel(p);return (r.startsWith('js/rendering/')||r.startsWith('js/simulation/'))&&p.endsWith('.js');})){const src=await readFile(p,'utf8');let n=0;for(const re of layoutPatterns)n+=(src.match(new RegExp(re.source,'gi'))||[]).length;if(n){layoutCalls+=n;layoutFiles.add(p);layoutHits.push(`${rel(p)}: ${n}`);}}
if(layoutCalls)console.warn(`layout-read warnings: ${layoutCalls} layoutlezingen in ${layoutFiles.size} bestanden`);
console.log(JSON.stringify({ok:!fail.length,root,files:all.length,bytes:values,budgets,fail},null,2));if(fail.length)process.exit(1);
