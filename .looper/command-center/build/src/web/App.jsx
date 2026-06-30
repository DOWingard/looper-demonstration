// App shell: the three co-visible surfaces (sessions | feed+session | context), a
// persistent top bar and command legend, global keyboard control, resizable panels,
// and the overlays (command palette, away-digest, help, toast, connection banner).

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  useStore, getState, setPanels, setPaletteOpen, setDigestOpen, setHelpOpen,
  setCenterMode, setRightTab, selectSession, liveGroups, clientNow, setFilter,
  setDispatchOpen, closeComposer, closePeek, toggleFeedCollapse,
} from './lib/store.js';
import { cx, statusMeta, formatAgo } from './lib/util.js';
import { Icon } from './components/icons.jsx';
import { Button, IconButton, Kbd, Badge, Dot } from './components/ui.jsx';
import { DirSidebar, SessionStrip } from './components/DirSidebar.jsx';
import { Feed } from './components/Feed.jsx';
import { SessionDetail } from './components/SessionDetail.jsx';
import { RightPanel } from './components/RightPanel.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import { Digest } from './components/Digest.jsx';
import { HelpOverlay } from './components/Help.jsx';
import { DispatchDialog, Composer } from './components/Dialogs.jsx';
import { flatSessionOrder } from './components/DirSidebar.jsx';

function useViewport() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w >= 1080 ? 'wide' : w >= 760 ? 'medium' : 'narrow';
}

