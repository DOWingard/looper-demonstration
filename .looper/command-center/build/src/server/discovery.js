// Session discovery. Scans CC_PROJECTS_DIR for project dirs and their .jsonl session
// files, tails the most-recently-modified ones, and parses them into session records.
// Bounded by design: only the freshest MAX_INITIAL_SESSIONS files are tailed at
// startup (never the whole 3749-file tree), so initial load does not scale with
// history. New/older files surface lazily via the watcher and on-demand session load.

import fs from 'node:fs';
import path from 'node:path';
import { tailFile } from './tail.js';
import { parseLines } from '../shared/parser.js';
import { LIMITS } from '../shared/constants.js';

const MAX_INITIAL_SESSIONS = 160;

async function listJsonlFiles(projectsDir) {
  const out = [];
  let dirents;
  try {
    dirents = await fs.promises.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return out; // missing/empty projects dir => empty fleet (a designed edge state)
  }
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const projDir = path.join(projectsDir, d.name);
    // Top-level session files, plus one level of subfolders (e.g. subagents/).
    await collectInto(out, projDir, d.name, 0);
  }
  return out;
}

async function collectInto(out, dir, projectDirName, depth) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.jsonl')) {
      out.push({ filePath: full, projectDirName, sessionId: e.name.replace(/\.jsonl$/, '') });
    } else if (e.isDirectory() && depth < 1) {
      await collectInto(out, full, projectDirName, depth + 1);
    }
  }
}

// Parse one tailed transcript into a session object.
export async function loadSession(file, tailBytes = LIMITS.TAIL_BYTES) {
  let stat;
  try {
    stat = await fs.promises.stat(file.filePath);
  } catch {
    return null;
  }
  const { text, size } = await tailFile(file.filePath, tailBytes);
  const { records, malformed } = parseLines(text);
  const cwd = findCwd(records);
  const branch = findLast(records, (r) => r.gitBranch)?.gitBranch || null;
  return {
    key: file.filePath,
    filePath: file.filePath,
    sessionId: file.sessionId,
    dirName: file.projectDirName,
    cwd,
    branch,
    records,
    malformed,
    fileSize: size,
    mtimeMs: stat.mtimeMs,
    kind: 'transcript',
  };
}

function findCwd(records) {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].cwd) return records[i].cwd;
  }
  return null;
}

function findLast(records, pred) {
  for (let i = records.length - 1; i >= 0; i--) if (pred(records[i])) return records[i];
  return null;
}

export async function discover(projectsDir, tailBytes = LIMITS.TAIL_BYTES) {
  const files = await listJsonlFiles(projectsDir);
  // Stat for mtime so we tail the freshest files first and bound the initial set.
  const withStat = [];
  for (const f of files) {
    try {
      const s = await fs.promises.stat(f.filePath);
      withStat.push({ ...f, mtimeMs: s.mtimeMs });
    } catch {
      /* file vanished between readdir and stat — skip */
    }
  }
  withStat.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const initial = withStat.slice(0, MAX_INITIAL_SESSIONS);
  const deferred = withStat.slice(MAX_INITIAL_SESSIONS);
  const sessions = [];
  for (const f of initial) {
    const s = await loadSession(f, tailBytes);
    if (s) sessions.push(s);
  }
  return { sessions, deferred, totalFiles: withStat.length };
}
