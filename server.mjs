// Minimal static server for Firebase App Hosting / Cloud Run: serves the Vite build in dist/ on $PORT.
// No dependencies, so it runs even after the buildpack prunes devDependencies.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const INDEX = join(ROOT, 'index.html');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const isFile = p => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

function send(res, path, status = 200) {
  const isAsset = path.startsWith(join(ROOT, 'assets') + sep);
  res.writeHead(status, {
    'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(path).pipe(res);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  const target = normalize(join(ROOT, pathname));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (isFile(target)) return send(res, target);
  // Missing hashed asset: real 404 rather than HTML.
  if (pathname.startsWith('/assets/')) {
    res.writeHead(404).end();
    return;
  }
  send(res, INDEX); // single-page app fallback
});

server.listen(PORT, '0.0.0.0', () => console.log(`The Pitt listening on :${PORT}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
