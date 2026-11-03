// Character cues use the same case and Return rules on desktop and phones.
import { open } from './lib.mjs';
const base = 'INT. CASA - GIORNO\n\nMARTA ROSSI\nAspetta.\n\nR.A. HARRIS\nArrivo.\n\n!Una porta chiusa.\n\n';
for (const phone of [false, true]) {
  const t = await open(phone ? { width: 390, height: 844, hasTouch: true, isMobile: true } : {});
  const label = phone ? 'phone' : 'desktop';
  async function load(tail) {
    await t.load(base + tail); await t.caret((await t.src()).length);
    if (phone) await t.page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 420 });
      visualViewport.dispatchEvent(new Event('resize'));
    });
  }
  async function input(type, data = null, target = null) {
    await t.page.evaluate(({ type, data, target, phone }) => {
      const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: type, data });
      if (event.inputType !== type) Object.defineProperty(event, 'inputType', { value: type });
      if (target) {
        const r = DraftEditor.range({ anchor: target[0], focus: target[1] });
        Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: r.startContainer, startOffset: r.startOffset, endContainer: r.endContainer, endOffset: r.endOffset })] });
      }
      document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(event);
    }, { type, data, target, phone });
  }
  const state = () => t.page.evaluate(() => DraftEditor.state());
  for (const text of ['BOOM. Esplode un elicottero.', 'MR. SMITH (29) walks in.', 'GIULIO, 40, entra.', 'BOOM! esplode.', 'GIULIO? aspetta.', 'GIULIO (CON TONO CALMO) entra.']) {
    await load(''); await t.type(text);
    const s = await state();
    t.check(label + ': Action keeps the authored case: ' + text, s.source.trimEnd().endsWith('!' + text) && s.selection.kind === 'action', JSON.stringify(s));
    t.check(label + ': name suggestions close for Action', await t.page.locator('#completionPopup').isHidden());
    const stored = await t.page.evaluate(() => { const value = DraftComments.unpack(DraftSafe.session.source); return { source: value.source, document: DraftProduction.prepare(value.source, value.document) }; });
    t.check(label + ': the saving model contains the same text and document', stored.source === s.source && JSON.stringify(stored.document) === JSON.stringify(s.document));
    const reopened = await t.page.evaluate(s => { DraftEditor.load(s.source, s.name, s.document); DraftEditor.selectAbsolute(s.selection); return DraftEditor.state(); }, s);
    t.check(label + ': Action and text survive reopening', reopened.source === s.source && reopened.selection.kind === 'action');
  }
  for (const title of ['MR.', 'MRS.', 'MS.', 'DR.', 'ST.', 'JR.', 'SIG.', 'SIG.RA', 'DOTT.', 'PROF.', 'AVV.', 'ING.']) {
    await load(''); await t.type(title + ' house');
    const s = await state();
    t.check(label + ': abbreviated title stays a character: ' + title, s.source.trimEnd().endsWith(title + ' HOUSE') && s.selection.kind === 'character', JSON.stringify(s));
  }
  for (const text of ['R.A. harris', 'GIULIO (v.o.)', 'GIULIO (o.s.)', 'GIULIO (o.c.)', "MARIA (cont'd)", 'GIULIO (fuori campo)', 'GIULIO (voce fuori campo)', 'RED fox', 'MARIA grazia', 'GIULIO (v.o.) ancora']) {
    await load(''); await t.type(text);
    const s = await state();
    t.check(label + ': a real cue stays uppercase: ' + text, s.source.trimEnd().endsWith(text.toLocaleUpperCase('it')) && s.selection.kind === 'character', JSON.stringify(s));
  }
  await load(''); await t.type('GIULIO, ');
  t.check(label + ': a comma without more text has not inferred Action', (await state()).selection.kind === 'character');
  await t.type('4'); const action = await state();
  await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  const undone = await state();
  t.check(label + ': one Undo restores the cue after the inference', action.selection.kind === 'action' && undone.selection.kind === 'character' && undone.source.trimEnd().endsWith('@GIULIO, 4'), JSON.stringify(undone));
  await t.page.evaluate(() => document.querySelector('#redoBtn').click());
  t.check(label + ': Redo restores the exact inferred Action', (await t.src()) === action.source && (await state()).selection.kind === 'action');
  await load(''); await t.type('BOOM. e');
  t.check(label + ': the first lowercase word after a stop is preserved', (await t.src()).trimEnd().endsWith('!BOOM. e') && (await state()).selection.kind === 'action');
  await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  t.check(label + ': Undo preserves the typed letter as a character', (await t.src()).trimEnd().endsWith('@BOOM. E') && (await state()).selection.kind === 'character');
  await load(''); await t.type('@BOOM. esplode, 40.');
  t.check(label + ': @ always forces an uppercase character', (await t.src()).trimEnd().endsWith('@BOOM. ESPLODE, 40.') && (await state()).selection.kind === 'character');
  await load('[[nota]]@BOOM'); await t.type('. esplode.');
  t.check(label + ': @ after a hidden note still forces the cue', (await t.src()).includes('[[nota]]@BOOM. ESPLODE.') && (await state()).selection.kind === 'character');
  await load(''); await t.type('GIULIO (40)'); await t.page.evaluate(() => document.querySelector('#boldBtn').click()); await t.type(' walks');
  const styled = await state();
  t.check(label + ': Action inference preserves bold typing and lowercase text', styled.selection.kind === 'action' && /GIULIO \(40\) \*\*walks\*\*$/.test(styled.source.trimEnd()), JSON.stringify(styled));
  await load('GIULIO\nAspetta.\n\n'); await t.type('MARIA ^');
  await input('insertText', 'Una battuta.');
  const dual = await t.page.evaluate(() => {
    const s = DraftEditor.state(), d = DraftEngine.parse(s.source);
    return s.source.includes('MARIA ^\nUna battuta.') && d.elements.some(e => e.type === 'dual' && e.right.cue.kind === 'character' && e.right.speaker === 'MARIA');
  });
  t.check(label + ': a dual-dialogue cue stays a character', dual, JSON.stringify(await state()));
  if (phone) {
    await load(''); await t.type('BOOM'); const at = (await t.src()).lastIndexOf('BOOM') + 4;
    t.check('phone: autocorrect starts from a recognised cue', (await state()).selection.kind === 'character');
    await input('insertReplacementText', 'BOOM. Esplode', [at - 4, at]);
    t.check('phone: autocorrect can infer Action without uppercasing the prose', (await t.src()).trimEnd().endsWith('!BOOM. Esplode') && (await state()).selection.kind === 'action', JSON.stringify(await state()));
    await t.page.evaluate(() => document.querySelector('#undoBtn').click());
    t.check('phone: autocorrect inference has its own Undo', (await state()).selection.kind === 'character' && (await t.src()).trimEnd().endsWith('@BOOM. ESPLODE'));
    await load(''); await t.type('MR. SMITH (29) ');
    t.check('phone: composition starts from a recognised cue', (await state()).selection.kind === 'character');
    await t.page.evaluate(() => {
      const writer = document.querySelector('#phoneWriter');
      for (const [type, data] of [['compositionstart', ''], ['compositionupdate', 'walks'], ['compositionend', 'walks']]) writer.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
    });
    await input('insertFromComposition', 'walks');
    t.check('phone: composition and its duplicate commit keep one lowercase word', (await t.src()).trimEnd().endsWith('!MR. SMITH (29) walks') && (await state()).selection.kind === 'action', JSON.stringify(await state()));
  }
  for (const name of ['MARTA ROSSI', 'NORA SERRA']) for (const method of ['key', 'insertParagraph', ...(phone ? ['insertLineBreak'] : [])]) {
    await load(name + '\nUna battuta già scritta.\n');
    const at = (await t.src()).lastIndexOf(name) + 3; await t.caret(at);
    if (method === 'key') await t.press('Enter'); else await input(method);
    const state = await t.page.evaluate(() => DraftEditor.state());
    t.check(label + ': mid-cue Return splits ' + name + ' (' + method + ')', state.source.includes(name.slice(0, 3) + '\n' + name.slice(3) + '\nUna battuta già scritta.') && state.selection.kind === 'dialogue', JSON.stringify(state));
  }
  await load('MARTA\nLa battuta resta.\n'); await t.caret((await t.src()).lastIndexOf('MARTA') + 1); await t.press('Enter');
  t.check(label + ': a one-letter split keeps a valid forced cue', (await t.src()).includes('@M\nARTA\nLa battuta resta.'));
  await load('**MARTA**\nLa battuta resta.\n'); await t.caret((await t.src()).lastIndexOf('MARTA') + 3); await t.press('Enter');
  t.check(label + ': splitting a bold cue balances Fountain emphasis', (await t.src()).includes('**MAR**\n**TA**\nLa battuta resta.'), JSON.stringify(await t.src()));
  await load('MARTA\nLa battuta resta.\n'); await t.caret((await t.src()).lastIndexOf('MARTA')); await t.press('Enter');
  t.check(label + ': Return at cue start leaves room above the name', (await t.src()).includes('\n\n\n\nMARTA\nLa battuta resta.') && (await t.page.evaluate(() => DraftEditor.state())).selection.kind === 'action');
  await load('MART\nLa battuta resta.\n'); await t.caret((await t.src()).lastIndexOf('MART') + 4);
  if (phone) await t.page.waitForSelector('#phoneKeyboard:not([hidden])');
  await t.page.evaluate(() => DraftCompletionUI.refresh()); await t.page.waitForSelector('#completionPopup:not([hidden])');
  const split = await t.page.evaluate(phone => {
    const source = DraftEditor.state().source, at = source.lastIndexOf('MART') + 2;
    const wasOpen = !document.querySelector('#completionPopup').hidden, range = DraftEditor.range({ anchor: at, focus: at });
    getSelection().setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { wasOpen, source: DraftEditor.state().source };
  }, phone);
  t.check(label + ': Return with an open popup splits instead of accepting a name', split.wasOpen && split.source.includes('MA\nRT\nLa battuta resta.') && !split.source.slice(base.length).includes('MARTA ROSSI'), JSON.stringify(split));
  t.report(); await t.close();
}
