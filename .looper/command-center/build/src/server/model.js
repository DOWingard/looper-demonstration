// In-memory fleet model. Owns discovered sessions, the merged cross-session feed, and
// the byte/partial-line bookkeeping that lets the watcher parse only appended deltas.
// Emits 'feed' / 'session' / 'session-add' / 'session-remove' so the WS layer can push
// surgical updates (one session's delta never forces a full-tree re-read or re-render).

import { EventEmitter } from 'node:events';
import { inferStatus } from '../shared/status.js';
import { parseLines, kindOf } from '../shared/parser.js';
import { computeFileChanges } from '../shared/filechanges.js';
import { feedItemsForSession, sortFeed } from '../shared/feed.js';
import { sessionTimes, elapsedSince } from '../shared/sessiontime.js';
import { groupSessions } from '../shared/grouping.js';
import { labelForCwd } from '../shared/pathenc.js';
import { LIMITS, DEFAULT_STATUS_WINDOWS, STATUS } from '../shared/constants.js';

function lastWith(records, pred) {
  for (let i = records.length - 1; i >= 0; i--) if (pred(records[i])) return records[i];
  return null;
}
function lastToolName(records) {
  const r = lastWith(records, (x) => x.blocks?.some((b) => b.kind === 'tool_use'));
  if (!r) return null;
  const tb = [...r.blocks].reverse().find((b) => b.kind === 'tool_use');
  return tb ? tb.name : null;
}

export class FleetModel extends EventEmitter {
  constructor({ nowFn = Date.now, windows = DEFAULT_STATUS_WINDOWS } = {}) {
    super();
    this.sessions = new Map(); // key -> session
    this.partials = new Map(); // key -> buffered incomplete trailing line
    this.feed = []; // merged, ascending by ts, bounded
    this.nowFn = nowFn;
    this.windows = windows;
    this.totalFiles = 0;
    this.deferredCount = 0;
  }

  now() {
    return this.nowFn();
  }

  summarize(session) {
    const now = this.now();
    const records = session.records || [];
    const last = records[records.length - 1] || null;
    // Order-independent: firstTs is the earliest record, terminalTs the final record in
    // file order (the status anchor). Driving age off array position rendered a negative
    // age whenever a terminal record was stamped staler than the conversation body.
    const { firstTs, terminalTs } = sessionTimes(records);
    const lastTs = last?.ts ?? terminalTs;
    const status =
      session.kind === 'pty' ? STATUS.WORKING : inferStatus(last, now, this.windows);
    // lastKind + lastTs let the client recompute live status as time passes, without a
    // round-trip (a working session with no new records drifts to idle/done on its own).
    const lastKind = session.kind === 'pty' ? 'tool_use' : last ? kindOf(last) : 'other';
    const fc = computeFileChanges(records);
    return {
      key: session.key,
      sessionId: session.sessionId,
      cwd: session.cwd,
      dirName: session.dirName,
      dirLabel: labelForCwd(session.cwd),
      branch: session.branch || null,
      status,
      lastKind,
      lastTs,
      firstTs,
      ageMs: elapsedSince(firstTs, now),
      sinceMs: elapsedSince(lastTs, now),
      activeTool: lastToolName(records),
      additions: fc.totals.additions,
      deletions: fc.totals.deletions,
      filesChanged: fc.totals.files,
      malformed: session.malformed || 0,
      recordCount: records.length,
      hasSidechain: records.some((r) => r.isSidechain),
      kind: session.kind || 'transcript',
    };
  }

  _pushFeedItems(items) {
    if (items.length === 0) return [];
    this.feed.push(...items);
    this.feed = sortFeed(this.feed);
    if (this.feed.length > LIMITS.FEED_MAX) {
      this.feed = this.feed.slice(this.feed.length - LIMITS.FEED_MAX);
    }
    return items;
  }

  addSession(session, { silent = false } = {}) {
    this.sessions.set(session.key, session);
    this.partials.set(session.key, '');
    const items = feedItemsForSession({ ...session, key: session.key });
    this._pushFeedItems(items);
    const summary = this.summarize(session);
    if (!silent) {
      this.emit('session-add', summary);
      if (items.length) this.emit('feed', items);
    }
    return summary;
  }

  // Register a live pty-only session (dispatched from the UI). It has no transcript file
  // but appears in its directory's group and is attachable like any other session.
  addPtySession({ key, sessionId, cwd }) {
    const session = {
      key,
      sessionId,
      cwd,
      dirName: null,
      branch: null,
      records: [],
      malformed: 0,
      fileSize: 0,
      kind: 'pty',
    };
    return this.addSession(session);
  }

  removeSession(key) {
    if (!this.sessions.has(key)) return;
    this.sessions.delete(key);
    this.partials.delete(key);
    this.feed = this.feed.filter((i) => i.sessionKey !== key);
    this.emit('session-remove', { key });
  }

  // Apply an appended delta (raw text) to a session. Buffers an incomplete trailing
  // line across deltas. Returns the new summary; emits surgical update events.
  applyDelta(key, text) {
    const session = this.sessions.get(key);
    if (!session) return null;
    const prev = this.partials.get(key) || '';
    const { records: newRecords, partial } = parseLines(prev + text);
    this.partials.set(key, partial);
    if (newRecords.length === 0) {
      // still emit a summary in case malformed/partial counters changed — cheap
      return this.summarize(session);
    }
    session.records.push(...newRecords);
    if (session.records.length > LIMITS.SESSION_RECORDS_MAX) {
      session.records = session.records.slice(session.records.length - LIMITS.SESSION_RECORDS_MAX);
    }
    // refresh cwd/branch if newly learned
    const cwd = lastWith(newRecords, (r) => r.cwd)?.cwd;
    if (cwd) session.cwd = cwd;
    const branch = lastWith(newRecords, (r) => r.gitBranch)?.gitBranch;
    if (branch) session.branch = branch;

    const items = feedItemsForSession({ ...session, key, records: newRecords });
    this._pushFeedItems(items);
    const summary = this.summarize(session);
    this.emit('session', summary);
    if (items.length) this.emit('feed', items);
    return summary;
  }

  getSession(key) {
    return this.sessions.get(key) || null;
  }

  // Full per-session detail for the transcript view (blocks + tool-result pairing).
  getSessionDetail(key) {
    const s = this.sessions.get(key);
    if (!s) return null;
    const summary = this.summarize(s);
    const fc = computeFileChanges(s.records);
    return {
      ...summary,
      records: s.records,
      files: fc.files,
    };
  }

  allSummaries() {
    return [...this.sessions.values()].map((s) => this.summarize(s));
  }

  snapshot() {
    const summaries = this.allSummaries();
    const groups = groupSessions(summaries);
    return {
      groups,
      feed: this.feed,
      serverNow: this.now(),
      totalFiles: this.totalFiles,
      deferredCount: this.deferredCount,
      sessionCount: summaries.length,
    };
  }
}
