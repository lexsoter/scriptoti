// 0.29: Fountain conventions applied by Enter (transitions, FADE IN,
// flashback, shots, SU + character, MONTAGGIO), auto-closed parenthetical,
// ANGLE ON no longer a heading, shot read as a character in the syntax check.
import { open } from './lib.mjs';
const t = await open();
const base = 'Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\nMARTA\nCiao.\n\n';
const enterLine = async (typed, script = base) => {
  await t.load(script); await t.caret((await t.src()).length);
  await t.type(typed); await t.press('Enter');
  return (await t.src()).slice(script.length);
};
const cases = [
  ['cut to:', '>CUT TO:\n\n'], ['cut to', '>CUT TO:\n\n'], ['dissolvenza a:', '>DISSOLVENZA A:\n\n'], ['fade out', '>FADE OUT.\n\n'],
  ['Stacco su:', '>STACCO SU:\n\n'], ['jump cut to:', '>JUMP CUT TO:\n\n'], ['fade in:', '!FADE IN:\n\n'], ['fine flashback', '!FINE FLASHBACK\n\n'],
  ['angle on Tim reading a book', 'ANGLE ON Tim reading a book\n\n'], ['ANGLE ON TIM', '!ANGLE ON TIM\n\n'], ['su marta che piange', 'SU MARTA che piange\n\n'],
  ['su un tavolo c\'è un libro', 'Su un tavolo c\'è un libro\n\n'], ['montaggio', '.MONTAGGIO\n\n'], ['Stacco la spina.', 'Stacco la spina.\n\n'],
];
for (const [typed, want] of cases) {
  const got = await enterLine(typed);
  t.check(`Enter on "${typed}"`, got.startsWith(want) && !got.slice(want.length).trim(), JSON.stringify(got));
}
// Rendering: transition right, shot is action, ANGLE ON is not a scene.
await enterLine('cut to:');
let kinds = await t.kinds();
t.check('CUT TO: shown as a transition', /transition:CUT TO:/.test(kinds), kinds);
await t.load(base + 'ANGLE ON LA PORTA\n\nLa porta si apre.\n\n');
const scenes = await t.page.evaluate(() => window.DraftEditor.context().scenes.length);
t.check('ANGLE ON is not a scene heading any more', scenes === 1, String(scenes));
await t.load(base + 'MONTAGGIO\n\nImmagini.\n\n');
t.check('MONTAGGIO without dot is still a heading', await t.page.evaluate(() => window.DraftEditor.context().scenes.length) === 2);
// The editor continues with an Action paragraph after the converted line.
await enterLine('cut to:'); await t.type('Fuori piove.');
t.check('typing after a transition is Action', (await t.src()).trimEnd().endsWith('>CUT TO:\n\nFuori piove.'), JSON.stringify((await t.src()).slice(-30)));

// Parenthetical: "(" opens "()", ")" steps over, Enter returns to dialogue.
const cue = 'Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n';
await t.load(cue); await t.caret((await t.src()).length);
await t.type('MARTA'); await t.press('Enter'); await t.type('(');
const src = async () => (await t.src()).replace(/\n+$/, '');
let s = await src();
t.check('"(" under a cue writes "()"', s.endsWith('MARTA\n()'), JSON.stringify(s.slice(-20)));
await t.type('sottovoce');
s = await src();
t.check('typing goes between the parentheses', s.endsWith('(sottovoce)'), JSON.stringify(s.slice(-20)));
await t.type(')'); s = await src();
t.check('")" steps over the closing one', s.endsWith('(sottovoce)') && !s.includes('))'), JSON.stringify(s.slice(-20)));
await t.press('Enter'); await t.type('Non svegliarla.');
s = await src();
t.check('Enter after it goes to dialogue', /MARTA\n\(sottovoce\)\nNon svegliarla\.$/.test(s), JSON.stringify(s.slice(-40)));
kinds = await t.kinds();
t.check('rendered as parenthetical + dialogue', /parenthetical:\(sottovoce\)/.test(kinds) && /dialogue:Non svegliarla/.test(kinds), kinds);
await t.load(cue); await t.caret((await t.src()).length);
await t.type('MARTA'); await t.press('Enter'); await t.type('('); await t.press('Backspace');
s = await src();
t.check('Backspace in an empty "()" removes both', !s.includes('(') && !s.includes(')'), JSON.stringify(s.slice(-20)));
await t.type('Ciao.');
s = await src();
t.check('then typing is dialogue under the cue', /MARTA\nCiao\.$/.test(s), JSON.stringify(s.slice(-20)));
await t.load(base); await t.caret((await t.src()).length);
await t.type('Marta (36) entra.');
t.check('"(" inside action is a plain parenthesis', (await t.src()).trimEnd().endsWith('Marta (36) entra.'), JSON.stringify((await t.src()).slice(-24)));

