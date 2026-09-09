export type AgentInboundKind = "texto" | "audio" | "image" | "sticker";

export type AgentInboundJob = {
  id: string;
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  send_target: string;
  input_text: string;
  input_kind: AgentInboundKind;
  input_mime: string | null;
  deferred_funnel: boolean;
  status: "pending" | "processing_safe" | "processing" | "processed" | "needs_review";
  claimed_by: string | null;
  claimed_at: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensureAgentInboundJob(
  supabaseAdmin: any,
  input: {
    messageId: string;
    conversationId: string;
    workspaceId: string;
    sendTarget: string;
    inputText: string;
    inputKind: AgentInboundKind;
    inputMime?: string;
    deferredFunnel: boolean;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from("agent_inbound_jobs").insert({
    message_id: input.messageId,
    conversation_id: input.conversationId,
    workspace_id: input.workspaceId,
    send_target: input.sendTarget,
    input_text: input.inputText,
    input_kind: input.inputKind,
    input_mime: input.inputMime ?? null,
    deferred_funnel: input.deferredFunnel,
    status: "pending",
  });
  if (!error || error.code === "23505") return;
  throw error;
}

export async function claimAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("claim_agent_inbound_job", {
    p_message_id: messageId,
    p_holder: holder,
  });
  if (error) throw error;
  return data === true;
}

export async function claimNextAgentInboundJob(
  supabaseAdmin: any,
  holder: string,
): Promise<AgentInboundJob | null> {
  const { data, error } = await supabaseAdmin.rpc("claim_next_agent_inbound_job", {
    p_holder: holder,
  });
  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? (data[0] as AgentInboundJob) : null;
}

export async function enterAgentInboundRuntime(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("enter_agent_inbound_runtime", {
    p_message_id: messageId,
    p_holder: holder,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError?: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "pending",
      claimed_by: null,
      claimed_at: null,
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing_safe")
    .eq("claimed_by", holder);
  if (error) throw error;
}

export async function completeAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "processed",
      claimed_by: null,
      claimed_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing")
    .eq("claimed_by", holder)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Agent inbound job completion rejected for message ${messageId}`);
}

export async function reviewAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "needs_review",
      claimed_by: null,
      claimed_at: null,
      last_error: lastError.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing")
    .eq("claimed_by", holder);
  if (error) throw error;
}

export async function recoverStaleAgentInboundJobs(
  supabaseAdmin: any,
  staleBefore: string,
  maxAttempts = 5,
): Promise<{ requeued: number; review: number }> {
  const { data, error } = await supabaseAdmin.rpc("recover_stale_agent_inbound_jobs", {
    p_stale_before: staleBefore,
    p_max_attempts: maxAttempts,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    requeued: Number(row?.requeued ?? 0),
    review: Number(row?.review ?? 0),
  };
}
