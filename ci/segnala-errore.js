/**
 * Chiamato solo se il workflow fallisce: marca "errore" le righe che non
 * possono avere le slide, cosi' Make non prova a pubblicare una riga senza slide.
 *
 * Se render.js ha lasciato ci/falliti.json, sa esattamente quali righe sono
 * cadute e marca solo quelle: le altre restano "da pubblicare" e vengono
 * riprese dal giro della notte successiva.
 * Se quel file non c'e' (il giro e' fallito prima o dopo il render, per esempio
 * su npm ci o sull'upload a Notion), nessuna riga ha le slide: si torna a
 * marcarle tutte, com'era prima.
 */

const fs = require('fs');
const N = require('./notion');

const motivo = process.argv.slice(2).join(' ') || 'render fallito';
const run = process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? ` — log: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

function leggiFalliti() {
  if (!fs.existsSync('ci/falliti.json')) return null;
  try {
    const elenco = JSON.parse(fs.readFileSync('ci/falliti.json', 'utf8'));
    if (!Array.isArray(elenco) || !elenco.length) return null;
    return elenco;
  } catch (e) {
    console.error('ci/falliti.json illeggibile, marco tutto il lotto: ' + e.message);
    return null;
  }
}

(async () => {
  if (!fs.existsSync('ci/mappa.json')) {
    console.log('Nessuna riga in lavorazione, niente da marcare.');
    return;
  }
  const mappa = JSON.parse(fs.readFileSync('ci/mappa.json', 'utf8'));
  const falliti = leggiFalliti();

  let daMarcare = mappa;
  let dettaglio = new Map();

  if (falliti) {
    const slug = new Set(falliti.map((f) => f.slug).filter(Boolean));
    dettaglio = new Map(falliti.filter((f) => f.slug).map((f) => [f.slug, f.motivo]));
    daMarcare = mappa.filter((v) => slug.has(v.slug));
    const salvate = mappa.length - daMarcare.length;
    console.log(`render.js ha indicato ${slug.size} riga/righe colpevole/i su ${mappa.length} in lavorazione.`);
    if (salvate > 0) {
      console.log(`${salvate} riga/righe restano "da pubblicare" e verranno riprese al prossimo giro:`);
      mappa.filter((v) => !slug.has(v.slug)).forEach((v) => console.log(`  - ${v.titolo}`));
    }
    // uno slug annotato ma non presente nella mappa non deve far perdere il segnale
    if (!daMarcare.length) {
      console.error('Nessuno slug di falliti.json corrisponde alla mappa: marco tutto il lotto per sicurezza.');
      daMarcare = mappa;
      dettaglio = new Map();
    }
  }

  for (const voce of daMarcare) {
    const perche = dettaglio.get(voce.slug) || motivo;
    try {
      await N.segnalaErrore(voce.pageId, `Slide non generate: ${perche}${run}`);
      console.log(`marcata "errore": ${voce.titolo}`);
    } catch (e) {
      console.error(`non sono riuscito a marcare ${voce.titolo}: ${e.message}`);
    }
  }
})();
