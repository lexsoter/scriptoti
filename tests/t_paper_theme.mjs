import { open } from './lib.mjs';
for (const phone of [false, true]) {
  const t = await open(phone ? { width:390, height:844, hasTouch:true, isMobile:true } : {});
  try {
    await t.load('INT. CASA\n\n!Silenzio.');
    const palette = await t.page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      const css = getComputedStyle(document.documentElement);
      return ['bg','panel','button','hover','line','paper'].map(name => css.getPropertyValue('--' + name).trim()).join(' ');
    });
    t.check('Colori ' + (phone ? 'telefono' : 'computer'), palette === (phone ? '#e7e7e7 #f5f5f5 #eee #ddd #bdbdbd #fff' : '#d6d8db #eceef0 #e2e4e7 #d5d8dc #b8bcc1 #fbfbf9'), palette);
    await t.page.emulateMedia({ media:'print' });
    t.check('Carta bianca in stampa', await t.page.locator('.script-page').first().evaluate(p => getComputedStyle(p).backgroundColor === 'rgb(255, 255, 255)'));
    t.report();
  } finally { await t.close(); }
}
