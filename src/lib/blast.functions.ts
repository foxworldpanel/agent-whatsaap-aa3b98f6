import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SEED_NAME = "Músicos e Artistas";
const SEED_OPENING =
  "Oi {nome}! Tudo bem?\n\nVi seu perfil no Instagram @{instagram} — conteúdo muito bom!\n\nTenho algo que pode acelerar muito o crescimento do seu perfil. Posso te explicar?";
const SEED_D3 =
  "Oi {nome}! Passando pra deixar uma dica rápida sobre crescimento no Spotify e Instagram. Tem interesse?";
const SEED_D7 =
  "Oi {nome}! Última mensagem — se quiser crescer seu perfil nas redes é só me chamar 😊";

export const listBlastCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("blast_campaigns")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = data ?? [];
    if (!list.find((c) => c.name === SEED_NAME)) {
      const { data: seed, error: insErr } = await context.supabase
        .from("blast_campaigns")
        .insert({
          user_id: context.userId,
          name: SEED_NAME,
          start_time: "09:00",
          end_time: "20:00",
          daily_limit: 200,
          delay_min_sec: 45,
          delay_max_sec: 90,
          opening_message: SEED_OPENING,
          followup_day3_message: SEED_D3,
          followup_day7_message: SEED_D7,
          state: "parado",
        })
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      list.push(seed);
    }
    return list;
  });

