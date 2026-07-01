#!/usr/bin/env node
// Synthetic fixtures generator. Writes schema-faithful Claude Code JSONL across >=3
// fake project directories (plus a cwd-vs-dirname conflict dir), with multiple
// sessions, tool_use variety, a real subagent sidechain transcript, >=1 malformed
// line, a large transcript, and a spread of timestamp recencies so every status
// (working / waiting / idle / done) is inducible. All content is SYNTHETIC.
//
// Usage:
//   CC_PROJECTS_DIR=/path node fixtures/generate.js [init]   # build the tree
//   CC_PROJECTS_DIR=/path node fixtures/generate.js append   # append one live action
//   CC_PROJECTS_DIR=/path node fixtures/generate.js live 1500 # append every 1.5s
//   node fixtures/generate.js init --dir /path                # explicit target

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) || 'init';
const dirFlagIdx = argv.indexOf('--dir');
const TARGET = dirFlagIdx >= 0 ? argv[dirFlagIdx + 1] : process.env.CC_PROJECTS_DIR;

if (!TARGET) {
  process.stderr.write(
    'fixtures: set CC_PROJECTS_DIR (or pass --dir) to a target directory.\n' +
      'Refusing to guess so real ~/.claude/projects is never touched.\n'
  );
  process.exit(2);
}

const DIRS = {
  webapp: { dirName: '-home-null-fixtures-webapp', cwd: '/home/user/fixtures/webapp', branch: 'main' },
  api: { dirName: '-home-null-fixtures-api', cwd: '/home/user/fixtures/api', branch: 'develop' },
  infra: { dirName: '-home-null-fixtures-infra', cwd: '/home/user/fixtures/infra', branch: 'main' },
  // Conflict fixture: the on-disk dir name decodes to /home/user/fixtures/decoyAlpha,
  // but every record carries cwd /home/user/fixtures/realBeta. Correct grouping must
  // follow the cwd (realBeta), proving cwd is read, not the dir name decoded.
  conflict: { dirName: '-home-null-fixtures-decoyAlpha', cwd: '/home/user/fixtures/realBeta', branch: 'feature/login' },
};

const VERSION = '2.1.140';
let seq = 0;
const uuid = () => `${Date.now().toString(16)}-${(seq++).toString(16)}-${crypto.randomBytes(3).toString('hex')}`;
const iso = (ageMs) => new Date(Date.now() - ageMs).toISOString();

function baseFields(ctx, ageMs, over = {}) {
  return {
    parentUuid: ctx.parent,
    isSidechain: !!ctx.isSidechain,
    agentId: ctx.agentId || null,
    userType: 'external',
    entrypoint: 'cli',
    type: over.type,
    uuid: uuid(),
    timestamp: iso(ageMs),
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    version: VERSION,
    gitBranch: ctx.branch,
    ...over,
  };
}

function userText(ctx, ageMs, text) {
  const r = baseFields(ctx, ageMs, { type: 'user', message: { role: 'user', content: text } });
  ctx.parent = r.uuid;
  return r;
}
function assistant(ctx, ageMs, blocks, stop = 'tool_use') {
  const r = baseFields(ctx, ageMs, {
    type: 'assistant',
    requestId: `req_${crypto.randomBytes(4).toString('hex')}`,
    message: { role: 'assistant', model: 'claude-opus-4', content: blocks, stop_reason: stop, usage: { input_tokens: 1200, output_tokens: 240 } },
  });
  ctx.parent = r.uuid;
  return r;
}
function toolResult(ctx, ageMs, toolUseId, content, structured) {
  const r = baseFields(ctx, ageMs, {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: false }] },
    toolUseResult: structured || { stdout: content, stderr: '', exitCode: 0 },
  });
  ctx.parent = r.uuid;
  return r;
}

const thinking = (t) => ({ type: 'thinking', thinking: t, signature: 'sig' });
const text = (t) => ({ type: 'text', text: t });
const toolUse = (name, input) => ({ type: 'tool_use', id: `toolu_${crypto.randomBytes(4).toString('hex')}`, name, input });

