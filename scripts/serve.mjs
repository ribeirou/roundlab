import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function resolveSafePublicPath(urlPathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) return null;

  const cleanRel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, cleanRel);
  const relative = path.relative(PUBLIC_DIR, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

export function createStaticServer() {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Método não permitido');
      return;
    }

    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const targetPath = resolveSafePublicPath(parsedUrl.pathname);

    if (!targetPath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso negado');
      return;
    }

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Arquivo não encontrado');
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fs.readFile(targetPath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });

      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Arquivo não encontrado');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erro interno ao ler arquivo');
      }
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT || '4173', 10);
  const host = '127.0.0.1';
  const server = createStaticServer();
  server.listen(port, host, () => {
    console.log(`RoundLab disponível em http://${host}:${port}`);
  });
}
