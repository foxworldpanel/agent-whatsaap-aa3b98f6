import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  const mindWorkspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  console.log(`[AUDIT] Buscando telemetria completa para ${phone}...`);
  
  // Buscar na tabela agent_logs usando o phone (que é o campo correto)
  const { data: agentLogs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .gt("created_at", new Date(Date.now() - 4 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: true });

  if (agentLogs?.length) {
    agentLogs.forEach(log => {
      console.log(`[AUDIT-LOG] ${log.created_at} | ${log.type} | ${log.summary}`);
      if (log.metadata) {
         console.log(`[AUDIT-METADATA] ${JSON.stringify(log.metadata)}`);
      }
    });
  } else {
    console.log("[AUDIT] Nenhum log de telemetria encontrado.");
  }

  // Buscar a integração da Mind para ver o Token da Uazapi
  const { data: integrations } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("workspace_id", mindWorkspaceId);
  
  console.log("[AUDIT] Configuração da Mind:", JSON.stringify(integrations));
}

auditWebhookLogs().catch(console.error);
