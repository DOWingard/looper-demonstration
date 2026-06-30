// REST API. Snapshot + per-session detail (reads), shared-memory read/write, the
// feed-item pin (signature move), dispatch, the audit trail, and the "since you last
// looked" digest. Memory writes go through the concurrency-safe store; the K-writer
// probe hits POST /api/memory with mode=append.

import crypto from 'node:crypto';
import { Digest } from './digest.js';
import { labelForCwd } from '../shared/pathenc.js';

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limitBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

// Render a pinned feed action as a provenance-tagged markdown "decision card": when, what
// action, which directory and session it came from, and the operator's rationale. This is
// the signature move's on-disk artifact — a decision trail that fuses the cross-session
// feed, the shared memory and real session provenance, which nothing else here produces (o4).
function decisionCard(entry) {
  const when = new Date(entry.ts).toISOString();
  const tool = entry.tool ? `\`${entry.tool}\` ` : '';
  const where = entry.dirLabel ? ` · ${entry.dirLabel}` : '';
  const who = entry.sourceSessionId ? ` · session \`${entry.sourceSessionId}\`` : '';
  const note = entry.note ? `\n  - ↳ ${entry.note}` : '';
  return `- **[${when}]** pinned ${tool}${entry.summary || ''}${where}${who}${note}`;
}

export function makeApiHandler(ctx) {
  const { model, memory, audit, digest, ptyRegistry } = ctx;

  return async function handleApi(req, res, url) {
    const { pathname, searchParams } = url;
    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, sessionCount: model.sessions.size });
      }

      if (req.method === 'GET' && pathname === '/api/state') {
        const snapshot = model.snapshot();
        const memKeys = await memory.list();
        const baseline = await digest.getBaseline();
        return sendJson(res, 200, {
          ...snapshot,
          memory: { keys: memKeys },
          digestBaseline: baseline,
          sessionCmd: ctx.config.sessionCmd,
        });
      }

      if (req.method === 'GET' && pathname === '/api/session') {
        const key = searchParams.get('key');
        const detail = model.getSessionDetail(key);
        if (!detail) return sendJson(res, 404, { error: 'session not found' });
        return sendJson(res, 200, detail);
      }

      if (req.method === 'GET' && pathname === '/api/memory') {
        const scope = searchParams.get('scope') || 'global';
        const key = scope === 'global' ? 'global' : searchParams.get('cwd');
        if (scope !== 'global' && !key) return sendJson(res, 400, { error: 'cwd required for dir scope' });
        const content = await memory.read(key);
        return sendJson(res, 200, { scope, cwd: scope === 'global' ? null : key, content });
      }

      if (req.method === 'POST' && pathname === '/api/memory') {
        const body = await readBody(req);
        const scope = body.scope || 'global';
        const key = scope === 'global' ? 'global' : body.cwd;
        if (scope !== 'global' && !key) return sendJson(res, 400, { error: 'cwd required for dir scope' });
        const mode = body.mode === 'replace' ? 'replace' : 'append';
        if (mode === 'replace') {
          await memory.replace(key, String(body.content ?? ''));
        } else {
          await memory.append(key, String(body.content ?? ''));
        }
        // Only a deliberate note/replace lands in the audit trail; raw appends (the
        // K-writer probe) do not, to keep the trail meaningful.
        if (body.note || mode === 'replace') {
          await audit.record({
            kind: 'memory-write',
            summary: body.note ? String(body.content ?? '').slice(0, 120) : `edited ${scope} memory`,
            cwd: scope === 'global' ? null : key,
            dirLabel: scope === 'global' ? 'global' : labelForCwd(key),
            scope,
          });
        }
        const content = await memory.read(key);
        return sendJson(res, 200, { ok: true, content });
      }

      // Signature move: pin a feed action into shared memory as a provenance-tagged
      // decision card AND record it in the audit trail. Fuses feed + memory + audit.
      if (req.method === 'POST' && pathname === '/api/pin') {
        const body = await readBody(req);
        const scope = body.scope === 'global' ? 'global' : 'dir';
        const cwd = scope === 'global' ? null : body.cwd;
        if (scope === 'dir' && !cwd) return sendJson(res, 400, { error: 'cwd required to pin to a dir' });
        const entry = {
          ts: Date.now(),
          kind: 'pin',
          tool: body.tool || null,
          summary: body.summary || '',
          sourceSessionKey: body.sessionKey || null,
          sourceSessionId: body.sessionId || null,
          cwd,
          dirLabel: scope === 'global' ? 'global' : labelForCwd(cwd),
          scope,
          note: body.note || '',
        };
        await memory.append(scope === 'global' ? 'global' : cwd, decisionCard(entry));
        const recorded = await audit.record(entry);
        return sendJson(res, 200, { ok: true, entry: recorded });
      }

      if (req.method === 'GET' && pathname === '/api/audit') {
        const items = await audit.list({ limit: Number(searchParams.get('limit')) || 500 });
        return sendJson(res, 200, { items });
      }

      if (req.method === 'GET' && pathname === '/api/digest') {
        const baseline = await digest.getBaseline();
        return sendJson(res, 200, { baseline, digest: Digest.build(model.feed, baseline) });
      }

      if (req.method === 'POST' && pathname === '/api/digest/seen') {
        const baseline = await digest.markSeen(model.now());
        return sendJson(res, 200, { baseline });
      }

      // Dispatch a new session (a live pty) into a chosen real directory.
      if (req.method === 'POST' && pathname === '/api/dispatch') {
        const body = await readBody(req);
        const cwd = body.cwd;
        if (!cwd) return sendJson(res, 400, { error: 'cwd required' });
        const sessionId = `dispatch-${crypto.randomBytes(4).toString('hex')}`;
        const key = `pty:${cwd}:${sessionId}`;
        const summary = model.addPtySession({ key, sessionId, cwd });
        await audit.record({
          kind: 'dispatch',
          summary: `dispatched a session into ${cwd}`,
          sourceSessionId: sessionId,
          sourceSessionKey: key,
          cwd,
          dirLabel: labelForCwd(cwd),
        });
        return sendJson(res, 200, { ok: true, key, sessionId, summary });
      }

      return false; // not an API route
    } catch (err) {
      sendJson(res, 400, { error: String(err.message || err) });
      return true;
    }
  };
}
