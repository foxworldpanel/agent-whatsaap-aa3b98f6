import { createFileRoute } from "@tanstack/react-router";

// Números Uazapi podem ser compartilhados entre usuários que usam o mesmo
// uazapi_token (mesmo "workspace" Uazapi). O dispatcher precisa considerar
// esse pool compartilhado — não só numbers.user_id == camp.user_id — senão
// campanhas de um usuário que usa um número cadastrado por outro do mesmo
// workspace veem "nenhum número conectado disponível".
async function getSharedUazapiUserIdsForDispatcher(userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: own } = await supabaseAdmin
    .from("integrations")
    .select("uazapi_token")
    .eq("user_id", userId)
    .maybeSingle();
  const token = own?.uazapi_token;
  if (!token) return [userId];
  const { data: peers } = await supabaseAdmin
    .from("integrations")
    .select("user_id")
    .eq("uazapi_token", token);
  return Array.from(new Set([userId, ...(peers ?? []).map((r) => r.user_id as string)]));
}

// Disparos ativos. Chamado por pg_cron a cada minuto.
// Para cada campanha 'rodando', dentro do horário e respeitando o limite diário,
// envia próxima mensagem (abertura, follow-up D3 ou D7) ao próximo contato elegível,
// respeitando os toggles globais (agent_enabled), contatos bloqueados/convertidos e
// contatos que já responderam.

