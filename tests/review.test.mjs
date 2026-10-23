import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMatchDataset, saveAgenda, loadSavedAgenda, AGENDA_STORAGE_KEY, searchEvidence } from '../src/review.mjs';

const reference = { metricKey: 'firstKill', teamId: 'poli', matchId: 'm1', roundId: 'm1:r16' };
function storage(initial) {
  const values = new Map(initial ? [[AGENDA_STORAGE_KEY, initial]] : []);
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
}

test('loader reports missing data and accepts a valid dataset', async () => {
  await assert.rejects(loadMatchDataset(async () => ({ok:false,status:404})), /404/);
  const matches = [{ id:'m1', rounds:[], teams:[] }];
  assert.deepEqual(await loadMatchDataset(async () => ({ok:true,json:async () => matches})), matches);
  await assert.rejects(loadMatchDataset(async () => ({ok:true,json:async () => []})), /inválid|vazio/);
});

test('loader times out even when fetch never resolves', async () => {
  let signal;
  await assert.rejects(loadMatchDataset(async (url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }, {timeoutMs:5}), /demorou|tempo/);
  assert.equal(signal.aborted, true);
});

test('saved agenda stores only references and rebuilds from current data', () => {
  const store = storage();
  assert.equal(saveAgenda(store, [{...reference, observation:'old text', suggestedExercise:'old exercise'}]), true);
  assert.ok(!store.getItem(AGENDA_STORAGE_KEY).includes('old text'));
  const result = loadSavedAgenda(store, ref => ({...ref,observation:'canonical current observation'}));
  assert.equal(result.agenda[0].observation, 'canonical current observation');
  assert.equal(result.status, 'restored');
});

test('corrupt storage, unavailable storage and stale references do not crash the app', () => {
  assert.equal(loadSavedAgenda(storage('{broken'), () => null).status, 'invalid');
  const denied = {getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}};
  assert.equal(loadSavedAgenda(denied, () => null).status, 'unavailable');
  assert.equal(saveAgenda(denied, [reference]), false);
  const old = storage(JSON.stringify({version:1,items:[reference,{...reference,roundId:'missing'}]}));
  const result = loadSavedAgenda(old, ref => ref.roundId === 'missing' ? null : ref);
  assert.equal(result.agenda.length, 1);
  assert.equal(result.dropped, 1);
  assert.equal(loadSavedAgenda(storage(JSON.stringify({version:9,items:[]})), () => null).status,'invalid');
});

test('restoration deduplicates a reference but keeps opposing team perspectives', () => {
  const store = storage(JSON.stringify({version:1,items:[reference,reference,{...reference,teamId:'opponent'}]}));
  const result = loadSavedAgenda(store, ref => ref);
  assert.equal(result.agenda.length, 2);
  assert.deepEqual(result.agenda.map(a=>a.teamId),['poli','opponent']);
});

test('search matches accent-insensitive event participants and exact round numbers without changing input', () => {
  const evidence = [{roundId:'r16',matchId:'m1',won:false},{roundId:'r6',matchId:'m1',won:true}];
  const roundsById = new Map([
    ['r16',{number:16,kills:[{killerId:'p1',victimId:'p2'}]}],
    ['r6',{number:6,kills:[],plant:{planterId:'p2'}}],
  ]);
  const matchesById = new Map([['m1',{mapId:'Haven',teams:[{label:'Águias',players:[{id:'p1',name:'É o tal do MV'},{id:'p2',name:'Vks'}]}]}]]);
  const filter = query => searchEvidence(evidence,query,roundsById,matchesById);
  assert.deepEqual(filter('e o tal'),[evidence[0]]);
  assert.equal(filter('AGUIAS').length,2);
  assert.deepEqual(filter('6'),[evidence[1]]);
  assert.equal(filter('VKS').length,2);
  assert.equal(filter('inexistente').length,0);
  assert.equal(filter('  ').length,2);
  assert.equal(evidence.length,2);
});
