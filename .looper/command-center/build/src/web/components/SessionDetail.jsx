// Center-bottom: the selected session, with a single in-place toggle that swaps the
// pane between Activity (streaming transcript with tool-call viz, f6), Diff (files
// changed +X/-Y derived from Edit/Write, f7), and Terminal (attach, c8) — selection
// never lost (c6). The header keeps glanceable metadata and completes the connective
// flow with "note to memory" + "pin latest" actions.

import { useState } from 'react';
import { useStore, getState, setCenterMode, openComposer, pinFeedItem, liveSince, liveAge } from '../lib/store.js';
import { cx, statusMeta, formatAgo, formatDuration, formatClock, toolMeta } from '../lib/util.js';
import { computeFileChanges } from '../../shared/filechanges.js';
import { Icon } from './icons.jsx';
import { Button, IconButton, Badge, Empty, Dot } from './ui.jsx';
import { TerminalView } from './Terminal.jsx';

function bottomView(centerMode) {
  if (centerMode === 'diff') return 'diff';
  if (centerMode === 'terminal') return 'terminal';
  return 'activity';
}

export function SessionDetail() {
  const centerMode = useStore((s) => s.centerMode);
  const selectedKey = useStore((s) => s.selectedKey);
  const summary = useStore((s) => (s.selectedKey ? s.sessionsByKey[s.selectedKey] : null));
  const detail = useStore((s) => s.sessionDetail);
  const sessionCmd = useStore((s) => s.sessionCmd);
  const view = bottomView(centerMode);

  if (!selectedKey || !summary) {
    return (
      <div className="h-full bg-panel border-t border-line/70">
        <Empty icon={Icon.terminal} title="No session selected" hint="Pick a session on the left, or jump from any feed action. Then read its transcript, view its diff, or attach its terminal — all in place." />
      </div>
    );
  }

  const m = statusMeta(summary.status);
  const loaded = detail && detail.key === selectedKey ? detail : null;

  return (
    <div className="h-full flex flex-col min-h-0 bg-panel border-t border-line/70">
      <header className="flex items-center gap-2 h-10 px-3 shrink-0 border-b border-line/60">
        <Dot color={m.color} pulse={m.dot} />
        <span className="font-mono text-[12.5px] font-medium truncate">{summary.sessionId}</span>
        <Badge color={m.color} className="h-[18px]">{m.label}</Badge>
        <span className="text-[11px] text-faint truncate hidden sm:inline" title={summary.cwd}>{summary.dirLabel}</span>
        {summary.branch && <span className="flex items-center gap-0.5 text-[10px] text-faint"><Icon.branch size={10} />{summary.branch}</span>}
        <span className="flex-1" />
        <Meta summary={summary} />
        <Toggle view={view} />
      </header>

      <div className="flex items-center gap-1 px-3 h-8 shrink-0 border-b border-line/40 bg-surface/30">
        <Button size="sm" variant="ghost" onClick={() => pinLatest()} title="Pin this session's latest action into its directory memory + decision trail"><Icon.pin size={12} /> Pin latest</Button>
        <Button size="sm" variant="ghost" onClick={() => pinWithNote(summary)} title="Pin the latest action with a rationale"><Icon.pin size={12} /> Pin…</Button>
        <Button size="sm" variant="ghost" onClick={() => quickNote(summary)} title={`Write a note into ${summary.dirLabel} memory`}><Icon.memory size={12} /> Note to memory</Button>
        <span className="flex-1" />
        <span className="flex items-center gap-2 text-[10px] text-faint">
          <span>{summary.recordCount} records</span>
          {summary.malformed > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 h-[16px] font-semibold"
              style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 16%, transparent)' }}
              title="Malformed JSONL line(s) skipped — the valid records around them still rendered."
            >
              <Icon.warn size={10} /> {summary.malformed} skipped
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {view === 'terminal' ? (
          <TerminalView sessionKey={selectedKey} cwd={summary.cwd} sessionCmd={sessionCmd} />
        ) : view === 'diff' ? (
          <DiffView detail={loaded} summary={summary} />
        ) : (
          <Transcript detail={loaded} summary={summary} />
        )}
      </div>
    </div>
  );
}

function latestItem() {
  const st = getState();
  const cands = st.feed.filter((i) => i.sessionKey === st.selectedKey);
  return cands[cands.length - 1] || null;
}
function pinLatest() {
  const item = latestItem();
  if (item) pinFeedItem(item, { scope: 'dir' });
}
function pinWithNote(summary) {
  const item = latestItem();
  if (item) openComposer({ mode: 'pin', scope: 'dir', cwd: summary.cwd, dirLabel: summary.dirLabel, item });
  else openComposer({ mode: 'note', scope: 'dir', cwd: summary.cwd, dirLabel: summary.dirLabel });
}
// Inline note composer replaces the former window.prompt — pre-targeted at this dir's
// memory so the feed → session → memory hop is one obvious click (o1).
function quickNote(summary) {
  openComposer({ mode: 'note', scope: 'dir', cwd: summary.cwd, dirLabel: summary.dirLabel });
}