export const updateBlastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        whatsapp_number_id: z.string().uuid().nullable().optional(),
        contact_list_id: z.string().uuid().nullable().optional(),
        categoria_ids: z.array(z.string().uuid()).optional(),
        start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        daily_limit: z.number().int().min(1).max(5000).optional(),
        delay_min_sec: z.number().int().min(5).max(3600).optional(),
        delay_max_sec: z.number().int().min(5).max(3600).optional(),
        opening_message: z.string().max(4000).optional(),
        followup_day3_message: z.string().max(4000).optional(),
        followup_day7_message: z.string().max(4000).optional(),
        dispatch_mode: z.enum(["agente_livre", "fluxo_visual"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch = { ...rest } as typeof rest;
    if (patch.start_time && patch.start_time.length === 5) patch.start_time = patch.start_time + ":00";
    if (patch.end_time && patch.end_time.length === 5) patch.end_time = patch.end_time + ":00";
    const { error } = await context.supabase
      .from("blast_campaigns")
      .update(patch as never)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBlastCampaignState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        state: z.enum(["parado", "rodando", "pausado"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_campaigns")
      .update({ state: data.state })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

function warmupLimitForDay(day: number, configured: number): number {
  if (day <= 0) return Math.min(50, configured);
  if (day === 1) return Math.min(50, configured);
  if (day === 2) return Math.min(100, configured);
  if (day === 3) return Math.min(150, configured);
  return Math.min(200, configured);
}

export function effectiveDailyLimit(opts: {
  warmup_enabled: boolean | null | undefined;
  warmup_started_at: string | null | undefined;
  daily_limit: number;
}): { limit: number; day: number; warming: boolean } {
  const cfg = Math.max(1, Math.min(opts.daily_limit ?? 200, 5000));
  if (!opts.warmup_enabled || !opts.warmup_started_at) {
    return { limit: Math.min(cfg, 200), day: 0, warming: false };
  }
  const started = new Date(opts.warmup_started_at).getTime();
  const day = Math.floor((Date.now() - started) / 86400000) + 1;
  const limit = warmupLimitForDay(day, cfg);
  return { limit, day, warming: day < 4 };
}

export const importBlastContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              nome: z.string().trim().min(1).max(120),
              telefone: z.string().trim().min(5).max(40),
              instagram: z.string().trim().max(80).optional().default(""),
              prioridade: z.number().int().min(0).max(100000).optional(),
              ultima_interacao: z
                .string()
                .trim()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .or(z.literal("")),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1) normalize & validate
    let invalid = 0;
    const todayEpochDay = Math.floor(Date.now() / 86400000);
    const normalized = data.rows
      .map((r) => {
        const ult = r.ultima_interacao && r.ultima_interacao.length === 10 ? r.ultima_interacao : null;
        // Prioridade automática: contatos com interação recente recebem score alto.
        // Hoje = 1000; cada dia atrás reduz 10 pontos (mínimo 0). Manual sobrescreve.
        let prioridade = r.prioridade ?? 0;
        if (!r.prioridade && ult) {
          const day = Math.floor(new Date(ult + "T00:00:00Z").getTime() / 86400000);
          const diff = todayEpochDay - day;
          prioridade = Math.max(0, 1000 - Math.max(0, diff) * 10);
        }
        return {
          nome: r.nome,
          telefone: normalizePhone(r.telefone),
          instagram: (r.instagram ?? "").replace(/^@/, ""),
          prioridade,
          ultima_interacao: ult,
        };
      })
      .filter((r) => {
        const ok = r.telefone.length >= 10 && r.telefone.length <= 15;
        if (!ok) invalid += 1;
        return ok;
      });

    // 2) dedup within the batch
    let dupBatch = 0;
    const seen = new Set<string>();
    const uniq = normalized.filter((r) => {
      if (seen.has(r.telefone)) { dupBatch += 1; return false; }
      seen.add(r.telefone);
      return true;
    });

    // 3) dedup against existing blast_contacts in same campaign
    let dupExisting = 0;
    if (uniq.length > 0) {
      const { data: existing } = await context.supabase
        .from("blast_contacts")
        .select("telefone")
        .eq("user_id", context.userId)
        .eq("campaign_id", data.campaignId)
        .in("telefone", uniq.map((r) => r.telefone));
      const exSet = new Set((existing ?? []).map((r) => r.telefone as string));
      const filtered = uniq.filter((r) => {
        if (exSet.has(r.telefone)) { dupExisting += 1; return false; }
        return true;
      });
      uniq.length = 0;
      uniq.push(...filtered);
    }

    // 4) cross-check blocked / converted contacts
    let blocked = 0;
    if (uniq.length > 0) {
      const { data: blockedRows } = await context.supabase
        .from("contacts")
        .select("telefone, status")
        .eq("user_id", context.userId)
        .in("telefone", uniq.map((r) => r.telefone));
      const badStatuses = new Set(["bloqueado", "cliente", "convertido"]);
      const bad = new Set(
        (blockedRows ?? [])
          .filter((r) => badStatuses.has(r.status as string))
          .map((r) => r.telefone as string),
      );
      const filtered = uniq.filter((r) => {
        if (bad.has(r.telefone)) { blocked += 1; return false; }
        return true;
      });
      uniq.length = 0;
      uniq.push(...filtered);
    }

    if (uniq.length === 0) {
      return { inserted: 0, removed: { duplicates: dupBatch + dupExisting, invalid, blocked } };
    }

    const payload = uniq.map((r) => ({
      user_id: context.userId,
      campaign_id: data.campaignId,
      nome: r.nome,
      telefone: r.telefone,
      instagram: r.instagram,
      prioridade: r.prioridade,
      ultima_interacao: r.ultima_interacao,
      status: "pendente" as const,
    }));
    const { error, count } = await context.supabase
      .from("blast_contacts")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return {
      inserted: count ?? payload.length,
      removed: { duplicates: dupBatch + dupExisting, invalid, blocked },
    };
  });

export const testBlastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      campaignId: z.string().uuid(),
      phone: z.string().trim().min(8).max(40),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone);
    if (phone.length < 10 || phone.length > 15) throw new Error("Telefone inválido (use DDI+DDD+número, só dígitos).");

    const { data: camp, error: campErr } = await context.supabase
      .from("blast_campaigns")
      .select("id, user_id, whatsapp_number_id, opening_message")
      .eq("id", data.campaignId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (campErr) throw new Error(campErr.message);
    if (!camp) throw new Error("Campanha não encontrada");

    // Lookup credentials (number first, then integrations fallback) using admin client (server-only secrets)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let url: string | undefined;
    let token: string | undefined;
    if (camp.whatsapp_number_id) {
      const { data: num } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("uazapi_url, uazapi_token")
        .eq("id", camp.whatsapp_number_id)
        .maybeSingle();
      url = num?.uazapi_url ?? undefined;
      token = num?.uazapi_token ?? undefined;
    }
    if (!url || !token) {
      const { data: integ } = await supabaseAdmin
        .from("integrations")
        .select("uazapi_url, uazapi_token")
        .eq("user_id", context.userId)
        .maybeSingle();
      url = integ?.uazapi_url ?? undefined;
      token = integ?.uazapi_token ?? undefined;
    }
    if (!url || !token) throw new Error("Uazapi não configurado para este número");

    const rendered = (camp.opening_message ?? "")
      .replace(/\{nome\}/gi, "Teste")
      .replace(/\{instagram\}/gi, "teste");

    // Abertura SEMPRE em bolhas separadas (mesma regra do dispatcher).
    const messageParts = splitOpeningParts(rendered);
    if (messageParts.length === 0) throw new Error("Mensagem de abertura vazia");

    const { uazapiSendText } = await import("@/lib/uazapi.server");
    for (let i = 0; i < messageParts.length; i++) {
      await uazapiSendText({ uazapi_url: url, uazapi_token: token }, phone, messageParts[i]);
      if (i < messageParts.length - 1) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
      }
    }

    // 🔴 Espelha abertura em contacts/conversations/messages para que o histórico
    // do Claude tenha o contexto quando o cliente responder — mesmo caminho do
    // dispatcher, agora aplicado ao envio de teste (inclusive reenvio em
    // conversas já existentes).
    try {
      const phoneDigits = phone;
      let contactId: string | null = null;
      {
        const { data: existing } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("user_id", context.userId)
          .eq("telefone", phoneDigits)
          .maybeSingle();
        if (existing?.id) {
          contactId = existing.id;
        } else {
          const ins = await supabaseAdmin
            .from("contacts")
            .insert({
              user_id: context.userId,
              telefone: phoneDigits,
              nome: "Teste",
              source: "disparo",
              status: "em_conversa",
              whatsapp_number_id: camp.whatsapp_number_id ?? null,
            } as never)
            .select("id")
            .single();
          if (ins.error) throw new Error(`test mirror contact insert failed: ${ins.error.message}`);
          contactId = ins.data?.id ?? null;
        }
      }
      if (!contactId) throw new Error("test mirror contact missing after lookup/insert");
      {
        const { data: convRows, error: convErr } = await (supabaseAdmin as any).rpc(
          "get_or_create_active_conversation",
          {
            _user_id: context.userId,
            _contact_id: contactId,
            _whatsapp_number_id: camp.whatsapp_number_id ?? null,
            _initial_status: "aguardando",
          },
        );
        if (convErr) throw convErr;
        const convId: string | null = convRows?.[0]?.id ?? null;
        if (!convId) throw new Error("test mirror conversation missing after rpc");
        {
          const nowIso = new Date().toISOString();
          const { logEvent } = await import("@/lib/agent-logger.server");
          for (let idx = 0; idx < messageParts.length; idx++) {
            const part = messageParts[idx];
            await logEvent({
              userId: context.userId,
              phone,
              conversationId: convId,
              type: "blast_debug_opening_message_insert_before",
              level: "error",
              summary: `🔥 DEBUG TESTE ANTES insert abertura ${idx + 1}/${messageParts.length}`,
              response: part,
              metadata: {
                origem: "debug_teste_disparo",
                campaign_id: camp.id,
                conversation_id: convId,
                part_index: idx,
                part_total: messageParts.length,
                body: part,
              },
            });
            const insertResult = await supabaseAdmin.from("messages").insert({
              user_id: context.userId,
              conversation_id: convId,
              sender: "agente",
              kind: "texto",
              body: part,
              created_at: new Date(Date.now() + idx).toISOString(),
            } as never);
            if (insertResult.error) {
              await logEvent({
                userId: context.userId,
                phone,
                conversationId: convId,
                type: "blast_debug_opening_message_insert_after",
                level: "error",
                summary: `🔥 DEBUG TESTE DEPOIS insert abertura ${idx + 1}/${messageParts.length}: ERRO`,
                response: part,
                error: JSON.stringify(insertResult.error),
                metadata: {
                  origem: "debug_teste_disparo",
                  campaign_id: camp.id,
                  conversation_id: convId,
                  part_index: idx,
                  part_total: messageParts.length,
                  body: part,
                  insert_ok: false,
                  insert_error: insertResult.error,
                },
              });
              throw new Error(`test mirror message insert failed: ${insertResult.error.message}`);
            }
            await logEvent({
              userId: context.userId,
              phone,
              conversationId: convId,
              type: "blast_debug_opening_message_insert_after",
              level: "error",
              summary: `🔥 DEBUG TESTE DEPOIS insert abertura ${idx + 1}/${messageParts.length}: SUCESSO`,
              response: part,
              metadata: {
                origem: "debug_teste_disparo",
                campaign_id: camp.id,
                conversation_id: convId,
                part_index: idx,
                part_total: messageParts.length,
                body: part,
                insert_ok: true,
              },
            });
          }
          await supabaseAdmin
            .from("conversations")
            .update({
              last_message_preview: messageParts.join("\n\n").slice(0, 120),
              last_message_at: nowIso,
              status: "aguardando",
            } as never)
            .eq("id", convId);
        }
      }
    } catch (e) {
      console.error("[testBlastCampaign] failed to mirror opener into messages", e);
      try {
        const { logEvent } = await import("@/lib/agent-logger.server");
        await logEvent({
          userId: context.userId,
          phone,
          type: "blast_debug_opening_message_insert_after",
          level: "error",
          summary: "🔥 DEBUG TESTE falhou ao espelhar abertura no histórico",
          error: (e as Error)?.stack ?? (e as Error)?.message ?? String(e),
          metadata: {
            origem: "debug_teste_disparo",
            campaign_id: camp.id,
            insert_ok: false,
          },
        });
      } catch {}
      throw e;
    }

    return { ok: true, sentTo: phone, parts: messageParts.length };
  });

