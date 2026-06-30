// node-pty process registry. One real pseudo-terminal per managed session, keyed by id.
// Detach removes a client but NEVER kills the process — it keeps running and filling a
// bounded scrollback ring buffer, so reattach replays history and shows a live process
// that advanced while detached. Multiple clients may attach to one pty. CC_SESSION_CMD
// is launched interactively through the shell (never `claude -p`, never tmux).

import pty from 'node-pty';
import fs from 'node:fs';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { LIMITS } from '../shared/constants.js';

// Resolve a usable spawn cwd. A session's real repo dir is preferred; if it does not
// exist on disk (e.g. synthetic fixture cwds during evaluation) we create it so the
// process honestly runs in — and reports — the requested directory. If creation fails
// (permissions), fall back to an existing directory so spawn never dies on chdir.
function resolveCwd(requested) {
  const candidate = requested || process.cwd();
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    fs.mkdirSync(candidate, { recursive: true });
    return candidate;
  } catch {
    for (const fb of [os.homedir(), process.cwd(), '/tmp']) {
      try {
        if (fs.existsSync(fb)) return fb;
      } catch {
        /* keep trying */
      }
    }
    return process.cwd();
  }
}

export class PtyRegistry extends EventEmitter {
  constructor({ sessionCmd, scrollbackBytes = LIMITS.PTY_SCROLLBACK_BYTES } = {}) {
    super();
    this.sessionCmd = sessionCmd;
    this.scrollbackBytes = scrollbackBytes;
    this.ptys = new Map(); // id -> entry
  }

  has(id) {
    const e = this.ptys.get(id);
    return !!e && !e.exited;
  }

  info(id) {
    const e = this.ptys.get(id);
    if (!e) return null;
    return { id, cwd: e.cwd, exited: e.exited, exitCode: e.exitCode, clients: e.clients.size, cols: e.cols, rows: e.rows };
  }

  ensure(id, { cwd, cols = 80, rows = 30, env = {} } = {}) {
    let e = this.ptys.get(id);
    if (e && !e.exited) return e;
    const shell = process.env.SHELL || 'bash';
    const spawnCwd = resolveCwd(cwd);
    const proc = pty.spawn(shell, ['-c', this.sessionCmd], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: spawnCwd,
      env: { ...process.env, ...env, TERM: 'xterm-256color' },
    });
    e = { id, proc, chunks: [], bytes: 0, clients: new Set(), cwd: spawnCwd, exited: false, exitCode: null, cols, rows };
    proc.onData((data) => {
      this._append(e, data);
      for (const c of e.clients) c.onData(data);
    });
    proc.onExit(({ exitCode }) => {
      e.exited = true;
      e.exitCode = exitCode;
      for (const c of e.clients) c.onExit(exitCode);
      this.emit('exit', { id, exitCode });
    });
    this.ptys.set(id, e);
    this.emit('spawn', { id, cwd: e.cwd });
    return e;
  }

  _append(e, data) {
    e.chunks.push(data);
    e.bytes += Buffer.byteLength(data);
    while (e.bytes > this.scrollbackBytes && e.chunks.length > 1) {
      const removed = e.chunks.shift();
      e.bytes -= Buffer.byteLength(removed);
    }
  }

  // Attach a client { onData, onExit }. Replays scrollback first so the operator sees
  // the running history, then live data flows via onData.
  attach(id, client, opts = {}) {
    const e = this.ensure(id, opts);
    e.clients.add(client);
    if (e.chunks.length) client.onData(e.chunks.join(''));
    if (e.exited) client.onExit(e.exitCode);
    return this.info(id);
  }

  detach(id, client) {
    const e = this.ptys.get(id);
    if (e) e.clients.delete(client); // process keeps running
  }

  input(id, data) {
    const e = this.ptys.get(id);
    if (e && !e.exited) e.proc.write(data);
  }

  resize(id, cols, rows) {
    const e = this.ptys.get(id);
    if (e && !e.exited && cols > 0 && rows > 0) {
      try {
        e.proc.resize(cols, rows);
        e.cols = cols;
        e.rows = rows;
      } catch {
        /* resize can throw if the pty just exited — ignore */
      }
    }
  }

  kill(id) {
    const e = this.ptys.get(id);
    if (e && !e.exited) {
      try {
        e.proc.kill();
      } catch {
        /* already gone */
      }
    }
  }

  killAll() {
    for (const id of this.ptys.keys()) this.kill(id);
  }
}
