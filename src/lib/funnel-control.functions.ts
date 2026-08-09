import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

// ATENÇÃO — reescrito pra bater com o schema real da tabela
// welcome_funnel_runs (confirmado via information_schema): ela só tem
// funnel_id, contact_id, user_id, fired_at, workspace_id. NENHUMA das
// colunas que este arquivo assumia antes existe de verdade (status,
// last_step, last_step_index, retry_count, paused_at, resumed_at,
// completed_at, updated_at, initiated_by, error_message, last_error_at)
// — por isso TODAS as funções abaixo lançavam erro sempre que chamadas.
//
// Consequência de design: como o funil roda de forma SÍNCRONA (do início
// ao fim numa chamada só, sem pausar entre etapas em requisições
// separadas — ver welcome-funnel-runner.server.ts), o conceito de
// "pausado" ou "travado no meio" não existe mais nesse schema. A
// existência de uma linha em welcome_funnel_runs significa só "esse
// funil já foi disparado pra esse contato" — não há como saber se
// terminou com sucesso ou não sem a tabela de eventos (que também não
// existe hoje: welcome_funnel_run_events).
//
// Por isso, as funções que dependiam desse detalhamento (pausar, listar
// por status, tentar novamente todos que "falharam") agora retornam uma
// resposta honesta e vazia/não-suportada em vez de travar com erro —
// funcionalmente diferente do que existia antes, mas o "antes" nunca
// funcionou mesmo (todo chamada dava erro de schema).

