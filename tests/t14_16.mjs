// Points 14-16: highlighter and eraser, "Registra revisioni" switch, automatic
// page and scene lock with the unlock only in the Revisione menu.
import { open } from './lib.mjs';
const t = await open();
const page = t.page;
const docState = () => page.evaluate(() => { const d = window.DraftEditor.state().document; return { tracking: d.revisions.tracking, locked: !!d.locks, ranges: d.revisions.ranges, manual: d.revisions.manual }; });
const tool = cmd => page.evaluate(c => document.querySelector(`.editor-toolbar [data-command="${c}"], .revision-tools [data-command="${c}"]`)?.click(), cmd);
await t.load('Title\n\nINT. CASA - GIORNO\n\nLuca entra e si siede al tavolo.\n\nFABIO\nCiao Luca, come stai oggi?\n\nFine della scena.');

const bar = await page.evaluate(() => {
  const g = document.querySelector('.revision-tools');
  return { switch: !!g.querySelector('#revisionTrackingSwitch[role=switch]'), lock: !!g.querySelector('[data-command="productionLockBtn"]'), mark: !!g.querySelector('[data-command="manualRevisionBtn"]'), erase: !!g.querySelector('[data-command="eraseRevisionBtn"]'),
    icons: [...g.querySelectorAll('[data-command="manualRevisionBtn"] svg, [data-command="eraseRevisionBtn"] svg')].map(s => s.innerHTML), menuLock: !!document.querySelector('.menu-bar #closeRevisionsBtn'), menuErase: document.querySelector('.menu-bar #eraseRevisionBtn')?.textContent };
});
t.check('14/15/16 toolbar: switch, highlighter, eraser, no lock icon; lock still in the menu', bar.switch && bar.mark && bar.erase && !bar.lock && bar.icons.length === 2 && bar.icons[0] !== bar.icons[1] && bar.menuLock && bar.menuErase, JSON.stringify(bar));

// 15/16 the switch starts recording and locks pages and scenes
await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').click()); await page.waitForTimeout(300);
let d = await docState();
const sw = await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').checked);
t.check('15 switch on: recording on, pages and scenes locked', d.tracking && d.locked && sw, JSON.stringify(d) + ' switch ' + sw);
await t.caretAfter('come stai oggi'); await t.type(' davvero');
d = await docState();
t.check('15 typing while recording leaves a revision band', d.ranges.length > 0, JSON.stringify(d.ranges));

// 14 eraser removes the recorded band from the selection only
const s1 = await t.src(), a = s1.indexOf('Ciao Luca'), b = s1.indexOf('davvero') + 'davvero'.length;
await t.caret(a, b); await tool('eraseRevisionBtn'); await page.waitForTimeout(250);
d = await docState();
t.check('14 eraser takes the recorded band away', !d.ranges.some(r => r.start < b && r.end > a), JSON.stringify(d.ranges));

// 14 highlighter marks, eraser removes part of it
const s2 = await t.src(), m1 = s2.indexOf('Luca entra'), m2 = s2.indexOf('tavolo.') + 7;
await t.caret(m1, m2); await tool('manualRevisionBtn'); await page.waitForTimeout(250);
d = await docState();
t.check('14 highlighter marks the selection', d.manual.some(r => r.start <= m1 && r.end >= m2), JSON.stringify(d.manual));
const e1 = s2.indexOf('si siede'), e2 = e1 + 'si siede'.length;
await t.caret(e1, e2); await tool('eraseRevisionBtn'); await page.waitForTimeout(250);
d = await docState();
t.check('14 eraser removes only the selected part of a mark', !d.manual.some(r => r.start < e2 && r.end > e1) && d.manual.some(r => r.start <= m1 && r.end >= e1) && d.manual.some(r => r.end >= m2 && r.start <= e2), JSON.stringify(d.manual));
const before = JSON.stringify(await docState());
await t.caret(s2.indexOf('Fine della')); await tool('eraseRevisionBtn'); await page.waitForTimeout(250);
const toast = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(n => n.textContent).join(' '));
t.check('14 eraser without a selection does nothing', JSON.stringify(await docState()) === before, toast);

await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').click()); await page.waitForTimeout(300);
d = await docState();
t.check('15 switch off stops recording', !d.tracking && !(await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').checked)), JSON.stringify(d));
// switching on again over existing bands asks; continue keeps them
await page.evaluate(() => document.querySelector('#revisionTrackingSwitch').click()); await page.waitForTimeout(300);
await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent === 'Continua il giro')?.click()); await page.waitForTimeout(300);
d = await docState();
t.check('16 switching on again locks again', d.tracking && d.locked, JSON.stringify(d));

t.report();
await t.close();
