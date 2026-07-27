/**
 * Serve the built app on the LAN with caching fully disabled.
 *
 * `vite preview` sends normal cache headers, and Safari (especially an
 * add-to-home-screen install) will happily keep serving an old bundle — which
 * makes it impossible to tell "the fix does not work" from "you never received
 * the fix". This removes that ambiguity.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  let file = path.join(dist, decodeURIComponent(url.pathname));

  // SPA fallback: any unknown path renders index.html so client routing works.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html');
  }

  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    // The whole point: never let a phone hold on to an old build.
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(body);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`serving ${dist}`);
  console.log(`http://0.0.0.0:${PORT}  (no-store; every request re-fetches)`);
});
