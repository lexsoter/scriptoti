// The keyboard is simulated through visualViewport; editing uses real DOM
// ranges and the same source transactions as the paginated editor.
import { open } from './lib.mjs';
const settle = t => t.page.waitForTimeout(180);
const basic = 'INT. CASA - GIORNO\n\nMarta guarda fuori.\n\n@MARTA\nCiao.\n\n';
const long = 'Title: Il copione\nAuthor: Toti\n\n' + Array.from({ length:4 }, (_, i) => `INT. LUOGO ${i + 1} - GIORNO\n\nMARTA\nUna battuta.\n\n` + Array.from({ length:22 }, (_, n) => `!Marta attraversa la stanza e guarda fuori dalla finestra. Passaggio ${i}-${n}.\n\n`).join('')).join('');
const state = t => t.page.evaluate(() => DraftEditor.state());
const focused = t => t.page.evaluate(() => document.activeElement.id === 'phoneWriter');
async function keyboard(t, height, top = 0) {
  await t.page.evaluate(({ height, top }) => {
    Object.defineProperties(visualViewport, { height:{ configurable:true, get:() => height }, offsetTop:{ configurable:true, get:() => top } });
    visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll'));
  }, { height, top }); await settle(t);
}
async function input(t, type, data = null, target = null) {
  await t.page.evaluate(({ type, data, target }) => {
    const event = new InputEvent('beforeinput', { bubbles:true, cancelable:true, inputType:type, data });
    // Chromium drops Safari's insertFromComposition constructor value.
    if (event.inputType !== type) Object.defineProperty(event, 'inputType', { value:type });
    if (target) {
      const r = DraftEditor.range({ anchor:target[0], focus:target[1] });
      Object.defineProperty(event, 'getTargetRanges', { value:() => [new StaticRange({ startContainer:r.startContainer, startOffset:r.startOffset, endContainer:r.endContainer, endOffset:r.endOffset })] });
    }
    document.querySelector('#phoneWriter').dispatchEvent(event);
  }, { type, data, target }); await settle(t);
}
async function caretVisible(t) {
  return t.page.evaluate(() => {
    const selection = getSelection(); if (!selection.rangeCount) return false;
    let r = selection.getRangeAt(0).getBoundingClientRect();
    if (!r.height) r = document.querySelector('#phoneWriter .active-edit')?.getBoundingClientRect() || r;
    const box = document.querySelector('#stage').getBoundingClientRect(), strip = document.querySelector('#phoneKeyboard');
    // The strip hangs under the top bar: the caret must sit below it and above the keyboard.
    return r.height > 0 && r.top >= Math.max(box.top, visualViewport.offsetTop, strip.hidden ? -Infinity : strip.getBoundingClientRect().bottom) - 1 && r.bottom <= Math.min(box.bottom, visualViewport.offsetTop + visualViewport.height) + 1;
  });
}
async function locked(t) {
  await t.load(long);
  await t.page.evaluate(() => {
    const s = DraftEditor.state(), d = DraftProduction.lock(s.source, s.document);
    d.layout.titleVisible = true;
    d.locks.pages.forEach((p, i) => { p.label = i === 1 ? '12A' : String(i + 12); p.base = i === 1 ? '12' : p.label; p.serial = i === 1 ? 1 : 0; });
    DraftEditor.load(s.source, 'telefono.fountain', d);
  }); await settle(t);
}
async function pinch(t, factor) {
  const cdp = await t.context.newCDPSession(t.page), b = await t.page.locator('#stage').boundingBox();
  const x = b.x + b.width / 2, y = b.y + Math.min(90, b.height / 2), start = 70;
  const points = d => [{ x:x - d / 2, y, id:1 }, { x:x + d / 2, y, id:2 }];
  try {
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:points(start) });
    for (let n = 1; n <= 5; n++) { await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:points(start * (1 + (factor - 1) * n / 5)) }); await t.page.waitForTimeout(25); }
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  } finally { await cdp.detach(); } await settle(t);
}
async function exportPages(t, { title = true, mode = 'all', from = '', to = '', open = true } = {}) {
  if (open) await t.page.evaluate(() => document.querySelector('#printBtn').click());
  await t.page.locator('#exportTitle').setChecked(title); await t.page.locator('#export-' + mode).check();
  if (mode === 'range') { await t.page.locator('#exportFrom').fill(from); await t.page.locator('#exportTo').fill(to); }
  await t.page.locator('#exportDialog button[type=submit]').click(); await settle(t);
}
async function printLabels(t) {
  await t.page.emulateMedia({ media:'print' });
  return t.page.evaluate(() => [...document.querySelectorAll('.paper')].filter(n => getComputedStyle(n).display !== 'none').map(n => n.dataset.pageLabel || 'title'));
}
async function afterPrint(t) { await t.page.evaluate(() => dispatchEvent(new Event('afterprint'))); await t.page.emulateMedia({ media:'screen' }); await settle(t); }
async function exports(t, label) {
  await locked(t);
  const original = await state(t), labels = await t.page.locator('#scriptEditor>.script-page').evaluateAll(nodes => nodes.map(n => n.dataset.pageLabel));
  await t.page.evaluate(() => { window.printCalls = 0; window.print = () => window.printCalls++; });
  await exportPages(t, {});
  t.check(`${label}: export includes title and all real pages`, JSON.stringify(await printLabels(t)) === JSON.stringify(['title',...labels])); await afterPrint(t);
  await exportPages(t, { title:false, mode:'range', from:'12a', to:labels[2] });
  t.check(`${label}: print range accepts locked labels and excludes the title`, JSON.stringify(await printLabels(t)) === JSON.stringify(labels.slice(1, 3))); await afterPrint(t);
  t.check(`${label}: afterprint restores every excluded sheet`, await t.page.locator('.print-excluded,.print-last').count() === 0);
  await exportPages(t, { title:false, mode:'range', from:labels[2], to:labels[0] });
  t.check(`${label}: invalid range stays in the dialog without printing`, await t.page.locator('#exportError').isVisible() && await t.page.evaluate(() => window.printCalls) === 2);
  await t.page.locator('#exportDialog button[type=button]').click();
  await t.page.evaluate(() => {
    const s = DraftEditor.state(), d = s.document, p = document.querySelectorAll('#scriptEditor>.script-page')[1];
    const gs = [...p.querySelectorAll('.editable-region')].flatMap(n => n._draft.glyphs).filter(g => !g.generated);
    d.revisions.manual = [{ start:gs[0].from, end:gs[1].to }]; DraftEditor.load(s.source, s.name, d);
  }); await settle(t);
  const marked = await t.page.locator('#scriptEditor>.script-page[data-revised=true]').evaluateAll(nodes => nodes.map(n => n.dataset.pageLabel));
  await exportPages(t, { title:false, mode:'revised' });
  t.check(`${label}: marked-page option uses the original revision flags`, marked.length > 0 && JSON.stringify(await printLabels(t)) === JSON.stringify(marked)); await afterPrint(t);
  t.check(`${label}: PDF options never change source or layout`, await t.src() === original.source && JSON.stringify((await state(t)).document.layout) === JSON.stringify(original.document.layout));
  // Include a title which is stored in the file but hidden in the screen view.
  await t.page.evaluate(() => { const s = DraftEditor.state(); s.document.layout.titleVisible = false; DraftEditor.load(s.source, s.name, s.document); }); await settle(t);
  await exportPages(t, { title:true, mode:'range', from:labels[0], to:labels[0] });
  t.check(`${label}: hidden title page can be included without changing preferences`, JSON.stringify(await printLabels(t)) === JSON.stringify(['title',labels[0]])); await afterPrint(t);
  t.check(`${label}: temporary title page is removed after printing`, await t.page.locator('.title-pages .title-page').count() === 0 && (await state(t)).document.layout.titleVisible === false);
}

