# Mídias do Agente (Vídeos + Artes/Promoções)

Criar um sistema único de mídias reutilizáveis, com gatilhos por palavras-chave, validade, plataforma e toggle ativo. Disponível para o agente enviar em conversa e para incluir em campanhas de disparo.

## 1. Banco — tabela `agent_medias`

Migration criando a tabela + GRANTs + RLS por `owner_id = auth.uid()`.

Colunas:
- `id uuid pk default gen_random_uuid()`
- `owner_id uuid not null references auth.users(id) on delete cascade`
- `tipo text not null check (tipo in ('video','imagem'))`
- `nome text not null`
- `url text not null` (vídeo YouTube/Drive/MP4 ou imagem no bucket)
- `storage_path text` (quando upload interno, para poder remover)
- `plataforma text not null default 'geral'` (`spotify|youtube|instagram|tiktok|kwai|facebook|geral`)
- `gatilhos text[] not null default '{}'` (palavras-chave, lowercase, sem acento na comparação)
- `data_inicio timestamptz`, `data_fim timestamptz` (nulo = sem limite; usado só para imagens/promo)
- `ativo boolean not null default true`
- `auto_no_inicio boolean not null default false` (imagem: disparo automático no início da conversa)
- `created_at`, `updated_at` com trigger `set_updated_at`

Bucket privado `agent-medias` (imagens e opcionalmente vídeos curtos) via `supabase--storage_create_bucket`, com policies em `storage.objects` restringindo por `owner_id` na primeira pasta.

## 2. Server functions (`src/lib/agent-medias.functions.ts`)

Todas com `requireSupabaseAuth`:
- `listAgentMedias({ tipo? })`
- `upsertAgentMedia(payload)` — cria/edita; valida URL de vídeo (yt/drive/mp4) e datas.
- `deleteAgentMedia({ id })` — remove do bucket se houver `storage_path`.
- `toggleAgentMedia({ id, ativo })`

Upload de imagem/vídeo é feito no cliente com `supabase.storage.from('agent-medias').upload(...)` seguido de `createSignedUrl` (1 ano), igual ao padrão do `panel-guide`.

## 3. UI — nova aba "Mídias" no Agente IA

Em `src/routes/_authenticated/agente.tsx`, adicionar dois cards abaixo do "Guia Visual do Painel":

- **Vídeos tutoriais** — lista + botão "Adicionar vídeo": nome, URL, plataforma (select), gatilhos (chips), toggle ativo.
- **Artes e promoções** — lista + botão "Adicionar arte": nome, upload de imagem, plataforma, período (date range), `auto_no_inicio`, gatilhos, toggle.

Componentes novos:
- `src/components/agente/MediasVideoCard.tsx`
- `src/components/agente/MediasArteCard.tsx`
- `src/components/agente/MediaFormDialog.tsx` (shared)

## 4. Integração no webhook (`src/routes/api/public/hooks/uazapi-webhook.ts`)

Novo helper `src/lib/agent-medias.server.ts` com:
- `pickTriggeredMedia({ ownerId, text, plataformaHint, tipo })` — normaliza texto (lower, sem acento), filtra `ativo`, dentro do período (para imagens), gatilho batendo, prioriza plataforma explícita > geral.
- `pickAutoPromoOnStart({ ownerId, plataformaHint })` — imagens `auto_no_inicio=true` e no período.

Fluxo no handler de mensagem recebida (após montar resposta do Claude, antes de enviar):
1. Detectar plataforma na mensagem (reaproveitar detector já existente em `agent-modules.ts`).
2. Se `tipo=video` casar gatilho → enviar frase curta ("Deixa eu te mandar um vídeo rápido…") + `sendMedia(url, video)`.
3. Se `tipo=imagem` casar gatilho **ou** for primeira mensagem da conversa com `auto_no_inicio` ativo → enviar imagem + legenda ("Aproveita! Hoje tem uma condição especial 🎉").
4. Registrar no `agent_logs` com `action='media_sent'`.

Guardar `last_media_sent_at` em `conversations` (nova coluna opcional via migration leve) para evitar reenvio do mesmo vídeo/arte no mesmo dia.

## 5. Integração com Disparos

Em `src/routes/_authenticated/disparos.tsx` (aba Disparo Ativo), no formulário de campanha adicionar select "Anexar mídia" listando `agent_medias` (filtrando ativas/vigentes). Persistir `media_id` em `blast_campaigns` (migration: `alter table blast_campaigns add column media_id uuid references agent_medias(id)`).

Em `src/routes/api/public/hooks/blast-dispatcher.ts`, se a campanha tiver `media_id`, enviar a mídia antes/depois da mensagem de texto conforme flag `media_position` ('antes'|'depois', default 'depois').

## 6. Detalhes técnicos

- Normalização de gatilho: `text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()` dos dois lados, match por `includes` em qualquer gatilho.
- Validação URL vídeo: aceitar `youtube.com/watch`, `youtu.be/`, `drive.google.com/file/d/`, ou terminar em `.mp4`.
- Envio via UazAPI: reutilizar helpers já existentes em `uazapi.server.ts` (`sendMediaMessage` — criar se não existir, com type `video`/`image`).
- Cache de mídias por owner com TTL curto (60s) no server para não bater no DB a cada mensagem.

## 7. Ordem de execução

1. Migration + bucket + policies.
2. `agent-medias.functions.ts` + `agent-medias.server.ts`.
3. UI (dois cards no Agente IA).
4. Hook no webhook + coluna `last_media_sent_at`.
5. Integração no disparo (coluna `media_id` + UI + dispatcher).
