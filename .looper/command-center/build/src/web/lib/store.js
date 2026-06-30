// Central client store: a tiny external store + selectors, a self-healing WebSocket,
// REST actions, and localStorage persistence. Client and server share the same pure
// grouping/status logic so lanes and statuses are identical on both sides; the client
// recomputes status live from lastKind + lastTs so rows age without a round-trip.

import { useSyncExternalStore, useRef } from 'react';
import { groupSessions } from '../../shared/grouping.js';
import { statusFromKindAge } from '../../shared/status.js';
import { PERSIST_FIELDS, pickPersisted, mergePersisted } from '../../shared/persist.js';

const PERSIST_KEY = 'cc.workspace.v1';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// The full default workspace; the persisted blob is layered over it on load (c3). Exactly
// PERSIST_FIELDS round-trips, verified by the persist module's tests.
const WORKSPACE_DEFAULTS = {
  selectedKey: null,
  selectedCwd: null,
  centerMode: 'feed', // feed | session | diff | terminal
  rightTab: 'changes', // changes | memory | trail
  memoryScope: 'dir', // dir | global
  filter: { dir: null, session: null, type: null, text: '' },
  panels: { leftW: 290, rightW: 360, centerSplit: 0.46 },
  attachIntentKey: null,
  feedCollapse: true, // group rapid same-session bursts (d8)
};

const initial = {
  connection: 'connecting',
  serverNow: Date.now(),
  nowOffset: 0,
  tick: 0,
  sessionsByKey: {},
  feed: [],
  memoryKeys: [],
  sessionCmd: 'claude',
  totalFiles: 0,
  deferredCount: 0,
  ...mergePersisted(WORKSPACE_DEFAULTS, loadPersisted()),
  paletteOpen: false,
  digestOpen: false,
  helpOpen: false,
  dispatchOpen: false, // inline dispatch dialog (replaces window.prompt)
  composer: null, // inline note / pin-with-rationale composer (replaces window.prompt)
  peek: null,
  peekSticky: false,
  sessionDetail: null,
  memory: { scope: null, cwd: null, content: '', dirty: false, loading: false, externalChange: false },
  audit: [],
  digest: null,
  digestBaseline: 0,
  toast: null,
};

let state = initial;
const subs = new Set();

function emit() {
  subs.forEach((f) => f());
}
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  emit();
}
export function getState() {
  return state;
}
function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Selector hook that only re-renders when the selected slice changes.
export function useStore(selector, isEqual = Object.is) {
  const last = useRef({ has: false, val: undefined });
  const getSnap = () => {
    const next = selector(state);
    if (last.current.has && isEqual(last.current.val, next)) return last.current.val;
    last.current = { has: true, val: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}

export function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- persistence ----
// Debounced write of exactly the whitelisted workspace slice (c3). pickPersisted is the
// single tested source of truth for what survives reload.
let persistTimer = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(pickPersisted(state)));
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, 150);
}
subscribe(persist);

// ---- derived: live status + grouped lanes ----
export function clientNow() {
  return Date.now() + state.nowOffset;
}
export function liveStatus(s, now = clientNow()) {
  if (s.kind === 'pty') return 'working';
  if (s.lastTs == null) return 'idle';
  return statusFromKindAge(s.lastKind, now - s.lastTs);
}
// Live, clamped time-since-last-change and session age, recomputed from the summary's
// firstTs/lastTs each tick so the row metadata advances without a round-trip and can
// never render a negative duration (c7).
export function liveSince(s, now = clientNow()) {
  return s.lastTs == null ? null : Math.max(0, now - s.lastTs);
}
export function liveAge(s, now = clientNow()) {
  return s.firstTs == null ? null : Math.max(0, now - s.firstTs);
}
export function liveSessions() {
  const now = clientNow();
  return Object.values(state.sessionsByKey).map((s) => ({ ...s, status: liveStatus(s, now) }));
}
export function liveGroups() {
  return groupSessions(liveSessions());
}

// ---- WebSocket with auto-reconnect ----
let ws = null;
let retry = 0;
let lastRecvAt = 0; // for the keepalive watchdog
const ptyListeners = new Map(); // id -> Set<fn>

export function onPty(id, fn) {
  if (!ptyListeners.has(id)) ptyListeners.set(id, new Set());
  ptyListeners.get(id).add(fn);
  return () => ptyListeners.get(id)?.delete(fn);
}
function emitPty(id, msg) {
  ptyListeners.get(id)?.forEach((fn) => fn(msg));
}
export function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// On reload, the persisted workspace (selection, center mode, right tab, panel sizes,
// attach intent) is restored into state, but the selection's data side-effects are not.
// Re-run them once the first snapshot lands so reload restores the *working* context:
// the selected session's transcript, its directory memory, and — if the operator left a
// terminal attached (centerMode/attachIntent persisted) — the live terminal reattaches
// on render. A persisted selection that no longer exists is cleared so the UI isn't stuck.
function rehydrateFromPersisted() {
  const st = state;
  const key = st.selectedKey;
  if (key && st.sessionsByKey[key]) {
    const cwd = st.selectedCwd || st.sessionsByKey[key].cwd;
    if (st.selectedCwd !== cwd) setState({ selectedCwd: cwd });
    loadSessionDetail(key);
    if (st.rightTab === 'memory') loadMemory(st.memoryScope, cwd);
    else if (cwd && st.memoryScope === 'dir') loadMemory('dir', cwd);
  } else if (key) {
    setState({ selectedKey: null, selectedCwd: null, attachIntentKey: null });
  }
}

