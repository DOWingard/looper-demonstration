// Keyboard reference overlay (complements the always-visible legend, d6).

import { useStore, setHelpOpen } from '../lib/store.js';
import { Icon } from './icons.jsx';
import { Kbd } from './ui.jsx';

const GROUPS = [
  ['Navigate', [['⌘K / Ctrl-K', 'command palette — every action'], ['j / k', 'move through sessions'], ['↵', 'open selected session'], ['g', 'since-you-last-looked digest'], ['?', 'this help']]],
  ['Operate', [['a', 'attach the terminal'], ['d', 'toggle output ⇄ diff'], ['p', 'pin latest action to memory'], ['m', 'open shared memory'], ['n', 'dispatch a new session']]],
  ['Feed & peek', [['/', 'focus the feed filter'], ['c', 'group rapid same-session bursts'], ['eye', 'peek a session (no selection change)'], ['esc', 'close overlays / peek / focus']]],
];

export function HelpOverlay() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={() => setHelpOpen(false)}>
      <div className="w-[min(560px,92vw)] rounded-xl border border-line bg-elevated shadow-2xl overflow-hidden cc-fade-in" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-4 h-12 border-b border-line">
          <Icon.command size={16} className="text-brand" />
          <span className="text-[14px] font-semibold">Keyboard control</span>
          <span className="flex-1" />
          <Kbd>esc</Kbd>
        </header>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {GROUPS.map(([title, rows]) => (
            <div key={title}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint mb-2">{title}</div>
              <div className="flex flex-col gap-1.5">
                {rows.map(([k, label]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-muted">{label}</span>
                    <Kbd>{k}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