// A coherent conversation that ends in a record fixing the desired status.
function buildSession(ctx, profile, opts = {}) {
  const out = [];
  const push = (r) => out.push(r);
  push(userText(ctx, opts.startAge ?? 6 * 60 * 1000, 'Please implement the requested change and run the tests.'));

  // Read something.
  let tu = toolUse('Read', { file_path: `${ctx.cwd}/src/index.js` });
  push(assistant(ctx, 5 * 60 * 1000, [thinking('Let me read the entry point first.'), text('Reading the entry point.'), tu]));
  push(toolResult(ctx, 5 * 60 * 1000 - 1000, tu.id, 'export function main() {}'));

  // Write a new 12-line file (+12 / -0) — exact, for the files-changed surface.
  const newContent = Array.from({ length: 12 }, (_, i) => `  const line${i + 1} = ${i + 1};`).join('\n');
  tu = toolUse('Write', { file_path: `${ctx.cwd}/src/feature.js`, content: newContent });
  push(assistant(ctx, 4 * 60 * 1000, [text('Creating the feature module.'), tu]));
  push(toolResult(ctx, 4 * 60 * 1000 - 1000, tu.id, 'File created', { type: 'create', filePath: `${ctx.cwd}/src/feature.js` }));

  // Edit one line -> one line (+1 / -1).
  tu = toolUse('Edit', { file_path: `${ctx.cwd}/src/app.js`, old_string: 'const version = 1;', new_string: 'const version = 2;' });
  push(assistant(ctx, 3 * 60 * 1000, [text('Bumping the version.'), tu]));
  push(toolResult(ctx, 3 * 60 * 1000 - 1000, tu.id, 'Edited'));

  // A subagent dispatch (Task) on the main thread (the sidechain file is separate).
  if (opts.dispatchSub) {
    tu = toolUse('Task', { description: 'audit dependencies', subagent_type: 'security-review' });
    push(assistant(ctx, 2 * 60 * 1000, [text('Dispatching a security review subagent.'), tu]));
    push(toolResult(ctx, 2 * 60 * 1000 - 1000, tu.id, 'Subagent completed: no critical issues.'));
  }

  // Filler to make a large transcript (tail-load must stay bounded over this).
  if (opts.big) {
    for (let i = 0; i < 900; i++) {
      const t = toolUse('Read', { file_path: `${ctx.cwd}/src/mod${i}.js` });
      push(assistant(ctx, 60 * 1000 + (900 - i) * 1000, [text(`Reading module ${i}.`), t]));
      push(toolResult(ctx, 60 * 1000 + (900 - i) * 1000 - 500, t.id, `module ${i} contents`));
    }
  }

  // Terminal record fixes the status via kind + recency.
  if (profile === 'working') {
    const t = toolUse('Bash', { command: 'npm test -- --watch' });
    push(assistant(ctx, 20 * 1000, [text('Running the test suite.'), t]));
  } else if (profile === 'waiting') {
    push(assistant(ctx, 90 * 1000, [text('I have two viable approaches — a thin adapter or a full rewrite. Which do you want me to take?')], 'end_turn'));
  } else if (profile === 'idle') {
    const t = toolUse('Grep', { pattern: 'TODO' });
    push(assistant(ctx, 10 * 60 * 1000, [text('Scanning for TODOs.'), t]));
  } else if (profile === 'done') {
    push(assistant(ctx, 50 * 60 * 1000, [text('All changes are committed and the branch is pushed.')], 'end_turn'));
  }
  return out;
}

