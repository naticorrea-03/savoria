import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'colyseus';
import { ROOM_NAME } from '../js/multiplayer/protocol.js';
import { SavoriaRoom } from './savoria-room.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
  ['.webp', 'image/webp'],
]);

export function createGameServer({ gracefullyShutdown = false, greet = false } = {}) {
  const gameServer = new Server({
    gracefullyShutdown,
    greet,
    express(app) {
      app.get('/health', (_request, response) => response.json({ ok: true }));
      app.use(createStaticMiddleware(PROJECT_ROOT));
    },
  });
  gameServer.define(ROOM_NAME, SavoriaRoom);
  return gameServer;
}

export function createStaticMiddleware(rootDirectory) {
  const root = path.resolve(rootDirectory);
  return async function serveStatic(request, response, next) {
    if (!['GET', 'HEAD'].includes(request.method)) return next();
    let pathname;
    try {
      pathname = decodeURIComponent(request.path ?? new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.status(400).send('Bad request');
      return;
    }
    if (pathname === '/__savoria-test-mode.js') {
      response.set('content-type', 'text/javascript; charset=utf-8');
      response.set('cache-control', 'no-cache');
      response.status(200);
      const body = `globalThis.__SAVORIA_BROWSER_TESTS__ = ${process.env.SAVORIA_BROWSER_TESTS === '1'};\n`;
      if (request.method === 'HEAD') response.end();
      else response.send(body);
      return;
    }

    let candidate = path.resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      response.status(403).send('Forbidden');
      return;
    }

    try {
      if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.html');
      await access(candidate);
      const body = await readFile(candidate);
      response.set('content-type', MIME_TYPES.get(path.extname(candidate).toLowerCase()) ?? 'application/octet-stream');
      response.set('cache-control', 'no-cache');
      response.status(200);
      if (request.method === 'HEAD') response.end();
      else response.send(body);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') return next();
      next(error);
    }
  };
}
