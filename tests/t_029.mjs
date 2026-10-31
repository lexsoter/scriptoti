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

// Find and replace keeps a leading capital and all-caps occurrences.
const replaced = await t.page.evaluate(() => {
  const src = 'Title\n\nINT. CASA - GIORNO\n\nGiraffa entra. Una giraffa beve. LA GIRAFFA dorme.\n\n';
  const doc = DraftEngine.parse(src, { editing: true });
  return DraftSearch.replace(src, DraftSearch.matches(doc, 'giraffa'), 'elefante').source;
});
t.check('replace keeps Capital / lower / CAPS', replaced.includes('Elefante entra. Una elefante beve. LA ELEFANTE dorme.'), JSON.stringify(replaced));

t.report();
await t.close();
