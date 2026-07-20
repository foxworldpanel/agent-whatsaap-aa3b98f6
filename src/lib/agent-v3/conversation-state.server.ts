// src/lib/agent-v3/conversation-state.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ChatMessageV3 {
  role: "agent" | "customer";
  content: string;
}

export async function getConversationStateV3(userId: string, phone: string): Promise<ChatMessageV3[]> {
  const { data, error } = await supabaseAdmin
    .from("conversations_v3")
    .select("history")
    .eq("user_id", userId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    console.error("[V3-STATE] Error loading history:", error);
    return [];
  }
  return (data?.history as unknown as ChatMessageV3[]) || [];
}

export async function saveConversationStateV3(userId: string, phone: string, history: ChatMessageV3[]) {
  const { error } = await supabaseAdmin
    .from("conversations_v3")
    .upsert(
      { user_id: userId, phone, history: history as any, updated_at: new Date().toISOString() },
      { onConflict: "user_id, phone" }
    );

  if (error) {
    console.error("[V3-STATE] Error saving history:", error);
  } else {
    console.log(`[V3-STATE] Historico sincronizado para ${phone}`);
  }
}

/**
 * LIMPEZA EXCLUSIVA V3
 * Remove o histórico da tabela conversations_v3 sem afetar mensagens reais no WhatsApp (tabela conversations/messages).
 */
export async function clearConversationStateV3(userId: string, phone: string) {
  const { error } = await supabaseAdmin
    .from("conversations_v3")
    .delete()
    .eq("user_id", userId)
    .eq("phone", phone);

  if (error) {
    console.error("[V3-STATE] Error clearing history:", error);
    throw error;
  }
  console.log(`[V3-STATE] Estado V3 LIMPO para ${phone}`);
}
