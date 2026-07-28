import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

const statusSchema = z.enum(["running", "completed", "failed", "paused"]);

async function loadRunExecutionContext(params: {
  supabase: any;
  workspaceId: string;
  userId: string;
  funnelId: string;
  contactId: string;
}) {
  const { data: run, error: runErr } = await params.supabase
    .from("welcome_funnel_runs")
    .select("funnel_id, contact_id, status, last_step, last_step_index, retry_count")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("funnel_id", params.funnelId)
    .eq("contact_id", params.contactId)
    .single();
  if (runErr || !run) throw new Error(runErr?.message || "Execução não encontrada.");

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
    .select("id, telefone, nome")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("id", params.contactId)
    .single();
  if (contactErr || !contact) throw new Error(contactErr?.message || "Contato não encontrado.");

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
  mode: "retry" | "resume";
}) {
  const ctx = await loadRunExecutionContext(params);
  const now = new Date().toISOString();

  const { error: runningErr } = await params.supabase
    .from("welcome_funnel_runs")
    .update({
      status: "running",
      paused_at: null,
      resumed_at: params.mode === "resume" ? now : null,
      error_message: null,
      retry_count: Number(ctx.run.retry_count || 0) + (params.mode === "retry" ? 1 : 0),
      initiated_by: params.mode,
      updated_at: now,
    })
    .eq("workspace_id", params.workspaceId)
    .eq("funnel_id", params.funnelId)
    .eq("contact_id", params.contactId);
  if (runningErr) throw new Error(runningErr.message);

  const { runWelcomeFunnelSequence, markFunnelRunFailed, FunnelPausedError } = await import(
    "@/lib/welcome-funnel-runner.server"
  );

  try {
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
      resumeAfterStep: ctx.run.last_step || null,
      initiatedBy: params.mode,
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
  } catch (error) {
    if (error instanceof FunnelPausedError || (error instanceof Error && error.message === "WELCOME_FUNNEL_PAUSED")) {
      return { ok: true, status: "paused" as const };
    }

    await markFunnelRunFailed({
      supabase: params.supabase,
      funnelId: params.funnelId,
      contactId: params.contactId,
      userId: params.userId,
      workspaceId: params.workspaceId,
      error,
    });
    throw error;
  }
}

