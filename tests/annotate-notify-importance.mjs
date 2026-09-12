/* One-time, mechanically repeatable annotation of the reviewed notify inventory. */
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'.';
const inv=fs.readFileSync(path.join(root,'docs/notify-inventory.md'),'utf8').split('\n## Supplemental')[0];
const rows=[];
for(const line of inv.split('\n')){const m=line.match(/^\| `([^`]+)` \| (\d+) \| [^|]+ \| (KRITIEK|NUTTIG|RUIS) \|/);if(m)rows.push({file:m[1],line:+m[2],importance:m[3]});}
const grouped=new Map();for(const r of rows){if(!grouped.has(r.file))grouped.set(r.file,[]);grouped.get(r.file).push(r);}
function notifyCalls(src){return [...src.matchAll(/(?:this|engine|ctx)\.notify\([\s\S]*?\);/g)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0],line:src.slice(0,m.index).split('\n').length}));}
let changed=0,skipped=0,unresolved=[];
for(const [file,rs0] of grouped){
  const full=path.join(root,file);let src=fs.readFileSync(full,'utf8');const cs=notifyCalls(src);
  let rs=[...rs0];
  /* The reviewed inventory predates two same-line mission notifications. */
  if(file==='js/simulation/mission-framework.js'){
    const out=[];for(const r of rs){out.push(r);if(r.line===397)out.push({file,line:397,importance:'KRITIEK'});if(r.line===413)out.push({file,line:413,importance:'NUTTIG'});}rs=out;
  }
  if(cs.length!==rs.length){unresolved.push(`${file}: inventory ${rs.length}, source ${cs.length}`);continue;}
  const edits=[];
  for(let i=0;i<cs.length;i++){
    const c=cs[i],r=rs[i];
    if(/\.notify\(\.\.\.args\)/.test(c.text)){skipped++;continue;}
    let body=c.text.slice(c.text.indexOf('(')+1,-2);
    body=body.replace(/,\s*'(?:KRITIEK|NUTTIG|RUIS)'\s*$/,'');
    edits.push({start:c.start,end:c.end,text:c.text.slice(0,c.text.indexOf('(')+1)+body+`, '${r.importance}');`});changed++;
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))src=src.slice(0,e.start)+e.text+src.slice(e.end);
  fs.writeFileSync(full,src);
}
console.log(JSON.stringify({inventoryRows:rows.length,annotated:changed,skipped,unresolved},null,2));
if(unresolved.length)process.exitCode=2;
