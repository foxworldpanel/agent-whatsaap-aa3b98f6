import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  console.log(`[AUDIT] Procurando logs brutos da Mind para ${phone}...`);
  
  // Buscar o workspace da Mind explicitamente
  const mindWorkspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

  // Buscar mensagens recentes no workspace da Mind - Últimas 3 horas
  const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  
  const { data: messages, error: msgError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("workspace_id", mindWorkspaceId)
    .gt("created_at", threeHoursAgo)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("[AUDIT] Erro ao buscar mensagens:", msgError);
  } else {
    console.log(`[AUDIT] Analisando ${messages?.length || 0} mensagens no workspace da Mind...`);
    messages?.forEach(m => {
       // Filtro manual de conteúdo ou IDs que possam ter o telefone
       const body = String(m.body || "");
       const convId = String(m.conversation_id || "");
       if (body.includes(phone) || convId.includes(phone) || body.toLowerCase().includes("plays")) {
          console.log(`[MSG-DB] ${m.created_at} | Sender: ${m.sender} | Body: ${body.substring(0, 100)}`);
       }
    });
  }

  // Buscar logs técnicos específicos de erro
  const { data: errorLogs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("type", "error")
    .gt("created_at", threeHoursAgo)
    .order("created_at", { ascending: true });
  
  if (errorLogs?.length) {
    console.log(`[AUDIT] Encontrados ${errorLogs.length} logs de erro no período.`);
    errorLogs.forEach(l => console.log(`[ERR-LOG] ${l.created_at} | ${l.summary} | Metadata: ${JSON.stringify(l.metadata)}`));
  } else {
    console.log("[AUDIT] Nenhum log de erro técnico encontrado nas últimas 3 horas.");
  }
}

auditWebhookLogs().catch(console.error);
