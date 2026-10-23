export const SMALL_SAMPLE_THRESHOLD = 10;

export function selectRounds(matches, filters = {}) {
  if (!Array.isArray(matches)) return [];
  const { teamId, qualifier, mapId, matchId } = filters ?? {};

  const selected = [];
  for (const match of matches) {
    if (!match || !Array.isArray(match.rounds)) continue;

    if (teamId && (!Array.isArray(match.teams) || !match.teams.some((t) => t.id === teamId))) {
      continue;
    }
    if (qualifier && match.source?.qualifier !== qualifier) {
      continue;
    }
    if (mapId && match.mapId !== mapId) {
      continue;
    }
    if (matchId && match.id !== matchId) {
      continue;
    }

    for (const round of match.rounds) {
      selected.push(round);
    }
  }

  return selected;
}

export function deduplicateKills(kills) {
  if (!Array.isArray(kills)) return [];
  const seen = new Set();
  const unique = [];

  for (const k of kills) {
    if (!k || typeof k !== 'object') continue;
    const key = `${k.killerId ?? ''}|${k.victimId ?? ''}|${k.timeMs ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(k);
  }

  unique.sort(
    (a, b) =>
      (typeof a.timeMs === 'number' && Number.isFinite(a.timeMs)
        ? a.timeMs
        : Number.MAX_SAFE_INTEGER) -
      (typeof b.timeMs === 'number' && Number.isFinite(b.timeMs)
        ? b.timeMs
        : Number.MAX_SAFE_INTEGER)
  );

  return unique;
}

function isEligibleAdversaryKill(kill) {
  if (!kill || typeof kill !== 'object') return false;
  if (typeof kill.timeMs !== 'number' || !Number.isFinite(kill.timeMs) || kill.timeMs < 0) {
    return false;
  }
  if (!kill.killerId || !kill.victimId) return false;
  if (!kill.killerTeamId || !kill.victimTeamId) return false;
  if (kill.killerTeamId === kill.victimTeamId) return false;
  return true;
}

export function firstKillConversion(rounds, teamId) {
  let wins = 0;
  let opportunities = 0;
  const evidence = [];
  const excluded = [];

  if (!Array.isArray(rounds) || !teamId) {
    return {
      wins: 0,
      opportunities: 0,
      rate: null,
      smallSample: true,
      evidence: [],
      excluded: [],
    };
  }

  for (const round of rounds) {
    if (!round) continue;
    const uniqueKills = deduplicateKills(round.kills);
    const eligibleKills = uniqueKills.filter(isEligibleAdversaryKill);

    if (eligibleKills.length === 0) {
      if (uniqueKills.length > 0) {
        excluded.push({
          matchId: round.matchId,
          roundId: round.id,
          reason: 'Round sem eliminações válidas entre adversários identificados.',
        });
      }
      continue;
    }

    const minTime = eligibleKills[0].timeMs;
    const earliestKills = eligibleKills.filter((k) => k.timeMs === minTime);
    const earliestTeams = new Set(earliestKills.map((k) => k.killerTeamId));

    if (earliestTeams.size > 1) {
      excluded.push({
        matchId: round.matchId,
        roundId: round.id,
        reason: `Primeira eliminação ambígua: empate entre equipes no instante ${minTime} ms.`,
      });
      continue;
    }

    const firstKill = earliestKills[0];
    if (firstKill.killerTeamId !== teamId) {
      continue;
    }

    opportunities++;
    const won = round.winnerTeamId === teamId;
    if (won) wins++;

    evidence.push({
      matchId: round.matchId,
      roundId: round.id,
      won,
    });
  }

  const rate = opportunities > 0 ? wins / opportunities : null;
  const smallSample = opportunities < SMALL_SAMPLE_THRESHOLD;

  return {
    wins,
    opportunities,
    rate,
    smallSample,
    evidence,
    excluded,
  };
}

export function postPlantConversion(rounds, teamId, site) {
  let wins = 0;
  let opportunities = 0;
  const evidence = [];
  const excluded = [];

  if (!Array.isArray(rounds) || !teamId) {
    return {
      wins: 0,
      opportunities: 0,
      rate: null,
      smallSample: true,
      evidence: [],
      excluded: [],
    };
  }

  const normalizedSite =
    typeof site === 'string' && site.trim().length > 0 ? site.trim().toUpperCase() : null;

  for (const round of rounds) {
    if (!round || !round.plant) continue;
    const plant = round.plant;
    const plantSite =
      typeof plant.site === 'string' && plant.site.trim().length > 0
        ? plant.site.trim().toUpperCase()
        : null;

    if (normalizedSite && plantSite && plantSite !== normalizedSite) {
      continue;
    }

    if (!plant.planterId || !plant.teamId) {
      // Se sabemos que outra equipe era a atacante, não pertence a teamId; caso contrário, registrar exclusão
      if (!round.attackingTeamId || round.attackingTeamId === teamId) {
        excluded.push({
          matchId: round.matchId,
          roundId: round.id,
          reason: 'Plant com autor (bombPlanter) ou equipe não identificados.',
        });
      }
      continue;
    }

    if (plant.teamId !== teamId) {
      continue;
    }

    if (typeof plant.timeMs !== 'number' || !Number.isFinite(plant.timeMs) || plant.timeMs <= 0) {
      excluded.push({
        matchId: round.matchId,
        roundId: round.id,
        reason: 'Plant com horário ausente ou incoerente.',
      });
      continue;
    }

    if (
      plant.defuseTimeMs !== null &&
      plant.defuseTimeMs !== undefined &&
      (typeof plant.defuseTimeMs !== 'number' ||
        !Number.isFinite(plant.defuseTimeMs) ||
        plant.defuseTimeMs < plant.timeMs)
    ) {
      excluded.push({
        matchId: round.matchId,
        roundId: round.id,
        reason: 'Horário de desarme incoerente em relação ao horário de plant.',
      });
      continue;
    }

    if (normalizedSite && !plantSite) {
      excluded.push({
        matchId: round.matchId,
        roundId: round.id,
        reason: `Plant sem bomb site informado para o filtro de site ${normalizedSite}.`,
      });
      continue;
    }

    opportunities++;
    const won = round.winnerTeamId === teamId;
    if (won) wins++;

    evidence.push({
      matchId: round.matchId,
      roundId: round.id,
      won,
    });
  }

  const rate = opportunities > 0 ? wins / opportunities : null;
  const smallSample = opportunities < SMALL_SAMPLE_THRESHOLD;

  return {
    wins,
    opportunities,
    rate,
    smallSample,
    evidence,
    excluded,
  };
}
