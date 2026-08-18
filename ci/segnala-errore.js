/**
 * Chiamato solo se il workflow fallisce: marca le righe in lavorazione come
 * "errore" così Make non prova a pubblicare una riga senza slide.
 */

const fs = require('fs');
const N = require('./notion');

const motivo = process.argv.slice(2).join(' ') || 'render fallito';
const run = process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? ` — log: https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

(async () => {
  if (!fs.existsSync('ci/mappa.json')) {
    console.log('Nessuna riga in lavorazione, niente da marcare.');
    return;
  }
  const mappa = JSON.parse(fs.readFileSync('ci/mappa.json', 'utf8'));
  for (const voce of mappa) {
    try {
      await N.segnalaErrore(voce.pageId, `Slide non generate: ${motivo}${run}`);
      console.log(`marcata "errore": ${voce.titolo}`);
    } catch (e) {
      console.error(`non sono riuscito a marcare ${voce.titolo}: ${e.message}`);
    }
  }
})();
