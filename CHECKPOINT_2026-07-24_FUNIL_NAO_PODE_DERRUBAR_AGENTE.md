# Checkpoint — Funil fail-open / Agent V3 restaurado

## Causa global encontrada

O webhook consultava `welcome_funnel_runs.status` em TODA mensagem de texto antes
de verificar se havia um gatilho de funil.

Se a migration que adiciona `status` ainda não estivesse aplicada no banco, qualquer
mensagem comum ("Boa noite", "Spotify", etc.) retornava no gate do funil e nunca
chegava ao Agent V3.

## Correção

- primeiro carrega os funis ativos do número;
- procura um gatilho correspondente;
- somente quando existe match consulta `welcome_funnel_runs`;
- o runtime usa apenas as colunas originais da tabela para o claim:
  `funnel_id`, `contact_id`, `user_id`, `workspace_id`, `fired_at`;
- falha ao carregar/verificar funil é fail-open: registra erro e continua para a Júlia;
- o lock persistente de conversa impede a IA de entrar enquanto o funil está sendo enviado;
- clientes continuam uma vez por funil;
- 5511970116430 continua livre para repetir testes;
- se o funil falhar, o marcador é removido para permitir retry.

O atendimento normal deixa de depender da migration de estado do funil.
