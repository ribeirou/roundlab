import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatch, normalizeCorpus } from '../src/normalize.mjs';

function makeBaseRawMatch(overrides = {}) {
  return {
    matchInfo: {
      matchId: 'match-1',
      mapId: '/Game/Maps/Ascent/Ascent',
      ...overrides.matchInfo,
    },
    players: overrides.players ?? [
      {
        puuid: 'p-red-1',
        gameName: 'RedOne',
        tagLine: 'BR1',
        teamId: 'Red',
        characterId: 'char-1',
        accountLevel: 120,
        playerCard: 'card-secret',
        playerTitle: 'title-secret',
      },
      {
        puuid: 'p-blue-1',
        gameName: 'BlueOne',
        tagLine: 'BR1',
        teamId: 'Blue',
        characterId: 'char-2',
        accountLevel: 95,
      },
      {
        puuid: 'obs-1',
        gameName: 'Caster',
        tagLine: 'OBS',
        teamId: 'Neutral',
        characterId: '',
      },
    ],
    teams: overrides.teams ?? [
      { teamId: 'Red', won: true, roundsPlayed: 2, roundsWon: 2 },
      { teamId: 'Blue', won: false, roundsPlayed: 2, roundsWon: 0 },
    ],
    roundResults: overrides.roundResults ?? [
      {
        roundNum: 0,
        winningTeam: 'Red',
        winningTeamRole: 'Attacker',
        bombPlanter: 'p-red-1',
        plantRoundTime: 42000,
        plantSite: 'A',
        defuseRoundTime: null,
        playerStats: [
          {
            puuid: 'p-red-1',
            kills: [
              {
                killer: 'p-red-1',
                victim: 'p-blue-1',
                 timeSinceRoundStartMillis: 35000,
              },
            ],
          },
          {
            puuid: 'p-blue-1',
            kills: [],
          },
        ],
      },
      {
        roundNum: 1,
        winningTeam: 'Red',
        winningTeamRole: 'Attacker',
        bombPlanter: null,
        plantRoundTime: null,
        plantSite: '',
        defuseRoundTime: null,
        playerStats: [
          {
            puuid: 'p-red-1',
            kills: [
              {
                killer: 'p-red-1',
                victim: 'p-blue-1',
                timeSinceRoundStartMillis: 28000,
              },
            ],
          },
          {
            puuid: 'p-blue-1',
            kills: [],
          },
        ],
      },
    ],
  };
}

const sampleSource = {
  file: 'Poli Plague 2 x 0 Unicamp Tritons.json',
  qualifier: 'c1',
  driveId: 'drive-file-1',
  sha256: 'abc123sha256',
};

test('ignoresObservers', () => {
  const raw = makeBaseRawMatch();
  const { match, issues } = normalizeMatch(raw, sampleSource);
  assert.ok(match, 'Partida válida deve ser normalizada');
  assert.equal(issues.length, 0);

  const allPlayerIds = match.teams.flatMap((t) => t.players.map((p) => p.id));
  assert.ok(!allPlayerIds.includes('obs-1'), 'Observador não deve integrar nenhuma equipe');
  assert.deepEqual(allPlayerIds.sort(), ['p-blue-1', 'p-red-1']);

  // Confirmar remoção de campos pessoais/irrelevantes e numeração humana (roundNum + 1)
  const serialized = JSON.stringify(match);
  assert.ok(!serialized.includes('accountLevel'));
  assert.ok(!serialized.includes('playerCard'));
  assert.equal(match.rounds[0].number, 1);
  assert.equal(match.rounds[1].number, 2);
});

test('rejectsTruncatedOrConflictingMatch', () => {
  // Caso 1: placar declarado em teams incompatível com roundResults
  const conflictingScoreRaw = makeBaseRawMatch({
    teams: [
      { teamId: 'Red', won: true, roundsPlayed: 13, roundsWon: 13 },
      { teamId: 'Blue', won: false, roundsPlayed: 13, roundsWon: 0 },
    ],
  });
  const res1 = normalizeMatch(conflictingScoreRaw, sampleSource);
  assert.equal(res1.match, null, 'Placar incompatível deve excluir a partida das métricas');
  assert.ok(res1.issues.length > 0, 'Motivo de exclusão deve ser registrado');

  // Caso 2: JSON truncado / sem estruturas obrigatórias
  const res2 = normalizeMatch({ matchInfo: { matchId: 'broken' } }, sampleSource);
  assert.equal(res2.match, null);
  assert.ok(res2.issues.length > 0);
});

