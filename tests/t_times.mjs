import { open } from './lib.mjs';
const t = await open();
try {
  for (const [heading, languages] of [
    ['INT. ATRIO', [['en', 'DAY NIGHT'], ['it', 'GIORNO NOTTE']]],
    ['EST. MOLO - NOTTE', [['en', 'GIORNO NOTTE']]],
    ['EXT. PIER - DAY', [['it', 'DAY NIGHT']]]
  ]) {
    const source = heading + '\n\nINT. SALA - ';
    await t.load(source);
    await t.caret(source.length);
    for (const [lang, expected] of languages) {
      await t.page.evaluate(lang => {
        const field = document.querySelector('#spellLanguage');
        field.value = lang; field.dispatchEvent(new Event('change'));
      }, lang);
      await t.caret(source.length);
      await t.page.evaluate(() => DraftCompletionUI.refresh());
      const labels = await t.page.locator('#completionPopup:visible [role=option] span').allTextContents();
      t.check(heading + ' / ' + lang, labels.slice(0, 2).join(' ') === expected, labels.join(' '));
    }
  }
  t.report();
} finally { await t.close(); }
