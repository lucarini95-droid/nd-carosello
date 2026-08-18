#!/usr/bin/env node
/**
 * ND — render delle slide del carosello Instagram.
 *
 *   node render.js dati.json ./out
 *
 * dati.json contiene un ARRAY di oggetti, uno per carosello.
 * Per ogni oggetto produce 4 JPG 1080x1350 in <out>/<data>-<slug>/slide-1..4.jpg
 *
 * Codici di uscita
 *   0  tutto ok
 *   2  campi mancanti o segnaposto non sostituiti
 *   3  un file prodotto non e' un JPEG
 *   4  testo fuori pagina anche alla dimensione minima
 *   1  errore generico
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const EXIT_OK = 0, EXIT_GENERIC = 1, EXIT_CAMPI = 2, EXIT_NONJPG = 3, EXIT_OVERFLOW = 4;

// Corpo del testo: l'auto-fit scala fra questi due valori.
// Sotto CORPO_MIN il testo diventa illeggibile sullo schermo di un telefono,
// quindi si preferisce fallire (uscita 4) e accorciare i campi.
const CORPO_MAX = 44;
const CORPO_MIN = 34;

const CAMPI_OBBLIGATORI = [
  'slug', 'data', 'titolo', 'hook', 'cosa_aggiunge',
  'head_solidita', 'solidita', 'limiti', 'cta',
];

// segnaposto che non devono mai finire in una slide
const SEGNAPOSTO = [
  /DA_COMPILARE/i, /\bTODO\b/i, /\bTBD\b/i, /lorem ipsum/i,
  /\{\{/, /\}\}/, /^\s*x+\s*$/i, /testo di prova/i,
];

const FONTS = [
  ['ND Display', 600, '@fontsource/bodoni-moda/files/bodoni-moda-latin-600-normal.woff2'],
  ['ND Text',    400, '@fontsource/poppins/files/poppins-latin-400-normal.woff2'],
  ['ND Mono',    400, '@fontsource/space-mono/files/space-mono-latin-400-normal.woff2'],
  ['ND Mono',    700, '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2'],
];

function fail(code, msg) {
  console.error('ERRORE: ' + msg);
  process.exit(code);
}

function cssFonts() {
  return FONTS.map(([family, weight, rel]) => {
    const file = path.join(__dirname, 'node_modules', rel);
    if (!fs.existsSync(file)) {
      fail(EXIT_GENERIC, 'font non trovato: ' + rel + ' — manca `npm i`?');
    }
    const b64 = fs.readFileSync(file).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
           `src:url(data:font/woff2;base64,${b64}) format('woff2');font-display:block}`;
  }).join('\n');
}

function validaItem(item, i) {
  const dove = `elemento ${i + 1}` + (item && item.slug ? ` (${item.slug})` : '');
  if (!item || typeof item !== 'object') return `${dove}: non e' un oggetto`;

  for (const campo of CAMPI_OBBLIGATORI) {
    const v = item[campo];
    if (typeof v !== 'string' || v.trim() === '') {
      return `${dove}: campo "${campo}" mancante o vuoto`;
    }
    for (const re of SEGNAPOSTO) {
      if (re.test(v)) return `${dove}: campo "${campo}" contiene un segnaposto (${re})`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.data)) {
    return `${dove}: "data" deve essere AAAA-MM-GG, trovato "${item.data}"`;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.slug)) {
    return `${dove}: "slug" deve essere minuscolo con trattini, trovato "${item.slug}"`;
  }
  return null;
}

/**
 * Il container di Claude ha Chromium gia' installato in PLAYWRIGHT_BROWSERS_PATH,
 * ma la sua build puo' non corrispondere a quella che si aspetta il playwright
 * installato da `npm i`. Se il binario atteso non c'e', si ripiega su quello
 * presente nel container invece di scaricarne un altro (rete lenta e inutile).
 */
