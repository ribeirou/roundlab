import {
  selectRounds,
  firstKillConversion,
  postPlantConversion,
  deduplicateKills,
} from './lib/metrics.mjs';

const C1_REFERENCE_PRESET = {
  teamId: 'poli-plague',
  qualifier: 'c1',
  mapId: '',
  matchId: 'fc187928-9b72-42b3-aaaf-8ca6689a3937',
  site: '',
};

const state = {
  filters: { ...C1_REFERENCE_PRESET },
  metricKey: 'firstKill',
  selectedRoundId: 'fc187928-9b72-42b3-aaaf-8ca6689a3937:r16',
  agenda: [],
  outcomeFilter: 'all',
};

let allMatches = [];
let matchesById = new Map();
let teamsDirectory = [];
let allMaps = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${String(mins).padStart(2, '0')}:${secs}s`;
}

function formatRatePercent(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return 'Sem dados';
  }
  return `${(rate * 100).toFixed(1).replace('.', ',')}%`;
}

function qualifierLabel(q) {
  if (!q) return 'Todas';
  return q.toUpperCase();
}

function buildDirectories(matches) {
  matchesById = new Map();
  const teamMap = new Map();
  const mapSet = new Set();

  for (const m of matches) {
    matchesById.set(m.id, m);
    if (m.mapId) mapSet.add(m.mapId);
    for (const t of m.teams || []) {
      if (!teamMap.has(t.id)) {
        teamMap.set(t.id, {
          id: t.id,
          label: t.label,
          nameVerified: t.nameVerified,
          matchesCount: 0,
        });
      }
      teamMap.get(t.id).matchesCount++;
    }
  }

  teamsDirectory = [...teamMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  allMaps = [...mapSet].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function getTeamLabel(teamId) {
  const found = teamsDirectory.find((t) => t.id === teamId);
  return found ? found.label : teamId || 'Equipe';
}

function getMatchScoreLabel(match, perspectiveTeamId) {
  if (!match) return '';
  const teamA = match.teams[0];
  const teamB = match.teams[1];
  const winsA = match.rounds.filter((r) => r.winnerTeamId === teamA.id).length;
  const winsB = match.rounds.filter((r) => r.winnerTeamId === teamB.id).length;

  if (perspectiveTeamId && teamB.id === perspectiveTeamId) {
    return `${teamB.label} ${winsB} × ${winsA} ${teamA.label}`;
  }
  return `${teamA.label} ${winsA} × ${winsB} ${teamB.label}`;
}

function getPlayerMapForMatch(match) {
  const map = new Map();
  if (!match) return map;
  for (const t of match.teams || []) {
    for (const p of t.players || []) {
      map.set(p.id, { name: p.name, teamId: t.id, teamLabel: t.label });
    }
  }
  return map;
}

function getFirstEligibleKillForRound(round) {
  const uniqueKills = deduplicateKills(round?.kills || []);
  const eligible = uniqueKills.filter(
    (k) =>
      typeof k.timeMs === 'number' &&
      Number.isFinite(k.timeMs) &&
      k.timeMs >= 0 &&
      k.killerId &&
      k.victimId &&
      k.killerTeamId &&
      k.victimTeamId &&
      k.killerTeamId !== k.victimTeamId
  );
  if (eligible.length === 0) return null;
  const minTime = eligible[0].timeMs;
  const tied = eligible.filter((k) => k.timeMs === minTime);
  const teams = new Set(tied.map((k) => k.killerTeamId));
  if (teams.size > 1) return null;
  return tied[0];
}

function getTeamRoleLabel(round, teamId) {
  if (!round || !round.attackingTeamId || !teamId) return 'Não identificado';
  return round.attackingTeamId === teamId ? 'Atacante' : 'Defensor';
}

function reconcileIncompatibleRoundSelection(activeMetric) {
  if (!state.selectedRoundId) return;

  const visibleEvidence = activeMetric.evidence.filter((ev) => {
    if (state.outcomeFilter === 'lost') return !ev.won;
    if (state.outcomeFilter === 'won') return ev.won;
    return true;
  });

  const stillCompatible = visibleEvidence.some((ev) => ev.roundId === state.selectedRoundId);
  if (!stillCompatible) {
    state.selectedRoundId = null;
  }
}

function populateFilterControls() {
  const teamSelect = document.getElementById('filter-team');
  const qualifierSelect = document.getElementById('filter-qualifier');
  const mapSelect = document.getElementById('filter-map');
  const matchSelect = document.getElementById('filter-match');
  const siteSelect = document.getElementById('filter-site');

  teamSelect.innerHTML = teamsDirectory
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)} (${t.matchesCount} ${
          t.matchesCount === 1 ? 'partida' : 'partidas'
        })</option>`
    )
    .join('');
  teamSelect.value = state.filters.teamId;
  teamSelect.disabled = false;

  qualifierSelect.value = state.filters.qualifier;
  qualifierSelect.disabled = false;

  mapSelect.innerHTML =
    `<option value="">Todos os mapas</option>` +
    allMaps
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join('');
  mapSelect.value = state.filters.mapId;
  mapSelect.disabled = false;

  // Listar partidas da equipe (respeitando classificatória e mapa quando selecionados)
  const candidateMatches = allMatches.filter((m) => {
    if (state.filters.teamId && !m.teams.some((t) => t.id === state.filters.teamId)) {
      return false;
    }
    if (state.filters.qualifier && m.source?.qualifier !== state.filters.qualifier) {
      return false;
    }
    if (state.filters.mapId && m.mapId !== state.filters.mapId) {
      return false;
    }
    return true;
  });

  // Se o matchId selecionado ficou incompatível com o novo filtro de equipe/classificatória/mapa, limpá-lo
  if (
    state.filters.matchId &&
    !candidateMatches.some((m) => m.id === state.filters.matchId)
  ) {
    state.filters.matchId = '';
  }

  matchSelect.innerHTML =
    `<option value="">Todas as partidas do recorte (${candidateMatches.length})</option>` +
    candidateMatches
      .map((m) => {
        const label = `${qualifierLabel(m.source?.qualifier)} · ${getMatchScoreLabel(
          m,
          state.filters.teamId
        )} (${m.mapId})`;
        return `<option value="${escapeHtml(m.id)}">${escapeHtml(label)}</option>`;
      })
      .join('');
  matchSelect.value = state.filters.matchId;
  matchSelect.disabled = false;

  siteSelect.value = state.filters.site;
  siteSelect.disabled = false;
}

