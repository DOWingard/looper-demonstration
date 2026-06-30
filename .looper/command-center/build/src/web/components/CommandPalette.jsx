// Cmd/Ctrl-K command palette (c1): a searchable surface that reaches every major action
// from the keyboard — switch/attach session, jump to dir, open memory, filter feed,
// dispatch into any directory, show the away digest. Fully arrow-key + Enter driven.

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  useStore, getState, setPaletteOpen, setDigestOpen, setHelpOpen, setCenterMode, setRightTab,
  setMemoryScope, setFilter, clearFilter, selectSession, loadMemory, setState, markDigestSeen, liveGroups,
  setDispatchOpen, setPeek, openComposer, pinFeedItem, toggleFeedCollapse, dispatchSession,
} from '../lib/store.js';
import { cx, statusMeta, toolMeta } from '../lib/util.js';
import { Icon } from './icons.jsx';
import { Kbd } from './ui.jsx';

// The latest feed action for a session (the natural pin/peek target).
function latestFor(key) {
  const feed = getState().feed;
  for (let i = feed.length - 1; i >= 0; i--) if (feed[i].sessionKey === key) return feed[i];
  return null;
}

// Every major action is reachable here from the keyboard (c1): dispatch, switch, attach,
// peek, jump-to-dir, open memory (dir + global), filter by dir/session/action-type,
// pin-to-memory, toggle output/diff/terminal, digest, trail.
function buildCommands() {
  const st = getState();
  const groups = liveGroups();
  const sel = st.selectedKey ? st.sessionsByKey[st.selectedKey] : null;
  const cmds = [];

  cmds.push({ id: 'dispatch-custom', icon: Icon.plus, title: 'Dispatch session into a directory…', hint: 'type or pick a path', group: 'Dispatch', run: () => setDispatchOpen(true) });
  for (const g of groups) {
    cmds.push({ id: `dispatch-${g.cwd}`, icon: Icon.plus, title: `Dispatch session → ${g.label}`, hint: g.cwd, group: 'Dispatch', run: () => dispatchSession(g.cwd) });
  }

  // Jump to a directory (selects its most-urgent session, lands the lane in view).
  for (const g of groups) {
    const first = [...g.sessions].sort((a, b) => statusRank(a.status) - statusRank(b.status))[0];
    if (first) cmds.push({ id: `jump-${g.cwd}`, icon: Icon.folder, title: `Jump to directory: ${g.label}`, hint: `${g.sessionCount} session${g.sessionCount === 1 ? '' : 's'} · ${statusMeta(g.status).label}`, group: 'Jump', run: () => { selectSession(first.key, g.cwd); setCenterMode('session'); } });
  }

  for (const g of groups) {
    for (const s of g.sessions) {
      cmds.push({ id: `sw-${s.key}`, icon: Icon.jump, title: `Switch to ${pid(s.sessionId)}`, hint: `${g.label} · ${statusMeta(s.status).label}`, group: 'Sessions', run: () => { selectSession(s.key, s.cwd); setCenterMode('session'); } });
      cmds.push({ id: `at-${s.key}`, icon: Icon.terminal, title: `Attach terminal: ${pid(s.sessionId)}`, hint: g.label, group: 'Sessions', run: () => { selectSession(s.key, s.cwd); setCenterMode('terminal'); } });
      cmds.push({ id: `peek-${s.key}`, icon: Icon.eye, title: `Peek ${pid(s.sessionId)}`, hint: `${g.label} · without changing selection`, group: 'Peek', run: () => setPeek({ s, rect: anchorRect() }, { sticky: true }) });
    }
  }

  for (const g of groups) {
    cmds.push({ id: `mem-${g.cwd}`, icon: Icon.memory, title: `Open ${g.label} memory`, hint: g.cwd, group: 'Memory', run: () => { setState({ selectedCwd: g.cwd, rightTab: 'memory', memoryScope: 'dir' }); loadMemory('dir', g.cwd); } });
    cmds.push({ id: `filt-${g.cwd}`, icon: Icon.filter, title: `Filter feed by directory: ${g.label}`, hint: 'directory', group: 'Filter', run: () => setFilter({ dir: g.cwd }) });
  }

  // Filter by session and by action type, each keyboard-reachable + composable (c9).
  const sessionsSeen = new Set();
  for (const g of groups) for (const s of g.sessions) {
    if (sessionsSeen.has(s.key)) continue;
    sessionsSeen.add(s.key);
    cmds.push({ id: `filts-${s.key}`, icon: Icon.filter, title: `Filter feed by session: ${pid(s.sessionId)}`, hint: g.label, group: 'Filter', run: () => setFilter({ session: s.key }) });
  }
  const tools = [...new Set(st.feed.map((i) => i.tool))].sort();
  for (const t of tools) {
    cmds.push({ id: `filtt-${t}`, icon: Icon.filter, title: `Filter feed by action type: ${t}`, hint: 'action type', group: 'Filter', run: () => setFilter({ type: t }) });
  }

  // Pin / note (signature move + the connective feed→memory hop).
  if (sel) {
    const item = latestFor(sel.key);
    if (item) {
      cmds.push({ id: 'pin-latest', icon: Icon.pin, title: `Pin latest action of ${pid(sel.sessionId)} to ${sel.dirLabel} memory`, hint: 'decision trail', group: 'Pin', run: () => pinFeedItem(item, { scope: 'dir' }) });
      cmds.push({ id: 'pin-rationale', icon: Icon.pin, title: 'Pin latest action with a rationale…', hint: 'opens a note', group: 'Pin', run: () => openComposer({ mode: 'pin', scope: 'dir', cwd: sel.cwd, dirLabel: sel.dirLabel, item }) });
    }
    cmds.push({ id: 'note-dir', icon: Icon.memory, title: `Write a note into ${sel.dirLabel} memory…`, hint: 'inline note', group: 'Pin', run: () => openComposer({ mode: 'note', scope: 'dir', cwd: sel.cwd, dirLabel: sel.dirLabel }) });
  }
  cmds.push({ id: 'note-global', icon: Icon.memory, title: 'Write a note into global memory…', hint: 'fleet-wide', group: 'Pin', run: () => openComposer({ mode: 'note', scope: 'global' }) });

  cmds.push({ id: 'mem-global', icon: Icon.memory, title: 'Open global memory', hint: 'fleet-wide notes', group: 'Memory', run: () => { setState({ rightTab: 'memory', memoryScope: 'global' }); loadMemory('global'); } });
  cmds.push({ id: 'digest', icon: Icon.away, title: 'Since you last looked — away digest', hint: 'what happened across the fleet', group: 'View', run: () => setDigestOpen(true) });
  cmds.push({ id: 'mark-seen', icon: Icon.check, title: 'Mark fleet as seen (reset away baseline)', hint: '', group: 'View', run: () => markDigestSeen() });
  cmds.push({ id: 'view-activity', icon: Icon.bolt, title: 'Show selected session: Activity', hint: 'transcript', group: 'View', run: () => setCenterMode('session') });
  cmds.push({ id: 'diff', icon: Icon.diff, title: 'Toggle diff for selected session', hint: 'output ⇄ diff', group: 'View', run: () => setCenterMode(getState().centerMode === 'diff' ? 'session' : 'diff') });
  cmds.push({ id: 'view-terminal', icon: Icon.terminal, title: 'Attach the selected session terminal', hint: 'live output', group: 'View', run: () => setCenterMode('terminal') });
  cmds.push({ id: 'collapse', icon: Icon.layers, title: 'Toggle feed burst grouping', hint: 'declutter the feed', group: 'View', run: () => toggleFeedCollapse() });
  cmds.push({ id: 'trail', icon: Icon.pin, title: 'Open decision trail', hint: 'provenance-tagged audit', group: 'View', run: () => setRightTab('trail') });
  cmds.push({ id: 'clear', icon: Icon.close, title: 'Clear feed filters', hint: '', group: 'Filter', run: clearFilter });
  cmds.push({ id: 'help', icon: Icon.command, title: 'Keyboard shortcuts', hint: '?', group: 'View', run: () => setHelpOpen(true) });
  return cmds;
}

