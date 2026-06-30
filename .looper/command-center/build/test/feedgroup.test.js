import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFeedRows, MIN_BURST } from '../src/shared/feedgroup.js';

const item = (sessionKey, ts, tool = 'Bash') => ({ id: `${sessionKey}:${ts}`, sessionKey, ts, tool });

test('a run of >= MIN_BURST close same-session items collapses into one burst', () => {
  const items = [];
  for (let i = 0; i < MIN_BURST; i++) items.push(item('s1', 1000 + i * 1000));
  const rows = groupFeedRows(items, { window: 45000 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'burst');
  assert.equal(rows[0].items.length, MIN_BURST);
  assert.equal(rows[0].sessionKey, 's1');
});

test('a run shorter than MIN_BURST stays as first-class items', () => {
  const items = [item('s1', 1000), item('s1', 2000), item('s1', 3000)]; // 3 < MIN_BURST(4)
  const rows = groupFeedRows(items, { window: 45000 });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.type === 'item'));
});

test('interleaved sessions never merge (cross-source feed stays intact)', () => {
  const items = [item('s1', 1000), item('s2', 1100), item('s1', 1200), item('s2', 1300)];
  const rows = groupFeedRows(items, { window: 45000 });
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.type === 'item'));
});

test('a time gap larger than the window breaks a same-session run', () => {
  const items = [item('s1', 1000), item('s1', 2000), item('s1', 3000), item('s1', 999000)];
  const rows = groupFeedRows(items, { window: 45000 });
  // first three are within window but < MIN_BURST, the fourth is far away: all stay items
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.type === 'item'));
});

test('collapse:false returns every item ungrouped', () => {
  const items = [item('s1', 1000), item('s1', 2000), item('s1', 3000), item('s1', 4000), item('s1', 5000)];
  const rows = groupFeedRows(items, { collapse: false });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.type === 'item'));
});

test('a burst followed by a different session keeps both', () => {
  const items = [
    item('s1', 1000), item('s1', 2000), item('s1', 3000), item('s1', 4000), // burst
    item('s2', 5000), // single
  ];
  const rows = groupFeedRows(items, { window: 45000 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'burst');
  assert.equal(rows[1].type, 'item');
  assert.equal(rows[1].item.sessionKey, 's2');
});
