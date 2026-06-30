// Right rail: the per-session file-change surface (f7), the shared markdown memory
// editor (per-dir + global, f11), and the Decision Trail — the durable, provenance-
// tagged audit of pinned actions, dispatches and notes that survives reload (o6) and
// surfaces the signature pin-to-memory move.

import { useState, useEffect, useRef } from 'react';
import { useStore, setRightTab, setMemoryScope, saveMemory, setState, getState, loadMemory, refreshSidecars, selectSession, setCenterMode, setFilter } from '../lib/store.js';
import { cx, formatAgo, formatClock, toolMeta } from '../lib/util.js';
import { encodeCwd } from '../../shared/pathenc.js';
import { Icon } from './icons.jsx';
import { Button, IconButton, Badge, Empty } from './ui.jsx';

export function RightPanel({ onClose, showClose }) {
  const tab = useStore((s) => s.rightTab);
  const tabs = [
    ['changes', 'Changes', Icon.diff],
    ['memory', 'Memory', Icon.memory],
    ['trail', 'Trail', Icon.pin],
  ];
  return (
    <div className="h-full flex flex-col bg-panel">
      <header className="flex items-center gap-1 h-9 px-2 shrink-0 border-b border-line/70">
        {tabs.map(([k, label, I]) => (
          <button key={k} onClick={() => setRightTab(k)} className={cx('flex items-center gap-1 px-2 h-7 rounded text-[11px] transition-colors', tab === k ? 'bg-hover text-ink' : 'text-faint hover:text-muted')}>
            <I size={12} /> {label}
          </button>
        ))}
        <span className="flex-1" />
        {showClose && <IconButton icon={Icon.close} label="close" size={14} onClick={onClose} />}
      </header>
      <div className="flex-1 min-h-0">
        {tab === 'changes' && <Changes />}
        {tab === 'memory' && <Memory />}
        {tab === 'trail' && <Trail />}
      </div>
    </div>
  );
}

