const DB_CONVERSATION_LOCK_STALE_MS = 5 * 60 * 1000;

async function hasActiveInboundRuntime(
  supabaseAdmin: any,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "processing")
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

  // Time alone is not proof that a generation lock is orphaned. Agent V3 can
  // legitimately spend longer than the stale window in runtime. If the durable
  // ownership table still says this conversation has a processing job, never
  // steal its generation lock; stale processing recovery will route uncertainty
  // to needs_review instead of allowing a concurrent second runtime.
  if (await hasActiveInboundRuntime(supabaseAdmin, conversationId)) {
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
