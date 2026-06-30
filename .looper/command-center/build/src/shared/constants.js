// Shared tuning constants. Status windows are exported so they can be overridden
// per-call in tests and from the server (env), keeping the pure inference function
// deterministic and parameterizable.

export const STATUS = {
  WORKING: 'working',
  WAITING: 'waiting', // waiting-for-input (the agent ended its turn, human's move)
  IDLE: 'idle',
  DONE: 'done',
};

// A session is "working" only if its freshest record is recent tool activity.
// Past DONE_MS with no fresher activity it is considered stale/done. The band in
// between (tool activity, but not recent) reads as idle.
export const DEFAULT_STATUS_WINDOWS = {
  WORKING_MS: 5 * 60 * 1000, // 5 min: recent tool activity => working (headroom for fixture drift)
  DONE_MS: 30 * 60 * 1000, // 30 min: stale => done
};

// Feed/transcript bounds keep memory and the wire bounded at fleet scale.
export const LIMITS = {
  FEED_MAX: 1000, // server keeps at most this many merged feed items
  TAIL_BYTES: 64 * 1024, // initial per-file tail window (never full-history parse)
  SESSION_RECORDS_MAX: 4000, // per-session in-memory record cap
  PTY_SCROLLBACK_BYTES: 256 * 1024, // per-pty replay buffer
};
