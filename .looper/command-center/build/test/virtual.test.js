import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWindow } from '../src/shared/virtual.js';

// Virtualization keeps the rendered DOM bounded at fleet scale (c5): regardless of how
// many feed rows exist, only a window around the viewport (plus overscan) is rendered,
// with spacer padding above/below preserving the scroll geometry.

test('with no rowHeight it renders everything (windowing disabled, never drops rows)', () => {
  const w = computeWindow({ scrollTop: 0, viewportHeight: 600, rowHeight: 0, count: 500 });
  assert.equal(w.start, 0);
  assert.equal(w.end, 500);
  assert.equal(w.padTop, 0);
  assert.equal(w.padBottom, 0);
});

test('at the top, the window starts at 0 with no top padding', () => {
  const w = computeWindow({ scrollTop: 0, viewportHeight: 600, rowHeight: 50, count: 1000, overscan: 4 });
  assert.equal(w.start, 0);
  assert.equal(w.padTop, 0);
  // 600/50 = 12 visible + 4 overscan = 16
  assert.equal(w.end, 16);
  assert.equal(w.padBottom, (1000 - 16) * 50);
});

test('scrolled into the middle, the window is offset and both spacers are non-zero', () => {
  const w = computeWindow({ scrollTop: 5000, viewportHeight: 600, rowHeight: 50, count: 1000, overscan: 4 });
  // first visible row = floor(5000/50) = 100; start = 100 - 4 = 96
  assert.equal(w.start, 96);
  assert.equal(w.padTop, 96 * 50);
  // end = 100 + 12 + 4 = 116
  assert.equal(w.end, 116);
  assert.equal(w.padBottom, (1000 - 116) * 50);
});

test('the window is bounded: start never negative, end never exceeds count', () => {
  const top = computeWindow({ scrollTop: -200, viewportHeight: 600, rowHeight: 50, count: 10, overscan: 4 });
  assert.equal(top.start, 0, 'start clamps to 0');
  const bottom = computeWindow({ scrollTop: 1e9, viewportHeight: 600, rowHeight: 50, count: 10, overscan: 4 });
  assert.equal(bottom.end, 10, 'end clamps to count');
  assert.ok(bottom.start >= 0 && bottom.start <= 10);
  assert.equal(bottom.padBottom, 0, 'no bottom padding past the end');
});

test('the total scroll height is invariant: padTop + window rows + padBottom == count rows', () => {
  for (const scrollTop of [0, 1234, 9999, 50000]) {
    const rowHeight = 48;
    const count = 873;
    const w = computeWindow({ scrollTop, viewportHeight: 720, rowHeight, count, overscan: 6 });
    const windowPx = (w.end - w.start) * rowHeight;
    assert.equal(w.padTop + windowPx + w.padBottom, count * rowHeight, `invariant holds at scrollTop=${scrollTop}`);
  }
});

test('an empty list yields an empty, zero-padded window', () => {
  const w = computeWindow({ scrollTop: 0, viewportHeight: 600, rowHeight: 50, count: 0 });
  assert.deepEqual(w, { start: 0, end: 0, padTop: 0, padBottom: 0 });
});