function Resizer({ axis, onDelta, onEnd }) {
  const ref = useRef(null);
  const onDown = (e) => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    ref.current?.setPointerCapture(e.pointerId);
    ref.current?.classList.add('active');
    let last = start;
    const move = (ev) => {
      const cur = axis === 'x' ? ev.clientX : ev.clientY;
      onDelta(cur - last);
      last = cur;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ref.current?.classList.remove('active');
      onEnd && onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      className={cx('cc-handle shrink-0 z-10', axis === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize')}
    />
  );
}

function ConnectionBanner() {
  const conn = useStore((s) => s.connection);
  if (conn === 'open') return null;
  const map = {
    connecting: { t: 'Connecting…', c: 'var(--color-idle)' },
    reconnecting: { t: 'Connection lost — reconnecting…', c: 'var(--color-waiting)' },
    closed: { t: 'Disconnected', c: 'var(--color-danger)' },
  };
  const m = map[conn] || map.reconnecting;
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 cc-fade-in flex items-center gap-2 px-3 h-7 rounded-full border border-line bg-elevated shadow-lg text-[12px]" style={{ color: m.c }}>
      <span className="w-2 h-2 rounded-full cc-dot-working" style={{ background: m.c }} />
      {m.t}
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 cc-fade-in px-3.5 h-8 flex items-center rounded-lg bg-elevated border border-line shadow-xl text-[12px] text-ink">
      <Icon.check size={14} className="text-working mr-2" />
      {toast.msg}
    </div>
  );
}

function TopBar({ view }) {
  const narrow = view === 'narrow';
  const groups = liveGroups();
  const counts = groups.reduce(
    (a, g) => {
      for (const s of g.sessions) a[s.status] = (a[s.status] || 0) + 1;
      a.total += g.sessions.length;
      return a;
    },
    { total: 0 }
  );
  const sinceCount = useStore((s) => {
    const b = s.digestBaseline || 0;
    return s.feed.filter((i) => (i.ts || 0) > b).length;
  });
  const totalFiles = useStore((s) => s.totalFiles);
  const waiting = counts.waiting || 0;
  return (
    <header className="flex items-center gap-2 sm:gap-3 h-12 px-2 sm:px-3 shrink-0 border-b border-line bg-surface min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 shrink">
        <div className="grid place-items-center w-7 h-7 rounded-md bg-brand/15 text-brand shrink-0">
          <Icon.layers size={16} />
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-[13px] font-semibold tracking-tight truncate">Command Center</div>
          {!narrow && <div className="text-[10px] text-faint -mt-0.5 truncate">{counts.total} sessions · {groups.length} dirs · {totalFiles} transcripts</div>}
        </div>
      </div>

      {/* Status triage. At narrow only the "needs you" signal stays (d1) — the rest is in
          the Sessions tab — so the bar never overflows. */}
      <div className="flex items-center gap-1.5 ml-1 shrink-0">
        {waiting > 0 && (
          <Badge color="var(--color-waiting)" dot className="h-[22px] px-2 text-[11px]">{waiting}{narrow ? '' : ' need you'}</Badge>
        )}
        {!narrow && counts.working > 0 && <Badge color="var(--color-working)" dot className="h-[22px] px-2 text-[11px]">{counts.working} working</Badge>}
        {!narrow && counts.idle > 0 && <Badge color="var(--color-idle)" className="h-[22px] px-2 text-[11px]">{counts.idle} idle</Badge>}
      </div>

      <div className="flex-1 min-w-0" />

      <Button variant="outline" size="md" onClick={() => setDigestOpen(true)} className="relative shrink-0" title="Since you last looked — away digest">
        <Icon.away size={14} />
        {!narrow && 'Since you looked'}
        {sinceCount > 0 && (
          <span className="ml-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-brand text-[#05203f] text-[10px] font-bold">{sinceCount}</span>
        )}
      </Button>
      <Button variant="primary" size="md" onClick={() => { setPaletteOpen(true); }} className="shrink-0" title="Dispatch a session / command palette (⌘K)">
        <Icon.command size={13} /> {narrow ? '⌘K' : 'Dispatch / ⌘K'}
      </Button>
      <ConnPill />
    </header>
  );
}

function ConnPill() {
  const conn = useStore((s) => s.connection);
  const c = conn === 'open' ? 'var(--color-working)' : conn === 'reconnecting' ? 'var(--color-waiting)' : 'var(--color-danger)';
  return (
    <div title={`WebSocket: ${conn}`} className="flex items-center gap-1.5 pl-1 pr-1">
      <span className={cx('w-2 h-2 rounded-full', conn !== 'open' && 'cc-dot-working')} style={{ background: c }} />
    </div>
  );
}

function Legend() {
  const items = [
    ['⌘K', 'palette'],
    ['/', 'filter feed'],
    ['j / k', 'move'],
    ['↵', 'open'],
    ['a', 'attach'],
    ['d', 'diff'],
    ['p', 'pin'],
    ['m', 'memory'],
    ['c', 'group feed'],
    ['g', 'away digest'],
    ['n', 'dispatch'],
    ['?', 'help'],
  ];
  return (
    <footer className="flex items-center gap-3 h-8 px-3 shrink-0 border-t border-line bg-surface overflow-x-auto">
      {items.map(([k, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-faint whitespace-nowrap">
          <Kbd>{k}</Kbd>
          {label}
        </span>
      ))}
    </footer>
  );
}

export function App() {
  const view = useViewport();
  const panels = useStore((s) => s.panels);
  const [rightOpen, setRightOpen] = useState(false);

  const moveSelection = useCallback((dir) => {
    const order = flatSessionOrder();
    if (!order.length) return;
    const cur = getState().selectedKey;
    let idx = order.findIndex((k) => k === cur);
    idx = idx < 0 ? (dir > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, idx + dir));
    const key = order[idx];
    const s = getState().sessionsByKey[key];
    selectSession(key, s?.cwd);
    if (getState().centerMode === 'feed') setCenterMode('session');
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest?.('[data-terminal]'));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(!getState().paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        const st = getState();
        if (st.composer) closeComposer();
        else if (st.dispatchOpen) setDispatchOpen(false);
        else if (st.paletteOpen) setPaletteOpen(false);
        else if (st.digestOpen) setDigestOpen(false);
        else if (st.helpOpen) setHelpOpen(false);
        else if (st.peekSticky) closePeek();
        return;
      }
      if (typing || mod) return;
      switch (e.key) {
        case '/':
          e.preventDefault();
          setCenterMode('feed');
          requestAnimationFrame(() => document.getElementById('cc-feed-filter')?.focus());
          break;
        case 'j': e.preventDefault(); moveSelection(1); break;
        case 'k': e.preventDefault(); moveSelection(-1); break;
        case 'Enter': if (getState().selectedKey) setCenterMode('session'); break;
        case 'a': if (getState().selectedKey) setCenterMode('terminal'); break;
        case 'd': if (getState().selectedKey) setCenterMode(getState().centerMode === 'diff' ? 'session' : 'diff'); break;
        case 'm': setRightTab('memory'); if (view !== 'wide') setRightOpen(true); break;
        case 'p': window.dispatchEvent(new CustomEvent('cc:pin-selected')); break;
        case 'g': setDigestOpen(true); break;
        case 'n': e.preventDefault(); setDispatchOpen(true); break;
        case '?': setHelpOpen(true); break;
        case 'c': toggleFeedCollapse(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveSelection, view]);

  const centerSplit = Math.min(0.8, Math.max(0.2, panels.centerSplit));

  const sidebar = <DirSidebar onPick={() => {}} />;
  const center = (
    <div className="flex flex-col min-h-0 h-full">
      <div style={{ flexBasis: `${centerSplit * 100}%` }} className="min-h-0 flex flex-col">
        <Feed />
      </div>
      <Resizer axis="y" onDelta={(d) => setPanels({ centerSplit: clamp(centerSplit + d / window.innerHeight, 0.2, 0.8) })} />
      <div className="flex-1 min-h-0 flex flex-col">
        <SessionDetail />
      </div>
    </div>
  );
  const right = <RightPanel onClose={() => setRightOpen(false)} showClose={view !== 'wide'} />;

  return (
    <div className="relative h-full flex flex-col bg-bg text-ink">
      <TopBar view={view} />
      <ConnectionBanner />

      {view === 'narrow' ? (
        // Under responsive pressure the three surfaces stay co-visible rather than
        // collapsing to single-surface tabs (d9): the fleet/triage strip and the
        // activity surface are always on screen together, with context one tap away as a
        // bottom sheet — so operating on one session never hides what the others need.
        <>
          <SessionStrip />
          <div className="flex-1 min-h-0">{center}</div>
          <button
            onClick={() => setRightOpen((o) => !o)}
            className={cx('shrink-0 flex items-center justify-center gap-1.5 h-8 border-t border-line text-[11px]', rightOpen ? 'bg-hover text-ink' : 'bg-surface text-faint hover:text-ink')}
            title="Toggle the context panel (changes · memory · trail)"
          >
            <Icon.diff size={13} /> Context <Icon.chevron size={13} className={cx('transition-transform', rightOpen ? '-rotate-90' : 'rotate-90')} />
          </button>
          {rightOpen && (
            <div className="absolute left-0 right-0 bottom-8 top-[40%] z-40 border-t border-line shadow-2xl bg-panel cc-fade-in">{right}</div>
          )}
        </>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div style={{ width: panels.leftW }} className="shrink-0 min-w-[220px] border-r border-line">{sidebar}</div>
          <Resizer axis="x" onDelta={(d) => setPanels({ leftW: clamp(panels.leftW + d, 220, 460) })} />
          <div className="flex-1 min-w-0">{center}</div>
          {view === 'wide' ? (
            <>
              <Resizer axis="x" onDelta={(d) => setPanels({ rightW: clamp(panels.rightW - d, 280, 560) })} />
              <div style={{ width: panels.rightW }} className="shrink-0 border-l border-line">{right}</div>
            </>
          ) : (
            <>
              <button onClick={() => setRightOpen(true)} className="shrink-0 w-9 border-l border-line bg-surface grid place-items-center text-faint hover:text-ink" title="Open context panel">
                <Icon.chevron size={16} className="rotate-180" />
              </button>
              {rightOpen && (
                <div className="absolute right-0 top-12 bottom-8 w-[360px] z-40 border-l border-line shadow-2xl bg-panel cc-fade-in">{right}</div>
              )}
            </>
          )}
        </div>
      )}

      <Legend />
      <Toast />
      <CommandPalette />
      <DispatchDialog />
      <Composer />
      <Digest />
      <HelpOverlay />
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
