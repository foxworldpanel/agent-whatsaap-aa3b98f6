# Auditoria e correções — Agent V3

## Falhas críticas corrigidas

1. **Spotify ativo no CMS não era carregado** quando `selector_platforms` ainda estava vazio.
   - O seletor agora carrega obrigatoriamente o módulo ativo cuja chave coincide com a plataforma detectada.
   - A migration também configura plataformas e gatilhos do Spotify.

2. **Dependências obrigatórias podiam ser descartadas** após o limite de 11 módulos.
   - O limite continua valendo para seleção primária, mas não bloqueia módulos estruturais correspondentes à plataforma nem dependências.

3. **Workspace recebido era ignorado.**
   - O orquestrador e a memória agora usam o `workspace_id` recebido; o workspace Mind ficou somente como fallback.

4. **Telefone sem normalização central.**
   - A memória V3 normaliza o telefone antes de consultar, salvar ou limpar.

5. **Agent V3 limitado a um único telefone de teste.**
   - A lista fixa `AUTHORIZED_PHONES` foi removida. A proteção continua sendo feita pelo token da instância Uazapi provisionada.

6. **Detector de loop encerrava conversas normais por mensagens curtas.**
   - Agora só considera loop quando há repetição real das últimas mensagens, e não apenas mensagens curtas diferentes.

7. **Metadados de roteamento eram sensíveis a maiúsculas/minúsculas.**
   - Chaves e arrays de roteamento são normalizados para minúsculas no carregamento.

8. **Memória do número de teste.**
   - A migration remove somente registros de `conversations_v3` para `5511970116430` e `11970116430`.

## Arquivos alterados

- `src/lib/agent-v3/selector/module-selector.server.ts`
- `src/lib/agent-v3/brain/modules.server.ts`
- `src/lib/agent-v3/brain/guards.server.ts`
- `src/lib/agent-v3/memory/conversation-state.server.ts`
- `src/lib/agent-v3/orchestrator.server.ts`
- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `supabase/migrations/20260722220000_fix_agent_v3_spotify_and_clear_test_phone.sql`
- `tests/agent-v3/module-selector.test.ts`

## Implantação

1. Substituir o projeto pelo conteúdo corrigido ou aplicar o diff.
2. Executar as migrations do Supabase, especialmente `20260722220000_fix_agent_v3_spotify_and_clear_test_phone.sql`.
3. Fazer deploy da aplicação.
4. Testar uma conversa nova: `Boa tarde` → `tenho interesse` → `Spotify`.

## Validação local

Foi criado teste automático para o seletor do Spotify e para dependências acima do limite primário. O ambiente de auditoria não conseguiu concluir `npm install` dentro do tempo disponível, portanto o Vitest e o build completo não foram executados aqui.

## Iteração: webhook e gates de segurança (2026-07-22)

Arquivos alterados:

- `src/routes/api/public/hooks/uazapi-webhook.ts`
- `tests/uazapi-webhook-ai-gates.test.ts`

Correções aplicadas:

1. O webhook agora consulta `agent_config.agent_enabled` por usuário e workspace antes de chamar o Agent V3.
2. O webhook agora respeita `conversations.agent_enabled=false` e `conversations.needs_review=true`.
3. Mensagens continuam sendo sincronizadas no CRM mesmo com o agente desligado, porém nenhuma resposta automática é gerada.
4. Áudios sem URL, sem chave OpenAI ou com falha de transcrição deixam de enviar o placeholder `[áudio recebido]` ao LLM.
5. Conteúdo vazio deixa de acionar o LLM.
6. Foram adicionados testes de regressão baseados no código-fonte para os gates globais, por conversa e para falhas de áudio.

Validação:

- A instalação de dependências via `npm ci` excedeu o limite disponível nesta execução.
- Portanto, os testes Vitest ainda não foram executados neste checkpoint.
