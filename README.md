# ScripToti

**ScripToti è un programma gratuito per scrivere sceneggiature** (film, corti, serie). Si usa dal browser, senza installare niente e senza creare un account.

👉 **Per usarlo basta aprire https://scriptoti.salvatorefrisina.com**

Scrivi il copione come testo normale e ScripToti lo impagina da solo nel formato standard del cinema: carattere Courier, margini giusti, nomi dei personaggi centrati, numeri di pagina. Quando hai finito lo esporti in PDF, pronto da mandare o da stampare.

---

## Che cos'è una sceneggiatura e perché serve un programma apposta

Una sceneggiatura non si scrive come un racconto: ha regole di impaginazione precise, le stesse in tutto il mondo. Ogni scena comincia con un'intestazione che dice dove e quando, poi viene la descrizione di ciò che si vede. Quando parla qualcuno, il suo nome va al centro in maiuscolo, con la battuta sotto. Farlo a mano in un normale programma di videoscrittura è lento e scomodo: ScripToti lo fa per te mentre scrivi.

## Un esempio

Tu scrivi questo:

```
INT. CUCINA - NOTTE

Marta apre il frigorifero. È vuoto.

MARTA
Chi ha finito il latte?

LUCA (V.O.)
Non io.
```

e ScripToti lo trasforma in una vera pagina di sceneggiatura, con ogni parte al suo posto. Non servono menu né pulsanti: capisce da solo che `INT. CUCINA - NOTTE` è l'inizio di una scena, che `MARTA` è un personaggio e che la riga sotto è quello che dice.

Il formato si chiama **Fountain**: un modo semplice e aperto di scrivere sceneggiature come testo, usato anche da altri programmi (Highland, Beat, Slugline). I tuoi copioni restano normali file `.fountain`, che puoi aprire ovunque, anche con un semplice editor di testo.

## Cosa sa fare

- **Impaginazione automatica** secondo lo standard del cinema, con il conteggio delle pagine.
- **Suggerimenti mentre scrivi**: propone i nomi dei personaggi e dei luoghi già usati, mette la maiuscola a inizio frase, trasforma `E'` in `È`.
- **Esportazione in PDF**, anche solo di alcune pagine.
- **Lavora sui tuoi file**: apri e salvi file sul tuo computer, con salvataggio automatico e recupero se qualcosa va storto.
- **Funziona anche senza internet**, dopo averlo aperto una prima volta.
- **Si installa come app** sul computer (con Chrome o Edge, dall'icona di installazione nella barra dell'indirizzo) e si apre come un programma normale.
- **Scrivere insieme**: condividi un copione con un link e lavorateci in più persone contemporaneamente, vedendo le modifiche degli altri in tempo reale.
- **Strumenti per la produzione**: revisioni a colori, blocco della numerazione di pagine e scene (1A, 2B…), copia per gli attori con le battute evidenziate.
- **Commenti, cerca e sostituisci, cambio del nome di un personaggio** in tutto il copione.
- **Controllo della sintassi**: ti avvisa quando qualcosa non verrà letto come pensavi, per esempio una scena non riconosciuta.
- **Manuale completo in italiano** dentro il programma, nel menu **Aiuto**.

## Domande frequenti

**È gratis?** Sì.

**Devo registrarmi?** No, non c'è nessun account.

**Dove finiscono i miei copioni?** Sul tuo computer, nei file che scegli tu: ScripToti non li carica su nessun server. L'unica eccezione è la condivisione per scrivere insieme. In quel caso le modifiche passano dal server solo per arrivare agli altri, e sono cifrate.

**Funziona sul telefono?** Si apre, ma è pensato per un computer con tastiera.

**Quale browser serve?** Funziona al meglio con Chrome o Edge, che permettono di salvare direttamente sui file del computer.

**Ho trovato un errore o ho un'idea.** Dal programma: **Aiuto → Segnala un problema o un suggerimento…**

---

## Per chi vuole guardare dentro

Questa parte interessa solo a chi sviluppa il programma.

- `public/` è il sito così com'è online. Tutto il programma sta in `index.html`; `sw.js` gli permette di funzionare senza internet; `sync/` contiene i piccoli script PHP per la condivisione e per le segnalazioni.
- `tests/` contiene prove automatiche che aprono il programma in Chrome e lo usano come farebbe una persona: `cd tests && npm install && node run-all.mjs` (serve anche PHP per le prove di condivisione).
- `.github/workflows/pubblica.yml` mette online una nuova versione: **Actions → Pubblica su Netsons → Run workflow**. Parte solo a mano e prima esegue tutte le prove: se una fallisce, non carica niente.

Per una versione che gli utenti devono notare, si cambia il numero sia in `public/index.html` (`<meta name="scriptoti-version">`) sia in `public/sw.js` (`CACHE`): la pubblicazione si ferma se i due numeri non coincidono.

ScripToti è software libero, distribuito con licenza **GNU GPL versione 3** (file `LICENSE`): puoi usarlo, studiarlo, modificarlo e ridistribuirlo, a patto che anche le versioni modificate restino libere con la stessa licenza. Il carattere Courier Prime è distribuito con licenza SIL Open Font License (`public/OFL.txt`).

Ideato da Salvatore Frisina.
