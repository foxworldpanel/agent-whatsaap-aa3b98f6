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
  // Stealing that lock would allow a second worker into the same conversation.
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

  if (error) throw error;
  return Boolean(data?.conversation_id);
}
