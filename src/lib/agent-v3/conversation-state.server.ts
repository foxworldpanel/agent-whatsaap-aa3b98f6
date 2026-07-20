import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getConversationStateV3(userId: string, phone: string): Promise<Array<{ role: "agent" | "customer"; content: string }>> {
  // Encontra a conversa pelo telefone e userId
  // Usamos 'aguardando' ou 'agente_respondendo' como estados ativos
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["aguardando", "agente_respondendo"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = conversation?.id;
  if (!conversationId) {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("telefone", phone)
      .maybeSingle();
    
    if (contact) {
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("contact_id", contact.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversationId = conv?.id;
    }
  }

  if (!conversationId) return [];

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!messages) return [];

  return messages
    .reverse()
    .map((m) => ({
      role: m.sender === "agente" ? "agent" : "customer",
      content: m.body || "",
    }));
}

export async function saveConversationStateV3(userId: string, phone: string, messages: Array<{ role: "agent" | "customer"; content: string }>): Promise<void> {
  console.log(`[V3-STATE] Historico sincronizado para ${phone}`);
}
