import {readdir,readFile,stat} from 'node:fs/promises';import path from 'node:path';import process from 'node:process';
const root=path.resolve(process.argv[2]||'.'),fail=[];async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','tests'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
const all=await files(root),sized=await Promise.all(all.map(async p=>[p,(await stat(p)).size])),sum=filter=>sized.filter(([p])=>filter(p)).reduce((n,[,b])=>n+b,0),rel=p=>path.relative(root,p);
const budgets={repository:2_650_000,javascript:1_850_000,styles:220_000,audio:650_000,singleScript:145_000},values={repository:sum(()=>true),javascript:sum(p=>p.endsWith('.js')),styles:sum(p=>p.endsWith('.css')),audio:sum(p=>/\.(mp3|ogg|wav|m4a)$/i.test(p)),singleScript:Math.max(...sized.filter(([p])=>p.endsWith('.js')).map(([,b])=>b))};
for(const [k,v] of Object.entries(values))if(v>budgets[k])fail.push(`${k} ${v} > ${budgets[k]}`);
const ships=await readFile(path.join(root,'js/rendering/world-geometry.js'),'utf8');
for(const key of ['US_FLETCHER_DESTROYER','US_DESTROYER_ESCORT','GERMAN_TORPEDO_BOAT','GERMAN_MINESWEEPER','ITALIAN_SOLDATI_DESTROYER','ITALIAN_GABBIANO_CORVETTE','SOVIET_GNEVNY_DESTROYER','SOVIET_PATROL_ESCORT'])if(!ships.includes(`SHIP_MODELS.${key}=`))fail.push(`national silhouette missing: ${key}`);
const strictPatterns=[/\bToast\./,/\baudio\./,/\bSaveSystem\./,/\bglobalThis\./,/\bdocument\./,/\bsetTimeout\b/,/\bperformance\.now\b/];
const layerViolations=[];
for(const p of all.filter(p=>rel(p).startsWith('js/simulation/')&&p.endsWith('.js'))){const src=await readFile(p,'utf8');for(const re of strictPatterns)if(re.test(src))layerViolations.push(`${rel(p)}: ${re}`);}
if(layerViolations.length){const message=`strict simulation-layer warnings: ${layerViolations.length}`;if(process.env.PP_STRICT_LAYERS==='1')fail.push(...layerViolations.map(v=>`simulation layer violation: ${v}`));else console.warn(message);}
console.log(JSON.stringify({ok:!fail.length,root,files:all.length,bytes:values,budgets,fail},null,2));if(fail.length)process.exit(1);
