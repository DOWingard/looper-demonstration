// Left rail: project directories as first-class lanes (d3) whose headers carry name,
// session count, a per-status breakdown, branch and an aggregate status chip so a new dir
// is instantly distinguishable. Sessions sort so the ones needing the operator (waiting)
// sit on top and are the most salient thing on screen (d1). Rows carry live status by
// color + icon + motion (d4) and glanceable metadata (c7). A non-destructive peek (hover,
// the eye affordance, or ⌘K) inspects any session without changing the selection (c10).

import { useState, useRef, useEffect } from 'react';
import {
  useStore, getState, liveGroups, selectSession, setCenterMode, liveSince, setPeek, closePeek,
} from '../lib/store.js';
import { cx, statusMeta, formatAgo, toolMeta } from '../lib/util.js';
import { Icon } from './icons.jsx';
import { Badge, Empty, IconButton } from './ui.jsx';

const STATUS_SORT = { waiting: 0, working: 1, idle: 2, done: 3 };
const STATUS_ORDER = ['waiting', 'working', 'idle', 'done'];

function sortedSessions(g) {
  return [...g.sessions].sort(
    (a, b) => (STATUS_SORT[a.status] - STATUS_SORT[b.status]) || (a.sinceMs ?? 9e15) - (b.sinceMs ?? 9e15)
  );
}

export function flatSessionOrder() {
  const order = [];
  for (const g of liveGroups()) for (const s of sortedSessions(g)) order.push(s.key);
  return order;
}

// Pre-attentive status mark (d4): a distinct color + icon in a tinted disc, with motion
// reserved for the active states — working spins, waiting pulses an alerting ring (the
// most salient thing on screen). Idle and done are calm and static.
function StatusGlyph({ status, size = 13 }) {
  const m = statusMeta(status);
  const I = Icon[m.icon] || Icon.dot;
  const active = status === 'working' || status === 'waiting';
  return (
    <span className="relative grid place-items-center w-[18px] h-[18px] rounded-full shrink-0" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} ${active ? 18 : 10}%, transparent)` }}>
      {status === 'waiting' && <span className="absolute inset-0 rounded-full cc-dot-waiting" />}
      <I size={size} className={status === 'working' ? 'cc-spin' : ''} />
    </span>
  );
}

function PeekButton({ s, onPeek }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onPeek(s, e.currentTarget.closest('button')?.parentElement || e.currentTarget); }}
      className="shrink-0 grid place-items-center w-5 h-5 rounded text-faint opacity-0 group-hover:opacity-100 hover:text-brand hover:bg-hover transition-all"
      title="Peek this session without changing your selection"
    >
      <Icon.eye size={12} />
    </button>
  );
}

function SessionRow({ s, selected, onHover, onLeave, onPeek }) {
  const m = statusMeta(s.status);
  const tip = toolMeta(s.activeTool);
  const waiting = s.status === 'waiting';
  return (
    <div
      onMouseEnter={(e) => onHover(s, e.currentTarget)}
      onMouseLeave={onLeave}
      className={cx(
        'group relative w-full flex items-center gap-2 border-l-2 transition-colors',
        selected ? 'bg-hover border-l-brand' : 'border-l-transparent hover:bg-hover/60',
        waiting && !selected && 'cc-row-waiting'
      )}
      style={{ borderLeftColor: selected ? 'var(--color-brand)' : waiting ? m.color : 'transparent' }}
    >
      <button
        onClick={() => { selectSession(s.key, s.cwd); if (getState().centerMode === 'feed') setCenterMode('session'); }}
        className="flex-1 min-w-0 text-left pl-2.5 pr-1 py-1.5 flex items-center gap-2"
      >
        <StatusGlyph status={s.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-ink/90 font-mono">{prettyId(s.sessionId)}</span>
            {s.kind === 'pty' && <Badge color="var(--color-brand)" className="h-[15px] px-1 text-[9px]">live</Badge>}
            {waiting && <span className="text-[9px] font-semibold uppercase tracking-wide px-1 rounded" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 20%, transparent)` }}>needs you</span>}
            {s.hasSidechain && <Icon.agent size={11} className="text-sub shrink-0" title="has subagent activity" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-faint">
            {s.activeTool ? (
              <span className="flex items-center gap-1 truncate" style={{ color: tip.tint }}>
                <span>{tip.glyph}</span>
                <span className="truncate">{s.activeTool}</span>
              </span>
            ) : (
              <span style={{ color: m.color }}>{m.label}</span>
            )}
            {(s.additions > 0 || s.deletions > 0) && (
              <span className="font-mono whitespace-nowrap">
                <span className="text-[var(--color-add)]">+{s.additions}</span>{' '}
                <span className="text-[var(--color-del)]">-{s.deletions}</span>
              </span>
            )}
            {s.malformed > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1 h-[15px] text-[9.5px] font-semibold whitespace-nowrap shrink-0"
                style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 18%, transparent)' }}
                title={`${s.malformed} malformed line(s) skipped — the records around them still parsed`}
              >
                <Icon.warn size={9} /> {s.malformed} skipped
              </span>
            )}
          </div>
        </div>
      </button>
      <PeekButton s={s} onPeek={onPeek} />
      <LiveAgo s={s} />
    </div>
  );
}