for (const [width, height, locale] of [[390,844,'it-IT'],[844,390,'en-US']]) {
  const t = await open({ width, height, locale, hasTouch:true, isMobile:true }); t.page.setDefaultTimeout(8000);
  const label = width < height ? 'portrait' : 'landscape';
  try {
    const rich = 'Title: Titolo invisibile\n\n.INT. CASA - GIORNO #7#\n\n!Marta **guarda** *fuori* e _aspetta_.\n\n@MARTA\n(sottovoce)\nUna battuta.\n\n>CUT TO:\n\n> Il centro <\n\n~Una canzone\n';
    await t.load(rich); await t.caretAfter('aspetta');
    const info = await t.page.evaluate(() => { const w = document.querySelector('#phoneWriter'); return { font:getComputedStyle(w).fontSize, height:getComputedStyle(w).lineHeight, width:w.getBoundingClientRect().width, text:w.innerText, scene:w.querySelector('.phone-scene-number')?.textContent, strong:w.querySelector('strong')?.textContent, italic:w.querySelector('em')?.textContent, underline:w.querySelector('u')?.textContent }; });
    t.check(`${label}: writing view reflows at 18px instead of editing A4`, info.font === '18px' && Math.abs(parseFloat(info.height) - 26.1) < .1 && info.width <= width && await focused(t) && !await t.page.locator('#scriptEditor').isVisible(), JSON.stringify(info));
    t.check(`${label}: Fountain markers and title fields stay hidden`, !info.text.includes('@MARTA') && !info.text.includes('!Marta') && !info.text.includes('>CUT TO:') && !info.text.includes('~Una') && !info.text.includes('Titolo invisibile') && info.scene === '7');
    t.check(`${label}: inline bold, italic and underline are preserved`, info.strong === 'guarda' && info.italic === 'fuori' && info.underline === 'aspetta');
    await t.load(basic); await t.caretAfter('MARTA'); await input(t, 'insertParagraph');
    t.check(`${label}: Enter after a cue goes to dialogue`, (await state(t)).selection.kind === 'dialogue' && await focused(t));
    await input(t, 'insertText', 'Una battuta nuova.'); const withDialogue = await t.src();
    t.check(`${label}: input is committed through the screenplay source`, withDialogue.includes('MARTA\nUna battuta nuova.'), JSON.stringify(withDialogue));
    await input(t, 'deleteContentBackward'); t.check(`${label}: Backspace edits the same source`, (await t.src()).includes('Una battuta nuova') && !(await t.src()).includes('Una battuta nuova.'));
    await t.page.evaluate(() => document.querySelector('#undoBtn').click()); t.check(`${label}: Undo restores the phone edit`, await t.src() === withDialogue);
    await t.load(basic); await t.caretAfter('fuori.'); await keyboard(t, height > 500 ? 440 : 240);
    await t.page.locator('#phoneTab').tap(); await settle(t);
    t.check(`${label}: strip Tab changes type and keeps focus`, (await state(t)).selection.kind === 'character' && await focused(t));
    t.check(`${label}: strip contains only Tab and B/I/U/Aa, with no caret or parenthesis controls`, JSON.stringify(await t.page.locator('.phone-keys>button').evaluateAll(nodes => nodes.map(n => n.id))) === JSON.stringify(['phoneTab','phoneBold','phoneItalic','phoneUnderline','phoneCase']) && await t.page.locator('.phone-arrows,#phoneParenthesis,#phoneBackTab').count() === 0);
    t.check(`${label}: Tab is an accent control with its own circle icon at the same height`, await t.page.locator('#phoneTab').evaluate(n => n.querySelector('svg circle') && n.getBoundingClientRect().height === document.querySelector('#phoneBold').getBoundingClientRect().height && getComputedStyle(n).backgroundColor !== getComputedStyle(document.querySelector('#phoneBold')).backgroundColor));
    t.check(`${label}: Undo and Redo live in the one-row header`, await t.page.locator('.topbar>#phoneUndo,.topbar>#phoneRedo').count() === 2 && await t.page.locator('.topbar').evaluate(n => n.getBoundingClientRect().height <= 50));
    const beforeStripEdit = await t.src(); await t.type('Z'); const afterStripEdit = await t.src();
    await t.page.locator('#phoneUndo').tap(); await settle(t);
    t.check(`${label}: strip Undo restores source and keeps the keyboard focus`, await t.src() === beforeStripEdit && await focused(t));
    await t.page.locator('#phoneRedo').tap(); await settle(t);
    t.check(`${label}: strip Redo restores the phone edit`, await t.src() === afterStripEdit && await focused(t));
    for (const [id, marker] of [['phoneBold','**'],['phoneItalic','*'],['phoneUnderline','_']]) {
      await t.load(basic); const a = (await t.src()).indexOf('guarda'); await t.caret(a, a + 6);
      await t.page.locator('#' + id).tap(); await settle(t);
      t.check(`${label}: ${id} formats the source selection and preserves focus`, (await t.src()).includes(marker + 'guarda' + marker) && await focused(t));
      await t.load(basic); await t.caretAfter('fuori.'); await t.page.locator('#' + id).tap(); await t.type(' testo');
      t.check(`${label}: ${id} formats the next typed text through the existing command`, (await t.src()).includes(' ' + marker + 'Testo' + marker) && await focused(t), JSON.stringify(await t.src()));
    }
    await t.load(basic); const ca = (await t.src()).indexOf('guarda'); await t.caret(ca, ca + 6);
    await t.page.locator('#phoneCase').tap(); await settle(t);
    t.check(`${label}: Aa uses the desktop uppercase command`, (await t.src()).includes('GUARDA') && await focused(t));
    const tabBox = await t.page.locator('#phoneTab').boundingBox(), touch = await t.context.newCDPSession(t.page);
    await touch.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:tabBox.x + tabBox.width / 2, y:tabBox.y + tabBox.height / 2, id:1 }] });
    await t.page.waitForTimeout(550); await touch.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await touch.detach();
    t.check(`${label}: holding Tab still offers the existing six types`, await t.page.locator('#phoneTypes').isVisible() && await t.page.locator('#phoneTypes button').count() === 6);
    await t.page.locator('#phoneType-action').tap(); await settle(t);
    t.check(`${label}: direct type choice retains focus`, (await state(t)).selection.kind === 'action' && await focused(t));
    await t.load(basic); await t.caret((await t.src()).length); await t.type('MA');
    const chip = t.page.locator('#phoneSuggestions #completionPopup button[role=option]').filter({ has:t.page.locator('span', { hasText:/^MARTA$/ }) });
    t.check(`${label}: original character completions are chips above the keyboard`, await chip.isVisible() && await chip.evaluate(n => n.getBoundingClientRect().bottom <= document.querySelector('.phone-keys').getBoundingClientRect().top + 1) && await caretVisible(t));
    await chip.tap(); await settle(t);
    t.check(`${label}: accepting a chip inserts the existing character and keeps focus`, /\nMARTA\n*$/.test(await t.src()) && await focused(t));
    await t.load('INT. CASA - GIORNO\n\nMarta **aspeta** fuori.\n'); await t.caretAfter('fuori.');
    const typo = (await t.src()).indexOf('aspeta'); await input(t, 'insertReplacementText', 'aspetta ancora', [typo,typo + 6]);
    t.check(`${label}: autocorrect replaces its target range, including styled words`, (await t.src()).includes('Marta **aspetta ancora** fuori.'), JSON.stringify(await t.src()));
    await input(t, 'insertFromComposition', 'bene', [(await t.src()).indexOf('fuori'),(await t.src()).indexOf('fuori') + 5]);
    t.check(`${label}: dictation-style committed replacement uses source offsets`, (await t.src()).includes('**aspetta ancora** bene.'));
    const beforeNative = await t.src();
    await t.page.evaluate(() => {
      const w = document.querySelector('#phoneWriter');
      w.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, inputType:'insertText', data:'X' }));
      w.querySelector('.editable-region').append(document.createTextNode('DOM_CORROTTO'));
      w.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:'X' }));
    });
    t.check(`${label}: non-cancelable input uses event data and discards native DOM changes`, (await t.src()).length === beforeNative.length + 1 && (await t.src()).includes('X') && !await t.page.locator('#phoneWriter').evaluate(w => w.textContent.includes('DOM_CORROTTO')));
    await t.load(basic); await t.caretAfter('fuori.'); const beforeIME = await t.src();
    await t.page.evaluate(() => {
      const w = document.querySelector('#phoneWriter'); w.dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true, data:'' }));
      w.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles:true, data:'に' }));
      w.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, inputType:'insertCompositionText', data:'に', isComposing:true }));
      // A non-cancelable native mutation is discarded, never imported as source.
      w.querySelector('.editable-region').append(document.createTextNode('DOM_CORROTTO'));
      w.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertCompositionText', data:'に', isComposing:true }));
    });
    t.check(`${label}: native IME DOM mutations never become screenplay text`, await t.src() === beforeIME);
    await t.page.evaluate(() => document.querySelector('#phoneWriter').dispatchEvent(new CompositionEvent('compositionend', { bubbles:true, data:'日本' })));
    await input(t, 'insertFromComposition', '日本');
    t.check(`${label}: composition is committed once`, (await t.src()).includes('fuori.日本') && !(await t.src()).includes('日本日本') && !await t.page.locator('#phoneWriter').evaluate(w => w.textContent.includes('DOM_CORROTTO')), JSON.stringify(await t.src()));
    await t.page.evaluate(() => document.querySelector('#undoBtn').click()); t.check(`${label}: one Undo restores the pre-composition source`, await t.src() === beforeIME);
    await t.page.evaluate(() => { const w = document.querySelector('#phoneWriter'); w.dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true })); w.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles:true, data:'annullato' })); w.dispatchEvent(new CompositionEvent('compositionend', { bubbles:true, data:'' })); });
    t.check(`${label}: cancelled composition adds no text`, await t.src() === beforeIME);
    await t.load(long); await t.caret((await t.src()).length); await t.type('Una riga finale.');
    t.check(`${label}: caret remains above keyboard in a long script`, await caretVisible(t));
    t.check(`${label}: the strip hangs right under the top bar, clear of the iOS keyboard bar`, await t.page.evaluate(() => { const strip = document.querySelector('#phoneKeyboard'), bar = document.querySelector('.topbar'); return !strip.hidden && Math.abs(strip.getBoundingClientRect().top - bar.getBoundingClientRect().bottom) <= 1; }));
    await keyboard(t, height > 500 ? 400 : 220, 15); await input(t, 'insertParagraph'); await t.type('Ancora.');
    t.check(`${label}: viewport scroll and Enter keep the caret visible`, await caretVisible(t));
    const editingAt = (await state(t)).selection.focus;
    await t.page.locator('#stage').evaluate(n => { n.dispatchEvent(new WheelEvent('wheel', { bubbles:true, deltaY:-1000 })); n.scrollTop = 100; });
    const readingAt = await t.page.locator('#stage').evaluate(n => n.scrollTop);
    await t.page.evaluate(() => { document.dispatchEvent(new Event('selectionchange')); visualViewport.dispatchEvent(new Event('scroll')); visualViewport.dispatchEvent(new Event('resize')); }); await t.page.waitForTimeout(400);
    t.check(`${label}: rereading is not pulled back by selection or viewport events`, Math.abs(await t.page.locator('#stage').evaluate(n => n.scrollTop) - readingAt) < 1 && (await state(t)).selection.focus === editingAt);
    await t.type(' Dopo la lettura.');
    t.check(`${label}: typing resumes at the caret and brings it back into view`, (await t.src()).includes('Ancora. Dopo la lettura.') && await caretVisible(t));
    await t.page.locator('#phoneWriter').evaluate(w => { w.dispatchEvent(new InputEvent('beforeinput', { bubbles:true, cancelable:true, inputType:'insertText', data:'X' })); const stage = document.querySelector('#stage'); stage.dispatchEvent(new WheelEvent('wheel', { bubbles:true, deltaY:-1000 })); stage.scrollTop = 120; }); await t.page.waitForTimeout(200);
    t.check(`${label}: starting a scroll cancels a pending caret reveal`, Math.abs(await t.page.locator('#stage').evaluate(n => n.scrollTop) - 120) < 1);
    const top = await t.page.locator('.phone-file-status').textContent(), totalWords = Number((await t.page.locator('#wordsStat').textContent()).replace(/\D/g, ''));
    t.check(`${label}: header contains caret page and total words, with no bottom counter`, /\d+.*(?:di|of).*\d+.*·.*\d+.*(?:parole|words)/.test(top) && top.includes(totalWords.toLocaleString(locale)) && !await t.page.locator('.stats').isVisible());

    await keyboard(t, height); await locked(t);
    const labels = await t.page.locator('#scriptEditor>.script-page').evaluateAll(nodes => nodes.map(n => n.dataset.pageLabel));
    t.check(`${label}: writing has no page dividers but preserves real locked labels`, await t.page.locator('.phone-page-divider').count() === 0 && labels.includes('12A'));
    t.check(`${label}: dialogue keeps its indent without the vertical rule`, await t.page.locator('.phone-paragraph.dialogue').first().evaluate(n => parseFloat(getComputedStyle(n).marginLeft) > 0 && getComputedStyle(n).borderLeftStyle === 'none'));
    const fullCount = await t.page.locator('.phone-file-status').textContent(); await t.caret((await t.src()).indexOf('MARTA'), (await t.src()).indexOf('MARTA') + 5); await settle(t);
    t.check(`${label}: header keeps the document word count when text is selected`, (await t.page.locator('.phone-file-status').textContent()).split(' · ')[1] === fullCount.split(' · ')[1]);
    await t.page.locator('#phoneGotoBtn').tap(); await t.page.locator('[data-tab=pages]').tap();
    t.check(`${label}: Go to contains the actual page list`, await t.page.locator('#phoneGoList button').count() === labels.length);
    await t.page.locator('#phoneGoInput').fill('pagina 12a'); await t.page.keyboard.press('Enter'); await settle(t);
    t.check(`${label}: Go to page restores caret in the writing view`, !await t.page.locator('#phoneMenuPanel').isVisible() && (await state(t)).selection.page === '12A' && await focused(t));
    await t.page.locator('#phoneGotoBtn').tap(); await t.page.locator('[data-tab=scenes]').tap();
    t.check(`${label}: scene list highlights the current scene`, await t.page.locator('#phoneGoList button[aria-current=true]').count() === 1);
    await t.page.locator('#phoneGoInput').fill('scena 3'); await t.page.keyboard.press('Enter'); await settle(t);
    t.check(`${label}: Go to scene uses source positions`, (await state(t)).selection.kind === 'scene' && await t.page.locator('#phoneWriter .active-edit').textContent() === 'INT. LUOGO 3 - GIORNO');
    await t.page.locator('#phoneGotoBtn').tap(); await t.page.locator('[data-tab=characters]').tap();
    t.check(`${label}: character list shows first and last appearance pages`, await t.page.locator('#phoneGoList button').count() === 1 && /12/.test(await t.page.locator('#phoneGoList small').textContent()));
    await t.page.locator('#phoneGoInput').fill('pagina 999999'); await t.page.keyboard.press('Enter');
    t.check(`${label}: unknown page gives an error without closing the sheet`, await t.page.locator('#phoneGoError').isVisible()); await t.page.keyboard.press('Escape'); await settle(t);
    await t.page.locator('#phoneGotoBtn').tap(); await t.page.locator('#phoneGoInput').fill('finestra'); await t.page.keyboard.press('Enter'); await settle(t);
    t.check(`${label}: Go to a word selects its text without changing source`, (await state(t)).source.slice((await state(t)).selection.anchor, (await state(t)).selection.focus) === 'finestra' && await focused(t));
    await t.page.locator('#phoneMenuBtn').tap();
    await settle(t);
    await t.page.locator('#phoneMenuPanel').evaluate(async n => { await Promise.all(n.getAnimations().map(a => a.finished)); });
    const menuBox = await t.page.locator('#phoneMenuPanel').boundingBox();
    t.check(`${label}: one right side menu contains settings and seven document commands`, Math.abs(menuBox.width - width * .85) < 1 && Math.abs(menuBox.x + menuBox.width - width) < 1 && await t.page.locator('.phone-menu-body>button:not([role=switch])').count() === 7 && await t.page.locator('#phoneSettingsBtn').count() === 0);
    t.check(`${label}: menu rows use the existing desktop icons and 17px text`, await t.page.locator('[data-phone-command=commentsBtn]').evaluate(n => getComputedStyle(n).fontSize === '17px' && n.querySelector('svg').outerHTML === document.querySelector('.editor-toolbar [data-command=commentsBtn] svg').outerHTML));
    for (const [command, kind] of [['darkModeToggle','checkbox'],['sceneNumbersToggle','checkbox'],['revisionVisibleBtn','pressed']]) {
      const button = t.page.locator('[data-phone-command=' + command + ']');
      const real = () => t.page.evaluate(({command,kind}) => kind === 'checkbox' ? document.getElementById(command).checked : document.getElementById(command).getAttribute('aria-pressed') === 'true', {command,kind});
      const before = await real();
      t.check(`${label}: ${command} switch shows the actual state`, await button.getAttribute('aria-checked') === String(before));
      await button.tap(); await settle(t);
      if (command === 'sceneNumbersToggle') t.check(`${label}: scene-number switch changes the writing chips too`, await t.page.locator('.phone-scene-number').first().isVisible() === !before);
      if (command === 'revisionVisibleBtn') t.check(`${label}: revision switch changes the real printed-page visibility`, await t.page.locator('#scriptEditor').evaluate(n => n.classList.contains('revisions-hidden')) === before);
      t.check(`${label}: ${command} switch updates the original setting and remains open`, await real() !== before && await button.getAttribute('aria-checked') === String(!before) && await t.page.locator('#phoneMenuPanel').isVisible());
      await button.tap(); await settle(t);
    }
    const sourceBeforeSize = await t.src(); await t.page.locator('#phoneTextSize').evaluate(n => { n.value = '24'; n.dispatchEvent(new Event('input', { bubbles:true })); });
    t.check(`${label}: phone text size is applied, remembered and does not affect the source`, await t.page.locator('#phoneWriter').evaluate(n => getComputedStyle(n).fontSize) === '24px' && await t.page.evaluate(() => localStorage.getItem('scriptoti-phone-size')) === '24' && await t.src() === sourceBeforeSize);
    await t.page.keyboard.press('Escape'); await settle(t); await t.page.locator('#phoneMenuBtn').tap();
    await t.page.touchscreen.tap(10, 200); await settle(t);
    t.check(`${label}: tapping outside closes the side menu`, !await t.page.locator('#phoneMenuPanel').isVisible());
    await t.page.locator('#phoneMenuBtn').tap(); await settle(t);
    const swipeBox = await t.page.locator('.phone-menu-head').boundingBox(), swipe = await t.context.newCDPSession(t.page);
    await swipe.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:swipeBox.x + 20, y:swipeBox.y + 25, id:1 }] });
    await swipe.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:swipeBox.x + 140, y:swipeBox.y + 27, id:1 }] });
    await swipe.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await swipe.detach(); await settle(t);
    t.check(`${label}: swiping right closes the side menu`, !await t.page.locator('#phoneMenuPanel').isVisible());
    await t.page.locator('#phoneMenuBtn').tap(); await t.page.goBack(); await settle(t);
    t.check(`${label}: browser Back still closes the menu without navigating away`, !await t.page.locator('#phoneMenuPanel').isVisible() && t.page.url() === t.url);
    await t.page.locator('#phoneMenuBtn').tap();
    await t.page.locator('[data-phone-command=replaceMenuBtn]').tap(); await settle(t);
    t.check(`${label}: Find and replace menu row calls the original command`, await t.page.locator('#findBar').isVisible() && await t.page.locator('#findMode').inputValue() === 'replace' && !await t.page.locator('#phoneMenuPanel').isVisible());
    await t.page.locator('#findCloseBtn').click(); await settle(t); await t.page.locator('#phoneMenuBtn').tap();
    await t.page.locator('[data-phone-command=titlePageBtn]').tap(); await settle(t);
    const titleBox = await t.page.locator('#titleDialog').boundingBox();
    t.check(`${label}: title page form fills the phone`, titleBox.width === width && titleBox.height === height);
    await t.page.locator('#titleForm [name=title]').fill('Il nuovo titolo'); await t.page.locator('#titleForm [name=author]').fill('Toti');
    await t.page.locator('#titleForm button[type=submit]').click(); await settle(t);
    t.check(`${label}: title page form saves through the original code`, (await t.src()).includes('Title: Il nuovo titolo') && (await state(t)).document.layout.titleVisible && !await t.page.locator('#titleDialog').isVisible() && await focused(t));
    await t.page.locator('#phonePreviewBtn').tap(); await settle(t);
    const pageBox = await t.page.locator('#scriptEditor>.script-page').first().boundingBox(), previewSource = await t.src();
    t.check(`${label}: preview shows the real pages fitted to the screen`, await t.page.locator('#scriptEditor').isVisible() && !await t.page.locator('#phoneWriter').isVisible() && pageBox.width <= width - 20 && await t.page.locator('#scriptEditor').getAttribute('contenteditable') === 'false');
    await t.page.locator('#scriptEditor').dispatchEvent('beforeinput', { inputType:'insertText', data:'NON SCRIVERE', bubbles:true, cancelable:true });
    await t.page.locator('#scriptEditor').dispatchEvent('keydown', { key:'Backspace', bubbles:true, cancelable:true });
    t.check(`${label}: preview is read only, including hardware editing keys`, await t.src() === previewSource);
    const initialWidth = pageBox.width; await pinch(t, 1.4);
    t.check(`${label}: pinch scales printed pages without scaling the site`, (await t.page.locator('#scriptEditor>.script-page').first().boundingBox()).width > initialWidth * 1.2 && await t.page.evaluate(() => visualViewport.scale === 1 && getComputedStyle(document.body).zoom === '1'));
    t.check(`${label}: preview has an X and a top Share icon, without bottom buttons`, await t.page.locator('#phoneWriteBtn').getAttribute('aria-label') === (locale === 'it-IT' ? "Chiudi l'anteprima" : 'Close preview') && await t.page.locator('#phoneWriteBtn svg').count() === 1 && await t.page.locator('.phone-preview-foot').count() === 0 && await t.page.locator('#phonePreviewShare').isVisible());
    await t.page.locator('#phonePreviewShare').tap(); await settle(t);
    t.check(`${label}: preview Share opens a small sheet with the two existing export actions`, await t.page.locator('.phone-send-sheet').isVisible() && await t.page.locator('.phone-send-sheet').evaluate(n => n.getBoundingClientRect().height < visualViewport.height) && await t.page.locator('.phone-menu-body>button').count() === 2);
    await t.page.locator('#phonePreviewPdf').tap(); t.check(`${label}: preview PDF opens the common export dialog`, await t.page.locator('#exportDialog').isVisible()); await t.page.locator('#exportDialog button[type=button]').click();
    await t.page.evaluate(() => { navigator.canShare = () => true; navigator.share = async data => { window.phoneSent = { name:data.files[0].name, text:await data.files[0].text() }; }; });
    await t.page.locator('#phonePreviewShare').tap(); await t.page.locator('#phoneSendFile').tap(); await settle(t);
    t.check(`${label}: Send file shares a Fountain copy of the current script`, await t.page.evaluate(() => window.phoneSent.name.endsWith('.fountain') && window.phoneSent.text.includes('Il nuovo titolo')));
    await t.page.evaluate(() => navigator.canShare = () => false);
    await t.page.locator('#phonePreviewShare').tap(); const download = t.page.waitForEvent('download'); await t.page.locator('#phoneSendFile').tap();
    t.check(`${label}: Send file falls back to a download`, (await download).suggestedFilename().endsWith('.fountain'));
    await t.page.locator('#phoneWriteBtn').tap(); await settle(t); t.check(`${label}: Write restores the editable view and caret`, await focused(t) && await t.page.locator('#phoneWriter').isVisible());
    await exports(t, label);
    await t.page.evaluate(() => { window.showOpenFilePicker = undefined; });
    await t.page.locator('#phoneMenuBtn').tap();
    const picking = t.page.waitForEvent('filechooser'); await t.page.locator('[data-phone-command=openBtn]').tap();
    await (await picking).setFiles({ name:'aperto.fountain', mimeType:'text/plain', buffer:Buffer.from(basic) });
    await t.page.waitForFunction(() => DraftEditor.state().name === 'aperto.fountain');
    t.check(`${label}: Open another script retains the native picker and original file pipeline`, await t.src() === basic && !await t.page.locator('#phoneMenuPanel').isVisible());
    // A phone edit must still reach the same guarded local-file session.
    await t.page.evaluate(async () => { const root = await navigator.storage.getDirectory(), h = await root.getFileHandle('phone.fountain', { create:true }), w = await h.createWritable(); await w.write('!Primo.\n'); await w.close(); await DraftSafe.openHandle(h); });
    await settle(t); await t.caretAfter('Primo.'); await t.type(' Secondo.'); await t.page.waitForTimeout(2600);
    t.check(`${label}: phone edits autosave through the existing file pipeline`, await t.page.evaluate(async () => { const root = await navigator.storage.getDirectory(); return (await (await (await root.getFileHandle('phone.fountain')).getFile()).text()).includes('Primo. Secondo.'); }));
    for (const color of ['green','yellow','red']) {
      await t.page.evaluate(color => { const led = document.querySelector('#shareLed'); led.hidden = false; led.className = 'share-led ' + color; led.title = color; }, color); await settle(t);
      t.check(`${label}: phone sharing dot mirrors desktop ${color}`, await t.page.locator('#phoneShareLed').isVisible() && await t.page.locator('#phoneShareLed').evaluate((n,color) => n.classList.contains(color), color));
    }
    t.check(`${label}: sharing dot sits next to the name`, await t.page.locator('#phoneShareLed').evaluate(n => Math.abs(n.getBoundingClientRect().left - document.querySelector('#filename').getBoundingClientRect().right - 5) < 1));
    await t.page.evaluate(() => { document.querySelector('#shareLed').onclick = () => window.phoneShareOpened = true; }); await t.page.locator('#phoneShareLed').tap();
    t.check(`${label}: tapping the sharing dot calls the existing Share command`, await t.page.evaluate(() => window.phoneShareOpened === true));
    await t.page.evaluate(() => document.querySelector('#shareLed').hidden = true); await settle(t);
    t.check(`${label}: sharing dot is hidden when the document is not shared`, !await t.page.locator('#phoneShareLed').isVisible());
    t.check(`${label}: phone manual page exists in the selected language`, await t.page.evaluate(() => ScripTotiManual.entries.some(e => e.id === 'telefono' && e.body.length === 8)));
  } finally { t.report(); await t.close(); }
}

