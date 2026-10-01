// Перерисовка карточек прайса: node render.mjs
// Поднимает headless Chrome, снимает price.html и lessons.html в 1080x1920
// и кладёт рядом price.jpg и lessons.jpg. Нужен установленный Google Chrome
// и интернет — шрифты тянутся с Google Fonts, как и на самом сайте.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9444;
const CARDS = [['price.html', 'price.jpg'], ['lessons.html', 'lessons.jpg']];

const profile = mkdtempSync(join(tmpdir(), 'price-cards-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Chrome поднимается не мгновенно — ждём, пока отзовётся протокол
let version;
for (let i = 0; i < 40 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
  catch { await sleep(250); }
}
if (!version) { chrome.kill(); throw new Error('Chrome не ответил на порту ' + PORT); }

for (const [html, jpg] of CARDS) {
  const { webSocketDebuggerUrl } = await (await fetch(
    `http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));

  let id = 0;
  const pending = new Map();
  const seen = new Set();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) seen.add(m.method);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file://' + resolve(HERE, html) });
  for (let i = 0; i < 80 && !seen.has('Page.loadEventFired'); i++) await sleep(50);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await sleep(400);
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  ws.close();

  const png = join(profile, jpg.replace('.jpg', '.png'));
  writeFileSync(png, Buffer.from(data, 'base64'));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92',
    png, '--out', resolve(HERE, jpg)], { stdio: 'ignore' });
  console.log('готово:', jpg);
}

chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
