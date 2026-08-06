import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function runPatch() {
  const conversationId = "5117a8a6-deb2-495a-8be2-437c76fbb698";
  
  console.log(`[PATCH] Desativando agente para a conversa ${conversationId}...`);
  
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({ agent_enabled: false })
    .eq("id", conversationId)
    .select("id, agent_enabled");
    
  if (error) {
    console.error("[PATCH] Erro ao atualizar:", error);
    process.exit(1);
  }
  
  console.log("[PATCH] Sucesso:", data);
  process.exit(0);
}

runPatch().catch(err => {
  console.error(err);
  process.exit(1);
});
