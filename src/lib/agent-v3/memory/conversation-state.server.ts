import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ChatMessageV3 {
  role: "agent" | "customer";
  content: string;
}

export const DEFAULT_MIND_WORKSPACE_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

export function normalizePhoneV3(phone: string): string {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) throw new Error("[V3-STATE] Telefone inválido");
  return digits;
}

function resolveWorkspaceId(workspaceId?: string): string {
  return workspaceId?.trim() || DEFAULT_MIND_WORKSPACE_ID;
}

export async function getConversationStateV3(
  userId: string,
  phone: string,
  workspaceId?: string,
): Promise<{
  history: ChatMessageV3[];
  telemetry: {
    total_messages_stored: number;
    session_reset_reason?: string;
    history_truncated: boolean;
    oldest_message_sent_at?: string;
  };
}> {
  const normalizedPhone = normalizePhoneV3(phone);
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const { data, error } = await supabaseAdmin
    .from("conversations_v3")
    .select("history, updated_at")
    .eq("workspace_id", resolvedWorkspaceId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (error) {
    console.error("[V3-STATE] Error loading history:", error);
    return { history: [], telemetry: { total_messages_stored: 0, history_truncated: false } };
  }

  const rawHistory = (data?.history as unknown as ChatMessageV3[]) || [];
  const total_messages_stored = rawHistory.length;
  let history = [...rawHistory];
  let session_reset_reason: string | undefined;

  if (data?.updated_at && Date.now() - new Date(data.updated_at).getTime() > 24 * 60 * 60 * 1000) {
    history = [];
    session_reset_reason = "inactivity_24h";
  }

  const history_truncated = history.length > 10;
  if (history_truncated) history = history.slice(-10);

  return {
    history,
    telemetry: {
      total_messages_stored,
      session_reset_reason,
      history_truncated,
      oldest_message_sent_at: data?.updated_at ?? undefined,
    },
  };
}

export async function saveConversationStateV3(
  userId: string,
  phone: string,
  history: ChatMessageV3[],
  workspaceId?: string,
) {
  const normalizedPhone = normalizePhoneV3(phone);
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const { error } = await supabaseAdmin.from("conversations_v3").upsert(
    {
      workspace_id: resolvedWorkspaceId,
      user_id: userId,
      phone: normalizedPhone,
      history: history as any,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id, phone" },
  );

  if (error) console.error("[V3-STATE] Error saving history:", error);
}

export async function clearConversationStateV3(
  userId: string,
  phone: string,
  workspaceId?: string,
) {
  const normalizedPhone = normalizePhoneV3(phone);
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const localPhone = normalizedPhone.startsWith("55") ? normalizedPhone.slice(2) : normalizedPhone;
  const variants = Array.from(new Set([normalizedPhone, localPhone]));

  const { error } = await supabaseAdmin
    .from("conversations_v3")
    .delete()
    .eq("workspace_id", resolvedWorkspaceId)
    .in("phone", variants);

  if (error) {
    console.error("[V3-STATE] Error clearing history:", error);
    throw error;
  }
}