export const Route = createFileRoute("/api/public/hooks/blast-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { uazapiSendText } = await import("@/lib/uazapi.server");
        const {
          montarMensagemDisparo,
          DEFAULT_TEMPLATES,
          saudacaoIdxFromKey,
          detectLanguageFromPhone,
          DEFAULT_DDI_LANGUAGE_MAP,
        } = await import("@/lib/blast-variations");
        const { _toTemplates } = await import("@/lib/opening-templates.functions");

        // Body opcional: { campaignId?, now?: boolean }
        let opts: { campaignId?: string; now?: boolean } = {};
        try {
          const t = await request.text();
          if (t) opts = JSON.parse(t);
        } catch { /* body vazio */ }
        const bypass = opts.now === true;

        let q = supabaseAdmin
          .from("blast_campaigns")
          .select("*")
          .eq("state", "rodando");
        if (opts.campaignId) q = q.eq("id", opts.campaignId);
        const { data: camps, error } = await q;
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ campaign: string; sent: number; skipped?: string; error?: string }> = [];
        const { logEvent } = await import("@/lib/agent-logger.server");

        if ((camps ?? []).length === 0 && opts.campaignId) {
          const { data: campRow } = await supabaseAdmin
            .from("blast_campaigns")
            .select("id, user_id, name, state")
            .eq("id", opts.campaignId)
            .maybeSingle();
          if (campRow) {
            await logEvent({
              userId: campRow.user_id,
              type: "blast_skipped",
              level: "warn",
              summary: `🚀 Dispatcher chamado, mas campanha não está rodando (estado atual: ${campRow.state})`,
              metadata: { origem: "disparo", direcao: "enviado", tipo: "bloqueio", campaign_id: campRow.id, reason: "campanha não está rodando", state: campRow.state },
            });
            return Response.json({ ran: 1, results: [{ campaign: campRow.name, sent: 0, skipped: `campanha não está rodando (${campRow.state})` }] });
          }
        }

        for (const camp of camps ?? []) {
          try {
            if (opts.campaignId || bypass) {
              await logEvent({
                userId: camp.user_id,
                type: "blast_worker_tick",
                level: "info",
                summary: `🚀 Worker processando campanha ${camp.name}`,
                metadata: { origem: "disparo", direcao: "enviado", tipo: "processamento", campaign_id: camp.id, now: bypass },
              });
            }
            const now = new Date();
            // Plataforma opera 24h — sem janela de horário e sem distribuição
            // natural por hora do dia. Todos os ticks processam normalmente.

            // Delay aleatório entre disparos por campanha
            if (!bypass && camp.last_dispatch_at) {
              const since = Date.now() - new Date(camp.last_dispatch_at).getTime();
              const minMs = (camp.delay_min_sec ?? 45) * 1000;
              const maxMs = (camp.delay_max_sec ?? 90) * 1000;
              const required = minMs + Math.random() * (maxMs - minMs);
              if (since < required) {
                results.push({ campaign: camp.name, sent: 0, skipped: "delay" });
                await logEvent({ userId: camp.user_id, type: "blast_skipped", level: "info", summary: "🚀 Disparo aguardando delay entre mensagens", metadata: { origem: "disparo", direcao: "enviado", tipo: "bloqueio", campaign_id: camp.id, reason: "delay", remaining_ms: Math.round(required - since) } });
                continue;
              }
            }

            // Carregar pool de números ativos para rotação round-robin.
            // Elegível: disparos_mode=true, status conectado, risco != danger,
            // e (se auto_pause_on_risk desligado) qualquer risco aceito.
            type NumberRow = {
              id: string;
              user_id: string;
              uazapi_url: string | null;
              uazapi_token: string | null;
              warmup_started_at: string | null;
              warmup_enabled: boolean | null;
              auto_pause_on_risk: boolean | null;
              risk_level: string | null;
              disparos_mode: boolean | null;
              meta_ads_enabled: boolean | null;
              status: string | null;
              nome: string | null;
            };
            const { data: allNums } = await supabaseAdmin
              .from("whatsapp_numbers")
              .select("id, user_id, uazapi_url, uazapi_token, warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, disparos_mode, meta_ads_enabled, status, nome")
              .in("user_id", await getSharedUazapiUserIdsForDispatcher(camp.user_id));
            const allNumbers = (allNums as unknown as NumberRow[] | null) ?? [];
            const isConnected = (s: string | null | undefined) => {
              const v = (s ?? "").toLowerCase();
              return v === "connected" || v === "conectado" || v === "online";
            };
            // Qualquer número conectado pode disparar. O toggle disparos_mode
            // deixou de ser um filtro de elegibilidade — todos os números
            // conectados entram no round-robin.
            const pool = allNumbers
              .filter((n) => n.uazapi_url && n.uazapi_token)
              .filter((n) => isConnected(n.status))
              .filter((n) => !(n.auto_pause_on_risk && n.risk_level === "danger"))
              .sort((a, b) => a.id.localeCompare(b.id));

            let numberRow: NumberRow | null = null;
            if (pool.length === 0) {
              results.push({ campaign: camp.name, sent: 0, skipped: "nenhum número conectado disponível para disparo" });
              await logEvent({ userId: camp.user_id, type: "blast_failed", level: "error", summary: "❌ Disparo sem número conectado disponível", error: "Nenhum número conectado disponível para disparo", metadata: { origem: "disparo", direcao: "enviado", tipo: "erro", campaign_id: camp.id, total_numbers: allNumbers.length } });
              await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
              continue;
            }

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("blast_logs")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", camp.id)
              .eq("status", "sent")
              .gte("created_at", startOfDay.toISOString());

            // Prioridade ABSOLUTA: se a campanha tem um número específico
            // selecionado no dropdown (whatsapp_number_id), usa SEMPRE esse
            // número — sem round-robin, sem fallback silencioso para outro.
            // Round-robin só entra quando a campanha NÃO tem número fixo.
            if (camp.whatsapp_number_id) {
              const fixed = pool.find((n) => n.id === camp.whatsapp_number_id) ?? null;
              if (!fixed) {
                const exists = allNumbers.find((n) => n.id === camp.whatsapp_number_id) ?? null;
                const reason = !exists
                  ? "número selecionado não encontrado"
                  : !isConnected(exists.status)
                    ? `número selecionado não está conectado (status=${exists.status ?? "desconhecido"})`
                    : exists.auto_pause_on_risk && exists.risk_level === "danger"
                      ? "número selecionado em risco (danger) com auto_pause_on_risk ligado"
                      : "número selecionado sem credenciais uazapi";
                results.push({ campaign: camp.name, sent: 0, skipped: reason });
                await logEvent({
                  userId: camp.user_id,
                  type: "blast_skipped",
                  level: "error",
                  summary: `❌ Disparo bloqueado — ${reason}`,
                  metadata: {
                    origem: "disparo",
                    direcao: "enviado",
                    tipo: "bloqueio",
                    campaign_id: camp.id,
                    reason,
                    selected_number_id: camp.whatsapp_number_id,
                    selected_number_name: exists?.nome ?? null,
                    selected_number_status: exists?.status ?? null,
                  },
                });
                await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
                continue;
              }
              numberRow = fixed;
            } else {
              // Sem número fixo: round-robin baseado no total enviado hoje.
              const rrIndex = (sentToday ?? 0) % pool.length;
              numberRow = pool[rrIndex];
            }

            // Escolher próximo contato e estágio ANTES das travas para que o
            // painel/log informe a causa real (sem contato vs limite/agente) e
            // para números de teste poderem ignorar limites/blacklist.
            const next = await pickNext(supabaseAdmin, camp);
            if (!next) {
              console.log(`[blast-dispatcher] ${camp.name}: sem contatos elegíveis (list_id=${camp.contact_list_id ?? "null"})`);
              results.push({ campaign: camp.name, sent: 0, skipped: "sem contatos elegíveis" });
              await logEvent({ userId: camp.user_id, type: "blast_skipped", level: "warn", summary: "🚀 Disparo sem contatos elegíveis para enviar", metadata: { origem: "disparo", direcao: "enviado", tipo: "bloqueio", campaign_id: camp.id, contact_list_id: camp.contact_list_id, categoria_ids: camp.categoria_ids ?? [], reason: "sem contatos elegíveis" } });
              await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
              continue;
            }
            const nextIsTest = await isTestPhone(supabaseAdmin, camp.user_id, next.contact.telefone);

            // Limite diário (com aquecimento progressivo) baseado no número escolhido
            const effectiveLimit = computeEffectiveLimit(
              numberRow?.warmup_enabled ?? true,
              numberRow?.warmup_started_at ?? null,
              camp.daily_limit,
            );
            if (!nextIsTest && (sentToday ?? 0) >= effectiveLimit) {
              results.push({ campaign: camp.name, sent: 0, skipped: `limite diário (${effectiveLimit})` });
              await logEvent({ userId: camp.user_id, type: "blast_skipped", level: "warn", summary: `🚀 Disparo bloqueado pelo limite diário (${effectiveLimit})`, metadata: { origem: "disparo", direcao: "enviado", tipo: "bloqueio", campaign_id: camp.id, reason: "limite diário", effectiveLimit, sentToday } });
              continue;
            }

            // Kill switches
            const { data: agent } = await supabaseAdmin
              .from("agent_config")
              .select("agent_enabled")
              .eq("user_id", camp.user_id)
              .maybeSingle();
            if (agent?.agent_enabled === false) {
              // Números de teste devem passar pelo mesmo pipeline de disparo,
              // mesmo quando o agente global foi desligado para a operação real.
              if (!nextIsTest) {
                results.push({ campaign: camp.name, sent: 0, skipped: "agente desativado" });
                await logEvent({ userId: camp.user_id, type: "blast_skipped", level: "warn", summary: "🚀 Disparo bloqueado — agente global desativado", metadata: { origem: "disparo", direcao: "enviado", tipo: "bloqueio", campaign_id: camp.id, reason: "agente desativado" } });
                await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
                continue;
              }
            }

            // Credenciais do número escolhido no round-robin
            const url = numberRow.uazapi_url!;
            const token = numberRow.uazapi_token!;
            const mirrorUserId = numberRow.user_id ?? camp.user_id;
            console.log(`[blast-dispatcher] ${camp.name}: enviando para ${next.contact.nome} ${next.contact.telefone} (stage=${next.stage})`);

            // Variação de saudação por horário na abertura de um disparo ativo.
            // Independe do rótulo do número — usa variação em qualquer opening
            // de campanha (inclusive remarketing para leads antigos).
            const useVariacao = next.stage === "opening";

            // Carrega templates editáveis do usuário
            let templates = DEFAULT_TEMPLATES;
            if (useVariacao) {
              const { data: tplRow } = await supabaseAdmin
                .from("opening_templates")
                .select(
                  "saudacoes_manha, saudacoes_tarde, saudacoes_noite, linha2, perguntas, templates_en, templates_es, ddi_language_map",
                )
                .eq("user_id", camp.user_id)
                .maybeSingle();
              templates = _toTemplates(
                tplRow as Parameters<typeof _toTemplates>[0] ?? null,
              );
            }

            // Anti-repetição da saudação: pega saudação do último envio da campanha
            let avoidSaudacaoIdx: number | null = null;
            if (useVariacao && camp.last_dispatch_at) {
              const { data: lastSent } = await supabaseAdmin
                .from("blast_contacts")
                .select("last_variation_key")
                .eq("campaign_id", camp.id)
                .not("last_variation_key", "is", null)
                .order("last_sent_at", { ascending: false })
                .limit(1);
              avoidSaudacaoIdx = saudacaoIdxFromKey(lastSent?.[0]?.last_variation_key ?? null);
            }

            const language = useVariacao
              ? detectLanguageFromPhone(
                  next.contact.telefone,
                  templates.ddiMap ?? DEFAULT_DDI_LANGUAGE_MAP,
                )
              : "pt";
            const pick = useVariacao
              ? montarMensagemDisparo(next.contact.nome, next.contact.instagram, {
                  avoidKey: next.contact.last_variation_key,
                  avoidSaudacaoIdx,
                  templates,
                  language,
                })
              : null;
            const messageParts: string[] = next.stage === "opening"
              ? pick
                ? normalizeOpeningParts(pick.parts.join("\n\n"), pick.parts)
                : normalizeOpeningParts(renderTemplate(next.template, next.contact))
              : [renderTemplate(next.template, next.contact).trim()].filter(Boolean);

            // Prepara a conversa ANTES de enviar. Assim, cada parte enviada com
            // sucesso é persistida imediatamente após o aceite da Uazapi — se o
            // worker encerrar depois, o histórico não fica vazio para a resposta
            // do cliente.
            const phoneDigits = String(next.contact.telefone).replace(/\D+/g, "");
            let mirrorConversationId: string | null = null;
            {
              const existingContact = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("user_id", mirrorUserId)
                .eq("telefone", phoneDigits)
                .maybeSingle();
              if (existingContact.error) throw new Error(`mirror contact lookup failed: ${existingContact.error.message}`);

              let contactId = existingContact.data?.id ?? null;
              if (!contactId) {
                const createdContact = await supabaseAdmin
                  .from("contacts")
                  .insert({
                    user_id: mirrorUserId,
                    telefone: phoneDigits,
                    nome: next.contact.nome ?? phoneDigits,
                    source: "disparo",
                    status: "em_conversa",
                    whatsapp_number_id: numberRow.id,
                  } as never)
                  .select("id")
                  .single();
                if (createdContact.error) throw new Error(`mirror contact insert failed: ${createdContact.error.message}`);
                contactId = createdContact.data?.id ?? null;
              }

              if (!contactId) throw new Error("mirror contact missing after lookup/insert");
              const { data: convRows, error: convErr } = await (supabaseAdmin as any).rpc(
                "get_or_create_active_conversation",
                {
                  _user_id: mirrorUserId,
                  _contact_id: contactId,
                  _whatsapp_number_id: numberRow.id,
                  _initial_status: "aguardando",
                },
              );
              if (convErr) throw new Error(`mirror conversation rpc failed: ${convErr.message}`);
              mirrorConversationId = convRows?.[0]?.id ?? null;
              if (!mirrorConversationId) throw new Error("mirror conversation missing after rpc");
            }

            let status: "sent" | "failed" = "sent";
            let errMsg: string | undefined;
            try {
              for (let i = 0; i < messageParts.length; i++) {
                const sendResult = await uazapiSendText(
                  { uazapi_url: url, uazapi_token: token },
                  next.contact.telefone,
                  messageParts[i],
                );
                await logEvent({
                  userId: mirrorUserId,
                  phone: next.contact.telefone,
                  conversationId: mirrorConversationId,
                  type: "blast_debug_opening_message_insert_before",
                  level: "error",
                  summary: `🔥 DEBUG ANTES insert abertura ${i + 1}/${messageParts.length}`,
                  response: messageParts[i],
                  metadata: {
                    origem: "debug_disparo",
                    campaign_id: camp.id,
                    blast_contact_id: next.contact.id,
                    stage: next.stage,
                    conversation_id: mirrorConversationId,
                    part_index: i,
                    part_total: messageParts.length,
                    body: messageParts[i],
                    external_id: sendResult.messageId ?? null,
                  },
                });
                const mirrorInsert = await supabaseAdmin.from("messages").insert({
                  user_id: mirrorUserId,
                  conversation_id: mirrorConversationId,
                  sender: "agente",
                  kind: "texto",
                  body: messageParts[i],
                  external_id: sendResult.messageId ?? null,
                } as never);
                if (mirrorInsert.error) {
                  await logEvent({
                    userId: mirrorUserId,
                    phone: next.contact.telefone,
                    conversationId: mirrorConversationId,
                    type: "blast_debug_opening_message_insert_after",
                    level: "error",
                    summary: `🔥 DEBUG DEPOIS insert abertura ${i + 1}/${messageParts.length}: ERRO`,
                    response: messageParts[i],
                    error: JSON.stringify(mirrorInsert.error),
                    metadata: {
                      origem: "debug_disparo",
                      campaign_id: camp.id,
                      blast_contact_id: next.contact.id,
                      stage: next.stage,
                      conversation_id: mirrorConversationId,
                      part_index: i,
                      part_total: messageParts.length,
                      body: messageParts[i],
                      insert_ok: false,
                      insert_error: mirrorInsert.error,
                    },
                  });
                  throw new Error(`mirror message insert failed: ${mirrorInsert.error.message}`);
                }
                await logEvent({
                  userId: mirrorUserId,
                  phone: next.contact.telefone,
                  conversationId: mirrorConversationId,
                  type: "blast_debug_opening_message_insert_after",
                  level: "error",
                  summary: `🔥 DEBUG DEPOIS insert abertura ${i + 1}/${messageParts.length}: SUCESSO`,
                  response: messageParts[i],
                  metadata: {
                    origem: "debug_disparo",
                    campaign_id: camp.id,
                    blast_contact_id: next.contact.id,
                    stage: next.stage,
                    conversation_id: mirrorConversationId,
                    part_index: i,
                    part_total: messageParts.length,
                    body: messageParts[i],
                    insert_ok: true,
                    external_id: sendResult.messageId ?? null,
                  },
                });
                try {
                  await logEvent({
                    userId: camp.user_id,
                    phone: next.contact.telefone,
                    type: "blast_sent",
                    level: "info",
                    summary: `🚀 Disparo enviado (${next.stage}) parte ${i + 1}/${messageParts.length} → ${next.contact.nome}: ${messageParts[i].slice(0, 80)}`,
                    response: messageParts[i],
                    metadata: {
                      origem: "disparo",
                      direcao: "enviado",
                      tipo: next.stage === "opening" ? "abertura" : `followup_${next.stage}`,
                      contato_nome: next.contact.nome,
                      to: next.contact.telefone,
                      jid: `${String(next.contact.telefone).replace(/\D+/g, "")}@s.whatsapp.net`,
                      messageId: sendResult.messageId,
                      status: sendResult.status,
                      raw: sendResult.raw,
                      ...(next.stage === "opening"
                        ? { from_blast: true, part_index: i, part_total: messageParts.length }
                        : {}),
                    } as never,
                  });
                } catch {}
                if (i < messageParts.length - 1) {
                  // Delay natural entre linhas (1s–3s) simulando digitação
                  const wait = 1000 + Math.random() * 2000;
                  await new Promise((r) => setTimeout(r, wait));
                }
              }
            } catch (e) {
              status = "failed";
              errMsg = (e as Error).message;
              try {
                await logEvent({
                  userId: camp.user_id,
                  phone: next.contact.telefone,
                  type: "blast_failed",
                  level: "error",
                  summary: `❌ Falha no disparo (${next.stage}) → ${next.contact.nome}`,
                  error: errMsg,
                  metadata: { origem: "disparo", direcao: "enviado", tipo: "erro" } as never,
                });
              } catch {}
            }

            await supabaseAdmin.from("blast_logs").insert({
              user_id: camp.user_id,
              campaign_id: camp.id,
              blast_contact_id: next.contact.id,
              stage: next.stage,
              status,
              error: errMsg,
              sent_via_number_id: numberRow.id,
            });

            if (status === "sent") {
              console.log(`[blast-dispatcher] ${camp.name}: enviado com sucesso para ${next.contact.nome}`);
              const newStatus =
                next.stage === "opening"
                  ? "enviado_abertura"
                  : next.stage === "d3"
                    ? "enviado_d3"
                    : "enviado_d7";
              const openerFull = messageParts.join("\n\n").trim();
              const nowIso = new Date().toISOString();
              const convUpdate = await supabaseAdmin
                .from("conversations")
                .update({
                  last_message_preview: openerFull.slice(0, 120),
                  last_message_at: nowIso,
                  status: "aguardando",
                } as never)
                .eq("id", mirrorConversationId);
              if (convUpdate.error) throw new Error(`mirror conversation update failed: ${convUpdate.error.message}`);
              await supabaseAdmin
                .from("blast_contacts")
                .update({
                  status: newStatus,
                  last_sent_at: new Date().toISOString(),
                  last_variation_key: pick ? pick.key : next.contact.last_variation_key,
                  sent_via_number_id: numberRow.id,
                })
                .eq("id", next.contact.id);
              await supabaseAdmin
                .from("blast_campaigns")
                .update({ last_dispatch_at: new Date().toISOString() })
                .eq("id", camp.id);
              // Primeiro envio do número → inicia aquecimento
              if (!numberRow.warmup_started_at) {
                await supabaseAdmin
                  .from("whatsapp_numbers")
                  .update({ warmup_started_at: new Date().toISOString() })
                  .eq("id", numberRow.id);
              }
              results.push({ campaign: camp.name, sent: 1, skipped: `via ${numberRow.nome ?? numberRow.id.slice(0, 6)}` });
            } else {
              console.log(`[blast-dispatcher] ${camp.name}: erro ao enviar para ${next.contact.nome}: ${errMsg}`);
              results.push({ campaign: camp.name, sent: 0, skipped: `falhou: ${errMsg}` });
              await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
            }
          } catch (e) {
            const msg = (e as Error).message;
            results.push({ campaign: camp.name, sent: 0, skipped: msg, error: msg });
            await logEvent({ userId: camp.user_id, type: "blast_failed", level: "error", summary: `❌ Dispatcher falhou na campanha ${camp.name}`, error: msg, metadata: { origem: "disparo", direcao: "enviado", tipo: "erro", campaign_id: camp.id } });
            await supabaseAdmin.from("blast_campaigns").update({ state: "pausado" }).eq("id", camp.id);
          }
        }

        return Response.json({ ran: results.length, results });
      },
    },
  },
});

