const DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000;

async function readConversationLock(
  supabaseAdmin: any,
  conversationId: string,
): Promise<{ conversation_id: string; holder: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_generation_locks")
    .select("conversation_id,holder")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Acquires the persistent conversation lock through one database transaction.
 *
 * The RPC owns stale-lock cleanup and the active durable-owner check atomically.
 * The database function serializes this conversation with the same advisory
 * namespace used by Stage B and Customer Turns.
 */
export async function acquireAgentConversationLock(
  supabaseAdmin: any,
  conversationId: string,
  holder: string,
): Promise<boolean> {
  const staleBefore = new Date(
    Date.now() - DB_CONVERSATION_LOCK_STALE_MS,
  ).toISOString();

  const { data, error } = await supabaseAdmin.rpc(
    "acquire_agent_conversation_lock",
    {
      p_conversation_id: conversationId,
      p_holder: holder,
      p_stale_before: staleBefore,
    },
  );

  if (error) throw error;
  return data === true;
}

export async function releaseAgentConversationLock(
  supabaseAdmin: any,
  conversationId: string,
  holder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    "release_agent_conversation_lock",
    {
      p_conversation_id: conversationId,
      p_holder: holder,
    },
  );

  if (!error && data === true) return true;

  // Verify transport/RPC uncertainty durably. Unlock is idempotent for this
  // holder: a missing row or a different holder proves our ownership ended.
  // Only the same durable holder proves release failed.
  try {
    const current = await readConversationLock(supabaseAdmin, conversationId);
    if (!current) return true;
    if (current.holder !== holder) return true;
    return false;
  } catch (verifyError) {
    console.error(
      "[AGENT-CONVERSATION-LOCK] failed to verify conversation unlock",
      verifyError,
    );
    if (error) throw error;
    throw verifyError;
  }
}
