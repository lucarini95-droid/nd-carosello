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

---

## La GitHub Action

Il render **non** gira nel container di Claude: da lì la rete in uscita è una lista
chiusa e non si può scrivere da nessuna parte. Gira qui, su GitHub, che per i
repository pubblici non ha limiti di minuti.

`.github/workflows/slide.yml` parte ogni giorno alle **03:00 UTC (05:00 in Italia)**,
tredici ore prima della pubblicazione delle 18:00, e si può lanciare a mano dalla
tab *Actions*. Fa cinque cose:

1. `ci/prepara.js` — interroga la *Coda Instagram* e prende le righe con
   *Stato* `da pubblicare` e *Data pubblicazione* da oggi in avanti. Per ognuna
   legge il **blocco codice JSON** nel corpo della pagina. Salta le righe che
   hanno già delle immagini: rilanciare il workflow non crea doppioni.
2. `render.js` — genera i 4 JPG in `slides/<data>-<slug>/`.
3. commit e push dei JPG nel repo.
4. `ci/pubblica.js` — carica i JPG dentro Notion con l'API File Upload e li mette
   nel corpo della pagina, in ordine di slide. Diventano blocchi immagine identici
   a quelli che Make legge già oggi: **lo scenario Make non va toccato.**
   Se il caricamento fallisce ripiega sugli URL `raw.githubusercontent.com`.
5. se qualcosa si rompe, `ci/segnala-errore.js` mette la riga in *Stato* `errore`
   con il link al log, così Make non pubblica una riga senza slide.

### Cosa scrive Claude il mercoledì

Claude non renderizza più niente. Per ogni giorno crea la riga in coda e mette nel
**corpo della pagina un blocco codice `json`** con i campi del carosello:

```json
{
  "slug": "glicemia-1-ora",
  "titolo": "La glicemia a 1 ora batte tutti gli altri",
  "sottotitolo": "Diagnosi di diabete tipo 2: cosa vede e cosa non vede ogni test",
  "hook": "I nostri esami per il diabete ne mancano circa la metà.",
  "cosa_aggiunge": "…",
  "head_solidita": "…",
  "solidita": "…",
  "limiti": "…",
  "cta": "…",
  "fonte": "Frontiers in Endocrinology · meta-analisi in rete",
  "pmid": "42488005"
}
```

`data` non serve scriverlo: vince sempre la *Data pubblicazione* della riga.

### L'unica cosa da configurare a mano

Un secret di repository chiamato **`NOTION_TOKEN`**
(*Settings → Secrets and variables → Actions → New repository secret*).

È il token di un'integrazione interna creata su
[notion.so/my-integrations](https://www.notion.so/my-integrations), a cui vanno
condivisi il database *Coda Instagram — Digest nutrizione* e le sue pagine.
Permessi necessari: leggere contenuti, aggiornarli, inserire contenuti.
