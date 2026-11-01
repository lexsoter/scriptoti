// 0.35: dictation. A fake recogniser stands in for the browser's; spoken
// text and commands must reach the document like typing does.
import { open } from './lib.mjs';
const fake = () => {
  class FakeRecognition {
    constructor() { window.__rec = this; }
    start() { window.__starts = (window.__starts || 0) + 1; }
    stop() { window.__stops = (window.__stops || 0) + 1; setTimeout(() => this.onend?.(), 0); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
  window.__say = (text, final = true) => { const result = [{ transcript: text }]; result.isFinal = final; window.__rec.onresult({ resultIndex: 0, results: [result] }); };
};
const say = async (t, text, final = true) => { await t.page.evaluate(([x, f]) => window.__say(x, f), [text, final]); await t.page.waitForTimeout(150); };

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
await t.page.click('.dictate-stop');
t.check('Fine closes the panel', !(await t.page.locator('#dictatePanel').isVisible()));
t.check('no page errors', !t.errors.length, JSON.stringify(t.errors));
t.report(); await t.close();

// Phone: the keyboard stays closed while dictating.
t = await open({ width: 390, height: 844, hasTouch: true, isMobile: true });
await t.context.addInitScript(fake); await t.page.reload(); await t.page.waitForTimeout(600);
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.page.waitForTimeout(300);
t.check('phone: floating microphone shown', await t.page.locator('#dictateFab').isVisible());
await t.page.locator('#dictateFab').tap(); await t.page.waitForTimeout(200);
t.check('phone: no keyboard while dictating (inputmode none) and panel open', await t.page.evaluate(() => document.querySelector('#phoneWriter').getAttribute('inputmode')) === 'none' && await t.page.locator('#dictatePanel').isVisible());
await say(t, 'Fuori piove.');
t.check('phone: dictated text reaches the document', (await t.src()).includes('Fuori piove.'), JSON.stringify((await t.src()).slice(-30)));
await t.page.locator('.dictate-keyboard').tap(); await t.page.waitForTimeout(200);
t.check('phone: Tastiera stops dictation and gives the keyboard back', !(await t.page.locator('#dictatePanel').isVisible()) && await t.page.evaluate(() => !document.querySelector('#phoneWriter').hasAttribute('inputmode')));
t.check('phone: no page errors', !t.errors.length, JSON.stringify(t.errors));
t.report(); await t.close();
