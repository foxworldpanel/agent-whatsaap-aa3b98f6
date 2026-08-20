# SECURITY SPRINT 1 - CORREÇÃO DAS VULNERABILIDADES CRÍTICAS

## Objetivo
Corrigir vulnerabilidades críticas de segurança (RLS, Webhooks, Security Definer) para garantir isolamento de dados e proteção de endpoints.

## Etapas

### 1. Isolamento do Lead Finder
Revisar políticas RLS para garantir que usuários autenticados acessem apenas seus próprios dados no Lead Finder.
- **Tabelas**: `lead_finder_leads`, `lead_finder_jobs`, `lead_finder_timeline`, `lead_finder_tags`, `lead_finder_credentials`, `lead_finder_provider_runs`, `lead_finder_providers`.
- **Ação**: Adicionar coluna `user_id` onde faltar (ex: leads) e atualizar políticas para `auth.uid() = user_id` ou `auth.uid() = created_by`.

### 2. Proteção de Traces e Logs
Restringir acesso a logs de execução e debug apenas para usuários autenticados (ou admin), removendo acesso anônimo.
- **Tabelas**: `agent_execution_traces`, `funnel_debug_trace`.
- **Ação**: Remover políticas `anon`, ajustar permissões para `authenticated` e garantir que não haja vazamento de PII.

### 3. Autenticação de Webhooks
Implementar verificação de token nos endpoints públicos do Uazapi.
- **Arquivo**: `src/routes/api/public/hooks/uazapi-webhook.ts`.
- **Ação**: Validar o cabeçalho `x-uazapi-token` (ou similar) contra um segredo armazenado no ambiente (`UAZAPI_WEBHOOK_SECRET`).

### 4. Auditoria de SECURITY DEFINER
Revisar funções com `SECURITY DEFINER` para prevenir escalada de privilégios.
- **Ação**: Garantir `SET search_path = public`, revogar `EXECUTE` de `public`/`anon` e adicionar checks de `auth.uid()` internos.

### 5. Proteção de Tokens e Credenciais
Garantir que segredos e integrações compartilhadas não sejam acessíveis indevidamente.
- **Tabelas**: `integrations`, `whatsapp_numbers`.
- **Ação**: Refinar RLS para evitar que a troca de um token permita acesso a workspaces de terceiros.

## Detalhes Técnicos
- Migrações SQL com `GRANT` explícito.
- Implementação de `UAZAPI_WEBHOOK_SECRET` via `secrets--add_secret`.
- Uso de `supabaseAdmin` apenas em contextos estritamente necessários no servidor.
