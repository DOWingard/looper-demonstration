// Durable, provenance-tagged audit trail (o6). Notable actions — pins from the feed,
// dispatches, memory writes, manual notes — are appended as JSONL to CC_MEMORY_DIR so
// the trail survives reload and is reconstructable. Each entry carries its source
// session/dir provenance. Writes are serialized through one queue (no torn lines).

import fs from 'node:fs';
import path from 'node:path';

const AUDIT_FILE = '_audit.jsonl';

export class AuditLog {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, AUDIT_FILE);
    this._chain = Promise.resolve();
    this._ready = null;
  }

  _ensureDir() {
    if (!this._ready) this._ready = fs.promises.mkdir(this.dir, { recursive: true });
    return this._ready;
  }

  // Append one provenance-tagged entry. kind: pin | dispatch | memory-write | note.
  async record(entry) {
    await this._ensureDir();
    const full = {
      ts: entry.ts || Date.now(),
      kind: entry.kind || 'note',
      summary: entry.summary || '',
      tool: entry.tool || null,
      sourceSessionKey: entry.sourceSessionKey || null,
      sourceSessionId: entry.sourceSessionId || null,
      cwd: entry.cwd || null,
      dirLabel: entry.dirLabel || null,
      scope: entry.scope || null,
      actor: entry.actor || 'operator',
    };
    const line = JSON.stringify(full) + '\n';
    this._chain = this._chain.then(() => fs.promises.appendFile(this.file, line, 'utf8'));
    await this._chain;
    return full;
  }

  // Reconstruct the trail from disk (newest first).
  async list({ limit = 500 } = {}) {
    let text = '';
    try {
      text = await fs.promises.readFile(this.file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* skip a torn/legacy line rather than crash the trail */
      }
    }
    out.reverse();
    return out.slice(0, limit);
  }
}
