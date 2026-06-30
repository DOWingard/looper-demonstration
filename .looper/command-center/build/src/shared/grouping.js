// Group sessions under their real project directory. The grouping key is the record's
// `cwd` (authoritative); the on-disk directory name is only decoded as a fallback when
// a session has no cwd in any record. This is what makes the cwd-vs-dirname conflict
// fixture group under the cwd, not the decoded dir name. Pure.

import { decodeDirName, labelForCwd } from './pathenc.js';
import { aggregateStatus } from './status.js';

// Resolve the directory a session belongs to: prefer cwd, fall back to decoded name.
export function resolveSessionCwd(session) {
  if (session.cwd) return session.cwd;
  if (session.dirName) return decodeDirName(session.dirName);
  return '(unknown)';
}

export function groupSessions(sessions) {
  const groups = new Map();
  for (const s of sessions || []) {
    const cwd = resolveSessionCwd(s);
    if (!groups.has(cwd)) {
      groups.set(cwd, { cwd, label: labelForCwd(cwd), sessions: [] });
    }
    groups.get(cwd).sessions.push(s);
  }
  const out = [...groups.values()].map((g) => {
    const statuses = g.sessions.map((s) => s.status).filter(Boolean);
    const counts = statuses.reduce((acc, st) => ((acc[st] = (acc[st] || 0) + 1), acc), {});
    return {
      cwd: g.cwd,
      label: g.label,
      sessions: g.sessions,
      sessionCount: g.sessions.length,
      status: aggregateStatus(statuses),
      counts,
    };
  });
  // Lanes sort by urgency (groups needing the operator first), then by label.
  const rank = { waiting: 0, working: 1, idle: 2, done: 3 };
  out.sort((a, b) => (rank[a.status] - rank[b.status]) || a.label.localeCompare(b.label));
  return out;
}