function renderScopeSummary(filteredMatches, filteredRounds) {
  const container = document.getElementById('scope-summary');
  const teamLabel = getTeamLabel(state.filters.teamId);
  const qualText = state.filters.qualifier
    ? `Classificatória ${state.filters.qualifier.toUpperCase()}`
    : 'Classificatórias C1–C4';
  const mapText = state.filters.mapId ? `Mapa ${state.filters.mapId}` : 'Todos os mapas';
  const siteText = state.filters.site
    ? `Filtro Pós-Plant: Site ${state.filters.site}`
    : 'Todos os sites';

  container.innerHTML = `
    <div>
      Recorte ativo para <strong>${escapeHtml(teamLabel)}</strong>:
      <span>${escapeHtml(qualText)} · ${escapeHtml(mapText)} · ${escapeHtml(siteText)}</span>
    </div>
    <div class="scope-pills">
      <span class="scope-pill"><strong>${filteredMatches.length}</strong> ${
        filteredMatches.length === 1 ? 'partida' : 'partidas'
      }</span>
      <span class="scope-pill"><strong>${filteredRounds.length}</strong> rounds no recorte</span>
    </div>
  `;
}

function renderMetricCards(fkMetric, ppMetric) {
  const grid = document.getElementById('metrics-grid');
  const siteSuffix = state.filters.site ? ` (Site ${state.filters.site})` : '';

  const cards = [
    {
      key: 'firstKill',
      title: 'Conversão da 1ª Eliminação',
      subtitle:
        'Rounds vencidos pela equipe após conquistar a primeira eliminação válida entre adversários',
      metric: fkMetric,
      extraNote: null,
    },
    {
      key: 'postPlant',
      title: `Conversão de Pós-Plant${siteSuffix}`,
      subtitle:
        'Rounds vencidos pela equipe após plant válido da Spike realizado por integrante do elenco',
      metric: ppMetric,
      extraNote: state.filters.site
        ? `Restrito a plants no Site ${state.filters.site}`
        : 'Inclui todos os bomb sites (A, B, C)',
    },
  ];

  grid.innerHTML = cards
    .map((c) => {
      const m = c.metric;
      const isActive = state.metricKey === c.key;
      const losses = m.opportunities - m.wins;
      const hasData = m.opportunities > 0 && m.rate !== null;

      return `
        <button
          type="button"
          class="metric-card ${isActive ? 'active' : ''}"
          data-metric-key="${c.key}"
          aria-pressed="${isActive ? 'true' : 'false'}"
        >
          <div class="metric-card-top">
            <div>
              <h3 class="metric-card-title">${escapeHtml(c.title)}</h3>
              <p class="metric-card-subtitle">${escapeHtml(c.subtitle)}</p>
            </div>
            ${
              isActive
                ? `<span class="metric-active-pill">Indicador selecionado</span>`
                : `<span class="badge badge-neutral">Selecionar</span>`
            }
          </div>

          <div class="metric-value-row">
            <span class="metric-rate ${hasData ? '' : 'no-data'}">
              ${escapeHtml(formatRatePercent(m.rate))}
            </span>
            <span class="metric-fraction">
              ${
                hasData
                  ? `<strong>${m.wins}</strong> vitórias em <strong>${m.opportunities}</strong> oportunidades (${losses} ${
                      losses === 1 ? 'derrota' : 'derrotas'
                    })`
                  : `0 oportunidades registradas neste recorte (denominador zero)`
              }
            </span>
          </div>

          <div class="metric-badges">
            ${
              hasData
                ? `<span class="badge badge-win">✓ ${m.wins} ${
                    m.wins === 1 ? 'vitória' : 'vitórias'
                  }</span>
                   <span class="badge badge-loss">✕ ${losses} ${
                    losses === 1 ? 'derrota revisável' : 'derrotas revisáveis'
                  }</span>`
                : `<span class="badge badge-neutral">Sem ocorrências elegíveis</span>`
            }
            ${
              m.smallSample
                ? `<span class="badge badge-warn">⚠️ Amostra pequena (&lt; 10 oportunidades: ${m.opportunities})</span>`
                : `<span class="badge badge-neutral">Amostra: ${m.opportunities} oportunidades</span>`
            }
            ${
              m.excluded.length > 0
                ? `<span class="badge badge-neutral">${m.excluded.length} ${
                    m.excluded.length === 1 ? 'round excluído' : 'rounds excluídos'
                  } do denominador</span>`
                : ''
            }
          </div>
        </button>
      `;
    })
    .join('');

  grid.querySelectorAll('.metric-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextKey = btn.getAttribute('data-metric-key');
      if (state.metricKey !== nextKey) {
        state.metricKey = nextKey;
        renderApp();
      }
    });
  });
}

