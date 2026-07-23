import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ChatMessageV3 {
  role: "agent" | "customer";
  content: string;
}

const MAX_STORED_MESSAGES = 100;
const MAX_CONTEXT_MESSAGES = 10;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function digitsOnly(phone: string): string {
  return String(phone || "").replace(/\D+/g, "");
}

/**
 * Canonical phone format used by Agent V3.
 * Brazilian local numbers (10 or 11 digits) are stored with country code 55.
 * International numbers are preserved after punctuation is removed.
 */
export function normalizePhoneV3(phone: string): string {
  let digits = digitsOnly(phone);
  if (!digits) throw new Error("[V3-STATE] Telefone inválido");

  // International dialing prefix, e.g. 005511970116430.
  if (digits.startsWith("00")) digits = digits.slice(2);

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  return digits;
}

function phoneVariantsV3(phone: string): string[] {
  const raw = digitsOnly(phone).replace(/^00/, "");
  const canonical = normalizePhoneV3(phone);
  const local = canonical.startsWith("55") && (canonical.length === 12 || canonical.length === 13)
    ? canonical.slice(2)
    : canonical;

  return Array.from(new Set([canonical, raw, local].filter(Boolean)));
}

function resolveWorkspaceId(workspaceId?: string): string {
  const resolved = workspaceId?.trim();
  if (!resolved) {
    throw new Error("[V3-STATE] workspaceId é obrigatório; memória não pode usar fallback entre workspaces");
  }
  return resolved;
}

function sanitizeHistoryV3(value: unknown): ChatMessageV3[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is ChatMessageV3 => {
      if (!item || typeof item !== "object") return false;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      return (role === "agent" || role === "customer") && typeof content === "string" && content.trim().length > 0;
    })
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .slice(-MAX_STORED_MESSAGES);
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
  void userId;
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const variants = phoneVariantsV3(phone);

  const { data, error } = await supabaseAdmin
    .from("conversations_v3")
    .select("history, updated_at, phone")
    .eq("workspace_id", resolvedWorkspaceId)
    .in("phone", variants)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[V3-STATE] Error loading history:", error);
    return { history: [], telemetry: { total_messages_stored: 0, history_truncated: false } };
  }

  const rawHistory = sanitizeHistoryV3(data?.history);
  const total_messages_stored = rawHistory.length;
  let history = [...rawHistory];
  let session_reset_reason: string | undefined;

  const updatedAtMs = data?.updated_at ? new Date(data.updated_at).getTime() : Number.NaN;
  if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > SESSION_TTL_MS) {
    history = [];
    session_reset_reason = "inactivity_24h";
  }

  const history_truncated = history.length > MAX_CONTEXT_MESSAGES;
  if (history_truncated) history = history.slice(-MAX_CONTEXT_MESSAGES);

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
  const safeHistory = sanitizeHistoryV3(history);

  const { error } = await supabaseAdmin.from("conversations_v3").upsert(
    {
      workspace_id: resolvedWorkspaceId,
      user_id: userId,
      phone: normalizedPhone,
      history: safeHistory as any,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id, phone" },
  );

  if (error) {
    console.error("[V3-STATE] Error saving history:", error);
    throw error;
  }
}

export async function clearConversationStateV3(
  userId: string,
  phone: string,
  workspaceId?: string,
) {
  void userId;
  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);
  const variants = phoneVariantsV3(phone);

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