// Syntax check: a shot followed at once by text.
const issues = await t.page.evaluate(() => window.DraftLint.check('INT. CASA - GIORNO\n\nANGLE ON TIM\nTim legge.\n\n').map(i => i.rule + '|' + i.fix?.text));
t.check('shot read as a character is flagged with a "!" fix', issues.includes('shot-cue|!'), JSON.stringify(issues));

// Go to page: click "Pagina x di y", type a page, Enter.
const filler = Array.from({ length: 120 }, (_, i) => `Azione numero ${i + 1} che riempie la pagina.`).join('\n\n');
await t.load('Title\n\nINT. CASA - GIORNO\n\n' + filler + '\n\n');
await t.page.waitForTimeout(400);
const pages = await t.page.evaluate(() => document.querySelectorAll('#editor > *').length || document.querySelectorAll('.script-page').length);
await t.page.click('#currentPage');
t.check('click shows a page field', await t.page.evaluate(() => !!document.querySelector('#currentPage input.page-jump')));
await t.page.keyboard.type('3'); await t.press('Enter'); await t.page.waitForTimeout(300);
let jump = await t.page.evaluate(() => ({ text: document.querySelector('#currentPage').textContent, page: window.getSelection().anchorNode?.parentElement?.closest('.script-page')?.dataset.pageLabel }));
t.check('Enter jumps to page 3 with the caret there', /^Pagina 3 di /.test(jump.text) && jump.page === '3', JSON.stringify({ jump, pages }));
await t.page.click('#currentPage'); await t.page.keyboard.type('abc'); await t.press('Enter'); await t.page.waitForTimeout(200);
let state = await t.page.evaluate(() => ({ toast: document.querySelector('#toast').textContent, open: !!document.querySelector('#currentPage input') }));
t.check('"abc" -> "Pagina non trovata", field stays', state.toast === 'Pagina non trovata.' && state.open, JSON.stringify(state));
await t.page.keyboard.press('Control+A'); await t.page.keyboard.type('999'); await t.press('Enter');
state = await t.page.evaluate(() => ({ toast: document.querySelector('#toast').textContent, open: !!document.querySelector('#currentPage input') }));
t.check('999 -> "Pagina non trovata"', state.toast === 'Pagina non trovata.' && state.open, JSON.stringify(state));
await t.press('Escape');
state = await t.page.evaluate(() => document.querySelector('#currentPage').textContent);
t.check('Escape restores the indicator', /^Pagina \d+ di \d+$/.test(state), state);