function describeEvidenceKeyEvent(round, match, metricKey) {
  const playerMap = getPlayerMapForMatch(match);
  if (metricKey === 'firstKill') {
    const fk = getFirstEligibleKillForRound(round);
    if (!fk) return '1ª eliminação não identificada';
    const killerName = playerMap.get(fk.killerId)?.name || fk.killerId;
    const victimName = playerMap.get(fk.victimId)?.name || fk.victimId;
    return `<span class="time-chip">${escapeHtml(
      formatTimeMs(fk.timeMs)
    )}</span> <strong>${escapeHtml(killerName)}</strong> eliminou <strong>${escapeHtml(
      victimName
    )}</strong>`;
  }

  const plant = round.plant;
  if (!plant) return 'Sem plant registrado';
  const planterName = playerMap.get(plant.planterId)?.name || plant.planterId || 'Desconhecido';
  const defuseNote =
    typeof plant.defuseTimeMs === 'number'
      ? ` · Desarme em ${formatTimeMs(plant.defuseTimeMs)}`
      : ' · Sem desarme';
  return `<span class="time-chip">${escapeHtml(
    formatTimeMs(plant.timeMs)
  )}</span> Plant no <strong>Site ${escapeHtml(
    plant.site || '?'
  )}</strong> por <strong>${escapeHtml(planterName)}</strong>${escapeHtml(defuseNote)}`;
}

