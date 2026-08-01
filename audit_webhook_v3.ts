import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  console.log(`[AUDIT] Procurando logs brutos da Mind...`);
  
  // Buscar mensagens do número específico através do conversation_id
  const { data: messages, error: msgError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .ilike("conversation_id", `%${phone}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (msgError) {
    console.error("[AUDIT] Erro ao buscar mensagens:", msgError);
  } else {
    console.log(`[AUDIT] Encontradas ${messages?.length || 0} mensagens.`);
    messages?.forEach(m => {
      console.log(`[MSG-DB] ${m.created_at} | ${m.sender} | ${m.body}`);
    });
  }

  // Buscar logs de erro na tabela agent_logs que podem não estar vinculados ao phone explicitamente
  const { data: errorLogs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("type", "error")
    .order("created_at", { ascending: false })
    .limit(10);
  
  if (errorLogs?.length) {
    console.log("[AUDIT] Logs de erro recentes:");
    errorLogs.forEach(l => console.log(`[ERR-LOG] ${l.created_at} | ${l.summary}`));
  }
}

auditWebhookLogs().catch(console.error);
