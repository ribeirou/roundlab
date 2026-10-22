# RoundLab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um protótipo navegável que transforma dados oficiais em duas análises coletivas rastreáveis e uma pauta de treino.

**Architecture:** Importador local valida os JSONs e produz um conjunto compacto para o navegador. Funções puras calculam indicadores sobre rounds normalizados; a interface compartilha o mesmo filtro entre indicadores e evidências. Dados derivados ficam disponíveis localmente, sem Drive em tempo de demonstração.

**Tech Stack:** Node.js 24.19.0 (verificado no ambiente), JavaScript ES modules, HTML e CSS; testes pelo executor nativo `node --test`. Sem dependências obrigatórias de produção. Servidor HTTP local com módulos nativos. Navegador real para validação do fluxo.

**Spec:** `docs/especificacao.md`, aprovada pelo usuário. Caminhos abaixo são relativos à raiz do repositório. A aplicação será implementada nesta raiz.

## Global Constraints

- Usar exclusivamente os JSONs fornecidos pela organização, nas pastas Univavá / Classificatórias 1 a 4.
- Excluir observadores das métricas. Identificar pessoas por puuid; nome é apenas apresentação.
- Deduplicar por matchId; registrar arquivos inválidos, incompletos ou conflitantes.
- Menos de 10 oportunidades recebe aviso de amostra pequena.
- Denominador zero aparece como sem dados, nunca como 0%.
- Round exibido ao usuário é roundNum + 1.
- Não depender apenas de cor para comunicar vitória e derrota.
- Sem dependência de IA para calcular métricas.
- Não enviar nem publicar a submissão automaticamente.

## Review Focus

- Nomes de equipe ambíguos ou placares iguais: preservar Red/Blue e elenco, sem juntar equipes pela suposição; teste na tarefa 1.
- JSON truncado ou contagens conflitantes: registrar motivo e impedir sua participação nas métricas; teste na tarefa 1.
- Horários iguais e eventos repetidos: primeira eliminação ambígua não entra no denominador; teste na tarefa 2.
- Troca de filtro com round aberto: fechar seleção incompatível e manter indicador, lista e contagens coerentes; teste de fluxo na tarefa 3.
- Clipboard indisponível: oferecer texto selecionável para cópia manual; teste de fluxo na tarefa 4.

## Estrutura de arquivos

- `scripts/import.mjs`: ingestão, validação e relatório de qualidade.
- `scripts/serve.mjs`: servidor estático local restrito à pasta do app, sem traversal.
- `data/raw/c1/` a `c4/`: arquivos oficiais baixados; nenhum dado bruto é entregue no bundle público.
- `data/manifest.json`: arquivo, classificatória, ID de origem, hash e identidade de partida.
- `src/normalize.mjs`: normalização e resolução explícita de equipes.
- `src/metrics.mjs`: indicadores e filtros puros.
- `src/agenda.mjs`: pauta e texto exportável.
- `public/index.html`, `public/styles.css`, `public/app.mjs`: interface em português.
- `public/lib/`: cópia gerada das funções compartilhadas usadas pelo navegador.
- `public/data/matches.json`: dados compactos necessários ao app, sem campos pessoais irrelevantes.
- `data/quality-report.json`: arquivos incluídos/excluídos e motivos.
- `tests/normalize.test.mjs`, `tests/metrics.test.mjs`, `tests/agenda.test.mjs`: testes de lógica.
- `README.md`, `package.json`: execução e metodologia.

## Contratos compartilhados

`Source = {file, qualifier, driveId, sha256}`.

`Match = {id, source: Source, mapId, teams: Team[], rounds: Round[]}`.

`Team = {id, label, nameVerified, players: {id, name}[]}`; id estável por equipe verificada; sem verificação usar identificador específico da partida e lado, evitando agregação incorreta. Um arquivo de associações revisadas pode unir esses identificadores posteriormente; registrar justificativa.

`Round = {id, matchId, number, winnerTeamId, attackingTeamId: string|null, kills: Kill[], plant: Plant|null, issues: string[]}`; `number` é humano, baseado em 1.