function computeEffectiveLimit(
  warmupEnabled: boolean,
  startedAt: string | null,
  configured: number,
): number {
  const cfg = Math.max(1, Math.min(configured ?? 200, 5000));
  if (!warmupEnabled || !startedAt) return Math.min(cfg, 200);
  const day = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000) + 1;
  if (day === 1) return Math.min(50, cfg);
  if (day === 2) return Math.min(100, cfg);
  if (day === 3) return Math.min(150, cfg);
  return Math.min(200, cfg);
}

function renderTemplate(tpl: string, c: { nome: string; instagram: string }): string {
  return (tpl ?? "")
    .replace(/\{nome\}/gi, c.nome ?? "")
    .replace(/\{instagram\}/gi, c.instagram ?? "");
}

// Abertura SEMPRE deve sair em bolhas separadas: saudação, abordagem e pergunta.
// Se o template estiver em uma linha só, usamos frases/pontuação como fallback.
function normalizeOpeningParts(text: string, preferred?: string[]): string[] {
  const fromPreferred = (preferred ?? []).map((s) => s.trim()).filter(Boolean);
  if (fromPreferred.length >= 3) return fromPreferred.slice(0, 3);
  const raw = (text ?? "").trim();
  if (!raw) return [];
  const blocks = raw.split(/\n\s*\n|\n+/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length >= 3) return blocks.slice(0, 3);
  if (blocks.length === 2) {
    const tail = blocks[1].match(/^(.+?[.!])\s+([^.!?]+\?)$/);
    if (tail) return [blocks[0], tail[1].trim(), tail[2].trim()];
    return blocks;
  }
  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [raw];
  if (sentences.length >= 3) return [sentences[0], sentences.slice(1, -1).join(" "), sentences[sentences.length - 1]].filter(Boolean);
  return sentences;
}