function applySnapshot(snap, sessionCmd, digestBaseline) {
  const map = {};
  for (const g of snap.groups) for (const s of g.sessions) map[s.key] = s;
  setState({
    sessionsByKey: map,
    feed: snap.feed || [],
    memoryKeys: snap.memory?.keys || [],
    totalFiles: snap.totalFiles || 0,
    deferredCount: snap.deferredCount || 0,
    serverNow: snap.serverNow,
    nowOffset: (snap.serverNow || Date.now()) - Date.now(),
    sessionCmd: sessionCmd || state.sessionCmd,
    digestBaseline: digestBaseline ?? state.digestBaseline,
  });
}

export function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  setState({ connection: state.connection === 'connecting' ? 'connecting' : 'reconnecting' });
  ws.onopen = () => {
    retry = 0;
    lastRecvAt = Date.now();
    setState({ connection: 'open' });
  };
  ws.onmessage = (ev) => {
    lastRecvAt = Date.now();
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === 'pong') return;
    switch (m.type) {
      case 'hello':
        applySnapshot(m.snapshot, m.sessionCmd);
        rehydrateFromPersisted();
        refreshSidecars();
        break;
      case 'feed':
        appendFeed(m.items);
        break;
      case 'session':
      case 'session-add':
        upsertSession(m.summary);
        break;
      case 'session-remove':
        removeSession(m.key);
        break;
      case 'pty.data':
      case 'pty.exit':
      case 'pty.attached':
        emitPty(m.id, m);
        break;
      default:
        break;
    }
  };
  ws.onclose = () => {
    setState({ connection: 'reconnecting' });
    retry += 1;
    const delay = Math.min(4000, 400 * 2 ** Math.min(retry, 4));
    setTimeout(connectWs, delay);
  };
  ws.onerror = () => ws && ws.close();
}

function appendFeed(items) {
  if (!items || !items.length) return;
  const merged = state.feed.concat(items);
  merged.sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id < b.id ? -1 : 1));
  const capped = merged.length > 1200 ? merged.slice(merged.length - 1200) : merged;
  setState({ feed: capped });
}
function upsertSession(summary) {
  setState((st) => ({ sessionsByKey: { ...st.sessionsByKey, [summary.key]: summary } }));
}
function removeSession(key) {
  setState((st) => {
    const m = { ...st.sessionsByKey };
    delete m[key];
    return { sessionsByKey: m };
  });
}

// ---- REST ----
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function refreshSidecars() {
  try {
    const [audit, digestRes] = await Promise.all([api('/api/audit'), api('/api/digest')]);
    setState({ audit: audit.items || [], digest: digestRes.digest, digestBaseline: digestRes.baseline || 0 });
  } catch {
    /* sidecars are best-effort */
  }
}

export async function loadSessionDetail(key) {
  if (!key) return;
  setState({ sessionDetail: { ...(state.sessionDetail || {}), loading: true, key } });
  try {
    const detail = await api(`/api/session?key=${encodeURIComponent(key)}`);
    setState({ sessionDetail: { ...detail, loading: false } });
  } catch {
    setState({ sessionDetail: { key, loading: false, error: true, records: [], files: [] } });
  }
}

export async function loadMemory(scope, cwd) {
  setState({ memory: { ...state.memory, loading: true } });
  const q = scope === 'global' ? 'scope=global' : `scope=dir&cwd=${encodeURIComponent(cwd)}`;
  try {
    const r = await api(`/api/memory?${q}`);
    setState({ memory: { scope, cwd: scope === 'global' ? null : cwd, content: r.content, dirty: false, loading: false } });
  } catch {
    setState({ memory: { scope, cwd, content: '', dirty: false, loading: false } });
  }
}

