import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const [contactsRes, activeConvRes, sentTodayRes, recvTodayRes, convertedRes, recentLogsRes] =
      await Promise.all([
        sb.from("contacts").select("id", { count: "exact", head: true }),
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
      ]);

    const totalContacts = contactsRes.count ?? 0;
    const activeConversations = activeConvRes.count ?? 0;
    const sentToday = sentTodayRes.count ?? 0;
    const receivedToday = recvTodayRes.count ?? 0;
    const converted = convertedRes.count ?? 0;
    const responseRate = sentToday > 0 ? Math.round((receivedToday / sentToday) * 100) : 0;

    return {
      totalContacts,
      activeConversations,
      sentToday,
      receivedToday,
      converted,
      responseRate,
      recentLogs: recentLogsRes.data ?? [],
    };
  });