const MAP_PATH_TO_NAME = {
  '/game/maps/ascent/ascent': 'Ascent',
  '/game/maps/triad/triad': 'Haven',
  '/game/maps/bonsai/bonsai': 'Split',
  '/game/maps/duality/duality': 'Bind',
  '/game/maps/port/port': 'Icebox',
  '/game/maps/foxtrot/foxtrot': 'Breeze',
  '/game/maps/canyon/canyon': 'Fracture',
  '/game/maps/pitt/pitt': 'Pearl',
  '/game/maps/jam/jam': 'Lotus',
  '/game/maps/juliett/juliett': 'Sunset',
  '/game/maps/infinity/infinity': 'Abyss',
  '/game/maps/rook/rook': 'Summit',
};

const ACRONYMS = new Set([
  'ufg',
  'ufmt',
  'uff',
  'ufpr',
  'bbn',
  'caap',
  'ceub',
  'ufu',
  'fei',
  'uscs',
  'unifesp',
  'gdu',
  'ufpb',
  'pucc',
  'umc',
  'ufmg',
  'pucgo',
  'usp',
  'utfpr',
  'ufrj',
  'ufscar',
  'unb',
  'ufabc',
  'ufsc',
  'ufba',
  'ufc',
  'ufpe',
  'ufrgs',
  'unesp',
  'puc',
  'ita',
  'ime',
  'fgv',
  'insper',
  'mackenzie',
  'faap',
  'a2e',
  'gc',
  'pg',
  'iff',
  'unirio',
]);

