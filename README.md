# nd-carosello

Render delle slide del carosello Instagram di **Nutrition Dilemma**.

Genera 4 JPG 1080×1350 per articolo, senza Canva, dentro il container di Claude.
La procedura completa della catena sta nella pagina Notion *ND — Motore carosello Instagram*;
qui c'è solo il codice che disegna le slide.

## Uso

```bash
npm i
node render.js dati.json ./out
```

`dati.json` contiene un **array** di oggetti, uno per carosello.
L'output finisce in `out/<data>-<slug>/slide-1.jpg … slide-4.jpg`.

## Campi di ogni oggetto

| campo | obbligatorio | dove finisce |
|---|---|---|
| `slug` | sì | nome cartella (minuscolo, trattini) |
| `data` | sì | nome cartella, formato `AAAA-MM-GG` |
| `titolo` | sì | slide 1, in maiuscolo |
| `sottotitolo` | no | slide 1, sotto la riga verde |
| `hook` | sì | slide 2, l'apertura |
| `cosa_aggiunge` | sì | slide 2, corpo |
| `head_solidita` | sì | slide 3, titolo |
| `solidita` | sì | slide 3, blocco "L'evidenza" |
| `limiti` | sì | slide 3, blocco "I limiti" |
| `cta` | sì | slide 4 |
| `fonte` | no | piè di pagina slide 1 e 4 |
| `pmid` | no | piè di pagina slide 1 e 4 |
| `sito` | no | slide 4, default `nutritiondilemma.it` |
| `eyebrow` | no | intestazione, default `Nutrition Dilemma` |

## Codici di uscita

| codice | significato |
|---|---|
| `0` | tutto ok |
| `1` | errore generico |
| `2` | campi mancanti, vuoti o con segnaposto (`DA_COMPILARE`, `TODO`, `{{…}}`, …) |
| `3` | un file prodotto non è un JPEG |
| `4` | testo fuori pagina anche al corpo minimo |

**Qualsiasi valore diverso da 0 = non si crea la riga in coda.**
La validazione dei campi gira su *tutti* gli elementi prima di renderizzarne uno solo:
se un campo manca, non viene prodotto nessun file.

## Grafica

Palette e misure sono quelle della pagina Notion: sfondo `#f5eeec`, testo `#120121`,
verde `#17504b`, grigio fonte `#7a6f6c`, margine 108px su tela 1080×1350.

Font sostitutivi di quelli Canva (proprietari), tutti da npm `@fontsource` e inclusi
nel JPG come base64, quindi il render non tocca la rete:

- copertina e titoli — **Bodoni Moda**
- testo corrente — **Poppins**
- etichette e piè di pagina — **Space Mono**

Il testo si adatta da solo fra 44px e 34px di corpo. Sotto i 34px diventa illeggibile
su un telefono, quindi il render preferisce fallire con uscita `4` invece di produrre
una slide che non si legge. Se succede, si accorciano i campi, non si abbassa il minimo.

## Chromium

Nel container di Claude Chromium è già installato (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
Se la build attesa da playwright non coincide con quella presente, `render.js` ripiega
da solo su quella del container: **non serve mai `npx playwright install`**.

## Prova

```bash
npm run esempio
```

Usa `dati.esempio.json` (un paper vero dell'Archivio) e scrive 4 JPG in `./out`.
