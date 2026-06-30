// Collapse runs of consecutive feed items from the SAME session that occur within a
// short time window into a single "burst" row, so one chatty session cannot flood the
// unified feed at fleet scale (d8). Pure.
//
// Operates on items in their already-sorted display order. Only same-session runs of at
// least MIN_BURST collapse, so isolated actions and cross-session interleaving stay
// first-class — the fleet feed's chronological merge and main-vs-subagent distinction
// are preserved (bursts are per-session; a sidechain is its own session key).

export const BURST_WINDOW_MS = 45 * 1000;
export const MIN_BURST = 4;

export function groupFeedRows(items, opts = {}) {
  const window = opts.window ?? BURST_WINDOW_MS;
  const min = opts.min ?? MIN_BURST;
  const collapse = opts.collapse ?? true;
  if (!collapse) return (items || []).map((item) => ({ type: 'item', item }));

  const rows = [];
  let run = [];
  const flush = () => {
    if (run.length >= min) {
      rows.push({ type: 'burst', sessionKey: run[0].sessionKey, items: run.slice() });
    } else {
      for (const it of run) rows.push({ type: 'item', item: it });
    }
    run = [];
  };
  for (const it of items || []) {
    if (run.length === 0) {
      run.push(it);
      continue;
    }
    const prev = run[run.length - 1];
    const sameSession = it.sessionKey === prev.sessionKey;
    const close = Math.abs((prev.ts ?? 0) - (it.ts ?? 0)) <= window;
    if (sameSession && close) run.push(it);
    else {
      flush();
      run.push(it);
    }
  }
  flush();
  return rows;
}
