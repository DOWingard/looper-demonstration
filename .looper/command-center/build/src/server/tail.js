// Read the tail of a file as complete lines. Reading from a byte offset can land
// mid-line, so when we did not start at byte 0 we drop the leading partial line.
// This is what keeps startup off the full-history path: we only ever read the last
// TAIL_BYTES of each transcript, never the whole file.

import fs from 'node:fs';

export async function tailFile(filePath, maxBytes) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    if (length === 0) return { text: '', size };
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      text = nl >= 0 ? text.slice(nl + 1) : '';
    }
    return { text, size };
  } finally {
    await fh.close();
  }
}

// Read a byte range [from, to) — used by the watcher to parse only the appended delta.
export async function readRange(filePath, from, to) {
  if (to <= from) return '';
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const length = to - from;
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, from);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}
