# Dashboard atualizado

- `/` agora redireciona usuário autenticado para `/dashboard`, garantindo AppShell/menu lateral.
- Menu Dashboard aponta para `/dashboard`.
- Removido dashboard raiz antigo com números hardcoded.
- Métricas filtradas pelo workspace atual.
- Conversas usam `conversations_v3`.
- Contatos usam `contacts` (não `blast_contacts`).
- Origem usa coluna real `origem`.
- Atividade recente usa `agent_logs`.
- Métricas IA de 24h: chamadas, tokens, custo, latência e média de módulos.
- Módulos ativos vêm de `agent_modules_v3`.