function chromiumDiSistema() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;
  const candidati = fs.readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((d) => path.join(root, d, 'chrome-linux', 'chrome'));
  return candidati.find((p) => fs.existsSync(p)) || null;
}

async function apriBrowser() {
  try {
    return await chromium.launch();
  } catch (e) {
    const exe = chromiumDiSistema();
    if (!exe) throw e;
    console.log('  Chromium di playwright assente, uso quello del container: ' + exe);
    return await chromium.launch({ executablePath: exe });
  }
}

function isJpeg(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(3);
  fs.readSync(fd, buf, 0, 3, 0);
  fs.closeSync(fd);
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function main() {
  const [, , datiPath, outDirArg] = process.argv;
  if (!datiPath || !outDirArg) {
    fail(EXIT_GENERIC, 'uso: node render.js dati.json ./out');
  }
  if (!fs.existsSync(datiPath)) fail(EXIT_GENERIC, 'file dati non trovato: ' + datiPath);

  let dati;
  try {
    dati = JSON.parse(fs.readFileSync(datiPath, 'utf8'));
  } catch (e) {
    fail(EXIT_GENERIC, 'dati.json non e\' JSON valido: ' + e.message);
  }
  if (!Array.isArray(dati)) fail(EXIT_GENERIC, 'dati.json deve contenere un array');
  if (dati.length === 0) fail(EXIT_GENERIC, 'dati.json e\' un array vuoto');

  // 1) validazione di TUTTI gli elementi prima di renderizzarne uno solo
  const errori = dati.map(validaItem).filter(Boolean);
  if (errori.length) {
    errori.forEach((e) => console.error('  - ' + e));
    fail(EXIT_CAMPI, `${errori.length} elemento/i non renderizzabile/i. Nessun file prodotto.`);
  }

  const outDir = path.resolve(outDirArg);
  fs.mkdirSync(outDir, { recursive: true });

  const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
    .replace('<style>', '<style>\n' + cssFonts() + '\n');

  const browser = await apriBrowser();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const prodotti = [];
  const troppoLungo = [];

  for (const item of dati) {
    const cartella = path.join(outDir, `${item.data}-${item.slug}`);
    fs.mkdirSync(cartella, { recursive: true });

    for (let n = 1; n <= 4; n++) {
      const res = await page.evaluate(
        ([it, num, lim]) => window.renderSlide(it, num, lim),
        [item, n, { min: CORPO_MIN, max: CORPO_MAX }]
      );
      if (!res.ok) {
        troppoLungo.push(
          `${item.slug} slide ${n}: il testo non ci sta nemmeno al corpo minimo (${CORPO_MIN}px)`
        );
        continue;
      }
      const file = path.join(cartella, `slide-${n}.jpg`);
      await page.locator('#stage').screenshot({ path: file, type: 'jpeg', quality: 92 });
      prodotti.push(file);
      const stretta = res.fontSize <= CORPO_MIN + 4 ? '  ← al limite, valuta di accorciare' : '';
      console.log(`  ok  ${path.relative(outDir, file)}  (corpo ${res.fontSize}px)${stretta}`);
    }
  }

  await browser.close();

  if (troppoLungo.length) {
    troppoLungo.forEach((e) => console.error('  - ' + e));
    // le slide gia' scritte restano su disco ma il carosello non e' valido
    fail(EXIT_OVERFLOW, `${troppoLungo.length} slide con testo fuori pagina. Accorcia i campi.`);
  }

  const nonJpg = prodotti.filter((f) => !isJpeg(f));
  if (nonJpg.length) {
    nonJpg.forEach((f) => console.error('  - non e\' un JPEG: ' + f));
    fail(EXIT_NONJPG, 'output non JPEG. Instagram accetta solo JPEG.');
  }

  console.log(`\n${prodotti.length} slide prodotte in ${outDir}`);
  process.exit(EXIT_OK);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(EXIT_GENERIC);
});
