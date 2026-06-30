// Fixed-height list virtualization (c5). Given the scroll position and a uniform row
// height, compute the slice of rows to actually render plus the spacer heights that keep
// the scrollbar geometry identical to rendering the whole list. Keeps the DOM bounded to
// the viewport + overscan no matter how large the fleet feed grows. Pure.

export function computeWindow({ scrollTop = 0, viewportHeight = 0, rowHeight = 0, count = 0, overscan = 6 }) {
  const n = Math.max(0, count | 0);
  // No usable row height (unmeasured) or an empty list: render everything, no spacers.
  if (!rowHeight || rowHeight <= 0 || n === 0) {
    return { start: 0, end: n, padTop: 0, padBottom: 0 };
  }
  // Clamp the first-visible index into range so an over-scroll (scrollTop past the
  // content height) still yields a valid tail window instead of an empty one with a
  // giant top spacer.
  const first = Math.min(Math.max(0, n - 1), Math.floor(Math.max(0, scrollTop) / rowHeight));
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(n, first + visible + overscan);
  const padTop = start * rowHeight;
  const padBottom = Math.max(0, (n - end) * rowHeight);
  return { start, end, padTop, padBottom };
}
