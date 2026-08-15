import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const graph=JSON.parse(await readFile(path.join(root,'tests','call-graph-current.json'),'utf8'));
const systemClasses=new Set(['HarborSystem','WeatherSystem','SoundRadarSystem','TorpedoSystem','DeckGunSystem','AAGunSystem']);
const newlyComposed=new Set(['TorpedoSystem','DeckGunSystem','AAGunSystem']);
const systemMethods=new Map();
for(const m of graph.methods){
  if(systemClasses.has(m.class)) systemMethods.set(m.name,m);
}
const definitionsByName=new Map();
for(const m of graph.methods){if(!definitionsByName.has(m.name))definitionsByName.set(m.name,[]);definitionsByName.get(m.name).push(m);}
const sharedContextNames=new Set(['log','notify','shake','captainLog','isNavigableMapPoint','ensureBattleAtmosphereState']);
const misses=[];
const contextSource=await readFile(path.join(root,'js','simulation','system-context.js'),'utf8');
const boundBySystem=new Map([...contextSource.matchAll(/for\(const name of \[([^\]]+)\]\)bindLeafMethod\(ctx,(HarborSystem|WeatherSystem|SoundRadarSystem),name\)/g)].map(m=>[m[2],new Set([...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]))]));
const domainSystem=new Map([['harbor','HarborSystem'],['soundRadar','SoundRadarSystem'],['torpedoes','TorpedoSystem'],['deckGun','DeckGunSystem'],['aaGun','AAGunSystem']]);
const adapterTargets=new Map([
  ['navigation',new Set(['updateTdc'])],['impact',new Set(['captureShipState','offerObservation'])],
  ['enemyAI',new Set(['maybeMerchantSpotTorpedo'])],['escorts',new Set(['alert'])],
  ['damage',new Set(['applyShock'])],['deckOperations',new Set(['clearForDive'])],
  ['mission',new Set(['checkObjectives'])]
]);
for(const m of graph.methods){
  if(systemClasses.has(m.class)){
    for(const c of m.callDetails||[]){
      if(['direct','optional-direct'].includes(c.kind)&&c.relation==='system'&&!boundBySystem.get(m.class)?.has(c.name))
        misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name)?.file||'unknown',reason:'system method is not bound into its runtime context'});
      if(newlyComposed.has(m.class)&&['direct','optional-direct'].includes(c.kind)&&systemMethods.get(c.name)?.class===m.class)
        misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name).file,reason:'composed system calls its own method without an explicit sys facade'});
      if(['direct','optional-direct'].includes(c.kind)&&c.relation==='unresolved'&&!sharedContextNames.has(c.name)){
        const external=definitionsByName.get(c.name)?.find(d=>d.class!==m.class);
        if(external)misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:external.file,reason:'composed system calls a method owned by another layer without an explicit dependency'});
      }
      if(c.kind==='system-path'){
        const domain=String(c.object||'').replace(/^this\.sys\./,'');
        const targetClass=domainSystem.get(domain);
        if(targetClass&&systemMethods.get(c.name)?.class!==targetClass)
          misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name)?.file||'unknown',reason:`sys.${domain} does not expose this system method`});
        if(!targetClass&&!adapterTargets.get(domain)?.has(c.name))
          misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:'unknown',reason:`undeclared sys.${domain} dependency`});
      }
    }
    continue;
  }
  for(const c of m.callDetails||[]){
    if(['direct','optional-direct'].includes(c.kind)&&c.relation==='unresolved'&&systemMethods.has(c.name))
      misses.push({file:m.file,line:c.line,caller:`${m.class}.${m.name}`,name:c.name,definedBy:systemMethods.get(c.name).file});
  }
}
if(misses.length){
  console.error(`unresolved system call targets: ${misses.length}`);
  for(const miss of misses) console.error(`${miss.file}:${miss.line} ${miss.caller} -> ${miss.name} (defined in ${miss.definedBy})${miss.reason?` — ${miss.reason}`:''}`);
  process.exit(1);
}
console.log('system call-target check passed: all direct calls resolve');
