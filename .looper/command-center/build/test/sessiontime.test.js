import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionTimes, elapsedSince } from '../src/shared/sessiontime.js';

const NOW = Date.parse('2026-06-29T12:00:00.000Z');
const at = (agoMs) => NOW - agoMs;

test('sessionTimes takes the min/max timestamp, not the first/last array element', () => {
  // Records deliberately out of timestamp order: the final array element is OLDER than
  // the head (the shape the generator produces for idle/done — a terminal status-fixing
  // record stamped staler than the conversation body).
  const records = [
    { ts: at(6 * 60 * 1000) }, // head, 6m ago
    { ts: at(3 * 60 * 1000) }, // body, 3m ago (the newest activity)
    { ts: at(50 * 60 * 1000) }, // terminal, 50m ago (oldest, but last in file order)
  ];
  const t = sessionTimes(records);
  assert.equal(t.firstTs, at(50 * 60 * 1000), 'firstTs is the earliest timestamp (min)');
  assert.equal(t.lastTs, at(3 * 60 * 1000), 'lastTs is the latest timestamp (max)');
  assert.equal(t.terminalTs, at(50 * 60 * 1000), 'terminalTs is the final record in file order');
});

test('session age is never negative when the terminal record predates the head', () => {
  const records = [
    { ts: at(6 * 60 * 1000) },
    { ts: at(3 * 60 * 1000) },
    { ts: at(50 * 60 * 1000) },
  ];
  const { firstTs } = sessionTimes(records);
  const age = elapsedSince(firstTs, NOW);
  assert.ok(age >= 0, `age must be >= 0, got ${age}`);
  assert.equal(age, 50 * 60 * 1000, 'age = now - earliest record');
});

test('elapsedSince clamps a future-stamped record to 0 rather than going negative', () => {
  assert.equal(elapsedSince(NOW + 5000, NOW), 0);
  assert.equal(elapsedSince(at(1000), NOW), 1000);
});

test('sessionTimes ignores records without a timestamp', () => {
  const records = [{ ts: null }, { ts: at(2000) }, {}, { ts: at(9000) }];
  const t = sessionTimes(records);
  assert.equal(t.firstTs, at(9000));
  assert.equal(t.lastTs, at(2000));
});

test('sessionTimes returns nulls for an empty / all-untimed record set', () => {
  assert.deepEqual(sessionTimes([]), { firstTs: null, lastTs: null, terminalTs: null });
  assert.deepEqual(sessionTimes([{ ts: null }]), { firstTs: null, lastTs: null, terminalTs: null });
  assert.equal(elapsedSince(null, NOW), null);
});