test('deduplicatesMatchIds', () => {
  const rawA = makeBaseRawMatch();
  const sourceA = { ...sampleSource, file: 'copy1.json', sha256: 'same-hash' };
  const sourceB = { ...sampleSource, file: 'copy2.json', sha256: 'same-hash' };

  // Duplicata idêntica mantém apenas uma entrada
  const identicalCorpus = normalizeCorpus([
    { raw: rawA, source: sourceA },
    { raw: rawA, source: sourceB },
  ]);
  assert.equal(identicalCorpus.matches.length, 1, 'Duplicata idêntica deve manter uma única partida');
  assert.equal(identicalCorpus.report.duplicates.length, 1);

  // Conflito com mesmo matchId mas conteúdo/placar divergente não escolhe versão silenciosamente
  const rawConflict = makeBaseRawMatch({
    teams: [
      { teamId: 'Red', won: false, roundsPlayed: 2, roundsWon: 0 },
      { teamId: 'Blue', won: true, roundsPlayed: 2, roundsWon: 2 },
    ],
    roundResults: [
      {
        roundNum: 0,
        winningTeam: 'Blue',
        winningTeamRole: 'Defender',
        playerStats: [],
      },
      {
        roundNum: 1,
        winningTeam: 'Blue',
        winningTeamRole: 'Defender',
        playerStats: [],
      },
    ],
  });
  const conflictCorpus = normalizeCorpus([
    { raw: rawA, source: sourceA },
    { raw: rawConflict, source: { ...sampleSource, file: 'conflict.json', sha256: 'diff-hash' } },
  ]);
  assert.equal(
    conflictCorpus.matches.length,
    0,
    'Conflito de mesmo matchId não deve escolher versão silenciosamente'
  );
  assert.ok(
    conflictCorpus.report.excluded.some((e) => e.reason.toLowerCase().includes('conflit')),
    'Relatório deve explicitar conflito de matchId'
  );
});

test('preservesAmbiguousTeams', () => {
  // Empate de placar (ex.: 1 x 1) ou arquivo sem evidência suficiente não resolve nome pela ordem no arquivo
  const tiedRaw = makeBaseRawMatch({
    teams: [
      { teamId: 'Red', won: false, roundsPlayed: 2, roundsWon: 1 },
      { teamId: 'Blue', won: false, roundsPlayed: 2, roundsWon: 1 },
    ],
    roundResults: [
      {
        roundNum: 0,
        winningTeam: 'Red',
        winningTeamRole: 'Attacker',
        playerStats: [],
      },
      {
        roundNum: 1,
        winningTeam: 'Blue',
        winningTeamRole: 'Defender',
        playerStats: [],
      },
    ],
  });
  const tiedSource = {
    file: 'Alpha Gaming 1 x 1 Beta Esports.json',
    qualifier: 'c2',
    driveId: 'drive-tie',
    sha256: 'tie-hash',
  };

  const { match } = normalizeMatch(tiedRaw, tiedSource);
  assert.ok(match);
  for (const team of match.teams) {
    assert.equal(team.nameVerified, false, 'Empate de placar não deve marcar nome como verificado por ordem');
    assert.ok(
      team.id.includes('match-1') && (team.id.includes('Red') || team.id.includes('Blue')),
      'Equipe sem verificação deve usar id específico da partida e lado'
    );
    assert.ok(
      team.label.includes('Red') || team.label.includes('Blue'),
      'Rótulo ambíguo deve preservar indicação de lado (Red/Blue)'
    );
  }
});

test('verifiesOfficialC1AndC4OvertimeMatches', async (t) => {
  const fs = await import('node:fs');
  if (!fs.existsSync('public/data/matches.json')) {
    t.skip('public/data/matches.json ainda não gerado');
    return;
  }
  const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8'));
  assert.equal(matches.length, 199);

  const c1 = matches.find((m) => m.id === 'fc187928-9b72-42b3-aaaf-8ca6689a3937');
  assert.ok(c1, 'Caso C1 oficial deve estar presente');
  assert.equal(c1.rounds.length, 23);
  assert.equal(c1.teams[0].id, 'poli-plague');
  assert.equal(c1.teams[1].id, 'unicamp-tritons-red');
  assert.equal(c1.rounds.filter((r) => r.winnerTeamId === 'poli-plague').length, 10);
  assert.equal(c1.rounds.filter((r) => r.winnerTeamId === 'unicamp-tritons-red').length, 13);

  const c4 = matches.find((m) => m.id === '560367e5-24b2-4a9e-9be0-c711ca258398');
  assert.ok(c4, 'Partida C4 com 36 rounds deve estar presente');
  assert.equal(c4.rounds.length, 36);
  assert.equal(c4.teams[0].id, 'pucgo-sistematica-academy');
  assert.equal(c4.teams[1].id, 'fatec-pg');
  assert.equal(c4.rounds.filter((r) => r.winnerTeamId === 'pucgo-sistematica-academy').length, 17);
  assert.equal(c4.rounds.filter((r) => r.winnerTeamId === 'fatec-pg').length, 19);
});

