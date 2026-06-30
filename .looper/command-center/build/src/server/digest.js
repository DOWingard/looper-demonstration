// "Since you last looked" cross-fleet digest (o5). Persists a baseline timestamp under
// CC_MEMORY_DIR so it survives reload, and summarizes everything that happened across
// all sessions since that baseline — grouped by directory and session, with source
// attribution — answering "what happened while I was away" without attaching to each.

import fs from 'node:fs';
import path from 'node:path';
import { labelForCwd } from '../shared/pathenc.js';

const SEEN_FILE = '_seen.json';

export class Digest {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, SEEN_FILE);
    this._ready = null;
  }

  _ensureDir() {
    if (!this._ready) this._ready = fs.promises.mkdir(this.dir, { recursive: true });
    return this._ready;
  }

  async getBaseline() {
    try {
      const text = await fs.promises.readFile(this.file, 'utf8');
      const v = JSON.parse(text);
      return typeof v.lastSeen === 'number' ? v.lastSeen : 0;
    } catch {
      return 0;
    }
  }

  async markSeen(ts) {
    await this._ensureDir();
    const lastSeen = typeof ts === 'number' ? ts : Date.now();
    await fs.promises.writeFile(this.file, JSON.stringify({ lastSeen }), 'utf8');
    return lastSeen;
  }

  // Pure summary builder over a feed array. Exposed for the API and testable in isolation.
  static build(feed, baseline) {
    const since = baseline || 0;
    const recent = feed.filter((i) => (i.ts || 0) > since);
    const byDir = new Map();
    for (const item of recent) {
      const cwd = item.cwd || '(unknown)';
      if (!byDir.has(cwd)) byDir.set(cwd, { cwd, label: labelForCwd(cwd), count: 0, sessions: new Map() });
      const g = byDir.get(cwd);
      g.count += 1;
      const sk = item.sessionKey;
      if (!g.sessions.has(sk))
        g.sessions.set(sk, { sessionKey: sk, sessionId: item.sessionId, count: 0, tools: {}, latest: null });
      const s = g.sessions.get(sk);
      s.count += 1;
      s.tools[item.tool] = (s.tools[item.tool] || 0) + 1;
      if (!s.latest || (item.ts || 0) > (s.latest.ts || 0)) s.latest = { ts: item.ts, tool: item.tool, summary: item.summary };
    }
    const groups = [...byDir.values()]
      .map((g) => ({ ...g, sessions: [...g.sessions.values()].sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.count - a.count);
    return { since, total: recent.length, dirCount: groups.length, groups };
  }
}
