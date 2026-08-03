import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  const mindWorkspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  console.log(`[AUDIT] Buscando telemetria completa para ${phone}...`);
  
  // Buscar na tabela agent_logs usando o phone
  const { data: agentLogs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .gt("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: true });

  if (agentLogs?.length) {
    agentLogs.forEach(log => {
      console.log(`[AUDIT-LOG] ${log.created_at} | ${log.type} | ${log.summary}`);
      if (log.metadata) {
         const meta = log.metadata as any;
         // Procurar por erros da Uazapi no log
         if (meta.raw && meta.raw.status !== undefined) {
            console.log(`[UAZAPI-RAW-LOG] ${JSON.stringify(meta.raw)}`);
         }
      }
    });
  }

  // Buscar mensagens no workspace da Mind
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("workspace_id", mindWorkspaceId)
    .gt("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: true });

  messages?.forEach(m => {
      const body = String(m.body || "");
      const convId = String(m.conversation_id || "");
      if (body.includes(phone) || convId.includes(phone) || body.toLowerCase().includes("quero comprar plays")) {
         console.log(`[MSG-DB] ${m.created_at} | Sender: ${m.sender} | Body: ${body.substring(0, 100)}`);
      }
  });

  // Buscar integrações da Mind
  const { data: integrations } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("workspace_id", mindWorkspaceId);
  
  integrations?.forEach(i => {
      console.log(`[CONFIG] Integration: ${i.instance_name} | Token: ${i.uazapi_token?.substring(0, 8)}... | URL: ${i.uazapi_url}`);
  });
}

auditWebhookLogs().catch(console.error);
