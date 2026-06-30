import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MarkdownMemoryStore } from '../src/server/memory-store.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-mem-'));
}

test('append then read round-trips as plain markdown', async () => {
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  await store.append('global', '# Notes');
  await store.append('global', '- first note');
  const content = await store.read('global');
  assert.match(content, /# Notes/);
  assert.match(content, /- first note/);
  // confirmed on disk as a real .md file
  assert.ok(fs.existsSync(path.join(dir, '_global.md')));
});

test('per-dir memory writes to a cwd-encoded filename', async () => {
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  await store.append('/home/null/fixtures/webapp', '- dir note');
  assert.ok(fs.existsSync(path.join(dir, '-home-null-fixtures-webapp.md')));
});

test('replace overwrites the whole file atomically', async () => {
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  await store.append('global', 'old');
  await store.replace('global', '# Fresh\n');
  assert.equal(await store.read('global'), '# Fresh\n');
});

test('K=80 concurrent appends: every token lands exactly once, no torn lines', async () => {
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  const K = 80;
  const tokens = Array.from({ length: K }, (_, i) => `TOKEN-${i}-${'x'.repeat(40)}`);
  // Fire all K appends concurrently (the K-writer probe).
  await Promise.all(tokens.map((t) => store.append('global', t)));
  const content = await store.read('global');
  const lines = content.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, K, 'exactly K non-empty lines');
  // each token present exactly once and on its own intact line
  for (const t of tokens) {
    const occurrences = lines.filter((l) => l === t).length;
    assert.equal(occurrences, 1, `token ${t} present exactly once`);
  }
  // no line contains two tokens fused (torn/interleaved write)
  for (const l of lines) {
    assert.equal((l.match(/TOKEN-/g) || []).length, 1, `line not torn: ${l}`);
  }
});

test('K=80 concurrent appends to a PER-DIR file: every token lands once, no torn lines', async () => {
  // The per-dir path must be exactly as concurrency-safe as the global path — same
  // single-writer queue, different key. This proves the f11 dir scope through the store's
  // own interface (the UI and the K-writer probe both go through these methods).
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  const cwd = '/home/null/fixtures/webapp';
  const K = 80;
  const tokens = Array.from({ length: K }, (_, i) => `DIRTOK-${i}-${'y'.repeat(40)}`);
  await Promise.all(tokens.map((t) => store.append(cwd, t)));
  const content = await store.read(cwd);
  const lines = content.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, K, 'exactly K non-empty lines in the per-dir file');
  for (const t of tokens) {
    assert.equal(lines.filter((l) => l === t).length, 1, `token ${t} present exactly once`);
  }
  for (const l of lines) {
    assert.equal((l.match(/DIRTOK-/g) || []).length, 1, `per-dir line not torn: ${l}`);
  }
  assert.ok(fs.existsSync(path.join(dir, '-home-null-fixtures-webapp.md')), 'on-disk markdown file');
});

test('global and per-dir writers are independent queues: concurrent writes to both stay intact', async () => {
  // The GLOBAL file write/read path (f11) is concurrency-safe like the per-dir store, and
  // the two keys do not contend or cross-contaminate when written simultaneously.
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  const cwd = '/home/null/fixtures/api';
  const K = 40;
  const globalTokens = Array.from({ length: K }, (_, i) => `GLB-${i}`);
  const dirTokens = Array.from({ length: K }, (_, i) => `LCL-${i}`);
  const ops = [];
  for (let i = 0; i < K; i++) {
    ops.push(store.append('global', globalTokens[i]));
    ops.push(store.append(cwd, dirTokens[i]));
  }
  await Promise.all(ops);
  const g = (await store.read('global')).split('\n').filter(Boolean);
  const d = (await store.read(cwd)).split('\n').filter(Boolean);
  assert.equal(g.length, K, 'global file has exactly its own K lines');
  assert.equal(d.length, K, 'dir file has exactly its own K lines');
  for (const t of globalTokens) assert.equal(g.filter((l) => l === t).length, 1, `global ${t} once`);
  for (const t of dirTokens) assert.equal(d.filter((l) => l === t).length, 1, `dir ${t} once`);
  // no cross-contamination between the two files
  assert.ok(!g.some((l) => l.startsWith('LCL-')), 'global file carries no dir tokens');
  assert.ok(!d.some((l) => l.startsWith('GLB-')), 'dir file carries no global tokens');
});

test('global replace serialized with concurrent appends never loses or corrupts the file', async () => {
  // The UI Save (replace) and the pin/append path can race on the global file; the queue
  // must serialize them so the file always ends valid markdown and every late append is
  // present after the replace it followed.
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  await store.append('global', '# Global');
  const ops = [store.replace('global', '# Replaced\n')];
  for (let i = 0; i < 20; i++) ops.push(store.append('global', `- after-${i}`));
  await Promise.all(ops);
  const content = await store.read('global');
  // file is intact markdown and never half-written (temp/rename is atomic + serialized)
  assert.ok(content.length > 0);
  const appended = content.split('\n').filter((l) => l.startsWith('- after-'));
  assert.equal(appended.length, 20, 'all concurrent appends survive the replace');
});

test('list reports global and per-dir keys', async () => {
  const dir = tmpDir();
  const store = new MarkdownMemoryStore(dir);
  await store.append('global', 'g');
  await store.append('/home/null/fixtures/api', 'a');
  const items = await store.list();
  const keys = items.map((i) => i.key).sort();
  assert.deepEqual(keys, ['/home/null/fixtures/api', 'global'].sort());
});
