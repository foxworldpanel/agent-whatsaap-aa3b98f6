import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  const mindWorkspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  console.log(`[AUDIT] Buscando execuções de funil e lock para ${phone}...`);
  
  // 1. Buscar contato
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", phone)
    .eq("workspace_id", mindWorkspaceId);
  
  const contactId = contacts?.[0]?.id;
  console.log(`[AUDIT] contact_id: ${contactId}`);

  if (contactId) {
    // 2. Buscar execuções de funil
    const { data: funnelRuns } = await supabaseAdmin
      .from("welcome_funnel_runs")
      .select("*")
      .eq("contact_id", contactId)
      .order("fired_at", { ascending: false });

    console.log(`[AUDIT] Welcome Funnel Runs: ${JSON.stringify(funnelRuns)}`);
  }

  // 3. Buscar mensagens da conversa real das 21:40 (UTC-3) -> 00:40 (UTC)
  // O usuário disse 21:40, o log mostra 00:53 UTC.
  // Vamos buscar no intervalo de 00:30 a 01:10 UTC de 1º de agosto.
  const startInterval = "2026-08-01T00:30:00Z";
  const endInterval = "2026-08-01T01:10:00Z";
  
  const { data: intervalMsgs } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("workspace_id", mindWorkspaceId)
    .gte("created_at", startInterval)
    .lte("created_at", endInterval)
    .order("created_at", { ascending: true });

  console.log(`[AUDIT] Mensagens no intervalo crítico (${startInterval} a ${endInterval}):`);
  intervalMsgs?.forEach(m => {
    if (m.conversation_id?.includes(phone) || m.body.toLowerCase().includes("plays")) {
       console.log(`[MSG] ${m.created_at} | ${m.sender} | ${m.body}`);
    }
  });

  // 4. Buscar logs técnicos de execução nesse intervalo
  const { data: logs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .gte("created_at", startInterval)
    .lte("created_at", endInterval)
    .order("created_at", { ascending: true });

  console.log(`[AUDIT] Logs técnicos no intervalo crítico:`);
  logs?.forEach(l => {
    if (l.phone === phone) {
      console.log(`[LOG] ${l.created_at} | ${l.type} | ${l.summary}`);
      if (l.metadata) console.log(`[META] ${JSON.stringify(l.metadata)}`);
    }
  });
}

auditWebhookLogs().catch(console.error);
