/**
 * Legge la Coda Instagram e scrive dati.json con i caroselli ancora senza slide.
 * Stampa su GITHUB_OUTPUT `da_fare=1` se c'e' lavoro, `da_fare=0` altrimenti.
 */

const fs = require('fs');
const N = require('./notion');

const CAMPI = [
  'slug', 'data', 'titolo', 'hook', 'cosa_aggiunge',
  'head_solidita', 'solidita', 'limiti', 'cta',
];

function esito(chiave, valore) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${chiave}=${valore}\n`);
  }
}

(async () => {
  // residuo di un giro precedente: va rimosso, altrimenti segnala-errore.js
  // marcherebbe righe che con questo giro non c'entrano nulla
  try { fs.unlinkSync('ci/falliti.json'); } catch (e) { /* non c'era */ }

  const righe = await N.righeDaCoprire(10);
  console.log(`Righe "da pubblicare" da oggi (${N.oggiRoma()}) in avanti: ${righe.length}`);

  const dati = [];
  const mappa = [];   // slug -> pageId, serve al passo di pubblicazione

  for (const riga of righe) {
    const titolo = (riga.properties?.Titolo?.title || []).map((t) => t.plain_text).join('') || riga.id;
    let blocchi;
    try {
      blocchi = await N.blocchi(riga.id);
    } catch (e) {
      console.log(`  salto "${titolo}": ${e.message}`);
      continue;
    }

    if (N.haImmagini(blocchi)) {
      console.log(`  gia' fatta  "${titolo}"`);
      continue;
    }

    let d;
    try {
      d = N.datiDalCorpo(blocchi);
    } catch (e) {
      console.log(`  PROBLEMA  "${titolo}": ${e.message}`);
      await N.segnalaErrore(riga.id, 'Slide non generate: ' + e.message);
      continue;
    }
    if (!d) {
      console.log(`  salto "${titolo}": nessun blocco codice con i campi del carosello`);
      continue;
    }

    // la data della riga vince su quella scritta nel JSON
    const dataRiga = riga.properties?.['Data pubblicazione']?.date?.start;
    if (dataRiga) d.data = String(dataRiga).slice(0, 10);

    const mancanti = CAMPI.filter((c) => typeof d[c] !== 'string' || !d[c].trim());
    if (mancanti.length) {
      console.log(`  PROBLEMA  "${titolo}": campi mancanti ${mancanti.join(', ')}`);
      await N.segnalaErrore(riga.id, 'Slide non generate, campi mancanti: ' + mancanti.join(', '));
      continue;
    }

    dati.push(d);
    mappa.push({ pageId: riga.id, slug: d.slug, cartella: `${d.data}-${d.slug}`, titolo });
    console.log(`  da fare  "${titolo}" -> ${d.data}-${d.slug}`);
  }

  if (!dati.length) {
    console.log('Niente da renderizzare.');
    esito('da_fare', 0);
    return;
  }

  fs.writeFileSync('dati.json', JSON.stringify(dati, null, 2));
  fs.writeFileSync('ci/mappa.json', JSON.stringify(mappa, null, 2));
  console.log(`\n${dati.length} carosello/i da renderizzare.`);
  esito('da_fare', 1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
