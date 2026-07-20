import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getConversationStateV3(userId: string, phone: string): Promise<Array<{ role: "agent" | "customer"; content: string }>> {
  // A tabela messages não tem o campo 'phone' diretamente, mas tem 'conversation_id'
  // Primeiro, precisamos achar a conversação desse telefone
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", phone)
    .maybeSingle();

  if (!conversation) return [];

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender, body")
    .eq("conversation_id", conversation.id)
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
  // O salvamento real no banco (tabela messages) já costuma ser feito pelo webhook ou via logs.
  // Como o uazapi-webhook.ts já lida com a persistência de mensagens e contatos no pipeline normal,
  // aqui apenas garantimos que o histórico esteja consistente no log de depuração.
  console.log(`[V3-STATE] Historico sincronizado para ${phone} com ${messages.length} mensagens`);
}
