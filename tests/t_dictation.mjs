// 0.35: dictation. A fake recogniser stands in for the browser's; spoken
// text and commands must reach the document like typing does.
import { open } from './lib.mjs';
const fake = () => {
  class FakeRecognition {
    constructor() { window.__rec = this; (window.__recs ||= []).push(this); }
    start() { window.__starts = (window.__starts || 0) + 1; }
    stop() { window.__stops = (window.__stops || 0) + 1; if (!window.__deferEnd) setTimeout(() => this.onend?.(), 0); }
    abort() { this.aborted = true; }
  }
  window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
  window.__say = (text, final = true) => { const result = [{ transcript: text }]; result.isFinal = final; window.__rec.onresult({ resultIndex: 0, results: [result] }); };
};
const say = async (t, text, final = true) => { await t.page.evaluate(([x, f]) => window.__say(x, f), [text, final]); await t.page.waitForTimeout(150); };

async function controls(t) {
  await t.load('!abcdefghij.\n'); await t.caretAfter('abc');
  const original = await t.src();
  await t.page.locator('.dictate-back').click();
  t.check('dictation Backspace deletes backwards', (await t.src()).includes('abdefghij.'), JSON.stringify(await t.src()));
  await t.page.evaluate(() => [...document.querySelectorAll('.dictate-actions button')].find(b => b.textContent === 'Annulla').click());
  t.check('dictation deletion can be undone', await t.src() === original);
  await t.caretAfter('abc'); await t.page.locator('.dictate-forward').click();
  t.check('dictation Delete removes the following character', (await t.src()).includes('abcefghij.'), JSON.stringify(await t.src()));
  await t.caret((await t.src()).trimEnd().length); const beforeEnter = await t.src();
  await t.page.locator('.dictate-enter').click();
  t.check('dictation A capo uses the paragraph command', (await t.src()).length > beforeEnter.length, JSON.stringify(await t.src()));
  await t.page.evaluate(() => [...document.querySelectorAll('.dictate-actions button')].find(b => b.textContent === 'Annulla').click());
  t.check('dictation A capo can be undone', await t.src() === beforeEnter);
  for (const direction of ['back', 'forward']) {
    await t.load('!abcdefghijklmnopqrstuvwx.\n'); await t.caretAfter(direction === 'back' ? 'abcdefghijklmnopqrstuvwx' : 'abc');
    const before = await t.src(), button = await t.page.locator('.dictate-' + direction).boundingBox();
    await t.page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await t.page.mouse.down(); await t.page.waitForTimeout(650); await t.page.mouse.up();
    const after = await t.src(); await t.page.waitForTimeout(220);
    t.check('holding ' + direction + ' repeats, releasing stops', before.length - after.length >= 3 && await t.src() === after, JSON.stringify({ before, after }));
  }
  t.check('dictation buttons preserve editor focus', await t.page.evaluate(() => document.querySelector('#stage').contains(document.activeElement)));
}

