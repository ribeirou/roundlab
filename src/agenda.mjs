const METRIC_LABELS = {
  firstKill: 'Conversão da 1ª Eliminação',
  postPlant: 'Conversão de Pós-Plant',
};

export function getMetricLabel(metricKey) {
  return METRIC_LABELS[metricKey] || metricKey || 'Indicador';
}

export function createAgendaItem({
  metricKey,
  teamId = '',
  teamLabel,
  matchId,
  roundId,
  roundNumber,
  won = false,
  mapId = '',
  qualifier = '',
  file = '',
  roleLabel = 'Não identificado',
  eventSummary = '',
  site = '',
} = {}) {
  const outcomeText = won ? 'vitória no round' : 'derrota no round';
  const qualPrefix = qualifier ? `${String(qualifier).toUpperCase()} · ` : '';
  const mapPrefix = mapId ? `Mapa ${mapId} · ` : '';
  const fileRef = file ? ` [arquivo: ${file}]` : '';

  const observation =
    `Partida ${matchId} (${qualPrefix}${mapPrefix}Round ${roundNumber}, lado ${roleLabel})${fileRef}: ` +
    `${teamLabel} registrou ${eventSummary || 'evento do indicador'} e teve ${outcomeText}.`;

  let reviewQuestion;
  let suggestedExercise;

  if (metricKey === 'postPlant') {
    const siteHint = site ? ` no Site ${site}` : '';
    reviewQuestion = won
      ? `Quais posições pós-plant${siteHint} e trocas de informação sustentaram a conversão deste round para replicar no plano tático?`
      : `Após o plant${siteHint}, como estavam distribuídos os ângulos de contenção, recursos restantes e tempo de reação ao retake adversário?`;
    suggestedExercise =
      `Hipótese para avaliação do treinador (não comprovada isoladamente pelos dados): ` +
      `treino situacional de pós-plant${siteHint} em superioridade/igualdade numérica com protocolo de posicionamento cruzado e uso escalonado de utilitários para atrasar o desarme.`;
  } else {
    reviewQuestion = won
      ? `Como a equipe estabilizou espaço e comunicou a vantagem após a primeira eliminação neste round (${roleLabel})?`
      : `Após conquistar a primeira eliminação (${roleLabel}), houve busca por duelos isolados sem suporte de troca ou falha na reagrupação tática?`;
    suggestedExercise =
      `Hipótese para avaliação do treinador (não comprovada isoladamente pelos dados): ` +
      `simulação de round 5v4 imediatamente após a 1ª eliminação, treinando chamada de desaceleração/reagrupamento e proibição de avanço individual sem parceiro de trade.`;
  }

  return {
    metricKey,
    teamId,
    teamLabel,
    matchId,
    roundId,
    roundNumber,
    observation,
    reviewQuestion,
    suggestedExercise,
  };
}

export function addEvidence(agenda, item) {
  const current = Array.isArray(agenda) ? [...agenda] : [];
  if (!item || !item.metricKey || !item.roundId) {
    return current;
  }

  const exists = current.some(
    (entry) => entry.metricKey === item.metricKey && entry.roundId === item.roundId &&
      (entry.teamId || entry.teamLabel) === (item.teamId || item.teamLabel)
  );
  if (exists) {
    return current;
  }

  let normalizedExercise = String(item.suggestedExercise || '').trim();
  if (
    normalizedExercise &&
    !normalizedExercise.toLowerCase().includes('hipótese') &&
    !normalizedExercise.toLowerCase().includes('hipotese')
  ) {
    normalizedExercise = `Hipótese para avaliação do treinador: ${normalizedExercise}`;
  }

  return [
    ...current,
    {
      metricKey: item.metricKey,
      teamId: item.teamId ?? '',
      teamLabel: item.teamLabel ?? '',
      matchId: item.matchId ?? '',
      roundId: item.roundId,
      roundNumber: item.roundNumber ?? 1,
      observation: item.observation ?? '',
      reviewQuestion: item.reviewQuestion ?? '',
      suggestedExercise: normalizedExercise,
    },
  ];
}

export function removeEvidence(agenda, metricKey, roundId, teamId) {
  if (!Array.isArray(agenda)) return [];
  return agenda.filter(
    (entry) => !(entry.metricKey === metricKey && entry.roundId === roundId &&
      (teamId === undefined || (entry.teamId || entry.teamLabel) === teamId))
  );
}

export function formatAgenda(agenda) {
  if (!Array.isArray(agenda) || agenda.length === 0) {
    return 'PAUTA DE REVISÃO E TREINO — ROUNDLAB\nNenhuma evidência adicionada à pauta.';
  }

  const lines = [
    '============================================================',
    'PAUTA DE REVISÃO E TREINO PÓS-PARTIDA — ROUNDLAB',
    'Nota metodológica: Observações descrevem eventos registrados nos JSONs oficiais.',
    'Exercícios sugeridos são hipóteses para avaliação do treinador (os dados não provam causalidade).',
    '============================================================',
    '',
  ];

  agenda.forEach((item, index) => {
    const metricTitle = getMetricLabel(item.metricKey);
    lines.push(
      `${index + 1}. [${metricTitle}] Equipe: ${item.teamLabel} | Round ${item.roundNumber} (ID: ${item.roundId} | Partida: ${item.matchId})`
    );
    lines.push(`   • Observação (dados da partida): ${item.observation}`);
    lines.push(`   • Pergunta de revisão tática: ${item.reviewQuestion}`);
    lines.push(`   • Hipótese de exercício (para avaliação do treinador): ${item.suggestedExercise}`);
    lines.push('');
  });

  return lines.join('\n').trimEnd() + '\n';
}
