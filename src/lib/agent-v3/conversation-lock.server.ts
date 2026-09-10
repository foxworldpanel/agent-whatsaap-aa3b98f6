const DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000;

async function hasActiveInboundOwnership(
  supabaseAdmin: any,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("status", ["processing_safe", "processing"])
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

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

export async function acquireAgentConversationLock(
  supabaseAdmin: any,
  conversationId: string,
  holder: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("agent_generation_locks")
    .insert({
      conversation_id: conversationId,
      holder,
      acquired_at: new Date().toISOString(),
    });

  if (!error) return true;
  if (error.code !== "23505") throw error;

  // Time alone is not proof that a generation lock is orphaned. Protect both
  // processing_safe and processing durable ownership: a safe claimant may have
  // acquired the conversation lock and still be crossing the runtime boundary.
  if (await hasActiveInboundOwnership(supabaseAdmin, conversationId)) {
    return false;
  }

  const staleBefore = new Date(
    Date.now() - DB_CONVERSATION_LOCK_STALE_MS,
  ).toISOString();

  const { error: staleDeleteError } = await supabaseAdmin
    .from("agent_generation_locks")
    .delete()
    .eq("conversation_id", conversationId)
    .lt("acquired_at", staleBefore);
  if (staleDeleteError) throw staleDeleteError;

  const { error: retryError } = await supabaseAdmin
    .from("agent_generation_locks")
    .insert({
      conversation_id: conversationId,
      holder,
      acquired_at: new Date().toISOString(),
    });

  if (!retryError) return true;
  if (retryError.code === "23505") return false;
  throw retryError;
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

  if (!error) return Boolean(data?.conversation_id);

  // DELETE may have committed even when the client lost the response. Verify
  // durable lock state before telling ownership finalization that unlock failed.
  // No row means our delete succeeded (or an equivalent terminal state exists).
  // The same holder means it definitely remains ours and was not released.
  try {
    const current = await readConversationLock(supabaseAdmin, conversationId);
    if (!current) return true;
    if (current.holder === holder) return false;
  } catch (verifyError) {
    console.error(
      "[AGENT-CONVERSATION-LOCK] failed to verify unlock after DB error",
      verifyError,
    );
  }

  // A different holder or unreadable state is ownership uncertainty; never
  // pretend our release succeeded because doing so could hide a lock race.
  throw error;
}
