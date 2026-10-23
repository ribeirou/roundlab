export const AGENDA_STORAGE_KEY = 'roundlab.agenda.v1';
const MAX_ITEMS = 1000;

export async function loadMatchDataset(fetchImpl = globalThis.fetch, {timeoutMs = 15000} = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('O carregamento demorou mais que o esperado. Tente novamente.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl('./data/matches.json', {signal:controller.signal,cache:'no-store'});
        if (!response.ok) throw new Error(`Dados indisponíveis (HTTP ${response.status}).`);
        const data = await response.json();
        if (!Array.isArray(data) || !data.length || data.some(m => !m || !m.id || !Array.isArray(m.rounds) || !Array.isArray(m.teams))) {
          throw new Error('Conjunto de partidas vazio ou inválido.');
        }
        return data;
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isReference(item) {
  return item && ['firstKill','postPlant'].includes(item.metricKey) &&
    ['teamId','matchId','roundId'].every(k => typeof item[k] === 'string' && item[k].length > 0 && item[k].length < 256);
}

// Store references, never stale observations. The UI rebuilds from the loaded corpus.
export function saveAgenda(storage, agenda) {
  try {
    if (!Array.isArray(agenda) || agenda.length > MAX_ITEMS) return false;
    const items = agenda.map(({metricKey,teamId,matchId,roundId}) => ({metricKey,teamId,matchId,roundId}));
    if (!items.every(isReference)) return false;
    storage.setItem(AGENDA_STORAGE_KEY, JSON.stringify({version:1,items}));
    return true;
  } catch { return false; }
}

export function loadSavedAgenda(storage, resolveReference) {
  let raw;
  try { raw = storage.getItem(AGENDA_STORAGE_KEY); }
  catch { return {agenda:[],status:'unavailable',dropped:0}; }
  if (raw === null) return {agenda:[],status:'empty',dropped:0};
  let saved;
  try {
    if (typeof raw !== 'string' || raw.length > 1000000) throw new Error('size');
    saved = JSON.parse(raw);
    if (saved?.version !== 1 || !Array.isArray(saved.items) || saved.items.length > MAX_ITEMS) throw new Error('schema');
  } catch { return {agenda:[],status:'invalid',dropped:0}; }
  const agenda = [], seen = new Set();
  let dropped = 0;
  for (const ref of saved.items) {
    if (!isReference(ref)) { dropped++; continue; }
    const key = JSON.stringify([ref.teamId,ref.metricKey,ref.roundId]);
    if (seen.has(key)) continue;
    let item;
    try { item = resolveReference(ref); } catch { item = null; }
    if (!item) { dropped++; continue; }
    seen.add(key);
    agenda.push(item);
  }
  return {agenda,status:'restored',dropped};
}

function normalizeSearch(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
}

export function searchEvidence(evidence, query, roundsById, matchesById) {
  const term = normalizeSearch(query);
  if (!term) return [...evidence];
  return evidence.filter(ev => {
    const round = roundsById.get(ev.roundId), match = matchesById.get(ev.matchId);
    if (!round || !match) return false;
    if (/^\d+$/.test(term)) return round.number === Number(term);
    const participants = new Set((round.kills || []).flatMap(k => [k.killerId,k.victimId]));
    if (round.plant?.planterId) participants.add(round.plant.planterId);
    const names = (match.teams || []).flatMap(t => (t.players || []).filter(p => participants.has(p.id)).map(p => p.name));
    const text = [match.mapId,...(match.teams || []).map(t=>t.label),...names,`round ${round.number}`].join(' ');
    return normalizeSearch(text).includes(term);
  });
}