`Kill = {killerId, victimId, killerTeamId, victimTeamId, timeMs}`; `Plant = {teamId, planterId, timeMs, site, defuseTimeMs: number|null}`.

`Filters = {teamId, qualifier?, mapId?, matchId?, site?}`. Site restringe apenas pós-plant e é rotulado assim na interface.

`Metric = {wins, opportunities, rate: number|null, smallSample, evidence: {matchId, roundId, won}[], excluded: {matchId, roundId, reason}[]}`. `rate` usa escala 0–1; não arredondar antes da apresentação.

### Tarefa 1: dados oficiais normalizados e auditáveis

**Files:** `scripts/import.mjs`, `src/normalize.mjs`, `data/manifest.json`, `data/quality-report.json`, `tests/normalize.test.mjs`, `package.json`.

**Interfaces:** `normalizeMatch(raw, source: Source, teamBindings): {match: Match|null, issues: string[]}`. Importação escreve `Match[]` no JSON público e copia os módulos compartilhados para `public/lib/`.

- [ ] Criar testes `ignoresObservers`, `rejectsTruncatedOrConflictingMatch`, `deduplicatesMatchIds` e `preservesAmbiguousTeams`. Assertar que observador não integra equipe; placar incompatível exclui partida; duplicata idêntica mantém uma entrada; conflito não escolhe versão silenciosamente; empate de placar não resolve nome por ordem.
- [ ] Rodar `node --test tests/normalize.test.mjs`; confirmar falha pela ausência da implementação.
- [ ] Baixar os JSONs das quatro pastas oficiais já identificadas. Enumerar páginas se necessário; registrar cobertura observada sem assumir que a primeira listagem contém todos os arquivos. Preservar os brutos e o manifesto.
- [ ] Implementar normalização e relatório; remover campos sem uso como accountLevel, cards e títulos da saída pública. Validar vencedor, números de rounds e equipes de cada jogador. Conflitos ficam explícitos no relatório.
- [ ] Rodar `node --test tests/normalize.test.mjs` e `node scripts/import.mjs`; ambos devem terminar sem falhas, e o relatório deve contabilizar cada arquivo baixado.
- [ ] Conferir manualmente associações de nomes usando nomes dos arquivos e placares; se não houver evidência suficiente, usar lado e elenco. Confirmar o caso C1 e a partida C4 com 36 rounds.

### Tarefa 2: duas métricas com evidências

**Files:** `src/metrics.mjs`, `tests/metrics.test.mjs`.

**Interfaces:** `selectRounds(matches: Match[], filters: Filters): Round[]`; `firstKillConversion(rounds: Round[], teamId: string): Metric`; `postPlantConversion(rounds: Round[], teamId: string, site?: string): Metric`.

- [ ] Criar testes `deduplicatesEvents`, `excludesOpposingFirstKillTies`, `ignoresUnknownAndFriendlyKills`, `excludesUnknownPlanter`, `emptyRateIsNull`, `smallSampleThreshold` e `matchesOfficialSample`. Assertar oportunidades idênticas após duplicação; empate adversário excluído; 9 oportunidades sinaliza amostra pequena e 10 não; C1 Red tem 7/10 com perdas nos rounds 16, 20 e 22.
- [ ] Rodar `node --test tests/metrics.test.mjs`; confirmar falha antes de implementar.
- [ ] Implementar contratos; deduplicar evento por killer, victim e horário do round; ordenar por horário. Resultado usa vencedor oficial. Plant exige identidade resolvida e horário coerente; ausência ou inconsistência aparece como exclusão, nunca como derrota.
- [ ] Rodar `node --test tests/*.test.mjs`; todas as asserções devem passar.
- [ ] Conferir manualmente vitória e derrota após primeira eliminação e após plant nos arquivos brutos; registrar partida, round e campos que sustentam o cálculo no README.

### Tarefa 3: visão da equipe e exploração dos rounds

**Files:** `public/index.html`, `public/styles.css`, `public/app.mjs`, `scripts/serve.mjs`.

**Interfaces:** consome `Match[]` e funções da tarefa 2. Estado único `{filters, metricKey, selectedRoundId, agenda}`; renderização deriva todas as contagens do mesmo recorte.

