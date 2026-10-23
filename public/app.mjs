import {
  selectRounds,
  firstKillConversion,
  postPlantConversion,
  deduplicateKills,
} from './lib/metrics.mjs';
import {
  addEvidence,
  removeEvidence,
  createAgendaItem,
  formatAgenda,
  getMetricLabel,
} from './lib/agenda.mjs';
import { loadMatchDataset, saveAgenda, loadSavedAgenda, searchEvidence, AGENDA_STORAGE_KEY } from './lib/review.mjs';

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
  copyFeedback: null,
  showManualCopyFallback: false,
  searchQuery: '',
  storageStatus: 'empty',
  storageDropped: 0,
};

let allMatches = [];
let matchesById = new Map();
let teamsDirectory = [];
let allMaps = [];
let feedbackTimer;
let previousDetailId = null;
let previousAgendaCount = 0;
let eventsBound = false;
let loading = false;
let agendaLoaded = false;
let clearedAgenda = [];
let agendaStorage;
try { agendaStorage = window.localStorage; } catch { /* Storage may be disabled. */ }

function persistAgenda() {
  state.storageStatus = saveAgenda(agendaStorage, state.agenda) ? 'saved' : 'unavailable';
  state.storageDropped = 0;
}

function visibleEvidence(metric, roundLookup) {
  const byOutcome = metric.evidence.filter(ev => state.outcomeFilter === 'lost' ? !ev.won : state.outcomeFilter === 'won' ? ev.won : true);
  return searchEvidence(byOutcome, state.searchQuery, roundLookup, matchesById);
}

function restoreSavedEvidence(ref) {
  const match = matchesById.get(ref.matchId);
  const round = match?.rounds.find(r => r.id === ref.roundId);
  if (!round || !match.teams.some(t => t.id === ref.teamId)) return null;
  const metric = ref.metricKey === 'firstKill' ? firstKillConversion([round],ref.teamId) : postPlantConversion([round],ref.teamId);
  if (!metric.evidence.some(ev => ev.roundId === ref.roundId)) return null;
  return buildAgendaItem(round,match,ref.metricKey,ref.teamId);
}

function motionAllowed() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function announceAction(message) {
  const feedback = document.getElementById('action-feedback');
  feedback.textContent = message;
  feedback.classList.add('visible');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => feedback.classList.remove('visible'), 2800);
}

function revealRound(roundId) {
  state.selectedRoundId = roundId;
  renderApp();
  const detail = document.getElementById('round-detail-panel');
  // At the single-column breakpoint the detail sits below the evidence list.
  if (window.matchMedia('(max-width: 1220px)').matches) {
    detail.scrollIntoView({ behavior: motionAllowed() ? 'smooth' : 'instant', block: 'start' });
  }
  const close = document.getElementById('btn-close-detail');
  close?.focus({ preventScroll: true });
}

function renderTacticalOverview(filteredMatches, filteredRounds, metric) {
  const label = getTeamLabel(state.filters.teamId);
  document.getElementById('team-heading').textContent = label;
  document.getElementById('team-context').textContent = `${filteredMatches.length} ${filteredMatches.length === 1 ? 'partida' : 'partidas'} · ${filteredRounds.length} rounds no recorte. Encontre um padrão e transforme a revisão em treino.`;
  document.getElementById('rail-agenda-count').textContent = state.agenda.length;
  const lost = metric.opportunities - metric.wins;
  const prompt = document.getElementById('review-prompt');
  const context = state.metricKey === 'firstKill' ? 'após a primeira eliminação da equipe' : 'após o plant da equipe';
  prompt.innerHTML = `
    <span class="review-symbol" aria-hidden="true">↗</span>
    <div class="review-copy"><strong>${lost > 0 ? `${lost} ${lost === 1 ? 'round para revisar' : 'rounds para revisar'} ${context}` : metric.opportunities ? 'Todas as oportunidades deste recorte foram convertidas' : 'Ainda não há oportunidades neste recorte'}</strong>
    <p>${lost > 0 ? 'Veja como esses rounds terminaram. Os eventos ajudam a orientar a conversa com a equipe.' : metric.opportunities ? 'Explore as vitórias para discutir o que repetir no próximo treino.' : 'Experimente outra partida, mapa ou classificatória para ampliar a análise.'}</p></div>
    <button class="btn" id="btn-review-evidence" ${metric.opportunities ? '' : 'disabled'}>${lost > 0 ? 'Revisar derrotas' : metric.opportunities ? 'Explorar vitórias' : 'Sem evidências'} <span aria-hidden="true">↗</span></button>`;
  document.getElementById('btn-review-evidence').addEventListener('click', () => {
    state.outcomeFilter = lost > 0 ? 'lost' : 'won';
    state.searchQuery = '';
    state.selectedRoundId = null;
    renderApp();
    document.getElementById('evidencias').scrollIntoView({ behavior: motionAllowed() ? 'smooth' : 'instant' });
    document.getElementById(lost > 0 ? 'tab-outcome-lost' : 'tab-outcome-won').focus({ preventScroll: true });
  });
}

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

