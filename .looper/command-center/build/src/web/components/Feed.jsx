// Center-top: the unified cross-session live action feed — one chronological stream of
// tool_use actions merged across every session and directory (f5), each item tagged with
// its source dir/session and main-vs-subagent. Filterable by dir/session/type/text (c9).
// Rapid same-session runs collapse into expandable bursts and session changes get a quiet
// divider so the feed stays scannable at fleet density (d8). The row is windowed so the
// DOM stays bounded no matter how large the fleet grows (c5). Each item launches the
// connective flow — jump to the session, attach its terminal, pin the action, or write a
// note into that dir's memory (o1), the pin being the signature move (o4).

import { useState, useEffect, useRef } from 'react';
import {
  useStore, getState, selectSession, setCenterMode, setFilter, clearFilter, pinFeedItem, setRightTab,
  toggleFeedCollapse, openComposer,
} from '../lib/store.js';
import { cx, formatClock, toolMeta } from '../lib/util.js';
import { groupFeedRows } from '../../shared/feedgroup.js';
import { computeWindow } from '../../shared/virtual.js';
import { Icon } from './icons.jsx';
import { IconButton, Empty, Badge } from './ui.jsx';

const RENDER_CAP = 600; // outer bound on candidate rows; windowing keeps the DOM far smaller
const ROW_EST = 58; // estimated row height for virtualization geometry

function matches(item, f) {
  if (f.dir && item.cwd !== f.dir) return false;
  if (f.session && item.sessionKey !== f.session) return false;
  if (f.type && item.tool !== f.type) return false;
  if (f.text) {
    const q = f.text.toLowerCase();
    if (!(`${item.tool} ${item.summary} ${item.dirLabel}`.toLowerCase().includes(q))) return false;
  }
  return true;
}

function RowActions({ item }) {
  // jump/attach/note reveal on hover; pin stays brand-tinted and always visible so a
  // first-time user discovers the signature pin-to-memory move without being told (o3/o4).
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconButton icon={Icon.jump} label="jump to session" size={13} onClick={stop(() => { selectSession(item.sessionKey, item.cwd); setCenterMode('session'); })} />
        <IconButton icon={Icon.terminal} label="attach terminal" size={13} onClick={stop(() => { selectSession(item.sessionKey, item.cwd); setCenterMode('terminal'); })} />
        <IconButton icon={Icon.memory} label={`write a note into ${item.dirLabel} memory`} size={13} onClick={stop(() => openComposer({ mode: 'note', scope: 'dir', cwd: item.cwd, dirLabel: item.dirLabel }))} />
      </span>
      <IconButton
        icon={Icon.pin}
        label="Pin to this dir's memory — builds the Decision Trail (shift-click to add a rationale)"
        size={13}
        className="text-brand opacity-80 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) openComposer({ mode: 'pin', scope: 'dir', cwd: item.cwd, dirLabel: item.dirLabel, item });
          else pinFeedItem(item, { scope: 'dir' });
        }}
      />
    </div>
  );
}