type Camp = {
  id: string;
  user_id: string;
  contact_list_id?: string | null;
  categoria_ids?: string[] | null;
  opening_message: string;
  followup_day3_message: string;
  followup_day7_message: string;
};
type BlastContact = {
  id: string;
  nome: string;
  telefone: string;
  instagram: string;
  status: string;
  last_sent_at: string | null;
  last_variation_key: string | null;
};

async function pickNext(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  camp: Camp,
): Promise<{ contact: BlastContact; stage: "opening" | "d3" | "d7"; template: string } | null> {
  let catIds = (camp.categoria_ids ?? []).filter(Boolean);
  // Base unificada: se a campanha antiga ainda estiver presa a Lista A/B ou
  // sem categoria selecionada, usa automaticamente as categorias reais da Base
  // de Contatos que alimentam Disparos Ativos: Lead Instagram + Meta Ads.
  if (catIds.length === 0) {
    const { data: defaults } = await admin
      .from("contact_categories")
      .select("id")
      .eq("user_id", camp.user_id)
      .in("slug", ["lead_instagram", "meta_ads"]);
    catIds = (defaults ?? []).map((c) => c.id as string).filter(Boolean);
  }
  const useCats = catIds.length > 0;
  // Carrega origem da lista (Lista A = meta_ads, Lista B = instagram)
  let listOrigem: "meta_ads" | "instagram" | null = null;
  if (!useCats && camp.contact_list_id) {
    const { data: l } = await admin
      .from("contact_lists")
      .select("origem")
      .eq("id", camp.contact_list_id)
      .maybeSingle();
    listOrigem = (l?.origem as "meta_ads" | "instagram" | null) ?? null;
  }
  const listFilter = (q: ReturnType<typeof admin.from>) =>
    camp.contact_list_id
      ? q.eq("contact_list_id", camp.contact_list_id)
      : q.eq("campaign_id", camp.id);

  const SELECT = "id, nome, telefone, instagram, status, last_sent_at, last_variation_key";
  const baseQ = () => {
    if (useCats) {
      return admin
        .from("blast_contacts")
        .select(SELECT)
        .eq("user_id", camp.user_id)
        .in("categoria_id", catIds);
    }
    return camp.contact_list_id
      ? admin.from("blast_contacts").select(SELECT).eq("user_id", camp.user_id).eq("contact_list_id", camp.contact_list_id)
      : admin.from("blast_contacts").select(SELECT).eq("user_id", camp.user_id).eq("campaign_id", camp.id);
  };
  // 1) Pendentes (abertura)
  const { data: pend } = await baseQ()
    .eq("status", "pendente")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  void listFilter;

  for (const c of pend ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "opening", template: camp.opening_message };
  }

  // 2) Follow-up D3 (3 dias após abertura)
  const d3Cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: d3 } = await baseQ()
    .eq("status", "enviado_abertura")
    .lte("last_sent_at", d3Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d3 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "d3", template: camp.followup_day3_message };
  }

  // 3) Follow-up D7
  const d7Cutoff = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
  const { data: d7 } = await baseQ()
    .eq("status", "enviado_d3")
    .lte("last_sent_at", d7Cutoff)
    .order("last_sent_at", { ascending: true })
    .limit(20);
  for (const c of d7 ?? []) {
    if (await shouldSkip(admin, camp.user_id, c.telefone, c.id, listOrigem)) continue;
    return { contact: c as BlastContact, stage: "d7", template: camp.followup_day7_message };
  }

  return null;
}

