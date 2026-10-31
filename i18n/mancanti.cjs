// Lists the Italian interface texts of public/index.html (outside the manual
// and the bundled libraries) that have no English translation yet.
//   node i18n/mancanti.cjs            prints them
//   node i18n/mancanti.cjs <cartella> also writes them as it-*.json to translate
// Some lines are code or already English: those need no translation.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'public', 'index.html'), outDir = process.argv[2];
const known = {};
for (const f of fs.readdirSync(__dirname)) if (/^en-interfaccia.*\.json$/.test(f)) Object.assign(known, JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
const lines = fs.readFileSync(src, 'utf8').split('\n');
const firstScript = lines.findIndex(l => l.includes('<script'));
const manualStart = lines.findIndex(l => l.includes('ScripToti user manual'));
const manualEnd = lines.findIndex((l, i) => i > manualStart && l.includes("root.ScripTotiManual ="));
const found = new Map();
const code = /^(?:Enter|Escape|Tab|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Fountain|AbortError|NotAllowedError|SecurityError|TypeError|Error|Infinity|true|false|null|GET|POST|Home|End|PageUp|PageDown|Shift|Alt|Control|Meta|Mod|Cmd|Ctrl|Option|Courier|Prime|Chrome|Edge|Safari|Firefox|Mac|Windows|Linux|Android|ScripToti|ScripTotiManual|DraftEditor|UTF|JSON|PDF|FDX)$/;
const italian = /[àèéìòùÀÈÉÌÒÙ]|\b(?:il|lo|la|gli|le|di|del|della|dei|delle|non|per|con|una|uno|un|che|sono|questo|questa|nel|nella|alla|al|dal|da|ma|se|o|e|ed|ancora|già|tutto|tutte|copione|copioni|scena|scene|pagina|pagine|file|nome|personaggio|personaggi|testo|riga|righe|revisione|revisioni|condivisione|commento|commenti|versione|errore|salvato|salva|apri|chiudi|annulla|ripeti|cerca|sostituisci|vista|aiuto|modifica|modifiche|copia|incolla|elimina|nuovo|nuova|bozza|esporta|stampa|condividi|rinomina|recupero|controllo|sintassi|avviso|avvisi)\b/i;
const add = (text, where) => {
  text = text.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 2 || !/\p{L}{2}/u.test(text) || code.test(text)) return;
  if (/^[#.\[]|=>|\$\{(?!\w+\})|^[a-z][a-zA-Z]*$|^[a-z-]+$|[{}<>]|^\\|^\/|https?:|\.(?:js|json|html|fountain|pdf)$/.test(text) && !/[àèéìòù]/.test(text)) return;
  const words = text.match(/\p{L}+/gu) || [];
  if (words.length < 2 && !(where === 'html' || /^\p{Lu}\p{Ll}{2,}[.:…!?]?$/u.test(text) || /[àèéìòù]/.test(text))) return;
  if (words.length >= 2 && !italian.test(text) && !/^\p{Lu}/u.test(text) && !/[«»’]/.test(text) && where !== 'html') return;
  found.set(text, text);
};
lines.forEach((line, i) => {
  if (line.length > 20000 || (i >= manualStart && i <= manualEnd)) return;
  if (i < firstScript || /^\s*</.test(line)) {
    for (const m of line.matchAll(/(?:aria-label|title|placeholder|data-placeholder|alt|label)="([^"]+)"/g)) add(m[1], 'html');
    for (const m of line.matchAll(/>([^<>]+)</g)) add(m[1], 'html');
  }
  if (i < firstScript) return;
  for (const m of line.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    let s = m[1] ?? m[2] ?? m[3];
    if (s === undefined) continue;
    if (m[3] !== undefined) s = s.replace(/\$\{([^}]*)\}/g, (_, e) => '{' + (e.match(/[A-Za-z]+/g) || ['x']).at(-1) + '}');
    add(s.replace(/\\n/g, '\n').replace(/\\'/g, "'"), 'js');
  }
});
const entries = [...found.keys()].filter(text => !(text in known) && !/I18N|ScripTotiI18n/.test(text));
console.log(entries.join('\n'));
if (!outDir) { console.log(entries.length + ' testi senza traduzione.'); return; }
const chunks = [[]]; let size = 0;
for (const text of entries) { if (size + text.length * 2 + 8 > 22000 && chunks.at(-1).length) { chunks.push([]); size = 0; } chunks.at(-1).push(text); size += text.length * 2 + 8; }
chunks.forEach((c, i) => fs.writeFileSync(`${outDir}/it-interfaccia-${i + 1}.json`, JSON.stringify(Object.fromEntries(c.map(t => [t, t])), null, 2) + '\n'));
console.log(entries.length + ' testi in ' + chunks.length + ' file.');