// Espelha normalizeOpeningParts do dispatcher — abertura em 3 bolhas quando possível.
function splitOpeningParts(text: string): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  const blocks = raw.split(/\n\s*\n|\n+/).map((s) => s.trim()).filter(Boolean);
  if (blocks.length >= 3) return blocks.slice(0, 3);
  if (blocks.length === 2) {
    const tail = blocks[1].match(/^(.+?[.!])\s+([^.!?]+\?)$/);
    if (tail) return [blocks[0], tail[1].trim(), tail[2].trim()];
    return blocks;
  }
  const sentences =
    raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [raw];
  if (sentences.length >= 3) {
    return [
      sentences[0],
      sentences.slice(1, -1).join(" "),
      sentences[sentences.length - 1],
    ].filter(Boolean);
  }
  return sentences;
}

export const getNumberHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ numberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: num, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, status, warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, last_risk_check_at")
      .eq("id", data.numberId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!num) {
      return {
        sent24h: 0,
        failed24h: 0,
        failRate: 0,
        risk_level: "ok" as const,
        auto_pause_on_risk: false,
        warmup_enabled: false,
        warmup_started_at: null as string | null,
        connection_status: null as string | null,
        not_found: true as const,
      };
    }

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: camps } = await context.supabase
      .from("blast_campaigns")
      .select("id")
      .eq("user_id", context.userId)
      .eq("whatsapp_number_id", data.numberId);
    const campIds = (camps ?? []).map((c) => c.id);
    let sent = 0;
    let failed = 0;
    if (campIds.length > 0) {
      const { data: logs } = await context.supabase
        .from("blast_logs")
        .select("status")
        .in("campaign_id", campIds)
        .gte("created_at", since);
      for (const l of logs ?? []) {
        if (l.status === "sent") sent += 1;
        else if (l.status === "failed") failed += 1;
      }
    }
    const total = sent + failed;
    const failRate = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;
    let level: "ok" | "warning" | "danger" = "ok";
    if (failRate >= 30) level = "danger";
    else if (failRate >= 15) level = "warning";

    // Persist risk level so the dispatcher can act on it
    await supabaseAdmin
      .from("whatsapp_numbers")
      .update({ risk_level: level, last_risk_check_at: new Date().toISOString() })
      .eq("id", data.numberId)
      .eq("user_id", context.userId);

    return {
      sent24h: sent,
      failed24h: failed,
      failRate,
      risk_level: level,
      auto_pause_on_risk: !!num.auto_pause_on_risk,
      warmup_enabled: !!num.warmup_enabled,
      warmup_started_at: num.warmup_started_at,
      connection_status: num.status,
    };
  });