function writeJsonl(file, records, { malformed = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r));
  if (malformed && lines.length > 3) {
    // Inject one corrupt line mid-file; valid records around it must still parse.
    lines.splice(2, 0, '{"type":"assistant","uuid":"BROKEN", this is not valid json ]');
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

// The session catalog (fixed ids so `append` is deterministic).
const SESSIONS = [
  { dir: 'webapp', id: 'sess-webapp-working', profile: 'working', dispatchSub: true, sub: true },
  { dir: 'webapp', id: 'sess-webapp-waiting', profile: 'waiting' },
  { dir: 'webapp', id: 'sess-webapp-history', profile: 'idle', big: true },
  { dir: 'api', id: 'sess-api-idle', profile: 'idle' },
  { dir: 'api', id: 'sess-api-done', profile: 'done' },
  { dir: 'infra', id: 'sess-infra-working', profile: 'working', malformed: true },
  { dir: 'infra', id: 'sess-infra-waiting', profile: 'waiting' },
  { dir: 'conflict', id: 'sess-beta-working', profile: 'working' },
];

function fileFor(s) {
  return path.join(TARGET, DIRS[s.dir].dirName, `${s.id}.jsonl`);
}

function init() {
  // Clean only the fixture dirs we manage (idempotent), never the whole target.
  for (const d of Object.values(DIRS)) {
    fs.rmSync(path.join(TARGET, d.dirName), { recursive: true, force: true });
  }
  for (const s of SESSIONS) {
    const d = DIRS[s.dir];
    const ctx = { cwd: d.cwd, branch: d.branch, sessionId: s.id, parent: null };
    const records = buildSession(ctx, s.profile, { big: s.big, dispatchSub: s.dispatchSub });
    writeJsonl(fileFor(s), records, { malformed: s.malformed });

    // A real subagent sidechain transcript in subagents/ (depth-2 discovery + the
    // feed's main-vs-subagent distinction).
    if (s.sub) {
      const subId = `${s.id}-agent`;
      const subCtx = { cwd: d.cwd, branch: d.branch, sessionId: subId, parent: null, isSidechain: true, agentId: 'agent-secrev-1' };
      const subRecords = [
        userText(subCtx, 2 * 60 * 1000 + 5000, 'Audit the dependency tree for known CVEs.'),
        (() => {
          const t = toolUse('Bash', { command: 'npm audit --json' });
          return assistant(subCtx, 2 * 60 * 1000, [text('Running an audit.'), t]);
        })(),
        (() => {
          const t = toolUse('Grep', { pattern: 'eval\\(' });
          return assistant(subCtx, 110 * 1000, [text('Scanning for eval().'), t]);
        })(),
      ];
      writeJsonl(path.join(TARGET, d.dirName, 'subagents', `${subId}.jsonl`), subRecords);
    }
  }
  const groups = new Set(Object.values(DIRS).map((d) => d.cwd));
  process.stdout.write(
    `fixtures: wrote ${SESSIONS.length} sessions + 1 subagent across ${groups.size} dirs into ${TARGET}\n` +
      `  statuses inducible: working, waiting-for-input, idle, done\n` +
      `  includes: malformed line, large transcript, sidechain, cwd-vs-dirname conflict (dir decoyAlpha / cwd realBeta)\n`
  );
}

// Append one fresh tool_use action to a live session (drives f4/f14 live surfacing).
function appendOne() {
  const target = SESSIONS[0]; // sess-webapp-working
  const file = fileFor(target);
  if (!fs.existsSync(file)) {
    process.stderr.write('fixtures: run `init` first.\n');
    process.exit(1);
  }
  const d = DIRS[target.dir];
  const marker = `live-${Date.now().toString(36)}`;
  const ctx = { cwd: d.cwd, branch: d.branch, sessionId: target.id, parent: null };
  const t = toolUse('Bash', { command: `echo ${marker} && git status -s` });
  const rec = assistant(ctx, 0, [text('Checking working tree.'), t]);
  fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
  process.stdout.write(`fixtures: appended Bash "${t.input.command}" to ${target.id} (marker ${marker})\n`);
  return marker;
}

// Extreme-scale fixtures for the responsiveness / virtualization criterion (c5): many
// directories, each with several sessions over large transcripts. The unified feed runs
// to many thousands of items so the client's windowing + bounded buffers can be exercised
// under load. Usage: CC_PROJECTS_DIR=/path node fixtures/generate.js huge [dirs] [perDir]
function huge() {
  const dirCount = Number(argv.filter((a) => /^\d+$/.test(a))[0]) || 14;
  const perDir = Number(argv.filter((a) => /^\d+$/.test(a))[1]) || 6;
  for (const d of Object.values(DIRS)) fs.rmSync(path.join(TARGET, d.dirName), { recursive: true, force: true });
  let sessions = 0;
  const profiles = ['working', 'waiting', 'idle', 'done'];
  for (let di = 0; di < dirCount; di++) {
    const cwd = `/home/user/scale/proj${di}`;
    const dirName = encodeCwd(cwd);
    fs.rmSync(path.join(TARGET, dirName), { recursive: true, force: true });
    for (let si = 0; si < perDir; si++) {
      const id = `sess-scale-${di}-${si}`;
      const ctx = { cwd, branch: di % 2 ? 'main' : 'develop', sessionId: id, parent: null };
      // every 3rd session carries a large transcript so tail-load + virtualization are tested
      const records = buildSession(ctx, profiles[(di + si) % profiles.length], { big: si % 3 === 0 });
      writeJsonl(path.join(TARGET, dirName, `${id}.jsonl`), records, { malformed: si % 7 === 0 });
      sessions++;
    }
  }
  process.stdout.write(`fixtures: HUGE — wrote ${sessions} sessions across ${dirCount} dirs into ${TARGET}\n  (large transcripts on every 3rd session; feed will run to many thousands of items)\n`);
}

// encodeCwd mirrors the server's pathenc so huge-mode dir names round-trip.
function encodeCwd(cwd) {
  return String(cwd).replace(/\//g, '-');
}

if (cmd === 'init') init();
else if (cmd === 'huge') huge();
else if (cmd === 'append') appendOne();
else if (cmd === 'live') {
  const interval = Number(argv.find((a) => /^\d+$/.test(a))) || 2000;
  process.stdout.write(`fixtures: live append every ${interval}ms (ctrl-c to stop)\n`);
  setInterval(appendOne, interval);
} else {
  process.stderr.write(`fixtures: unknown command "${cmd}" (use init | huge | append | live)\n`);
  process.exit(2);
}