async function shouldSkip(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  userId: string,
  phone: string,
  blastContactId: string,
  listOrigem: "meta_ads" | "instagram" | null = null,
): Promise<boolean> {
  // Números cadastrados como teste nunca devem ser filtrados por travas de
  // blacklist/status convertido/cross-list. A checagem global cobre bases
  // legadas em que o número de teste foi cadastrado em outro usuário do mesmo
  // workspace, mas o disparo pertence ao dono da instância Uazapi.
  if (await isTestPhone(admin, userId, phone)) return false;

  const { data: ct } = await admin
    .from("contacts")
    .select("id, status")
    .eq("user_id", userId)
    .eq("telefone", phone)
    .maybeSingle();
  if (ct && (ct.status === "bloqueado" || ct.status === "convertido")) {
    await admin
      .from("blast_contacts")
      .update({ status: "pulado", skip_reason: `contato ${ct.status}` })
      .eq("id", blastContactId);
    return true;
  }
  // Cross-list protection: ao disparar Lista B (instagram), pula se o número
  // já está na Lista A (meta_ads) ou já respondeu/foi enviado em qualquer campanha.
  if (listOrigem === "instagram") {
    const { data: cross } = await admin
      .from("blast_contacts")
      .select("id, status, origem")
      .eq("user_id", userId)
      .eq("telefone", phone);
    const rows = (cross ?? []) as Array<{ id: string; status: string; origem: string | null }>;
    const inMeta = rows.some((r) => r.origem === "meta_ads");
    if (inMeta) {
      await admin
        .from("blast_contacts")
        .update({ status: "pulado", skip_reason: "já está na Lista Meta Ads" })
        .eq("id", blastContactId);
      return true;
    }
    const responded = rows.some(
      (r) => r.id !== blastContactId && (r.status === "respondeu" || r.status === "convertido"),
    );
    if (responded) {
      await admin
        .from("blast_contacts")
        .update({ status: "pulado", skip_reason: "já respondeu em outra campanha" })
        .eq("id", blastContactId);
      return true;
    }
  }
  return false;
}

async function isTestPhone(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  userId: string,
  phone: string,
): Promise<boolean> {
  const normalized = phone.replace(/\D+/g, "");
  const { data: own } = await admin
    .from("test_numbers")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", normalized)
    .maybeSingle();
  if (own) return true;
  const { data: any } = await admin
    .from("test_numbers")
    .select("id")
    .eq("phone", normalized)
    .limit(1);
  return !!(any && any.length > 0);
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}