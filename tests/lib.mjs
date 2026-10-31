// Shared helpers for ScripToti browser tests: a static server over the
// working copy, system Chrome, and small editor shortcuts.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.ROOT || fileURLToPath(new URL('../public', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

export async function open({ root = ROOT, width = 1280, height = 900 } = {}) {
  const state = { root };
  const server = http.createServer((q, r) => {
    const file = path.join(state.root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(file, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); r.end(d);
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const headed = process.env.HEADED === '1';
  const browser = await chromium.launch({ executablePath: CHROME, headless: !headed, args: headed ? ['--window-position=-2400,-2400', '--window-size=1000,700'] : [], ignoreDefaultArgs: ['--hide-scrollbars'] });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const results = [];
  const t = {
    page, context, browser, errors, url, state, results,
    async load(text) { await page.evaluate(s => window.DraftEditor.load(s), text); await page.waitForTimeout(200); },
    src: () => page.evaluate(() => window.DraftEditor.state().source),
    kinds: () => page.evaluate(() => Array.from(document.querySelectorAll('.script-page .editable-region')).map(e => e.className.split(' ')[0] + ':' + e.textContent.slice(0, 24)).join(' | ')),
    async caret(at, focus = at) { await page.evaluate(([a, f]) => { window.DraftEditor.focus(); window.DraftEditor.selectAbsolute({ anchor: a, focus: f }); }, [at, focus]); await page.waitForTimeout(80); },
    async caretAfter(text, offset = 0) { const s = await t.src(); const i = s.indexOf(text); if (i < 0) throw new Error('not found: ' + text); await t.caret(i + text.length + offset); },
    async caretBefore(text) { const s = await t.src(); const i = s.indexOf(text); if (i < 0) throw new Error('not found: ' + text); await t.caret(i); },
    async press(key, n = 1) { for (let i = 0; i < n; i++) await page.keyboard.press(key); await page.waitForTimeout(120); },
    async type(text) { await page.keyboard.type(text, { delay: 15 }); await page.waitForTimeout(150); },
    check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); },
    report() {
      for (const r of results) console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + r.detail));
      console.log(`${results.filter(r => r.ok).length}/${results.length} ok; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
    },
    async close() { await browser.close(); server.close(); }
  };
  return t;
}
