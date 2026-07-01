// Claude Code stores one project directory per cwd, encoding the cwd by replacing
// "/" with "-" (e.g. /home/user/work => -home-null-work). The encoding is lossy
// (real "-" in a path is indistinguishable from a separator), which is exactly why
// the record's `cwd` field is authoritative and decodeDirName is fallback-only.

export function encodeCwd(cwd) {
  return String(cwd).replace(/\//g, '-');
}

// Best-effort decode of an on-disk project dir name back to a path. Lossy: only used
// when a session has no parseable cwd in any record.
export function decodeDirName(dirName) {
  const s = String(dirName);
  if (s === '') return '';
  // Leading "-" marks an absolute path root.
  return s.replace(/-/g, '/');
}

// Human label for a cwd: the trailing path segment, with the full path kept for hover.
export function labelForCwd(cwd) {
  const s = String(cwd || '').replace(/\/+$/, '');
  if (s === '' || s === '/') return s || '/';
  const idx = s.lastIndexOf('/');
  return idx >= 0 ? s.slice(idx + 1) : s;
}