function LiveAgo({ s }) {
  useStore((st) => st.tick);
  return <span className="text-[10.5px] text-faint font-mono whitespace-nowrap tabular-nums pr-2 pl-0.5 shrink-0" title="time since last change">{formatAgo(liveSince(s))}</span>;
}

function prettyId(id) {
  if (!id) return 'session';
  if (id.startsWith('sess-')) return id.slice(5);
  if (id.startsWith('dispatch-')) return id;
  return id.length > 16 ? id.slice(0, 8) : id;
}

// Rich lane header (d3): aggregate status chip, name, count, a per-status breakdown, the
// branch, and the freshest activity time — enough that a newly-appeared dir reads at a glance.
function Lane({ g, selectedKey, onHover, onLeave, onPeek }) {
  const [open, setOpen] = useState(true);
  useStore((st) => st.tick);
  const m = statusMeta(g.status);
  const freshest = g.sessions.reduce((min, s) => Math.min(min, s.sinceMs ?? 9e15), 9e15);
  return (
    <div className="border-b border-line/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex flex-col gap-1 px-2.5 py-1.5 hover:bg-hover/40 transition-colors text-left"
        style={{ boxShadow: g.status === 'waiting' ? `inset 3px 0 0 ${m.color}` : 'none' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon.chevron size={13} className={cx('text-faint transition-transform shrink-0', open && 'rotate-90')} />
          <Icon.folder size={14} className="shrink-0" style={{ color: m.color }} />
          <span className="truncate text-[12.5px] font-semibold text-ink" title={g.cwd}>{g.label}</span>
          <Badge className="h-[16px] px-1 text-[10px] bg-elevated text-muted shrink-0">{g.sessionCount}</Badge>
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[10px] font-medium shrink-0" style={{ color: m.color }} title={`most urgent: ${m.label}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
            {m.short}
          </span>
        </div>
        <div className="flex items-center gap-2 pl-[26px] text-[10px] text-faint min-w-0">
          <StatusBreakdown counts={g.counts} />
          <span className="flex-1" />
          {g.branch && <span className="flex items-center gap-0.5 truncate shrink min-w-0" title={`branch ${g.branch}`}><Icon.branch size={10} /><span className="truncate">{g.branch}</span></span>}
          {freshest < 9e15 && <span className="font-mono tabular-nums shrink-0" title="freshest activity in this dir">{formatAgo(freshest)}</span>}
        </div>
      </button>
      {open && (
        <div className="pb-1">
          {sortedSessions(g).map((s) => (
            <SessionRow key={s.key} s={s} selected={s.key === selectedKey} onHover={onHover} onLeave={onLeave} onPeek={onPeek} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBreakdown({ counts }) {
  const parts = STATUS_ORDER.filter((st) => counts[st]).map((st) => ({ st, n: counts[st], m: statusMeta(st) }));
  if (!parts.length) return <span />;
  return (
    <span className="flex items-center gap-2 min-w-0 truncate">
      {parts.map(({ st, n, m }) => (
        <span key={st} className="flex items-center gap-1 whitespace-nowrap" style={{ color: m.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
          {n} {m.short}
        </span>
      ))}
    </span>
  );
}

// Always-visible "next action" banner: when any session is waiting, the operator's next
// move is one click away at the very top of the rail (d1).
function NeedsYouBanner({ groups }) {
  useStore((st) => st.tick);
  const waiting = [];
  for (const g of groups) for (const s of g.sessions) if (s.status === 'waiting') waiting.push({ s, g });
  if (!waiting.length) return null;
  const first = waiting[0];
  return (
    <button
      onClick={() => { selectSession(first.s.key, first.s.cwd); setCenterMode('session'); }}
      className="w-full flex items-center gap-2 px-2.5 h-9 shrink-0 border-b border-line/70 text-left cc-banner-waiting"
      title="Jump to the session waiting on you"
    >
      <Icon.bell size={13} className="shrink-0" style={{ color: 'var(--color-waiting)' }} />
      <span className="text-[11px] font-semibold" style={{ color: 'var(--color-waiting)' }}>{waiting.length} waiting on you</span>
      <span className="text-[10.5px] text-faint truncate font-mono">→ {prettyId(first.s.sessionId)} · {first.g.label}</span>
      <Icon.jump size={12} className="text-faint ml-auto shrink-0" />
    </button>
  );
}

function PeekCard() {
  const peek = useStore((s) => s.peek);
  const sticky = useStore((s) => s.peekSticky);
  const feed = useStore((s) => s.feed);
  useStore((s) => s.sessionsByKey);
  if (!peek) return null;
  const live = getState().sessionsByKey[peek.s.key] || peek.s;
  const m = statusMeta(live.status || peek.s.status);
  const items = feed.filter((i) => i.sessionKey === peek.s.key).slice(-5).reverse();
  const rect = peek.rect || { right: 280, top: 120 };
  const top = Math.max(56, Math.min(window.innerHeight - 240, rect.top));
  const left = Math.min(window.innerWidth - 320, (rect.right || 280) + 8);
  return (
    <div className={cx('fixed z-50 w-[300px] cc-fade-in', sticky ? 'pointer-events-auto' : 'pointer-events-none')} style={{ left, top }}>
      <div className="rounded-lg border border-line bg-elevated shadow-2xl">
        <div className="flex items-center gap-2 px-3 h-9 border-b border-line/60">
          <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
          <span className="font-mono text-[12px] text-ink truncate">{prettyId(peek.s.sessionId)}</span>
          <span className="text-[10px] ml-auto" style={{ color: m.color }}>{m.label}</span>
          {sticky && <IconButton icon={Icon.close} label="close peek" size={12} className="h-5 w-5" onClick={closePeek} />}
        </div>
        <div className="px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-faint mb-1">latest activity</div>
          {items.length === 0 ? (
            <div className="text-[11px] text-faint">No recorded actions yet.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-1.5 text-[11px]">
                  <span style={{ color: toolMeta(i.tool).tint }}>{toolMeta(i.tool).glyph}</span>
                  <span className="text-muted shrink-0">{i.tool}</span>
                  <span className="text-faint truncate font-mono">{i.summary}</span>
                </div>
              ))}
            </div>
          )}
          {sticky && (
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line/50">
              <button onClick={() => { selectSession(peek.s.key, peek.s.cwd); setCenterMode('session'); closePeek(); }} className="flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted hover:text-ink hover:bg-hover"><Icon.jump size={12} /> Open</button>
              <button onClick={() => { selectSession(peek.s.key, peek.s.cwd); setCenterMode('terminal'); closePeek(); }} className="flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted hover:text-ink hover:bg-hover"><Icon.terminal size={12} /> Attach</button>
              <span className="ml-auto text-[10px] text-faint">selection unchanged</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useSidebarPeek() {
  const hoverTimer = useRef(null);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const onHover = (s, el) => {
    if (getState().peekSticky) return; // don't let hover steal a pinned peek
    clearTimeout(hoverTimer.current);
    const rect = el.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setPeek({ s, rect }), 220);
  };
  const onLeave = () => {
    clearTimeout(hoverTimer.current);
    if (!getState().peekSticky) setPeek(null);
  };
  const onPeek = (s, el) => {
    clearTimeout(hoverTimer.current);
    const rect = (el?.getBoundingClientRect && el.getBoundingClientRect()) || { right: 280, top: 120 };
    setPeek({ s, rect }, { sticky: true });
  };
  return { onHover, onLeave, onPeek };
}

export function DirSidebar({ onPick }) {
  const selectedKey = useStore((s) => s.selectedKey);
  useStore((s) => s.tick);
  useStore((s) => s.sessionsByKey);
  const groups = liveGroups();
  const peek = useSidebarPeek();

  return (
    <div className="h-full flex flex-col bg-panel" onClick={onPick}>
      <header className="flex items-center justify-between h-9 px-3 shrink-0 border-b border-line/70">
        <span className="cc-label">Directories</span>
        <span className="text-[10px] text-faint">{groups.length} dir{groups.length === 1 ? '' : 's'}</span>
      </header>
      <NeedsYouBanner groups={groups} />
      <div className="cc-scroll flex-1 min-h-0">
        {groups.length === 0 ? (
          <Empty icon={Icon.folder} title="No sessions discovered" hint="Point CC_PROJECTS_DIR at a transcripts tree, or run the fixtures generator, then sessions appear here grouped by directory." />
        ) : (
          groups.map((g) => <Lane key={g.cwd} g={g} selectedKey={selectedKey} {...peek} />)
        )}
      </div>
      <PeekCard />
    </div>
  );
}

// Compact horizontal session strip for narrow viewports — keeps the fleet (and what needs
// the operator) co-visible with the activity surface instead of hiding it behind a tab (d9).
export function SessionStrip() {
  const selectedKey = useStore((s) => s.selectedKey);
  useStore((s) => s.tick);
  useStore((s) => s.sessionsByKey);
  const groups = liveGroups();
  const peek = useSidebarPeek();
  if (!groups.length) return null;
  return (
    <div className="shrink-0 border-b border-line bg-panel">
      <div className="flex items-stretch gap-3 px-2 py-1.5 overflow-x-auto cc-scroll">
        {groups.map((g) => (
          <div key={g.cwd} className="flex items-center gap-1.5 shrink-0">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-faint pr-1 border-r border-line/60 shrink-0" title={g.cwd}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta(g.status).color }} />
              {g.label}
            </span>
            {sortedSessions(g).map((s) => {
              const m = statusMeta(s.status);
              const sel = s.key === selectedKey;
              return (
                <button
                  key={s.key}
                  onClick={() => { selectSession(s.key, s.cwd); setCenterMode('session'); }}
                  onMouseEnter={(e) => peek.onHover(s, e.currentTarget)}
                  onMouseLeave={peek.onLeave}
                  className={cx('flex items-center gap-1.5 h-7 px-2 rounded-md border text-[11px] whitespace-nowrap shrink-0 transition-colors', sel ? 'border-brand bg-hover text-ink' : 'border-line text-muted hover:bg-hover/60', s.status === 'waiting' && !sel && 'cc-row-waiting')}
                  style={s.status === 'waiting' && !sel ? { borderColor: m.color } : undefined}
                  title={`${prettyId(s.sessionId)} · ${m.label}`}
                >
                  <StatusGlyph status={s.status} size={11} />
                  <span className="font-mono truncate max-w-[110px]">{prettyId(s.sessionId)}</span>
                  {s.status === 'waiting' && <Icon.bell size={10} style={{ color: m.color }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <PeekCard />
    </div>
  );
}