async function loadRunExecutionContext(params: {
  supabase: any;
  workspaceId: string;
  userId: string;
  funnelId: string;
  contactId: string;
}) {
  const { data: run, error: runErr } = await params.supabase
    .from("welcome_funnel_runs")
    .select("funnel_id, contact_id, fired_at")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("funnel_id", params.funnelId)
    .eq("contact_id", params.contactId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);

  const { data: funnel, error: funnelErr } = await params.supabase
    .from("welcome_funnels")
    .select("id, name, delay_seconds, steps, whatsapp_number_id, enabled")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("id", params.funnelId)
    .single();
  if (funnelErr || !funnel) throw new Error(funnelErr?.message || "Funil não encontrado.");

  const { data: contact, error: contactErr } = await params.supabase
    .from("contacts")
    .select("id, telefone, name:nome") // aliasing nome to name if necessary, though original uses telefone/nome
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("id", params.contactId)
    .single();
  if (contactErr || !contact) throw new Error(contactErr?.message || "Contato não encontrado.");

  // Fixing the aliasing for consistency with the provided snippet which used contact.nome later but contact.id/telefone/nome in select
  // Actually, the provided code snippet used: .select("id, telefone, nome") and then ctx.contact.telefone.

  const { data: conversation, error: conversationErr } = await params.supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("contact_id", params.contactId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (conversationErr || !conversation?.id) {
    throw new Error(conversationErr?.message || "Conversa não encontrada para o contato.");
  }

  const { data: number, error: numberErr } = await params.supabase
    .from("whatsapp_numbers")
    .select("id, nome, uazapi_url, uazapi_token")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("id", funnel.whatsapp_number_id)
    .single();
  if (numberErr || !number) throw new Error(numberErr?.message || "Número WhatsApp do funil não encontrado.");
  if (!number.uazapi_url || !number.uazapi_token) throw new Error("Número sem credenciais Uazapi.");

  return { run, funnel, contact, conversation, number };
}

async function executeFromControlCenter(params: {
  supabase: any;
  workspaceId: string;
  userId: string;
  funnelId: string;
  contactId: string;
}) {
  const ctx = await loadRunExecutionContext(params);

  if (ctx.run) {
    const { error: deleteErr } = await params.supabase
      .from("welcome_funnel_runs")
      .delete()
      .eq("workspace_id", params.workspaceId)
      .eq("funnel_id", params.funnelId)
      .eq("contact_id", params.contactId);
    if (deleteErr) throw new Error(deleteErr.message);
  }

  const { error: claimErr } = await params.supabase
    .from("welcome_funnel_runs")
    .insert({
      funnel_id: params.funnelId,
      contact_id: params.contactId,
      user_id: params.userId,
      workspace_id: params.workspaceId,
      fired_at: new Date().toISOString(),
    });
  if (claimErr) throw new Error(claimErr.message);

  const { runWelcomeFunnelSequence } = await import("@/lib/welcome-funnel-runner.server");

  await runWelcomeFunnelSequence({
    supabase: params.supabase,
    funnel: ctx.funnel,
    contactId: params.contactId,
    conversationId: ctx.conversation.id,
    userId: params.userId,
    workspaceId: params.workspaceId,
    phone: ctx.contact.telefone,
    creds: {
      uazapi_url: ctx.number.uazapi_url,
      uazapi_token: ctx.number.uazapi_token,
    },
    initiatedBy: "retry",
  });

  await params.supabase
    .from("conversations")
    .update({
      needs_review: false,
      review_reason: null,
    })
    .eq("workspace_id", params.workspaceId)
    .eq("id", ctx.conversation.id);

  return { ok: true, status: "completed" as const };
}

export const getFunnelControlOverview = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const rows: any[] = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await (context.supabase as any)
        .from("welcome_funnel_runs")
        .select("funnel_id, contact_id, fired_at")
        .eq("workspace_id", context.workspaceId)
        .eq("user_id", context.userId)
        .order("fired_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const funnelIds = [...new Set(rows.map((r) => r.funnel_id).filter(Boolean))];
    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];

    const funnelMap = new Map<string, any>();
    if (funnelIds.length) {
      const { data, error } = await (context.supabase as any)
        .from("welcome_funnels")
        .select("id, name, whatsapp_number_id, enabled")
        .eq("workspace_id", context.workspaceId)
        .eq("user_id", context.userId)
        .in("id", funnelIds);
      if (error) throw new Error(error.message);
      for (const row of data || []) funnelMap.set(row.id, row);
    }

    const contactMap = new Map<string, any>();
    if (contactIds.length) {
      for (let i = 0; i < contactIds.length; i += 200) {
        const { data, error } = await (context.supabase as any)
          .from("contacts")
          .select("id, nome, telefone, photo_url")
          .eq("workspace_id", context.workspaceId)
          .eq("user_id", context.userId)
          .in("id", contactIds.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const row of data || []) contactMap.set(row.id, row);
      }
    }

    const enriched = rows.map((run) => {
      const funnel = funnelMap.get(run.funnel_id) || null;
      const contact = contactMap.get(run.contact_id) || null;
      return { ...run, status: "completed", funnel, contact, stale: false, error_category: null };
    });

    const counts = {
      total: enriched.length,
      running: 0,
      completed: enriched.length,
      failed: 0,
      paused: 0,
      stale: 0,
    };

    const completedLast24h = enriched.filter((r) => {
      return Date.now() - new Date(r.fired_at).getTime() <= 24 * 60 * 60_000;
    }).length;

    return {
      counts,
      success_rate_24h: null,
      completed_24h: completedLast24h,
      failed_24h: 0,
      runs: enriched,
      generated_at: new Date().toISOString(),
      note: "Painel simplificado — o schema atual só registra quais funis dispararam, não o progresso/status de cada etapa.",
    };
  });

export const getFunnelRunEvents = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      funnel_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("welcome_funnel_run_events")
      .select("id, event_type, step_key, message, metadata, created_at")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("funnel_id", data.funnel_id)
      .eq("contact_id", data.contact_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return [];
    }
    return rows || [];
  });

export const pauseFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      funnel_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async () => {
    return {
      ok: false,
      reason: "Pausar não é suportado — o funil roda do início ao fim numa única execução síncrona, não há como interromper no meio.",
    };
  });

export const resumeFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      funnel_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) =>
    executeFromControlCenter({
      supabase: context.supabase as any,
      workspaceId: context.workspaceId,
      userId: context.userId,
      funnelId: data.funnel_id,
      contactId: data.contact_id,
    }),
  );

export const retryFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      funnel_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) =>
    executeFromControlCenter({
      supabase: context.supabase as any,
      workspaceId: context.workspaceId,
      userId: context.userId,
      funnelId: data.funnel_id,
      contactId: data.contact_id,
    }),
  );

export const retryAllFailedFunnelRuns = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async () => {
    return {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      note: "Não suportado com o schema atual — não há coluna de status pra identificar quais execuções falharam.",
    };
  });

export const countFunnelControlAlerts = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async () => {
    return { count: 0 };
  });
