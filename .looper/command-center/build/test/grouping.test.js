import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSessions, resolveSessionCwd } from '../src/shared/grouping.js';
import { STATUS } from '../src/shared/constants.js';

test('groups sessions by their cwd', () => {
  const groups = groupSessions([
    { key: 's1', cwd: '/home/null/fixtures/webapp', status: STATUS.WORKING },
    { key: 's2', cwd: '/home/null/fixtures/webapp', status: STATUS.IDLE },
    { key: 's3', cwd: '/home/null/fixtures/api', status: STATUS.DONE },
  ]);
  assert.equal(groups.length, 2);
  const web = groups.find((g) => g.cwd === '/home/null/fixtures/webapp');
  assert.equal(web.sessionCount, 2);
  assert.equal(web.label, 'webapp');
});

test('cwd-vs-dirname conflict: grouping follows the record cwd, not the decoded dir name', () => {
  // The on-disk directory name decodes to path A, but the records carry cwd = path B.
  const session = {
    key: 'conflict',
    dirName: '-home-null-fixtures-decoyAlpha',
    cwd: '/home/null/fixtures/realBeta',
    status: STATUS.WORKING,
  };
  assert.equal(resolveSessionCwd(session), '/home/null/fixtures/realBeta');
  const groups = groupSessions([session]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].cwd, '/home/null/fixtures/realBeta');
  assert.notEqual(groups[0].cwd, '/home/null/fixtures/decoyAlpha');
});

test('falls back to decoding the dir name only when no cwd is present', () => {
  const session = { key: 'nocwd', dirName: '-home-null-fixtures-orphan', cwd: null, status: STATUS.IDLE };
  assert.equal(resolveSessionCwd(session), '/home/null/fixtures/orphan');
});

test('group aggregate status is the most urgent member status', () => {
  const groups = groupSessions([
    { key: 's1', cwd: '/d', status: STATUS.DONE },
    { key: 's2', cwd: '/d', status: STATUS.WAITING },
    { key: 's3', cwd: '/d', status: STATUS.WORKING },
  ]);
  assert.equal(groups[0].status, STATUS.WAITING);
  assert.equal(groups[0].counts[STATUS.WORKING], 1);
});

test('lanes sort so directories needing the operator come first', () => {
  const groups = groupSessions([
    { key: 'a', cwd: '/calm', status: STATUS.DONE },
    { key: 'b', cwd: '/busy', status: STATUS.WAITING },
  ]);
  assert.equal(groups[0].cwd, '/busy');
});
