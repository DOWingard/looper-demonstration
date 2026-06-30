import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annotateDigest } from '../src/shared/digestneeds.js';

// The away-digest answers not just "what happened" but "what now needs you" (o5): each
// session in the grouped digest is cross-referenced with its CURRENT live status, and the
// sessions now waiting for the operator are surfaced as a flat, jump-ready list.

const digest = {
  total: 6,
  groups: [
    {
      cwd: '/home/null/fixtures/webapp', label: 'webapp', count: 4,
      sessions: [
        { sessionKey: 'a', sessionId: 'sess-a', count: 3, tools: { Bash: 2, Edit: 1 }, latest: { summary: 'npm test' } },
        { sessionKey: 'b', sessionId: 'sess-b', count: 1, tools: { Read: 1 }, latest: { summary: 'read x' } },
      ],
    },
    {
      cwd: '/home/null/fixtures/api', label: 'api', count: 2,
      sessions: [
        { sessionKey: 'c', sessionId: 'sess-c', count: 2, tools: { Grep: 2 }, latest: { summary: 'grep TODO' } },
      ],
    },
  ],
};

const statusByKey = { a: 'waiting', b: 'working', c: 'waiting' };

test('each session is annotated with its current live status', () => {
  const out = annotateDigest(digest, statusByKey);
  assert.equal(out.groups[0].sessions[0].status, 'waiting');
  assert.equal(out.groups[0].sessions[1].status, 'working');
  assert.equal(out.groups[1].sessions[0].status, 'waiting');
});

test('waiting sessions are surfaced as a flat needs-you list with dir provenance', () => {
  const out = annotateDigest(digest, statusByKey);
  assert.equal(out.needsYouCount, 2);
  const keys = out.needsYou.map((s) => s.sessionKey).sort();
  assert.deepEqual(keys, ['a', 'c']);
  // each needs-you entry carries the directory it belongs to so the operator can jump
  assert.equal(out.needsYou.find((s) => s.sessionKey === 'a').cwd, '/home/null/fixtures/webapp');
  assert.equal(out.needsYou.find((s) => s.sessionKey === 'c').label, 'api');
});

test('per-group waiting counts are computed', () => {
  const out = annotateDigest(digest, statusByKey);
  assert.equal(out.groups[0].waiting, 1);
  assert.equal(out.groups[1].waiting, 1);
});

test('a session with no known status is null and never appears in needs-you', () => {
  const out = annotateDigest(digest, { a: 'done' });
  assert.equal(out.groups[0].sessions[1].status, null);
  assert.equal(out.needsYouCount, 0);
});

test('an empty digest annotates to an empty needs-you list (no throw)', () => {
  const out = annotateDigest({ total: 0, groups: [] }, {});
  assert.deepEqual(out.needsYou, []);
  assert.equal(out.needsYouCount, 0);
});
