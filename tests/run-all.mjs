import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root=path.resolve(process.argv[2]||'.');
const eslintBin=path.join(root,'node_modules','.bin',process.platform==='win32'?'eslint.cmd':'eslint');
const checks=[
  ['call-graph generation',process.execPath,['tests/generate-call-graph.mjs','.']],
  ['quality gates',process.execPath,['tests/quality-gates.mjs','.']],
  ['behaviour tests',process.execPath,['tests/behaviour.mjs']],
  ['boot harness',process.execPath,['tests/boot-harness.mjs','.']],
  ['ESLint globals',process.execPath,['tests/generate-eslint-globals.mjs','.']],
  ['ESLint no-undef',eslintBin,['.']],
  ['call-order baseline',process.execPath,['tests/verify-call-graph.mjs']],
  ['call-target resolution',process.execPath,['tests/verify-call-targets.mjs','.']],
  ['render call-target resolution',process.execPath,['tests/verify-render-call-targets.mjs','.']]
];

for(const [label,command,args] of checks){
  console.log(`\n[PP TEST] ${label}`);
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false});
  if(result.error){console.error(`[PP TEST] could not start ${label}: ${result.error.message}`);process.exit(1);}
  if(result.status!==0){console.error(`[PP TEST] failed: ${label} (${result.status})`);process.exit(result.status||1);}
}
console.log('\n[PP TEST] all checks passed');
