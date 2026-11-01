// Chrome cannot open an OS keyboard: shrink/offset the real visualViewport
// API for keyboard checks, but use real selection rects and trusted touches.
import { open } from './lib.mjs';

const longScript = 'INT. CASA - GIORNO\n\n' + Array.from({ length:80 }, (_, i) => `Marta guarda la strada. Passaggio ${i}.\n\n`).join('');
const settle = t => t.page.waitForTimeout(160);
const metrics = t => t.page.evaluate(() => {
  const range = getSelection().getRangeAt(0), r = range.getClientRects()[0] || range.getBoundingClientRect();
  const stage = document.querySelector('#stage'), box = stage.getBoundingClientRect(), vv = visualViewport;
  const stats = document.querySelector('.stats').getBoundingClientRect();
  return { caret:r.toJSON(), stage:box.toJSON(), scroll:stage.scrollTop, left:stage.scrollLeft,
    top:Math.max(box.top, vv.offsetTop), bottom:Math.min(box.bottom, vv.offsetTop + vv.height),
    right:Math.min(box.right, vv.offsetLeft + vv.width), scale:vv.scale, stats:stats.toJSON(),
    zoom:document.querySelector('#zoomValue').value, bodyZoom:getComputedStyle(document.body).zoom,
    collapsed:document.documentElement.classList.contains('phone-typing'), height:innerHeight,
    selection:DraftEditor.state().selection,
    wordCount:document.querySelector('#wordsStat').textContent };
});
const visible = m => m.caret.height > 0 && m.caret.top >= m.top && m.caret.bottom <= m.bottom && m.caret.left >= m.stage.left && m.caret.right <= m.right;
async function keyboard(t, height, offsetTop = 0, event = 'resize') {
  await t.page.evaluate(({ height, offsetTop, event }) => {
    Object.defineProperties(visualViewport, {
      height:{ configurable:true, get:() => height }, offsetTop:{ configurable:true, get:() => offsetTop }
    });
    visualViewport.dispatchEvent(new Event(event));
  }, { height, offsetTop, event });
  await settle(t);
}
async function pinch(t, ratio, cancel = false) {
  const session = await t.context.newCDPSession(t.page);
  const box = await t.page.locator('#stage').boundingBox();
  const x = box.x + box.width / 2, y = box.y + Math.min(100, box.height / 2);
  const points = distance => [
    { x:x - distance / 2, y, id:1, radiusX:5, radiusY:5 },
    { x:x + distance / 2, y, id:2, radiusX:5, radiusY:5 }
  ];
  // Vary the starting span so even the limit checks stay inside the stage.
  const start = Math.min(100, (box.width - 40) / Math.max(1, ratio));
  try {
    await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[points(start)[0]] });
    await t.page.waitForTimeout(30);
    await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:points(start) });
    for (let i = 1; i <= 5; i++) {
      await session.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:points(start * (1 + (ratio - 1) * i / 5)) });
      await t.page.waitForTimeout(25);
    }
    await session.send('Input.dispatchTouchEvent', { type:cancel ? 'touchCancel' : 'touchEnd', touchPoints:[] });
  } finally { await session.detach(); }
  await settle(t);
}
async function phoneInterface(t, label, width, height) {
  const panel = t.page.locator('#phoneMenuPanel'), strip = t.page.locator('#phoneKeyboard');
  const state = () => t.page.evaluate(() => DraftEditor.state());
  const focused = () => t.page.evaluate(() => document.activeElement === document.querySelector('#scriptEditor'));
  const openMenu = async () => { await t.page.locator('#phoneMenuBtn').tap(); await settle(t); };
  const submenu = async id => {
    const name = await t.page.evaluate(id => document.querySelector('#' + id).closest('details').querySelector('summary').textContent, id);
    await panel.locator('.phone-menu-body button').getByText(name, { exact:true }).tap();
  };
  const base = 'INT. CASA - GIORNO\n\nMarta guarda la strada.\nUn secondo pensiero.\n\nMARTA\nCiao.\n\n';
  await t.load(base); await t.caretAfter('strada.');
  const clean = await t.src(); await t.type(' Prova menu.');
  await openMenu();
  let box = await panel.boundingBox();
  t.check(`${label}: phone menu fills the visible screen`, box && box.x === 0 && box.y === 0 && box.width === width && box.height === height, JSON.stringify(box));
  t.check(`${label}: seven large menu rows replace the desktop menu bar`, await panel.locator('.phone-menu-body>button').count() === 7 && await panel.locator('.phone-menu-body>button').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().height >= 48)) && !await t.page.locator('.menu-bar').isVisible());
  await submenu('undoBtn');
  t.check(`${label}: command rows are large and have no shortcut hint`, await panel.locator('[data-phone-command=undoBtn]').evaluate(n => n.getBoundingClientRect().height >= 48 && !n.hasAttribute('data-shortcut') && !n.title));
  await panel.locator('[data-phone-command=undoBtn]').tap(); await settle(t);
  t.check(`${label}: menu Undo calls the existing command and closes`, !await panel.isVisible() && await t.src() === clean, JSON.stringify((await t.src()).slice(-100)));
  await openMenu(); await submenu('boldBtn');
  const back = panel.locator('.phone-menu-head button').first(); await back.tap();
  t.check(`${label}: back arrow returns to the menu list`, await panel.locator('.phone-menu-body>button').count() === 7);
  await t.page.keyboard.press('Escape'); await settle(t);
  t.check(`${label}: Escape closes the full-screen menu`, !await panel.isVisible());
  const url = t.page.url(); await openMenu(); await t.page.goBack(); await settle(t);
  t.check(`${label}: browser Back closes menu without leaving the script`, !await panel.isVisible() && t.page.url() === url && await t.src() === clean);
  await openMenu(); await panel.locator('.phone-menu-head button').last().tap(); await settle(t);
  t.check(`${label}: close button closes the panel`, !await panel.isVisible());
  // Opening a native picker must still happen in the original tap gesture.
  await t.page.evaluate(() => { window.showOpenFilePicker = undefined; });
  await openMenu(); await submenu('openBtn');
  const picker = t.page.waitForEvent('filechooser');
  await panel.locator('[data-phone-command=openBtn]').tap();
  const chooser = await picker;
  await chooser.setFiles({ name:'telefono.fountain', mimeType:'text/plain', buffer:Buffer.from('INT. CASA - GIORNO\n\nUn file aperto dal menu del telefono.\n') });
  await t.page.waitForFunction(() => DraftEditor.state().source.includes('Un file aperto dal menu del telefono.'));
  t.check(`${label}: phone Open reaches the native file picker and loads the file`, !await panel.isVisible() && (await state()).name === 'telefono.fountain');
  await t.page.evaluate(() => DraftEditor.writable(false));
  await openMenu(); await submenu('undoBtn');
  t.check(`${label}: disabled desktop commands stay disabled in the phone menu`, await panel.locator('[data-phone-command=undoBtn]').isDisabled());
  await t.page.keyboard.press('Escape'); await settle(t); await t.page.evaluate(() => DraftEditor.writable(true));
  await openMenu(); await submenu('boldBtn');
  t.check(`${label}: line spacing remains reachable from Format`, await panel.locator('select').count() === 1);
  await t.page.keyboard.press('Escape'); await settle(t);
  await t.page.locator('#saveStatus').tap(); await settle(t);
  const commands = await t.page.locator('.editor-toolbar [data-command]').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height && getComputedStyle(n).display !== 'none').map(n => n.dataset.command).sort());
  const essential = ['saveBtn','printBtn','shareBtn','boldBtn','italicBtn','underlineBtn','caseBtn'].sort();
  t.check(`${label}: essential toolbar contains only the requested commands and revision switch`, JSON.stringify(commands) === JSON.stringify(essential) && await t.page.locator('#revisionTrackingSwitch').isVisible(), JSON.stringify(commands));
  t.check(`${label}: essential controls fit the phone and hide shortcut hints`, await t.page.locator('.editor-toolbar [data-command]').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height).every(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && !/\((?:Ctrl|Cmd|Alt)/.test(n.title); })) && await t.page.locator('#revisionTrackingSwitch').evaluate(n => n.getBoundingClientRect().right <= innerWidth));
  t.check(`${label}: no keyboard strip while keyboard is closed`, !await strip.isVisible());
  await t.load(base); await t.caretAfter('strada.'); await keyboard(t, height > 500 ? 440 : 240);
  t.check(`${label}: strip docks to the keyboard and has 44px buttons`, await strip.isVisible() && await strip.evaluate(n => Math.abs(n.getBoundingClientRect().bottom - (visualViewport.offsetTop + visualViewport.height)) < 1) && await strip.locator('.phone-keys button').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().width >= 44 && n.getBoundingClientRect().height >= 44)));
  await t.press('Tab'); const tabbed = await state();
  await t.load(base); await t.caretAfter('strada.'); await settle(t);
  await t.page.locator('#phoneTab').tap(); await settle(t);
  let actual = await state();
  t.check(`${label}: strip Tab is identical to keyboard Tab and keeps focus`, actual.source === tabbed.source && actual.selection.kind === tabbed.selection.kind && await focused());
  await t.press('Shift+Tab'); const previous = await state();
  await t.page.locator('#phoneTab').tap(); await t.page.locator('#phoneBackTab').tap(); await settle(t);
  t.check(`${label}: strip Shift+Tab uses the same type cycle`, (await state()).source === previous.source && await focused());
  // A long press must choose a type without also firing an extra Tab on release.
  const cdp = await t.context.newCDPSession(t.page), tab = await t.page.locator('#phoneTab').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:tab.x + tab.width / 2, y:tab.y + tab.height / 2, id:1 }] });
  await t.page.waitForTimeout(550); await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await cdp.detach(); await settle(t);
  t.check(`${label}: long press offers the six existing Fountain types`, await t.page.locator('#phoneTypes').isVisible() && await t.page.locator('#phoneTypes button').count() === 6);
  await t.page.locator('#phoneType-character').tap(); await settle(t);
  t.check(`${label}: direct type choice uses the cycle and preserves focus`, (await state()).selection.kind === 'character' && !await t.page.locator('#phoneTypes').isVisible() && await focused());
  await t.load(base); await t.caretAfter('guarda'); await settle(t);
  const caret = (await state()).selection.focus, unchanged = await t.src();
  await t.page.locator('#phoneArrowLeft').tap(); await settle(t);
  t.check(`${label}: left arrow moves the caret without editing`, (await state()).selection.focus === caret - 1 && await t.src() === unchanged && await focused());
  await t.page.locator('#phoneArrowRight').tap(); await settle(t);
  t.check(`${label}: right arrow moves it back`, (await state()).selection.focus === caret && await focused());
  await t.press('ArrowDown'); const below = (await state()).selection.focus;
  await t.caret(caret); await t.page.locator('#phoneArrowDown').tap(); await settle(t);
  t.check(`${label}: down arrow follows the existing visual navigation`, (await state()).selection.focus === below && await focused());
  await t.press('ArrowUp'); const above = (await state()).selection.focus;
  await t.caret(below); await t.page.locator('#phoneArrowUp').tap(); await settle(t);
  t.check(`${label}: up arrow follows the existing visual navigation`, (await state()).selection.focus === above && await focused());
  await t.type('X'); const edited = await t.src();
  await t.page.locator('#phoneUndo').tap(); await settle(t);
  t.check(`${label}: strip Undo preserves focus and restores the text`, await t.src() === unchanged && await focused());
  await t.page.locator('#phoneRedo').tap(); await settle(t);
  t.check(`${label}: strip Redo restores the edit`, await t.src() === edited && await focused());
  await t.load(base); await t.caretAfter('Ciao.'); await t.type('('); const parenthesis = await t.src();
  await t.load(base); await t.caretAfter('Ciao.'); await settle(t);
  await t.page.locator('#phoneParenthesis').tap(); await settle(t);
  t.check(`${label}: parenthesis button uses the existing input handler`, await t.src() === parenthesis && await focused());
  await t.page.locator('.phone-keys').evaluate(n => n.scrollLeft = n.scrollWidth); await settle(t);
  t.check(`${label}: Tab, arrows and Undo stay visible after sideways scroll`, await t.page.evaluate(() => ['phoneTab','phoneArrowLeft','phoneArrowRight','phoneArrowUp','phoneArrowDown','phoneUndo'].every(id => {
    const n = document.getElementById(id), r = n.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && n.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })));
  const scenes = 'INT. CASA - GIORNO\n\nMARTA\nCiao.\n\nINT. STRADA - GIORNO\n\nFuori piove.\n\nINT. AUTO - GIORNO\n\nUn viaggio.\n\nINT. NEGOZIO - GIORNO\n\nLa porta si apre.\n\n';
  await t.load(scenes); await t.caret((await t.src()).length); await t.type('MA'); await settle(t);
  const chip = t.page.locator('#phoneSuggestions #completionPopup button[role=option]').filter({ has:t.page.locator('span', { hasText:/^MARTA$/ }) });
  t.check(`${label}: character suggestions are chips above the keyboard row`, await chip.isVisible() && await chip.evaluate(n => n.getBoundingClientRect().bottom <= document.querySelector('.phone-keys').getBoundingClientRect().top + 1));
  const withChips = await metrics(t);
  t.check(`${label}: chips and counters leave the caret unobstructed`, visible(withChips) && withChips.caret.bottom <= withChips.stats.top && withChips.stage.bottom <= withChips.stats.top + 1, JSON.stringify(withChips));
  t.check(`${label}: chips retain the page and scene reminder`, /pag\.|page/.test(await chip.locator('small').textContent()));
  await t.page.evaluate(() => dispatchEvent(new Event('resize'))); await settle(t);
  t.check(`${label}: docked suggestions survive a viewport resize`, await chip.isVisible());
  await keyboard(t, height > 500 ? 400 : 220);
  await t.page.locator('#zoomSlider').evaluate(n => { n.value = '200'; n.dispatchEvent(new Event('input')); }); await settle(t);
  const enlarged = await metrics(t);
  t.check(`${label}: caret clears chips and counters even at 200%`, visible(enlarged) && enlarged.caret.bottom <= enlarged.stats.top, JSON.stringify(enlarged));
  await t.page.locator('#zoomSlider').evaluate(n => { n.value = '100'; n.dispatchEvent(new Event('input')); });
  await keyboard(t, height > 500 ? 440 : 240);
  await chip.tap(); await settle(t);
  t.check(`${label}: tapping a chip accepts the existing completion`, /\nMARTA\n*$/.test(await t.src()) && await focused() && !await t.page.locator('#phoneSuggestions #completionPopup').isVisible(), JSON.stringify((await t.src()).slice(-80)));
  await t.load(scenes); await t.caret((await t.src()).length); await t.type('INT. C'); await settle(t);
  t.check(`${label}: scene-heading suggestions also use chips`, await t.page.locator('#phoneSuggestions #completionPopup button span').filter({ hasText:/^CASA$/ }).isVisible());
  await t.load(base); await t.caretAfter('guarda'); await t.type(' ancora'); await settle(t);
  t.check(`${label}: suggestion row vanishes for ordinary prose`, !await t.page.locator('#phoneSuggestions #completionPopup').isVisible());
  await t.page.evaluate(() => document.querySelector('#findMenuBtn').click()); await settle(t);
  t.check(`${label}: strip hides when writing in another field`, !await strip.isVisible());
  await t.page.locator('#findCloseBtn').click(); await keyboard(t, height);
  t.check(`${label}: strip disappears when keyboard closes`, !await strip.isVisible());
}
for (const [width, height, locale] of [[390,844,'it-IT'], [844,390,'en-US']]) {
  const t = await open({ width, height, locale, hasTouch:true, isMobile:true });
  const label = width < height ? 'portrait' : 'landscape';
  try {
    await t.load(longScript); await t.caret((await t.src()).length);
    await t.type('Un nuovo pensiero.');
    let m = await metrics(t);
    t.check(`${label}: caret visible at the end of a long script`, visible(m), JSON.stringify(m));
    t.check(`${label}: emulation has touch and no page scaling`, await t.page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches) && m.scale === 1);
    if (width > height) {
      t.check('landscape: editor uses at least 70% while typing', m.collapsed && m.stage.height >= height * .7, JSON.stringify(m));
      t.check('landscape: tabs and toolbar hidden, thin bar retains name and status', await t.page.evaluate(() => {
        const shown = selector => document.querySelector(selector).getBoundingClientRect().height > 0;
        return !shown('#projectTabs') && !shown('.editor-toolbar') && !shown('.menu-bar') && shown('#phoneMenuBtn') && shown('#filename') && shown('#saveStatus') && document.querySelector('.topbar').getBoundingClientRect().height <= 40;
      }));
      t.check('landscape: menu label is translated', await t.page.locator('#phoneMenuBtn').getAttribute('aria-label') === 'Show menus and tools');
      await t.page.locator('#phoneMenuBtn').tap(); await settle(t);
      t.check('landscape: tapping menu opens the phone panel', await t.page.locator('#phoneMenuPanel').isVisible());
      await t.page.locator('#phoneMenuPanel .phone-menu-body button').first().tap();
      t.check('landscape: File commands remain usable', await t.page.locator('[data-phone-command=openBtn]').isVisible());
      await t.page.keyboard.press('Escape'); await settle(t);
      await t.caretAfter('Un nuovo pensiero.');
      // Phone keyboards may edit without sending a hardware keydown.
      await t.page.evaluate(() => document.querySelector('#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles:true, cancelable:true, inputType:'insertText', data:' Ancora.' })));
      await settle(t);
      t.check('landscape: soft keyboard edit collapses tools again', (await metrics(t)).collapsed && (await t.src()).includes('Ancora.'));
      const session = await t.context.newCDPSession(t.page);
      const box = await t.page.locator('#stage').boundingBox();
      const p = { x:box.x + 35, y:box.y + 60, id:1 };
      await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[p] });
      await session.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ ...p, y:p.y + 40 }] });
      await session.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      await session.detach(); await settle(t);
      t.check('landscape: scrolling up restores tools', !(await metrics(t)).collapsed);
      await t.caret((await t.src()).length); await t.type(' Fine.');
    }
    // Put the caret low in the layout viewport, then open the keyboard.
    await t.page.evaluate(() => {
      const s = document.querySelector('#stage'), r = getSelection().getRangeAt(0).getBoundingClientRect(), b = s.getBoundingClientRect();
      s.scrollTop += r.top - (b.top + b.height * .85);
    });
    await keyboard(t, height > 500 ? 440 : 240);
    await t.type(' La tastiera resta aperta.');
    m = await metrics(t);
    t.check(`${label}: caret above the keyboard after typing`, visible(m), JSON.stringify(m));
    t.check(`${label}: page and word counters stay above the keyboard`, m.stats.top >= 0 && m.stats.bottom <= (height > 500 ? 440 : 240) + 1 && !!m.wordCount && await t.page.locator('#currentPage').isVisible(), JSON.stringify(m));
    // Safari can pan the visual viewport without resizing the layout viewport.
    await keyboard(t, height > 500 ? 400 : 220, 20, 'scroll');
    await t.press('Enter'); await t.type('Un’altra riga.');
    m = await metrics(t);
    t.check(`${label}: caret survives viewport scroll and Enter`, visible(m), JSON.stringify(m));
    await t.press('Backspace', 4);
    t.check(`${label}: caret stays visible after deletion`, visible(await metrics(t)));
    // Selection-only moves must reveal the caret too, even without an edit.
    await t.caretBefore('Passaggio 35');
    await t.page.evaluate(() => { document.querySelector('#stage').scrollTop += 220; document.dispatchEvent(new Event('selectionchange')); });
    await settle(t); m = await metrics(t);
    const target = m.top + 12 + (m.bottom - m.top - 24) / 3;
    t.check(`${label}: offscreen selection is revealed near one third`, visible(m) && Math.abs(m.caret.top - target) < 3, JSON.stringify(m));
    await t.caret((await t.src()).length); await t.press('Enter');
    m = await metrics(t);
    const emptyLine = await t.page.locator('.editable-region.active-edit').evaluate(n => ({ empty:n.dataset.empty, rect:n.getBoundingClientRect().toJSON() }));
    t.check(`${label}: empty caret line is visible`, emptyLine.empty === 'true' && emptyLine.rect.top >= m.top && emptyLine.rect.bottom <= m.bottom, JSON.stringify({ emptyLine, m }));
    await keyboard(t, height);
    await t.caretAfter('Un nuovo pensiero.');
    const source = await t.src(), before = await metrics(t);
    await pinch(t, 1.4);
    const after = await metrics(t);
    t.check(`${label}: trusted pinch changes page zoom`, parseInt(after.zoom) > parseInt(before.zoom) + 20, JSON.stringify({ before, after }));
    t.check(`${label}: pinch keeps browser and document scale fixed`, after.scale === 1 && after.bodyZoom === '1' && await t.page.evaluate(() => getComputedStyle(document.documentElement).zoom === '1' && getComputedStyle(document.querySelector('.topbar')).zoom === '1'));
    t.check(`${label}: pinch preserves source and caret`, await t.src() === source && visible(after) && before.selection.anchor === after.selection.anchor && before.selection.focus === after.selection.focus, JSON.stringify({ sameSource:await t.src() === source, before, after }));
    await pinch(t, 4); t.check(`${label}: pinch stops at 200%`, (await metrics(t)).zoom === '200%');
    await pinch(t, .1, true); t.check(`${label}: pinch stops at 50% and handles cancellation`, (await metrics(t)).zoom === '50%');
    await pinch(t, 2); t.check(`${label}: another pinch works after cancellation`, (await metrics(t)).zoom === '100%');
    await t.page.evaluate(() => document.querySelector('#findMenuBtn').click());
    await t.page.locator('#findInput').fill('Marta');
    const scroll = await t.page.locator('#stage').evaluate(s => s.scrollTop);
    await keyboard(t, height > 500 ? 440 : 240); await settle(t);
    t.check(`${label}: caret reveal does not steal Find input focus`, await t.page.locator('#findInput').evaluate(n => n === document.activeElement) && await t.page.locator('#stage').evaluate(s => s.scrollTop) === scroll);
    t.check(`${label}: form fields avoid iOS auto zoom`, await t.page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, select')].every(n => parseFloat(getComputedStyle(n).fontSize) >= 16)));
    await t.page.locator('#findCloseBtn').click(); await keyboard(t, height);
    await phoneInterface(t, label, width, height);
    await t.page.setViewportSize({ width:height, height:width }); await settle(t);
    await t.caret((await t.src()).length); await t.type(' Dopo la rotazione.');
    m = await metrics(t);
    t.check(`${label}: orientation change keeps caret visible`, visible(m), JSON.stringify(m));
    t.check(`${label}: compact state follows orientation`, m.collapsed === (width <= 500));
  } finally { t.report(); await t.close(); }
}

// Desktop: selection notifications must not move an already visible caret.
const t = await open();
try {
  await t.load('INT. CASA - GIORNO\n\nMarta guarda fuori.'); await t.caretAfter('Marta');
  const before = await metrics(t);
  await t.page.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await settle(t);
  const after = await metrics(t);
  t.check('desktop: visible selection does not scroll or hide tools', before.scroll === after.scroll && !after.collapsed && await t.page.locator('.editor-toolbar').isVisible() && !await t.page.locator('#phoneMenuBtn').isVisible());
  t.check('desktop: no phone sizing styles applied', await t.page.evaluate(() => !document.documentElement.style.getPropertyValue('--phone-height')));
} finally { t.report(); await t.close(); }
