// First heading references use the real page and scene labels.
import { open } from './lib.mjs';
const source = [
  'INT. ATRIO - GIORNO\n\n!Una porta chiusa.',
  '===\n\n!Il corridoio è vuoto.',
  '===\n\nINT. CASA - CUCINA - GIORNO\n\n!La luce entra dalla finestra.',
  '===\n\nINT. CASA - CUCINA - NOTTE\n\n!Una lampada accesa.',
  'INT. CASA - CUCINA - TAVOLO - NOTTE\n\n!Un foglio sul tavolo.',
  'INT. CASA - BAGNO - SPECCHIO - NOTTE\n\n!Una goccia sul vetro.',
  '===\n\nINT. STUDIO - GIORNO\n\n!Tutto tace.\n\nINT. CA'
].join('\n\n');
for (const phone of [false, true]) {
  const t = await open(phone ? { width: 390, height: 844, hasTouch: true, isMobile: true } : {});
  const label = phone ? 'phone' : 'desktop';
  async function load(text = source) {
    await t.load(text);
    if (phone) await t.page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 420 });
      visualViewport.dispatchEvent(new Event('resize'));
    });
  }
  async function query(text, wanted, first = false) {
    const raw = await t.src(), at = (first ? raw.indexOf(text) : raw.lastIndexOf(text)) + text.length;
    await t.caret(at);
    if (phone) await t.page.waitForSelector('#phoneKeyboard:not([hidden])');
    await t.page.evaluate(() => DraftCompletionUI.refresh());
    await t.page.waitForFunction(({ at, wanted }) => DraftEditor.state().selection.focus === at && !document.querySelector('#completionPopup').hidden && [...document.querySelectorAll('#completionPopup [role=option]')].some(b => b.querySelector('span')?.textContent === wanted), { at, wanted });
    return t.page.evaluate(wanted => {
      const b = [...document.querySelectorAll('#completionPopup [role=option]')].find(b => b.querySelector('span')?.textContent === wanted);
      return { note: b.querySelector('small')?.textContent || '', dock: !!b.closest('#phoneSuggestions') };
    }, wanted);
  }
  await load();
  let item = await query('INT. CA', 'CASA');
  t.check(label + ': first location heading is page 3 scene 2, despite a later repeat', item.note === 'pag. 3 scena 2', JSON.stringify(item));
  if (phone) t.check('phone: location and reference appear in the keyboard strip', item.dock);
  await load(source.replace(/INT\. CA$/, 'INT. CASA - CU'));
  item = await query('INT. CASA - CU', 'CUCINA');
  t.check(label + ': sublocation uses the first complete combination', item.note === 'pag. 3 scena 2', JSON.stringify(item));
  await load(source.replace(/INT\. CA$/, 'INT. CASA - CUCINA - TA'));
  item = await query('INT. CASA - CUCINA - TA', 'TAVOLO');
  t.check(label + ': nested sublocation refers to its own first scene', item.note === 'pag. 4 scena 4', JSON.stringify(item));
  await load(source.replace(/INT\. CA$/, 'INT. CASA - CUCINA - SP'));
  await t.caret((await t.src()).length); await t.page.evaluate(() => DraftCompletionUI.refresh());
  t.check(label + ': a different branch of the location is not suggested', await t.page.evaluate(() => ![...document.querySelectorAll('#completionPopup [role=option] span')].some(n => n.textContent === 'SPECCHIO')));
  await load(source.replace('INT. ATRIO - GIORNO', 'INT. CA').replace(/\n\nINT\. CA$/, ''));
  item = await query('INT. CA', 'CASA', true);
  t.check(label + ': first mention later in the document has a future hint', item.note === 'Compare più avanti a pag. 3 scena 2', JSON.stringify(item));
  await load();
  await t.page.evaluate(() => {
    const s = DraftEditor.state(), d = DraftProduction.lock(s.source, s.document);
    Object.assign(d.locks.pages[2], { label: '12A', base: '12', serial: 1 });
    Object.assign(d.locks.scenes[1], { label: '12A', base: '12', serial: 1 });
    DraftEditor.load(s.source, 'Luoghi.fountain', d);
  });
  item = await query('INT. CA', 'CASA');
  t.check(label + ': location references use locked page and scene 12A', item.note === 'pag. 12A scena 12A', JSON.stringify(item));
  await load();
  await t.page.evaluate(() => {
    const s = DraftEditor.state(); DraftEditor.replaceText(0, 0, 'INT. PARCO - NOTTE\n\n!Il vento soffia.\n\n===\n\n', s.source, s.document);
  });
  item = await query('INT. CA', 'CASA');
  t.check(label + ': editing before the first mention updates its page and scene', item.note === 'pag. 4 scena 3', JSON.stringify(item));
  await load('INT. UNICO - GIORNO\n\n!Silenzio.\n'); await t.caretAfter('INT. UNI');
  const own = await t.page.evaluate(() => {
    const s = DraftEditor.state(), d = DraftEngine.parse(s.source, { editing: true, caret: s.selection.focus });
    const part = DraftEditing.locate(d, s.selection.focus), c = DraftCompletions.catalogue(d, s.source, part);
    DraftCompletionUI.refresh();
    return { found: c.locations.some(p => p.name === 'UNICO'), visible: !document.querySelector('#completionPopup').hidden };
  });
  t.check(label + ': a location declared only in the current heading is excluded', !own.found && !own.visible, JSON.stringify(own));
  await load(source.replace(/INT\. CA$/, 'INT. CASA - NO'));
  item = await query('INT. CASA - NO', 'NOTTE');
  t.check(label + ': time suggestions have no page or scene hint', item.note === '', JSON.stringify(item));
  t.report(); await t.close();
}