export function slugifyTeamName(rawName) {
  return String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatTeamDisplayName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (word !== lower && word !== word.toUpperCase()) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function normalizeMapId(rawMapId, filenameMapHint = null) {
  if (typeof rawMapId === 'string' && rawMapId.trim()) {
    const trimmed = rawMapId.trim();
    const mapped = MAP_PATH_TO_NAME[trimmed.toLowerCase()];
    if (mapped) return mapped;
    const parts = trimmed.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || trimmed;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  if (filenameMapHint) {
    const hint = String(filenameMapHint).trim();
    return hint.charAt(0).toUpperCase() + hint.slice(1).toLowerCase();
  }
  return 'Unknown';
}

export function parseFilenameMetadata(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const base = filename.split(/[\\/]/).pop().replace(/\.json$/i, '');

  // Pattern 1: UNIVAVA_C1_002_27-06-26_poli_plague_10_x_13_unicamp_tritons_red_haven
  const officialMatch =
    /^UNIVAVA_(C[1-4]|[A-Z0-9]+)_(\d+[a-z]?)_(\d{2}-\d{2}-\d{2})_(.+)_(\d+)_x_(\d+)_(.+)_([a-z0-9]+)$/i.exec(
      base
    );
  if (officialMatch) {
    const [, stage, matchCode, dateStr, teamARaw, scoreAStr, scoreBStr, teamBRaw, mapHint] =
      officialMatch;
    return {
      stage: stage.toLowerCase(),
      matchCode,
      date: dateStr,
      teamAName: formatTeamDisplayName(teamARaw),
      teamASlug: slugifyTeamName(teamARaw),
      scoreA: Number.parseInt(scoreAStr, 10),
      scoreB: Number.parseInt(scoreBStr, 10),
      teamBName: formatTeamDisplayName(teamBRaw),
      teamBSlug: slugifyTeamName(teamBRaw),
      mapHint,
    };
  }

  // Pattern 2: Generic "<Team A> <scoreA> x <scoreB> <Team B>"
  const genericMatch = /^(.+?)[_\s]+(\d+)[_\s]+[x×][_\s]+(\d+)[_\s]+(.+?)$/i.exec(base);
  if (genericMatch) {
    const [, teamARaw, scoreAStr, scoreBStr, teamBRaw] = genericMatch;
    return {
      stage: null,
      matchCode: null,
      date: null,
      teamAName: formatTeamDisplayName(teamARaw),
      teamASlug: slugifyTeamName(teamARaw),
      scoreA: Number.parseInt(scoreAStr, 10),
      scoreB: Number.parseInt(scoreBStr, 10),
      teamBName: formatTeamDisplayName(teamBRaw),
      teamBSlug: slugifyTeamName(teamBRaw),
      mapHint: null,
    };
  }

  return null;
}

function resolveTeams(matchId, sidePlayers, sideWins, source, teamBindings = {}) {
  const issues = [];
  const meta = parseFilenameMetadata(source?.file);
  const redWins = sideWins.Red ?? 0;
  const blueWins = sideWins.Blue ?? 0;

  const explicitMatchBindings =
    teamBindings?.byMatch?.[matchId] || teamBindings?.[matchId] || null;

  const resolved = {};

  for (const side of ['Red', 'Blue']) {
    const explicitSide =
      explicitMatchBindings?.[side] ||
      teamBindings?.byMatchSide?.[`${matchId}:${side}`] ||
      null;
    if (explicitSide && explicitSide.id && explicitSide.label) {
      resolved[side] = {
        id: explicitSide.id,
        label: explicitSide.label,
        nameVerified: Boolean(explicitSide.nameVerified ?? true),
        players: sidePlayers[side],
      };
    }
  }

  if (!resolved.Red || !resolved.Blue) {
    if (meta && Number.isInteger(meta.scoreA) && Number.isInteger(meta.scoreB)) {
      if (meta.scoreA === meta.scoreB) {
        issues.push(
          `Placar empatado no nome do arquivo (${meta.scoreA}x${meta.scoreB}); impossível atribuir nomes por ordem sem evidência externa.`
        );
      } else if (redWins === meta.scoreA && blueWins === meta.scoreB) {
        resolved.Red = resolved.Red ?? {
          id: meta.teamASlug,
          label: meta.teamAName,
          nameVerified: true,
          players: sidePlayers.Red,
        };
        resolved.Blue = resolved.Blue ?? {
          id: meta.teamBSlug,
          label: meta.teamBName,
          nameVerified: true,
          players: sidePlayers.Blue,
        };
      } else if (redWins === meta.scoreB && blueWins === meta.scoreA) {
        resolved.Red = resolved.Red ?? {
          id: meta.teamBSlug,
          label: meta.teamBName,
          nameVerified: true,
          players: sidePlayers.Red,
        };
        resolved.Blue = resolved.Blue ?? {
          id: meta.teamASlug,
          label: meta.teamAName,
          nameVerified: true,
          players: sidePlayers.Blue,
        };
      } else {
        issues.push(
          `Placar do nome do arquivo (${meta.scoreA}x${meta.scoreB}) diverge do placar interno (${redWins}x${blueWins}).`
        );
      }
    }
  }

  for (const side of ['Red', 'Blue']) {
    if (!resolved[side]) {
      const rosterPreview = sidePlayers[side]
        .slice(0, 2)
        .map((p) => p.name.split('#')[0])
        .join(', ');
      const candidateHint =
        meta?.teamAName && meta?.teamBName
          ? ` [${meta.teamAName} / ${meta.teamBName}]`
          : '';
      resolved[side] = {
        id: `${matchId}:${side}`,
        label: `Equipe ${side}${candidateHint}${rosterPreview ? ` (${rosterPreview}…)` : ''}`,
        nameVerified: false,
        players: sidePlayers[side],
      };
    }
  }

  return {
    teams: [resolved.Red, resolved.Blue],
    sideToTeamId: {
      Red: resolved.Red.id,
      Blue: resolved.Blue.id,
    },
    issues,
  };
}

export function normalizeMatch(raw, source, teamBindings = {}) {
  const issues = [];

  if (!raw || typeof raw !== 'object') {
    return { match: null, issues: ['JSON ausente ou inválido.'] };
  }

  const matchId = raw?.matchInfo?.matchId;
  if (!matchId || typeof matchId !== 'string') {
    return { match: null, issues: ['Campo matchInfo.matchId ausente.'] };
  }

  if (raw?.matchInfo?.isCompleted === false) {
    return { match: null, issues: [`Partida ${matchId} marcada como incompleta (isCompleted=false).`] };
  }

  if (!Array.isArray(raw.players) || raw.players.length === 0) {
    return { match: null, issues: [`Partida ${matchId} sem lista de jogadores.`] };
  }

  if (!Array.isArray(raw.teams) || raw.teams.length < 2) {
    return { match: null, issues: [`Partida ${matchId} sem lista válida de equipes.`] };
  }

  if (!Array.isArray(raw.roundResults) || raw.roundResults.length === 0) {
    return { match: null, issues: [`Partida ${matchId} sem roundResults.`] };
  }

  // Separar jogadores ativos de observadores
  const sidePlayers = { Red: [], Blue: [] };
  const playerSide = new Map();

  for (const p of raw.players) {
    if (!p || typeof p.puuid !== 'string' || !p.puuid.trim()) continue;
    if (p.isObserver === true) continue;
    if (p.teamId !== 'Red' && p.teamId !== 'Blue') continue;

    const id = p.puuid.trim();
    if (playerSide.has(id)) continue;

    const gameName = typeof p.gameName === 'string' ? p.gameName.trim() : '';
    const tagLine = typeof p.tagLine === 'string' ? p.tagLine.trim() : '';
    const name = gameName ? (tagLine ? `${gameName}#${tagLine}` : gameName) : id;

    sidePlayers[p.teamId].push({ id, name });
    playerSide.set(id, p.teamId);
  }

  if (sidePlayers.Red.length === 0 || sidePlayers.Blue.length === 0) {
    return {
      match: null,
      issues: [`Partida ${matchId} não possui jogadores ativos em ambos os lados (Red/Blue).`],
    };
  }

  // Validar rounds e contabilizar vitórias reais por lado
  const sortedRawRounds = [...raw.roundResults].sort(
    (a, b) => (a?.roundNum ?? 0) - (b?.roundNum ?? 0)
  );
  const sideWins = { Red: 0, Blue: 0 };
  const seenRoundNums = new Set();

  for (let i = 0; i < sortedRawRounds.length; i++) {
    const r = sortedRawRounds[i];
    if (!r || typeof r.roundNum !== 'number' || !Number.isInteger(r.roundNum) || r.roundNum < 0) {
      return {
        match: null,
        issues: [`Partida ${matchId} contém round com roundNum inválido.`],
      };
    }
    if (seenRoundNums.has(r.roundNum)) {
      return {
        match: null,
        issues: [`Partida ${matchId} contém roundNum duplicado (${r.roundNum}).`],
      };
    }
    seenRoundNums.add(r.roundNum);

    if (r.winningTeam !== 'Red' && r.winningTeam !== 'Blue') {
      return {
        match: null,
        issues: [`Partida ${matchId} contém round (${r.roundNum + 1}) sem winningTeam válido (${r.winningTeam}).`],
      };
    }
    sideWins[r.winningTeam]++;
  }

  // Verificar consistência entre placar declarado em raw.teams e roundResults
  const declaredSides = new Map();
  for (const t of raw.teams) {
    if (t && (t.teamId === 'Red' || t.teamId === 'Blue')) {
      declaredSides.set(t.teamId, t);
    }
  }

  if (!declaredSides.has('Red') || !declaredSides.has('Blue')) {
    return {
      match: null,
      issues: [`Partida ${matchId} não declara ambos os lados Red e Blue em teams.`],
    };
  }

  for (const side of ['Red', 'Blue']) {
    const decl = declaredSides.get(side);
    if (typeof decl.roundsWon === 'number' && decl.roundsWon !== sideWins[side]) {
      return {
        match: null,
        issues: [
          `Conflito de placar na partida ${matchId} (${side}): teams.roundsWon=${decl.roundsWon} vs roundResults=${sideWins[side]}.`,
        ],
      };
    }
    if (
      typeof decl.roundsPlayed === 'number' &&
      decl.roundsPlayed !== sortedRawRounds.length
    ) {
      return {
        match: null,
        issues: [
          `Conflito de roundsPlayed na partida ${matchId} (${side}): teams.roundsPlayed=${decl.roundsPlayed} vs roundResults.length=${sortedRawRounds.length}.`,
        ],
      };
    }
  }

  const meta = parseFilenameMetadata(source?.file);
  if (
    meta &&
    Number.isInteger(meta.scoreA) &&
    Number.isInteger(meta.scoreB) &&
    meta.scoreA !== meta.scoreB
  ) {
    const matchesDirect = sideWins.Red === meta.scoreA && sideWins.Blue === meta.scoreB;
    const matchesSwapped = sideWins.Red === meta.scoreB && sideWins.Blue === meta.scoreA;
    if (!matchesDirect && !matchesSwapped) {
      return {
        match: null,
        issues: [
          `Conflito entre placar no nome do arquivo (${meta.scoreA}x${meta.scoreB}) e placar real dos rounds (Red ${sideWins.Red} x Blue ${sideWins.Blue}) na partida ${matchId}.`,
        ],
      };
    }
  }

  const { teams, sideToTeamId, issues: teamIssues } = resolveTeams(
    matchId,
    sidePlayers,
    sideWins,
    source,
    teamBindings
  );
  issues.push(...teamIssues);

  const playerToTeamId = new Map();
  for (const [playerId, side] of playerSide.entries()) {
    playerToTeamId.set(playerId, sideToTeamId[side]);
  }

  const rounds = sortedRawRounds.map((r) => {
    const number = r.roundNum + 1;
    const roundId = `${matchId}:r${number}`;
    const roundIssues = [];
    const winnerTeamId = sideToTeamId[r.winningTeam];

    let attackingTeamId = null;
    if (r.winningTeamRole === 'Attacker') {
      attackingTeamId = sideToTeamId[r.winningTeam];
    } else if (r.winningTeamRole === 'Defender') {
      const otherSide = r.winningTeam === 'Red' ? 'Blue' : 'Red';
      attackingTeamId = sideToTeamId[otherSide];
    } else {
      roundIssues.push('missing_or_invalid_winning_team_role');
    }

    const kills = [];
    if (Array.isArray(r.playerStats)) {
      for (const ps of r.playerStats) {
        if (!ps || !Array.isArray(ps.kills)) continue;
        for (const k of ps.kills) {
          if (!k) continue;
          const killerId = typeof k.killer === 'string' && k.killer.trim() ? k.killer.trim() : null;
          const victimId = typeof k.victim === 'string' && k.victim.trim() ? k.victim.trim() : null;
          const killerTeamId = killerId ? (playerToTeamId.get(killerId) ?? null) : null;
          const victimTeamId = victimId ? (playerToTeamId.get(victimId) ?? null) : null;
          const timeMs =
            typeof k.timeSinceRoundStartMillis === 'number' &&
            Number.isFinite(k.timeSinceRoundStartMillis)
              ? k.timeSinceRoundStartMillis
              : null;

          kills.push({
            killerId,
            victimId,
            killerTeamId,
            victimTeamId,
            timeMs,
          });
        }
      }
    }

    kills.sort((a, b) => (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER));

    const hasPlanter = typeof r.bombPlanter === 'string' && r.bombPlanter.trim().length > 0;
    const hasPlantTime = typeof r.plantRoundTime === 'number' && r.plantRoundTime > 0;
    const hasPlantSite = typeof r.plantSite === 'string' && r.plantSite.trim().length > 0;

    let plant = null;
    if (hasPlanter || hasPlantTime || hasPlantSite) {
      const planterId = hasPlanter ? r.bombPlanter.trim() : null;
      const teamId = planterId ? (playerToTeamId.get(planterId) ?? null) : null;
      const timeMs = hasPlantTime ? r.plantRoundTime : null;
      const site = hasPlantSite ? r.plantSite.trim() : null;
      const hasDefuse =
        (typeof r.bombDefuser === 'string' && r.bombDefuser.trim().length > 0) ||
        (typeof r.defuseRoundTime === 'number' && r.defuseRoundTime > 0);
      const defuseTimeMs =
        hasDefuse && typeof r.defuseRoundTime === 'number' && r.defuseRoundTime > 0
          ? r.defuseRoundTime
          : null;

      if (!planterId || !teamId) {
        roundIssues.push('plant_unknown_planter');
      }
      if (timeMs === null || timeMs <= 0) {
        roundIssues.push('plant_invalid_time');
      }

      plant = {
        teamId,
        planterId,
        timeMs,
        site,
        defuseTimeMs,
      };
    }

    return {
      id: roundId,
      matchId,
      number,
      winnerTeamId,
      attackingTeamId,
      kills,
      plant,
      issues: roundIssues,
    };
  });

  const normalizedSource = {
    file: source?.file ?? '',
    qualifier: source?.qualifier ?? '',
    driveId: source?.driveId ?? '',
    sha256: source?.sha256 ?? '',
  };

  return {
    match: {
      id: matchId,
      source: normalizedSource,
      mapId: normalizeMapId(raw.matchInfo.mapId, meta?.mapHint),
      teams,
      rounds,
    },
    issues,
  };
}

function canonicalMatchFingerprint(match) {
  return JSON.stringify({
    id: match.id,
    mapId: match.mapId,
    rounds: match.rounds.map((r) => ({
      number: r.number,
      winnerTeamId: r.winnerTeamId,
      attackingTeamId: r.attackingTeamId,
      killsCount: r.kills.length,
      plantTime: r.plant?.timeMs ?? null,
      plantSite: r.plant?.site ?? null,
    })),
    players: match.teams
      .flatMap((t) => t.players.map((p) => p.id))
      .sort(),
  });
}

export function normalizeCorpus(entries, teamBindings = {}) {
  const includedById = new Map();
  const conflictedIds = new Set();
  const report = {
    totalFiles: entries.length,
    includedCount: 0,
    included: [],
    duplicates: [],
    excluded: [],
    ambiguousTeams: [],
  };

  for (const entry of entries) {
    const source = entry.source || { file: '', qualifier: '', driveId: '', sha256: '' };
    if (entry.parseError) {
      report.excluded.push({
        file: source.file,
        qualifier: source.qualifier,
        driveId: source.driveId,
        matchId: null,
        reason: `Erro de leitura/parse JSON: ${entry.parseError}`,
      });
      continue;
    }

    const { match, issues } = normalizeMatch(entry.raw, source, teamBindings);
    if (!match) {
      report.excluded.push({
        file: source.file,
        qualifier: source.qualifier,
        driveId: source.driveId,
        matchId: entry.raw?.matchInfo?.matchId ?? null,
        reason: issues.join(' | ') || 'Partida inválida.',
      });
      continue;
    }

    if (conflictedIds.has(match.id)) {
      report.excluded.push({
        file: source.file,
        qualifier: source.qualifier,
        driveId: source.driveId,
        matchId: match.id,
        reason: `Conflito de matchId (${match.id}) com arquivo divergente.`,
      });
      continue;
    }

    if (includedById.has(match.id)) {
      const existing = includedById.get(match.id);
      const sameHash =
        existing.match.source.sha256 &&
        source.sha256 &&
        existing.match.source.sha256 === source.sha256;
      const sameContent =
        sameHash || existing.fingerprint === canonicalMatchFingerprint(match);

      if (sameContent) {
        report.duplicates.push({
          file: source.file,
          qualifier: source.qualifier,
          driveId: source.driveId,
          matchId: match.id,
          keptFile: existing.match.source.file,
          reason: 'Duplicata idêntica de matchId deduplicada.',
        });
      } else {
        includedById.delete(match.id);
        conflictedIds.add(match.id);
        report.excluded.push(
          {
            file: existing.match.source.file,
            qualifier: existing.match.source.qualifier,
            driveId: existing.match.source.driveId,
            matchId: match.id,
            reason: `Conflito de matchId (${match.id}): múltiplas versões com conteúdos ou placares divergentes.`,
          },
          {
            file: source.file,
            qualifier: source.qualifier,
            driveId: source.driveId,
            matchId: match.id,
            reason: `Conflito de matchId (${match.id}): múltiplas versões com conteúdos ou placares divergentes.`,
          }
        );
      }
      continue;
    }

    includedById.set(match.id, {
      match,
      issues,
      fingerprint: canonicalMatchFingerprint(match),
    });
  }

  const matches = [...includedById.values()].map((item) => item.match);
  report.includedCount = matches.length;

  for (const { match, issues } of includedById.values()) {
    report.included.push({
      file: match.source.file,
      qualifier: match.source.qualifier,
      driveId: match.source.driveId,
      sha256: match.source.sha256,
      matchId: match.id,
      mapId: match.mapId,
      roundsCount: match.rounds.length,
      teams: match.teams.map((t) => ({
        id: t.id,
        label: t.label,
        nameVerified: t.nameVerified,
      })),
      issues,
    });

    for (const team of match.teams) {
      if (!team.nameVerified) {
        report.ambiguousTeams.push({
          matchId: match.id,
          file: match.source.file,
          teamId: team.id,
          label: team.label,
        });
      }
    }
  }

  return { matches, report };
}
