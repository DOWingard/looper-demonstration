// Component-system primitives shared by every panel (d5): one button, one badge, one
// panel chrome, one keycap. Consistent radius, spacing, type, and hover language.

import { cx } from '../lib/util.js';

export function Button({ children, variant = 'ghost', size = 'md', active, className, ...p }) {
  const base = 'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors select-none disabled:opacity-40 disabled:pointer-events-none';
  const sizes = { sm: 'h-6 px-2 text-[11px]', md: 'h-7 px-2.5 text-[12px]', lg: 'h-9 px-3.5 text-[13px]' };
  const variants = {
    primary: 'bg-brand text-[#05203f] hover:bg-[#74acff] shadow-sm',
    ghost: cx('text-muted hover:text-ink hover:bg-hover', active && 'bg-hover text-ink'),
    outline: cx('border border-line text-muted hover:text-ink hover:border-[#3a465f]', active && 'text-ink border-[#3a465f] bg-elevated'),
    danger: 'text-[#fca5a5] hover:text-white hover:bg-[#7f1d1d]/40',
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...p}>
      {children}
    </button>
  );
}

export function IconButton({ icon: I, label, active, className, size = 16, ...p }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cx('inline-grid place-items-center h-7 w-7 rounded-md text-muted hover:text-ink hover:bg-hover transition-colors', active && 'bg-hover text-ink', className)}
      {...p}
    >
      <I size={size} />
    </button>
  );
}

export function Badge({ children, color, className, dot }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded px-1.5 h-[18px] text-[10.5px] font-medium leading-none', className)}
      style={color ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-line bg-elevated text-[10px] font-mono text-muted">
      {children}
    </kbd>
  );
}

export function Panel({ title, actions, children, className, bodyClass }) {
  return (
    <section className={cx('flex flex-col min-h-0 bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between h-9 px-3 shrink-0 border-b border-line/70">
          <span className="cc-label">{title}</span>
          <div className="flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={cx('flex-1 min-h-0', bodyClass)}>{children}</div>
    </section>
  );
}

export function Empty({ icon: I, title, hint, children }) {
  return (
    <div className="h-full grid place-items-center p-6 text-center">
      <div className="max-w-[280px] flex flex-col items-center gap-2">
        {I && (
          <div className="grid place-items-center w-11 h-11 rounded-xl bg-elevated text-faint mb-1">
            <I size={20} />
          </div>
        )}
        <div className="text-[13px] font-medium text-muted">{title}</div>
        {hint && <div className="text-[12px] text-faint leading-relaxed">{hint}</div>}
        {children}
      </div>
    </div>
  );
}

export function Dot({ color, className, pulse }) {
  return <span className={cx('inline-block w-2 h-2 rounded-full', pulse, className)} style={{ background: color }} />;
}
