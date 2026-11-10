#!/usr/bin/env node
/*
 * Local server for the studio: serves the project like `python3 -m http.server`, and lets
 * dev/studio.html save its values into js/tuning.js.
 *
 *   node tools/studio.mjs            -> http://localhost:5180/dev/studio.html
 *   node tools/studio.mjs --port 8080 --host 0.0.0.0   (phones on the same Wi-Fi can open the app)
 *
 * GET  /__studio/tuning  -> the values in js/tuning.js (JSON)
 * POST /__studio/tuning  -> rewrite js/tuning.js with the posted values. Only accepted from this
 *                           computer (loopback), whatever --host is.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TUNING_FILE = path.join(ROOT, 'js', 'tuning.js');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PORT = +opt('port', 5180);
const HOST = opt('host', '127.0.0.1');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------------------------------------------------------------- tuning file */
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** keep only known, numeric, in-range values */
function clean(input, current) {
  const c = (input && input.character) || {};
  const cam = (input && input.camera) || {};
  const out = {
    character: {
      head: r3(num(c.head, 0.5, 1.4, current.character.head)),
      torso: r3(num(c.torso, 0.6, 1.8, current.character.torso)),
      legs: r3(num(c.legs, 0.5, 2.2, current.character.legs)),
      width: r3(num(c.width, 0.7, 1.4, current.character.width)),
    },
    camera: {
      fov: r3(num(cam.fov, 10, 80, current.camera.fov)),
      elev: r3(num(cam.elev, -10, 89, current.camera.elev)),
      height: r3(num(cam.height, 2, 40, current.camera.height)),
    },
    scenes: {},
  };
  Object.keys(current.scenes).forEach((key) => {
    const t = input && input.scenes && input.scenes[key] && input.scenes[key].target;
    const base = current.scenes[key].target;
    out.scenes[key] = { target: [0, 1, 2].map((i) => r3(num(Array.isArray(t) ? t[i] : NaN, -20, 20, base[i]))) };
  });
  return out;
}

function render(values) {
  const src = fs.readFileSync(TUNING_FILE, 'utf8');
  const start = src.indexOf('const BASE = ');
  const end = src.indexOf('};', start);
  if (start < 0 || end < 0) throw new Error('js/tuning.js: could not find the BASE block');
  const scenes = Object.entries(values.scenes)
    .map(([k, v], i, a) => `    ${JSON.stringify(k)}: { "target": [${v.target.join(', ')}] }${i < a.length - 1 ? ',' : ''}`)
    .join('\n');
  const c = values.character;
  const cam = values.camera;
  const block =
    'const BASE = {\n' +
    `  "character": { "head": ${c.head}, "torso": ${c.torso}, "legs": ${c.legs}, "width": ${c.width} },\n` +
    `  "camera": { "fov": ${cam.fov}, "elev": ${cam.elev}, "height": ${cam.height} },\n` +
    '  "scenes": {\n' +
    scenes +
    '\n  }\n' +
    '}';
  return src.slice(0, start) + block + src.slice(end + 1);
}

async function readCurrent() {
  // a fresh import every time (the file changes)
  const mod = await import(pathToFileURL(TUNING_FILE).href + '?t=' + Date.now());
  return mod.TUNING_BASE;
}

/* ---------------------------------------------------------------- server */
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/__studio/tuning') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(await readCurrent()));
        return;
      }
      if (req.method === 'POST') {
        if (!isLoopback(req)) {
          res.writeHead(403).end('only from this computer');
          return;
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 64 * 1024) throw new Error('too large');
        }
        const values = clean(JSON.parse(body), await readCurrent());
        fs.writeFileSync(TUNING_FILE, render(values));
        console.log('[studio] saved js/tuning.js');
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, values }));
        return;
      }
      res.writeHead(405).end();
      return;
    }
    // static files
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[studio]', e.message);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(e.message));
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`[studio] http://${shown}:${PORT}/dev/studio.html  (app: /day.html, workshop: /index.html)`);
});
