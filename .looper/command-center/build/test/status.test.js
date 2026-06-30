import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferStatus, statusFromKindAge, aggregateStatus } from '../src/shared/status.js';
import { normalizeRecord } from '../src/shared/parser.js';
import { STATUS } from '../src/shared/constants.js';

const NOW = Date.parse('2026-06-29T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

function rec(over) {
  return normalizeRecord({ type: 'assistant', uuid: 'x', sessionId: 's', message: { role: 'assistant', content: [] }, ...over });
}

test('recent tool_use => working', () => {
  const r = rec({ timestamp: ago(20 * 1000), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } });
  assert.equal(inferStatus(r, NOW), STATUS.WORKING);
});

test('trailing assistant text with no newer user record => waiting-for-input', () => {
  const r = rec({ timestamp: ago(90 * 1000), message: { role: 'assistant', content: [{ type: 'text', text: 'Which option do you want?' }] } });
  assert.equal(inferStatus(r, NOW), STATUS.WAITING);
});

test('tool activity but not recent (quiet-but-recent) => idle', () => {
  const r = rec({ timestamp: ago(10 * 60 * 1000), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: {} }] } });
  assert.equal(inferStatus(r, NOW), STATUS.IDLE);
});

test('stale last record => done', () => {
  const r = rec({ timestamp: ago(50 * 60 * 1000), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } });
  assert.equal(inferStatus(r, NOW), STATUS.DONE);
});

test('a stale unanswered assistant question is done, not waiting (stale dominates)', () => {
  const r = rec({ timestamp: ago(50 * 60 * 1000), message: { role: 'assistant', content: [{ type: 'text', text: 'still there?' }] } });
  assert.equal(inferStatus(r, NOW), STATUS.DONE);
});

test('a freshly typed user message reads as working', () => {
  const r = normalizeRecord({ type: 'user', timestamp: ago(15 * 1000), message: { role: 'user', content: 'go' } });
  assert.equal(inferStatus(r, NOW), STATUS.WORKING);
});

test('statusFromKindAge respects custom windows', () => {
  assert.equal(statusFromKindAge('tool_use', 5000, { WORKING_MS: 1000, DONE_MS: 10000 }), STATUS.IDLE);
  assert.equal(statusFromKindAge('tool_use', 500, { WORKING_MS: 1000, DONE_MS: 10000 }), STATUS.WORKING);
  assert.equal(statusFromKindAge('tool_use', 20000, { WORKING_MS: 1000, DONE_MS: 10000 }), STATUS.DONE);
});

test('aggregateStatus surfaces the most urgent status in a group', () => {
  assert.equal(aggregateStatus([STATUS.DONE, STATUS.WORKING, STATUS.WAITING]), STATUS.WAITING);
  assert.equal(aggregateStatus([STATUS.DONE, STATUS.IDLE, STATUS.WORKING]), STATUS.WORKING);
  assert.equal(aggregateStatus([STATUS.DONE, STATUS.DONE]), STATUS.DONE);
  assert.equal(aggregateStatus([]), STATUS.DONE);
});
