import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=path.resolve(process.argv[2]||'.');
const eslintScript=path.join(root,'node_modules','eslint','bin','eslint.js');
const hasJsdom=existsSync(path.join(root,'node_modules','jsdom'));
const hasEslint=existsSync(eslintScript);

const checks=[
  ['call-graph generation',process.execPath,['tests/generate-call-graph.mjs','.']],
  ['quality gates',process.execPath,['tests/quality-gates.mjs','.']],
  ['HUD presenter measurement',process.execPath,['tests/measure-hud-presenters.mjs']],
  ['behaviour tests',process.execPath,['tests/behaviour.mjs']],
  ['hybrid audio pipeline',process.execPath,['tests/audio-pipeline.mjs']],
  ['campaign & scenario validation',process.execPath,['tests/test-campaign-and-scenarios.mjs']],
  ...(hasJsdom ? [['boot harness',process.execPath,['tests/boot-harness.mjs','.']]] : []),
  ['ESLint globals',process.execPath,['tests/generate-eslint-globals.mjs','.']],
  ...(hasEslint ? [['ESLint no-undef',process.execPath,[eslintScript,'.']]] : []),
  ['call-order baseline',process.execPath,['tests/verify-call-graph.mjs']],
  ['call-target resolution',process.execPath,['tests/verify-call-targets.mjs','.']],
  ['render call-target resolution',process.execPath,['tests/verify-render-call-targets.mjs','.']],
  ['browser & device test harness (lifecycle)',process.execPath,['tests/harness/mission-harness.mjs','--scenario=lifecycle','--device=DESKTOP_STANDARD']],
  ['browser & device test harness (national stations)',process.execPath,['tests/harness/mission-harness.mjs','--scenario=national-stations','--device=DESKTOP_STANDARD']]
];

for(const [label,command,args] of checks){
  console.log(`\n[PP TEST] ${label}`);
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false});
  if(result.error){console.error(`[PP TEST] could not start ${label}: ${result.error.message}`);process.exit(1);}
  if(result.status!==0){console.error(`[PP TEST] failed: ${label} (${result.status})`);process.exit(result.status||1);}
}
console.log('\n[PP TEST] all checks passed');
