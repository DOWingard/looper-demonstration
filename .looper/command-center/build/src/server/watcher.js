// Live transcript watcher. Watches CC_PROJECTS_DIR and, on an append, reads ONLY the
// bytes after the last-seen offset and feeds that delta to the model — never a full
// re-read of the file or the tree. New session files are loaded on 'add'. Per-file
// coalescing keeps rapid appends to one delta read while staying ~real-time.

import chokidar from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { readRange } from './tail.js';
import { loadSession } from './discovery.js';

const COALESCE_MS = 35;

export class FleetWatcher {
  constructor({ projectsDir, model }) {
    this.projectsDir = projectsDir;
    this.model = model;
    this.offsets = new Map(); // filePath -> bytes parsed so far
    this.timers = new Map();
    this.watcher = null;
  }

  // Seed offsets from the sessions discovered at startup so the first append is a delta,
  // not a re-parse of what we already tailed.
  seed(sessions) {
    for (const s of sessions) this.offsets.set(s.filePath, s.fileSize || 0);
  }

  start() {
    this.watcher = chokidar.watch(this.projectsDir, {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: false,
      ignorePermissionErrors: true,
    });
    this.watcher.on('add', (fp) => this._onAdd(fp));
    this.watcher.on('change', (fp) => this._schedule(fp));
    this.watcher.on('error', () => {});
    return this;
  }

  _isJsonl(fp) {
    return fp.endsWith('.jsonl');
  }

  _descriptor(fp) {
    const rel = path.relative(this.projectsDir, fp);
    const projectDirName = rel.split(path.sep)[0];
    return { filePath: fp, projectDirName, sessionId: path.basename(fp, '.jsonl') };
  }

  async _onAdd(fp) {
    if (!this._isJsonl(fp) || this.model.getSession(fp)) return;
    const session = await loadSession(this._descriptor(fp));
    if (!session) return;
    this.offsets.set(fp, session.fileSize || 0);
    this.model.addSession(session);
  }

  _schedule(fp) {
    if (!this._isJsonl(fp)) return;
    if (this.timers.has(fp)) return;
    const t = setTimeout(() => {
      this.timers.delete(fp);
      this._readDelta(fp);
    }, COALESCE_MS);
    this.timers.set(fp, t);
  }

  async _readDelta(fp) {
    let size;
    try {
      size = (await fs.promises.stat(fp)).size;
    } catch {
      return;
    }
    let from = this.offsets.get(fp);
    if (from == null) {
      // A file we never tailed (beyond the initial cap) just changed — treat as new.
      await this._onAdd(fp);
      return;
    }
    if (size < from) {
      // Truncation/rotation: reset and reload from scratch.
      from = 0;
      this.offsets.set(fp, 0);
    }
    if (size <= from) return;
    const text = await readRange(fp, from, size);
    this.offsets.set(fp, size);
    if (this.model.getSession(fp)) {
      this.model.applyDelta(fp, text);
    } else {
      await this._onAdd(fp);
    }
  }

  async close() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.watcher) await this.watcher.close();
  }
}
