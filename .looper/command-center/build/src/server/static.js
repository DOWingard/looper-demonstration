// Minimal static file server for the built frontend (dist/). Path-traversal safe.

import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export function makeStaticHandler(distDir) {
  return async function serveStatic(req, res, urlPath) {
    let rel = decodeURIComponent(urlPath.split('?')[0]);
    if (rel === '/' || rel === '') rel = '/index.html';
    const resolved = path.normalize(path.join(distDir, rel));
    if (!resolved.startsWith(distDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const data = await fs.promises.readFile(resolved);
      const ext = path.extname(resolved);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA fallback: unknown non-asset path -> index.html so client routing works.
      if (!path.extname(resolved)) {
        try {
          const html = await fs.promises.readFile(path.join(distDir, 'index.html'));
          res.writeHead(200, { 'Content-Type': TYPES['.html'] });
          res.end(html);
          return;
        } catch {
          /* fall through */
        }
      }
      res.writeHead(404).end('Not found');
    }
  };
}
