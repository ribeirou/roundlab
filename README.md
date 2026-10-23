# RoundLab

Projeto de hackathon para ajudar times universitários de VALORANT a transformar dados pós-partida em uma pauta de revisão e treino.

## Escopo do MVP

- Conversão da primeira eliminação em vitória.
- Conversão de pós-plant em vitória.
- Evidências por round, com linha do tempo dos eventos.
- Pauta de treino copiável e imprimível, distinguindo observações de hipóteses.

Cada indicador mostra numerador, denominador e rounds que sustentam o cálculo. Menos de 10 oportunidades é sinalizado como amostra pequena; ausência de oportunidades retorna taxa nula (`null` / sem dados), nunca `0%`.

## Comandos disponíveis

Requer **Node.js 24+**:

```bash
# Baixar/atualizar os 199 JSONs oficiais (C1 a C4), validar e gerar dados derivados
npm run import

# Executar a suíte de testes automatizados (normalização e métricas)
npm test
```

## Conferência manual nos arquivos brutos

Auditoria manual realizada sobre a partida oficial `UNIVAVA_C1_002_27-06-26_poli_plague_10_x_13_unicamp_tritons_red_haven.json` (`matchId: fc187928-9b72-42b3-aaaf-8ca6689a3937`, mapa `Haven` / `/Game/Maps/Triad/Triad`), analisando a equipe **Poli Plague** (`teamId: "Red"`, 10 rounds vencidos):

1. **Conversão da 1ª eliminação — `7/10` (`70%`, vitórias nos rounds 1, 8, 9, 12, 13, 14, 21; derrotas nos rounds 16, 20, 22):**
   - **Vitória após 1ª eliminação (Round 1 / `roundNum: 0`):** menor `timeSinceRoundStartMillis` em `roundResults[0].playerStats[].kills` é `5398` ms, com `killer: "xS04z_xBYVWiE4ExyrjGHyem_IKO_1YqBWq-xkxZ-JpmWBjgghNzwzt5hgqNdnRHly32LLcMYvaXRw"` (`Vks#bru`, `Red`) sobre `victim: "mmLD0dO3T5NKSM0weN6GFW7FALMfa10jKLuqbwFeh2PndRNyPHV-yeIr6aQ2kFyzkpQSnotFXyL6NQ"` (`drs1 rei de itu#dela`, `Blue`), e `winningTeam: "Red"` (`roundResultCode: "Elimination"`).
   - **Derrota após 1ª eliminação (Round 16 / `roundNum: 15`):** menor `timeSinceRoundStartMillis` em `roundResults[15].playerStats[].kills` é `23180` ms, com `killer` `Vks#bru` (`Red`) sobre `victim` `makola#deft` (`Blue`), porém `winningTeam: "Blue"` (`roundResultCode: "Elimination"`).
2. **Conversão de pós-plant — `7/10` (`70%`, sendo `5/8` no site `C` e `2/2` no site `A`; vitórias nos rounds 1, 2, 5, 7, 8, 9, 12; derrotas nos rounds 3, 4, 10):**
   - **Vitória após plant (Round 1 / `roundNum: 0`):** `bombPlanter: "V1BysLh9HzULswJeSHZRtjJrvUR2vpcJ1qSWHi0xfjNbILdR5VpgieXYbwB_czd-NndHOK0066qN0Q"` (`littlecyber#vrum`, `Red`), `plantRoundTime: 37001`, `plantSite: "C"`, `bombDefuser: null` (`defuseRoundTime: 0`), e `winningTeam: "Red"`.
   - **Derrota após plant (Round 3 / `roundNum: 2`):** `bombPlanter: "CVBEKLpXefxluGsPscn4XF0DR3MfvV600f3guiE1eGS5H5zwyitjT83feUx2S1buuCwrpkhnsgUXUQ"` (`Lukako#lucas`, `Red`), `plantRoundTime: 38127`, `plantSite: "C"`, desarme por `bombDefuser: "s49PdLxbX8pi_6YLJqV8DSrUxAdyQbdSb9UyHB5dFzgRacdbVSIkioTL_sDtP2qCHstaJY4zHb1ttg"` (`BRaim#nala`, `Blue`) em `defuseRoundTime: 55418`, e `winningTeam: "Blue"` (`roundResultCode: "Defuse"`).

## Documentação

- [Especificação](docs/especificacao.md)
- [Plano de implementação](docs/plano.md)
- [Como contribuir](CONTRIBUTING.md)

## Dados

Usar exclusivamente os arquivos oficiais em Univavá / Classificatórias 1 a 4 da [pasta disponibilizada pela organização](https://drive.google.com/drive/folders/1IuptLxv1FpcvrfB6a7z9bEqPNYSsQ-hW).

Dados brutos não estão incluídos neste repositório. Todos os 199 arquivos das Classificatórias 1 a 4 foram validados localmente e contabilizados em `data/quality-report.json`. Os arquivos contêm eventos por round, mas não trajetórias contínuas dos jogadores.

## Arquitetura planejada

Node.js 24, JavaScript ES modules, HTML e CSS. Importação e validação local; métricas em funções puras; interface com dados derivados locais. Sem login, API externa de VALORANT ou uso em partidas em andamento.

## Colaboração

Crie uma branch por alteração e abra pull request com o que mudou e como foi verificado. Colaboradores com acesso de escrita poderão enviar branches diretamente; visibilidade pública, por si só, não concede edição direta.

## Referência

O [UNIVLR](https://univlr.onrender.com/#/home) foi consultado como referência de produto. Não foram incorporados código, identidade visual ou dados de partidas desse site. Projeto independente, sem afiliação com Riot Games ou UNIVLR.

## Licença

Código e documentação sob a [licença MIT](LICENSE). A licença não abrange dados ou marcas de terceiros.
