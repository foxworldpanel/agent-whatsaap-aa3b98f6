import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

const PAGE_SIZE = 1000;
const STALE_RUNNING_MS = 20 * 60 * 1000;
const STEP_ORDER = [
  "welcome_text",
  "audio",
  "panel_text",
  "video",
  "services_text",
] as const;

type ControlContext = {
  supabase: any;
  workspaceId: string;
  userId: string;
};

function executionKey(funnelId: string, contactId: string): string {
  return `${funnelId}:${contactId}`;
}

function stepIndex(step: string | null | undefined): number {
  if (!step) return 0;
  const index = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  return index < 0 ? 0 : index + 1;
}

async function loadAllRows(
  buildQuery: (from: number, to: number) => Promise<{ data: any; error: any }>,
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || String(error));
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadFunnelControlRows(context: ControlContext): Promise<any[]> {
  const durableRows = await loadAllRows((from, to) =>
    (context.supabase as any)
      .from("welcome_funnel_execution_state")
      .select(
        "funnel_id, contact_id, conversation_id, status, last_completed_step, error_message, started_at, updated_at, completed_at",
      )
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .range(from, to),
  );

  const legacyRows = await loadAllRows((from, to) =>
    (context.supabase as any)
      .from("welcome_funnel_runs")
      .select("funnel_id, contact_id, fired_at")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .order("fired_at", { ascending: false })
      .range(from, to),
  );

  // Baseline has no workspace columns by design. Read it only as historical
  // evidence, then intersect with the already workspace-scoped legacy keys.
  const baselineRows = legacyRows.length
    ? await loadAllRows((from, to) =>
        (context.supabase as any)
          .from("welcome_funnel_legacy_claim_baseline")
          .select("funnel_id, contact_id, observed_at")
          .range(from, to),
      )
    : [];
  const scopedLegacyKeys = new Set(
    legacyRows.map((row) => executionKey(row.funnel_id, row.contact_id)),
  );
  const baselineKeys = new Set(
    baselineRows
      .filter((row) =>
        scopedLegacyKeys.has(executionKey(row.funnel_id, row.contact_id)),
      )
      .map((row) => executionKey(row.funnel_id, row.contact_id)),
  );

  const byExecution = new Map<string, any>();
  for (const row of durableRows) {
    const status =
      row.status === "needs_review"
        ? "failed"
        : row.status === "completed"
          ? "completed"
          : "running";
    const stale =
      row.status === "running" &&
      Date.now() - new Date(row.updated_at).getTime() > STALE_RUNNING_MS;
    byExecution.set(executionKey(row.funnel_id, row.contact_id), {
      funnel_id: row.funnel_id,
      contact_id: row.contact_id,
      conversation_id: row.conversation_id,
      status,
      durable_status: row.status,
      classification: `durable_${row.status}`,
      completion_proven: row.status === "completed",
      fired_at: row.started_at,
      started_at: row.started_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      last_step: row.last_completed_step,
      last_step_index: stepIndex(row.last_completed_step),
      error_message: row.error_message,
      error_category:
        row.status === "needs_review" ? "needs_review" : null,
      stale,
      retry_count: 0,
    });
  }

  for (const row of legacyRows) {
    const key = executionKey(row.funnel_id, row.contact_id);
    if (byExecution.has(key)) continue;
    const compatible = baselineKeys.has(key);
    byExecution.set(key, {
      funnel_id: row.funnel_id,
      contact_id: row.contact_id,
      conversation_id: null,
      status: compatible ? "historical" : "failed",
      durable_status: null,
      classification: compatible
        ? "legacy_compatible"
        : "legacy_ambiguous",
      completion_proven: false,
      fired_at: row.fired_at,
      started_at: row.fired_at,
      updated_at: row.fired_at,
      completed_at: null,
      last_step: null,
      last_step_index: 0,
      error_message: compatible
        ? null
        : "Claim legado sem baseline histórico e sem prova durável de conclusão.",
      error_category: compatible ? null : "legacy_ambiguous",
      stale: false,
      retry_count: 0,
    });
  }

  const rows = [...byExecution.values()].sort(
    (a, b) =>
      new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime(),
  );
  const funnelIds = [...new Set(rows.map((row) => row.funnel_id))];
  const contactIds = [...new Set(rows.map((row) => row.contact_id))];

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
  const conversationMap = new Map<string, any>();
  for (let index = 0; index < contactIds.length; index += 200) {
    const ids = contactIds.slice(index, index + 200);
    const [{ data: contacts, error: contactError }, { data: conversations, error: conversationError }] =
      await Promise.all([
        (context.supabase as any)
          .from("contacts")
          .select("id, nome, telefone, photo_url")
          .eq("workspace_id", context.workspaceId)
          .eq("user_id", context.userId)
          .in("id", ids),
        (context.supabase as any)
          .from("conversations")
          .select("id, contact_id, agent_enabled, needs_review, created_at")
          .eq("workspace_id", context.workspaceId)
          .eq("user_id", context.userId)
          .in("contact_id", ids)
          .order("created_at", { ascending: false }),
      ]);
    if (contactError) throw new Error(contactError.message);
    if (conversationError) throw new Error(conversationError.message);
    for (const row of contacts || []) contactMap.set(row.id, row);
    for (const row of conversations || []) {
      if (!conversationMap.has(row.contact_id)) {
        conversationMap.set(row.contact_id, row);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    funnel: funnelMap.get(row.funnel_id) || null,
    contact: contactMap.get(row.contact_id) || null,
    conversation:
      (row.conversation_id
        ? [...conversationMap.values()].find(
            (conversation) => conversation.id === row.conversation_id,
          )
        : null) ||
      conversationMap.get(row.contact_id) ||
      null,
  }));
}

