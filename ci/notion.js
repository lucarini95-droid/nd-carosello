/**
 * Client minimo per l'API di Notion, usato dalla GitHub Action.
 * Nessuna dipendenza: Node 20+ ha fetch globale.
 */

const TOKEN = process.env.NOTION_TOKEN;
const VERSIONE = '2022-06-28';
const BASE = 'https://api.notion.com/v1';

// Coda Instagram — Digest nutrizione
const CODA_DB = 'ca55b8bd-d0c0-4666-851a-51a87b886527';

if (!TOKEN) {
  console.error('ERRORE: manca il secret NOTION_TOKEN nel repository.');
  process.exit(1);
}

async function api(metodo, percorso, corpo) {
  const r = await fetch(BASE + percorso, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSIONE,
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const testo = await r.text();
  if (!r.ok) {
    throw new Error(`Notion ${metodo} ${percorso} -> ${r.status}: ${testo.slice(0, 400)}`);
  }
  return testo ? JSON.parse(testo) : {};
}

/** Data di oggi in Europa/Roma, formato AAAA-MM-GG. */
function oggiRoma() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
}

/** Righe da pubblicare da oggi in avanti, dalla piu' vicina. */
async function righeDaCoprire(limite = 10) {
  const res = await api('POST', `/databases/${CODA_DB}/query`, {
    filter: {
      and: [
        { property: 'Stato', select: { equals: 'da pubblicare' } },
        { property: 'Data pubblicazione', date: { on_or_after: oggiRoma() } },
      ],
    },
    sorts: [{ property: 'Data pubblicazione', direction: 'ascending' }],
    page_size: limite,
  });
  return res.results || [];
}

async function blocchi(pageId) {
  const out = [];
  let cursore;
  do {
    const q = cursore ? `?start_cursor=${cursore}&page_size=100` : '?page_size=100';
    const res = await api('GET', `/blocks/${pageId}/children${q}`);
    out.push(...(res.results || []));
    cursore = res.has_more ? res.next_cursor : null;
  } while (cursore);
  return out;
}

/** Il primo blocco codice della pagina, interpretato come JSON del carosello. */
function datiDalCorpo(listaBlocchi) {
  const codice = listaBlocchi.find((b) => b.type === 'code');
  if (!codice) return null;
  const testo = (codice.code.rich_text || []).map((t) => t.plain_text).join('');
  try {
    return JSON.parse(testo);
  } catch (e) {
    throw new Error('il blocco codice della pagina non e\' JSON valido: ' + e.message);
  }
}

const haImmagini = (listaBlocchi) => listaBlocchi.some((b) => b.type === 'image');

async function aggiungiImmagini(pageId, urls) {
  await api('PATCH', `/blocks/${pageId}/children`, {
    children: urls.map((url) => ({
      object: 'block',
      type: 'image',
      image: { type: 'external', external: { url } },
    })),
  });
}

async function segnalaErrore(pageId, messaggio) {
  await api('PATCH', `/pages/${pageId}`, {
    properties: {
      Stato: { select: { name: 'errore' } },
      Nota: { rich_text: [{ type: 'text', text: { content: messaggio.slice(0, 1900) } }] },
    },
  });
}

module.exports = {
  api, oggiRoma, righeDaCoprire, blocchi,
  datiDalCorpo, haImmagini, aggiungiImmagini, segnalaErrore,
};
