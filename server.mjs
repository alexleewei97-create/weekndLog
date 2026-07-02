import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function resolvePaths(rootDir) {
  return {
    dataFile: path.join(rootDir, 'weikenlog-data.json'),
    tmpFile: path.join(rootDir, 'weikenlog-data.json.tmp'),
    backupsDir: path.join(rootDir, 'backups'),
    staticRoot: rootDir,
  };
}

export async function readJSON(filePath, fallbackObj) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch { return fallbackObj; }
}

export async function atomicWriteJSON(filePath, tmpPath, obj) {
  await writeFile(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      const srv = net.createServer();
      srv.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && p < startPort + 50) tryPort(p + 1);
        else reject(e);
      });
      srv.once('listening', () => srv.close(() => resolve(p)));
      srv.listen(p, '127.0.0.1');
    };
    tryPort(startPort);
  });
}

async function serveStatic(req, res, staticRoot) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (urlPath === '/') urlPath = '/app.html';
  const root = path.resolve(staticRoot);
  const filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

export function createRequestHandler({ rootDir, retention = 30 }) {
  const paths = resolvePaths(rootDir);
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, app: '威肯Log' }));
      return;
    }
    if (url.pathname === '/api/data') {
      if (req.method === 'GET') {
        const data = await readJSON(paths.dataFile, null);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === 'POST') {
        try {
          const obj = JSON.parse(await readBody(req));
          await mkdir(paths.backupsDir, { recursive: true });
          await atomicWriteJSON(paths.dataFile, paths.tmpFile, obj);
          // Snapshot + prune are added in Task 5.
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
        }
        return;
      }
    }
    await serveStatic(req, res, paths.staticRoot);
  };
}

export function startServer({ port, rootDir, retention = 30 }) {
  const server = http.createServer(createRequestHandler({ rootDir, retention }));
  server.listen(port, '127.0.0.1');
  return server;
}

function openBrowser(url) {
  import('node:child_process').then(({ spawn }) => {
    const plat = process.platform;
    if (plat === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (plat === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  findOpenPort(8787).then((port) => {
    startServer({ port, rootDir: __dirname });
    const urlStr = `http://127.0.0.1:${port}/`;
    console.log(`威肯Log 已启动: ${urlStr}\n关闭此窗口即停止服务。`);
    openBrowser(urlStr);
  }).catch((e) => { console.error('启动失败:', e); process.exit(1); });
}
