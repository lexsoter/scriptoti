# ScripToti

Editor di sceneggiature Fountain, pubblicato su https://scriptoti.salvatorefrisina.com

- `public/` — i file del sito, esattamente come vanno sul server (`public_html/scriptoti`).
- `tests/` — prove automatiche nel browser (Chrome + Playwright): `cd tests && npm install && node t1_6.mjs`.
- `.github/workflows/pubblica.yml` — il pulsante **Pubblica**: GitHub → Actions → «Pubblica su Netsons» → Run workflow.

Quando i colleghi devono vedere l'avviso di aggiornamento, cambia il numero di versione
sia in `public/index.html` (`<meta name="scriptoti-version">`) sia in `public/sw.js` (`CACHE`):
la pubblicazione si ferma se i due numeri non coincidono.

Fuori dal repository: la chiave privata delle segnalazioni (resta sul Mac) e i dati
di condivisione e segnalazioni, che sul server stanno fuori da `public_html`.
