// Dual dialogue stays inside the margins, also with wider custom margins,
// on screen and when printed (the PDF), and keeps all its words.
import { open } from './lib.mjs';
const t = await open();
const left = 'Una battuta piuttosto lunga da leggere. '.repeat(10).trim(), right = 'Una risposta molto lunga da leggere. '.repeat(10).trim();
const source = 'INT. CASA - GIORNO\n\n@ANNA\n' + left + '\n\n@LUCA ^\n(piano, quasi sottovoce)\n' + right + '\n';
const measure = () => t.page.evaluate(() => {
  const d = document.querySelector('.script-page .dual'), body = d.parentElement.getBoundingClientRect();
  const right = Math.max(...[...d.querySelectorAll('*')].map(n => n.getBoundingClientRect().right));
  return { overflow: Math.round(right - body.right), words: d.textContent.replace(/\s+/g, ' ').trim() };
});
for (const [name, margins] of [['standard', null], ['2in/1.5in', { top: 72, bottom: 72, left: 144, right: 108 }], ['narrowest allowed', { top: 72, bottom: 72, left: 144, right: 127 }]]) {
  await t.page.evaluate(([s, m]) => { const st = window.DraftDocument.defaults(); if (m) st.layout.margins = m; window.DraftEditor.load(s, 'QA.fountain', st); }, [source, margins]);
  await t.page.waitForTimeout(400);
  for (const media of ['screen', 'print']) {
    await t.page.emulateMedia({ media }); await t.page.waitForTimeout(150);
    const m = await measure();
    t.check(`margins ${name}, ${media}: inside the right margin`, m.overflow <= 1, JSON.stringify(m.overflow));
    const flat = text => text.replace(/\s/g, '');
    t.check(`margins ${name}, ${media}: every word kept`, flat(m.words).includes(flat(left)) && flat(m.words).includes(flat(right)), m.words.slice(0, 120));
  }
  await t.page.emulateMedia({ media: 'screen' });
}
t.report();
await t.close();
