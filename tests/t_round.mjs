// Revision passes chosen when recording starts, closing revisions from the
// menu, unique help labels, share icon at the right end of the toolbar.
import { open } from './lib.mjs';
const t = await open({ width: 1600, height: 900 });
const page = t.page;
const docState = () => page.evaluate(() => { const d = window.DraftEditor.state().document; return { tracking: d.revisions.tracking, locked: !!d.locks, ranges: d.revisions.ranges.length, manual: d.revisions.manual.length }; });
const flip = () => page.evaluate(() => document.querySelector('#revisionTrackingSwitch').click()).then(() => page.waitForTimeout(300));
const dialogButtons = () => page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].map(b => b.textContent));
const choose = label => page.evaluate(l => [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent === l).click(), label).then(() => page.waitForTimeout(300));
await t.load('Title\n\nINT. CASA - GIORNO\n\nLuca entra.\n\nFABIO\nCiao.\n\nFine.');

await flip();
t.check('first start: no question, recording and lock on', (await dialogButtons()).length === 0 && (await docState()).tracking && (await docState()).locked, JSON.stringify(await docState()));
await t.caretAfter('Ciao.'); await t.type(' Come stai?');
await flip();
let d = await docState();
t.check('switch off keeps bands and lock', !d.tracking && d.ranges > 0 && d.locked, JSON.stringify(d));
await flip();
t.check('switch on over bands asks continue / new / cancel', JSON.stringify(await dialogButtons()) === JSON.stringify(['Annulla', 'Inizia un nuovo giro', 'Continua il giro']), JSON.stringify(await dialogButtons()));
await choose('Annulla');
d = await docState();
const sw = await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').checked);
t.check('Annulla leaves recording off and the switch off', !d.tracking && !sw && d.ranges > 0, JSON.stringify(d) + ' switch ' + sw);
await flip(); await choose('Continua il giro');
d = await docState();
t.check('Continua il giro keeps the bands', d.tracking && d.ranges > 0 && d.locked, JSON.stringify(d));
await flip(); await flip(); await choose('Inizia un nuovo giro');
d = await docState();
t.check('Inizia un nuovo giro clears bands, keeps recording and lock', d.tracking && d.ranges === 0 && d.manual === 0 && d.locked, JSON.stringify(d));
await t.caretAfter('Fine.'); await t.type(' Davvero.');
await page.evaluate(() => document.querySelector('#closeRevisionsBtn').click()); await page.waitForTimeout(300);
d = await docState();
t.check('Chiudi le revisioni: no bands, not recording, numbering free', !d.tracking && !d.locked && d.ranges === 0 && d.manual === 0, JSON.stringify(d));
await page.keyboard.press('Meta+z'); await page.waitForTimeout(300);
d = await docState();
t.check('closing the revisions can be undone (bands and numbering come back)', d.locked && d.ranges > 0, JSON.stringify(d));

const labels = await page.evaluate(() => ({ menu: [...document.querySelectorAll('.menu-bar button')].map(b => b.textContent.trim()).filter(x => /uggeriment|sviluppatore|avvisi/i.test(x)),
  newPass: !!document.querySelector('#revisionNewBtn, [data-command="revisionNewBtn"]') }));
t.check('help menu labels are distinct, no "Nuovo giro" command', labels.menu.some(x => x.startsWith('Controllo della sintassi: avvisi')) && labels.menu.includes('Scrivi allo sviluppatore…') && !labels.menu.some(x => /^Suggerimenti/.test(x)) && !labels.newPass, JSON.stringify(labels));
const share = await page.evaluate(() => { const bar = document.querySelector('.editor-toolbar').getBoundingClientRect(), b = document.querySelector('.editor-toolbar .toolbar-share').getBoundingClientRect(); return { right: Math.round(bar.right - b.right), visible: b.width > 0 }; });
t.check('share icon at the right end of the toolbar', share.visible && share.right < 40, JSON.stringify(share));
await page.evaluate(() => document.querySelector('.editor-toolbar .toolbar-share').click()); await page.waitForTimeout(400);
const title = await page.evaluate(() => document.querySelector('dialog[open] h1, dialog[open] h2')?.textContent);
t.check('share icon opens the share dialog', title === 'Condividi', title);
await page.screenshot({ path: (await import('node:path')).join((await import('node:os')).tmpdir(), 'round-bar.png'), clip: { x: 900, y: 100, width: 700, height: 70 } });
t.report(); await t.close();