const desktop = await open();
try {
  await exports(desktop, 'desktop');
  await desktop.page.keyboard.press('Control+p');
  desktop.check('desktop: Ctrl+P opens export options', await desktop.page.locator('#exportDialog').isVisible()); await desktop.page.locator('#exportDialog button[type=button]').click();
  await desktop.page.keyboard.press('Meta+p'); desktop.check('desktop: Cmd+P opens the same dialog', await desktop.page.locator('#exportDialog').isVisible()); await desktop.page.locator('#exportDialog button[type=button]').click();
  desktop.check('desktop: no phone view or controls are shown', !await desktop.page.locator('#phoneWriter').isVisible() && !await desktop.page.locator('#phoneGotoBtn').isVisible() && await desktop.page.locator('.editor-toolbar').isVisible());
} finally { desktop.report(); await desktop.close(); }

// Tablets (iPad, with or without keyboard) keep the computer's page view.
{
  const t = await open({ width: 820, height: 1180, hasTouch: true, isMobile: true });
  try {
    await t.load('INT. CASA - GIORNO\n\nMarta guarda fuori.\n\n'); await t.page.waitForTimeout(300);
    const view = await t.page.evaluate(() => ({ phone: document.documentElement.classList.contains('phone-writing'), pages: getComputedStyle(document.querySelector('#scriptEditor')).display !== 'none', toolbar: getComputedStyle(document.querySelector('.editor-toolbar')).display !== 'none' }));
    t.check('tablet: page view and toolbar, not the phone view', !view.phone && view.pages && view.toolbar, JSON.stringify(view));
  } finally { t.report(); await t.close(); }
}