export const getFunnelControlOverview = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const runs = await loadFunnelControlRows(context as ControlContext);
    const counts = {
      total: runs.length,
      running: runs.filter((row) => row.status === "running").length,
      completed: runs.filter((row) => row.status === "completed").length,
      historical: runs.filter((row) => row.status === "historical").length,
      failed: runs.filter((row) => row.status === "failed").length,
      paused: 0,
      stale: runs.filter((row) => row.stale).length,
    };
    const completed24h = runs.filter(
      (row) =>
        row.status === "completed" &&
        Date.now() - new Date(row.completed_at || row.fired_at).getTime() <=
          24 * 60 * 60_000,
    ).length;
    const terminalCount = counts.completed + counts.failed;

    return {
      counts,
      success_rate_24h:
        terminalCount > 0
          ? Math.round((counts.completed / terminalCount) * 100)
          : null,
      completed_24h: completed24h,
      failed_24h: runs.filter(
        (row) =>
          row.status === "failed" &&
          Date.now() - new Date(row.updated_at || row.fired_at).getTime() <=
            24 * 60 * 60_000,
      ).length,
      runs,
      generated_at: new Date().toISOString(),
      note:
        "Estado durável é a autoridade. Claims legados com baseline são apenas compatibilidade histórica; claims sem baseline aparecem como revisão obrigatória.",
    };
  });

export const getFunnelRunEvents = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((value: unknown) =>
    z
      .object({
        funnel_id: z.string().uuid(),
        contact_id: z.string().uuid(),
      })
      .parse(value),
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
    if (error) return [];
    return rows || [];
  });

const controlInput = (value: unknown) =>
  z
    .object({
      funnel_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    })
    .parse(value);

function unsupportedControlAction(): never {
  throw new Error(
    "Execução em running ou needs_review é fail-closed. Retry, resume e pause exigem uma transição manual auditada que ainda não está implementada.",
  );
}

export const pauseFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator(controlInput)
  .handler(async () => unsupportedControlAction());

export const resumeFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator(controlInput)
  .handler(async () => unsupportedControlAction());

export const retryFunnelRun = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator(controlInput)
  .handler(async () => unsupportedControlAction());

export const retryAllFailedFunnelRuns = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async () => unsupportedControlAction());

export const countFunnelControlAlerts = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const rows = await loadFunnelControlRows(context as ControlContext);
    return {
      count: rows.filter(
        (row) => row.status === "failed" || row.stale,
      ).length,
    };
  });
