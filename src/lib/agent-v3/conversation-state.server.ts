// src/lib/agent-v3/conversation-state.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ChatMessageV3 {
  role: "agent" | "customer";
  content: string;
}

export async function getConversationStateV3(userId: string, phone: string): Promise<{ history: ChatMessageV3[], telemetry: { total_messages_stored: number, session_reset_reason?: string, history_truncated: boolean, oldest_message_sent_at?: string } }> {
  const { data, error } = await supabaseAdmin
    .from("conversations_v3")
    .select("history, updated_at")
    .eq("user_id", userId)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    console.error("[V3-STATE] Error loading history:", error);
    return { history: [], telemetry: { total_messages_stored: 0, history_truncated: false } };
  }

  const rawHistory = (data?.history as unknown as ChatMessageV3[]) || [];
  const total_messages_stored = rawHistory.length;
  let history = [...rawHistory];
  let session_reset_reason: string | undefined;

  // EXPIRAÇÃO DE 24 HORAS
  if (data?.updated_at) {
    const lastUpdate = new Date(data.updated_at).getTime();
    const now = Date.now();
    if (now - lastUpdate > 24 * 60 * 60 * 1000) {
      console.log(`[V3-STATE] Sessão expirada (24h) para ${phone}`);
      history = [];
      session_reset_reason = "inactivity_24h";
    }
  }

  // LIMITE DE 10 MENSAGENS
  const history_truncated = history.length > 10;
  if (history_truncated) {
    history = history.slice(-10);
  }

  const oldest_message_sent_at = data?.updated_at; // Aproximação baseada no registro

  return { 
    history, 
    telemetry: { 
      total_messages_stored, 
      session_reset_reason, 
      history_truncated,
      oldest_message_sent_at
    } 
  };
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
