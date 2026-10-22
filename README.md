# RoundLab

Projeto de hackathon para ajudar times universitários de VALORANT a transformar dados pós-partida em uma pauta de revisão e treino.

**Estado atual: planejamento aprovado; protótipo ainda não implementado.** Este repositório começa com a especificação e o plano para a equipe trabalhar sobre o mesmo escopo. Ainda não há aplicação, demonstração ou comando de execução.

## Escopo do MVP

- Conversão da primeira eliminação em vitória.
- Conversão de pós-plant em vitória.
- Evidências por round, com linha do tempo dos eventos.
- Pauta de treino copiável e imprimível, distinguindo observações de hipóteses.

Cada indicador deverá mostrar numerador, denominador e rounds que sustentam o cálculo. Menos de 10 oportunidades será sinalizado como amostra pequena; ausência de oportunidades não será exibida como 0%.

## Documentação

- [Especificação](docs/especificacao.md)
- [Plano de implementação](docs/plano.md)
- [Como contribuir](CONTRIBUTING.md)

## Dados

Usar exclusivamente os arquivos oficiais em Univavá / Classificatórias 1 a 4 da [pasta disponibilizada pela organização](https://drive.google.com/drive/folders/1IuptLxv1FpcvrfB6a7z9bEqPNYSsQ-hW).

Dados brutos não estão incluídos neste repositório. Uma amostra por classificatória foi inspecionada durante a definição do projeto; a validação do conjunto completo ainda está pendente. Os arquivos contêm eventos por round, mas não trajetórias contínuas dos jogadores.

## Arquitetura planejada

Node.js 24, JavaScript ES modules, HTML e CSS. Importação e validação local; métricas em funções puras; interface com dados derivados locais. Sem login, API externa de VALORANT ou uso em partidas em andamento.

## Colaboração

Crie uma branch por alteração e abra pull request com o que mudou e como foi verificado. Colaboradores com acesso de escrita poderão enviar branches diretamente; visibilidade pública, por si só, não concede edição direta.

## Referência

O [UNIVLR](https://univlr.onrender.com/#/home) foi consultado como referência de produto. Não foram incorporados código, identidade visual ou dados de partidas desse site. Projeto independente, sem afiliação com Riot Games ou UNIVLR.

## Licença

Código e documentação sob a [licença MIT](LICENSE). A licença não abrange dados ou marcas de terceiros.
