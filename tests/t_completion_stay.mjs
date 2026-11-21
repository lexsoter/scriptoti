import { open } from './lib.mjs';
for (const phone of [false, true]) {
  const t = await open(phone ? { width:390, height:844, hasTouch:true, isMobile:true } : {});
  try {
    for (const [start, letter, expected] of [['MA', 'R', 'MARTA'], ['INT. PO', 'R', 'PORTICO']]) {
      const source = 'INT. PORTICO\n\nMARTA\nAspetta.\n\n' + ('===\n\n!Una foglia cade.\n\n').repeat(26) + start + '\n\n!La luce si spegne.\n\n' + ('===\n\n!Un passo.\n\n').repeat(4);
      const at = source.lastIndexOf(start) + start.length;
      await t.load(source);
      if (phone) await t.page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable:true, get:() => 420 });
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await t.caret(at);
      const before = await t.page.evaluate(phone => {
        const stage = document.querySelector('#stage'), caret = getSelection().getRangeAt(0).getBoundingClientRect();
        const bottom = Math.min(stage.getBoundingClientRect().bottom, phone ? visualViewport.height : Infinity);
        stage.scrollTop += caret.bottom - bottom + 1;
        return stage.scrollTop;
      }, phone);
      await t.page.keyboard.type(letter);
      await t.page.waitForFunction(before => document.querySelector('#stage').scrollTop > before + 1, before);
      const option = t.page.locator('#completionPopup [role=option]').filter({ hasText:expected }).first();
      await option.waitFor({ state:'visible' });
      const since = await t.page.evaluate(() => performance.now());
      await t.page.waitForFunction(since => performance.now() - since >= 1000, since);
      await t.page.evaluate(() => {
        document.querySelector('#stage').dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      });
      await option.waitFor({ state:'visible' });
      await t.page.keyboard.press('Escape');
      await option.waitFor({ state:'hidden' });
      await t.caret(source.indexOf('foglia') + 2);
      await t.caret(at + 1);
      await t.page.keyboard.press('Backspace');
      await option.waitFor({ state:'visible' });
      await t.caret(source.indexOf('foglia') + 2);
      await option.waitFor({ state:'hidden' });
      await t.caret(at);
      await option.waitFor({ state:'visible' });
      if (phone) await option.tap(); else await option.click();
      t.check((phone ? 'telefono ' : 'computer ') + expected, (await t.src()).includes(expected + '\n\n!La luce si spegne.'));
    }
    t.report();
  } finally { await t.close(); }
}
