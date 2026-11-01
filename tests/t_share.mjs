// Two people on one shared script through the real PHP relay: the 0.28.0
// editing rules must reach both copies identically.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, CHROME_ARGS, PHP, finish } from './lib.mjs';

const DATA = path.join(os.tmpdir(), 'scriptoti-sync-test');
fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
const port = 8900 + Math.floor(Math.random() * 90);
const php = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', ROOT], { env: { ...process.env, SCRIPTOTI_SYNC_DIR: DATA }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const url = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ executablePath: CHROME, args: CHROME_ARGS, headless: true });
const results = [], errors = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

async function person(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'it-IT' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e));
  return { context, page, name };
}
const src = p => p.page.evaluate(() => window.DraftEditor.state().source);
const clickText = (p, text) => p.page.evaluate(t => { const b = [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === t); if (!b) throw new Error('button ' + t); b.click(); }, text);
const caretAfter = async (p, text) => { const s = await src(p); const i = s.indexOf(text) + text.length; await p.page.evaluate(i => { window.DraftEditor.focus(); window.DraftEditor.selectAbsolute({ anchor: i, focus: i }); }, i); await p.page.waitForTimeout(100); };
const settle = (ms = 2500) => new Promise(r => setTimeout(r, ms));

const A = await person('Anna'), B = await person('Bruno');
await A.page.goto(url, { waitUntil: 'load' }); await A.page.waitForTimeout(800);
// Anna opens a real file (an OPFS handle stands in for the file picker)
await A.page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle('prova.fountain', { create: true });
  const w = await handle.createWritable(); await w.write('Title: Prova\n\nINT. CASA - GIORNO\n\nLuca entra.\n\nFABIO\nCiao.\n\nFine.\n'); await w.close();
  window.showOpenFilePicker = async () => [handle];
  document.querySelector('#openBtn').click();
});
await A.page.waitForTimeout(1500);
await A.page.evaluate(() => document.querySelector('#shareBtn').click()); await A.page.waitForTimeout(400);
await A.page.fill('dialog[open] input[aria-label="Il tuo nome"]', 'Anna');
await clickText(A, 'Avvia la condivisione'); await A.page.waitForTimeout(2500);
await clickText(A, 'Copia link'); await A.page.waitForTimeout(300);
const link = await A.page.evaluate(() => navigator.clipboard.readText());
await clickText(A, 'Chiudi');
check('share started and link copied', /#/.test(link), link.slice(0, 80));

await B.page.goto(link, { waitUntil: 'load' }); await B.page.waitForTimeout(2500);
const ask = await B.page.$('dialog[open] input');
if (ask) { await ask.fill('Bruno'); await B.page.keyboard.press('Enter'); await B.page.waitForTimeout(500); }
await settle(3000);
check('Bruno sees the same script', (await src(B)) === (await src(A)) && (await src(B)).includes('FABIO\nCiao.'), JSON.stringify(await src(B)));

// Anna: Shift+Enter parenthetical, dialogue capitals, then Enter to Action
await caretAfter(A, 'Ciao.');
await A.page.keyboard.press('Shift+Enter'); await A.page.keyboard.type('a Lia', { delay: 20 }); await A.page.keyboard.press(')'); await A.page.keyboard.press('Enter'); await A.page.keyboard.type('come va.', { delay: 20 });
await A.page.keyboard.press('Enter'); await A.page.keyboard.type('luca ride.', { delay: 20 });
await settle();
let a = await src(A), b = await src(B);
check('Anna: Shift+Enter parenthetical, dialogue and Action reach Bruno', a === b && a.includes('FABIO\nCiao.\n(a Lia)\nCome va.\n\nLuca ride.'), JSON.stringify(b));

// Bruno: E' -> È and "FABIO (36) lotta" as Action
await caretAfter(B, 'Fine.');
await B.page.keyboard.press('Enter'); await B.page.keyboard.type("E' tardi.", { delay: 20 });
await B.page.keyboard.press('Enter'); await B.page.keyboard.type('FABIO (36) lotta con il cane.', { delay: 20 });
await settle();
a = await src(A); b = await src(B);
check("Bruno: È and the describing line reach Anna", a === b && a.includes('È tardi.') && a.includes('FABIO (36) lotta con il cane.'), JSON.stringify(a));

// Anna: Backspace joins an action under a name into dialogue
await caretAfter(A, 'lotta con il cane.');
await A.page.keyboard.press('Enter'); await A.page.keyboard.type('NEVIO', { delay: 20 });
await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(150); await A.page.keyboard.type('va bene.', { delay: 20 });
await settle();
a = await src(A); b = await src(B);
check('Anna: new character and line under it reach Bruno', a === b && a.includes('NEVIO\nVa bene.'), JSON.stringify(a));

// Both type at the same time in different places
await caretAfter(A, 'Luca entra.'); await caretAfter(B, 'È tardi.');
await Promise.all([A.page.keyboard.type(' Si siede.', { delay: 30 }), B.page.keyboard.type(' molto tardi.', { delay: 30 })]);
await settle(3500);
a = await src(A); b = await src(B);
check('simultaneous typing converges', a === b && a.includes('Luca entra. Si siede.') && a.includes('È tardi. Molto tardi.'), JSON.stringify(a) + '\n' + JSON.stringify(b));

// The long-document preview must keep publishing every accepted character.
const long = Array.from({ length: 112 }, (_, i) => `INT. STANZA ${i} - GIORNO\n\n!Riga condivisa ${i}. Elena controlla i fogli sul tavolo.\n\nGIULIO\nIl testo arriva anche agli altri.\n\n===`).join('\n\n') + '\n';
await A.page.evaluate(long => { const s = DraftEditor.state(); DraftEditor.replaceText(0, s.source.length, long, s.source, s.document); }, long);
await B.page.waitForFunction(long => DraftEditor.state().source === long && document.querySelectorAll('.script-page').length >= 110, long, { timeout: 20000 });
const fast = (p, n, text) => p.page.evaluate(({ n, text }) => {
  const s = DraftEditor.state().source, at = s.indexOf('Elena controlla', s.indexOf('Riga condivisa ' + n)) + 6;
  DraftEditor.selectAbsolute({ anchor: at, focus: at });
  document.querySelector('#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  return DraftEditor.pending;
}, { n, text });
const pending = await Promise.all([fast(A, 55, 'ANNA '), fast(B, 75, 'BRUNO ')]);
for (const p of [A, B]) await p.page.waitForFunction(() => !DraftEditor.pending && DraftEditor.state().source.includes('ANNA controlla') && DraftEditor.state().source.includes('BRUNO controlla'), null, { timeout: 20000 });
a = await src(A); b = await src(B);
check('long document: pending local edits converge without losing either writer', pending.every(Boolean) && a === b, JSON.stringify({ pending, same: a === b }));
await A.page.evaluate(() => DraftSafe.saveLocal(true));
check('long shared document: saved file includes both writers', await A.page.evaluate(async () => DraftComments.unpack(await (await DraftSafe.disk.handle.getFile()).text()).source === DraftEditor.state().source));

finish(results, errors);
await browser.close(); php.kill();