- [ ] Construir interface escura de análise esportiva, tipografia legível, tabelas compactas, rótulos claros e destaque discreto para evidências. Não copiar identidade visual ou recursos do UNIVLR.
- [ ] Implementar filtros de equipe, classificatória, mapa e partida; cartões com contagens e amostra; lista de situações revisáveis e estados de carregamento, erro e ausência de resultados.
- [ ] Implementar detalhe do round com resultado textual, horários, participantes, primeira eliminação, plant/desarme e sequência de eventos. Derivar atacante a partir de winningTeam e winningTeamRole quando válidos. Abrir casos perdidos e vencidos.
- [ ] Implementar servidor apenas em localhost, MIME correto e verificação de caminhos dentro de `public/`; executar com `node scripts/serve.mjs`.
- [ ] No navegador, abrir o caso C1 e confirmar 7/10 e rounds 16, 20 e 22; mudar mapa/partida com detalhe aberto e verificar fechamento de seleção incompatível. Testar filtro vazio, navegação por teclado e largura de 390 px. Salvar evidências visuais do fluxo.

### Tarefa 4: pauta de treino copiável e imprimível

**Files:** `src/agenda.mjs`, `tests/agenda.test.mjs`, `public/app.mjs`, `public/styles.css`.

**Interfaces:** `addEvidence(agenda: AgendaItem[], item: AgendaItem): AgendaItem[]`; `formatAgenda(agenda: AgendaItem[]): string`; `AgendaItem = {metricKey, teamLabel, matchId, roundId, roundNumber, observation, reviewQuestion, suggestedExercise}`.

- [ ] Criar testes `doesNotDuplicateEvidence`, `preservesSourceReferences`, `labelsExerciseAsHypothesis`; assertar uma entrada por métrica e round e presença da referência à partida no texto.
- [ ] Rodar `node --test tests/agenda.test.mjs`; confirmar falha inicial.
- [ ] Implementar adição, remoção e exportação textual. Sugestão sempre rotulada como hipótese para avaliação do treinador; não afirmar motivo da derrota. Sem persistência obrigatória entre sessões no MVP.
- [ ] Rodar `node --test tests/*.test.mjs`; confirmar aprovação.
- [ ] Testar no navegador: adicionar dois casos, remover um, copiar, simular clipboard indisponível e conferir alternativa de texto selecionável. Conferir visualização de impressão com fontes, identificação e evidências legíveis.

### Tarefa 5: entrega local e roteiro demonstrável

**Files:** `README.md`, `dist/`, `docs/roteiro-pitch.md`.

**Interfaces:** protótipo estático em `public/`; comandos documentados para importar, testar e servir. Entrega contém fontes e dados derivados necessários, excluindo arquivos brutos e intermediários.

- [ ] Rodar importação e suíte completa; confirmar cobertura do manifesto e divulgar limitações reais, incluindo nomes de equipe ainda não resolvidos.
- [ ] Realizar fluxo completo no navegador desktop e celular: selecionar equipe → indicador → round → pauta → copiar/imprimir. Corrigir apenas falhas que impedem o escopo aprovado; repetir verificação afetada.
- [ ] Empacotar aplicação em `dist/` e executar a cópia entregue para verificar independência da pasta de trabalho e do Drive. Não publicar automaticamente.
- [ ] Escrever README com comandos, fórmulas, exclusões e casos conferidos; preparar roteiro de até 5 minutos com problema, método, demonstração, limitações e valor. Roteiro não substitui gravação ou apresentação final.
- [ ] Mostrar ao usuário o protótipo, capturas e comandos de execução. Slides, gravação e hospedagem são próximos entregáveis a combinar após validação do protótipo.

## Controle de execução

Workspace atual não tem Git inicializado. Se for criado repositório local para rastrear o projeto, fazer commits por tarefa concluída, excluindo dados brutos e sem push automático. Não tornar Git pré-requisito para executar o protótipo.

Recomendação: execução nativa nesta conversa, pela sequência dependente entre importação, métricas e interface. Antes de implementar, obter revisão deste plano e escolha do método conforme a skill de planejamento. Revisão independente final pode ser delegada após essa escolha; não usar modelo diferente sem instrução aplicável.