export const getFunnelControlOverview = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const rows: any[] = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await (context.supabase as any)
        .from("welcome_funnel_runs")
        .select(
          "funnel_id, contact_id, status, fired_at, completed_at, last_step, last_step_index, error_message, updated_at, paused_at, resumed_at, retry_count, last_error_at, initiated_by",
        )
        .eq("workspace_id", context.workspaceId)
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false })
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

    const conversationMap = new Map<string, any>();
    if (contactIds.length) {
      for (let i = 0; i < contactIds.length; i += 200) {
        const { data, error } = await (context.supabase as any)
          .from("conversations")
          .select("id, contact_id, agent_enabled, needs_review")
          .eq("workspace_id", context.workspaceId)
          .eq("user_id", context.userId)
          .in("contact_id", contactIds.slice(i, i + 200))
          .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        for (const row of data || []) {
          if (!conversationMap.has(row.contact_id)) conversationMap.set(row.contact_id, row);
        }
      }
    }

    const numberIds = [...new Set(
      Array.from(funnelMap.values()).map((f) => f.whatsapp_number_id).filter(Boolean),
    )];
    const numberMap = new Map<string, any>();
    if (numberIds.length) {
      const { data, error } = await (context.supabase as any)
        .from("whatsapp_numbers")
        .select("id, nome, status")
        .eq("workspace_id", context.workspaceId)
        .eq("user_id", context.userId)
        .in("id", numberIds);
      if (error) throw new Error(error.message);
      for (const row of data || []) numberMap.set(row.id, row);
    }

    const enriched = rows.map((run) => {
      const funnel = funnelMap.get(run.funnel_id) || null;
      const contact = contactMap.get(run.contact_id) || null;
      const number = funnel?.whatsapp_number_id
        ? numberMap.get(funnel.whatsapp_number_id) || null
        : null;

      const updatedMs = new Date(run.updated_at || run.fired_at || 0).getTime();
      const stale =
        run.status === "running" &&
        Number.isFinite(updatedMs) &&
        Date.now() - updatedMs > 15 * 60_000;

      const conversation = conversationMap.get(run.contact_id) || null;
      const rawError = String(run.error_message || "").toLowerCase();
      const error_category = !rawError
        ? null
        : /token|unauthorized|401|403|credencial/.test(rawError)
          ? "Credenciais / autenticação"
          : /audio|video|media|arquivo|url|fetch|download/.test(rawError)
            ? "Mídia / arquivo"
            : /timeout|tempo|timed out|aborted/.test(rawError)
              ? "Timeout"
              : /uazapi|whatsapp|send\//.test(rawError)
                ? "WhatsApp / Uazapi"
                : /database|supabase|postgres|column|relation|schema/.test(rawError)
                  ? "Banco de dados"
                  : "Execução do funil";

      return { ...run, funnel, contact, number, conversation, stale, error_category };
    });

    const counts = {
      total: enriched.length,
      running: enriched.filter((r) => r.status === "running" && !r.stale).length,
      completed: enriched.filter((r) => r.status === "completed").length,
      failed: enriched.filter((r) => r.status === "failed").length,
      paused: enriched.filter((r) => r.status === "paused").length,
      stale: enriched.filter((r) => r.stale).length,
    };

    const completedLast24h = enriched.filter((r) => {
      if (r.status !== "completed" || !r.completed_at) return false;
      return Date.now() - new Date(r.completed_at).getTime() <= 24 * 60 * 60_000;
    }).length;

    const failedLast24h = enriched.filter((r) => {
      const at = r.last_error_at || (r.status === "failed" ? r.updated_at : null);
      return at && Date.now() - new Date(at).getTime() <= 24 * 60 * 60_000;
    }).length;

    const denominator = completedLast24h + failedLast24h;
    const successRate24h = denominator > 0
      ? Math.round((completedLast24h / denominator) * 1000) / 10
      : null;

    return {
      counts,
      success_rate_24h: successRate24h,
      completed_24h: completedLast24h,
      failed_24h: failedLast24h,
      runs: enriched,
      generated_at: new Date().toISOString(),
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
      // Compatibilidade enquanto migration ainda não foi aplicada.
      if (/welcome_funnel_run_events/i.test(error.message || "")) return [];
      throw new Error(error.message);
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
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await (context.supabase as any)
      .from("welcome_funnel_runs")
      .update({
        status: "paused",
        paused_at: now,
        updated_at: now,
      })
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("funnel_id", data.funnel_id)
      .eq("contact_id", data.contact_id)
      .eq("status", "running");
    if (error) throw new Error(error.message);

    await (context.supabase as any).from("welcome_funnel_run_events").insert({
      user_id: context.userId,
      workspace_id: context.workspaceId,
      funnel_id: data.funnel_id,
      contact_id: data.contact_id,
      event_type: "paused",
      message: "Pausado manualmente pelo painel",
    });

    return { ok: true };
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
      mode: "resume",
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
      mode: "retry",
    }),
  );

export const retryAllFailedFunnelRuns = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data: failed, error } = await (context.supabase as any)
      .from("welcome_funnel_runs")
      .select("funnel_id, contact_id")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("status", "failed")
      .order("updated_at", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);

    const results = [];
    for (const run of failed || []) {
      try {
        await executeFromControlCenter({
          supabase: context.supabase as any,
          workspaceId: context.workspaceId,
          userId: context.userId,
          funnelId: run.funnel_id,
          contactId: run.contact_id,
          mode: "retry",
        });
        results.push({ ...run, ok: true });
      } catch (err) {
        results.push({
          ...run,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      attempted: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  });


export const countFunnelControlAlerts = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("welcome_funnel_runs")
      .select("status, updated_at")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .in("status", ["failed", "running"]);
    if (error) throw new Error(error.message);

    const count = (data || []).filter((row: any) => {
      if (row.status === "failed") return true;
      if (row.status !== "running") return false;
      const at = new Date(row.updated_at || 0).getTime();
      return Number.isFinite(at) && Date.now() - at > 15 * 60_000;
    }).length;

    return { count };
  });
