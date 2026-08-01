import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  console.log(`[AUDIT] Iniciando auditoria profunda para ${phone}...`);
  
  // Buscar no agent_logs (telemetria do orquestrador)
  const { data: agentLogs, error: logError } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  if (logError) {
    console.error("[AUDIT] Erro ao buscar agent_logs:", logError);
  } else {
    console.log(`[AUDIT] Encontrados ${agentLogs?.length || 0} logs de agente.`);
    agentLogs?.forEach(log => {
      console.log(`[LOG-DB] ${log.created_at} | ${log.type} | ${log.summary}`);
      if (log.metadata) console.log("Metadata:", JSON.stringify(log.metadata));
    });
  }

  // Buscar na tabela messages (o que o webhook salvou)
  const { data: messages, error: msgError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .or(`body.ilike.%${phone}%,body.ilike.%Quero comprar plays%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (msgError) {
    console.error("[AUDIT] Erro ao buscar mensagens:", msgError);
  } else {
    console.log(`[AUDIT] Encontradas ${messages?.length || 0} mensagens relacionadas.`);
    messages?.forEach(m => {
      console.log(`[MSG-DB] ${m.created_at} | ${m.sender} | ${m.body.substring(0, 50)}...`);
    });
  }
  
  // Verificar se há locks ativos agora ou recentemente
  const { data: locks } = await supabaseAdmin
    .from("agent_generation_locks")
    .select("*");
  console.log("[AUDIT] Locks ativos:", JSON.stringify(locks));
}

auditWebhookLogs().catch(console.error);
