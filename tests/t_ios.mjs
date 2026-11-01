// iOS-style Return, autocorrect and composition events in the phone writer.
import { open } from './lib.mjs';
const prefix = 'INT. CASA - GIORNO\n\n';
for (const [width, height] of [[390, 844], [844, 390]]) {
  const t = await open({ width, height, hasTouch: true, isMobile: true });
  const label = width + 'x' + height;
  async function input(type, data = null, target = null, composing = false) {
    await t.page.evaluate(({ type, data, target, composing }) => {
      const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: type, data, isComposing: composing });
      if (event.inputType !== type) Object.defineProperty(event, 'inputType', { value: type });
      if (target) {
        const r = DraftEditor.range({ anchor: target[0], focus: target[1] });
        Object.defineProperty(event, 'getTargetRanges', { value: () => [new StaticRange({ startContainer: r.startContainer, startOffset: r.startOffset, endContainer: r.endContainer, endOffset: r.endOffset })] });
      }
      document.querySelector('#phoneWriter').dispatchEvent(event);
    }, { type, data, target, composing });
    await t.page.waitForTimeout(100);
  }
  async function load(text) {
    await t.load(prefix + text); await t.caret((await t.src()).length);
    await t.page.evaluate(height => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => height });
      visualViewport.dispatchEvent(new Event('resize'));
    }, height > 500 ? 420 : 220);
  }
  async function dialogue(name, expected = 'MARTA') {
    const state = await t.page.evaluate(() => DraftEditor.state());
    t.check(label + ': ' + name + ' opens dialogue', state.selection?.kind === 'dialogue' && new RegExp('@?' + expected + '\\n').test(state.source), JSON.stringify({ source: state.source, selection: state.selection }));
    await input('insertText', 'Una battuta.');
    t.check(label + ': ' + name + ' keeps words under the cue', (await t.src()).includes(expected + '\nUna battuta.'), JSON.stringify(await t.src()));
  }
  await load('MARTA'); const before = await t.src();
  await input('insertParagraph'); await dialogue('insertParagraph');
  await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  await t.page.evaluate(() => document.querySelector('#undoBtn').click());
  t.check(label + ': Return and typing can both be undone', await t.src() === before, JSON.stringify(await t.src()));
  await load('MARTA'); await input('insertLineBreak'); await dialogue('insertLineBreak at an unconfirmed cue');
  await load('@MARTA'); await input('insertLineBreak'); await dialogue('insertLineBreak at a forced cue');
  await load('MARTA'); const end = (await t.src()).length;
  await input('insertReplacementText', 'MARTA', [end - 5, end]);
  await input('insertParagraph'); await dialogue('autocorrect then Return');
  await load('MAR');
  await t.page.evaluate(() => {
    const writer = document.querySelector('#phoneWriter');
    for (const [type, data] of [['compositionstart', ''], ['compositionupdate', 'TA'], ['compositionend', 'TA']]) writer.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
  });
  await input('insertFromComposition', 'TA'); await input('insertParagraph'); await dialogue('compositionend then Return');
  for (const follows of [false, true, 'commit', 'late commit']) {
    await load('MAR');
    await t.page.evaluate(follows => {
      const writer = document.querySelector('#phoneWriter');
      writer.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      writer.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'TA' }));
      writer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph', isComposing: true }));
      writer.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'TA' }));
      if (follows === true) writer.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' }));
      if (follows === 'commit') {
        const duplicate = new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: 'TA' });
        Object.defineProperty(duplicate, 'inputType', { value: 'insertFromComposition' }); writer.dispatchEvent(duplicate);
      }
    }, follows);
    await t.page.waitForTimeout(100);
    if (follows === 'late commit') await input('insertFromComposition', 'TA');
    await dialogue('Return during composition (' + String(follows) + ')');
  }
  await load('marta'); await t.page.evaluate(() => document.querySelector('#phoneTab').click());
  await input('insertLineBreak'); await dialogue('lowercase name forced by SmartTab');
  for (const how of ['beforeinput', 'linebreak', 'keydown', 'chip']) {
    await load('MARTA\nCiao.\n\nMA'); await t.page.waitForTimeout(180);
    t.check(label + ': completion is open for ' + how, await t.page.locator('#completionPopup').isVisible());
    if (how === 'keydown') await t.press('Enter');
    else {
      if (how === 'chip') await t.page.locator('#completionPopup button[role=option]').first().tap();
      await input(how === 'linebreak' ? 'insertLineBreak' : 'insertParagraph');
    }
    await dialogue('Return with completion (' + how + ')');
  }
  await load('Marta cammina.'); await input('insertLineBreak');
  const actionBreak = await t.src(); await input('insertText', 'Poi si ferma.');
  t.check(label + ': ordinary action still uses the original line-break path', actionBreak === prefix + 'Marta cammina.\n' && await t.src() === prefix + 'Marta cammina.\n\nPoi si ferma.', JSON.stringify({ actionBreak, after: await t.src() }));
  t.report(); await t.close();
}
