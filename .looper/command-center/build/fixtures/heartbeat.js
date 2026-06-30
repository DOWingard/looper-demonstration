#!/usr/bin/env node
// Heartbeat stand-in for CC_SESSION_CMD. A real interactive process the evaluator can
// drive to prove the terminal is live (not a canned echo) and that it SURVIVES detach:
//   - prints its cwd on launch (proves dispatch landed in the chosen dir)
//   - emits a monotonically increasing per-second counter (advances while detached)
//   - renders ANSI color + cursor moves and many lines of scrollback
//   - answers a computed probe: `2+2` -> `4`
//   - echoes a session-unique token on `token` / `whoami` (state only it holds)
//
// It runs inside a node-pty (interactive), never `claude -p`.

import crypto from 'node:crypto';

const TOKEN = process.env.CC_HEARTBEAT_TOKEN || `hb-${crypto.randomBytes(4).toString('hex')}`;
const out = (s) => process.stdout.write(s);

const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

out(`${C.bold}${C.cyan}heartbeat stand-in${C.reset} ready\n`);
out(`${C.dim}cwd:${C.reset} ${process.cwd()}\n`);
out(`${C.dim}session-token:${C.reset} ${C.magenta}${TOKEN}${C.reset}\n`);
out(`${C.dim}try:${C.reset} type ${C.yellow}2+2${C.reset}, ${C.yellow}token${C.reset}, ${C.yellow}pwd${C.reset}, or any text\n`);

let counter = 0;
// Per-second monotonic counter, one new scrollback line each tick, with a cursor-move
// animation (the colored block position cycles via cursor-forward).
setInterval(() => {
  const pos = counter % 12;
  const bar = ' '.repeat(pos) + `${C.green}█${C.reset}`;
  // \x1b[2K clears the line, \r returns the cursor, \x1b[<n>C moves it forward.
  out(`${C.cyan}tick ${String(counter).padStart(4, ' ')}${C.reset}  \x1b[1m[\x1b[0m${bar}\x1b[${12 - pos}C${C.dim}]${C.reset}\n`);
  counter += 1;
}, 1000);

// Interactive line handling. In a pty the line discipline delivers cooked lines; we
// split on CR/LF and answer probes. The pty echoes typed input itself.
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.search(/[\r\n]/)) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line !== '') handleLine(line);
  }
});

function handleLine(line) {
  const add = line.match(/^(-?\d+)\s*\+\s*(-?\d+)$/);
  if (add) {
    const sum = parseInt(add[1], 10) + parseInt(add[2], 10);
    out(`${C.yellow}${add[1]}+${add[2]} = ${sum}${C.reset}\n`);
    return;
  }
  const lower = line.toLowerCase();
  if (lower === 'token' || lower === 'whoami') {
    out(`${C.magenta}token: ${TOKEN}${C.reset}\n`);
    return;
  }
  if (lower === 'pwd') {
    out(`${process.cwd()}\n`);
    return;
  }
  if (lower === 'help') {
    out('commands: 2+2 | token | whoami | pwd | <any text>\n');
    return;
  }
  if (lower === 'exit' || lower === 'quit') {
    out('bye\n');
    process.exit(0);
  }
  out(`${C.dim}you said:${C.reset} ${line}\n`);
}

process.on('SIGTERM', () => process.exit(0));