function describeEvidencePlainText(round, match, metricKey) {
  const playerMap = getPlayerMapForMatch(match);
  if (metricKey === 'firstKill') {
    const fk = getFirstEligibleKillForRound(round);
    if (!fk) return '1ª eliminação não identificada';
    const killerName = playerMap.get(fk.killerId)?.name || fk.killerId;
    const victimName = playerMap.get(fk.victimId)?.name || fk.victimId;
    return `1ª eliminação em ${formatTimeMs(fk.timeMs)} (${fk.timeMs} ms) por ${killerName} sobre ${victimName}`;
  }

  const plant = round.plant;
  if (!plant) return 'sem plant registrado';
  const planterName = playerMap.get(plant.planterId)?.name || plant.planterId || 'Desconhecido';
  const defuseNote =
    typeof plant.defuseTimeMs === 'number'
      ? `, com desarme em ${formatTimeMs(plant.defuseTimeMs)} (${plant.defuseTimeMs} ms)`
      : ', sem desarme';
  return `plant no Site ${plant.site || '?'} em ${formatTimeMs(plant.timeMs)} (${plant.timeMs} ms) por ${planterName}${defuseNote}`;
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

function isRoundInAgenda(metricKey, roundId) {
  return state.agenda.some(
    (item) => item.metricKey === metricKey && item.roundId === roundId && item.teamId === state.filters.teamId
  );
}

function buildAgendaItem(round, match, metricKey, teamId) {
  const teamLabel = getTeamLabel(teamId);
  const won = round.winnerTeamId === teamId;
  const roleLabel = getTeamRoleLabel(round, teamId);
  const eventSummary = describeEvidencePlainText(round, match, metricKey);

  return createAgendaItem({
    metricKey,
    teamId,
    teamLabel,
    matchId: match.id,
    roundId: round.id,
    roundNumber: round.number,
    won,
    mapId: match.mapId,
    qualifier: match.source?.qualifier || '',
    file: match.source?.file || '',
    roleLabel,
    eventSummary,
    site: round.plant?.site || state.filters.site || '',
  });
}

function handleAddRoundToAgenda(round, match, metricKey) {
  if (!round || !match) return;
  const item = buildAgendaItem(round, match, metricKey, state.filters.teamId);
  state.agenda = addEvidence(state.agenda, item);
  persistAgenda();
  state.copyFeedback = null;
  renderApp();
  announceAction(`Round ${round.number} adicionado à pauta de treino`);
}

function reconcileIncompatibleRoundSelection(activeMetric, roundLookup) {
  if (!state.selectedRoundId) return;

  const candidates = visibleEvidence(activeMetric, roundLookup);

  const stillCompatible = candidates.some((ev) => ev.roundId === state.selectedRoundId);
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
      <span class="scope-pill"><strong>${state.agenda.length}</strong> ${
        state.agenda.length === 1 ? 'item na pauta' : 'itens na pauta'
      }</span>
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
    },
    {
      key: 'postPlant',
      title: `Conversão de Pós-Plant${siteSuffix}`,
      subtitle:
        'Rounds vencidos pela equipe após plant válido da Spike realizado por integrante do elenco',
      metric: ppMetric,
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
                ? `<span class="metric-active-pill">Em análise ↗</span>`
                : `<span class="badge badge-neutral">Explorar ↗</span>`
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

          <div class="conversion-track" aria-hidden="true"><span style="width: ${hasData ? m.rate * 100 : 0}%"></span><i></i></div>

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
                ? `<span class="badge badge-warn">Amostra pequena · ${m.opportunities} oportunidades</span>`
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

  titleEl.textContent = metricLabel;
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
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-outcome-filter') === state.outcomeFilter));
  });

  const filteredEvidence = visibleEvidence(activeMetric, roundLookup);
  const queryInput = document.getElementById('evidence-query');
  if (queryInput.value !== state.searchQuery) queryInput.value = state.searchQuery;
  document.getElementById('btn-clear-search').hidden = !state.searchQuery;
  document.getElementById('evidence-search-count').textContent = `${filteredEvidence.length} ${filteredEvidence.length === 1 ? 'round exibido' : 'rounds exibidos'} · A busca não altera os indicadores`;

  if (filteredEvidence.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <h3>Nenhuma situação encontrada para este filtro</h3>
        <p>
          ${
            activeMetric.opportunities === 0
              ? 'O recorte atual não possui oportunidades elegíveis para este indicador (denominador zero / sem dados).'
              : state.searchQuery ? 'Nenhum round corresponde à busca neste resultado. Limpe a busca ou alterne para “Todos”.' : 'Não há rounds com o resultado selecionado neste indicador. Alterne para "Todos" acima.'
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
        const inAgenda = isRoundInAgenda(state.metricKey, ev.roundId);
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
            role="row"
            aria-selected="${isSelected ? 'true' : 'false'}"
            aria-label="Round ${round.number}, ${escapeHtml(matchShort)}, ${ev.won ? 'vitória' : 'derrota'} — abrir evidências"
          >
            <td class="round-num-cell">Round ${round.number}</td>
            <td>${escapeHtml(matchShort)}<span class="evidence-role">${escapeHtml(roleLabel)}</span></td>
            <td><span class="badge badge-neutral">${escapeHtml(roleLabel)}</span></td>
            <td class="event-summary-cell">${eventSummaryHtml}</td>
            <td>${resultBadge}</td>
            <td style="white-space: nowrap;">
              <button
                type="button"
                class="btn btn-secondary btn-sm btn-inspect-round"
                data-round-id="${escapeHtml(ev.roundId)}"
                aria-label="Abrir round ${round.number} contra ${escapeHtml(opponent?.label || 'adversário')}"
              >
                <span aria-hidden="true">${isSelected ? '●' : '↗'}</span>
              </button>
              <button
                type="button"
                class="btn ${inAgenda ? 'btn-ghost' : 'btn-primary'} btn-sm btn-add-agenda"
                data-round-id="${escapeHtml(ev.roundId)}"
                ${inAgenda ? 'disabled' : ''}
              >
                ${inAgenda ? '✓ Na pauta' : '+ Pauta'}
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
              <th scope="col">Round</th>
              <th scope="col">Partida / Mapa</th>
              <th scope="col">Lado</th>
              <th scope="col">Evento que sustenta o indicador</th>
              <th scope="col">Resultado</th>
              <th scope="col">Ações</th>
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
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-add-agenda')) return;
        revealRound(roundId);
      });
      row.addEventListener('keydown', (e) => {
        if (e.target.closest('.btn-add-agenda')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          revealRound(roundId);
        }
      });
    });

    listContainer.querySelectorAll('.btn-add-agenda').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roundId = btn.getAttribute('data-round-id');
        const round = roundLookup.get(roundId);
        const match = round ? matchesById.get(round.matchId) : null;
        handleAddRoundToAgenda(round, match, state.metricKey);
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
  const inAgenda = isRoundInAgenda(state.metricKey, round.id);
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
        <div class="round-ribbon" aria-label="Resultados dos rounds da partida">
          ${match.rounds.map((r) => `<span class="${r.winnerTeamId === state.filters.teamId ? 'win' : 'loss'} ${r.id === round.id ? 'current' : ''}" title="Round ${r.number}: ${r.winnerTeamId === state.filters.teamId ? 'vitória' : 'derrota'}" aria-label="Round ${r.number}: ${r.winnerTeamId === state.filters.teamId ? 'vitória' : 'derrota'}${r.id === round.id ? ', selecionado' : ''}">${r.number}<small aria-hidden="true">${r.winnerTeamId === state.filters.teamId ? '✓' : '×'}</small></span>`).join('')}
        </div>
        <div class="ribbon-caption"><span>SEQUÊNCIA DA PARTIDA</span><span>✓ Vitória · ✕ Derrota</span></div>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button
          type="button"
          class="btn ${inAgenda ? 'btn-secondary' : 'btn-primary'} btn-sm"
          id="btn-detail-add-agenda"
          ${inAgenda ? 'disabled' : ''}
        >
          ${inAgenda ? '✓ Adicionado à pauta' : '+ Adicionar à pauta de treino'}
        </button>
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

  const addBtn = document.getElementById('btn-detail-add-agenda');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      handleAddRoundToAgenda(round, match, state.metricKey);
    });
  }

  const closeBtn = document.getElementById('btn-close-detail');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      state.selectedRoundId = null;
      renderApp();
      document.getElementById('tab-outcome-all').focus({ preventScroll: true });
    });
  }
}

