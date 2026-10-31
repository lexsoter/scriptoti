// Renaming as in Google Docs: click the name at the top or File → Rinomina….
// A linked file is renamed on the device too, keeps saving under its new name,
// and a name already used by another open screenplay is refused.
import { open } from './lib.mjs';
const t = await open(); const page = t.page;
const name = () => page.evaluate(() => ({ label: document.querySelector('#filename').textContent, session: window.DraftSafe.session.name }));
const files = () => page.evaluate(async () => { const out = {}; for await (const [n, h] of (await navigator.storage.getDirectory()).entries()) if (h.kind === 'file') out[n] = await (await h.getFile()).text(); return out; });
const rename = async (text, key = 'Enter', how = 'click') => {
  if (how === 'click') await page.click('#filename'); else await page.evaluate(() => document.querySelector('#renameFileBtn').click());
  await page.waitForSelector('.filename-input'); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(text); await page.keyboard.press(key); await page.waitForTimeout(800);
};
await t.load('!Una bozza.\n');
const before = await t.src();
await rename('Titolo provvisorio');
let n = await name();
t.check('draft: clicking the name renames it', n.session === 'Titolo provvisorio.fountain' && n.label === 'Titolo provvisorio.fountain', JSON.stringify(n));
t.check('typing the name does not touch the screenplay', (await t.src()) === before, JSON.stringify(await t.src()));
await rename('Non questo', 'Escape');
t.check('Escape keeps the old name', (await name()).session === 'Titolo provvisorio.fountain', JSON.stringify(await name()));

// A file on the device (the browser's private disk stands in for a folder).
await page.evaluate(async () => {
  const r = await navigator.storage.getDirectory();
  for (const [n, text] of [['a.fountain', '!Testo di A.\n'], ['c.fountain', '!Testo di C.\n']]) { const w = await (await r.getFileHandle(n, { create: true })).createWritable(); await w.write(text); await w.close(); }
  await window.DraftSafe.openHandle(await r.getFileHandle('c.fountain'));
  await window.DraftSafe.openHandle(await r.getFileHandle('a.fountain'));
});
await page.waitForTimeout(800);
await rename('Bozza finale', 'Enter', 'menu');
let f = await files();
t.check('File → Rinomina… renames the file on the device', f['Bozza finale.fountain'] === '!Testo di A.\n' && !('a.fountain' in f) && (await name()).label === 'Bozza finale.fountain', JSON.stringify(Object.keys(f)));
await t.caretAfter('Testo di A.'); await t.type(' Ancora.'); await page.waitForTimeout(3500);
f = await files();
t.check('it keeps saving under the new name', f['Bozza finale.fountain']?.includes('Testo di A. Ancora.') && !('a.fountain' in f), JSON.stringify(f));
await rename('c');
f = await files(); n = await name();
t.check('a name used by another open screenplay is refused, nothing replaced', f['c.fountain'] === '!Testo di C.\n' && 'Bozza finale.fountain' in f && n.session === 'Bozza finale.fountain', JSON.stringify(Object.keys(f)) + ' ' + JSON.stringify(n));
await rename('nome/sbagliato');
t.check('an invalid name is refused', (await name()).session === 'Bozza finale.fountain', JSON.stringify(await name()));
await page.reload(); await page.waitForTimeout(2500);
const st = await page.evaluate(() => ({ name: window.DraftSafe.session?.name, status: document.querySelector('#saveStatus').textContent.trim(), tabs: [...document.querySelectorAll('.project-tab button:first-child')].map(b => b.textContent) }));
t.check('after reopening: new name, still linked to the file', st.tabs.includes('Bozza finale') && /Salvato sul file/.test(st.status), JSON.stringify(st));
t.report();
await t.close();
