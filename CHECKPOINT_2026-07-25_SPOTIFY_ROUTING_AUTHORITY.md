# Correção crítica — roteamento/autorização Spotify

Causa encontrada:
- resposta curta como “Sim” não herdava Spotify + Plays da última fala do agente;
- `spotify_precos` podia ficar fora do prompt;
- Haiku então inventava preço apesar da regra textual anti-invenção;
- palavras genéricas como `plays`, `views` e `likes` também podiam inferir plataforma errada;
- módulo legado `spotify` podia competir se fosse reativado no CMS.

Correções:
- contexto atual herda plataforma/produto da última fala do agente somente quando não ambíguo;
- “Sim” após pergunta de valores vira `consulta_preco`;
- plataforma é detectada por nome explícito, não por produto genérico;
- produto `saves` adicionado;
- `spotify_precos` vira autoridade obrigatória quando há Spotify + produto/preço/fechamento;
- `spotify_royalties` é forçado para perguntas de dinheiro/monetização;
- legado `spotify` é ignorado em runtime se existem `spotify_*`;
- preço Spotify sem módulo autoritativo é bloqueado no pós-processamento;
- promessa de ganho financeiro direto por plays também é bloqueada;
- migration repara metadados do CMS sem sobrescrever conteúdo editado.

Validação adicional:
- recomendação como “Qual você me indica?” mantém Spotify + Plays a partir do diálogo recente;
- `spotify_precos` continua selecionado nesse turno, mesmo sem repetir a palavra Spotify;
- o validador lê o conteúdo ATUAL do módulo `spotify_precos`, portanto futuras edições de preço no CMS continuam sendo a fonte de verdade;
- respostas com preço incompatível com o módulo são substituídas por valor calculado a partir do próprio módulo.
