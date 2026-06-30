// Inline overlay controls that replace the two removed window.prompt() quick-actions:
//  - DispatchDialog: launch a session into a typed/picked directory (was a prompt).
//  - Composer: write a note into a directory's (or global) memory, or pin an action with a
//    rationale — the one in-UI surface for the feed → memory connective hop (o1) and the
//    provenance rationale on the signature pin move (o4).

import { useState, useEffect, useRef } from 'react';
import { useStore, getState, setDispatchOpen, dispatchSession, closeComposer, submitComposer, liveGroups } from '../lib/store.js';
import { cx } from '../lib/util.js';
import { Icon } from './icons.jsx';
import { Button, Kbd } from './ui.jsx';

function Overlay({ children, onClose, align = 'center' }) {
  return (
    <div
      className={cx('fixed inset-0 z-[60] flex justify-center bg-black/50 backdrop-blur-sm', align === 'center' ? 'items-start pt-[16vh]' : 'items-center')}
      onClick={onClose}
    >
      <div className="w-[min(560px,92vw)] rounded-xl border border-line bg-elevated shadow-2xl overflow-hidden cc-fade-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function DispatchDialog() {
  const open = useStore((s) => s.dispatchOpen);
  const [path, setPath] = useState('');
  const inputRef = useRef(null);
  const groups = open ? liveGroups() : [];

  useEffect(() => {
    if (open) {
      setPath(getState().selectedCwd || '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  const go = (p) => {
    const dir = String(p || '').trim();
    if (!dir) return;
    setDispatchOpen(false);
    dispatchSession(dir);
  };
  return (
    <Overlay onClose={() => setDispatchOpen(false)}>
      <div className="flex items-center gap-2 px-4 h-12 border-b border-line">
        <Icon.plus size={16} className="text-brand" />
        <span className="text-[14px] font-semibold">Dispatch a session</span>
        <span className="flex-1" />
        <Kbd>esc</Kbd>
      </div>
      <div className="p-4">
        <label className="block text-[11px] text-faint mb-1.5">Launch the interactive session in this directory:</label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(path); if (e.key === 'Escape') setDispatchOpen(false); }}
            placeholder="/path/to/project"
            className="flex-1 h-9 px-2.5 rounded-md bg-bg/60 border border-line text-[13px] font-mono text-ink placeholder:text-faint focus:border-brand/60 outline-none"
          />
          <Button variant="primary" size="lg" onClick={() => go(path)} disabled={!path.trim()}>Dispatch</Button>
        </div>
        {groups.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1.5">or an existing directory</div>
            <div className="flex flex-col gap-0.5 max-h-[34vh] overflow-y-auto cc-scroll">
              {groups.map((g) => (
                <button
                  key={g.cwd}
                  onClick={() => go(g.cwd)}
                  className="flex items-center gap-2 px-2 h-8 rounded-md text-left hover:bg-hover text-[12px]"
                >
                  <Icon.folder size={13} className="text-faint shrink-0" />
                  <span className="font-medium">{g.label}</span>
                  <span className="text-faint font-mono text-[11px] truncate">{g.cwd}</span>
                  <span className="ml-auto text-[10px] text-faint">{g.sessionCount} session{g.sessionCount === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

export function Composer() {
  const composer = useStore((s) => s.composer);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (composer) {
      setDraft(composer.draft || '');
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [composer]);

  if (!composer) return null;
  const isPin = composer.mode === 'pin';
  const HeadIcon = isPin ? Icon.pin : Icon.memory;
  const targetLabel = composer.scope === 'global' ? 'global memory' : `${composer.dirLabel || 'directory'} memory`;
  const submit = () => submitComposer(draft);
  return (
    <Overlay onClose={closeComposer}>
      <div className="flex items-center gap-2 px-4 h-12 border-b border-line">
        <HeadIcon size={15} className="text-brand" />
        <span className="text-[14px] font-semibold">{isPin ? 'Pin with a rationale' : 'Write a note'}</span>
        <span className="text-[11px] text-faint">→ {targetLabel}</span>
        <span className="flex-1" />
        <Kbd>esc</Kbd>
      </div>
      <div className="p-4">
        {isPin && composer.item && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-faint font-mono px-2 py-1.5 rounded bg-bg/50 border border-line/60">
            <span className="text-brand">{composer.item.tool}</span>
            <span className="truncate">{composer.item.summary}</span>
          </div>
        )}
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeComposer();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={isPin ? 'Why does this action matter? (becomes the decision-trail rationale)' : 'Plain markdown — appended to the shared memory, timestamped.'}
          rows={4}
          className="w-full resize-none rounded-md bg-bg/60 border border-line px-2.5 py-2 font-mono text-[12.5px] text-ink/90 leading-relaxed placeholder:text-faint focus:border-brand/60 outline-none"
        />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] text-faint flex items-center gap-1"><Kbd>⌘↵</Kbd> to {isPin ? 'pin' : 'save'}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="md" onClick={closeComposer}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit}>{isPin ? 'Pin to trail' : 'Write note'}</Button>
        </div>
      </div>
    </Overlay>
  );
}
