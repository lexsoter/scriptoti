import { open } from './lib.mjs';
for (const tablet of [false, true]) {
  const t = await open(tablet ? { width:820, height:1180, hasTouch:true, isMobile:true } : {});
  try {
    const source = 'INT. SALA\n\n!Ada posa la bussola sul tavolo.';
    const at = source.indexOf('bussola');
    await t.page.evaluate(({ source, at }) => {
      const doc = DraftDocument.defaults();
      doc.revisions.manual.push({ start:at, end:at + 7 });
      DraftEditor.load(source, 'Sala.fountain', doc);
    }, { source, at });
    await t.page.evaluate(() => document.fonts.ready);
    let normal;
    for (const zoom of [100, 50, 150, 75]) {
      const box = await t.page.evaluate(({ zoom, at }) => {
        const slider = document.querySelector('#zoomSlider'); slider.value = zoom; slider.dispatchEvent(new Event('input'));
        const range = DraftEditor.range({ anchor:at, focus:at + 7 });
        range.startContainer.parentElement.scrollIntoView({ block:'center', inline:'center' });
        return range.getBoundingClientRect().toJSON();
      }, { zoom, at });
      if (zoom === 100) normal = box.width;
      t.check('Larghezza al ' + zoom, Math.abs(box.width / normal - zoom / 100) < .03);
      if (zoom === 50 || zoom === 150) {
        await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        const pos = await t.page.evaluate(() => DraftEditor.state().selection.focus);
        t.check('Cursore nella parola al ' + zoom, pos > at && pos < at + 7, pos);
      }
      if (zoom === 75) {
        const aligned = await t.page.evaluate(at => {
          DraftEditor.annotations([{ id:'nota', start:at, end:at + 7 }]);
          const range = [...CSS.highlights.get('scriptoti-comments')][0];
          const r = range.getBoundingClientRect(), b = document.querySelector('.revision-band').getBoundingClientRect();
          return { word:range.toString(), x:r.x, y:r.y, band:b.top <= r.y + r.height / 2 && b.bottom >= r.y + r.height / 2 };
        }, at);
        t.check('Commento e revisione al 75%', aligned.word === 'bussola' && aligned.band && Math.abs(aligned.x - box.x) < 1 && Math.abs(aligned.y - box.y) < 1, JSON.stringify(aligned));
      }
    }
    t.report();
  } finally { await t.close(); }
}
