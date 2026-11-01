// Bugs 1-6 of 0.28.0: Backspace into dialogue, Enter inside dialogue,
// capital after Shift+Enter, "FABIO (36) lotta", redo after undo, two spaces.
import { open } from './lib.mjs';
const t = await open();
const base = 'Title\n\nINT. CASA - GIORNO\n\n';

// 1a. Backspace at the start of an action under a name in capitals joins them into a speech
await t.load(base + 'Luca parla.\n\nFABIO\n\nCiao, come stai.\n\nFine.');
await t.caretBefore('Ciao'); await t.press('Backspace');
let s = await t.src(), k = await t.kinds();
t.check('1a Backspace joins action under the name into dialogue', s.includes('FABIO\nCiao, come stai.') && k.includes('character:FABIO') && k.includes('dialogue:Ciao'), JSON.stringify(s) + ' ' + k);
await t.type('x');
s = await t.src();
t.check('1a typing after the join lands at the start of the dialogue', s.includes('FABIO\nxCiao') || s.includes('FABIO\nXCiao'), JSON.stringify(s));

// 1b. The same when FABIO was turned back into a character with Tab
await t.load(base + 'Luca parla.\n\nFABIO\n\nCiao, come stai.\n\nFine.');
await t.caretAfter('FABIO'); await t.press('Tab');
const afterTab = await t.src();
await t.caretBefore('Ciao'); await t.press('Backspace');
s = await t.src(); k = await t.kinds();
t.check('1b after Tab, Backspace joins the action into dialogue', /FABIO\nCiao, come stai\./.test(s) && k.includes('dialogue:Ciao'), JSON.stringify(afterTab) + ' -> ' + JSON.stringify(s) + ' ' + k);

// 2. Enter in the middle of a dialogue starts a new Action at once
await t.load(base + 'FABIO\nCiao, come stai.\n\nFine.');
await t.caretAfter('Ciao'); await t.press('Enter');
s = await t.src(); k = await t.kinds();
t.check('2 Enter mid-dialogue -> rest becomes Action', s.includes('FABIO\nCiao\n\n, come stai.') && k.includes('action:, come stai.'), JSON.stringify(s) + ' ' + k);

// 3. A parenthetical after Shift+Enter, then the ordinary dialogue capitals.
await t.load(base + 'FABIO\nProva. Yeah.\n\nFine.');
await t.caretAfter('Yeah.'); await t.press('Shift+Enter'); await t.type('piano'); await t.press(')'); await t.press('Enter'); await t.type('yeah.');
s = await t.src();
t.check('3 capital in dialogue after the Shift+Enter parenthetical', s.includes('Prova. Yeah.\n(piano)\nYeah.'), JSON.stringify(s));
await t.load(base + 'FABIO\nProva. Yeah.\n\nFine.');
await t.caretAfter('Yeah.'); await t.press('Shift+Enter'); await t.press(')'); await t.press('Enter'); await t.type('y'); await t.press('Meta+z');
s = await t.src();
t.check('3 undo after that capital gives back the lowercase', s.includes('Prova. Yeah.\n()\ny\n'), JSON.stringify(s));

// 4. "FABIO (36) lotta" typed as an action stays an action, in its own case
await t.load(base + 'Luca parla.\n\n');
await t.caret((await t.src()).length);
await t.type('FABIO (36) lotta con il cane.');
s = await t.src(); k = await t.kinds();
t.check('4 name (age) + lowercase text becomes Action', s.includes('FABIO (36) lotta con il cane.') && k.includes('action:FABIO (36) lotta'), JSON.stringify(s) + ' ' + k);
await t.load(base + 'Luca parla.\n\n');
await t.caret((await t.src()).length);
await t.type('FABIO ('); await t.type("cont'd)");
s = await t.src();
k = await t.kinds();
t.check('4 a real cue with an extension stays a character', /FABIO \(cont'd\)|FABIO \(CONT'D\)/.test(s) && /character:FABIO \(/i.test(k), JSON.stringify(s) + ' ' + k);

// 6. Enter on a cue that already has words: typing replaces the spacer row, no spaces left
await t.load(base + 'Luca parla.\n\nFABIO\nCiao, come stai.\n\nFine.');
await t.caretAfter('FABIO'); await t.press('Enter'); await t.type('x');
s = await t.src();
t.check('6 new dialogue row without leading spaces', s.includes('FABIO\nX\nCiao, come stai.') || s.includes('FABIO\nx\nCiao, come stai.'), JSON.stringify(s));

// 5. Redo after a long series of Undo rebuilds exactly the last state (several random sessions)
const seed0 = Number(process.env.SEED || 1);
for (let seed = seed0; seed < seed0 + 5; seed++) {
  let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  await t.load(base + 'Luca entra.\n\nFABIO\nCiao.\n\n(piano)\n\nFine.');
  await t.caret((await t.src()).indexOf('Fine.'));
  const keys = ['a', 'b', ' ', 'Enter', 'Tab', 'Backspace', 'Shift+Enter', '.', '(', ')', 'C', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const states = [await t.src()];
  for (let i = 0; i < 60; i++) {
    const key = keys[Math.floor(rnd() * keys.length)];
    if (key.length === 1) await t.page.keyboard.type(key); else await t.page.keyboard.press(key);
    await t.page.waitForTimeout(25);
  }
  await t.page.waitForTimeout(200);
  const final = await t.src();
  for (let i = 0; i < 80; i++) { await t.page.keyboard.press('Meta+z'); await t.page.waitForTimeout(15); }
  await t.page.waitForTimeout(200);
  const undone = await t.src();
  for (let i = 0; i < 80; i++) { await t.page.keyboard.press('Meta+Shift+z'); await t.page.waitForTimeout(15); }
  await t.page.waitForTimeout(250);
  const redone = await t.src();
  t.check(`5 seed ${seed}: undo returns to start, redo rebuilds the final text`, undone === states[0] && redone === final, `undone==start ${undone === states[0]} redo==final ${redone === final}\nfinal ${JSON.stringify(final)}\nredo  ${JSON.stringify(redone)}`);
}

t.report();
await t.close();
