import { open } from './lib.mjs';
const t = await open();
console.log(await t.page.evaluate(() => Object.keys(window.DraftHelpSearch || {}).concat(Object.keys(window.DraftHelp || {}))));
const ask = q => t.page.evaluate(q => { const S = window.DraftHelpSearch, M = window.ScripTotiManual; const idx = S.index(M.entries); return S.search(idx, q, 2).map(x => x.entry?.id || x.id || x.title || JSON.stringify(x).slice(0, 40)); }, q);
const api = await t.page.evaluate(() => Object.keys(window).filter(k => /help/i.test(k)));
console.log('help globals', api);
for (const q of ['come tolgo una revisione', 'come esco dal dialogo', 'come vado a capo nella battuta', 'come aggiorno', 'dove vedo il numero di pagina', 'come cambio il nome del file', 'rinominare', 'come scrivo angle on', 'su marta diventa personaggio', 'cut to non va a destra', 'come scrivo fade in', 'la parentesi non si chiude', 'montaggio']) console.log(q, '->', JSON.stringify(await ask(q)));
await t.close();
