// Concurrent-write-safe shared markdown memory. One file per project directory plus
// one global file, all plain markdown on disk under CC_MEMORY_DIR.
//
// Concurrency model: a per-key promise chain (single-writer queue). Node is
// single-threaded, so serializing every mutation of a given file through one chain
// guarantees no interleaved/torn lines and no lost writes under K concurrent writers
// — without an OS lock. The method set (read / append / replace / list) is the small,
// swappable interface: an MCP-backed store can implement the same shape later.

import fs from 'node:fs';
import path from 'node:path';
import { encodeCwd, decodeDirName } from '../shared/pathenc.js';

const GLOBAL_FILE = '_global.md';

export class MarkdownMemoryStore {
  constructor(dir) {
    this.dir = dir;
    this._chains = new Map(); // key -> tail promise (the write queue)
    this._ready = null;
  }

  async _ensureDir() {
    if (!this._ready) this._ready = fs.promises.mkdir(this.dir, { recursive: true });
    return this._ready;
  }

  // Map a logical key to an on-disk filename. 'global' -> _global.md; any other key is
  // treated as a cwd and encoded the way Claude Code encodes project dirs (reversible).
  fileFor(key) {
    if (key === 'global' || key == null) return path.join(this.dir, GLOBAL_FILE);
    return path.join(this.dir, `${encodeCwd(key)}.md`);
  }

  // Serialize an operation on `key` behind that key's write queue.
  _run(key, fn) {
    const prev = this._chains.get(key) || Promise.resolve();
    // Run fn only after the previous op settles (success or failure), so a failed
    // write never poisons subsequent writes but order is preserved.
    const result = prev.then(fn, fn);
    this._chains.set(key, result.then(() => {}, () => {}));
    return result;
  }

  async read(key) {
    const file = this.fileFor(key);
    try {
      return await fs.promises.readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return '';
      throw e;
    }
  }

  // Append a line atomically with respect to all other writers of this key.
  async append(key, line) {
    await this._ensureDir();
    const file = this.fileFor(key);
    const text = String(line).replace(/\n+$/, '') + '\n';
    return this._run(key, () => fs.promises.appendFile(file, text, 'utf8'));
  }

  // Replace the whole file atomically (write-temp-then-rename) and serialized.
  async replace(key, content) {
    await this._ensureDir();
    const file = this.fileFor(key);
    const body = String(content);
    return this._run(key, async () => {
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp, body, 'utf8');
      await fs.promises.rename(tmp, file);
    });
  }

  async list() {
    await this._ensureDir();
    let names = [];
    try {
      names = await fs.promises.readdir(this.dir);
    } catch {
      return [];
    }
    // Decode the filename stem back to its cwd so the returned key round-trips
    // through read()/fileFor() (lossless for hyphen-free paths, the realistic case).
    return names
      .filter((n) => n.endsWith('.md'))
      .map((n) => ({ file: n, key: n === GLOBAL_FILE ? 'global' : decodeDirName(n.replace(/\.md$/, '')) }));
  }
}
