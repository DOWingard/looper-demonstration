// Workspace persistence contract (c3). The single source of truth for which slice of the
// client store survives a reload: selection, current directory, panel sizes, feed filters,
// center/right view, memory scope, attach intent and the feed-collapse toggle. Pure so the
// "what is restored across reload" contract is testable in isolation, separate from
// localStorage I/O.

export const PERSIST_FIELDS = [
  'selectedKey',
  'selectedCwd',
  'centerMode',
  'rightTab',
  'memoryScope',
  'filter',
  'panels',
  'attachIntentKey',
  'feedCollapse',
];

// Project the live state down to exactly the persisted workspace fields.
export function pickPersisted(state, fields = PERSIST_FIELDS) {
  const out = {};
  for (const f of fields) if (state && state[f] !== undefined) out[f] = state[f];
  return out;
}

// Restore by layering a persisted blob over the defaults: present whitelisted fields win,
// missing ones keep their default, and any non-whitelisted key in the blob is ignored.
export function mergePersisted(defaults, persisted, fields = PERSIST_FIELDS) {
  const out = { ...defaults };
  if (persisted && typeof persisted === 'object') {
    for (const f of fields) if (persisted[f] !== undefined) out[f] = persisted[f];
  }
  return out;
}
