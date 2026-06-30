// Order-independent session time metrics. Pure: no I/O, no `now` baked in.
//
// Records are NOT guaranteed to be in timestamp order: a transcript can carry a
// terminal status-fixing record stamped staler than the conversation body, and merged
// sidechain activity can interleave. So "first activity" and "last activity" are the
// MIN and MAX timestamps over all records — never the first/last array element. Driving
// age off the array order is exactly what produced negative ages.

export function sessionTimes(records) {
  let firstTs = null; // earliest timestamp (min) — when the session began
  let lastTs = null; // latest timestamp (max) — the most recent activity
  let terminalTs = null; // timestamp of the final record in file order — the status anchor
  for (const r of records || []) {
    const ts = r && r.ts;
    if (ts == null || Number.isNaN(ts)) continue;
    if (firstTs == null || ts < firstTs) firstTs = ts;
    if (lastTs == null || ts > lastTs) lastTs = ts;
    terminalTs = ts;
  }
  return { firstTs, lastTs, terminalTs };
}

// Elapsed milliseconds from a timestamp to `now`, clamped at 0 so clock skew or a
// future-stamped record renders as "0s" rather than a negative duration. Null in => null.
export function elapsedSince(ts, now) {
  if (ts == null || Number.isNaN(ts)) return null;
  return Math.max(0, now - ts);
}
