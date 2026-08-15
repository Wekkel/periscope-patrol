import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const simulationRoot = path.join(root, 'js', 'simulation');
const outputFile = path.join(root, 'tests', 'call-graph-current.json');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files.sort();
}

function closingBrace(lines, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    depth += (line.match(/{/g) || []).length;
    depth -= (line.match(/}/g) || []).length;
    opened ||= line.includes('{');
    if (opened && depth <= 0) return index;
  }
  throw new Error(`Unclosed block beginning on line ${start + 1}`);
}

function lineAt(source, offset, bodyStartLine) {
  return bodyStartLine + source.slice(0, offset).split('\n').length - 1;
}

function uniqueInOrder(records, key) {
  const seen = new Set();
  return records.filter(record => {
    const id = key(record);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function extractCalls(source, bodyStartLine) {
  const calls = [];
  const add = (match, name, kind, unresolved = false, extra = {}) => calls.push({
    name,
    kind,
    unresolved,
    line: lineAt(source, match.index, bodyStartLine),
    offset: match.index,
    ...extra
  });

  // this.method(), this.method?.()
  for (const match of source.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*(\?\.)?\s*\(/g)) {
    add(match, match[1], match[2] ? 'optional-direct' : 'direct');
  }
  // this.method.call(), this.method?.call(), and apply variants.
  for (const match of source.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*(call|apply)\s*\(/g)) {
    add(match, match[1], `this-${match[2]}`);
  }
  // obj?.method?.(): keep it visible but unresolved unless it is this (handled above).
  for (const match of source.matchAll(/\b(?!this\b)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\?\.\s*([A-Za-z_$][\w$]*)\s*\?\.\s*\(/g)) {
    add(match, match[2], 'optional-object', true, { object: match[1] });
  }

  // const f = this.method; f(). The call is recorded where f() occurs.
  const aliases = new Map();
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*this\.([A-Za-z_$][\w$]*)\b/g)) {
    aliases.set(match[1], match[2]);
  }
  for (const [alias, target] of aliases) {
    const invoke = new RegExp(`\\b${alias}\\s*\\(`, 'g');
    for (const match of source.matchAll(invoke)) {
      if (/\b(?:const|let|var)\s+$/.test(source.slice(Math.max(0, match.index - 12), match.index))) continue;
      add(match, target, 'indirect-alias', true, { alias });
    }
  }
  return calls.sort((a, b) => a.offset - b.offset || a.kind.localeCompare(b.kind));
}

function extractFields(source, bodyStartLine) {
  const accesses = [];
  for (const match of source.matchAll(/\bthis\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)) {
    const trailing = source.slice(match.index + match[0].length);
    const leading = source.slice(0, match.index);
    const write = /^\s*(?:[+\-*/%]?=|\+\+|--)/.test(trailing) || /(?:\+\+|--)\s*$/.test(leading);
    accesses.push({ path: match[1], access: write ? 'write' : 'read', line: lineAt(source, match.index, bodyStartLine) });
  }
  return uniqueInOrder(accesses, access => `${access.line}:${access.path}:${access.access}`);
}

const files = await walk(simulationRoot);
const sources = new Map();
const classes = [];
const methods = [];
const prototypeScopes = [];
const objectScopes = [];

for (const absoluteFile of files) {
  const relativeFile = path.relative(root, absoluteFile).split(path.sep).join('/');
  const lines = (await readFile(absoluteFile, 'utf8')).split(/\r?\n/);
  sources.set(relativeFile, lines);
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?/);
    if (!match) continue;
    classes.push({ name: match[1], extends: match[2] || null, file: relativeFile, line: index + 1, end: closingBrace(lines, index) + 1 });
  }
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/Object\.assign\(\s*([A-Za-z_$][\w$]*)\.prototype\s*,\s*{/);
    if (!match) continue;
    prototypeScopes.push({ class: match[1], file: relativeFile, line: index + 1, end: closingBrace(lines, index) + 1 });
  }
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*{/);
    if (!match) continue;
    objectScopes.push({ class: match[1], file: relativeFile, line: index + 1, end: closingBrace(lines, index) + 1 });
  }
}

