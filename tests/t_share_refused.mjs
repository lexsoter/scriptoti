// An edit the editor refuses must not reach the others. Real PHP relay, two
// people: Bruno, offline, pastes about 1 MB; the file check refuses it (2 MB
// with the unsent edits); when he is back online Anna must not receive it.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ROOT, CHROME, CHROME_ARGS, PHP, finish } from './lib.mjs';
const DATA = path.join(os.tmpdir(), 'scriptoti-refused-test'); fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
const port = 8800 + Math.floor(Math.random() * 90);
const php = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', ROOT], { env: { ...process.env, SCRIPTOTI_SYNC_DIR: DATA }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const url = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ executablePath: CHROME, args: CHROME_ARGS, headless: true });
const results = [], errors = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const person = async name => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` }); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e)); return { c, p }; };
const click = (p, t) => p.evaluate(t => [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === t).click(), t);
const src = p => p.evaluate(() => window.DraftEditor.state().source);
const toEnd = p => p.evaluate(() => { const s = window.DraftEditor.state().source.length; window.DraftEditor.focus(); window.DraftEditor.selectAbsolute({ anchor: s, focus: s }); });
const A = await person('Anna'), B = await person('Bruno');
await A.p.goto(url); await A.p.waitForTimeout(800);
await A.p.evaluate(async () => { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('a.fountain', { create: true }); const w = await h.createWritable(); await w.write('!Originale.\n'); await w.close(); window.showOpenFilePicker = async () => [h]; document.querySelector('#openBtn').click(); });
await A.p.waitForTimeout(1500);
await A.p.evaluate(() => document.querySelector('#shareBtn').click()); await A.p.waitForTimeout(400);
await A.p.fill('dialog[open] input[aria-label="Il tuo nome"]', 'Anna'); await click(A.p, 'Avvia la condivisione'); await A.p.waitForTimeout(2500);
await click(A.p, 'Copia link'); const link = await A.p.evaluate(() => navigator.clipboard.readText()); await click(A.p, 'Chiudi');
await B.p.goto(link); await B.p.waitForTimeout(2500);
const ask = await B.p.$('dialog[open] input'); if (ask) { await ask.fill('Bruno'); await B.p.keyboard.press('Enter'); }
await B.p.waitForTimeout(3000);
check('Bruno joins', (await src(B.p)) === '!Originale.\n', JSON.stringify(await src(B.p)));

await B.c.route('**/sync/relay.php**', r => r.abort());
await toEnd(B.p); await B.p.keyboard.insertText('Un testo incollato senza rete. '.repeat(33000)); await B.p.waitForTimeout(3000);
const shared = await B.p.evaluate(() => window.DraftSafe.shared?.text);
check('the refused paste is not in Bruno\'s editor nor in the shared text', (await src(B.p)) === '!Originale.\n' && shared === '!Originale.\n', `editor ${(await src(B.p)).length} shared ${shared?.length}`);
await B.c.unroute('**/sync/relay.php**'); await B.p.waitForTimeout(8000);
await A.p.evaluate(() => { window.DraftEditor.focus(); window.DraftEditor.selectAbsolute({ anchor: 1, focus: 1 }); }); await A.p.keyboard.type('Z');
await toEnd(B.p); await B.p.keyboard.type(' Ciao.'); await A.p.waitForTimeout(7000);
const a = await src(A.p), b = await src(B.p);
check('back online: Anna never receives it, both copies stay identical', a === b && !a.includes('senza rete') && a.includes('Z') && a.includes('Ciao'), JSON.stringify(a.slice(0, 80)) + ' / ' + JSON.stringify(b.slice(0, 80)));
finish(results, errors);
await browser.close(); php.kill();
