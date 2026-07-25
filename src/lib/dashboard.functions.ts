import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

function startOfLocalDayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const workspaceId = context.workspaceId;
    const startIso = startOfLocalDayIso();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Dashboard deve refletir o workspace atual e o runtime V3.
    const [
      contactsRes,
      activeConvRes,
      conv24hRes,
      sentTodayRes,
      recvTodayRes,
      convertedRes,
      recentLogsRes,
      sourcesRes,
      tempTodayRes,
      metrics24hRes,
      modulesRes,
    ] = await Promise.all([
      sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      sb.from("conversations_v3").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("updated_at", startIso),
      sb.from("conversations_v3").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("updated_at", since24h),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("sender", "agente").gte("created_at", startIso),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("sender", "cliente").gte("created_at", startIso),
      sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "convertido"),
      sb.from("agent_logs").select("id, summary, level, type, created_at, phone").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(10),
      sb.from("contacts").select("origem, status").eq("workspace_id", workspaceId),
      sb.from("contacts").select("temperatura").eq("workspace_id", workspaceId).gte("temperatura_updated_at", startIso),
      sb.from("agent_prompt_metrics").select("input_tokens, output_tokens, estimated_cost, duration_ms, active_modules_count, model, created_at").eq("user_id", context.user.id).eq("sent_to_customer", true).eq("execution_mode", "production").gte("created_at", since24h),
      sb.from("agent_modules_v3").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("enabled", true),
    ]);

    const errors = [
      contactsRes.error, activeConvRes.error, conv24hRes.error, sentTodayRes.error,
      recvTodayRes.error, convertedRes.error, recentLogsRes.error, sourcesRes.error,
      tempTodayRes.error, metrics24hRes.error, modulesRes.error,
    ].filter(Boolean);
    if (errors.length) {
      console.error("[dashboard] consultas com erro", errors.map((e) => e?.message));
    }

    const totalContacts = contactsRes.count ?? 0;
    const activeConversations = activeConvRes.count ?? 0;
    const conversations24h = conv24hRes.count ?? 0;
    const sentToday = sentTodayRes.count ?? 0;
    const receivedToday = recvTodayRes.count ?? 0;
    const converted = convertedRes.count ?? 0;
    const responseRate = sentToday > 0 ? Math.min(100, Math.round((receivedToday / sentToday) * 100)) : 0;

    const sourceMap = new Map<string, { total: number; convertidos: number }>();
    for (const row of sourcesRes.data ?? []) {
      const raw = (row as { origem?: string | null }).origem;
      const key = raw?.trim() || "organico";
      const cur = sourceMap.get(key) ?? { total: 0, convertidos: 0 };
      cur.total += 1;
      if ((row as { status?: string }).status === "convertido") cur.convertidos += 1;
      sourceMap.set(key, cur);
    }
    const leadsBySource = Array.from(sourceMap.entries())
      .map(([source, value]) => ({ source, ...value }))
      .sort((a, b) => b.total - a.total);

    const tempToday = { quente: 0, morno: 0, frio: 0, cliente: 0, bloqueado: 0 };
    for (const row of tempTodayRes.data ?? []) {
      const value = String((row as { temperatura?: string }).temperatura || "") as keyof typeof tempToday;
      if (value in tempToday) tempToday[value] += 1;
    }

    const metricRows = metrics24hRes.data ?? [];
    const totalInputTokens = metricRows.reduce((n, m) => n + (m.input_tokens || 0), 0);
    const totalOutputTokens = metricRows.reduce((n, m) => n + (m.output_tokens || 0), 0);
    const totalCost = metricRows.reduce((n, m) => n + Number(m.estimated_cost || 0), 0);
    const avgLatencyMs = metricRows.length
      ? Math.round(metricRows.reduce((n, m) => n + (m.duration_ms || 0), 0) / metricRows.length)
      : 0;
    const avgModules = metricRows.length
      ? metricRows.reduce((n, m) => n + (m.active_modules_count || 0), 0) / metricRows.length
      : 0;

    return {
      totalContacts,
      activeConversations,
      conversations24h,
      sentToday,
      receivedToday,
      converted,
      responseRate,
      activeModules: modulesRes.count ?? 0,
      agentCalls24h: metricRows.length,
      avgLatencyMs,
      avgModules: Math.round(avgModules * 10) / 10,
      costs24h: {
        tokens: totalInputTokens + totalOutputTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost: Math.round(totalCost * 1_000_000) / 1_000_000,
      },
      recentLogs: (recentLogsRes.data ?? []).map((row) => ({
        id: row.id,
        created_at: row.created_at,
        status: row.level,
        contact_name: row.phone || "Agente",
        message_preview: row.summary || row.type,
      })),
      leadsBySource,
      tempToday,
    };
  });
