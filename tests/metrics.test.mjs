import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  selectRounds,
  firstKillConversion,
  postPlantConversion,
} from '../src/metrics.mjs';

function makeRound(overrides = {}) {
  const number = overrides.number ?? 1;
  const matchId = overrides.matchId ?? 'match-1';
  return {
    id: overrides.id ?? `${matchId}:r${number}`,
    matchId,
    number,
    winnerTeamId: overrides.winnerTeamId ?? 'team-a',
    attackingTeamId: overrides.attackingTeamId ?? 'team-a',
    kills: overrides.kills ?? [],
    plant: overrides.plant ?? null,
    issues: overrides.issues ?? [],
  };
}

test('deduplicatesEvents', () => {
  const singleEventRound = makeRound({
    number: 1,
    winnerTeamId: 'team-a',
    kills: [
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 12000,
      },
    ],
  });

  const duplicatedEventRound = makeRound({
    number: 1,
    winnerTeamId: 'team-a',
    kills: [
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 12000,
      },
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 12000,
      },
      {
        killerId: 'pb-2',
        victimId: 'pa-1',
        killerTeamId: 'team-b',
        victimTeamId: 'team-a',
        timeMs: 12000,
      },
    ],
  });

  // Se o evento duplicado da mesma kill apenas se repete no mesmo timestamp:
  const pureDuplicateRound = makeRound({
    number: 1,
    winnerTeamId: 'team-a',
    kills: [
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 12000,
      },
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 12000,
      },
    ],
  });

  const metricSingle = firstKillConversion([singleEventRound], 'team-a');
  const metricDup = firstKillConversion([pureDuplicateRound], 'team-a');

  assert.equal(metricSingle.opportunities, 1);
  assert.equal(metricDup.opportunities, 1, 'Evento duplicado idêntico não deve alterar oportunidades nem gerar falso empate');
  assert.equal(metricDup.wins, 1);
  assert.equal(metricDup.excluded.length, 0);

  // Já quando há um segundo evento distinto da equipe oposta no mesmo menor horário:
  const metricTie = firstKillConversion([duplicatedEventRound], 'team-a');
  assert.equal(metricTie.opportunities, 0);
  assert.equal(metricTie.excluded.length, 1);
});

test('excludesOpposingFirstKillTies', () => {
  const tieRound = makeRound({
    number: 3,
    winnerTeamId: 'team-a',
    kills: [
      {
        killerId: 'pa-1',
        victimId: 'pb-1',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 18500,
      },
      {
        killerId: 'pb-1',
        victimId: 'pa-1',
        killerTeamId: 'team-b',
        victimTeamId: 'team-a',
        timeMs: 18500,
      },
    ],
  });

  const metricA = firstKillConversion([tieRound], 'team-a');
  const metricB = firstKillConversion([tieRound], 'team-b');

  assert.equal(metricA.opportunities, 0, 'Empate entre equipes no menor horário não entra no denominador');
  assert.equal(metricA.wins, 0);
  assert.equal(metricA.rate, null);
  assert.equal(metricA.excluded.length, 1);
  assert.equal(metricA.excluded[0].roundId, 'match-1:r3');

  assert.equal(metricB.opportunities, 0);
  assert.equal(metricB.excluded.length, 1);
});

test('ignoresUnknownAndFriendlyKills', () => {
  const round = makeRound({
    number: 2,
    winnerTeamId: 'team-b',
    kills: [
      // Friendly fire antes da primeira kill válida
      {
        killerId: 'pa-1',
        victimId: 'pa-2',
        killerTeamId: 'team-a',
        victimTeamId: 'team-a',
        timeMs: 5000,
      },
      // Jogador/equipe desconhecida antes da primeira kill válida
      {
        killerId: null,
        victimId: 'pb-1',
        killerTeamId: null,
        victimTeamId: 'team-b',
        timeMs: 7000,
      },
      // Primeira eliminação válida entre adversários (team-a elimina team-b)
      {
        killerId: 'pa-1',
        victimId: 'pb-2',
        killerTeamId: 'team-a',
        victimTeamId: 'team-b',
        timeMs: 11000,
      },
    ],
  });

  const metric = firstKillConversion([round], 'team-a');
  assert.equal(metric.opportunities, 1);
  assert.equal(metric.wins, 0, 'team-a conseguiu a 1ª kill válida mas perdeu o round para team-b');
  assert.equal(metric.rate, 0);
  assert.equal(metric.evidence.length, 1);
  assert.equal(metric.evidence[0].won, false);
});