export const listBlastContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: camp, error: campErr } = await context.supabase
      .from("blast_campaigns")
      .select("id, contact_list_id, categoria_ids")
      .eq("id", data.campaignId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (campErr) throw new Error(campErr.message);

    const SELECT = "id, nome, telefone, instagram, status, last_sent_at, replied_at";
    let catIds = ((camp?.categoria_ids as string[] | null) ?? []).filter(Boolean);
    if (catIds.length === 0) {
      const { data: defaults } = await context.supabase
        .from("contact_categories")
        .select("id")
        .eq("user_id", context.userId)
        .in("slug", ["lead_instagram", "meta_ads"]);
      catIds = (defaults ?? []).map((c) => c.id as string).filter(Boolean);
    }
    let q = context.supabase
      .from("blast_contacts")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (catIds.length > 0) q = q.in("categoria_id", catIds);
    else if (camp?.contact_list_id) q = q.eq("contact_list_id", camp.contact_list_id);
    else q = q.eq("campaign_id", data.campaignId);

    let { data: rows, error } = await q;
    if (!error && (rows ?? []).length === 0 && (catIds.length > 0 || camp?.contact_list_id)) {
      // Fallback para campanhas antigas migradas: a base unificada pode não ter
      // campaign_id/list_id compatível, mas os contatos pertencem ao mesmo usuário.
      const fallback = await context.supabase
        .from("blast_contacts")
        .select(SELECT)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(200);
      rows = fallback.data;
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getBlastReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: camp, error: campErr } = await context.supabase
      .from("blast_campaigns")
      .select("id, contact_list_id, categoria_ids")
      .eq("id", data.campaignId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (campErr) throw new Error(campErr.message);

    let catIds = ((camp?.categoria_ids as string[] | null) ?? []).filter(Boolean);
    if (catIds.length === 0) {
      const { data: defaults } = await context.supabase
        .from("contact_categories")
        .select("id")
        .eq("user_id", context.userId)
        .in("slug", ["lead_instagram", "meta_ads"]);
      catIds = (defaults ?? []).map((c) => c.id as string).filter(Boolean);
    }
    let q = context.supabase
      .from("blast_contacts")
      .select("status")
      .eq("user_id", context.userId);
    if (catIds.length > 0) q = q.in("categoria_id", catIds);
    else if (camp?.contact_list_id) q = q.eq("contact_list_id", camp.contact_list_id);
    else q = q.eq("campaign_id", data.campaignId);

    let { data: rows, error } = await q;
    if (!error && (rows ?? []).length === 0 && (catIds.length > 0 || camp?.contact_list_id)) {
      const fallback = await context.supabase
        .from("blast_contacts")
        .select("status")
        .eq("user_id", context.userId);
      rows = fallback.data;
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const total = list.length;
    const sent = list.filter((r) =>
      ["enviado_abertura", "enviado_d3", "enviado_d7", "respondeu", "convertido"].includes(r.status as string),
    ).length;
    const replied = list.filter((r) => r.status === "respondeu" || r.status === "convertido").length;
    const converted = list.filter((r) => r.status === "convertido").length;
    const noReply = list.filter((r) =>
      ["enviado_abertura", "enviado_d3", "enviado_d7"].includes(r.status as string),
    ).length;
    const rate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
    return { total, sent, replied, converted, noReply, replyRate: rate };
  });

export const clearBlastContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_contacts")
      .delete()
      .eq("user_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const skipBlastContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_contacts")
      .update({ status: "pulado", skip_reason: "pulado manualmente" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const blockBlastContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), telefone: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_contacts")
      .update({ status: "pulado", skip_reason: "bloqueado manualmente" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await context.supabase
      .from("contacts")
      .update({ status: "bloqueado" })
      .eq("telefone", data.telefone)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const bulkBlastAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(2000),
      action: z.enum(["queue", "blacklist", "delete"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "delete") {
      const { error, count } = await context.supabase
        .from("blast_contacts")
        .delete({ count: "exact" })
        .in("id", data.ids)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { affected: count ?? data.ids.length };
    }
    if (data.action === "queue") {
      const { error, count } = await context.supabase
        .from("blast_contacts")
        .update({ status: "pendente", skip_reason: null }, { count: "exact" })
        .in("id", data.ids)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { affected: count ?? data.ids.length };
    }
    // blacklist
    const { data: rows, error: e0 } = await context.supabase
      .from("blast_contacts")
      .select("telefone")
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (e0) throw new Error(e0.message);
    const { error, count } = await context.supabase
      .from("blast_contacts")
      .update({ status: "pulado", skip_reason: "bloqueado manualmente" }, { count: "exact" })
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const phones = (rows ?? []).map((r) => r.telefone as string).filter(Boolean);
    if (phones.length > 0) {
      await context.supabase
        .from("contacts")
        .update({ status: "bloqueado" })
        .in("telefone", phones)
        .eq("user_id", context.userId);
    }
    return { affected: count ?? data.ids.length };
  });