const RANK = { waiting: 0, working: 1, idle: 2, done: 3 };
function statusRank(s) {
  return RANK[s] ?? 9;
}
// A centered anchor for a palette-launched peek (no row element to anchor to).
function anchorRect() {
  return { right: Math.round(window.innerWidth * 0.3), top: Math.round(window.innerHeight * 0.22) };
}

function pid(id) {
  return id?.startsWith('sess-') ? id.slice(5) : id;
}

function score(cmd, q) {
  if (!q) return 1;
  const hay = `${cmd.title} ${cmd.hint} ${cmd.group}`.toLowerCase();
  const needle = q.toLowerCase();
  if (hay.includes(needle)) return 2;
  // loose subsequence match
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const onDispatch = () => { setPaletteOpen(true); setTimeout(() => setQ('dispatch '), 0); };
    window.addEventListener('cc:palette-dispatch', onDispatch);
    return () => window.removeEventListener('cc:palette-dispatch', onDispatch);
  }, []);

  const results = useMemo(() => {
    if (!open) return [];
    return buildCommands()
      .map((c) => ({ c, s: score(c, q.trim()) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 140)
      .map((x) => x.c);
  }, [open, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  if (!open) return null;

  const run = (c) => { setPaletteOpen(false); c.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) run(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setPaletteOpen(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm" onClick={() => setPaletteOpen(false)}>
      <div className="w-[min(620px,92vw)] rounded-xl border border-line bg-elevated shadow-2xl overflow-hidden cc-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 h-12 border-b border-line">
          <Icon.search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search actions — dispatch, attach, jump, memory, filter…"
            className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-faint"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-faint">No matching actions</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                data-active={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cx('w-full flex items-center gap-3 px-3 py-2 text-left', i === active ? 'bg-hover' : 'hover:bg-hover/50')}
              >
                <span className="text-faint shrink-0"><c.icon size={15} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-ink truncate">{c.title}</span>
                  {c.hint && <span className="block text-[11px] text-faint truncate font-mono">{c.hint}</span>}
                </span>
                <span className="text-[10px] text-faint uppercase tracking-wide shrink-0">{c.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
