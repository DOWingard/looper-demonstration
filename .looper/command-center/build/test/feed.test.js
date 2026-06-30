import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeed, summarizeTool, feedItemsForSession } from '../src/shared/feed.js';
import { normalizeRecord } from '../src/shared/parser.js';

function toolRec(over, block) {
  return normalizeRecord({ type: 'assistant', uuid: over.uuid, timestamp: over.timestamp, cwd: over.cwd, sessionId: over.sessionId, isSidechain: over.isSidechain, agentId: over.agentId, message: { role: 'assistant', content: [block] } });
}

const sessionA = {
  key: 'A',
  cwd: '/home/null/fixtures/webapp',
  sessionId: 'sa',
  records: [
    toolRec({ uuid: 'a1', timestamp: '2026-06-29T12:00:01.000Z', cwd: '/home/null/fixtures/webapp', sessionId: 'sa' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }),
    toolRec({ uuid: 'a2', timestamp: '2026-06-29T12:00:03.000Z', cwd: '/home/null/fixtures/webapp', sessionId: 'sa' }, { type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.js' } }),
  ],
};

const sessionB = {
  key: 'B',
  cwd: '/home/null/fixtures/api',
  sessionId: 'sb',
  records: [
    toolRec({ uuid: 'b1', timestamp: '2026-06-29T12:00:02.000Z', cwd: '/home/null/fixtures/api', sessionId: 'sb', isSidechain: true, agentId: 'agent-7' }, { type: 'tool_use', name: 'Read', input: { file_path: '/server/index.js' } }),
  ],
};

test('summarizeTool produces a legible one-liner per tool type', () => {
  assert.equal(summarizeTool('Bash', { command: 'npm run build' }), 'npm run build');
  assert.equal(summarizeTool('Edit', { file_path: '/a/b.js' }), '/a/b.js');
  assert.equal(summarizeTool('Task', { description: 'investigate bug' }), 'investigate bug');
  assert.equal(summarizeTool('Grep', { pattern: 'TODO' }), '/TODO/');
});

test('feedItemsForSession emits one item per tool_use, tagged with source + sidechain', () => {
  const items = feedItemsForSession(sessionB);
  assert.equal(items.length, 1);
  assert.equal(items[0].sessionKey, 'B');
  assert.equal(items[0].tool, 'Read');
  assert.equal(items[0].isSidechain, true);
  assert.equal(items[0].agentId, 'agent-7');
  assert.equal(items[0].dirLabel, 'api');
});

test('buildFeed merges actions across sessions in strict timestamp order', () => {
  const feed = buildFeed([sessionA, sessionB]);
  assert.equal(feed.length, 3);
  // a1 @ :01, b1 @ :02, a2 @ :03  => interleaved across sources by time
  assert.deepEqual(feed.map((i) => i.id.split(':')[0]), ['A', 'B', 'A']);
  assert.deepEqual(feed.map((i) => i.tool), ['Bash', 'Read', 'Edit']);
  // strictly non-decreasing timestamps
  for (let i = 1; i < feed.length; i++) assert.ok(feed[i].ts >= feed[i - 1].ts);
});

test('buildFeed distinguishes main-thread from subagent actions', () => {
  const feed = buildFeed([sessionA, sessionB]);
  const sub = feed.filter((i) => i.isSidechain);
  const main = feed.filter((i) => !i.isSidechain);
  assert.equal(sub.length, 1);
  assert.equal(main.length, 2);
});
