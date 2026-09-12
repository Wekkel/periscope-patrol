import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const input=JSON.parse(await readFile(path.join(root,'tests','call-graph-current.json'),'utf8'));
const classes=['SimEngineEnemyAI','SimEngineAircraft','SimEngineASWBrain','SimEngineASW'];
const methods=input.methods.filter(m=>classes.includes(m.class));
const methodKeys=new Set(methods.map(m=>`${m.class}.${m.name}`));
const higher=methods.map(m=>({
  class:m.class,name:m.name,file:m.file,line:m.line,
  calls:(m.callDetails||[]).filter(c=>c.relation==='higher'||c.relation==='unresolved'||c.kind==='context-path'||c.kind==='system-path')
}));
const callers={};
for(const m of input.methods){
  for(const c of m.callDetails||[]){
    const key=c.definedBy?`${c.definedBy.class}.${c.name}`:null;
    if(key&&methodKeys.has(key))(callers[key]??=[]).push({class:m.class,name:m.name,file:m.file,line:c.line,kind:c.kind});
  }
}
const result={schemaVersion:1,source:'mechanically generated from tests/call-graph-current.json',classes,methodCount:methods.length,higherCalls:higher,callers};
await writeFile(path.join(root,'tests','step7-part3-call-graph.json'),`${JSON.stringify(result,null,2)}\n`);
console.log(`generated STEP 7 part 3 graph: ${methods.length} methods; ${Object.keys(callers).length} called methods`);