function renderEvidenceList(activeMetric, roundLookup) {
  const titleEl = document.getElementById('evidence-panel-title');
  const subtitleEl = document.getElementById('evidence-panel-subtitle');
  const listContainer = document.getElementById('evidence-list-container');
  const excludedContainer = document.getElementById('excluded-rounds-container');

  const metricLabel =
    state.metricKey === 'firstKill'
      ? 'Conversão da 1ª Eliminação'
      : `Conversão de Pós-Plant${state.filters.site ? ` (Site ${state.filters.site})` : ''}`;

  const totalCount = activeMetric.evidence.length;
  const lostCount = activeMetric.evidence.filter((e) => !e.won).length;
  const wonCount = activeMetric.evidence.filter((e) => e.won).length;

  titleEl.textContent = `Situações Revisáveis — ${metricLabel}`;
  subtitleEl.textContent = `${totalCount} ${
    totalCount === 1 ? 'oportunidade sustentada' : 'oportunidades sustentadas'
  } pelos dados (${lostCount} ${lostCount === 1 ? 'derrota' : 'derrotas'}, ${wonCount} ${
    wonCount === 1 ? 'vitória' : 'vitórias'
  }).`;

  document.getElementById('tab-outcome-all').textContent = `Todos (${totalCount})`;
  document.getElementById('tab-outcome-lost').textContent = `Derrotas (${lostCount})`;
  document.getElementById('tab-outcome-won').textContent = `Vitórias (${wonCount})`;

  document.querySelectorAll('[data-outcome-filter]').forEach((btn) => {
    btn.classList.toggle(
      'active',
      btn.getAttribute('data-outcome-filter') === state.outcomeFilter
    );
  });

  const filteredEvidence = activeMetric.evidence.filter((ev) => {
    if (state.outcomeFilter === 'lost') return !ev.won;
    if (state.outcomeFilter === 'won') return ev.won;
    return true;
  });

  if (filteredEvidence.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <h3>Nenhuma situação encontrada para este filtro</h3>
        <p>
          ${
            activeMetric.opportunities === 0
              ? 'O recorte atual não possui oportunidades elegíveis para este indicador (denominador zero / sem dados).'
              : 'Não há rounds com o resultado selecionado neste indicador. Alterne para "Todos" acima.'
          }
        </p>
      </div>
    `;
  } else {
    const rowsHtml = filteredEvidence
      .map((ev) => {
        const round = roundLookup.get(ev.roundId);
        const match = matchesById.get(ev.matchId);
        if (!round || !match) return '';

        const isSelected = state.selectedRoundId === ev.roundId;
        const roleLabel = getTeamRoleLabel(round, state.filters.teamId);
        const opponent = match.teams.find((t) => t.id !== state.filters.teamId);
        const matchShort = `${qualifierLabel(match.source?.qualifier)} · vs ${
          opponent ? opponent.label : 'Adversário'
        } (${match.mapId})`;
        const eventSummaryHtml = describeEvidenceKeyEvent(round, match, state.metricKey);
        const resultBadge = ev.won
          ? `<span class="badge badge-win">✓ VITÓRIA</span>`
          : `<span class="badge badge-loss">✕ DERROTA</span>`;

        return `
          <tr
            class="evidence-row ${isSelected ? 'selected' : ''} ${
              ev.won ? 'win-row' : 'loss-row'
            }"
            data-round-id="${escapeHtml(ev.roundId)}"
            tabindex="0"
            role="button"
            aria-selected="${isSelected ? 'true' : 'false'}"
          >
            <td class="round-num-cell">Round ${round.number}</td>
            <td>${escapeHtml(matchShort)}</td>
            <td><span class="badge badge-neutral">${escapeHtml(roleLabel)}</span></td>
            <td class="event-summary-cell">${eventSummaryHtml}</td>
            <td>${resultBadge}</td>
            <td>
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-inspect-round"
                data-round-id="${escapeHtml(ev.roundId)}"
              >
                ${isSelected ? 'Aberto' : 'Ver round'}
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    listContainer.innerHTML = `
      <div class="evidence-table-wrapper">
        <table class="evidence-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Partida / Mapa</th>
              <th>Lado</th>
              <th>Evento que sustenta o indicador</th>
              <th>Resultado</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    listContainer.querySelectorAll('.evidence-row').forEach((row) => {
      const roundId = row.getAttribute('data-round-id');
      row.addEventListener('click', () => {
        state.selectedRoundId = roundId;
        renderApp();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.selectedRoundId = roundId;
          renderApp();
        }
      });
    });
  }

  if (activeMetric.excluded.length > 0) {
    excludedContainer.innerHTML = `
      <div class="excluded-box">
        <strong>Rounds excluídos do denominador (${activeMetric.excluded.length}):</strong>
        <ul>
          ${activeMetric.excluded
            .map(
              (ex) =>
                `<li><code>${escapeHtml(ex.roundId)}</code> — ${escapeHtml(ex.reason)}</li>`
            )
            .join('')}
        </ul>
      </div>
    `;
  } else {
    excludedContainer.innerHTML = '';
  }
}

function renderRoundDetail(roundLookup) {
  const panel = document.getElementById('round-detail-panel');

  if (!state.selectedRoundId) {
    panel.innerHTML = `
      <div class="empty-state">
        <h3>Nenhum round selecionado</h3>
        <p>
          Clique ou pressione Enter sobre qualquer situação na tabela ao lado para abrir os
          participantes, horários e a linha do tempo completa do round.
        </p>
      </div>
    `;
    return;
  }

  const round = roundLookup.get(state.selectedRoundId);
  const match = round ? matchesById.get(round.matchId) : null;

  if (!round || !match) {
    state.selectedRoundId = null;
    panel.innerHTML = '';
    return;
  }

  const playerMap = getPlayerMapForMatch(match);
  const teamWon = round.winnerTeamId === state.filters.teamId;
  const winnerLabel = getTeamLabel(round.winnerTeamId);
  const teamRole = getTeamRoleLabel(round, state.filters.teamId);
  const fk = getFirstEligibleKillForRound(round);

  let fkHtml = 'Nenhuma eliminação válida registrada';
  if (fk) {
    const killer = playerMap.get(fk.killerId);
    const victim = playerMap.get(fk.victimId);
    fkHtml = `${formatTimeMs(fk.timeMs)} (${fk.timeMs} ms) — ${
      killer ? `${killer.name} (${killer.teamLabel})` : fk.killerId
    } eliminou ${victim ? `${victim.name} (${victim.teamLabel})` : fk.victimId}`;
  }

  let plantHtml = 'Spike não plantada neste round';
  if (round.plant) {
    const planter = playerMap.get(round.plant.planterId);
    const planterText = planter
      ? `${planter.name} (${planter.teamLabel})`
      : round.plant.planterId || 'Autor não resolvido';
    const defuseText =
      typeof round.plant.defuseTimeMs === 'number'
        ? `Desarme em ${formatTimeMs(round.plant.defuseTimeMs)} (${round.plant.defuseTimeMs} ms)`
        : 'Sem desarme';
    plantHtml = `Site ${round.plant.site || '?'} em ${formatTimeMs(round.plant.timeMs)} (${
      round.plant.timeMs ?? '?'
    } ms) por ${planterText} · ${defuseText}`;
  }

  // Construir linha do tempo combinando kills deduplicadas + plant + desarme
  const timelineEvents = [];
  const uniqueKills = deduplicateKills(round.kills);

  for (const k of uniqueKills) {
    const isFk =
      fk &&
      k.killerId === fk.killerId &&
      k.victimId === fk.victimId &&
      k.timeMs === fk.timeMs;
    const killer = playerMap.get(k.killerId);
    const victim = playerMap.get(k.victimId);
    timelineEvents.push({
      timeMs: k.timeMs ?? 0,
      type: isFk ? 'first-kill' : 'kill',
      html: `
        ${isFk ? `<span class="badge badge-neutral">1ª ELIMINAÇÃO</span> ` : ''}
        <strong>${escapeHtml(killer ? killer.name : k.killerId || 'Desconhecido')}</strong>
        <span class="label-hint">(${escapeHtml(killer ? killer.teamLabel : '—')})</span>
        eliminou
        <strong>${escapeHtml(victim ? victim.name : k.victimId || 'Desconhecido')}</strong>
        <span class="label-hint">(${escapeHtml(victim ? victim.teamLabel : '—')})</span>
      `,
    });
  }

  if (round.plant && typeof round.plant.timeMs === 'number') {
    const planter = playerMap.get(round.plant.planterId);
    timelineEvents.push({
      timeMs: round.plant.timeMs,
      type: 'plant',
      html: `
        <span class="badge badge-warn">PLANT SITE ${escapeHtml(
          round.plant.site || '?'
        )}</span>
        Spike plantada por <strong>${escapeHtml(
          planter ? planter.name : round.plant.planterId || 'Desconhecido'
        )}</strong>
        <span class="label-hint">(${escapeHtml(planter ? planter.teamLabel : '—')})</span>
      `,
    });

    if (typeof round.plant.defuseTimeMs === 'number') {
      timelineEvents.push({
        timeMs: round.plant.defuseTimeMs,
        type: 'defuse',
        html: `
          <span class="badge badge-win">DESARME</span>
          Spike desarmada com sucesso
        `,
      });
    }
  }

  timelineEvents.sort((a, b) => a.timeMs - b.timeMs);

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="metric-badges" style="margin-bottom: 6px;">
          <span class="badge ${teamWon ? 'badge-win' : 'badge-loss'}">
            ${teamWon ? '✓ VITÓRIA DA EQUIPE NO ROUND' : '✕ DERROTA DA EQUIPE NO ROUND'}
          </span>
          <span class="badge badge-neutral">Lado: ${escapeHtml(teamRole)}</span>
          <span class="badge badge-neutral">Mapa: ${escapeHtml(match.mapId)}</span>
        </div>
        <h2 class="panel-title">
          Round ${round.number} — ${escapeHtml(getMatchScoreLabel(match, state.filters.teamId))}
        </h2>
        <p class="panel-subtitle">
          Arquivo oficial: <code>${escapeHtml(match.source?.file)}</code> · Vencedor oficial:
          <strong>${escapeHtml(winnerLabel)}</strong>
        </p>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          id="btn-close-detail"
          title="Fechar inspeção do round (Esc)"
        >
          Fechar detalhe
        </button>
      </div>
    </div>

    <div class="detail-section">
      <h3 class="detail-section-title">Resumo de Eventos-Chave do Round</h3>
      <div class="kv-grid">
        <div class="kv-card">
          <div class="kv-label">Primeira Eliminação Elegível</div>
          <div class="kv-value">${escapeHtml(fkHtml)}</div>
        </div>
        <div class="kv-card">
          <div class="kv-label">Plant / Desarme da Spike</div>
          <div class="kv-value">${escapeHtml(plantHtml)}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3 class="detail-section-title">Participantes na Partida</h3>
      <div class="rosters-grid">
        ${match.teams
          .map((t) => {
            const isFocus = t.id === state.filters.teamId;
            const roleInRound = getTeamRoleLabel(round, t.id);
            return `
              <div class="roster-box">
                <div class="roster-box-title">
                  ${escapeHtml(t.label)} ${isFocus ? ' (Equipe analisada)' : ''} · ${escapeHtml(
                    roleInRound
                  )}
                </div>
                <ul class="roster-list">
                  ${t.players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join('')}
                </ul>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>

    <div class="detail-section">
      <h3 class="detail-section-title">
        Linha do Tempo de Eventos (${timelineEvents.length})
      </h3>
      ${
        timelineEvents.length === 0
          ? `<p class="panel-subtitle">Nenhum evento cronológico registrado neste round.</p>`
          : `<ol class="timeline-list">
              ${timelineEvents
                .map(
                  (ev) => `
                <li class="timeline-item ${
                  ev.type === 'first-kill'
                    ? 'highlight-first-kill'
                    : ev.type === 'plant'
                      ? 'highlight-plant'
                      : ev.type === 'defuse'
                        ? 'highlight-defuse'
                        : ''
                }">
                  <span class="timeline-time">${escapeHtml(formatTimeMs(ev.timeMs))}</span>
                  <div>${ev.html}</div>
                </li>
              `
                )
                .join('')}
            </ol>`
      }
    </div>
  `;

  const closeBtn = document.getElementById('btn-close-detail');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      state.selectedRoundId = null;
      renderApp();
    });
  }
}

function renderApp() {
  populateFilterControls();

  const filteredRounds = selectRounds(allMatches, state.filters);
  const filteredMatchIds = new Set(filteredRounds.map((r) => r.matchId));
  const filteredMatches = allMatches.filter((m) => filteredMatchIds.has(m.id));

  const roundLookup = new Map();
  for (const r of filteredRounds) {
    roundLookup.set(r.id, r);
  }

  const fkMetric = firstKillConversion(filteredRounds, state.filters.teamId);
  const ppMetric = postPlantConversion(
    filteredRounds,
    state.filters.teamId,
    state.filters.site || undefined
  );

  const activeMetric = state.metricKey === 'firstKill' ? fkMetric : ppMetric;

  reconcileIncompatibleRoundSelection(activeMetric);

  renderScopeSummary(filteredMatches, filteredRounds);
  renderMetricCards(fkMetric, ppMetric);
  renderEvidenceList(activeMetric, roundLookup);
  renderRoundDetail(roundLookup);
}

function bindGlobalEvents() {
  document.getElementById('filter-team').addEventListener('change', (e) => {
    state.filters.teamId = e.target.value;
    state.filters.matchId = '';
    renderApp();
  });

  document.getElementById('filter-qualifier').addEventListener('change', (e) => {
    state.filters.qualifier = e.target.value;
    renderApp();
  });

  document.getElementById('filter-map').addEventListener('change', (e) => {
    state.filters.mapId = e.target.value;
    renderApp();
  });

  document.getElementById('filter-match').addEventListener('change', (e) => {
    state.filters.matchId = e.target.value;
    renderApp();
  });

  document.getElementById('filter-site').addEventListener('change', (e) => {
    state.filters.site = e.target.value;
    renderApp();
  });

  document.getElementById('btn-preset-c1').addEventListener('click', () => {
    state.filters = { ...C1_REFERENCE_PRESET };
    state.metricKey = 'firstKill';
    state.outcomeFilter = 'all';
    state.selectedRoundId = 'fc187928-9b72-42b3-aaaf-8ca6689a3937:r16';
    renderApp();
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    state.filters = {
      teamId: state.filters.teamId || 'poli-plague',
      qualifier: '',
      mapId: '',
      matchId: '',
      site: '',
    };
    renderApp();
  });

  document.querySelectorAll('[data-outcome-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.outcomeFilter = btn.getAttribute('data-outcome-filter');
      renderApp();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selectedRoundId) {
      state.selectedRoundId = null;
      renderApp();
    }
  });
}

async function init() {
  const banner = document.getElementById('status-banner');
  bindGlobalEvents();

  try {
    const res = await fetch('./data/matches.json');
    if (!res.ok) {
      throw new Error(`Falha ao carregar matches.json (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Conjunto de partidas vazio ou inválido.');
    }

    allMatches = data;
    buildDirectories(allMatches);
    banner.classList.add('hidden');
    renderApp();
  } catch (err) {
    banner.classList.remove('hidden');
    banner.classList.add('error');
    banner.textContent = `Erro ao carregar dados derivados: ${err.message}. Execute "npm run import" antes de iniciar o servidor.`;
  }
}

init();
