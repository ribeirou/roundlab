# Roteiro de Pitch — RoundLab (até 5 minutos)

> **Importante:** Este documento é o roteiro estruturado de apoio para a gravação do vídeo pitch de até 5 minutos e condução da demonstração ao vivo. Ele não substitui a gravação do vídeo nem os slides finais da apresentação.

---

## 1. O Problema (0:00 – 0:50)

- **Contexto real dos times universitários:** Equipes universitárias de VALORANT têm pouco tempo de treino semanal entre aulas, provas e campeonatos como o Univavá.
- **Dor atual:** Após uma partida, o time costuma revisar rounds no escuro — discutindo lances isolados de memória ou olhando apenas KDA individual — sem saber quais situações coletivas realmente se repetiram e custaram rounds.
- **Proposta do RoundLab:** Transformar os arquivos JSON oficiais pós-partida das Classificatórias 1 a 4 do Univavá em uma **pauta de revisão e treino rastreável**, guiando o fluxo:
  **Selecionar equipe → Encontrar padrão coletivo → Conferir evidências por round → Exportar pauta de treino.**

---

## 2. Método e Rigor Analítico (0:50 – 1:45)

- **Base de dados auditada:** Processamos localmente todos os **199 arquivos JSON oficiais** das Classificatórias 1 a 4 do Univavá (`C1`: 55, `C2`: 39, `C3`: 43, `C4`: 62), gerando manifesto com hash SHA-256 e relatório de qualidade (`data/quality-report.json`).
- **Higiene e integridade dos dados:**
  - Observadores (`isObserver` ou fora de `Red`/`Blue`) são excluídos das métricas.
  - Jogadores são identificados por `puuid` (o `gameName#tagLine` é apenas camada de apresentação).
  - Os lados `Red` e `Blue` nunca são associados aos nomes das equipes pela simples ordem no nome do arquivo: o importador cruza o placar real dos rounds com o placar declarado e preserva indicação explícita de lado/elenco caso haja empate ou ambiguidade.
- **Dois indicadores coletivos com numerador, denominador e evidências:**
  1. **Conversão da 1ª Eliminação:**
     $$\text{Conversão}_{1\text{ª Kill}} = \frac{\text{Rounds vencidos pela equipe após conquistar a 1ª eliminação válida}}{\text{Rounds em que a equipe conquistou a 1ª eliminação válida}}$$
     *(Eliminações duplicadas são removidas; friendly fire e identidades não resolvidas são ignorados; empates de menor milissegundo entre equipes adversárias são excluídos do denominador por ambiguidade).*
  2. **Conversão de Pós-Plant (segmentável por Bomb Site A/B/C):**
     $$\text{Conversão}_{\text{Pós-Plant}} = \frac{\text{Rounds vencidos pela equipe após plant válido}}{\text{Rounds com plant válido realizado por integrante da equipe}}$$
     *(Resultado oficial vem de `winningTeam`; plants com autor desconhecido ou horário incoerente entram como exclusão documentada, nunca como derrota).*
- **Apresentação responsável:** Menos de 10 oportunidades recebe aviso explícito de **amostra pequena (`< 10`)**, e denominador zero é exibido como **`Sem dados`**, nunca como `0%`.

---

## 3. Demonstração ao Vivo no Protótipo (1:45 – 3:35)

1. **Visão da Equipe (Caso de Referência Validado — C1):**
   - Abrir o RoundLab no caso de referência da Classificatória 1: **Poli Plague 10 × 13 Unicamp Tritons Red** no mapa **Haven** (`matchId: fc187928-9b72-42b3-aaaf-8ca6689a3937`).
   - Mostrar os dois cartões lado a lado:
     - **Conversão da 1ª Eliminação:** `70,0%` (`7` vitórias em `10` oportunidades, com `3` derrotas revisáveis nos **Rounds 16, 20 e 22**).
     - **Conversão de Pós-Plant:** `70,0%` (`7` vitórias em `10` oportunidades, com `3` derrotas revisáveis nos **Rounds 3, 4 e 10**).
   - Filtrar **Site do plant = Site C**: mostrar que o indicador de Pós-Plant passa para `62,5%` (`5/8`) e aciona automaticamente o selo **⚠️ Amostra pequena (`< 10` oportunidades)**.
2. **Inspeção de Evidências por Round:**
   - Clicar na aba **Derrotas (3)** da 1ª Eliminação e abrir o **Round 16**.
   - Apontar no painel de detalhe:
     - Resultado textual (`✕ DERROTA DA EQUIPE NO ROUND`), lado (`Defensor`) e vencedor oficial (`Unicamp Tritons Red`).
     - Evento que sustenta o indicador: aos `00:23.2s` (`23180 ms`), `Vks#bru` (`Poli Plague`) eliminou `makola#deft` (`Unicamp Tritons Red`), mas o plant já havia ocorrido aos `00:22.5s` no Site C e o round terminou em derrota.
     - Linha do tempo completa ordenada por milissegundos e elenco das duas equipes.
3. **Geração da Pauta de Treino Copiável e Imprimível:**
   - Adicionar o **Round 16** (1ª Eliminação) e o **Round 3** (Pós-Plant desarmado no Site C) usando o botão **"+ Pauta"**.
   - Descer até a seção **Pauta de Revisão e Treino**:
     - Destacar a separação visual e textual em três colunas:
       1. **Observação (dados da partida):** fato objetivo extraído do JSON com `matchId`, arquivo e timestamp.
       2. **Pergunta de revisão tática:** roteiro para discussão com os jogadores.
       3. **Hipótese de exercício (avaliação do treinador):** sugestão prática claramente rotulada como hipótese.
     - Clicar em **Copiar resumo da pauta** (mostrando também a caixa selecionável de fallback) e em **Imprimir pauta** para exibir a folha limpa pronta para treino.

---

## 4. Limitações Reais e Transparência Técnica (3:35 – 4:20)

- **Sem trajetórias contínuas (sem replay 2D/3D):** Os JSONs oficiais registram retratos de posição apenas no instante de eventos (kills, plant e desarme), não a movimentação contínua segundo a segundo.
- **Ressurreições (Sage/Clove) e causalidade:** A estrutura inspecionada não explicita eventos de ressurreição como reversão direta de vantagem numérica; por isso, a métrica mede estritamente a conversão após a 1ª eliminação e **não reivindica causalidade automática**.
- **Identidade nominal entre classificatórias:** Enquanto jogadores têm `puuid` estável, algumas equipes mudaram de nome ou sufixo entre classificatórias (ex.: *Unicamp Tritons Red* na C1 vs *Unicamp Tritons Black* na C2–C4 com 4 jogadores em comum; *FEI Darkowls* vs *FEI Whiteowls*). Optamos por manter cada nome verificado fiel ao arquivo oficial daquela partida, sem fundir equipes por suposição.

---

## 5. Valor Entregue e Fechamento (4:20 – 5:00)

- **Economia imediata de tempo para o capitão/treinador:** Em menos de 2 minutos, qualquer uma das 61 equipes das Classificatórias 1 a 4 do Univavá sai do placar bruto para os rounds exatos onde perdeu situações favoráveis (1ª eliminação ou pós-plant).
- **Zero custo de infraestrutura:** Roda 100% local com dados derivados compactos, sem depender de login, API paga ou conexão com o Google Drive durante o uso.
- **Próximos passos pós-validação:** Inclusão de análise de trocas (*trades* dentro de janela temporal) e filtros comparativos por metade (Ataque vs Defesa).
