import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFileChanges, countLines } from '../src/shared/filechanges.js';
import { normalizeRecord } from '../src/shared/parser.js';

function asstBlocks(blocks) {
  return normalizeRecord({ type: 'assistant', message: { role: 'assistant', content: blocks } });
}

test('countLines normalizes a trailing newline', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('one'), 1);
  assert.equal(countLines('a\nb\nc'), 3);
  assert.equal(countLines('a\nb\n'), 2);
});

test('Write of an N-line new file => +N / -0', () => {
  const rec = asstBlocks([{ type: 'tool_use', name: 'Write', input: { file_path: '/p/new.js', content: 'l1\nl2\nl3\nl4\nl5' } }]);
  const { files, totals } = computeFileChanges([rec]);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, '/p/new.js');
  assert.equal(files[0].additions, 5);
  assert.equal(files[0].deletions, 0);
  assert.deepEqual(totals, { additions: 5, deletions: 0, files: 1 });
});

test('Edit replacing one line => +1 / -1', () => {
  const rec = asstBlocks([{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/a.js', old_string: 'const x = 1;', new_string: 'const x = 2;' } }]);
  const { files } = computeFileChanges([rec]);
  assert.equal(files[0].additions, 1);
  assert.equal(files[0].deletions, 1);
});

test('Edit replacing one line with three => +3 / -1', () => {
  const rec = asstBlocks([{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/a.js', old_string: 'x', new_string: 'a\nb\nc' } }]);
  const { files } = computeFileChanges([rec]);
  assert.equal(files[0].additions, 3);
  assert.equal(files[0].deletions, 1);
});

test('repeated edits to the same path aggregate by path', () => {
  const recs = [
    asstBlocks([{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/a.js', old_string: 'x', new_string: 'y' } }]),
    asstBlocks([{ type: 'tool_use', name: 'Write', input: { file_path: '/p/a.js', content: 'one\ntwo' } }]),
  ];
  const { files, totals } = computeFileChanges(recs);
  assert.equal(files.length, 1);
  assert.equal(files[0].additions, 3); // 1 (edit new) + 2 (write)
  assert.equal(files[0].deletions, 1);
  assert.equal(files[0].edits, 2);
  assert.equal(totals.files, 1);
});

test('MultiEdit sums every sub-edit on the file', () => {
  const rec = asstBlocks([
    { type: 'tool_use', name: 'MultiEdit', input: { file_path: '/p/m.js', edits: [
      { old_string: 'a', new_string: 'a2' },
      { old_string: 'b\nb', new_string: 'b2' },
    ] } },
  ]);
  const { files } = computeFileChanges([rec]);
  assert.equal(files[0].additions, 2); // 1 + 1
  assert.equal(files[0].deletions, 3); // 1 + 2
});

test('non-edit tools (Bash/Read) contribute no file changes', () => {
  const rec = asstBlocks([
    { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
    { type: 'tool_use', name: 'Read', input: { file_path: '/p/x' } },
  ]);
  const { files, totals } = computeFileChanges([rec]);
  assert.equal(files.length, 0);
  assert.equal(totals.files, 0);
});
