import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEvidence,
  removeEvidence,
  formatAgenda,
  createAgendaItem,
} from '../src/agenda.mjs';

function makeSampleItem(overrides = {}) {
  return {
    metricKey: overrides.metricKey ?? 'firstKill',
    teamLabel: overrides.teamLabel ?? 'Poli Plague',
    matchId: overrides.matchId ?? 'fc187928-9b72-42b3-aaaf-8ca6689a3937',
    roundId: overrides.roundId ?? 'fc187928-9b72-42b3-aaaf-8ca6689a3937:r16',
    roundNumber: overrides.roundNumber ?? 16,
    observation:
      overrides.observation ??
      'Na partida fc187928-9b72-42b3-aaaf-8ca6689a3937 (Haven, C1), Round 16: Poli Plague conquistou a 1ª eliminação aos 23,2s (Vks#bru eliminou makola#deft), mas o round terminou com vitória de Unicamp Tritons Red.',
    reviewQuestion:
      overrides.reviewQuestion ??
      'Como a equipe reorganizou posicionamento e comunicação imediatamente após abrir vantagem numérica (5v4)?',
    suggestedExercise:
      overrides.suggestedExercise ??
      'Simulação 5v4 pós-primeira eliminação focando em congelar avanço isolado e estabelecer linhas cruzadas.',
  };
}

test('doesNotDuplicateEvidence', () => {
  const item1 = makeSampleItem();
  const item1Duplicate = makeSampleItem({
    observation: 'Texto atualizado para o mesmo round e métrica',
  });
  const sameRoundDifferentMetric = makeSampleItem({
    metricKey: 'postPlant',
  });

  let agenda = [];
  agenda = addEvidence(agenda, item1);
  assert.equal(agenda.length, 1);

  // Adicionar mesma métrica + mesmo roundId não deve duplicar entrada
  agenda = addEvidence(agenda, item1Duplicate);
  assert.equal(agenda.length, 1, 'Mesma métrica e mesmo roundId deve manter apenas uma entrada');

  // Mesma partida/round mas métrica distinta é permitida
  agenda = addEvidence(agenda, sameRoundDifferentMetric);
  assert.equal(agenda.length, 2);

  // Remoção por metricKey e roundId
  agenda = removeEvidence(agenda, 'firstKill', item1.roundId);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].metricKey, 'postPlant');
});

test('preservesSourceReferences', () => {
  const item1 = makeSampleItem();
  const item2 = makeSampleItem({
    metricKey: 'postPlant',
    roundId: 'fc187928-9b72-42b3-aaaf-8ca6689a3937:r3',
    roundNumber: 3,
  });

  const formatted = formatAgenda([item1, item2]);
  assert.ok(
    formatted.includes('fc187928-9b72-42b3-aaaf-8ca6689a3937'),
    'Texto exportado deve conter referência explícita ao matchId da partida'
  );
  assert.ok(
    formatted.includes('fc187928-9b72-42b3-aaaf-8ca6689a3937:r16') ||
      formatted.includes('Round 16'),
    'Texto exportado deve identificar o round de evidência'
  );
  assert.ok(formatted.includes('Poli Plague'), 'Texto exportado deve identificar a equipe');
});

test('labelsExerciseAsHypothesis', () => {
  const generated = createAgendaItem({
    metricKey: 'firstKill',
    teamLabel: 'Poli Plague',
    matchId: 'fc187928-9b72-42b3-aaaf-8ca6689a3937',
    roundId: 'fc187928-9b72-42b3-aaaf-8ca6689a3937:r16',
    roundNumber: 16,
    won: false,
    mapId: 'Haven',
    qualifier: 'c1',
    file: 'UNIVAVA_C1_002_27-06-26_poli_plague_10_x_13_unicamp_tritons_red_haven.json',
    roleLabel: 'Defensor',
    eventSummary: '1ª eliminação aos 23,2s por Vks#bru sobre makola#deft',
  });

  const formatted = formatAgenda([generated]);

  assert.ok(
    formatted.toLowerCase().includes('observação') ||
      formatted.toLowerCase().includes('observacao'),
    'Deve rotular explicitamente a observação sustentada pelos dados'
  );
  assert.ok(
    formatted.toLowerCase().includes('hipótese') ||
      formatted.toLowerCase().includes('hipotese'),
    'Sugestão de exercício deve ser rotulada explicitamente como hipótese para avaliação do treinador'
  );
  assert.ok(
    generated.suggestedExercise.toLowerCase().includes('hipótese') ||
      formatted.toLowerCase().includes('hipótese para avaliação do treinador'),
    'A distinção entre dado observado e hipótese de treino deve estar explícita'
  );
});
