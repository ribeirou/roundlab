# Ferramentas de revisão e recuperação do carregamento

Adições escolhidas a partir do pedido para complementar o Centro tático: manter a pauta entre visitas, exportar para a equipe, encontrar rounds e compreender os indicadores. O relato de tela parada em carregamento teve prioridade durante a execução.

## Carregamento

A aba inspecionada havia recebido HTTP 404 para matches.json antes da conclusão da importação. Recarregada com a base disponível, voltou a mostrar Poli Plague, 23 rounds e os dois indicadores em 7/10. O carregador agora cobre leitura e parsing com prazo de 15 segundos, apresenta erro legível e permite tentar novamente. Inicialização dos eventos também fica dentro do tratamento de falha.

## Pauta

Armazenamento local na chave versionada roundlab.agenda.v1. Somente referências de equipe, partida, round e indicador são gravadas, sem guardar textos de observações ou sugestões. Ao restaurar, o sistema valida esquema e limites, verifica a existência e a elegibilidade da evidência na base atual e reconstrói os textos. Referências indisponíveis são descartadas com aviso. Dados corrompidos ou armazenamento indisponível não impedem a análise; o estado informa quando salvar falhou.

Perspectivas de equipes diferentes não colidem. O evento storage atualiza a pauta aberta em outra aba da mesma origem. Não há conta, servidor de pautas ou sincronização entre dispositivos. Copiar e baixar texto são as opções para compartilhar. Desfazer limpeza funciona na sessão atual; não é um backup após fechar a aba.

## Busca e explicação

A busca ignora diferenças de caixa e acentuação. Número isolado busca round exato. Nomes de jogadores são procurados nos autores e vítimas de eliminações e no responsável pelo plant; a busca não estima participação tática a partir de posição ou elenco. Busca, resultado e filtros do recorte são combinados, mas a busca não altera numeradores ou denominadores dos indicadores.

O diálogo de metodologia explica os dois indicadores, o limite de amostra e as exclusões. Escape fecha o diálogo sem limpar o round aberto. Download gera texto UTF-8 com referências e distinção entre observação e hipótese.

## Validação

- 22 testes automatizados aprovados, incluindo falha HTTP, prazo expirado, persistência por referências, dados corrompidos, indisponibilidade de storage, referência ausente, identidade da equipe e busca.
- No navegador, servidor local isolado retornou 404 na primeira tentativa: a mensagem apareceu e tentar novamente carregou os indicadores.
- Pauta restaurada após reload; arquivo .txt baixado e conferido com número do round, ID da partida e rótulo de hipótese.
- Busca exata do round 16 reduziu a lista para uma evidência e manteve os indicadores em 7/10.
- Limpeza e desfazer verificadas. Escape no diálogo preservou o round após correção apontada por revisão independente.
- Sem avisos ou erros de console nas interações da aba principal verificadas.

Limites: armazenamento local pode ser apagado pelo navegador ou pelo usuário. Referências de outra versão da base podem deixar de existir. A pauta não é uma garantia de backup; exportar mantém uma cópia portátil. A impressão não foi gerada em PDF durante esta etapa.