// Computer.
let t = await open();
await t.context.addInitScript(fake); await t.page.reload(); await t.page.waitForTimeout(600);
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
t.check('computer: microphone button shown when the browser can listen', await t.page.locator('#dictateBtn').isVisible());
await t.page.click('#dictateBtn');
t.check('computer: listening panel opens', await t.page.locator('#dictatePanel').isVisible() && await t.page.evaluate(() => window.__rec?.lang) === 'it-IT');
await say(t, 'Apre il frigorifero.');
t.check('text goes in at the caret', (await t.src()).includes('Apre il frigorifero.'), JSON.stringify((await t.src()).slice(-40)));
await say(t, 'Personaggio Marta chi ha finito il latte?');
let src = await t.src();
t.check('"personaggio Marta" makes a cue and the rest is dialogue', /MARTA\n[Cc]hi ha finito il latte\?/.test(src), JSON.stringify(src.slice(-60)));
await say(t, 'Nuova scena, interno cucina, notte.');
src = await t.src();
t.check('"nuova scena interno cucina notte" makes a heading', /\n\n\.?INT\. CUCINA - NOTTE\n/.test(src), JSON.stringify(src.slice(-60)));
await say(t, 'Marta apre il frigo. Stacco.');
src = await t.src();
t.check('"stacco" makes a transition', src.includes('Marta apre il frigo.') && /\n>STACCO SU:\n/.test(src), JSON.stringify(src.slice(-60)));
await say(t, 'Annulla.');
src = await t.src();
t.check('"annulla" undoes the last step', !/>STACCO SU:/.test(src), JSON.stringify(src.slice(-60)));
await say(t, 'sto ancora parlando', false);
t.check('provisional text shows in the panel, not in the document', (await t.page.locator('#dictatePanel').innerText()).includes('sto ancora parlando') && !(await t.src()).includes('sto ancora parlando'));
await t.page.waitForTimeout(1600);
t.check('after a pause the phrase is finished (recogniser stopped and restarted)', await t.page.evaluate(() => window.__stops >= 1 && window.__starts >= 2));
await controls(t);
await t.page.click('.dictate-stop');
t.check('Fine closes the panel', !(await t.page.locator('#dictatePanel').isVisible()));
t.check('no page errors', !t.errors.length, JSON.stringify(t.errors));
t.report(); await t.close();

// Phone: the keyboard stays closed while dictating.
t = await open({ width: 390, height: 844, hasTouch: true, isMobile: true });
await t.context.addInitScript(fake); await t.page.reload(); await t.page.waitForTimeout(600);
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.page.waitForTimeout(300);
t.check('phone: floating microphone shown', await t.page.locator('#dictateFab').isVisible());
await t.load(Array.from({ length: 130 }, (_, i) => '!Paragrafo ' + i + '. Una riga lunga da rileggere con calma.').join('\n\n') + '\n');
await t.caret((await t.src()).trimEnd().length);
await t.page.locator('#stage').evaluate(stage => { stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -10000 })); stage.scrollTop = 0; });
await t.page.waitForFunction(() => document.querySelector('#stage').scrollTop === 0);
const beforeMicrophone = await t.src();
t.check('phone: dictation starts with an off-screen caret', await t.page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().top > innerHeight));
await t.page.locator('#dictateFab').tap();
await t.page.waitForFunction(() => {
  const panel = document.querySelector('#dictatePanel'), selection = getSelection();
  if (panel.hidden || !selection.rangeCount) return false;
  const caret = selection.getRangeAt(0).getBoundingClientRect();
  return caret.height > 0 && caret.top >= document.querySelector('#stage').getBoundingClientRect().top && caret.bottom < panel.getBoundingClientRect().top;
});
t.check('phone: starting dictation reveals the caret above the panel before any phrase', await t.src() === beforeMicrophone);

t.check('phone: no keyboard while dictating (inputmode none) and panel open', await t.page.evaluate(() => document.querySelector('#phoneWriter').getAttribute('inputmode')) === 'none' && await t.page.locator('#dictatePanel').isVisible());
await say(t, 'Fuori piove.');
t.check('phone: dictated text reaches the document', (await t.src()).includes('Fuori piove.'), JSON.stringify((await t.src()).slice(-30)));
await controls(t);
t.check('phone: editing buttons keep the keyboard closed', await t.page.evaluate(() => document.querySelector('#phoneWriter').getAttribute('inputmode') === 'none'));
const panel = await t.page.evaluate(() => {
  const buttons = [...document.querySelectorAll('.dictate-actions button')].map(b => b.getBoundingClientRect());
  return { rows: new Set(buttons.map(b => b.top)).size, fit: buttons.every(b => b.left >= 0 && b.right <= innerWidth && b.height >= 44) };
});
t.check('phone: dictation controls fit in two touch-sized rows', panel.rows === 2 && panel.fit, JSON.stringify(panel));
await t.load(Array.from({ length: 130 }, (_, i) => '!Paragrafo ' + i + '. Una riga lunga da rileggere con calma.').join('\n\n') + '\n');
await t.caret((await t.src()).trimEnd().length); await say(t, 'Una frase finale da vedere.');
await t.page.waitForFunction(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return r.height > 0 && r.bottom < document.querySelector('#dictatePanel').getBoundingClientRect().top; });
const visible = await t.page.evaluate(() => {
  const selection = getSelection(), rect = selection.getRangeAt(0).getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: rect.height, panel: document.querySelector('#dictatePanel').getBoundingClientRect().top, stage: document.querySelector('#stage').getBoundingClientRect().top };
});
t.check('phone: dictated caret stays above the panel in a long document', visible.height > 0 && visible.top >= visible.stage && visible.bottom < visible.panel, JSON.stringify(visible));
await t.page.locator('.dictate-keyboard').tap(); await t.page.waitForTimeout(200);
t.check('phone: Tastiera stops dictation and gives the keyboard back', !(await t.page.locator('#dictatePanel').isVisible()) && await t.page.evaluate(() => !document.querySelector('#phoneWriter').hasAttribute('inputmode')));
t.check('phone: no page errors', !t.errors.length, JSON.stringify(t.errors));
t.report(); await t.close();

