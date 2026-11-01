// 0.34: Tab follows the context. Dialogue and parenthetical only under a
// character; after a speech an empty line offers a parenthetical (0.35),
// then transition and scene.
import { open } from './lib.mjs';
const t = await open();
const kind = () => t.page.evaluate(() => DraftEditor.state().selection?.kind);
const cycle = async (n, shift = false) => { const out = [await kind()]; for (let i = 0; i < n; i++) { await t.press(shift ? 'Shift+Tab' : 'Tab'); out.push(await kind()); } return out.join(' > '); };
// Empty line after an action.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
let got = await cycle(4);
t.check('after an action: character, scene, transition, action', got === 'action > character > scene > transition > action', got);
// Empty line after a speech.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMARTA\nCiao.\n\n'); await t.caret((await t.src()).length);
got = await cycle(5);
t.check('after a speech: parenthetical, transition, scene, character, action', got === 'action > parenthetical > transition > scene > character > action', got);
// 0.35: a parenthetical opens as "()" with the caret inside.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMARTA\nCiao.\n\nPiove.\n\n'); await t.caretAfter('Ciao.');
await t.press('Enter'); await t.press('Tab'); await t.type('ride');
let src = await t.src();
t.check('after a line: Tab joins "()" to the speech', src.includes('MARTA\nCiao.\n(ride)\n\nPiove.'), JSON.stringify(src));
await t.load('Title\n\nINT. CASA - GIORNO\n\nMARTA\nCiao.\n\n'); await t.caretAfter('MARTA');
await t.press('Enter'); await t.press('Tab'); await t.type('piano');
src = await t.src();
t.check('Enter after the name, Tab: "()" above the written line', src.includes('MARTA\n(piano)\nCiao.'), JSON.stringify(src));
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
await t.type('MARTA'); await t.press('Enter'); await t.press('Tab'); await t.type('piano');
src = await t.src();
t.check('new cue, Tab: "()" under the name', src.includes('MARTA\n(piano)'), JSON.stringify(src));
// Under a character: parenthetical and dialogue only.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
await t.type('MARTA'); await t.press('Enter');
got = await cycle(2);
t.check('under a character: parenthetical, dialogue', got === 'dialogue > parenthetical > dialogue', got);
// Written dialogue line.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMARTA\nCiao.\n\n'); await t.caretAfter('Ciao');
got = await cycle(2);
t.check('in written dialogue: parenthetical, dialogue', got === 'dialogue > parenthetical > dialogue', got);
// Action with text.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caretAfter('Marta');
got = await cycle(4);
t.check('action with text: character, scene, transition, action', got === 'action > character > scene > transition > action', got);
// Shift+Tab goes back.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
got = await cycle(2, true);
t.check('Shift+Tab goes the other way', got === 'action > transition > scene', got);
// Never dialogue without a character, in any number of presses.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
got = await cycle(8);
t.check('no dialogue or parenthetical without a character', !/dialogue|parenthetical/.test(got), got);
// The held-Tab list shows only fitting types.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
await t.page.keyboard.down('Tab'); await t.page.waitForTimeout(500); await t.page.keyboard.up('Tab');
const list = await t.page.evaluate(() => [...document.querySelectorAll('.type-picker button')].map(b => b.textContent).join(','));
await t.press('Escape');
t.check('held Tab lists only fitting types', list === 'Azione,Personaggio,Scena,Transizione', list);
t.report(); await t.close();
