import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSIST_FIELDS, pickPersisted, mergePersisted } from '../src/shared/persist.js';

// Workspace persistence (c3): exactly the whitelisted workspace fields are saved, and
// merging a persisted blob over the defaults restores them without leaking ephemeral or
// unknown keys. Pure so the persistence contract is verifiable in isolation.

const fullState = {
  selectedKey: 'k1',
  selectedCwd: '/home/null/fixtures/webapp',
  centerMode: 'terminal',
  rightTab: 'memory',
  memoryScope: 'global',
  filter: { dir: '/x', session: null, type: 'Bash', text: 'npm' },
  panels: { leftW: 301, rightW: 380, centerSplit: 0.5 },
  attachIntentKey: 'k1',
  feedCollapse: false,
  // ephemeral fields that must NOT be persisted:
  connection: 'open',
  feed: [1, 2, 3],
  paletteOpen: true,
  toast: { msg: 'hi' },
};

test('pickPersisted captures every workspace field and nothing else', () => {
  const out = pickPersisted(fullState);
  assert.deepEqual(Object.keys(out).sort(), [...PERSIST_FIELDS].sort());
  assert.equal(out.connection, undefined, 'ephemeral connection is not persisted');
  assert.equal(out.feed, undefined, 'the feed array is not persisted');
  assert.equal(out.paletteOpen, undefined, 'overlay state is not persisted');
});

test('pick then merge round-trips the workspace exactly', () => {
  const saved = pickPersisted(fullState);
  const defaults = {
    selectedKey: null, selectedCwd: null, centerMode: 'feed', rightTab: 'changes',
    memoryScope: 'dir', filter: { dir: null, session: null, type: null, text: '' },
    panels: { leftW: 290, rightW: 360, centerSplit: 0.46 }, attachIntentKey: null, feedCollapse: true,
  };
  const restored = mergePersisted(defaults, saved);
  for (const f of PERSIST_FIELDS) assert.deepEqual(restored[f], fullState[f], `${f} restored`);
});

test('mergePersisted falls back to defaults for missing fields and ignores unknown keys', () => {
  const defaults = { centerMode: 'feed', feedCollapse: true, selectedKey: null };
  const restored = mergePersisted(defaults, { centerMode: 'diff', bogus: 'nope' }, ['centerMode', 'feedCollapse', 'selectedKey']);
  assert.equal(restored.centerMode, 'diff', 'present field overrides the default');
  assert.equal(restored.feedCollapse, true, 'missing field keeps the default');
  assert.equal(restored.selectedKey, null, 'missing field keeps the default');
  assert.equal(restored.bogus, undefined, 'unknown persisted key is dropped');
});

test('mergePersisted tolerates a null/garbage blob by returning the defaults', () => {
  const defaults = { centerMode: 'feed' };
  assert.deepEqual(mergePersisted(defaults, null), defaults);
  assert.deepEqual(mergePersisted(defaults, 'not an object'), defaults);
});
