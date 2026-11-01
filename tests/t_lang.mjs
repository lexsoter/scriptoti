// 0.30: English interface from the browser language, Italian by default for
// Italian browsers, the View menu switch, and the script text never touched.
import { open } from './lib.mjs';
const script = 'Title: Prova\n\nINT. CUCINA - NOTTE\n\nMarta apre il frigorifero. Annulla tutto.\n\nMARTA\nSalva il latte.\n\nstacco su:\n\n';
let t = await open({ locale: 'en-US' });
await t.load(script); await t.page.waitForTimeout(300);
let info = await t.page.evaluate(() => ({
  lang: document.documentElement.lang, newDoc: document.querySelector('#newBtn')?.textContent.trim(),
  stats: document.querySelector('.stats').innerText, selector: document.querySelector('#uiLanguage').value,
  manual: window.ScripTotiManual.sections[0].title, spell: document.querySelector('#spellLanguage').value
}));
t.check('English browser: English interface', info.lang === 'en' && info.newDoc === 'New document' && /Page 1 of/.test(info.stats) && info.selector === 'en', JSON.stringify(info));
t.check('English manual and spelling', info.manual === 'Getting started' && info.spell === 'en', JSON.stringify(info));
const manual = await t.page.evaluate(() => Object.fromEntries(ScripTotiManual.entries.filter(e => ['telefono', 'dettatura', 'forzare', 'parentetica'].includes(e.id)).map(e => [e.id, e.body.join(' ')])));
t.check('English phone manual describes the current menu, strip and preview', manual.telefono.includes('from the left') && manual.telefono.includes('swipe left') && manual.telefono.includes('replace the buttons after SmartTab') && manual.telefono.includes('searches without replacing'));
t.check('English dictation manual includes editing buttons and late-result safety', manual.dettatura.includes('Backspace') && manual.dettatura.includes('Delete') && manual.dettatura.includes('discards late phrases'));
t.check('English manual explains the new cycle and both dialogue line breaks', manual.forzare.includes('Action → Character → Transition → Scene heading → Action') && manual.parentetica.includes('[[Shift+Enter]]') && manual.parentetica.includes('middle of a line') && manual.parentetica.includes('One [[Mod+Z]]'));
t.check('English manual explains the visible page and dictation startup', manual.telefono.includes('first visible line') && manual.telefono.includes('12A') && manual.dettatura.includes('before the first phrase'));

t.check('the script text is never translated', (await t.src()) === script.replace(/\n+$/, '\n\n') || (await t.src()).includes('Annulla tutto.') && (await t.src()).includes('Salva il latte.'), JSON.stringify((await t.src()).slice(0, 120)));
const pageText = await t.page.evaluate(() => document.querySelector('#stage').innerText);
t.check('the pages show the Italian text as written', pageText.includes('Annulla tutto.') && pageText.includes('Salva il latte.'), pageText.slice(0, 160));
const lint = await t.page.evaluate(() => { window.DraftHelp.setLint?.(true); window.DraftHelp.runLint?.(); window.DraftHelp.openPanel('lint'); return new Promise(r => setTimeout(() => r(document.querySelector('.help-panel, #helpPanel, aside')?.innerText || ''), 500)); });
t.check('syntax check messages in English', /looks like a transition/.test(lint) && !/sembra una transizione/.test(lint), lint.slice(0, 200));

const composed = await t.page.evaluate(() => ['Stai già usando l’ultima versione (0.30.0).', 'Controllo della sintassi: avvisi (3)…', 'Condiviso · invio… (3 online)', 'Salva (Cmd+Maiusc+S)'].map(x => window.ScripTotiI18n.t(x)));
t.check('texts with a value in brackets are translated', composed.join(' | ') === 'You are already using the latest version (0.30.0). | Syntax check: warnings (3)… | Shared · sending… (3 online) | Save (Cmd+Shift+S)', composed.join(' | '));
// Enter conventions still work: Italian transitions are understood.
await t.caret((await t.src()).length); await t.type('cut to:'); await t.press('Enter');
t.check('conventions unchanged in English', (await t.src()).includes('>CUT TO:'), JSON.stringify((await t.src()).slice(-30)));
// Switch to Italian from the menu: the page reloads in Italian.
t.page.on('dialog', d => d.accept()); // the unsaved draft asks before leaving, like any reload
await Promise.all([t.page.waitForEvent('load'), t.page.evaluate(() => { const s = document.querySelector('#uiLanguage'); s.value = 'it'; s.dispatchEvent(new Event('change')); })]);
await t.page.waitForTimeout(700);
info = await t.page.evaluate(() => ({ lang: document.documentElement.lang, newDoc: document.querySelector('#newBtn')?.textContent.trim() }));
t.check('switching to Italian reloads in Italian', info.lang === 'it' && info.newDoc === 'Nuovo documento', JSON.stringify(info));
t.check('no page errors in English', !t.errors.length, JSON.stringify(t.errors));
t.report(); await t.close();

// An Italian browser gets Italian, a French one English.
for (const [locale, want] of [['it-IT', 'it'], ['fr-FR', 'en']]) {
  t = await open({ locale });
  const lang = await t.page.evaluate(() => document.documentElement.lang);
  t.check(`${locale} browser -> ${want}`, lang === want, lang);
  if (locale === 'it-IT') {
    // Every manual page has its English twin with the same number of paragraphs:
    // a page changed in Italian but not in English shows up here.
    const fs = await import('node:fs');
    const en = Object.assign({}, ...fs.readdirSync('../i18n').filter(f => /^en-manuale/.test(f)).map(f => JSON.parse(fs.readFileSync('../i18n/' + f, 'utf8'))));
    const pages = await t.page.evaluate(() => window.ScripTotiManual.entries.map(e => [e.id, e.body.length]));
    const stale = pages.filter(([id, n]) => !en[id] || en[id].body.length !== n).map(([id]) => id);
    t.check('English manual covers every Italian page', !stale.length, stale.join(', '));
    const phone = await t.page.evaluate(() => ScripTotiManual.entries.find(e => e.id === 'telefono').body.join(' '));
    t.check('Italian phone manual describes the current menu, strip and preview', phone.includes('da sinistra') && phone.includes('scorri verso sinistra') && phone.includes('posto dei pulsanti dopo SmartTab') && phone.includes('senza sostituire'));
    const updated = await t.page.evaluate(() => Object.fromEntries(ScripTotiManual.entries.filter(e => ['forzare', 'parentetica', 'dettatura'].includes(e.id)).map(e => [e.id, e.body.join(' ')])));
    t.check('Italian manual explains the new cycle and both dialogue line breaks', updated.forzare.includes('Azione → Personaggio → Transizione → Scena → Azione') && updated.parentetica.includes('[[Shift+Invio]]') && updated.parentetica.includes('in mezzo alla riga') && updated.parentetica.includes('Un solo [[Mod+Z]]'));
    t.check('Italian manual explains the visible page and dictation startup', phone.includes('prima riga visibile') && phone.includes('12A') && updated.dettatura.includes('prima della prima frase'));
  }
  t.report(); await t.close();
}
