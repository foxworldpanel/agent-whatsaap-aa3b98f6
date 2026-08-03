import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  console.log(`[AUDIT] Iniciando auditoria para ${phone}...`);
  
  // Buscar no agent_logs (telemetria do orquestrador) - Últimas 2 horas
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: agentLogs, error: logError } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .gt("created_at", twoHoursAgo)
    .order("created_at", { ascending: true });

  if (logError) {
    console.error("[AUDIT] Erro ao buscar agent_logs:", logError);
  } else {
    console.log(`[AUDIT] Encontrados ${agentLogs?.length || 0} logs de agente.`);
    agentLogs?.forEach(log => {
      console.log(`[LOG-DB] ${log.created_at} | ${log.type} | ${log.summary}`);
      if (log.metadata) {
         // console.log("Metadata:", JSON.stringify(log.metadata));
      }
    });
  }

  // Buscar na tabela messages - Mensagens recebidas
  const { data: messages, error: msgError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("sender", "cliente")
    .gt("created_at", twoHoursAgo)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("[AUDIT] Erro ao buscar mensagens:", msgError);
  } else {
    // Filtrar manualmente por número se não houver coluna sender_phone
    console.log(`[AUDIT] Analisando ${messages?.length || 0} mensagens recebidas no período...`);
    messages?.forEach(m => {
      if (m.body.includes(phone) || (m.conversation_id && m.conversation_id.includes(phone))) {
         console.log(`[MSG-DB] ${m.created_at} | ID: ${m.id} | Conv: ${m.conversation_id} | Body: ${m.body.substring(0, 100)}`);
      }
    });
  }
}

auditWebhookLogs().catch(console.error);
