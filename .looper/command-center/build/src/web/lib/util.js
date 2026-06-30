// UI helpers: status presentation (color + icon + motion), time formatting, classnames.

import { STATUS } from '../../shared/constants.js';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// Single source of status presentation, shared by dots, badges, lanes (d4/d5).
export const STATUS_META = {
  [STATUS.WAITING]: { label: 'needs you', short: 'waiting', color: 'var(--color-waiting)', icon: 'bell', dot: 'cc-dot-waiting', urgent: true },
  [STATUS.WORKING]: { label: 'working', short: 'working', color: 'var(--color-working)', icon: 'spinner', dot: 'cc-dot-working', urgent: false },
  [STATUS.IDLE]: { label: 'idle', short: 'idle', color: 'var(--color-idle)', icon: 'pause', dot: '', urgent: false },
  [STATUS.DONE]: { label: 'done', short: 'done', color: 'var(--color-done)', icon: 'check', dot: '', urgent: false },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META[STATUS.IDLE];
}

export function formatAgo(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Tool -> accent for the feed, so action kinds are scannable at fleet scale (d8).
export const TOOL_META = {
  Bash: { glyph: '$', tint: '#7ee787' },
  Edit: { glyph: '✎', tint: '#79c0ff' },
  Write: { glyph: '✚', tint: '#79c0ff' },
  MultiEdit: { glyph: '✎', tint: '#79c0ff' },
  Read: { glyph: '○', tint: '#8b94a7' },
  Grep: { glyph: '⌕', tint: '#d2a8ff' },
  Glob: { glyph: '⌕', tint: '#d2a8ff' },
  Task: { glyph: '⊕', tint: '#ffa657' },
  WebFetch: { glyph: '⇲', tint: '#56d4dd' },
  WebSearch: { glyph: '⌕', tint: '#56d4dd' },
};

export function toolMeta(tool) {
  return TOOL_META[tool] || { glyph: '•', tint: 'var(--color-muted)' };
}
