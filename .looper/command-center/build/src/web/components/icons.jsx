// Inline SVG icon set — one stroke language across the app (d5). 16px grid.

const S = ({ children, size = 15, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

export const Icon = {
  bell: (p) => <S {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></S>,
  spinner: (p) => <S {...p}><path d="M12 3a9 9 0 1 0 9 9" /></S>,
  pause: (p) => <S {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></S>,
  check: (p) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>,
  terminal: (p) => <S {...p}><path d="m4 7 5 5-5 5" /><path d="M13 17h7" /></S>,
  pin: (p) => <S {...p}><path d="M9 4v6l-2 4h10l-2-4V4" /><path d="M12 14v6" /><path d="M8 4h8" /></S>,
  jump: (p) => <S {...p}><path d="M7 17 17 7" /><path d="M9 7h8v8" /></S>,
  memory: (p) => <S {...p}><path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M7 8h6M7 12h10M7 16h10" /></S>,
  filter: (p) => <S {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></S>,
  search: (p) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>,
  plus: (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  diff: (p) => <S {...p}><path d="M12 3v6M9 6h6" /><path d="M9 18h6" /><path d="M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" /></S>,
  close: (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  chevron: (p) => <S {...p}><path d="m9 18 6-6-6-6" /></S>,
  chevronDown: (p) => <S {...p}><path d="m6 9 6 6 6-6" /></S>,
  branch: (p) => <S {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8.5v7M18 10.5c0 4-4 3-8 4" /></S>,
  agent: (p) => <S {...p}><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4M9 13h.01M15 13h.01" /></S>,
  refresh: (p) => <S {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></S>,
  away: (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>,
  layers: (p) => <S {...p}><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></S>,
  folder: (p) => <S {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></S>,
  command: (p) => <S {...p}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" /></S>,
  bolt: (p) => <S {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></S>,
  dot: (p) => <S {...p}><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" /></S>,
  reply: (p) => <S {...p}><path d="M9 17 4 12l5-5" /><path d="M4 12h11a5 5 0 0 1 5 5v1" /></S>,
  copy: (p) => <S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></S>,
  eye: (p) => <S {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></S>,
  warn: (p) => <S {...p}><path d="M10.3 4 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4a1.6 1.6 0 0 0-2.8 0z" /><path d="M12 9v4M12 17h.01" /></S>,
};
