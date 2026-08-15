import {readFile} from 'node:fs/promises';
const current=JSON.parse(await readFile('tests/call-graph-current.json','utf8')),baseline=JSON.parse(await readFile('tests/call-graph-baseline-pre-step7.json','utf8'));
for(const key of ['updateOrder','updateSubOrder']){
  const unresolved=current[key].filter(x=>x.unresolved);
  if(unresolved.length){
    console.error(`unresolved system calls: ${key}`);
    for(const call of unresolved)console.error(`${call.line}: ${call.semanticTarget||call.name}`);
    process.exit(1);
  }
}
for(const key of ['updateOrder','updateSubOrder']){const a=current[key].map(x=>x.name),b=baseline[key].map(x=>x.name);if(a.length!==b.length||a.some((v,i)=>v!==b[i])){console.error(`call-order mismatch: ${key}`);for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i])console.error(`${i}: expected ${b[i]||'<missing>'}, got ${a[i]||'<missing>'}`);process.exit(1);}}
console.log('call-order baseline passed: update and updateSub');
