// Derive a per-session "files changed +X / -Y" surface from Edit/Write tool_use
// blocks in the transcript. Pure. Line counts are normalized so a trailing newline
// does not inflate the count (a Write of an N-line file reads as +N).

export function countLines(s) {
  if (s == null) return 0;
  const str = String(s);
  if (str === '') return 0;
  // Drop a single trailing newline so "a\nb\n" counts as 2 lines, not 3.
  return str.replace(/\n$/, '').split('\n').length;
}

// Additions/deletions for a single Edit/Write/MultiEdit tool_use block.
// Returns a list of { path, additions, deletions } (MultiEdit fans out per edit but
// is aggregated by path by the caller).
function changesForBlock(block) {
  const name = block.name;
  const input = block.input || {};
  const out = [];
  if (name === 'Write') {
    out.push({ path: input.file_path, additions: countLines(input.content), deletions: 0 });
  } else if (name === 'Edit') {
    out.push({
      path: input.file_path,
      additions: countLines(input.new_string),
      deletions: countLines(input.old_string),
    });
  } else if (name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    for (const e of edits) {
      out.push({
        path: input.file_path,
        additions: countLines(e.new_string),
        deletions: countLines(e.old_string),
      });
    }
  } else if (name === 'NotebookEdit') {
    out.push({ path: input.notebook_path, additions: countLines(input.new_source), deletions: 0 });
  }
  return out.filter((c) => c.path);
}

const CHANGE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function computeFileChanges(records) {
  const byPath = new Map();
  for (const rec of records || []) {
    for (const block of rec.blocks || []) {
      if (block.kind !== 'tool_use' || !CHANGE_TOOLS.has(block.name)) continue;
      for (const c of changesForBlock(block)) {
        const cur = byPath.get(c.path) || { path: c.path, additions: 0, deletions: 0, edits: 0 };
        cur.additions += c.additions;
        cur.deletions += c.deletions;
        cur.edits += 1;
        byPath.set(c.path, cur);
      }
    }
  }
  const files = [...byPath.values()].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  const totals = files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 }
  );
  return { files, totals: { ...totals, files: files.length } };
}