function Meta({ summary }) {
  useStore((s) => s.tick);
  return (
    <div className="flex items-center gap-2.5 text-[10.5px] text-faint font-mono mr-1">
      <span title="time since last change">{formatAgo(liveSince(summary))} ago</span>
      <span title="session age">· age {formatDuration(liveAge(summary))}</span>
      {(summary.additions > 0 || summary.deletions > 0) && (
        <span><span className="text-[var(--color-add)]">+{summary.additions}</span> <span className="text-[var(--color-del)]">-{summary.deletions}</span></span>
      )}
    </div>
  );
}

function Toggle({ view }) {
  const items = [
    ['activity', 'Activity', Icon.bolt, 'session'],
    ['diff', 'Diff', Icon.diff, 'diff'],
    ['terminal', 'Terminal', Icon.terminal, 'terminal'],
  ];
  return (
    <div className="flex items-center p-0.5 rounded-md bg-elevated border border-line">
      {items.map(([key, label, I, mode]) => (
        <button
          key={key}
          onClick={() => setCenterMode(mode)}
          className={cx('flex items-center gap-1 px-2 h-6 rounded text-[11px] transition-colors', view === key ? 'bg-hover text-ink' : 'text-faint hover:text-muted')}
        >
          <I size={12} /> {label}
        </button>
      ))}
    </div>
  );
}

// ---- Transcript ----
function indexResults(records) {
  const byId = {};
  for (const r of records) {
    for (const b of r.blocks || []) {
      if (b.kind === 'tool_result' && b.toolUseId) byId[b.toolUseId] = b;
    }
  }
  return byId;
}

function Transcript({ detail, summary }) {
  if (!detail) return <Empty icon={Icon.bolt} title="Loading transcript…" />;
  if (detail.error) return <Empty icon={Icon.bolt} title="Could not load this transcript" hint="The session may have rotated. It will refresh on the next update." />;
  const records = detail.records || [];
  const shown = records.slice(-160);
  const byId = indexResults(records);
  return (
    <div className="cc-scroll h-full px-3 py-2">
      {records.length > shown.length && (
        <div className="text-center text-[10px] text-faint py-1">showing last {shown.length} of {records.length} records</div>
      )}
      {shown.map((r, i) => (
        <Record key={r.uuid || i} r={r} byId={byId} />
      ))}
    </div>
  );
}

function Record({ r, byId }) {
  if (r.type === 'user' && r.blocks.some((b) => b.kind === 'text')) {
    const text = r.blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('\n');
    if (text.trim()) {
      return (
        <div className="my-1.5 flex gap-2">
          <span className="text-[10px] font-semibold text-brand mt-0.5 shrink-0">you</span>
          <div className="text-[12px] text-ink/90 whitespace-pre-wrap">{text}</div>
        </div>
      );
    }
  }
  if (r.type !== 'assistant') return null;
  const meta = turnMeta(r);
  return (
    <div className="my-1.5">
      {r.isSidechain && (
        <div className="flex items-center gap-1 text-[10px] text-sub mb-1"><Icon.agent size={11} /> subagent {r.agentId || ''}</div>
      )}
      {(meta.clock || meta.tool || meta.add > 0 || meta.del > 0) && (
        <div className="flex items-center gap-2 text-[10px] text-faint font-mono mb-0.5">
          {meta.clock && <span title="turn time">{meta.clock}</span>}
          {meta.tool && (
            <span className="flex items-center gap-0.5" style={{ color: toolMeta(meta.tool).tint }} title="active tool this turn">
              {toolMeta(meta.tool).glyph} {meta.tool}
            </span>
          )}
          {(meta.add > 0 || meta.del > 0) && (
            <span title="lines changed this turn"><span className="text-[var(--color-add)]">+{meta.add}</span> <span className="text-[var(--color-del)]">-{meta.del}</span></span>
          )}
        </div>
      )}
      {r.blocks.map((b, i) => (
        <Block key={i} b={b} result={b.kind === 'tool_use' ? byId[b.id] : null} />
      ))}
    </div>
  );
}

// Per-turn metadata for the streaming transcript (f6): turn time, the tool the turn ran,
// and the +X/-Y it produced — derived from this record's own blocks via the same tested
// file-change logic the session surface uses.
function turnMeta(r) {
  const fc = computeFileChanges([r]);
  let tool = null;
  for (const b of r.blocks || []) {
    if (b.kind === 'tool_use') { tool = b.name; break; }
  }
  return { clock: r.ts ? formatClock(r.ts) : '', tool, add: fc.totals.additions, del: fc.totals.deletions };
}

