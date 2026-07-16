import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const [contactsRes, activeConvRes, sentTodayRes, recvTodayRes, convertedRes, recentLogsRes, sourcesRes, tempTodayRes, metricsRes] =
      await Promise.all([
        sb.from("blast_contacts").select("id", { count: "exact", head: true }),
        sb
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .gte("last_message_at", startIso),
        sb
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender", "agente")
          .gte("created_at", startIso),
        sb
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender", "cliente")
          .gte("created_at", startIso),
        sb
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("status", "convertido"),
        sb
          .from("campaign_logs")
          .select("id, contact_name, message_preview, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        sb
          .from("contacts")
          .select("source, status"),
        sb
          .from("contacts")
          .select("temperatura")
          .gte("temperatura_updated_at", startIso),
      ]);

    const totalContacts = contactsRes.count ?? 0;
    const activeConversations = activeConvRes.count ?? 0;
    const sentToday = sentTodayRes.count ?? 0;
    const receivedToday = recvTodayRes.count ?? 0;
    const converted = convertedRes.count ?? 0;
    const responseRate = sentToday > 0 ? Math.round((receivedToday / sentToday) * 100) : 0;

    // Agrega origem dos leads
    const sourceMap = new Map<string, { total: number; convertidos: number }>();
    for (const row of sourcesRes.data ?? []) {
      const key = (row as { source?: string | null }).source ?? "organico";
      const cur = sourceMap.get(key) ?? { total: 0, convertidos: 0 };
      cur.total += 1;
      if ((row as { status?: string }).status === "convertido") cur.convertidos += 1;
      sourceMap.set(key, cur);
    }
    const leadsBySource = Array.from(sourceMap.entries())
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.total - a.total);

    const tempToday = { quente: 0, morno: 0, frio: 0, bloqueado: 0 };
    for (const row of tempTodayRes.data ?? []) {
      const t = (row as { temperatura?: keyof typeof tempToday }).temperatura;
      if (t && t in tempToday) tempToday[t] += 1;
    }

    const costsToday = (metricsRes.data ?? []).reduce(
73:       (acc, m) => ({
74:         tokens: acc.tokens + (m.input_tokens || 0) + (m.output_tokens || 0),
75:         cost: acc.cost + Number(m.estimated_cost || 0),
76:       }),
77:       { tokens: 0, cost: 0 }
78:     );
79: 
80:     return {

      totalContacts,
      activeConversations,
      sentToday,
      receivedToday,
      converted,
      responseRate,
      recentLogs: recentLogsRes.data ?? [],
      leadsBySource,
      tempToday,
    };
  });