function collectMethods(scope, origin) {
  const lines = sources.get(scope.file);
  for (let index = scope.line; index < scope.end; index++) {
    const match = lines[index].match(/^\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*{/);
    if (!match) continue;
    const end = closingBrace(lines, index);
    const source = lines.slice(index, end + 1).join('\n');
    methods.push({
      name: match[1], class: scope.name || scope.class, file: scope.file, line: index + 1, end: end + 1,
      origin, calls: extractCalls(source, index + 1), fieldAccess: extractFields(source, index + 1)
    });
    index = end;
  }
}
for (const classInfo of classes) collectMethods(classInfo, 'class');
for (const scope of prototypeScopes) collectMethods(scope, 'prototype-patch');
for (const scope of objectScopes) collectMethods(scope, 'system-object');

const classByName = new Map(classes.map(info => [info.name, info]));
const depthByClass = new Map();
function classDepth(className) {
  if (depthByClass.has(className)) return depthByClass.get(className);
  const info = classByName.get(className);
  if (!info) return null;
  const depth = info.extends ? classDepth(info.extends) + 1 : 0;
  depthByClass.set(className, depth);
  return depth;
}
for (const info of classes) classDepth(info.name);

const definitions = new Map();
for (const method of methods) {
  if (!definitions.has(method.name)) definitions.set(method.name, []);
  definitions.get(method.name).push(method);
}

function reference(method) {
  return { class: method.class, file: method.file, line: method.line };
}

function resolveCall(caller, call) {
  const candidates = definitions.get(call.name) || [];
  const callerDepth = classDepth(caller.class);
  const callerIsObject = objectScopes.some(scope => scope.class === caller.class);
  const rootOf = className => {
    let cursor = className, parent = classByName.get(cursor)?.extends || null;
    while (parent) { cursor = parent; parent = classByName.get(cursor)?.extends || null; }
    return cursor;
  };
  const callerRoot = callerIsObject ? caller.class : rootOf(caller.class);
  const candidate = candidates.filter(item => objectScopes.some(scope => scope.class === item.class)
    ? item.class === caller.class
    : rootOf(item.class) === callerRoot)
    .sort((a, b) => classDepth(b.class) - classDepth(a.class) || a.line - b.line)[0] || null;
  if (!candidate || call.unresolved) return { ...call, definedBy: candidate ? reference(candidate) : null, relation: 'unresolved' };
  if (objectScopes.some(scope => scope.class === candidate.class)) return { ...call, definedBy: reference(candidate), relation: 'system' };
  const targetDepth = classDepth(candidate.class);
  return { ...call, definedBy: reference(candidate), relation: targetDepth > callerDepth ? 'higher' : targetDepth < callerDepth ? 'lower' : 'same' };
}

for (const method of methods) method.callDetails = method.calls.map(call => resolveCall(method, call));
const update = methods.find(method => method.class === 'SimEngineCore' && method.name === 'update');
const updateSub = methods.find(method => method.class === 'SimEngine' && method.name === 'updateSub');
if (!update || !updateSub) throw new Error('Could not locate SimEngineCore.update() and SimEngine.updateSub().');

async function assertPathExists(relativeFile) {
  try {
    if (!(await stat(path.join(root, relativeFile))).isFile()) throw new Error('not a file');
  } catch (error) {
    throw new Error(`Generated path does not exist on disk: ${relativeFile} (${error.message})`);
  }
}
for (const method of methods) await assertPathExists(method.file);
for (const call of [...update.callDetails, ...updateSub.callDetails]) if (call.definedBy?.file) await assertPathExists(call.definedBy.file);

function assertCount(label, records, reportedCount) {
  if (records.length !== reportedCount) throw new Error(`${label} count mismatch: reported ${reportedCount}, list contains ${records.length}`);
}
assertCount('updateOrder', update.callDetails, update.callDetails.length);
assertCount('updateSubOrder', updateSub.callDetails, updateSub.callDetails.length);

const result = {
  schemaVersion: 2,
  source: 'mechanically generated by tests/generate-call-graph.mjs',
  assertions: { allReportedPathsExist: true, updateOrderCount: update.callDetails.length, updateSubOrderCount: updateSub.callDetails.length },
  classes: classes.map(info => ({ ...info, depth: classDepth(info.name) })),
  updateOrder: update.callDetails,
  updateSubOrder: updateSub.callDetails,
  methods: methods.map(method => ({ name: method.name, class: method.class, file: method.file, line: method.line, end: method.end, callDetails: method.callDetails, fieldAccess: method.fieldAccess }))
};
await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(`generated call graph: ${methods.length} methods; update ${result.updateOrder.length} calls; updateSub ${result.updateSubOrder.length} calls`);