test('excludesUnknownPlanter', () => {
  const unknownPlanterRound = makeRound({
    number: 4,
    winnerTeamId: 'team-b',
    attackingTeamId: 'team-a',
    plant: {
      teamId: null,
      planterId: null,
      timeMs: 32000,
      site: 'A',
      defuseTimeMs: null,
    },
  });

  const invalidTimePlantRound = makeRound({
    number: 5,
    winnerTeamId: 'team-b',
    attackingTeamId: 'team-a',
    plant: {
      teamId: 'team-a',
      planterId: 'pa-1',
      timeMs: 0,
      site: 'B',
      defuseTimeMs: null,
    },
  });

  const validPlantRound = makeRound({
    number: 6,
    winnerTeamId: 'team-a',
    attackingTeamId: 'team-a',
    plant: {
      teamId: 'team-a',
      planterId: 'pa-1',
      timeMs: 41000,
      site: 'A',
      defuseTimeMs: null,
    },
  });

  const metric = postPlantConversion(
    [unknownPlanterRound, invalidTimePlantRound, validPlantRound],
    'team-a'
  );

  assert.equal(metric.opportunities, 1, 'Plants com planter desconhecido ou tempo inválido não contam como derrota');
  assert.equal(metric.wins, 1);
  assert.equal(metric.rate, 1);
  assert.equal(metric.excluded.length, 2, 'Ambos os rounds inconsistentes devem constar em excluded');
});

test('emptyRateIsNull', () => {
  const fkEmpty = firstKillConversion([], 'team-a');
  assert.equal(fkEmpty.opportunities, 0);
  assert.equal(fkEmpty.wins, 0);
  assert.equal(fkEmpty.rate, null, 'Denominador zero deve retornar rate: null, nunca 0');

  const ppEmpty = postPlantConversion([], 'team-a');
  assert.equal(ppEmpty.opportunities, 0);
  assert.equal(ppEmpty.wins, 0);
  assert.equal(ppEmpty.rate, null);
});

test('smallSampleThreshold', () => {
  const makeFkWinRound = (num) =>
    makeRound({
      number: num,
      winnerTeamId: 'team-a',
      kills: [
        {
          killerId: 'pa-1',
          victimId: 'pb-1',
          killerTeamId: 'team-a',
          victimTeamId: 'team-b',
          timeMs: 10000,
        },
      ],
    });

  const nineRounds = Array.from({ length: 9 }, (_, i) => makeFkWinRound(i + 1));
  const tenRounds = Array.from({ length: 10 }, (_, i) => makeFkWinRound(i + 1));

  const metric9 = firstKillConversion(nineRounds, 'team-a');
  const metric10 = firstKillConversion(tenRounds, 'team-a');

  assert.equal(metric9.opportunities, 9);
  assert.equal(metric9.smallSample, true, '9 oportunidades deve sinalizar amostra pequena (< 10)');

  assert.equal(metric10.opportunities, 10);
  assert.equal(metric10.smallSample, false, '10 oportunidades não deve sinalizar amostra pequena');
});

test('matchesOfficialSample', () => {
  const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8'));
  const c1MatchId = 'fc187928-9b72-42b3-aaaf-8ca6689a3937';

  // No caso C1 (Poli Plague 10 x 13 Unicamp Tritons Red), o lado Red é 'poli-plague'
  const rounds = selectRounds(matches, {
    teamId: 'poli-plague',
    qualifier: 'c1',
    matchId: c1MatchId,
  });
  assert.equal(rounds.length, 23);

  const fk = firstKillConversion(rounds, 'poli-plague');
  assert.equal(fk.wins, 7);
  assert.equal(fk.opportunities, 10);
  assert.equal(fk.rate, 0.7);
  assert.equal(fk.smallSample, false);

  const lostRoundNumbers = fk.evidence
    .filter((e) => !e.won)
    .map((e) => Number.parseInt(e.roundId.split(':r')[1], 10));
  assert.deepEqual(lostRoundNumbers, [16, 20, 22]);

  const pp = postPlantConversion(rounds, 'poli-plague');
  assert.equal(pp.wins, 7);
  assert.equal(pp.opportunities, 10);
  assert.equal(pp.rate, 0.7);
  const ppLostRounds = pp.evidence
    .filter((e) => !e.won)
    .map((e) => Number.parseInt(e.roundId.split(':r')[1], 10));
  assert.deepEqual(ppLostRounds, [3, 4, 10]);

  const ppSiteC = postPlantConversion(rounds, 'poli-plague', 'C');
  assert.equal(ppSiteC.wins, 5);
  assert.equal(ppSiteC.opportunities, 8);
  assert.equal(ppSiteC.smallSample, true);
});
