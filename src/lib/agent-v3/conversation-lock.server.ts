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
 * The RPC owns stale-lock cleanup and the active inbound-job check atomically;
 * doing those as separate client round-trips leaves a TOCTOU window where a
 * worker can create processing_safe ownership after the check but before stale
 * deletion. The database function serializes the conversation lock row and
 * refuses stale cleanup while any processing_safe/processing job is active.
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
  const { data, error } = await supabaseAdmin
    .from("agent_generation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("holder", holder)
    .select("conversation_id")
    .maybeSingle();

  if (!error && data?.conversation_id) return true;

  // Verify both transport errors and a normal zero-row DELETE. A zero-row result
  // is not enough to say our holder released the lock: another holder may have
  // replaced it, or the lock may already be gone after an earlier successful
  // finalization. Durable read-back distinguishes those states.
  try {
    const current = await readConversationLock(supabaseAdmin, conversationId);
    if (!current) return true;
    if (current.holder === holder) return false;
    return false;
  } catch (verifyError) {
    console.error(
      "[AGENT-CONVERSATION-LOCK] failed to verify conversation unlock",
      verifyError,
    );
  }

  if (error) throw error;
  return false;
}
