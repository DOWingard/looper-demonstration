// "Since you last looked" away-digest (o5). Summarizes everything that happened across
// every session since the persisted baseline — grouped by directory and session with
// source attribution — so the operator learns what changed while away without attaching
// to each session. Computed live from the client feed + baseline; "mark seen" advances
// the durable baseline and jumping lands on the right session.

import { useStore, getState, setDigestOpen, markDigestSeen, selectSession, setCenterMode, clientNow, liveStatus } from '../lib/store.js';
import { cx, formatAgo, statusMeta, toolMeta } from '../lib/util.js';
import { annotateDigest } from '../../shared/digestneeds.js';
import { Icon } from './icons.jsx';
import { Button, Badge, Empty } from './ui.jsx';

function buildDigest(feed, baseline) {
  const recent = feed.filter((i) => (i.ts || 0) > (baseline || 0));
  const byDir = new Map();
  for (const it of recent) {
    const cwd = it.cwd || '(unknown)';
    if (!byDir.has(cwd)) byDir.set(cwd, { cwd, label: it.dirLabel, count: 0, sessions: new Map() });
    const g = byDir.get(cwd);
    g.count++;
    if (!g.sessions.has(it.sessionKey)) g.sessions.set(it.sessionKey, { sessionKey: it.sessionKey, sessionId: it.sessionId, cwd, count: 0, tools: {}, latest: it });
    const s = g.sessions.get(it.sessionKey);
    s.count++;
    s.tools[it.tool] = (s.tools[it.tool] || 0) + 1;
    if ((it.ts || 0) >= (s.latest.ts || 0)) s.latest = it;
  }
  const groups = [...byDir.values()].map((g) => ({ ...g, sessions: [...g.sessions.values()].sort((a, b) => b.count - a.count) })).sort((a, b) => b.count - a.count);
  return { total: recent.length, groups };
}

function pid(id) {
  return id?.startsWith('sess-') ? id.slice(5) : id || 'session';
}

// Live status of every session, keyed for the needs-you cross-reference (o5).
function liveStatusByKey() {
  const map = getState().sessionsByKey;
  const out = {};
  const now = clientNow();
  for (const k of Object.keys(map)) out[k] = liveStatus(map[k], now);
  return out;
}

export function Digest() {
  const open = useStore((s) => s.digestOpen);
  const feed = useStore((s) => s.feed);
  const baseline = useStore((s) => s.digestBaseline);
  useStore((s) => s.tick); // keep live status fresh while the digest is open
  if (!open) return null;
  // Annotate "what happened" with "what now needs you" using live status (o5).
  const d = annotateDigest(buildDigest(feed, baseline), liveStatusByKey());

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/55 backdrop-blur-sm" onClick={() => setDigestOpen(false)}>
      <div className="w-[min(640px,92vw)] max-h-[78vh] flex flex-col rounded-xl border border-line bg-elevated shadow-2xl overflow-hidden cc-fade-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2.5 px-4 h-14 border-b border-line shrink-0">
          <div className="grid place-items-center w-8 h-8 rounded-lg bg-brand/15 text-brand"><Icon.away size={17} /></div>
          <div>
            <div className="text-[14px] font-semibold">Since you last looked</div>
            <div className="text-[11px] text-faint">{baseline ? `baseline ${formatAgo(clientNow() - baseline)} ago` : 'no baseline yet — showing all activity'}</div>
          </div>
          <span className="flex-1" />
          <Button variant="primary" size="md" onClick={() => { markDigestSeen(); setDigestOpen(false); }}>
            <Icon.check size={13} /> Mark all seen
          </Button>
        </header>

        <div className="cc-scroll flex-1 min-h-0 p-3">
          {d.total === 0 ? (
            <Empty icon={Icon.check} title="You're all caught up" hint="No new cross-session activity since your baseline." />
          ) : (
            <>
              <div className="text-[12px] text-muted mb-2 px-1">
                <span className="text-ink font-semibold">{d.total} actions</span> across <span className="text-ink font-semibold">{d.groups.length} director{d.groups.length === 1 ? 'y' : 'ies'}</span> while you were away
                {d.needsYouCount > 0 && <> — <span style={{ color: 'var(--color-waiting)' }} className="font-semibold">{d.needsYouCount} now need{d.needsYouCount === 1 ? 's' : ''} you</span></>}.
              </div>

              {/* What now needs you — the operator's next moves, jump-ready, ahead of the log (o5). */}
              {d.needsYouCount > 0 && (
                <div className="mb-3 rounded-lg border overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--color-waiting) 45%, var(--color-line))' }}>
                  <div className="flex items-center gap-2 px-3 h-8" style={{ background: 'color-mix(in srgb, var(--color-waiting) 12%, transparent)' }}>
                    <Icon.bell size={13} style={{ color: 'var(--color-waiting)' }} />
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--color-waiting)' }}>Now waiting on you</span>
                    <Badge className="h-[16px] px-1 text-[10px]" color="var(--color-waiting)">{d.needsYouCount}</Badge>
                  </div>
                  {d.needsYou.map((s) => (
                    <button
                      key={s.sessionKey}
                      onClick={() => { selectSession(s.sessionKey, s.cwd); setCenterMode('session'); setDigestOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-hover/50 border-t border-line/30"
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-waiting)' }} />
                      <span className="font-mono text-[11.5px] text-ink/85 truncate shrink-0">{pid(s.sessionId)}</span>
                      <span className="text-[10px] text-faint shrink-0">{s.label}</span>
                      <span className="text-[10px] text-faint font-mono truncate flex-1 min-w-0" title={s.latest?.summary}>{s.latest?.summary}</span>
                      <Icon.jump size={12} className="shrink-0" style={{ color: 'var(--color-waiting)' }} />
                    </button>
                  ))}
                </div>
              )}

              {d.groups.map((g) => (
                <div key={g.cwd} className="mb-2 rounded-lg border border-line/70 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 h-8 bg-panel">
                    <Icon.folder size={13} className="text-faint" />
                    <span className="text-[12px] font-semibold">{g.label}</span>
                    <Badge className="h-[16px] px-1 text-[10px] bg-elevated text-muted">{g.count}</Badge>
                    {g.waiting > 0 && <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--color-waiting)' }}><Icon.bell size={10} />{g.waiting}</span>}
                  </div>
                  {g.sessions.map((s) => {
                    const sm = s.status ? statusMeta(s.status) : null;
                    return (
                      <button
                        key={s.sessionKey}
                        onClick={() => { selectSession(s.sessionKey, s.cwd); setCenterMode('session'); setDigestOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-hover/50 border-t border-line/30"
                      >
                        <span className="flex items-center gap-1.5 w-[150px] shrink-0">
                          {sm && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sm.color }} title={`now ${sm.label}`} />}
                          <span className="font-mono text-[11.5px] text-ink/85 truncate">{pid(s.sessionId)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                          {Object.entries(s.tools).map(([t, n]) => (
                            <span key={t} className="text-[10px] flex items-center gap-0.5" style={{ color: toolMeta(t).tint }}>{toolMeta(t).glyph} {t}{n > 1 ? `×${n}` : ''}</span>
                          ))}
                        </span>
                        <span className="text-[10px] text-faint font-mono shrink-0 truncate max-w-[150px]" title={s.latest?.summary}>{s.latest?.summary}</span>
                        <Icon.jump size={12} className="text-faint shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
