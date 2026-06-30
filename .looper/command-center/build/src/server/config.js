// Env-var configuration with fail-fast. Required vars have NO default; a missing one
// aborts startup non-zero with stderr naming it, BEFORE any server binds. Optional
// dirs default (projects -> ~/.claude/projects, session cmd -> interactive `claude`).

import os from 'node:os';
import path from 'node:path';

// CC_MEMORY_DIR is required-no-default: shared markdown memory is persistent and
// writable, so silently choosing a directory could clobber real notes. We force the
// operator to name it. (This is the >=1 required var the fail-fast contract needs.)
export const REQUIRED_VARS = ['CC_MEMORY_DIR'];

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Pure: turn an env map into { config, errors }. Separated from process exit so it is
// unit-testable and the fail-fast path is deterministic.
export function parseConfig(env = process.env) {
  const errors = [];
  for (const name of REQUIRED_VARS) {
    const v = env[name];
    if (v == null || String(v).trim() === '') {
      errors.push(name);
    }
  }
  const portRaw = env.CC_PORT || env.PORT || '4178';
  const port = Number.parseInt(portRaw, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`CC_PORT (got "${portRaw}", expected 1-65535)`);
  }

  const config = {
    memoryDir: expandHome(env.CC_MEMORY_DIR),
    projectsDir: expandHome(env.CC_PROJECTS_DIR) || path.join(os.homedir(), '.claude', 'projects'),
    sessionCmd: env.CC_SESSION_CMD || 'claude',
    port,
    host: env.CC_HOST || '127.0.0.1',
    // CC_NOW lets the evaluator pin "now" for deterministic status inference; defaults
    // to wall clock.
    now: env.CC_NOW ? Date.parse(env.CC_NOW) : null,
  };
  return { config, errors };
}

// Validate and return config, or print actionable stderr and exit non-zero. Called as
// the very first thing in server startup, before any port is bound.
export function loadConfig(env = process.env) {
  const { config, errors } = parseConfig(env);
  if (errors.length > 0) {
    process.stderr.write(
      '\n[command-center] FATAL: missing/invalid required configuration.\n' +
        errors.map((e) => `  - ${e} is required and has no default; set it before starting.\n`).join('') +
        '\nExample:\n' +
        '  CC_MEMORY_DIR=/path/to/memory CC_PROJECTS_DIR=/path/to/projects npm start\n\n'
    );
    process.exit(1);
  }
  return config;
}
