// JSONL transcript parser, faithful to the measured Claude Code schema and tolerant
// of malformed/partial lines. Produces a normalized record model that the status,
// feed, file-change and grouping logic all consume. Pure: no I/O.

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return { kind: 'other', subtype: 'unknown' };
  switch (b.type) {
    case 'text':
      return { kind: 'text', text: String(b.text ?? '') };
    case 'thinking':
      // thinking blocks carry their text under `thinking`, not `text`.
      return { kind: 'thinking', text: String(b.thinking ?? b.text ?? '') };
    case 'tool_use':
      return { kind: 'tool_use', id: b.id ?? null, name: String(b.name ?? 'tool'), input: b.input ?? {} };
    case 'tool_result':
      return {
        kind: 'tool_result',
        toolUseId: b.tool_use_id ?? null,
        content: b.content ?? null,
        isError: !!b.is_error,
      };
    case 'image':
      return { kind: 'other', subtype: 'image' };
    default:
      return { kind: 'other', subtype: b.type || 'unknown' };
  }
}

// message.content may be a plain string (a typed user message) or an array of blocks.
function normalizeContent(message) {
  if (!message) return [];
  const content = message.content;
  if (typeof content === 'string') return content === '' ? [] : [{ kind: 'text', text: content }];
  if (Array.isArray(content)) return content.map(normalizeBlock);
  return [];
}

export function normalizeRecord(raw) {
  const ts = raw.timestamp ? Date.parse(raw.timestamp) : NaN;
  return {
    type: raw.type ?? 'other',
    uuid: raw.uuid ?? null,
    parentUuid: raw.parentUuid ?? null,
    timestamp: raw.timestamp ?? null,
    ts: Number.isNaN(ts) ? null : ts,
    cwd: raw.cwd ?? null,
    sessionId: raw.sessionId ?? null,
    isSidechain: !!raw.isSidechain,
    agentId: raw.agentId ?? null,
    isMeta: !!raw.isMeta,
    gitBranch: raw.gitBranch ?? null,
    version: raw.version ?? null,
    role: raw.message?.role ?? null,
    blocks: normalizeContent(raw.message),
    toolResult: raw.toolUseResult ?? null,
  };
}

// Coarse classification of the record used by status inference and the feed.
//   tool_use      assistant turn that ended on a tool call (work in flight)
//   assistant_text assistant turn that ended with prose (awaiting the human)
//   tool_result   user record carrying a tool's result
//   user          a human-typed user message
//   meta / other  bookkeeping records
export function kindOf(record) {
  if (record.isMeta) return 'meta';
  if (record.type === 'assistant') {
    if (record.blocks.some((b) => b.kind === 'tool_use')) return 'tool_use';
    if (record.blocks.some((b) => b.kind === 'text' || b.kind === 'thinking')) return 'assistant_text';
    return 'other';
  }
  if (record.type === 'user') {
    if (record.toolResult || record.blocks.some((b) => b.kind === 'tool_result')) return 'tool_result';
    return 'user';
  }
  return 'other';
}

// Parse a single line. Returns one of:
//   { ok:true, record }
//   { ok:false, empty:true }      blank line (ignored, not counted as malformed)
//   { ok:false, malformed:true }  unparseable / not an object
export function parseLine(line) {
  const t = typeof line === 'string' ? line.trim() : '';
  if (t === '') return { ok: false, empty: true };
  let raw;
  try {
    raw = JSON.parse(t);
  } catch {
    return { ok: false, malformed: true };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, malformed: true };
  }
  return { ok: true, record: normalizeRecord(raw) };
}

// Parse a buffer of newline-delimited records. A trailing line with no newline is
// treated as an incomplete write and returned as `partial` (the watcher buffers it
// and re-feeds it once the rest of the line lands) — never counted as malformed.
export function parseLines(text) {
  const records = [];
  let malformed = 0;
  const str = String(text ?? '');
  const endsNL = str.endsWith('\n');
  const parts = str.split('\n');
  let partial = '';
  if (endsNL) {
    parts.pop(); // trailing empty element from the final newline
  } else {
    partial = parts.pop() ?? '';
  }
  for (const line of parts) {
    const r = parseLine(line);
    if (r.ok) records.push(r.record);
    else if (r.malformed) malformed++;
  }
  return { records, malformed, partial };
}
