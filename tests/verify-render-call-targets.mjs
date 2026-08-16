import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'.');
const sites=[
  ['js/core/game-loop.js',/\bthis\.cv\.render\s*\(([^\n;]*)\)/g],
  ['js/bootstrap/wiring.js',/\bcanvasView\.render\s*\(([^\n;]*)\)/g],
  ['js/controllers/bridge-controller.js',/\bthis\.cv\.render\s*\(([^\n;]*)\)/g],
  ['js/controllers/touch-controller.js',/\bthis\.cv\.render\s*\(([^\n;]*)\)/g]
];
const failures=[];let calls=0;
for(const [relative,pattern] of sites){
  const file=path.join(root,relative),src=await readFile(file,'utf8');
  for(const match of src.matchAll(pattern)){
    calls++;
    const line=src.slice(0,match.index).split('\n').length;
    const args=match[1];
    if(!/(?:\blayout\b|\bLayoutService\.get\s*\(\s*\))/.test(args))failures.push(`${relative}:${line} render call omits layout`);
  }
}
if(failures.length){console.error(`unresolved render call targets: ${failures.length}`);for(const failure of failures)console.error(failure);process.exit(1);}
console.log(`render call-target check passed: ${calls} render calls carry layout`);