function Changes() {
  const detail = useStore((s) => s.sessionDetail);
  const summary = useStore((s) => (s.selectedKey ? s.sessionsByKey[s.selectedKey] : null));
  if (!summary) return <Empty icon={Icon.diff} title="No session selected" hint="File changes for the selected session show here." />;
  const files = detail && detail.key === summary.key ? detail.files || [] : [];
  return (
    <div className="cc-scroll h-full">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line/40 text-[11px]">
        <span className="font-mono text-ink/90 truncate">{summary.sessionId}</span>
        <span className="ml-auto font-mono"><span className="text-[var(--color-add)]">+{summary.additions}</span> <span className="text-[var(--color-del)]">-{summary.deletions}</span></span>
      </div>
      {files.length === 0 ? (
        <Empty icon={Icon.diff} title="No files changed" hint="Edit/Write actions in this session produce a +X / -Y surface here." />
      ) : (
        <div className="py-1">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-2 px-3 py-1.5 hover:bg-hover/40">
              <Icon.diff size={12} className="text-faint shrink-0" />
              <span className="font-mono text-[11.5px] text-ink/85 truncate flex-1" title={f.path}>{f.path}</span>
              <span className="font-mono text-[10.5px] tabular-nums shrink-0">
                <span className="text-[var(--color-add)]">+{f.additions}</span> <span className="text-[var(--color-del)]">-{f.deletions}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Memory() {
  const scope = useStore((s) => s.memoryScope);
  const selectedCwd = useStore((s) => s.selectedCwd);
  const mem = useStore((s) => s.memory);
  const [draft, setDraft] = useState(mem.content);
  const [conflict, setConflict] = useState(false);
  const lastFile = useRef(null);

  // Adopt server content when the file changes (different scope/dir) or when there are no
  // unsaved edits. If the on-disk content changes underfoot WHILE editing (a concurrent
  // pin or another writer), surface a designed write-conflict state instead of silently
  // clobbering the draft (c4) — the operator chooses to keep or discard their edits.
  useEffect(() => {
    const file = `${mem.scope}:${mem.cwd}`;
    if (lastFile.current !== file) {
      lastFile.current = file;
      setDraft(mem.content);
      setConflict(false);
    } else if (!getState().memory.dirty) {
      setDraft(mem.content);
      setConflict(false);
    } else if (mem.content !== draft) {
      setConflict(true);
    }
  }, [mem.content, mem.scope, mem.cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = scope === 'global' ? 'global' : selectedCwd;
  const fileName = scope === 'global' ? '_global.md' : selectedCwd ? `${encodeCwd(selectedCwd)}.md` : null;

  const takeServer = () => { setDraft(mem.content); setState({ memory: { ...getState().memory, dirty: false } }); setConflict(false); };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-line/40">
        <div className="flex items-center p-0.5 rounded-md bg-elevated border border-line">
          {[['dir', 'This dir'], ['global', 'Global']].map(([k, label]) => (
            <button key={k} onClick={() => setMemoryScope(k)} className={cx('px-2 h-6 rounded text-[11px]', scope === k ? 'bg-hover text-ink' : 'text-faint hover:text-muted')}>{label}</button>
          ))}
        </div>
        <span className="text-[10px] text-faint font-mono truncate ml-1" title={target || ''}>{scope === 'global' ? 'global' : selectedCwd || 'no dir selected'}</span>
        <span className="flex-1" />
        <Button size="sm" variant={mem.dirty ? 'primary' : 'ghost'} disabled={scope === 'dir' && !selectedCwd} onClick={() => { saveMemory(draft); setConflict(false); }}>
          Save
        </Button>
      </div>
      {scope === 'dir' && !selectedCwd ? (
        <Empty icon={Icon.memory} title="Select a directory" hint="Pick any session to edit its directory's shared memory, or switch to Global." />
      ) : (
        <>
          {conflict && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[color-mix(in_srgb,var(--color-waiting)_14%,transparent)] border-b border-line/40 text-[11px]">
              <Icon.warn size={12} style={{ color: 'var(--color-waiting)' }} />
              <span className="text-muted">Changed on disk while you were editing.</span>
              <button onClick={takeServer} className="ml-auto text-[11px] text-brand hover:underline">Discard mine & reload</button>
              <button onClick={() => setConflict(false)} className="text-[11px] text-faint hover:text-muted">Keep editing</button>
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setState({ memory: { ...getState().memory, dirty: true } }); }}
            placeholder={`# ${scope === 'global' ? 'Global' : 'Directory'} memory\n\nPlain markdown, shared across every session here. Concurrent writes are safe.`}
            className="flex-1 min-h-0 w-full resize-none bg-bg/40 px-3 py-2 font-mono text-[12px] text-ink/90 leading-relaxed outline-none placeholder:text-faint"
            spellCheck={false}
          />
          <div className="flex items-center gap-2 px-3 h-7 border-t border-line/40 text-[10px] text-faint">
            <Icon.memory size={11} className="shrink-0" />
            <span className="truncate" title={fileName ? `plain markdown on disk in CC_MEMORY_DIR/${fileName}` : ''}>
              on disk: <span className="font-mono text-muted">{fileName || '—'}</span>
            </span>
            {mem.dirty && <span className="ml-auto text-[var(--color-waiting)] shrink-0">unsaved</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Trail() {
  const audit = useStore((s) => s.audit);
  const sessionsByKey = useStore((s) => s.sessionsByKey);
  useEffect(() => { refreshSidecars(); }, []);
  const kindMeta = {
    pin: { I: Icon.pin, c: 'var(--color-brand)' },
    dispatch: { I: Icon.plus, c: 'var(--color-working)' },
    'memory-write': { I: Icon.memory, c: 'var(--color-sub)' },
    note: { I: Icon.memory, c: 'var(--color-muted)' },
  };
  // Each entry is a navigable decision: clicking replays it back to its source — the live
  // session if it still exists, otherwise its directory (filter the feed). This closes the
  // provenance loop so the trail is a reconstructable decision history that only this
  // substrate (cross-session feed + shared memory + real attach) can produce (o4/o6).
  const replay = (a) => {
    if (a.sourceSessionKey && sessionsByKey[a.sourceSessionKey]) {
      selectSession(a.sourceSessionKey, a.cwd);
      setCenterMode('session');
    } else if (a.cwd) {
      setFilter({ dir: a.cwd });
    }
  };
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line/40">
        <Icon.pin size={12} className="text-brand" />
        <span className="text-[11px] font-semibold text-muted">Decision trail</span>
        <Badge className="h-[16px] px-1 text-[10px] bg-elevated text-muted">{audit.length}</Badge>
        <span className="flex-1" />
        <IconButton icon={Icon.refresh} label="refresh" size={13} onClick={refreshSidecars} />
      </div>
      {audit.length === 0 ? (
        <Empty icon={Icon.pin} title="No decisions pinned yet" hint="Pin a feed action, write a note, or dispatch a session — each lands here, provenance-tagged, and survives reload. Click any entry to replay it back to its session." />
      ) : (
        <div className="cc-scroll flex-1 min-h-0 py-1">
          {audit.map((a, i) => {
            const km = kindMeta[a.kind] || kindMeta.note;
            const live = a.sourceSessionKey && sessionsByKey[a.sourceSessionKey];
            return (
              <button
                key={i}
                onClick={() => replay(a)}
                className="group w-full text-left px-3 py-1.5 border-b border-line/30 flex gap-2 hover:bg-hover/50 transition-colors"
                title={live ? 'Replay → open the source session' : a.cwd ? 'Replay → filter the feed to this directory' : ''}
              >
                <span className="mt-0.5 shrink-0" style={{ color: km.c }}><km.I size={13} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: km.c }}>{a.kind}</span>
                    {a.tool && <span className="text-[10px] font-mono" style={{ color: toolMeta(a.tool).tint }}>{a.tool}</span>}
                    {a.scope === 'global' && <span className="text-[9px] uppercase tracking-wide text-faint">global</span>}
                    <span className="text-[10px] text-faint ml-auto tabular-nums">{formatClock(a.ts)}</span>
                  </div>
                  <div className="text-[11.5px] text-ink/85 truncate mt-0.5" title={a.summary}>{a.summary || '(no summary)'}</div>
                  {a.note && <div className="text-[10.5px] text-muted/80 italic truncate" title={a.note}>“{a.note}”</div>}
                  <div className="flex items-center gap-1 text-[10px] text-faint mt-0.5">
                    <Icon.folder size={10} />
                    <span>{a.dirLabel || (a.cwd ? a.cwd : 'global')}</span>
                    {a.sourceSessionId && <><span className="text-line">/</span><span className="font-mono truncate">{shortId(a.sourceSessionId)}</span></>}
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: live ? 'var(--color-brand)' : 'var(--color-faint)' }}>
                      <Icon.jump size={10} /> {live ? 'open' : 'feed'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortId(id) {
  if (!id) return '';
  return id.startsWith('sess-') ? id.slice(5) : id.length > 14 ? id.slice(0, 10) : id;
}
