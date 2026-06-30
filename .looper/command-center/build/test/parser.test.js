import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseLines, normalizeRecord, kindOf } from '../src/shared/parser.js';

function assistantToolUse(over = {}) {
  return {
    type: 'assistant',
    uuid: 'a1',
    timestamp: '2026-06-29T12:00:00.000Z',
    cwd: '/home/null/fixtures/webapp',
    sessionId: 's1',
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: '/x.js' } }] },
    ...over,
  };
}

test('parseLine parses a valid assistant tool_use record', () => {
  const r = parseLine(JSON.stringify(assistantToolUse()));
  assert.equal(r.ok, true);
  assert.equal(r.record.type, 'assistant');
  assert.equal(r.record.blocks[0].kind, 'tool_use');
  assert.equal(r.record.blocks[0].name, 'Edit');
  assert.equal(kindOf(r.record), 'tool_use');
});

test('parseLine flags a malformed line without throwing', () => {
  const r = parseLine('{ this is not json ');
  assert.equal(r.ok, false);
  assert.equal(r.malformed, true);
});

test('parseLine treats a JSON array (non-object) as malformed', () => {
  const r = parseLine('[1,2,3]');
  assert.equal(r.ok, false);
  assert.equal(r.malformed, true);
});

test('parseLine treats a blank line as empty, not malformed', () => {
  const r = parseLine('   ');
  assert.equal(r.ok, false);
  assert.equal(r.empty, true);
  assert.notEqual(r.malformed, true);
});

test('parseLines survives a malformed line mid-buffer: valid records around it still parse', () => {
  const text =
    JSON.stringify(assistantToolUse({ uuid: 'a1' })) +
    '\n' +
    'THIS IS A CORRUPT LINE {' +
    '\n' +
    JSON.stringify(assistantToolUse({ uuid: 'a2' })) +
    '\n';
  const { records, malformed } = parseLines(text);
  assert.equal(records.length, 2);
  assert.equal(malformed, 1);
  assert.equal(records[0].uuid, 'a1');
  assert.equal(records[1].uuid, 'a2');
});

test('parseLines returns a trailing newline-less line as partial, not malformed', () => {
  const text = JSON.stringify(assistantToolUse()) + '\n' + '{"type":"assistant","uuid":"hal';
  const { records, malformed, partial } = parseLines(text);
  assert.equal(records.length, 1);
  assert.equal(malformed, 0);
  assert.equal(partial, '{"type":"assistant","uuid":"hal');
});

test('parseLines on empty input yields no records and no malformed', () => {
  const { records, malformed, partial } = parseLines('');
  assert.equal(records.length, 0);
  assert.equal(malformed, 0);
  assert.equal(partial, '');
});

test('normalizeRecord normalizes a string user message into a single text block', () => {
  const rec = normalizeRecord({ type: 'user', uuid: 'u1', timestamp: '2026-06-29T12:00:00.000Z', message: { role: 'user', content: 'hello there' } });
  assert.equal(rec.blocks.length, 1);
  assert.equal(rec.blocks[0].kind, 'text');
  assert.equal(rec.blocks[0].text, 'hello there');
  assert.equal(kindOf(rec), 'user');
});

test('normalizeRecord reads thinking text from the `thinking` key', () => {
  const rec = normalizeRecord({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'deep thought' }] } });
  assert.equal(rec.blocks[0].kind, 'thinking');
  assert.equal(rec.blocks[0].text, 'deep thought');
  assert.equal(kindOf(rec), 'assistant_text');
});

test('kindOf classifies a user record carrying a toolUseResult as tool_result', () => {
  const rec = normalizeRecord({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] }, toolUseResult: { stdout: 'ok' } });
  assert.equal(kindOf(rec), 'tool_result');
});

test('parses timestamp into a numeric ts', () => {
  const rec = normalizeRecord(assistantToolUse());
  assert.equal(rec.ts, Date.parse('2026-06-29T12:00:00.000Z'));
});