// Exact and fuzzy character names must preserve every following dialogue word.
t = await open();
for (const [lang, command, rest] of [
  ['it-IT', 'Personaggio', 'è tardi.'], ['it-IT', 'Personaggio', 'e poi?'],
  ['it-IT', 'Personaggio', 'a casa.'], ['it-IT', 'Personaggio', 'ha ragione.'],
  ['en-US', 'Character', 'I agree.'], ['en-US', 'Character', 'a moment.']
]) {
  const steps = await t.page.evaluate(([lang, command, rest]) => window.DraftDictation.parse(command + ' Francesca ' + rest, { lang, names: ['FRANCESCA', 'FRANCESCA ELI', 'MARIA GRAZIA'] }), [lang, command, rest]);
  t.check('character preserves ' + JSON.stringify(rest), steps.length === 2 && steps[0].text === 'FRANCESCA' && steps[1].text === rest, JSON.stringify(steps));
}
for (const [spoken, name, rest] of [
  ['Maria Grazia è tardi.', 'MARIA GRAZIA', 'è tardi.'],
  ['Francecsa è tardi.', 'FRANCESCA', 'è tardi.'],
  ['Maria Grasia ha ragione.', 'MARIA', 'Grasia ha ragione.'],
  ['Maria è qui.', 'MARIA', 'è qui.']
]) {
  const steps = await t.page.evaluate(spoken => window.DraftDictation.parse('Personaggio ' + spoken, { names: ['FRANCESCA', 'MARIA', 'MARIA GRAZIA'] }), spoken);
  t.check('character recognises ' + spoken, steps.length === 2 && steps[0].text === name && steps[1].text === rest, JSON.stringify(steps));
}
const compound = await t.page.evaluate(() => window.DraftDictation.parse('Personaggio Maria Grasia ha ragione.', { names: ['MARIA GRAZIA'] }));
t.check('compound typo still recognised without a shorter exact name', compound[0].text === 'MARIA GRAZIA' && compound[1].text === 'ha ragione.', JSON.stringify(compound));
t.report(); await t.close();

