// Long synthetic documents only. Measure input-to-frame latency, then compare
// the settled renderer with a full reload of the same source and metadata.
import { open } from './lib.mjs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const script = Array.from({ length: 116 }, (_, i) => [
  `INT. LABORATORIO ${String(i + 1).padStart(3, '0')} - GIORNO`,
  '!Elena attraversa il laboratorio. Controlla gli strumenti sul tavolo, poi guarda la porta e aspetta il segnale di Lia. Il corridoio è silenzioso.',
  'GIULIO\n(guardando Lia)\nAbbiamo ancora qualche minuto. Prima controlliamo tutti i fogli, poi possiamo cominciare senza interrompere nessuno.',
  '!Lia sposta una sedia accanto alla finestra. Un riflesso percorre il vetro e scompare dietro la tenda. Elena prende nota di ogni cambiamento.',
  'LIA\nIl numero è quello giusto. Aspettiamo che arrivino anche gli altri e confrontiamo con calma quello che abbiamo trovato.',
  `!Riga di misurazione ${i}. Elena sistema le pagine sul tavolo e continua a osservare la stanza, senza cambiare la posizione degli strumenti.`,
  'GIULIO\n(a bassa voce)\nQui tutto rimane al suo posto. La prossima volta ripartiremo da questa pagina, e ci ricorderemo esattamente dove fermarci.',
  '!Il rumore si allontana. Lia chiude il quaderno e lo lascia vicino alla lampada; nessuno si muove finché la luce non torna stabile.',
  '>STACCO SU:', '==='
].join('\n\n')).join('\n\n') + '\n';
const metrics = [];
for (const phone of [false, true]) for (const tracking of [false, true]) {
  const t = await open(phone ? { width: 390, height: 844, hasTouch: true, isMobile: true } : { width: 1280, height: 900 });
  t.page.setDefaultTimeout(30000);
  await t.page.evaluate(({ script, tracking }) => {
    let value = DraftDocument.defaults();
    value.revisions.ranges = [script.indexOf('Elena'), script.indexOf('Riga di misurazione 20')].map(start => ({ start, end: start + 5 }));
    value.revisions.manual = [{ start: script.indexOf('Riga di misurazione 30'), end: script.indexOf('Riga di misurazione 30') + 20 }];
    if (tracking) {
      value = DraftProduction.lock(script, value);
      const p = value.locks.pages[11]; p.label = '12A'; p.base = '12'; p.serial = 1;
      value.locks.scenes[11].label = '12A'; value.locks.scenes[11].base = '12'; value.locks.scenes[11].serial = 1;
    }
    value.revisions.tracking = tracking;
    DraftEditor.load(script, 'Prova velocità.fountain', value);
  }, { script, tracking });
  await t.page.evaluate(() => document.fonts.ready);
  await t.page.waitForFunction(() => document.querySelectorAll('#scriptEditor .script-page').length >= 110 && !DraftEditor.pending);
  const at = script.indexOf('Elena sistema', script.indexOf('Riga di misurazione 58')) + 'Elena '.length;
  await t.caret(at);
  await t.page.evaluate(() => {
    const node = getSelection().focusNode; (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center' });
  });
  const result = await t.page.evaluate(async ({ phone, tracking }) => {
    const editor = document.querySelector(phone ? '#phoneWriter' : '#scriptEditor'), times = [];
    let visible = true, typed = '';
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      const start = performance.now();
      editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: letter }));
      const node = getSelection().focusNode, region = (node.nodeType === 3 ? node.parentElement : node).closest('.editable-region');
      typed += letter; visible &&= region.textContent.replace(/\n/g, '').includes('Elena ' + typed + 'sistema');
      await new Promise(requestAnimationFrame);
      await new Promise(done => setTimeout(done, 0));
      times.push(performance.now() - start);
    }
    const samples = times.slice(6).sort((a, b) => a - b);
    return { phone, tracking, median: (samples[9] + samples[10]) / 2, max: Math.max(...samples), visible, samples, pages: document.querySelectorAll('#scriptEditor .script-page').length };
  }, { phone, tracking });
  metrics.push(result); console.log('SPEED ' + JSON.stringify(result));
  const name = (phone ? 'phone' : 'desktop') + (tracking ? ' revisions on' : ' revisions off');
  t.check(name + ': at least 110 pages', result.pages >= 110);
  t.check(name + ': each letter reaches the visible editor before the next frame', result.visible);
  t.check(name + ': median input-to-frame latency below 80 ms', result.median < 80, result.median.toFixed(1) + ' ms');
  await t.page.waitForFunction(() => !DraftEditor.pending);
  const snap = () => t.page.evaluate(() => ({
    state: DraftEditor.state(),
    pages: [...document.querySelectorAll('#scriptEditor .script-page')].map(p => ({ label: p.dataset.pageLabel, text: p.querySelector('.paper-body').innerText, bands: [...p.querySelectorAll('.page-band,.actor-band')].map(b => b.style.cssText) })),
    context: DraftEditor.context()
  }));
  const settled = await snap();
  result.fingerprint = createHash('sha256').update(JSON.stringify({ source: settled.state.source, document: settled.state.document, pages: settled.pages, context: settled.context })).digest('hex');
  if (process.env.SPEED_COMPARE) {
    const previous = JSON.parse(fs.readFileSync(process.env.SPEED_COMPARE, 'utf8')).find(r => r.phone === phone && r.tracking === tracking);
    t.check(name + ': final result matches the original version', previous?.fingerprint === result.fingerprint, result.fingerprint);
  }
  await t.page.evaluate(state => { DraftEditor.load(state.source, state.name, state.document); DraftEditor.selectAbsolute(state.selection); }, settled.state);
  await t.page.waitForFunction(() => !DraftEditor.pending);
  const reloaded = await snap();
  t.check(name + ': settled text, metadata, pages and labels match a full reload', settled.state.source === reloaded.state.source && JSON.stringify(settled.state.document) === JSON.stringify(reloaded.state.document) && JSON.stringify(settled.pages) === JSON.stringify(reloaded.pages) && JSON.stringify(settled.context) === JSON.stringify(reloaded.context));
  // Mixed fast edits, structural edits and history must settle to the same pages.
  await t.page.evaluate(({ phone }) => {
    const host = document.querySelector(phone ? '#phoneWriter' : '#scriptEditor');
    const put = (type, data = null) => host.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: type, data }));
    const at = (needle, offset = 0) => { const s = DraftEditor.state().source, p = s.indexOf(needle, s.indexOf('LABORATORIO 059')); if (p < 0) throw new Error('Missing fixture: ' + needle); DraftEditor.selectAbsolute({ anchor: p + offset, focus: p + offset }); };
    at('Elena sistema', 6); put('insertText', 'veloce '); put('deleteContentBackward');
    at('Il numero è quello giusto.', 3); put('insertText', 'è 👩🏽‍💻 '); put('deleteContentBackward'); put('insertText', '*corsivo* ');
    at('Il rumore si allontana.', 3); put('deleteContentForward'); put('insertText', 'test ');
    at('che abbiamo trovato.', 'che abbiamo trovato.'.length); put('insertParagraph'); put('insertText', 'Un gesto rapido.');
  }, { phone });
  await t.page.waitForFunction(() => !DraftEditor.pending);
  const mixed = await snap();
  await t.page.evaluate(state => { DraftEditor.load(state.source, state.name, state.document); DraftEditor.selectAbsolute(state.selection); }, mixed.state);
  await t.page.waitForFunction(() => !DraftEditor.pending);
  const full = await snap();
  t.check(name + ': mixed edits settle to the full renderer, including revision bands', JSON.stringify(mixed.pages) === JSON.stringify(full.pages) && JSON.stringify(mixed.context) === JSON.stringify(full.context) && JSON.stringify(mixed.state.document) === JSON.stringify(full.state.document));
  const history = await t.page.evaluate(({ phone }) => {
    DraftEditor.capture();
    const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO 060')) + 6;
    DraftEditor.selectAbsolute({ anchor: at, focus: at });
    document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'XYZ' }));
    const pending = DraftEditor.pending, changed = DraftEditor.state().source;
    document.querySelector('#undoBtn').click(); const undone = DraftEditor.state().source;
    document.querySelector('#redoBtn').click();
    return { pending, ok: undone === source && DraftEditor.state().source === changed };
  }, { phone });
  t.check(name + ': Undo during a pending layout and Redo preserve the exact text', history.pending && history.ok, JSON.stringify(history));
  await t.page.evaluate(async () => {
    const s = DraftEditor.state(), root = await navigator.storage.getDirectory(), handle = await root.getFileHandle('speed.fountain', { create: true });
    const writer = await handle.createWritable(); await writer.write(new DraftComments.Store(s.source, [], s.document).serialize()); await writer.close();
    await DraftSafe.openHandle(handle);
  });
  const saving = await t.page.evaluate(async ({ phone }) => {
    const s = DraftEditor.state(), at = s.source.indexOf('Elena sistema', s.source.indexOf('LABORATORIO 061')) + 6;
    DraftEditor.selectAbsolute({ anchor: at, focus: at });
    document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'RECUPERO ' }));
    const source = DraftEditor.state().source, pending = DraftEditor.pending;
    const record = JSON.parse(localStorage.getItem('draft-safe-emergency-' + DraftSafe.activeId));
    const recovered = DraftComments.unpack(record.source).source === source;
    const saved = await DraftSafe.saveLocal(true), state = DraftEditor.state();
    const disk = DraftComments.unpack(await (await DraftSafe.disk.handle.getFile()).text());
    await DraftSafe.persistAll();
    return { pending, recovered, saved, source, document: state.document, disk: disk.source === source && JSON.stringify(disk.document) === JSON.stringify(state.document) };
  }, { phone });
  t.check(name + ': emergency recovery includes the letter before deferred layout', saving.pending && saving.recovered);
  t.check(name + ': Save during pending layout writes the complete text and references', saving.saved && saving.disk, JSON.stringify({ saved: saving.saved, disk: saving.disk }));
  await t.page.reload();
  await t.page.waitForFunction(source => window.DraftSafe?.disk && DraftEditor.state().source === source && !DraftEditor.pending, saving.source);
  t.check(name + ': reopening the saved file keeps every edit and revision', JSON.stringify((await t.page.evaluate(() => DraftEditor.state())).document) === JSON.stringify(saving.document));
  const interrupted = await t.page.evaluate(({ phone }) => {
    const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO 062')) + 6;
    DraftEditor.selectAbsolute({ anchor: at, focus: at });
    document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'PRIMA DEL RICARICO ' }));
    return { source: DraftEditor.state().source, pending: DraftEditor.pending };
  }, { phone });
  await t.page.reload();
  await t.page.waitForFunction(source => window.DraftSafe?.disk && DraftEditor.state().source === source && !DraftEditor.pending, interrupted.source);
  t.check(name + ': reload before the layout timer recovers the unsaved letter', interrupted.pending && await t.src() === interrupted.source);
  await t.page.waitForFunction(() => !document.querySelector('#openBtn').disabled && DraftSafe.disk?.phase === 'ready' && DraftSafe.disk.baseline.source === DraftSafe.session.source);
  const switched = await t.page.evaluate(async ({ phone }) => {
    const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO 063')) + 6;
    DraftEditor.selectAbsolute({ anchor: at, focus: at });
    document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'CAMBIO SCHEDA ' }));
    const pending = DraftEditor.pending, expected = DraftEditor.state().source, owner = DraftSafe.activeId;
    const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle('other.fountain', { create: true });
    const writer = await handle.createWritable(); await writer.write('!Altro documento.\n'); await writer.close();
    await DraftSafe.openHandle(handle);
    const other = DraftEditor.state().source;
    await DraftSafe.switchProject(owner);
    const raw = DraftComments.unpack(await (await DraftSafe.disk.handle.getFile()).text());
    return { pending, other: other === '!Altro documento.\n', source: DraftEditor.state().source === expected, disk: raw.source === expected, labels: DraftEditor.context().pages.map(p => p.label) };
  }, { phone });
  t.check(name + ': switching documents flushes the right file and keeps the other intact', switched.pending && switched.other && switched.source && switched.disk && (!tracking || switched.labels.includes('12A')), JSON.stringify(switched));
  const fallback = await t.page.evaluate(({ phone }) => {
    const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO 064')) + 6;
    DraftEditor.selectAbsolute({ anchor: at, focus: at });
    const write = Storage.prototype.setItem, queue = DraftSafe.session.recoveryQueue;
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('draft-safe-emergency-')) throw new DOMException('Full', 'QuotaExceededError'); return write.call(this, key, value); };
    try {
      document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'RECUPERO ALTERNATIVO ' }));
      return DraftSafe.session.recoveryQueue !== queue;
    } finally { Storage.prototype.setItem = write; }
  }, { phone });
  await t.page.waitForFunction(() => !DraftEditor.pending && DraftSafe.session.recoveredSource === DraftSafe.session.source);
  t.check(name + ': unavailable emergency storage starts IndexedDB recovery immediately', fallback);
  if (tracking) {
    const original = await t.page.evaluate(() => DraftEditor.context().pages.map(p => p.label));
    await t.page.evaluate(({ phone }) => {
      const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO 065')) + 6;
      DraftEditor.selectAbsolute({ anchor: at, focus: at });
      document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Una modifica ampia da controllare. '.repeat(42) }));
    }, { phone });
    await t.page.waitForFunction(() => !DraftEditor.pending);
    const overflow = await snap(), labels = overflow.context.pages.map(p => p.label);
    t.check(name + ': overflow adds pages while preserving all original labels', labels.length > original.length && JSON.stringify(labels.filter(p => original.includes(p))) === JSON.stringify(original), labels.filter(p => !original.includes(p)).join(','));
    await t.page.evaluate(state => { DraftEditor.load(state.source, state.name, state.document); DraftEditor.selectAbsolute(state.selection); }, overflow.state);
    await t.page.waitForFunction(() => !DraftEditor.pending);
    const rebuilt = await snap();
    t.check(name + ': overflow pages, scene numbers and revision bands match a full reload', JSON.stringify(overflow.pages) === JSON.stringify(rebuilt.pages) && JSON.stringify(overflow.context) === JSON.stringify(rebuilt.context) && JSON.stringify(overflow.state.document) === JSON.stringify(rebuilt.state.document));
    const references = await t.page.evaluate(({ phone }) => {
      const put = (scene, text) => {
        const source = DraftEditor.state().source, at = source.indexOf('Elena sistema', source.indexOf('LABORATORIO ' + scene)) + 6;
        DraftEditor.selectAbsolute({ anchor: at, focus: at });
        document.querySelector(phone ? '#phoneWriter' : '#scriptEditor').dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      };
      const canonical = s => JSON.stringify(s.document) === JSON.stringify(DraftProduction.reconcile(s.source, s.document, s.empty));
      put('070', 'Una modifica lunga da controllare. '.repeat(140)); const first = DraftEditor.state().source;
      put('071', 'seconda '); const both = DraftEditor.state().source;
      document.querySelector('#undoBtn').click(); const undone = DraftEditor.state(), undo = undone.source === first && canonical(undone);
      document.querySelector('#redoBtn').click(); const redone = DraftEditor.state();
      return { undo, redo: redone.source === both && canonical(redone) };
    }, { phone });
    t.check(name + ': Undo between rapid edits keeps complete overflow references', references.undo);
    t.check(name + ': Redo keeps the exact text and complete overflow references', references.redo);
  }
  // The parse shortcut must keep heading normalisation behind hidden Fountain.
  for (const prefix of ['  ', '[[nota]]', '/*nota*/', '/*nota\n*/', '[[nota\ncontinua]]']) {
    await t.load(prefix + 'int\n\n!Fine.\n'); await t.caret(prefix.length + 3); await t.type('.');
    const state = await t.page.evaluate(() => DraftEditor.state());
    t.check(name + ': heading normalisation keeps prefix ' + JSON.stringify(prefix), state.source === prefix + 'INT.\n\n!Fine.\n' && state.selection.kind === 'scene', JSON.stringify(state.source));
  }
  t.report(); await t.close();
}
if (process.env.SPEED_OUTPUT) fs.writeFileSync(process.env.SPEED_OUTPUT, JSON.stringify(metrics, null, 2) + '\n');