function Block({ b, result }) {
  if (b.kind === 'thinking') {
    return (
      <details className="my-1 group">
        <summary className="cursor-pointer text-[10.5px] text-faint italic flex items-center gap-1 select-none">
          <Icon.chevron size={10} className="group-open:rotate-90 transition-transform" /> thinking
        </summary>
        <div className="pl-3 mt-1 text-[11.5px] text-muted/80 italic whitespace-pre-wrap border-l border-line/60">{b.text}</div>
      </details>
    );
  }
  if (b.kind === 'text') {
    return <div className="my-1 text-[12px] text-ink/85 whitespace-pre-wrap leading-relaxed">{b.text}</div>;
  }
  if (b.kind === 'tool_use') {
    const tip = toolMeta(b.name);
    const summary = summarizeInput(b.name, b.input);
    return (
      <div className="my-1 rounded-md border border-line/70 bg-elevated/50 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 h-7" style={{ background: `color-mix(in srgb, ${tip.tint} 8%, transparent)` }}>
          <span className="font-bold" style={{ color: tip.tint }}>{tip.glyph}</span>
          <span className="text-[11.5px] font-semibold" style={{ color: tip.tint }}>{b.name}</span>
          <span className="text-[11px] text-muted font-mono truncate">{summary}</span>
        </div>
        {result != null && <ToolResult result={result} />}
      </div>
    );
  }
  return null;
}

function ToolResult({ result }) {
  const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  const trimmed = (text || '').slice(0, 600);
  return (
    <div className={cx('px-2.5 py-1.5 text-[11px] font-mono whitespace-pre-wrap border-t border-line/50', result.isError ? 'text-[var(--color-del)]' : 'text-muted/80')}>
      {trimmed || '(empty result)'}{text && text.length > 600 ? ' …' : ''}
    </div>
  );
}

function summarizeInput(name, input = {}) {
  if (name === 'Bash') return input.command || '';
  if (['Edit', 'Write', 'MultiEdit', 'Read'].includes(name)) return input.file_path || '';
  if (name === 'Task') return input.description || input.subagent_type || '';
  if (name === 'Grep' || name === 'Glob') return input.pattern || '';
  const k = Object.keys(input)[0];
  return k ? `${k}: ${String(input[k]).slice(0, 60)}` : '';
}

// ---- Diff view (derived from Edit/Write blocks) ----
function diffsFromRecords(records) {
  const out = [];
  for (const r of records) {
    for (const b of r.blocks || []) {
      if (b.kind !== 'tool_use') continue;
      if (b.name === 'Write') out.push({ path: b.input.file_path, kind: 'write', added: lines(b.input.content), removed: [] });
      else if (b.name === 'Edit') out.push({ path: b.input.file_path, kind: 'edit', added: lines(b.input.new_string), removed: lines(b.input.old_string) });
      else if (b.name === 'MultiEdit') for (const e of b.input.edits || []) out.push({ path: b.input.file_path, kind: 'edit', added: lines(e.new_string), removed: lines(e.old_string) });
    }
  }
  return out;
}
function lines(s) {
  if (s == null || s === '') return [];
  return String(s).replace(/\n$/, '').split('\n');
}

function DiffView({ detail, summary }) {
  if (!detail) return <Empty icon={Icon.diff} title="Loading changes…" />;
  const diffs = diffsFromRecords(detail.records || []);
  if (diffs.length === 0) {
    return <Empty icon={Icon.diff} title="No file changes" hint="This session has no Edit/Write actions in the loaded history." />;
  }
  return (
    <div className="cc-scroll h-full px-3 py-2 space-y-2">
      <div className="text-[11px] text-faint">{summary.filesChanged} files · <span className="text-[var(--color-add)]">+{summary.additions}</span> <span className="text-[var(--color-del)]">-{summary.deletions}</span></div>
      {diffs.slice(-60).map((d, i) => (
        <div key={i} className="rounded-md border border-line/70 overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 h-7 bg-elevated/60">
            <Icon.diff size={12} className="text-faint" />
            <span className="font-mono text-[11.5px] text-ink/90 truncate">{d.path}</span>
            <span className="ml-auto font-mono text-[10.5px]"><span className="text-[var(--color-add)]">+{d.added.length}</span> <span className="text-[var(--color-del)]">-{d.removed.length}</span></span>
          </div>
          <pre className="text-[11px] font-mono leading-snug px-2 py-1.5 overflow-x-auto bg-bg/40">
            {d.removed.slice(0, 30).map((l, j) => (<div key={'r' + j} className="text-[var(--color-del)] whitespace-pre">- {l}</div>))}
            {d.added.slice(0, 30).map((l, j) => (<div key={'a' + j} className="text-[var(--color-add)] whitespace-pre">+ {l}</div>))}
          </pre>
        </div>
      ))}
    </div>
  );
}
