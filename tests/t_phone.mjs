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
      t.check('landscape: tapping thin bar restores tools', await t.page.locator('.editor-toolbar').isVisible() && await t.page.locator('#projectTabs').isVisible());
      // A real command must remain reachable after expanding the thin bar.
      await t.page.locator('.menu-dropdown summary').first().tap();
      t.check('landscape: File menu remains usable', await t.page.locator('#fileMenu').isVisible());
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