export async function saveMemory(content) {
  const { scope, cwd } = state.memory;
  const body = { scope: scope === 'global' ? 'global' : 'dir', cwd, content, mode: 'replace', note: false };
  const r = await api('/api/memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  setState({ memory: { ...state.memory, content: r.content, dirty: false }, memoryKeys: state.memoryKeys });
  toast('Memory saved');
  await Promise.all([refreshMemoryKeys(), refreshSidecars()]);
}

export async function appendMemoryNote(scope, cwd, note) {
  const body = { scope: scope === 'global' ? 'global' : 'dir', cwd, content: note, mode: 'append', note: true };
  await api('/api/memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  toast('Note written to memory');
  await refreshSidecars();
  if (state.memory.scope === scope && (scope === 'global' || state.memory.cwd === cwd)) await loadMemory(scope, cwd);
}

async function refreshMemoryKeys() {
  try {
    const r = await api('/api/state');
    setState({ memoryKeys: r.memory?.keys || [] });
  } catch {
    /* ignore */
  }
}

export async function pinFeedItem(item, { scope = 'dir', note = '' } = {}) {
  const body = {
    scope,
    cwd: scope === 'global' ? null : item.cwd,
    tool: item.tool,
    summary: item.summary,
    sessionKey: item.sessionKey,
    sessionId: item.sessionId,
    note,
  };
  await api('/api/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  toast(`Pinned to ${scope === 'global' ? 'global' : item.dirLabel} memory`);
  await refreshSidecars();
  if (state.memory.scope && (state.memory.scope === scope)) await loadMemory(state.memory.scope, state.memory.cwd);
}

export async function dispatchSession(cwd) {
  const r = await api('/api/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd }) });
  upsertSession(r.summary);
  selectSession(r.key, cwd);
  setState({ centerMode: 'terminal', attachIntentKey: r.key });
  toast(`Dispatched into ${cwd}`);
  await refreshSidecars();
  return r;
}

export async function markDigestSeen() {
  try {
    const r = await api('/api/digest/seen', { method: 'POST' });
    setState({ digestBaseline: r.baseline });
    await refreshSidecars();
  } catch {
    /* ignore */
  }
}

// ---- actions ----
export function selectSession(key, cwd) {
  const s = state.sessionsByKey[key];
  const dir = cwd || s?.cwd || null;
  setState({ selectedKey: key, selectedCwd: dir });
  if (key) loadSessionDetail(key);
  if (dir && state.memoryScope === 'dir') loadMemory('dir', dir);
}
export function setCenterMode(mode) {
  setState({ centerMode: mode });
  if (mode === 'terminal') setState({ attachIntentKey: state.selectedKey });
}
export function setRightTab(tab) {
  setState({ rightTab: tab });
  if (tab === 'memory') {
    const scope = state.memoryScope;
    loadMemory(scope, state.selectedCwd);
  }
  if (tab === 'trail') refreshSidecars();
}
export function setMemoryScope(scope) {
  setState({ memoryScope: scope });
  loadMemory(scope, state.selectedCwd);
}
export function setFilter(patch) {
  setState({ filter: { ...state.filter, ...patch } });
}
export function clearFilter() {
  setState({ filter: { dir: null, session: null, type: null, text: '' } });
}
export function setPanels(patch) {
  setState({ panels: { ...state.panels, ...patch } });
}
export function setPaletteOpen(v) {
  setState({ paletteOpen: v });
}
export function setDigestOpen(v) {
  setState({ digestOpen: v });
  if (v) refreshSidecars();
}
export function setHelpOpen(v) {
  setState({ helpOpen: v });
}
// Sticky peek: hover sets a transient peek; clicking the peek affordance pins it open so
// it can be read without losing the current selection (c10). A transient hover never
// overrides a sticky peek.
export function setPeek(p, { sticky = false } = {}) {
  if (!sticky && state.peekSticky && p == null) return; // hover-leave shouldn't close a pinned peek
  setState({ peek: p, peekSticky: p == null ? false : sticky || (p != null && state.peekSticky) });
}
export function closePeek() {
  setState({ peek: null, peekSticky: false });
}
export function setFeedCollapse(v) {
  setState({ feedCollapse: v });
}
export function toggleFeedCollapse() {
  setState({ feedCollapse: !state.feedCollapse });
}
export function setDispatchOpen(v) {
  setState({ dispatchOpen: v });
}
// One reusable inline composer drives both "write a note into a dir's memory" and
// "pin an action with a rationale" — replacing the two removed window.prompt() calls and
// tightening the connective feed → memory hop (o1, o4).
export function openComposer(cfg) {
  setState({ composer: { mode: 'note', scope: 'dir', draft: '', ...cfg } });
}
export function closeComposer() {
  setState({ composer: null });
}
export async function submitComposer(draft) {
  const c = state.composer;
  if (!c) return;
  const text = String(draft || '').trim();
  closeComposer();
  if (!text) return;
  if (c.mode === 'pin') await pinFeedItem(c.item, { scope: c.scope, note: text });
  else await appendMemoryNote(c.scope, c.scope === 'global' ? null : c.cwd, text);
}
let toastTimer = null;
export function toast(msg) {
  setState({ toast: { msg, id: Date.now() } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 2600);
}

// 1 Hz tick drives live time-since / status drift without server chatter.
setInterval(() => setState((st) => ({ tick: st.tick + 1 })), 1000);

// Keepalive watchdog: a browser WebSocket does not surface a silently dropped
// connection (no close event without traffic). We ping when quiet and, if no message
// comes back, force-close so onclose triggers the visible reconnect flow — covering a
// network-level drop as well as a server restart.
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const quiet = Date.now() - lastRecvAt;
  if (quiet > 6000) {
    try { ws.close(); } catch { /* noop */ }
  } else if (quiet > 2500) {
    try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* noop */ }
  }
}, 2000);
