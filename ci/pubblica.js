/**
 * Dopo il render: carica i 4 JPG dentro Notion e li mette nel corpo della pagina,
 * in ordine di slide.
 *
 * I file vengono caricati con l'API File Upload di Notion, quindi diventano blocchi
 * immagine identici a quelli che lo scenario Make legge già oggi con
 * /v1/blocks/{id}/children: per Make non cambia nulla, e Notion tiene una copia sua.
 *
 * Se il caricamento non riesce si ripiega sull'URL pubblico del repo
 * (raw.githubusercontent.com), che resta comunque un indirizzo valido per Instagram.
 */

const fs = require('fs');
const path = require('path');
const N = require('./notion');

const REPO = process.env.GITHUB_REPOSITORY;
const RAMO = process.env.GITHUB_REF_NAME || 'main';
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

const urlSlide = (cartella, n) =>
  `https://raw.githubusercontent.com/${REPO}/${RAMO}/slides/${cartella}/slide-${n}.jpg`;

/** Carica un JPG dentro Notion e restituisce l'id del file. */
async function caricaSuNotion(file, nome) {
  const creato = await N.api('POST', '/file_uploads', {
    filename: nome,
    content_type: 'image/jpeg',
  });

  const modulo = new FormData();
  modulo.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), nome);

  const r = await fetch(creato.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
    },
    body: modulo,
  });
  if (!r.ok) {
    throw new Error(`upload ${nome} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  return creato.id;
}

/** raw.githubusercontent.com ha una cache: dopo il push può servire 404 per qualche secondo. */
async function attendiDisponibilita(url, tentativi = 10) {
  for (let i = 1; i <= tentativi; i++) {
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) return true;
    console.log(`    non ancora servito (${r.status}), riprovo… ${i}/${tentativi}`);
    await attesa(5000);
  }
  return false;
}

(async () => {
  const mappa = JSON.parse(fs.readFileSync('ci/mappa.json', 'utf8'));

  for (const voce of mappa) {
    console.log(`\n"${voce.titolo}"`);

    // se nel frattempo la pagina ha già immagini, non ne aggiungo altre
    if (N.haImmagini(await N.blocchi(voce.pageId))) {
      console.log('  aveva già le immagini, non tocco nulla');
      continue;
    }

    const figli = [];
    let viaUpload = true;

    for (let n = 1; n <= 4; n++) {
      const file = path.join('slides', voce.cartella, `slide-${n}.jpg`);
      const nome = `${voce.cartella}-slide-${n}.jpg`;
      try {
        const id = await caricaSuNotion(file, nome);
        figli.push({
          object: 'block',
          type: 'image',
          image: { type: 'file_upload', file_upload: { id } },
        });
        console.log(`  caricata slide ${n} su Notion`);
      } catch (e) {
        console.log(`  upload slide ${n} non riuscito (${e.message}) — passo agli URL del repo`);
        viaUpload = false;
        break;
      }
    }

    if (!viaUpload) {
      const urls = [1, 2, 3, 4].map((n) => urlSlide(voce.cartella, n));
      if (!(await attendiDisponibilita(urls[0]))) {
        const msg = 'Slide renderizzate ma né caricabili su Notion né servite da raw.githubusercontent.com.';
        console.error('  ' + msg);
        await N.segnalaErrore(voce.pageId, msg);
        continue;
      }
      figli.length = 0;
      figli.push(...urls.map((url) => ({
        object: 'block',
        type: 'image',
        image: { type: 'external', external: { url } },
      })));
    }

    await N.api('PATCH', `/blocks/${voce.pageId}/children`, { children: figli });
    console.log(`  4 slide nel corpo della pagina (${viaUpload ? 'file Notion' : 'URL repo'})`);
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
