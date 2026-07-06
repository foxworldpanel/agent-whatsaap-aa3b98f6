## Fluxo de Compra de Pacote Playlist via WhatsApp

Implementação do fluxo completo end-to-end para venda automatizada dos Pacotes Eclética e Eletrônica pelo agente.

### 1. Banco de dados (migração)

**Nova tabela `playlist_sales`:**
- `id` uuid PK, `user_id`, `workspace_id`
- `contact_id`, `conversation_id`, `phone` (texto)
- `pacote` enum (`ecletica` | `eletronica`)
- `music_link` text
- `smm_order_id` text
- `amount_paid` numeric (default 49.90)
- `status` text (`aguardando_link` | `enviado` | `processando` | `completo` | `erro`)
- `pix_proof_valid` boolean, `pix_amount_detected` numeric
- `playlists_sent_at`, `completed_at`, `created_at`, `updated_at`
- RLS por `user_id` + GRANTs padrão

**Extender `agent_config`** com colunas:
- `playlist_pix_key` text (default `24981222957`)
- `playlist_pix_holder` text (default `Eliseu Mendes Oliveira`)
- `playlist_price` numeric (default 49.90)
- `playlist_ecletica_service_id` text
- `playlist_eletronica_service_id` text
- `playlist_ecletica_links` text[] (URLs das playlists para enviar ao cliente)
- `playlist_eletronica_links` text[]

### 2. Detecção de estado no agente (`src/lib/ai.server.ts`)

Adicionar detector de "compra de pacote playlist em andamento":
- Consulta a última `playlist_sales` aberta da conversa
- Se `status = aguardando_comprovante`: cria o `image_present` handler para analisar comprovante (Sonnet já é usado quando há imagem)
- Se `status = aguardando_link`: quando detectar link do Spotify no texto, dispara `smmAddOrder` com o `service` correto e persiste `smm_order_id`

### 3. Análise de comprovante (Sonnet)

No caminho já existente de análise de imagem, quando há venda de playlist em curso:
- Adicionar instrução no system para extrair: `is_pix_receipt`, `amount_brl`
- Se `amount_brl == playlist_price` → responde "Recebi R$49,90! Me manda o link da música…" e atualiza `status = aguardando_link`
- Se valor menor → cobra a diferença
- Se não é comprovante → pede reenvio

### 4. Detecção de link de música e disparo de pedido

Novo módulo `src/lib/playlist-sales.server.ts`:
- `detectSpotifyTrack(text)` → valida `open.spotify.com/track/…`
- `placePlaylistOrder({ sale, creds, serviceId, link })` → chama `smmAddOrder`
- Atualiza sale com `smm_order_id` e `status = processando`

### 5. Poll de status

Estender `src/routes/api/public/hooks/smm-poll.ts` (ou novo hook):
- A cada execução, buscar `playlist_sales` com `status = processando`
- `smmOrderStatus` → se `Completed`:
  - Envia via UAZAPI ao contato: "Sua música foi adicionada! 🎵" + links das playlists configuradas
  - `status = completo`, `completed_at = now()`

### 6. UI de configuração

Novo card em `/agente` (`src/components/agente/PlaylistCard.tsx`):
- Chave PIX + titular + valor
- Service ID Eclética / Eletrônica (select do catálogo)
- Textarea para links das playlists (1 por linha) de cada pacote

Server fns em `src/lib/agent-identity.functions.ts` (ou novo `playlist-config.functions.ts`) para load/save.

### 7. Atualização do módulo `playlist_promo`

Refletir chave PIX, valor e links vindos da config editável (injetar no prompt via `agent_config`).

### Detalhes técnicos

- `smmAddOrder` já existe em `src/lib/smm.server.ts` — reutilizar
- Sonnet vs Haiku: manter roteamento atual (`image_present` já força Sonnet)
- Envio de mensagens ao cliente: usar helper existente que fala com UAZAPI (mesmo caminho do agente)
- Cron: `pg_cron` chamando `/api/public/hooks/smm-poll` a cada 5 min já cobre — só adicionar ramo para `playlist_sales`

### Ordem de execução

1. Migração (`playlist_sales` + colunas em `agent_config`)
2. `playlist-sales.server.ts` (detect + place order + poll handler)
3. Estender `smm-poll.ts` para incluir vendas de playlist
4. Instruções no `ai.server.ts` (fluxo de comprovante + link)
5. UI `PlaylistCard.tsx` + server fns de config
6. Reforço no módulo `playlist_promo` puxando valores dinâmicos
