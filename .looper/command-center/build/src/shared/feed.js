// Build feed items from transcript records. A "major action" is a tool_use block.
// The unified cross-session feed is the chronological merge of these across every
// session and directory — the capability no reference has. Pure.

import { labelForCwd } from './pathenc.js';

// One-line, human-legible summary of a tool call from its name + input.
export function summarizeTool(name, input = {}) {
  switch (name) {
    case 'Bash':
      return input.command ? String(input.command) : '(command)';
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return input.file_path ? String(input.file_path) : '(file)';
    case 'NotebookEdit':
      return input.notebook_path ? String(input.notebook_path) : '(notebook)';
    case 'Read':
      return input.file_path ? String(input.file_path) : '(file)';
    case 'Glob':
      return input.pattern ? String(input.pattern) : '(pattern)';
    case 'Grep':
      return input.pattern ? `/${input.pattern}/` : '(pattern)';
    case 'Task':
      return String(input.description || input.subagent_type || 'subagent task');
    case 'WebFetch':
      return input.url ? String(input.url) : '(url)';
    case 'WebSearch':
      return input.query ? String(input.query) : '(query)';
    default: {
      const keys = Object.keys(input);
      return keys.length ? `${keys[0]}=${String(input[keys[0]]).slice(0, 60)}` : name;
    }
  }
}

// Turn one session's records into feed items (one per tool_use block).
export function feedItemsForSession(session) {
  const items = [];
  for (const rec of session.records || []) {
    for (const block of rec.blocks || []) {
      if (block.kind !== 'tool_use') continue;
      items.push({
        id: `${session.key}:${rec.uuid || rec.ts}:${block.id || items.length}`,
        ts: rec.ts,
        timestamp: rec.timestamp,
        sessionKey: session.key,
        sessionId: rec.sessionId || session.sessionId,
        cwd: rec.cwd || session.cwd,
        dirLabel: labelForCwd(rec.cwd || session.cwd),
        isSidechain: !!rec.isSidechain,
        agentId: rec.agentId || null,
        tool: block.name,
        summary: summarizeTool(block.name, block.input),
      });
    }
  }
  return items;
}

// Stable chronological sort across sources: by timestamp, then a stable tiebreak so
// two actions sharing a timestamp from different sessions keep a deterministic order.
export function sortFeed(items) {
  return [...items].sort((a, b) => {
    const at = a.ts ?? 0;
    const bt = b.ts ?? 0;
    if (at !== bt) return at - bt;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
}

// Merge feed items from many sessions into one chronological fleet feed.
export function buildFeed(sessions) {
  const all = [];
  for (const s of sessions || []) all.push(...feedItemsForSession(s));
  return sortFeed(all);
}
