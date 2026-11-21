import { open } from './lib.mjs';
for (const phone of [false, true]) {
  const t = await open(phone ? { width:390, height:844, hasTouch:true, isMobile:true } : {});
  try {
    await t.page.evaluate(() => document.querySelector('#helpAskBtn').click());
    const chat = t.page.locator('.help-chat'), head = chat.locator('.help-chat-head');
    const initial = await chat.boundingBox(), bar = await head.boundingBox();
    await t.page.mouse.move(bar.x + 10, bar.y + 10);
    await t.page.mouse.down(); await t.page.mouse.move(10, 10); await t.page.mouse.up();
    const moved = await chat.boundingBox();
    if (phone) t.check('Finestra ferma sul telefono', moved.x === initial.x && moved.y === initial.y);
    else {
      t.check('Trascinamento fino al bordo', moved.x === 0 && moved.y === 0, JSON.stringify(moved));
      t.check('Fuoco nella domanda', await chat.locator('input').evaluate(el => el === document.activeElement));
      await chat.locator('.help-close').click(); await t.page.evaluate(() => document.querySelector('#helpAskBtn').click());
      const again = await chat.boundingBox();
      t.check('Posizione alla riapertura', again.x === moved.x && again.y === moved.y);
      await head.dblclick({ position:{ x:10, y:10 } });
      const reset = await chat.boundingBox();
      t.check('Doppio clic ripristina la posizione', reset.x === initial.x && reset.y === initial.y);
      await t.page.mouse.move(reset.x + 10, reset.y + 10);
      await t.page.mouse.down(); await t.page.mouse.move(1279, 899); await t.page.mouse.up();
      await t.page.setViewportSize({ width:800, height:650 });
      await t.page.waitForFunction(() => {
        const r = document.querySelector('.help-chat').getBoundingClientRect();
        return r.right <= innerWidth && r.bottom <= innerHeight;
      });
    }
    t.report();
  } finally { await t.close(); }
}
