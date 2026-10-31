// Copies the English translations (i18n/en-*.json) into public/index.html,
// between the I18N-EN markers, so the app stays a single offline file.
// Run after changing a translation:  node i18n/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = path.join(here, '..', 'public', 'index.html');
const read = name => JSON.parse(fs.readFileSync(path.join(here, name), 'utf8'));
const files = fs.readdirSync(here).filter(name => /^en-.*\.json$/.test(name)).sort();

const ui = {}, manual = {};
let sections = {};
for (const name of files) {
  const data = read(name);
  if (name.startsWith('en-interfaccia')) Object.assign(ui, data);
  else if (name.startsWith('en-manuale')) {
    const { _sections, ...entries } = data;
    if (_sections) sections = { ...sections, ..._sections };
    Object.assign(manual, entries);
  }
}
// Keys whose Italian equals the English (already English, or code) add nothing.
for (const [key, value] of Object.entries(ui)) if (key === value) delete ui[key];

const json = JSON.stringify({ ui, manual, sections }).replace(/<\/(script)/gi, '<\\/$1');
const html = fs.readFileSync(page, 'utf8');
const start = '/* I18N-EN-START */', end = '/* I18N-EN-END */';
const a = html.indexOf(start), b = html.indexOf(end);
if (a < 0 || b < a) throw new Error('I18N-EN markers not found in index.html');
const next = html.slice(0, a + start.length) + json + html.slice(b);
if (process.argv.includes('--check')) {
  if (next !== html) { console.error('index.html non contiene le traduzioni aggiornate: esegui node i18n/build.mjs'); process.exit(1); }
  console.log('Traduzioni aggiornate.');
} else {
  fs.writeFileSync(page, next);
  console.log(`Traduzioni inserite: ${Object.keys(ui).length} testi, ${Object.keys(manual).length} pagine del manuale.`);
}
