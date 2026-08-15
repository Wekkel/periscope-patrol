import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const graph=JSON.parse(await readFile(path.join(root,'tests','call-graph-current.json'),'utf8'));
const systemClasses=new Set(['HarborSystem','WeatherSystem','SoundRadarSystem']);
const systemMethods=new Map();
for(const m of graph.methods){
  if(systemClasses.has(m.class)) systemMethods.set(m.name,m);
}
const misses=[];
const contextSource=await readFile(path.join(root,'js','simulation','system-context.js'),'utf8');
const boundBySystem=new Map([...contextSource.matchAll(/for\(const name of \[([^\]]+)\]\)bindLeafMethod\(ctx,(HarborSystem|WeatherSystem|SoundRadarSystem),name\)/g)].map(m=>[m[2],new Set([...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]))]));
for(const m of graph.methods){
  if(systemClasses.has(m.class)){
    for(const c of m.callDetails||[]){
      if(c.kind==='direct'&&c.relation==='system'&&!boundBySystem.get(m.class)?.has(c.name))
        misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name)?.file||'unknown',reason:'system method is not bound into its runtime context'});
    }
    continue;
  }
  for(const c of m.callDetails||[]){
    if(c.kind==='direct'&&c.relation==='unresolved'&&systemMethods.has(c.name))
      misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name).file});
  }
}
if(misses.length){
  console.error(`unresolved system call targets: ${misses.length}`);
  for(const miss of misses) console.error(`${miss.file}:${miss.line} ${miss.caller} -> ${miss.name} (defined in ${miss.definedBy})${miss.reason?` — ${miss.reason}`:''}`);
  process.exit(1);
}
console.log('system call-target check passed: all direct calls resolve');