// Late speech must never cross a document or a recogniser boundary.
for (const phone of [false, true]) {
  t = await open(phone ? { width: 390, height: 844, hasTouch: true, isMobile: true } : {});
  await t.context.addInitScript(fake); await t.page.reload(); await t.page.waitForTimeout(600);
  await t.page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for (const [name, text] of [['voice-b.fountain', '!Documento B intatto.\n'], ['voice-a.fountain', '!Documento A.\n']]) {
      const handle = await root.getFileHandle(name, { create: true }), writer = await handle.createWritable();
      await writer.write(text); await writer.close(); await window.DraftSafe.openHandle(handle);
      window[name === 'voice-a.fountain' ? '__voiceA' : '__voiceB'] = window.DraftSafe.activeId;
    }
    window.__deferEnd = true;
  });
  const tag = phone ? 'phone' : 'computer';
  const start = async () => { await t.caret((await t.src()).trimEnd().length); await t.page.evaluate(() => document.querySelector('#dictateBtn').click()); };
  const late = () => t.page.evaluate(() => {
    const result = [{ transcript: 'TESTO TARDIVO.' }]; result.isFinal = true;
    window.__oldRec.onresult({ resultIndex: 0, results: [result] });
  });
  const intact = async label => {
    await t.page.waitForTimeout(2200);
    const state = await t.page.evaluate(async () => ({
      source: window.DraftEditor.state().source,
      raw: await (await (await (await navigator.storage.getDirectory()).getFileHandle('voice-b.fountain')).getFile()).text()
    }));
    t.check(tag + ': ' + label + ' keeps B and its saved file intact', state.source === '!Documento B intatto.\n' && state.raw === '!Documento B intatto.\n', JSON.stringify(state));
  };
  for (const how of ['Fine then open', 'New', 'tab switch', 'previous session']) {
    await t.page.evaluate(() => window.DraftSafe.switchProject(window.__voiceA));
    await start(); await t.page.evaluate(() => { window.__oldRec = window.__rec; });
    if (how === 'Fine then open' || how === 'previous session') await t.page.evaluate(() => document.querySelector('.dictate-stop').click());
    if (how === 'New') {
      await t.page.evaluate(() => document.querySelector('#newBtn').click()); await t.page.waitForTimeout(200);
      const blank = await t.src(); await late();
      t.check(tag + ': New closes dictation and ignores late speech', await t.src() === blank && !(await t.page.locator('#dictatePanel').isVisible()));
    }
    if (how === 'Fine then open') await t.page.evaluate(async () => window.DraftSafe.openHandle(await (await navigator.storage.getDirectory()).getFileHandle('voice-b.fountain')));
    else await t.page.evaluate(() => window.DraftSafe.switchProject(window.__voiceB));
    if (how === 'previous session') await start();
    await late(); await intact(how);
    if (how !== 'previous session') t.check(tag + ': ' + how + ' closes the dictation panel', !(await t.page.locator('#dictatePanel').isVisible()));
    else {
      await t.page.evaluate(() => { window.__oldRec.onerror?.({ error: 'not-allowed' }); window.__oldRec.onend?.(); });
      t.check(tag + ': stale error/end cannot stop the new session', await t.page.locator('#dictatePanel').isVisible());
      await t.page.evaluate(() => document.querySelector('.dictate-stop').click());
    }
  }
  // The document id alone is not enough: a new session in B retires the old one.
  await start(); await t.page.evaluate(() => { window.__oldRec = window.__rec; document.querySelector('.dictate-stop').click(); });
  await start(); await late(); await intact('new recogniser in the same document');
  t.check(tag + ': old recogniser was aborted', await t.page.evaluate(() => window.__oldRec.aborted === true));
  // The same session also replaces its recogniser after an idle restart.
  await t.page.evaluate(() => { window.__oldRec = window.__rec; window.__rec.onend(); });
  await t.page.waitForTimeout(180); await late(); await intact('old recogniser after restart');
  t.check(tag + ': recogniser restarted without accepting its predecessor', await t.page.evaluate(() => window.__rec !== window.__oldRec) && await t.page.locator('#dictatePanel').isVisible());
  await t.page.evaluate(() => document.querySelector('.dictate-stop').click());
  // Finishing in the original document still takes the recogniser's final phrase.
  await t.page.evaluate(() => window.DraftSafe.switchProject(window.__voiceA)); await start();
  await t.page.evaluate(() => document.querySelector('.dictate-stop').click());
  await say(t, 'Frase finale.');
  t.check(tag + ': final result between stop and end stays in its original document', (await t.src()).includes('Frase finale.'));
  await t.page.evaluate(() => window.__rec.onend());
  const ended = await t.src(); await say(t, 'Dopo end.');
  t.check(tag + ': results after end are discarded', await t.src() === ended);
  t.report(); await t.close();
}
