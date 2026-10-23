# Centro tático — direção escolhida

O usuário escolheu grafite, coral, diagnóstico em destaque e motion discreto. Refinamento do MVP existente, mantendo métricas, critérios de exclusão e origem dos dados.

Público: treinador que revisa a partida e prepara a próxima sessão. Domínio: equipe, recorte, primeira eliminação, plant, round, revisão, treino. Paleta: carvão da sala de análise, cinza de equipamentos, branco de anotações, coral para ação, verde para vitória e âmbar para alerta. Assinatura: sequência dos resultados de rounds no contexto da revisão; cada resultado continua textual e verificável. Evitar neon decorativo, dashboard com cards iguais e página de marketing dentro da ferramenta.

## Implementação

- [x] Criar navegação persistente, visão da equipe e fluxo de três etapas; layout de uma coluna em telas estreitas.
- [x] Redesenhar indicadores com proporção visual de vitórias/derrotas e chamada contextual para revisão, sem inferir causas.
- [x] Compactar evidências, limitar rolagem longa em desktop e aproximar detalhe do round no celular; manter a pauta imprimível.
- [x] Aplicar entradas curtas, realce de seleção e confirmação de adição, respeitando prefers-reduced-motion.
- [x] Validar filtros, os dois indicadores, seleção e fechamento do round, pauta, cópia, impressão e erros. Executar testes e conferir tela larga e 390 px.

Alterações na camada de apresentação, em branch própria. Relatório de qualidade regenerado anteriormente é alteração local preexistente e não deve ser incluído no commit visual.

## Verificação realizada

15 testes automatizados aprovados; sintaxe JavaScript validada; pacote gerado. No navegador: desktop 1440 px e celular 390 px sem overflow horizontal; primeira eliminação 7/10; pós-plant Site A 2/2 com amostra pequena; recorte vazio com taxa indisponível; filtro de derrotas, abertura de round, adição à pauta e cópia confirmados. Console sem avisos ou erros nas interações verificadas. Regras de impressão e movimento reduzido revisadas no código; não foi gerado PDF de impressão nem alterada a preferência de movimento do sistema.

Revisão independente de código: lado reintegrado aos metadados e cabeçalhos preservados para leitores de tela. Cálculos e base de partidas não foram alterados.
