// Measure real glyphs, not just the paper box: Safari's automatic text sizing
// must not keep the text full size when an iPad page is zoomed out.
import { open } from './lib.mjs';
for (const [width, height] of [[820, 1180], [1180, 820]]) {
  const t = await open({ width, height, hasTouch: true, isMobile: true });
  const source = 'Title: Uno zoom leggibile\nAuthor: Marta\n\nINT. CASA - GIORNO\n\n!Marta attraversa lentamente la stanza e guarda fuori.\n';
  await t.load(source);
  await t.page.evaluate(source => {
    const d = DraftDocument.defaults(); d.layout.titleVisible = true;
    DraftEditor.load(source, 'Zoom.fountain', d);
  }, source);
  await t.page.evaluate(() => document.fonts.ready);
  const measure = () => t.page.evaluate(() => {
    function glyphs(selector) {
      const region = document.querySelector(selector), walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT), node = walker.nextNode();
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(node.length, 30));
      return range.getBoundingClientRect().width;
    }
    return { text: glyphs('#scriptEditor .action.editable-region'), title: glyphs('.title-pages [data-title-key=title]'), paper: document.querySelector('.script-page').getBoundingClientRect().width, bar: document.querySelector('.topbar').getBoundingClientRect().height, scale: visualViewport.scale, zoom: document.querySelector('#zoomValue').value, adjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust, phone: document.documentElement.classList.contains('phone-writing') };
  });
  async function zoom(value) {
    await t.page.evaluate(value => { const slider = document.querySelector('#zoomSlider'); slider.value = value; slider.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await t.page.waitForTimeout(180);
    return measure();
  }
  const normal = await zoom(100), half = await zoom(50), double = await zoom(200), restored = await zoom(100);
  const ratio = (a, b, expected) => Math.abs(a / b - expected) < 0.03;
  t.check(width + ': tablet keeps the desktop editor and fixed text sizing', !normal.phone && normal.adjust === '100%', JSON.stringify(normal));
  t.check(width + ': at 50% real text and paper are half width', normal.text > 100 && ratio(half.text, normal.text, .5) && ratio(half.paper, normal.paper, .5) && ratio(half.title, normal.title, .5), JSON.stringify({ normal, half }));
  t.check(width + ': at 200% real text doubles, bars and viewport do not zoom', ratio(double.text, normal.text, 2) && ratio(double.title, normal.title, 2) && double.bar === normal.bar && double.scale === 1 && double.zoom === '200%', JSON.stringify(double));
  t.check(width + ': returning to 100% restores the text and preserves Fountain', Math.abs(restored.text - normal.text) < 1 && await t.src() === source);
  t.report(); await t.close();
}
