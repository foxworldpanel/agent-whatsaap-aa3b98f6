import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  const convId = "d12339aa-0891-4492-9757-d785f7b0244f";
  console.log(`[AUDIT] Buscando telemetria da conversa ${convId} (${phone})...`);
  
  // Buscar mensagens da conversa específica (sentido cliente e agente)
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });

  if (messages?.length) {
    console.log(`[AUDIT] Encontradas ${messages.length} mensagens na conversa.`);
    messages.forEach(m => {
      console.log(`[MSG] ${m.created_at} | ${m.sender} | ${m.body}`);
    });
  }

  // Buscar logs da V3 para este número nas últimas 3 horas
  const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: agentLogs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .gt("created_at", threeHoursAgo)
    .order("created_at", { ascending: true });

  if (agentLogs?.length) {
    agentLogs.forEach(log => {
      console.log(`[LOG] ${log.created_at} | ${log.type} | ${log.summary}`);
      if (log.metadata) {
         const meta = log.metadata as any;
         console.log(`[LOG-METADATA] Latency: ${meta.usage?.latency_ms}ms | Model: ${meta.usage?.model}`);
      }
    });
  }
}

auditWebhookLogs().catch(console.error);
