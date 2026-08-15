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
for(const m of graph.methods){
  if(systemClasses.has(m.class)) continue;
  for(const c of m.callDetails||[]){
    if(c.kind==='direct'&&c.relation==='unresolved'&&systemMethods.has(c.name))
      misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name).file});
  }
}
if(misses.length){
  console.error(`unresolved system call targets: ${misses.length}`);
  for(const miss of misses) console.error(`${miss.file}:${miss.line} ${miss.caller} -> ${miss.name} (defined in ${miss.definedBy})`);
  process.exit(1);
}
console.log('system call-target check passed: all direct calls resolve');
