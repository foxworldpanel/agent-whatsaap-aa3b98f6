# Checkpoint — CMS/Admin Agent V3

## Correções aplicadas

- Configuração `agent_config` passou a ser carregada e cacheada por usuário + workspace quando o workspace é informado, evitando mistura entre workspaces do mesmo usuário.
- A invalidação do cache de configuração remove uma entrada específica ou todas as entradas do usuário.
- Edição de módulo normaliza a chave para minúsculas e valida erros na leitura do registro atual.
- Editar conteúdo de um módulo desabilitado não o reativa mais por acidente (`enabled` preserva o valor atual quando omitido).
- Falhas ao registrar histórico agora geram aviso explícito sem esconder que o módulo principal foi salvo.
- Exclusão e reordenação normalizam chaves.
- Reordenação rejeita chaves duplicadas, limita o lote e verifica erro de cada atualização.
- Prévia do prompt retorna apenas módulos realmente incluídos e também expõe avisos de módulo ausente/vazio.

## Arquivos alterados

- `src/lib/agent-v3/brain/config.server.ts`
- `src/lib/agent-v3/admin/admin.functions.ts`
- `src/lib/agent-v3/admin/reorder.functions.ts`

## Validação

A estrutura e o conteúdo dos arquivos foram verificados após a edição. Os testes automatizados não foram executados porque o ZIP não contém `node_modules`.
