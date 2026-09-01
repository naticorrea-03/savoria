import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@colyseus/core';
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
  const publicDirectories = new Map([
    ['/assets/', 'assets'],
    ['/styles/', 'styles'],
    ['/js/', 'js'],
    ['/vendor/', 'vendor'],
    ['/play/', 'play'],
  ]);
  return async function serveStatic(request, response, next) {
    if (!['GET', 'HEAD'].includes(request.method)) return next();
    let pathname;
    try {
      pathname = decodePublicPath(request.originalUrl ?? request.url ?? request.path ?? '/');
    } catch {
      response.status(404).send('Not found');
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

    const relativePath = allowedPublicPath(pathname, publicDirectories);
    if (!relativePath) {
      response.status(404).send('Not found');
      return;
    }

    try {
      const candidate = path.resolve(root, relativePath);
      const allowedDirectory = path.resolve(root, publicDirectoryFor(pathname, publicDirectories));
      const [resolvedCandidate, resolvedDirectory] = await Promise.all([
        realpath(candidate),
        realpath(allowedDirectory),
      ]);
      if (!isWithin(resolvedCandidate, resolvedDirectory) || !(await stat(resolvedCandidate)).isFile()) {
        response.status(404).send('Not found');
        return;
      }
      const body = await readFile(resolvedCandidate);
      response.set('content-type', MIME_TYPES.get(path.extname(resolvedCandidate).toLowerCase()) ?? 'application/octet-stream');
      response.set('cache-control', 'no-cache');
      response.status(200);
      if (request.method === 'HEAD') response.end();
      else response.send(body);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
        response.status(404).send('Not found');
        return;
      }
      next(error);
    }
  };
}

function decodePublicPath(value) {
  const raw = new URL(value, 'http://localhost').pathname;
  let decoded = raw;
  for (let count = 0; count < 4; count += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid path');
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error('Private path');
  }
  return decoded;
}

function allowedPublicPath(pathname, publicDirectories) {
  if (pathname === '/' || pathname === '/index.html') return 'index.html';
  if (pathname === '/play/' || pathname === '/play/index.html') return 'play/index.html';
  for (const [prefix, directory] of publicDirectories) {
    if (!pathname.startsWith(prefix) || pathname === prefix) continue;
    return path.join(directory, pathname.slice(prefix.length));
  }
  return null;
}

function publicDirectoryFor(pathname, publicDirectories) {
  if (pathname === '/' || pathname === '/index.html') return '.';
  if (pathname === '/play/' || pathname === '/play/index.html') return 'play';
  for (const [prefix, directory] of publicDirectories) {
    if (pathname.startsWith(prefix)) return directory;
  }
  return '.';
}

function isWithin(candidate, directory) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}
