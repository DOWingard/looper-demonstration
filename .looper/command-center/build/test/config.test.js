import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, REQUIRED_VARS } from '../src/server/config.js';

test('a missing required var is reported by name and produces an error', () => {
  const { errors } = parseConfig({ CC_PROJECTS_DIR: '/tmp/x' });
  assert.ok(errors.includes('CC_MEMORY_DIR'));
  assert.ok(REQUIRED_VARS.includes('CC_MEMORY_DIR'));
});

test('with the required var set there are no errors and defaults fill in', () => {
  const { config, errors } = parseConfig({ CC_MEMORY_DIR: '/tmp/mem' });
  assert.equal(errors.length, 0);
  assert.equal(config.memoryDir, '/tmp/mem');
  assert.match(config.projectsDir, /\.claude\/projects$/);
  assert.equal(config.sessionCmd, 'claude');
  assert.equal(config.port, 4178);
});

test('an out-of-range port is an error', () => {
  const { errors } = parseConfig({ CC_MEMORY_DIR: '/tmp/mem', CC_PORT: '999999' });
  assert.ok(errors.some((e) => e.startsWith('CC_PORT')));
});

test('CC_PORT overrides the default port', () => {
  const { config } = parseConfig({ CC_MEMORY_DIR: '/tmp/mem', CC_PORT: '5000' });
  assert.equal(config.port, 5000);
});
