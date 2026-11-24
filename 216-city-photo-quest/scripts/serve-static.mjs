#!/usr/bin/env node
// Минимальный статический сервер без зависимостей: раздаёт папку сборки под заданным путём.
// Нужен, чтобы проверить сборку так же, как её откроет GitHub Pages (https://<user>.github.io/<repo>/).
//   node scripts/serve-static.mjs --dir dist --port 4316 --base /city-photo-quest/
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith('--') ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), []),
);
const root = resolve(args.dir ?? 'dist');
const port = Number(args.port ?? 4316);
const host = args.host ?? '127.0.0.1';
let base = args.base ?? '/';
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
};

try {
  statSync(join(root, 'index.html'));
} catch {
  console.error(`Нет ${join(root, 'index.html')}. Сначала выполните npm run build.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let path = decodeURIComponent(url.pathname);
  if (path === base.slice(0, -1) || (base !== '/' && path === '/')) {
    res.writeHead(302, { Location: base });
    res.end();
    return;
  }
  if (!path.startsWith(base)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  path = path.slice(base.length) || 'index.html';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Сборка ${root} доступна на http://${host}:${port}${base}`);
});
