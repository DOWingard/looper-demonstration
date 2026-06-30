// Per-session status inference, richer than running/done. Derived from the freshest
// record's kind plus its recency. Pure and parameterized by `now` and the windows so
// it is deterministic under test. See DEFAULT_STATUS_WINDOWS for the bands.

import { STATUS, DEFAULT_STATUS_WINDOWS } from './constants.js';
import { kindOf } from './parser.js';

// Infer from an already-classified last-record kind and its age in ms.
export function statusFromKindAge(lastKind, ageMs, windows = DEFAULT_STATUS_WINDOWS) {
  const { WORKING_MS, DONE_MS } = windows;
  if (ageMs == null || Number.isNaN(ageMs)) return STATUS.IDLE;
  // Stale dominates: anything past the done window with no fresher record is done,
  // even a trailing assistant question nobody answered.
  if (ageMs >= DONE_MS) return STATUS.DONE;
  switch (lastKind) {
    case 'tool_use':
    case 'tool_result':
      return ageMs < WORKING_MS ? STATUS.WORKING : STATUS.IDLE;
    case 'user':
      // The human just spoke; the agent is (about to be) active.
      return ageMs < WORKING_MS ? STATUS.WORKING : STATUS.IDLE;
    case 'assistant_text':
      // Ended its turn with prose and nobody has replied => waiting for input.
      return STATUS.WAITING;
    default:
      return STATUS.IDLE;
  }
}

// Infer from a session's freshest record. `lastRecord` is a normalized record.
export function inferStatus(lastRecord, now = Date.now(), windows = DEFAULT_STATUS_WINDOWS) {
  if (!lastRecord || lastRecord.ts == null) return STATUS.IDLE;
  const ageMs = now - lastRecord.ts;
  return statusFromKindAge(kindOf(lastRecord), ageMs, windows);
}

// Rank used to bubble the sessions that most need the operator to the top.
// waiting-for-input is the most urgent (the human is the bottleneck).
export const STATUS_RANK = {
  [STATUS.WAITING]: 0,
  [STATUS.WORKING]: 1,
  [STATUS.IDLE]: 2,
  [STATUS.DONE]: 3,
};

// Aggregate a group's status from its sessions' statuses (most urgent wins).
export function aggregateStatus(statuses) {
  if (!statuses || statuses.length === 0) return STATUS.DONE;
  let best = STATUS.DONE;
  for (const s of statuses) {
    if (STATUS_RANK[s] < STATUS_RANK[best]) best = s;
  }
  return best;
}