// Zoom keeps the caret in place and only zooms the pages.
await t.load('Title\n\nINT. CASA - GIORNO\n\n' + filler + '\n\n'); await t.page.waitForTimeout(300);
await t.caretAfter('Azione numero 60 ');
const caretY = () => t.page.evaluate(() => { const s = window.getSelection(), r = document.createRange(); r.setStart(s.focusNode, s.focusOffset); const b = r.getClientRects()[0] || r.getBoundingClientRect(); return Math.round(b.top); });
const before = await caretY();
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
await t.page.keyboard.press(mod + '+Equal'); await t.page.waitForTimeout(300);
let z = await t.page.evaluate(() => ({ zoom: document.querySelector('#zoomValue').value, body: document.body.style.zoom || '', ratio: window.devicePixelRatio }));
const after = await caretY();
t.check('Cmd/Ctrl + zooms the pages, not the program', z.zoom === '110%' && !z.body, JSON.stringify(z));
t.check('the caret stays where it was', Math.abs(after - before) <= 3, before + ' -> ' + after);
const box = await t.page.evaluate(() => { const b = document.querySelector('#stage').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await t.page.mouse.move(box.x, box.y);
await t.page.keyboard.down('Control'); for (let i = 0; i < 4; i++) { await t.page.mouse.wheel(0, -12); await t.page.waitForTimeout(30); } await t.page.keyboard.up('Control');
await t.page.waitForTimeout(300);
z = await t.page.evaluate(() => document.querySelector('#zoomValue').value);
t.check('pinch / Ctrl+wheel zooms the pages', parseInt(z) > 110, z);
t.check('caret still in place after the pinch', Math.abs((await caretY()) - before) <= 3, before + ' -> ' + (await caretY()));
await t.page.evaluate(() => window.getSelection().removeAllRanges());
await t.page.evaluate(() => { const s = document.querySelector('#stage'); s.scrollTop = s.scrollHeight / 2; }); await t.page.waitForTimeout(200);
const centre = () => t.page.evaluate(([x, y]) => { const p = [...document.querySelectorAll('.paper')].find(n => n.getBoundingClientRect().bottom > y); const b = p.getBoundingClientRect(); return p.dataset.pageLabel + '@' + ((y - b.top) / b.height).toFixed(2); }, [box.x, box.y]);
const seen = await centre();
await t.page.keyboard.press(mod + '+Minus'); await t.page.waitForTimeout(300);
t.check('without a caret the middle of the view stays', seen && (await centre()) === seen, seen + ' / ' + (await centre()));
await t.page.keyboard.press(mod + '+Digit0');
t.check('Ctrl+0 back to 100%', (await t.page.evaluate(() => document.querySelector('#zoomValue').value)) === '100%');

// Triple click on a line, then typing, replaces only that line.
const tripleScript = 'Title\n\nINT. CASA - GIORNO\n\nNevio alza le mani.\n\nNEVIO\nSiete pazzi.\n\nNevio torna al PC. Riapre il software.\n\nFabio lo indossa.\n\n';
for (const [line, typed, want] of [['Siete pazzi.', 'Tutto bene.', 'NEVIO\nTutto bene.\n\nNevio torna al PC.'], ['Nevio torna al PC.', 'Fabio esce.', 'Siete pazzi.\n\nFabio esce.\n\nFabio lo indossa.']]) {
  await t.load(tripleScript); await t.page.waitForTimeout(200);
  const at = await t.page.evaluate(text => { const n = [...document.querySelectorAll('#stage .editable-region')].find(e => e.textContent.includes(text)); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 8 }; }, line);
  await t.page.mouse.click(at.x, at.y, { clickCount: 3 }); await t.type(typed);
  const out = await t.src();
  t.check(`triple click + typing replaces only "${line}"`, out.includes(want), JSON.stringify(out.slice(out.indexOf('NEVIO'))));
}

// Phone keyboards: capitals on names and headings, sentence case after Enter.
const caps = () => t.page.evaluate(() => document.querySelector('#stage [contenteditable="true"], .document-editor')?.closest('[contenteditable="true"]')?.getAttribute('autocapitalize'));
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caret((await t.src()).length);
await t.type('MARTA');
const onCue = await caps();
await t.press('Enter');
const onDialogue = await caps();
await t.type('Ciao.'); await t.press('Enter'); await t.press('Enter'); await t.type('int. bar - notte');
const onHeading = await caps();
await t.press('Enter');
const afterHeading = await caps();
t.check('keyboard capitals: name and heading yes, after Enter no', onCue === 'characters' && onDialogue === 'sentences' && onHeading === 'characters' && afterHeading === 'sentences', JSON.stringify({ onCue, onDialogue, onHeading, afterHeading }));

// Blank lines inside a speech (rows of spaces) go away with Backspace, and so
// does the empty page they made.
await t.load('Title\n\nINT. CASA - GIORNO\n\n' + Array.from({ length: 25 }, (_, i) => `Azione numero ${i + 1} che riempie la pagina.`).join('\n\n') + '\n\nMARTA\nCiao.');
await t.caret((await t.src()).length); await t.press('Shift+Enter', 40);
const grown = await t.page.evaluate(() => document.querySelectorAll('.script-page').length);
await t.press('Backspace', 40);
const shrunk = await t.page.evaluate(() => document.querySelectorAll('.script-page').length);
t.check('Backspace removes blank dialogue lines and the empty page', grown === 2 && shrunk === 1 && (await t.src()).trimEnd().endsWith('MARTA\nCiao.'), JSON.stringify({ grown, shrunk, tail: (await t.src()).slice(-20) }));

// Computer: a short Tab still changes the type; a held Tab opens the list,
// arrows + Enter choose, one Undo goes back.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta entra.\n\n'); await t.caretAfter('Marta');
const kindNow = () => t.page.evaluate(() => DraftEditor.state().selection?.kind);
await t.press('Tab');
const afterShort = await kindNow();
await t.press('Shift+Tab');
await t.page.keyboard.down('Tab'); await t.page.waitForTimeout(500); await t.page.keyboard.up('Tab');
const list = await t.page.evaluate(() => { const p = document.querySelector('.type-picker'); return p && !p.hidden ? [...p.children].map(b => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join(',') : ''; });
const typedBefore = await t.src();
await t.press('ArrowDown'); await t.press('ArrowDown'); await t.press('ArrowDown'); await t.press('Enter');
const chosen = await kindNow(), closed = await t.page.evaluate(() => document.querySelector('.type-picker').hidden);
await t.page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await t.page.waitForTimeout(150);
t.check('short Tab changes the type on release', afterShort === 'character', afterShort);
t.check('held Tab opens the list with the current type marked', list === 'Scena,Azione*,Personaggio,Parentesi,Dialogo,Transizione', list);
t.check('arrows + Enter choose a type and close the list', chosen === 'dialogue' && closed, chosen);
t.check('one Undo restores the text after a direct choice', (await t.src()) === typedBefore, JSON.stringify((await t.src()).slice(-30)));

// A page break ("===") at the end: Backspace on the empty page removes the
// break, never the text of the page before.
await t.load('Title\n\nINT. CASA - GIORNO\n\nMarta esce.\n\n>FADE OUT.\n\n===\n\n\n\n');
const before = await t.page.evaluate(() => document.querySelectorAll('.script-page').length);
const firstOnLast = await t.page.evaluate(() => [...document.querySelectorAll('.script-page')].at(-1).querySelector('.editable-region')?._draft.anchor);
await t.caret(firstOnLast); await t.press('Backspace');
const after = await t.page.evaluate(() => document.querySelectorAll('.script-page').length), text = await t.src();
t.check('Backspace removes a page break and its empty page', before === 2 && after === 1 && !/^===$/m.test(text) && text.includes('>FADE OUT.') && text.includes('Marta esce.'), JSON.stringify({ before, after, tail: text.slice(-30) }));

// Find and replace keeps a leading capital and all-caps occurrences.
const replaced = await t.page.evaluate(() => {
  const src = 'Title\n\nINT. CASA - GIORNO\n\nGiraffa entra. Una giraffa beve. LA GIRAFFA dorme.\n\n';
  const doc = DraftEngine.parse(src, { editing: true });
  return DraftSearch.replace(src, DraftSearch.matches(doc, 'giraffa'), 'elefante').source;
});
t.check('replace keeps Capital / lower / CAPS', replaced.includes('Elefante entra. Una elefante beve. LA ELEFANTE dorme.'), JSON.stringify(replaced));

t.report();
await t.close();
