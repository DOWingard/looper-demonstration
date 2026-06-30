// Server entry point. Order matters: config fail-fast FIRST (before any bind), then
// wire the model/memory/pty/watcher, then listen. Configured purely by CC_* env vars.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { loadConfig } from './config.js';
import { FleetModel } from './model.js';
import { MarkdownMemoryStore } from './memory-store.js';
import { AuditLog } from './audit.js';
import { Digest } from './digest.js';
import { PtyRegistry } from './pty-registry.js';
import { FleetWatcher } from './watcher.js';
import { discover } from './discovery.js';
import { makeApiHandler } from './http-api.js';
import { makeStaticHandler } from './static.js';
import { attachWsHub } from './ws-hub.js';
import { DEFAULT_STATUS_WINDOWS } from '../shared/constants.js';

// --- 1. Fail fast on missing required config, before anything binds. ---
const config = loadConfig();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

function ensureBuilt() {
  if (fs.existsSync(path.join(DIST, 'index.html'))) return true;
  process.stdout.write('[command-center] dist/ missing — building frontend (vite build)...\n');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0 && fs.existsSync(path.join(DIST, 'index.html'));
}

async function main() {
  const built = ensureBuilt();

  // Status "now" can be pinned via CC_NOW for deterministic evaluation.
  const nowFn = config.now ? () => config.now : Date.now;
  const model = new FleetModel({ nowFn, windows: DEFAULT_STATUS_WINDOWS });
  const memory = new MarkdownMemoryStore(config.memoryDir);
  const audit = new AuditLog(config.memoryDir);
  const digest = new Digest(config.memoryDir);
  const ptyRegistry = new PtyRegistry({ sessionCmd: config.sessionCmd });

  // --- 2. Initial discovery (tail-recent, never full history). ---
  const { sessions, totalFiles, deferred } = await discover(config.projectsDir);
  model.totalFiles = totalFiles;
  model.deferredCount = deferred.length;
  for (const s of sessions) model.addSession(s, { silent: true });
  process.stdout.write(
    `[command-center] discovered ${sessions.length} session(s) across ${model.snapshot().groups.length} dir(s) ` +
      `from ${config.projectsDir} (${totalFiles} files total, ${deferred.length} deferred)\n`
  );

  // --- 3. Live watcher. ---
  const watcher = new FleetWatcher({ projectsDir: config.projectsDir, model });
  watcher.seed(sessions);
  watcher.start();

  // --- 4. HTTP + WS. ---
  const ctx = { model, memory, audit, digest, ptyRegistry, config };
  const handleApi = makeApiHandler(ctx);
  const serveStatic = built ? makeStaticHandler(DIST) : null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled !== false) return;
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not found"}');
      return;
    }
    if (serveStatic) return serveStatic(req, res, req.url);
    res.writeHead(503, { 'Content-Type': 'text/plain' }).end(
      'Frontend not built. Run `npm run build` then restart, or `npm run dev:web` for dev.'
    );
  });

  attachWsHub(server, ctx);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(`[command-center] FATAL: port ${config.port} is already in use. Set CC_PORT to a free port.\n`);
    } else {
      process.stderr.write(`[command-center] server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    process.stdout.write(
      `\n[command-center] ready at http://${config.host}:${config.port}\n` +
        `  projects: ${config.projectsDir}\n  memory:   ${config.memoryDir}\n  session:  ${config.sessionCmd}\n\n`
    );
  });

  const shutdown = () => {
    ptyRegistry.killAll();
    watcher.close().finally(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`[command-center] fatal: ${err.stack || err}\n`);
  process.exit(1);
});
