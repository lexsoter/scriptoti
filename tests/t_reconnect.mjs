// Appunti 31 ottobre: reopening ScripToti must relink files by itself, ask for
// permission on the first key when needed, and never overwrite outside edits.
import { open } from './lib.mjs';
const t = await open(); const page = t.page;
const status = () => page.evaluate(() => document.querySelector('#saveStatus')?.textContent.trim());
const disk = () => page.evaluate(async () => { const r = await navigator.storage.getDirectory(); return (await (await r.getFileHandle('r.fountain')).getFile()).text(); });
const reload = async () => { await page.reload(); await page.waitForTimeout(2500); };
await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('r.fountain', { create: true }); const w = await h.createWritable(); await w.write('!Primo.\n'); await w.close(); await window.DraftSafe.openHandle(h); });
await page.waitForTimeout(800);
await t.caretAfter('Primo.'); await t.type(' Secondo.'); await page.waitForTimeout(3500);
t.check('typing autosaves to the file', (await disk()).includes('Primo. Secondo.'), await disk());
await reload();
let st = await status();
t.check('1 after reopening, the file is linked by itself', /Salvato sul file/.test(st), st);
await t.caretAfter('Secondo.'); await t.type(' Terzo.'); await page.waitForTimeout(3500);
t.check('1 and it keeps saving without pressing Save', (await disk()).includes('Secondo. Terzo.'), await disk());
// The file changes outside while ScripToti is closed, and the window had unsaved text.
await page.evaluate(() => { window.DraftSafe.saveLocal = async () => false; });
await t.type(' Mai salvato.'); await page.waitForTimeout(300);
await page.evaluate(() => window.DraftSafe.persistAll());
await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const w = await (await r.getFileHandle('r.fountain')).createWritable(); await w.write('!Cambiato da fuori.\n'); await w.close(); });
await reload();
st = await status();
t.check('1 outside change + unsaved text: conflict, nothing overwritten', (await disk()) === '!Cambiato da fuori.\n' && /Conflitto/.test(st), st + ' / ' + JSON.stringify(await disk()));
await t.close();

// Permission not kept: asked on the first key, not before.
const u = await open(); const p = u.page;
await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); const h = await r.getFileHandle('q.fountain', { create: true }); const w = await h.createWritable(); await w.write('!Uno.\n'); await w.close(); await window.DraftSafe.openHandle(h); });
await p.waitForTimeout(1500);
await p.addInitScript(() => { window.__asked = 0; let granted = false; const P = FileSystemHandle.prototype; P.queryPermission = async () => granted ? 'granted' : 'prompt'; P.requestPermission = async () => { window.__asked++; granted = true; return 'granted'; }; });
await p.reload(); await p.waitForTimeout(2500);
const before = { asked: await p.evaluate(() => window.__asked), status: await p.evaluate(() => document.querySelector('#saveStatus').textContent.trim()) };
u.check('2 without permission: no question before a gesture, status asks to reconnect', before.asked === 0 && /riconnettere|autorizzare/.test(before.status), JSON.stringify(before));
await u.caretAfter('Uno.'); await p.keyboard.type(' Due.'); await p.waitForTimeout(3500);
const after = { asked: await p.evaluate(() => window.__asked), status: await p.evaluate(() => document.querySelector('#saveStatus').textContent.trim()), disk: await p.evaluate(async () => { const r = await navigator.storage.getDirectory(); return (await (await r.getFileHandle('q.fountain')).getFile()).text(); }) };
u.check('2 first key asks once, then the file is linked and saved', after.asked === 1 && after.disk.includes('Uno. Due.') && /Salvato sul file/.test(after.status), JSON.stringify(after));
t.report(); u.report(); await u.close();
