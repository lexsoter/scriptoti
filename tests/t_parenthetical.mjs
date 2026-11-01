// Parentheticals share the same transforms on desktop and touch phones.
import { open } from './lib.mjs';
for (const [width, height, phone] of [[1280, 900, false], [390, 844, true], [844, 390, true]]) {
  const t = await open({ width, height, hasTouch: phone, isMobile: phone });
  const label = phone ? width + 'x' + height : 'desktop';
  const base = 'INT. CASA - GIORNO\n\nGIULIO\nHo sonno.\n\n!Piove.\n';
  const kind = () => t.page.evaluate(() => DraftEditor.state().selection?.kind);
  async function load(text = base) { await t.load(text); await t.caretAfter('Ho sonno.'); }
  async function keyboard() {
    await t.page.evaluate(height => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => height }); visualViewport.dispatchEvent(new Event('resize')); }, height > 500 ? 420 : 220);
    await t.page.waitForSelector('#phoneKeyboard:not([hidden])');
  }
  await load(); await t.press('Shift+Enter');
  let s = await t.src(), state = await t.page.evaluate(() => DraftEditor.state());
  t.check(label + ': Shift+Enter at dialogue end creates () with the caret inside', s.includes('Ho sonno.\n()\n\n!Piove.') && state.selection.focus === s.indexOf('()') + 1 && state.selection.kind === 'parenthetical', JSON.stringify({ source: s, selection: state.selection }));
  await t.type('a Lia'); await t.press(')');
  t.check(label + ': the closing parenthesis is skipped, not duplicated', (await t.src()).includes('(a Lia)') && !(await t.src()).includes('))'));
  await t.press('Enter');
  t.check(label + ': Enter after a parenthetical opens dialogue', await kind() === 'dialogue');
  await t.type('andiamo.');
  t.check(label + ': the speech stays together with no blank row', (await t.src()).includes('GIULIO\nHo sonno.\n(a Lia)\nAndiamo.'), JSON.stringify(await t.src()));
  await load(); const before = await t.src(); await t.press('Shift+Enter'); await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  t.check(label + ': one Undo removes the Shift+Enter parenthetical', await t.src() === before);
  await load(base.replace('Ho sonno.', 'Ho sonno. Andiamo.')); await t.press('Shift+Enter');
  t.check(label + ': in the middle of dialogue Shift+Enter still makes a plain line break', (await t.src()).includes('Ho sonno.\n Andiamo.') && !(await t.src()).includes('()'), JSON.stringify(await t.src()));
  await load(base.replace('Ho sonno.', '**Ho sonno.**')); await t.press('Shift+Enter');
  t.check(label + ': parenthetical starts after balanced Fountain emphasis', (await t.src()).includes('**Ho sonno.**\n()'), JSON.stringify(await t.src()));
  await load(); await t.press('Enter'); await t.type('(');
  s = await t.src(); state = await t.page.evaluate(() => DraftEditor.state());
  t.check(label + ': ( on the empty action joins the previous speech', s.includes('Ho sonno.\n()\n\n!Piove.') && state.selection.kind === 'parenthetical' && state.selection.focus === s.indexOf('()') + 1, JSON.stringify(s));
  await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  s = await t.src();
  t.check(label + ': one Undo keeps ( as the start of an action', s.includes('Ho sonno.\n\n(\n\n!Piove.') && await kind() === 'action', JSON.stringify(s));
  await t.type('Un gesto.');
  t.check(label + ': typing after Undo keeps the action', (await t.src()).includes('\n\n(Un gesto.') && await kind() === 'action');
  await load(); await t.press('Enter'); await t.type('!(');
  t.check(label + ': explicit Fountain action takes priority', (await t.src()).includes('\n\n!(') && await kind() === 'action', JSON.stringify(await t.src()));
  if (phone) {
    await load(); await keyboard(); await t.page.waitForSelector('#phoneParen:not([hidden])');
    await t.page.locator('#phoneParen').tap();
    t.check(label + ': the strip button opens () after a dialogue line and keeps focus', (await t.src()).includes('Ho sonno.\n()') && await kind() === 'parenthetical' && await t.page.evaluate(() => document.activeElement.id === 'phoneWriter'));
    await load(); await t.caretAfter('GIULIO'); await t.page.waitForSelector('#phoneParen:not([hidden])'); await t.page.locator('#phoneParen').tap();
    t.check(label + ': the existing cue parenthesis button still works', (await t.src()).includes('GIULIO\n()\nHo sonno.'));
  }
  t.report(); await t.close();
}
