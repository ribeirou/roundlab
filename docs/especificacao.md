# RoundLab — escopo do protótipo

## Objetivo
Ajuda treinadores e times universitários de VALORANT a escolher o que revisar e treinar depois das partidas. O fluxo central é: selecionar equipe → encontrar padrão → conferir rounds → montar pauta de treino.

Escopo aprovado na conversa: priorizar conversão da primeira eliminação e pós-plant, com evidências por round. Trocas ficam como extensão. Nome RoundLab é provisório.

## Dados e limites
Usar exclusivamente os JSONs fornecidos pela organização, nas pastas Univavá / Classificatórias 1 a 4. Não incorporar resultados de outros campeonatos presentes na pasta, nem dados de partidas do site de referência.

Uma amostra de cada classificatória foi inspecionada. As quatro têm matchInfo, players, teams e roundResults, com eliminações temporizadas, economia e eventos de plant/desarme. Isso confirma a viabilidade inicial; cobertura e consistência do conjunto completo ainda precisam ser verificadas.

Importação preserva nome do arquivo, classificatória e matchId. Deduplicar por matchId; registrar arquivos inválidos, incompletos ou conflitantes. Excluir observadores das métricas. Identificar pessoas por puuid; nome é apenas apresentação. Os nomes das equipes vêm dos arquivos e precisam ser conferidos contra os placares e integrantes: nunca presumir que a ordem no nome corresponde a Red/Blue. Havendo ambiguidade, apresentar lado e elenco sem atribuição inventada.

## Métricas
### Conversão da primeira eliminação
Em cada round, reunir kills dos playerStats, remover duplicatas de eventos e ordenar pelo horário desde o início do round. Considerar apenas eliminações entre adversários com identidades e equipes resolvidas. Primeira eliminação é o primeiro evento elegível. Empates entre equipes no menor horário são classificados como ambíguos e excluídos deste indicador.

Conversão = rounds vencidos pela equipe após conseguir a primeira eliminação / rounds em que ela conseguiu a primeira eliminação. Exibir numerador, denominador, percentual e rounds perdidos nessa condição. Sem eventos válidos, classificar como indisponível. Não interpretar essa métrica como causalidade nem como reconstrução completa de vantagem numérica: ressurreições não são explicitamente registradas na estrutura inspecionada.

### Conversão de pós-plant
Resolver a equipe do bombPlanter pelo elenco. Conversão = rounds vencidos por essa equipe / rounds com plant válido dessa equipe. Segmentar por mapa e plantSite quando disponíveis. Plant inválido ou identidade não resolvida fica fora do denominador com motivo informado. Resultado do round vem de winningTeam, não de inferência sobre desarme ou eliminações.

### Apresentação responsável
Todas as taxas mostram a amostra. Menos de 10 oportunidades recebe aviso de amostra pequena; esse é um limite de interface, não uma garantia estatística. Não emitir classificação de problema com base em percentual isolado. Mostrar ocorrências para revisão, sem benchmark externo ou promessa de vitórias recuperáveis. Denominador zero aparece como sem dados, nunca como 0%.

## Experiência — três telas
1. Visão da equipe: filtros de equipe, classificatória, mapa e partida; quantidade de partidas e rounds; dois indicadores com contagens; lista de situações para revisar. Seleção inicial usa um caso real validado.
2. Evidências: indicador selecionado abre os rounds envolvidos; cada round mostra partida, resultado, primeira eliminação, plant/desarme e linha do tempo de eliminações com jogadores e horários. Mostrar lado atacante/defensor quando resolvível pelo winningTeamRole. Round exibido ao usuário é roundNum + 1.
3. Pauta de treino: adicionar situações à pauta; listar evidências, pergunta de revisão e sugestão de exercício como hipótese para avaliação do treinador. Permitir copiar o resumo e imprimir. Não alegar que o exercício foi validado pelos dados.

Estados necessários: carregando, erro de importação, filtro sem resultados, indicador sem oportunidades e amostra pequena. Interface em português, responsiva e operável por teclado. Não depender apenas de cor para comunicar vitória e derrota.

## Estrutura proposta
Protótipo web sem login. Processamento local dos arquivos oficiais por script, produzindo dados derivados compactos e rastreáveis; interface carrega esses dados sem depender do Drive durante a apresentação. Camadas separadas para importação/validação, cálculo de métricas e apresentação. Versões de ferramentas serão escolhidas no planejamento.

Sem dependência de IA para calcular métricas. Texto de revisão inicialmente produzido por regras explícitas e templates. Sem replay contínuo: posições disponíveis são retratos de eventos, não trajetórias completas.

## Validação
Conferir contagens de rounds, equipes e placares contra os JSONs. Validar manualmente pelo menos um caso positivo e um negativo de cada métrica. Cobrir com testes significativos: eventos duplicados, primeira eliminação ambígua, observadores, plant ausente, jogador desconhecido, denominador zero e deduplicação de partidas. Conferir uma partida com prorrogação.

Caso de referência já calculado na amostra C1: lado Red em Poli Plague 10 × 13 Unicamp Tritons Red conseguiu a primeira eliminação em 10 rounds, venceu 7 e perdeu os rounds 16, 20 e 22. A atribuição nominal desse lado ainda precisa ser verificada.

Verificação da interface: filtros alteram métricas e evidências de forma consistente; abrir round preserva contexto; pauta inclui as evidências escolhidas; cópia e impressão funcionam; navegação utilizável em desktop e celular. Somente dados conferidos aparecem no pitch.

## Entrega e limites
Regulamento consultado: vídeo pitch de até 5 minutos, link da apresentação e protótipo como complemento; prazo 23/10/2026 às 23h59 de Brasília. Não enviar nem publicar a submissão automaticamente.

Fora do MVP: login, chat com IA, rankings próprios, análise ao vivo, APIs de VALORANT, replay 3D e análise de trocas. Hospedagem e publicação serão definidas depois do protótipo validado.

Critério de sucesso: demonstrar, em um caso real, seleção da equipe, cálculo rastreável, abertura dos rounds e geração de uma pauta de revisão. O pitch deve distinguir observação dos dados de hipótese de treino.
