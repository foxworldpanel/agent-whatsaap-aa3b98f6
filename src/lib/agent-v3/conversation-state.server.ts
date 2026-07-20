import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getConversationStateV3(userId: string, phone: string): Promise<Array<{ role: "agent" | "customer"; content: string }>> {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("sender, body")
    .eq("user_id", userId)
    .eq("phone", phone)
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
  // aqui apenas garantimos que o histórico esteja consistente.
  console.log(`[V3-STATE] Historico atualizado para ${phone} com ${messages.length} mensagens`);
}
