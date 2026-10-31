# Translating ScripToti into English

ScripToti is a free screenplay editor (Fountain format) for people who know
nothing about software. These files hold its Italian texts, one JSON object per
file. Each file gets an English twin: `it-xxx.json` becomes `en-xxx.json`.

Files to translate:

- `it-interfaccia-1.json`, `it-interfaccia-2.json`: menus, buttons, messages,
  warnings. Keys and values are both the Italian text. Translate the values
  only. Some entries are pieces of a longer sentence (for example
  `Nome salvato: «`), so translate them so that they still fit together.
  Some are already English or are code words: leave those as they are.
- `it-manuale-1.json`, `it-manuale-2.json`, `it-manuale-3.json`: the user
  manual. Each key is a page id. Translate `title`, `short`, every item of
  `body`, and, in the first file, every value of `_sections`.

## Rules

1. Translate the values only, never the keys. Return the complete JSON with
   the same keys in the same order, as one downloadable file. If it is too
   long for one answer, stop at the end of an entry and say where to go on.
2. Keep these exactly as they are:
   - anything between `[[ ]]`, which are keyboard keys, except for the names
     of keys: `[[Invio]]` becomes `[[Enter]]`, `[[Maiusc]]` becomes
     `[[Shift]]`, `[[Mod+S]]` stays;
   - text between backticks, unless it is Italian prose;
   - the markers `**`, `*`, the line starts `> `, `- ` and `## `, `\n`, and
     every `{placeholder}`.
3. Examples written in Fountain must still be valid Fountain. Turn Italian
   examples into English ones of the same shape: `INT. CUCINA - NOTTE`
   becomes `INT. KITCHEN - NIGHT`, `EST.` becomes `EXT.`, `GIORNO/NOTTE`
   becomes `DAY/NIGHT`, `STACCO SU:` becomes `CUT TO:`. Character names
   (`MARTA`) stay as they are. When a sentence explains that ScripToti also
   understands the Italian forms (EST., GIORNO, STACCO SU:, MONTAGGIO, SU),
   keep those Italian words and say so.
4. Use the standard Hollywood screenwriting terms: scene heading (slugline),
   action, character (cue), parenthetical, dialogue, extension (V.O., O.S.),
   transition, shot, title page, dual dialogue, revisions, revision colors,
   locked pages, locked scene numbers, omitted scene, A-pages, A-scenes.
5. Use these words in the interface:

   | Italian | English |
   |---|---|
   | Salva | Save |
   | Salva con nome | Save As |
   | Apri | Open |
   | Condividi | Share |
   | Esporta PDF | Export PDF |
   | Vista | View |
   | Aiuto | Help |
   | Annulla | Undo (Cancel in a dialog box) |
   | Ripeti | Redo |
   | Rinomina | Rename |
   | Recupero | Recovery |
   | Controllo della sintassi | Syntax check |
   | Registra revisioni | Track revisions |
   | copione | script |
   | bozza | draft |
   | Title page | Title page |
6. In the manual, `keys` are search keywords and `q` are example questions. Do
   not translate them word for word: write the English words and the natural
   English questions that someone would type to find that page.
7. Tone: plain and friendly, with short sentences. Speak to the reader as
   "you". No marketing language.
8. Do not add, remove, merge or reorder entries. If something is ambiguous,
   translate it anyway and list your doubts after the file.