function FeedRow({ item, nested, newSession }) {
  const tip = toolMeta(item.tool);
  return (
    <div
      className={cx(
        'group flex items-start gap-2.5 px-3 py-2 hover:bg-hover/50',
        nested ? 'bg-bg/20 pl-7' : '',
        newSession && !nested ? 'border-t border-line/50' : 'border-t border-line/15'
      )}
    >
      <span className="text-[10px] text-faint font-mono mt-0.5 tabular-nums w-[58px] shrink-0">{formatClock(item.ts)}</span>
      <span className="grid place-items-center w-5 h-5 rounded shrink-0 mt-px text-[12px] font-bold" style={{ color: tip.tint, background: `color-mix(in srgb, ${tip.tint} 12%, transparent)` }}>
        {tip.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold" style={{ color: tip.tint }}>{item.tool}</span>
          {item.isSidechain && (
            <span className="flex items-center gap-0.5 text-[10px] text-sub" title={`subagent ${item.agentId || ''}`}>
              <Icon.agent size={10} /> subagent
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-muted font-mono truncate mt-0.5" title={item.summary}>{item.summary}</div>
        <div className="flex items-center gap-1 mt-1 text-[10px] text-faint">
          <Icon.folder size={10} />
          <button className="hover:text-brand" onClick={(e) => { e.stopPropagation(); setFilter({ dir: item.cwd }); }} title="filter to this directory">{item.dirLabel}</button>
          <span className="text-line">/</span>
          <button className="hover:text-brand truncate font-mono" onClick={(e) => { e.stopPropagation(); setFilter({ session: item.sessionKey }); }} title="filter to this session">{shortId(item.sessionId)}</button>
        </div>
      </div>
      <RowActions item={item} />
    </div>
  );
}

function BurstRow({ burst, newSession }) {
  const [open, setOpen] = useState(false);
  const items = burst.items; // newest-first
  const latest = items[0];
  const tools = {};
  for (const it of items) tools[it.tool] = (tools[it.tool] || 0) + 1;
  const anySub = items.some((it) => it.isSidechain);
  return (
    <div className={cx(newSession ? 'border-t border-line/50' : 'border-t border-line/15')}>
      <button onClick={() => setOpen((o) => !o)} className="group w-full flex items-start gap-2.5 px-3 py-2 hover:bg-hover/50 text-left">
        <span className="text-[10px] text-faint font-mono mt-0.5 tabular-nums w-[58px] shrink-0">{formatClock(latest.ts)}</span>
        <span className="grid place-items-center w-5 h-5 rounded shrink-0 mt-px text-faint bg-elevated border border-line">
          <Icon.layers size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-ink/80">{items.length} actions</span>
            <span className="text-[10px] uppercase tracking-wide text-faint">burst</span>
            {anySub && <span className="flex items-center gap-0.5 text-[10px] text-sub"><Icon.agent size={10} /> subagent</span>}
            <span className="flex items-center gap-2">
              {Object.entries(tools).map(([t, n]) => (
                <span key={t} className="text-[10px] flex items-center gap-0.5" style={{ color: toolMeta(t).tint }}>{toolMeta(t).glyph}{n > 1 ? ` ×${n}` : ''}</span>
              ))}
            </span>
          </div>
          <div className="text-[11.5px] text-faint font-mono truncate mt-0.5" title={latest.summary}>latest · {latest.summary}</div>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-faint">
            <Icon.folder size={10} />
            <span>{latest.dirLabel}</span>
            <span className="text-line">/</span>
            <span className="truncate font-mono">{shortId(latest.sessionId)}</span>
          </div>
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <RowActions item={latest} />
          <Icon.chevron size={13} className={cx('text-faint transition-transform', open && 'rotate-90')} />
        </span>
      </button>
      {open && items.map((it) => <FeedRow key={it.id} item={it} nested />)}
    </div>
  );
}

function shortId(id) {
  if (!id) return '';
  return id.startsWith('sess-') ? id.slice(5) : id.length > 14 ? id.slice(0, 8) : id;
}

function FilterBar() {
  const filter = useStore((s) => s.filter);
  const feed = useStore((s) => s.feed);
  const dirs = uniqueBy(feed, (i) => i.cwd, (i) => ({ value: i.cwd, label: i.dirLabel }));
  const sessions = uniqueBy(feed, (i) => i.sessionKey, (i) => ({ value: i.sessionKey, label: shortId(i.sessionId) }));
  const types = [...new Set(feed.map((i) => i.tool))].sort();
  const active = filter.dir || filter.session || filter.type || filter.text;
  const inputRef = useRef(null);
  return (
    <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-line/60 bg-surface/40">
      <Icon.filter size={12} className="text-faint shrink-0" />
      <Select value={filter.dir || ''} onChange={(v) => setFilter({ dir: v || null })} placeholder="dir" options={dirs} />
      <Select value={filter.session || ''} onChange={(v) => setFilter({ session: v || null })} placeholder="session" options={sessions} />
      <Select value={filter.type || ''} onChange={(v) => setFilter({ type: v || null })} placeholder="action" options={types.map((t) => ({ value: t, label: t }))} />
      <div className="relative flex-1 min-w-[80px]">
        <input
          id="cc-feed-filter"
          ref={inputRef}
          value={filter.text}
          onChange={(e) => setFilter({ text: e.target.value })}
          placeholder="filter…"
          className="w-full h-6 pl-2 pr-2 rounded bg-elevated border border-line text-[11px] text-ink placeholder:text-faint focus:border-brand/60 outline-none"
        />
      </div>
      {active && <IconButton icon={Icon.close} label="clear filters" size={13} onClick={clearFilter} />}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx('h-6 max-w-[110px] rounded bg-elevated border text-[11px] px-1.5 outline-none cursor-pointer', value ? 'border-brand/50 text-ink' : 'border-line text-faint')}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function uniqueBy(arr, keyFn, mapFn) {
  const seen = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!seen.has(k)) seen.set(k, mapFn(x));
  }
  return [...seen.values()];
}

// Window the row list against the scroll position so only the visible slice (+overscan)
// is in the DOM. Geometry comes from the tested pure computeWindow (c5).
function useVirtual(count) {
  const ref = useRef(null);
  const [m, setM] = useState({ scrollTop: 0, viewportHeight: 700 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setM({ scrollTop: el.scrollTop, viewportHeight: el.clientHeight });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);
  const win = computeWindow({ scrollTop: m.scrollTop, viewportHeight: m.viewportHeight, rowHeight: ROW_EST, count, overscan: 8 });
  return { ref, win };
}

export function Feed() {
  const feed = useStore((s) => s.feed);
  const filter = useStore((s) => s.filter);
  const collapse = useStore((s) => s.feedCollapse);

  const filtered = feed.filter((i) => matches(i, filter)).slice(-RENDER_CAP).reverse();
  const rows = groupFeedRows(filtered, { collapse });
  const bursts = rows.filter((r) => r.type === 'burst').length;
  // Session-change boundaries (computed over the whole row list so windowing can't lose them).
  const keyOf = (r) => (r.type === 'burst' ? r.sessionKey : r.item.sessionKey);
  const { ref: scrollRef, win } = useVirtual(rows.length);
  const visible = rows.slice(win.start, win.end);

  useEffect(() => {
    const onPin = () => {
      const st = getState();
      const cands = st.selectedKey ? st.feed.filter((i) => i.sessionKey === st.selectedKey) : st.feed;
      const item = cands[cands.length - 1];
      if (item) pinFeedItem(item, { scope: 'dir' });
    };
    window.addEventListener('cc:pin-selected', onPin);
    return () => window.removeEventListener('cc:pin-selected', onPin);
  }, []);

  return (
    <div className="flex flex-col min-h-0 h-full bg-panel">
      <header className="flex items-center gap-2 h-9 px-3 shrink-0 border-b border-line/70">
        <Icon.bolt size={13} className="text-brand shrink-0" />
        <span className="cc-label">Unified feed</span>
        <Badge className="h-[16px] px-1 text-[10px] bg-elevated text-muted">{filtered.length}</Badge>
        <span className="flex-1" />
        <button
          onClick={() => setRightTab('trail')}
          title="Pin any action (hover the pin, or press p) into its directory's memory to build a durable, provenance-tagged Decision Trail."
          className="flex items-center gap-1 h-6 px-1.5 rounded text-[10px] text-faint hover:text-brand hover:bg-hover/60 transition-colors shrink-0"
        >
          <Icon.pin size={11} className="text-brand" /> <span className="hidden sm:inline">pin → trail</span>
        </button>
        <button
          onClick={toggleFeedCollapse}
          title="Group rapid same-session bursts (c)"
          className={cx('flex items-center gap-1 h-6 px-1.5 rounded text-[10px] transition-colors shrink-0', collapse ? 'text-brand bg-hover/60' : 'text-faint hover:text-muted')}
        >
          <Icon.layers size={11} /> <span className="hidden sm:inline">group{bursts > 0 ? ` ${bursts}` : ''}</span>
        </button>
      </header>
      <FilterBar />
      <div ref={scrollRef} className="cc-scroll flex-1 min-h-0">
        {filtered.length === 0 ? (
          <Empty icon={Icon.bolt} title={feed.length ? 'No actions match the filter' : 'No activity yet'} hint={feed.length ? 'Clear the filter to see the full fleet feed.' : 'Actions stream here the moment any session writes to its transcript.'} />
        ) : (
          <>
            <div style={{ height: win.padTop }} aria-hidden />
            {visible.map((r, i) => {
              const idx = win.start + i;
              const newSession = idx > 0 && keyOf(rows[idx]) !== keyOf(rows[idx - 1]);
              return r.type === 'burst'
                ? <BurstRow key={`b:${r.items[0].id}`} burst={r} newSession={newSession} />
                : <FeedRow key={r.item.id} item={r.item} newSession={newSession} />;
            })}
            <div style={{ height: win.padBottom }} aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
