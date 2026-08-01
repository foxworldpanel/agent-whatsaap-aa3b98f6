import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function auditWebhookLogs() {
  const phone = "5511970116430";
  const mindWorkspaceId = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';
  console.log(`[AUDIT] Buscando mensagens em AMBOS os sentidos para ${phone}...`);
  
  // Buscar mensagens do número (cliente ou agente) via conversation_id contendo o telefone
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("workspace_id", mindWorkspaceId)
    .ilike("conversation_id", `%${phone}%`)
    .order("created_at", { ascending: true });

  if (messages?.length) {
    console.log(`[AUDIT] Encontradas ${messages.length} mensagens na conversa.`);
    messages.forEach(m => {
      console.log(`[MSG] ${m.created_at} | ${m.sender} | ${m.body}`);
    });
  } else {
    console.log("[AUDIT] Nenhuma mensagem encontrada na conversa via conversation_id.");
    
    // Tentar busca textual se o conversation_id não bater
    const { data: textMessages } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("workspace_id", mindWorkspaceId)
      .or(`body.ilike.%${phone}%,body.ilike.%Quero comprar plays%`)
      .order("created_at", { ascending: true });
      
    textMessages?.forEach(m => {
      console.log(`[MSG-TEXT] ${m.created_at} | ${m.sender} | Conv: ${m.conversation_id} | Body: ${m.body}`);
    });
  }
}

auditWebhookLogs().catch(console.error);
