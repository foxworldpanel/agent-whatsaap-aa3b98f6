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
      sb.from("agent_modules_v3").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("enabled", true),
    ]);

    const errors = [
      contactsRes.error, activeConvRes.error, conv24hRes.error, sentTodayRes.error,
      recvTodayRes.error, convertedRes.error, recentLogsRes.error, sourcesRes.error,
      tempTodayRes.error, modulesRes.error,
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

    // Custo real do Agent V3: a fonte de verdade é agent_logs.metadata,
    // gravada pelo orchestrator após cada turno de produção.
    // Pagina para não truncar em 1.000 turnos.
    const v3Logs: Array<{
      id: string;
      conversation_id: string | null;
      created_at: string;
      metadata: unknown;
      duration_ms: number | null;
    }> = [];
    const logPageSize = 1000;

    for (let from = 0; ; from += logPageSize) {
      const { data: page, error } = await sb
        .from("agent_logs")
        .select("id, conversation_id, created_at, metadata, duration_ms")
        .eq("workspace_id", workspaceId)
        .eq("type", "agent_v3_turn")
        .gte("created_at", since24h)
        .order("created_at", { ascending: true })
        .range(from, from + logPageSize - 1);

      if (error) {
        console.error("[dashboard] falha ao carregar custo real V3:", error.message);
        break;
      }

      v3Logs.push(...((page ?? []) as typeof v3Logs));
      if (!page || page.length < logPageSize) break;
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalInputCost = 0;
    let totalOutputCost = 0;
    let totalCacheCost = 0;
    let totalCost = 0;
    let totalLatencyMs = 0;
    let totalModules = 0;
    let turnsWithModules = 0;

    const conversationIds = new Set<string>();
    const modelCounts = new Map<string, number>();

    for (const row of v3Logs) {
      const metadata = (row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {}) as Record<string, any>;
      const usage = (metadata.usage && typeof metadata.usage === "object"
        ? metadata.usage
        : {}) as Record<string, any>;
      const cost = (metadata.cost && typeof metadata.cost === "object"
        ? metadata.cost
        : {}) as Record<string, any>;
      const selectedModules = Array.isArray(metadata.selected_modules)
        ? metadata.selected_modules
        : [];

      const input = Number(usage.input_tokens || 0);
      const output = Number(usage.output_tokens || 0);
      const cacheRead = Number(usage.cache_read_input_tokens || 0);
      const cacheWrite = Number(usage.cache_creation_input_tokens || 0);
      const latency = Number(usage.latency_ms || row.duration_ms || 0);

      totalInputTokens += Number.isFinite(input) ? input : 0;
      totalOutputTokens += Number.isFinite(output) ? output : 0;
      totalCacheReadTokens += Number.isFinite(cacheRead) ? cacheRead : 0;
      totalCacheWriteTokens += Number.isFinite(cacheWrite) ? cacheWrite : 0;
      totalLatencyMs += Number.isFinite(latency) ? latency : 0;

      const inputCost = Number(cost.input_usd || 0);
      const outputCost = Number(cost.output_usd || 0);
      const cacheCost = Number(cost.cache_usd || 0);
      const turnCost = Number(cost.total_usd || 0);

      totalInputCost += Number.isFinite(inputCost) ? inputCost : 0;
      totalOutputCost += Number.isFinite(outputCost) ? outputCost : 0;
      totalCacheCost += Number.isFinite(cacheCost) ? cacheCost : 0;
      totalCost += Number.isFinite(turnCost) ? turnCost : 0;

      if (selectedModules.length > 0) {
        totalModules += selectedModules.length;
        turnsWithModules += 1;
      }

      if (row.conversation_id) conversationIds.add(row.conversation_id);

      const model = String(usage.model || "desconhecido");
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    }

    const agentCalls24h = v3Logs.length;
    const v3Conversations24h = conversationIds.size;
    const avgLatencyMs = agentCalls24h
      ? Math.round(totalLatencyMs / agentCalls24h)
      : 0;
    const avgModules = turnsWithModules
      ? totalModules / turnsWithModules
      : 0;
    const avgCostPerResponse = agentCalls24h
      ? totalCost / agentCalls24h
      : 0;
    const avgCostPerConversation = v3Conversations24h
      ? totalCost / v3Conversations24h
      : 0;

    // Não chamamos isso de "economia em US$" porque isso dependeria do modelo e
    // do tipo de cache. Mostramos o dado verificável: taxa de tokens lidos do cache.
    const cacheTokenBase =
      totalInputTokens + totalCacheReadTokens + totalCacheWriteTokens;
    const cacheReadRate = cacheTokenBase > 0
      ? (totalCacheReadTokens / cacheTokenBase) * 100
      : 0;

    const modelMix = Array.from(modelCounts.entries())
      .map(([model, count]) => ({
        model,
        count,
        pct: agentCalls24h ? Math.round((count / agentCalls24h) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalContacts,
      activeConversations,
      conversations24h,
      sentToday,
      receivedToday,
      converted,
      responseRate,
      activeModules: modulesRes.count ?? 0,
      agentCalls24h,
      v3Conversations24h,
      avgLatencyMs,
      avgModules: Math.round(avgModules * 10) / 10,
      costs24h: {
        tokens: totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        cacheReadRate: Math.round(cacheReadRate * 10) / 10,
        inputCost: Math.round(totalInputCost * 1_000_000) / 1_000_000,
        outputCost: Math.round(totalOutputCost * 1_000_000) / 1_000_000,
        cacheCost: Math.round(totalCacheCost * 1_000_000) / 1_000_000,
        cost: Math.round(totalCost * 1_000_000) / 1_000_000,
        avgPerResponse: Math.round(avgCostPerResponse * 1_000_000) / 1_000_000,
        avgPerConversation: Math.round(avgCostPerConversation * 1_000_000) / 1_000_000,
      },
      modelMix,
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
