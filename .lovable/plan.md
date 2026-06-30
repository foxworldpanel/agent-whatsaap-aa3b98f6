## Disparos Ativos — Campanhas de Outbound

Implementa sistema completo de disparos ativos no menu **Disparos**, com campanha pré-configurada "Músicos e Artistas", follow-ups automáticos, importação CSV e relatórios.

---

### 1. Banco de dados (migração)

**Tabela `blast_campaigns`** — configuração da campanha
- `name`, `whatsapp_number_id` (FK), `start_time`, `end_time`, `daily_limit` (200), `delay_min_sec` (45), `delay_max_sec` (90)
- `opening_message` (template com `{nome}` e `{instagram}`)
- `followup_day3_message`, `followup_day7_message`
- `state` (`parado` | `rodando` | `pausado`)
- `user_id`, timestamps

**Tabela `blast_contacts`** — lista importada por campanha
- `campaign_id`, `nome`, `telefone`, `instagram`
- `status` (`pendente` | `enviado_abertura` | `enviado_d3` | `enviado_d7` | `respondeu` | `pulado`)
- `last_sent_at`, `replied_at`, `skip_reason`

**Tabela `blast_logs`** — auditoria de cada envio
- `campaign_id`, `blast_contact_id`, `stage` (`opening`|`d3`|`d7`), `status` (`sent`|`failed`), `error`

GRANTs + RLS por `user_id` em todas. Seed automático da campanha "Músicos e Artistas" desabilitada por padrão (criada via server fn na primeira visita).

### 2. Server functions (`src/lib/blast.functions.ts`)
- `listBlastCampaigns` — lista + cria seed "Músicos e Artistas" se não existir
- `updateBlastCampaign` — edita config (horários, limite, delay, mensagens)
- `setBlastCampaignState` — parado/rodando/pausado
- `importBlastContacts` — recebe `{ campaignId, rows: [{nome,telefone,instagram}] }`, valida com zod, insere em lote
- `listBlastContacts` — preview da lista com paginação
- `getBlastReport` — agrega: total disparado, taxa resposta, convertidos, sem resposta

### 3. Dispatcher (cron route)

**`src/routes/api/public/hooks/blast-dispatcher.ts`** — chamado por `pg_cron` a cada minuto:
- Para cada campanha `rodando`, dentro do horário (9-20h), respeita `daily_limit`
- Seleciona próximo `blast_contact` elegível (pendente OU pronto pra d3/d7 baseado em `last_sent_at`)
- **Regras de skip**: contato com status `bloqueado`/`convertido` em `contacts`, ou já respondeu (verifica `messages` inbound após `last_sent_at`)
- Envia via `uazapiSendText`, atualiza status, registra `blast_logs`
- Delay aleatório 45-90s entre envios da mesma campanha (controlado por `last_sent_at` global da campanha)

Cron registrado via `supabase--insert` (a cada 1 min).

### 4. Integração com webhook existente

Em `uazapi-webhook.ts` (inbound): quando recebe mensagem de telefone listado em `blast_contacts` com status diferente de `respondeu` → marca `respondeu`, registra `replied_at`, e deixa o agente Júlia assumir normalmente (fluxo atual já trata).

### 5. UI — `src/routes/_authenticated/disparos.tsx`

Adiciona nova seção **Disparos Ativos** acima das campanhas existentes:
- Card da campanha "Músicos e Artistas" com:
  - Select de número WhatsApp
  - Inputs: horário início/fim, limite diário, delay min/max
  - Textareas: abertura, follow-up D3, follow-up D7 (com hint de variáveis `{nome}`, `{instagram}`)
  - Botões **Iniciar / Pausar / Retomar**
- Bloco **Importar contatos** (CSV upload):
  - Parse client-side (cabeçalho `nome,telefone,instagram`), preview em tabela (primeiras 20 linhas + total)
  - Botão "Confirmar importação"
- Bloco **Relatório** (cards): total disparado, taxa resposta (%), convertidos, sem resposta

### 6. Detalhes técnicos

- Templates substituem `{nome}` e `{instagram}` antes do envio
- Respeita kill switches já existentes (`agent_enabled` global, conversa `agent_enabled`, `needs_review`)
- Validação CSV: telefone normalizado (apenas dígitos, min 10), nome obrigatório, instagram opcional (default vazio → template usa string vazia)
- Sem dependência nova de parsing CSV (parser simples inline com `split` e detecção de delimitador)

### Arquivos a criar/editar

- **Novo**: `src/lib/blast.functions.ts`, `src/routes/api/public/hooks/blast-dispatcher.ts`
- **Editar**: `src/routes/_authenticated/disparos.tsx`, `src/routes/api/public/hooks/uazapi-webhook.ts` (hook de resposta)
- **Migração**: 3 tabelas + GRANTs + RLS
- **Insert**: `cron.schedule` para dispatcher (1 min)
