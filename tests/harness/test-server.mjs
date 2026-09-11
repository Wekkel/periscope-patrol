// ═══════════════════════════════════════════════════ TEST HTTP SERVER
// Ephemeral static server for browser-based automated testing without external deps.

import http from 'node:http';
import {readFile, stat, open} from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
});

export async function createTestServer(rootDir) {
  const root = path.resolve(rootDir);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';

      const filePath = path.normalize(path.join(root, pathname));
      const isSafe = filePath === root || filePath.startsWith(root + path.sep);
      if (!isSafe) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      let stats;
      try {
        stats = await stat(filePath);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${pathname}`);
        return;
      }

      if (stats.isDirectory()) {
        const indexFile = path.join(filePath, 'index.html');
        try {
          const content = await readFile(indexFile);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': content.byteLength,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(content);
          return;
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`404 Not Found (directory index): ${pathname}`);
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileSize = stats.size;
      const range = req.headers.range;

      // Support HTTP 206 Range requests (critical for browser media & audio streaming)
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
            'Content-Type': 'text/plain'
          });
          res.end('416 Range Not Satisfiable');
          return;
        }

        const chunksize = (end - start) + 1;
        const fileHandle = await open(filePath, 'r');
        const buffer = Buffer.alloc(chunksize);
        await fileHandle.read(buffer, 0, chunksize, start);
        await fileHandle.close();

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(buffer);
        return;
      }

      const content = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.byteLength,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`500 Server Error: ${err.message}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}/`;

  return {
    server,
    port,
    baseUrl,
    async close() {
      if (typeof server.closeAllConnections === 'function') {
        try { server.closeAllConnections(); } catch (_) {}
      }
      return new Promise((resolve) => server.close(resolve));
    }
  };
}
