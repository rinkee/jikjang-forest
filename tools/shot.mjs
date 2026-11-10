#!/usr/bin/env node
/*
 * Headless Chrome screenshot via the DevTools protocol (WebGL via SwiftShader).
 * Serves the project on http://127.0.0.1:5174 (starts python http.server if needed).
 *
 *   node tools/shot.mjs "<path?query>" <out.png> [options]
 *     --w 1400 --h 900      viewport (default 1400x900)
 *     --full                capture the full page height
 *     --wait READY          wait until document.title contains this (default: READY|ERR)
 *     --timeout 60000       max wait (ms)
 *     --delay 300           extra delay after ready (ms)
 *     --eval "js"           run JS in the page after ready (await-able), then --delay again
 *     --mobile              mobile emulation (touch, dpr 2 if --dpr not given)
 *     --dpr 1               device pixel ratio
 *
 * Prints title, console errors and page exceptions. Exit code 1 on page errors.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5174;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const target = args[0];
const out = args[1];
if (!target || !out) {
  console.log('usage: node tools/shot.mjs "<path?query>" <out.png> [--w --h --full --wait --timeout --delay --eval --mobile --dpr]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const W = +opt('w', 1400);
const H = +opt('h', 900);
const FULL = !!opt('full', false);
const WAIT = opt('wait', 'READY|ERR');
const TIMEOUT = +opt('timeout', 60000);
const DELAY = +opt('delay', 300);
const EVAL = opt('eval', null);
const MOBILE = !!opt('mobile', false);
const DPR = +opt('dpr', MOBILE ? 2 : 1);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureServer() {
  const ok = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1500) });
      return r.ok || r.status === 404;
    } catch {
      return false;
    }
  };
  if (await ok()) return;
  const p = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  p.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    if (await ok()) return;
  }
  throw new Error('could not start static server on ' + PORT);
}

async function main() {
  await ensureServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ccshot-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      `--window-size=${W},${H}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const cleanup = () => {
    try {
      chrome.kill('SIGKILL');
    } catch {}
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  };
  process.on('exit', cleanup);

  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    } catch {}
  }
  if (!port) throw new Error('chrome did not start');
  let pages = [];
  for (let i = 0; i < 50 && !pages.length; i++) {
    try {
      pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
    } catch {}
    if (!pages.length) await sleep(100);
  }
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const waiters = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiters.has(msg.id)) {
      waiters.get(msg.id)(msg);
      waiters.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const t = msg.params.type;
      if (t === 'error' || t === 'warning' || t === 'warn') {
        logs.push(`console.${t}: ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text) + (d.url ? ` @ ${d.url}:${d.lineNumber}` : ''));
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') logs.push(`log.error: ${e.text} ${e.url || ''}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      waiters.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
    return { value: r.result && r.result.result ? r.result.result.value : undefined };
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: MOBILE });
  if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const url = `http://127.0.0.1:${PORT}/${target.replace(/^\//, '')}`;
  await send('Page.navigate', { url });
  const re = new RegExp(WAIT);
  const start = Date.now();
  let title = '';
  while (Date.now() - start < TIMEOUT) {
    await sleep(250);
    const r = await evaluate('document.readyState + "|" + document.title');
    const [state, ...rest] = String(r.value || '').split('|');
    title = rest.join('|');
    if (state === 'complete' && (WAIT === 'none' || re.test(title))) break;
  }
  const timedOut = Date.now() - start >= TIMEOUT;
  await sleep(DELAY);
  if (EVAL) {
    const r = await evaluate(`(async () => { ${EVAL} })()`);
    if (r.error) logs.push('EVAL ERROR: ' + r.error);
    else if (r.value !== undefined) console.log('eval ->', JSON.stringify(r.value));
    await sleep(DELAY);
    title = (await evaluate('document.title')).value;
  }
  const params = { format: 'png' };
  if (FULL) {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.result.cssContentSize || m.result.contentSize;
    params.clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
    params.captureBeyondViewport = true;
  }
  const shot = await send('Page.captureScreenshot', params);
  const outPath = path.resolve(out);
  fs.writeFileSync(outPath, Buffer.from(shot.result.data, 'base64'));
  console.log(`saved ${outPath}`);
  console.log(`title: ${title}${timedOut ? '  (TIMED OUT waiting for ' + WAIT + ')' : ''}`);
  const uniq = [...new Set(logs)];
  const shown = uniq.filter((l) => !/favicon.ico/.test(l));
  if (shown.length) console.log(shown.slice(0, 40).join('\n'));
  ws.close();
  cleanup();
  process.exit(shown.some((l) => /EXCEPTION|console.error|log.error|EVAL ERROR/.test(l)) ? 1 : 0);
}
main().catch((e) => {
  console.error('shot failed:', e.message);
  process.exit(1);
});
