// Points 9, 11, 12: page number in the bottom bar, spaces in suggestions,
// "Apparso prima a pag. x scena x" for character names.
import { open } from './lib.mjs';
const t = await open();
const filler = n => Array.from({ length: n }, (_, i) => `Azione numero ${i + 1} che riempie la pagina.`).join('\n\n');
const script = 'Title\n\nINT. CASA - GIORNO\n\nNevio, nell\'ombra, entra.\n\nNEVIO\nCiao.\n\n' + filler(40) + '\n\nEST. BAR - NOTTE\n\nFABIO entra di corsa.\n\nFABIO\nEccomi.\n\n' + filler(10) + '\n\n';

// 9. Page indicator
await t.load(script);
await t.caret(10);
let info = await t.page.evaluate(() => ({ text: document.querySelector('#currentPage')?.textContent, inFooter: !!document.querySelector('.stats #currentPage'), inTop: !!document.querySelector('.menu-end #currentPage'), saveStatus: !!document.querySelector('.menu-end #saveStatus') }));
t.check('9 page indicator in the bottom bar as "Pagina 1 di N"', /^Pagina 1 di [2-9]$/.test(info.text) && info.inFooter && !info.inTop && info.saveStatus, JSON.stringify(info));
await t.load('Title\n\nINT. CASA - GIORNO\n\n' + filler(90)); await t.caret(10);
await t.page.evaluate(() => { window.getSelection().removeAllRanges(); const s = document.querySelector('#stage'); s.scrollTop = s.scrollHeight; });
await t.page.waitForTimeout(400);
const last = await t.page.evaluate(() => document.querySelector('#currentPage').textContent);
t.check('9 scrolling to the end updates the current page', /^Pagina (\d+) di \1$/.test(last), last);
await t.load(script);
await t.caret((await t.src()).indexOf('Azione numero 3'), (await t.src()).indexOf('Azione numero 3') + 12);
info = await t.page.evaluate(() => ({ page: document.querySelector('#currentPage').textContent, scope: !document.querySelector('#statsScope').hidden }));
t.check('9 page and "Selezione" are both shown with a selection', /^Pagina \d+ di \d+$/.test(info.page) && info.scope, JSON.stringify(info));

// 12. First appearance hint
const popup = () => t.page.evaluate(() => { const p = document.querySelector('#completionPopup'); return p && !p.hidden ? Array.from(p.querySelectorAll('[role=option]')).map(b => b.textContent) : []; });
await t.caret((await t.src()).length);
await t.type('FA'); await t.page.waitForTimeout(300);
let items = await popup();
t.check('12 FABIO hint shows page and scene of its first appearance', items.some(i => /^FABIOApparso prima a pag\. [2-9] scena 2$/.test(i)), JSON.stringify(items));
await t.press('Escape');
await t.load(script); await t.caret((await t.src()).length);
await t.type('NE'); await t.page.waitForTimeout(300);
items = await popup();
t.check('12 NEVIO hint is page 1 scene 1, no description from the action', items.some(i => i === 'NEVIOApparso prima a pag. 1 scena 1'), JSON.stringify(items));
// the hint follows the current script: add a scene before FABIO's first one
await t.load(script.replace('EST. BAR - NOTTE', 'INT. AUTO - NOTTE\n\nUn viaggio.\n\nEST. BAR - NOTTE'));
await t.caret((await t.src()).length);
await t.type('FA'); await t.page.waitForTimeout(300);
items = await popup();
t.check('12 hint updates after edits (scene 3 now)', items.some(i => / scena 3$/.test(i) && i.startsWith('FABIO')), JSON.stringify(items));

// 11. Spaces in heading suggestions
const pick = async typed => {
  await t.load('Title\n\nINT. CASA - GIORNO\n\nLuca parla.\n\nEST. BAR - NOTTE\n\nFine.\n\n');
  await t.caret((await t.src()).length);
  await t.type(typed); await t.page.waitForTimeout(300);
  await t.press('Enter');
  const s = await t.src(); return s.slice(s.lastIndexOf('Fine.') + 7);
};
let out = await pick('EST. BAR -');
t.check('11 "-" without space -> "- NOTTE"', /^EST\. BAR - (NOTTE|GIORNO)/.test(out), JSON.stringify(out));
out = await pick('EST. BAR - ');
t.check('11 "- " with space -> one space only', /^EST\. BAR - (NOTTE|GIORNO)/.test(out), JSON.stringify(out));
out = await pick('EST. BAR -NO');
t.check('11 "-NO" -> "- NOTTE"', /^EST\. BAR - NOTTE/.test(out), JSON.stringify(out));
out = await pick('EST.');
t.check('11 location after "EST." gets its space', /^EST\. (BAR|CASA)/.test(out), JSON.stringify(out));
out = await pick('INT. CASA - GIORNO - CU');
t.check('11 no double spaces anywhere', !/ {2}/.test(out), JSON.stringify(out));

t.report();
await t.close();