function renderAgendaSection() {
  const section = document.getElementById('agenda-section');
  const formattedText = formatAgenda(state.agenda);
  const hasItems = state.agenda.length > 0;

  section.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="panel-title">
          Pauta de Revisão e Treino (${state.agenda.length} ${
            state.agenda.length === 1 ? 'evidência selecionada' : 'evidências selecionadas'
          })
        </h2>
        <p class="panel-subtitle">
          Distingue explicitamente <strong>observações factuais dos dados</strong> de
          <strong>hipóteses de exercício para avaliação do treinador</strong>.
        </p>
      </div>
      <div class="topbar-actions no-print">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          id="btn-copy-agenda"
          ${hasItems ? '' : 'disabled'}
        >
          Copiar resumo da pauta
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          id="btn-download-agenda"
          ${hasItems ? '' : 'disabled'}
        >
          Baixar pauta (.txt)
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          id="btn-print-agenda"
          ${hasItems ? '' : 'disabled'}
        >
          Imprimir pauta
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          id="btn-clear-agenda"
          ${hasItems ? '' : 'disabled'}
        >
          Limpar pauta
        </button>
      </div>
    </div>

    <p class="agenda-save-state ${state.storageStatus === 'unavailable' || state.storageStatus === 'invalid' ? 'save-warning' : ''}" role="status">${state.storageStatus === 'unavailable' ? 'Não foi possível salvar neste navegador. A pauta permanece nesta aba: baixe ou copie antes de sair.' : state.storageStatus === 'invalid' ? 'A pauta salva não pôde ser restaurada. Você pode criar uma nova pauta ou usar uma cópia exportada.' : state.storageDropped ? `Pauta restaurada. ${state.storageDropped} referência(s) indisponível(is) na base atual foram ignoradas.` : '✓ Pauta salva neste navegador · Não é sincronizada com outros dispositivos'}</p>
    ${clearedAgenda.length ? '<button type="button" class="btn btn-secondary btn-sm no-print" id="btn-undo-clear">↶ Desfazer limpeza da pauta</button>' : ''}

    ${
      state.copyFeedback
        ? `<div id="agenda-copy-feedback" class="excluded-box no-print" style="margin-bottom: 12px;">
            ${escapeHtml(state.copyFeedback)}
          </div>`
        : ''
    }

    ${
      !hasItems
        ? `<div class="empty-state">
            <h3>A pauta de treino está vazia</h3>
            <p>
              Use o botão <strong>"+ Pauta"</strong> na tabela de situações revisáveis ou no
              detalhe de um round para compor a pauta de revisão pós-partida.
            </p>
          </div>`
        : `<div class="agenda-items-list">
            ${state.agenda
              .map(
                (item, idx) => `
              <article class="agenda-card" data-agenda-round="${escapeHtml(item.roundId)}" data-agenda-metric="${escapeHtml(item.metricKey)}">
                <div class="agenda-card-header">
                  <div>
                    <span class="badge badge-neutral">${escapeHtml(
                      getMetricLabel(item.metricKey)
                    )}</span>
                    <strong style="margin-left: 6px;">
                      ${idx + 1}. ${escapeHtml(item.teamLabel)} — Round ${item.roundNumber}
                    </strong>
                    <span class="label-hint" style="margin-left: 6px;">
                      (Partida: <code>${escapeHtml(item.matchId)}</code> · Round ID:
                      <code>${escapeHtml(item.roundId)}</code>)
                    </span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-remove-agenda no-print"
                    data-metric-key="${escapeHtml(item.metricKey)}"
                    data-round-id="${escapeHtml(item.roundId)}"
                    data-team-id="${escapeHtml(item.teamId || item.teamLabel)}"
                  >
                    Remover
                  </button>
                </div>

                <div class="agenda-card-body">
                  <div class="agenda-block">
                    <div class="agenda-block-label">Observação (dados da partida)</div>
                    <div>${escapeHtml(item.observation)}</div>
                  </div>
                  <div class="agenda-block">
                    <div class="agenda-block-label">Pergunta de revisão tática</div>
                    <div>${escapeHtml(item.reviewQuestion)}</div>
                  </div>
                  <div class="agenda-block">
                    <div class="agenda-block-label">Hipótese de exercício (avaliação do treinador)</div>
                    <div>${escapeHtml(item.suggestedExercise)}</div>
                  </div>
                </div>
              </article>
            `
              )
              .join('')}
          </div>

          <div class="agenda-export-area no-print">
            <label for="agenda-export-textarea" class="detail-section-title" style="display: block;">
              Texto consolidado para cópia manual ou exportação
            </label>
            <textarea
              id="agenda-export-textarea"
              class="agenda-textarea"
              readonly
              aria-label="Texto selecionável da pauta de treino"
            >${escapeHtml(formattedText)}</textarea>
          </div>`
    }
  `;

  section.querySelectorAll('.btn-remove-agenda').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mKey = btn.getAttribute('data-metric-key');
      const rId = btn.getAttribute('data-round-id');
      state.agenda = removeEvidence(state.agenda, mKey, rId, btn.getAttribute('data-team-id'));
      persistAgenda();
      state.copyFeedback = null;
      renderApp();
    });
  });

  const copyBtn = document.getElementById('btn-copy-agenda');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          throw new Error('Clipboard API indisponível');
        }
        await navigator.clipboard.writeText(formattedText);
        state.copyFeedback = '✓ Pauta copiada para a área de transferência com sucesso.';
        state.showManualCopyFallback = false;
        renderApp();
      } catch {
        state.copyFeedback =
          '⚠️ Área de transferência automática indisponível neste contexto. O texto completo abaixo foi selecionado automaticamente para cópia manual (Ctrl+C):';
        state.showManualCopyFallback = true;
        renderApp();
        const textarea = document.getElementById('agenda-export-textarea');
        if (textarea) {
          textarea.focus();
          textarea.select();
        }
      }
    });
  }

  const printBtn = document.getElementById('btn-print-agenda');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  document.getElementById('btn-download-agenda').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', formattedText], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roundlab-pauta-de-treino.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announceAction('Arquivo da pauta preparado para download');
  });

  const clearBtn = document.getElementById('btn-clear-agenda');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearedAgenda = [...state.agenda];
      state.agenda = [];
      persistAgenda();
      state.copyFeedback = null;
      renderApp();
    });
  }
  document.getElementById('btn-undo-clear')?.addEventListener('click', () => {
    for (const item of clearedAgenda) state.agenda = addEvidence(state.agenda,item);
    clearedAgenda = [];
    persistAgenda();
    renderApp();
    announceAction('Pauta de treino restaurada');
  });
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

  reconcileIncompatibleRoundSelection(activeMetric, roundLookup);

  renderScopeSummary(filteredMatches, filteredRounds);
  renderMetricCards(fkMetric, ppMetric);
  renderEvidenceList(activeMetric, roundLookup);
  renderRoundDetail(roundLookup);
  renderAgendaSection();
  renderTacticalOverview(filteredMatches, filteredRounds, activeMetric);
  if (motionAllowed() && typeof Element.prototype.animate === 'function') {
    if (state.selectedRoundId && state.selectedRoundId !== previousDetailId) {
      document.getElementById('round-detail-panel').animate(
        [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 250, easing: 'cubic-bezier(.22,.8,.25,1)' }
      );
    }
    if (state.agenda.length > previousAgendaCount) {
      document.getElementById('rail-agenda-count').animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.4)', color: '#ff7765' }, { transform: 'scale(1)' }],
        { duration: 280 }
      );
    }
  }
  previousDetailId = state.selectedRoundId;
  previousAgendaCount = state.agenda.length;
}

function bindGlobalEvents() {
  document.getElementById('evidence-query').addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderApp();
  });
  document.getElementById('btn-clear-search').addEventListener('click', () => {
    state.searchQuery = '';
    renderApp();
    document.getElementById('evidence-query').focus();
  });
  document.getElementById('btn-methodology').addEventListener('click', () => {
    document.getElementById('methodology-dialog').showModal();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== AGENDA_STORAGE_KEY || !allMatches.length) return;
    const restored = loadSavedAgenda(agendaStorage,restoreSavedEvidence);
    state.agenda = restored.agenda;
    state.storageStatus = restored.status;
    state.storageDropped = restored.dropped;
    renderApp();
    announceAction('Pauta atualizada em outra aba deste navegador');
  });
  document.getElementById('btn-toggle-filters').addEventListener('click', (event) => {
    const expanded = document.querySelector('.filters-panel').classList.toggle('filters-open');
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
    event.currentTarget.textContent = expanded ? 'Fechar filtros ↑' : 'Refinar recorte ↓';
  });
  const navLinks = [...document.querySelectorAll('.rail-link')];
  navLinks.forEach((link) => link.addEventListener('click', () => {
    navLinks.forEach((item) => item.classList.toggle('active', item === link));
  }));
  if ('IntersectionObserver' in window) {
    const navigationObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      const id = visible.target.id;
      document.querySelectorAll('.rail-link, .mobile-flow a').forEach((link) => {
        const active = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      document.querySelector('.header-current').textContent = id === 'agenda-section' ? 'Pauta de treino' : id === 'evidencias' ? 'Revisão de rounds' : 'Visão da equipe';
    }, { rootMargin: '-90px 0px -35% 0px', threshold: 0 });
    ['diagnostico', 'evidencias', 'agenda-section'].forEach((id) => navigationObserver.observe(document.getElementById(id)));
  }
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
    state.searchQuery = '';
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
    if (document.getElementById('methodology-dialog').open) return;
    if (e.key === 'Escape' && state.selectedRoundId) {
      state.selectedRoundId = null;
      renderApp();
    }
  });
}

async function init() {
  if (loading) return;
  loading = true;
  const banner = document.getElementById('status-banner');
  banner.classList.remove('hidden', 'error');
  banner.textContent = 'Abrindo a base oficial de partidas…';

  try {
    if (!eventsBound) { bindGlobalEvents(); eventsBound = true; }
    const data = await loadMatchDataset();

    allMatches = data;
    buildDirectories(allMatches);
    document.getElementById('corpus-summary').textContent = `${allMatches.length} partidas oficiais das Classificatórias 1 a 4 do Univavá. Cada indicador pode ser conferido nos rounds que o sustentam.`;
    if (!agendaLoaded) {
      const restored = loadSavedAgenda(agendaStorage,restoreSavedEvidence);
      state.agenda = restored.agenda;
      state.storageStatus = restored.status;
      state.storageDropped = restored.dropped;
      agendaLoaded = true;
    }
    banner.classList.add('hidden');
    renderApp();
  } catch (err) {
    banner.classList.remove('hidden');
    banner.classList.add('error');
    const message = /^(Dados indisponíveis|Conjunto de partidas|O carregamento demorou)/.test(err.message) ? err.message : 'O carregamento foi interrompido. Tente novamente ou recarregue esta página.';
    banner.innerHTML = `<div><strong>Não foi possível abrir as partidas.</strong><p>${escapeHtml(message)}</p></div><button type="button" class="btn btn-secondary" id="btn-retry-data">Tentar novamente ↻</button>`;
    document.getElementById('btn-retry-data').addEventListener('click', init);
  } finally {
    loading = false;
  }
}

init();
