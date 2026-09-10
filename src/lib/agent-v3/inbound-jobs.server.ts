export const AGENT_INBOUND_MAX_SAFE_ATTEMPTS = 5;

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

type AgentInboundJobInput = {
  messageId: string;
  conversationId: string;
  workspaceId: string;
  sendTarget: string;
  inputText: string;
  inputKind: AgentInboundKind;
  inputMime?: string;
  deferredFunnel: boolean;
};

function sameInboundSnapshot(job: AgentInboundJob, input: AgentInboundJobInput): boolean {
  return (
    job.message_id === input.messageId &&
    job.conversation_id === input.conversationId &&
    job.workspace_id === input.workspaceId &&
    job.send_target === input.sendTarget &&
    job.input_text === input.inputText &&
    job.input_kind === input.inputKind &&
    (job.input_mime ?? null) === (input.inputMime ?? null) &&
    job.deferred_funnel === input.deferredFunnel
  );
}

async function readAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
): Promise<AgentInboundJob | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .select("*")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as AgentInboundJob) : null;
}

export async function ensureAgentInboundJob(
  supabaseAdmin: any,
  input: AgentInboundJobInput,
): Promise<void> {
  const row = {
    message_id: input.messageId,
    conversation_id: input.conversationId,
    workspace_id: input.workspaceId,
    send_target: input.sendTarget,
    input_text: input.inputText,
    input_kind: input.inputKind,
    input_mime: input.inputMime ?? null,
    deferred_funnel: input.deferredFunnel,
    status: "pending",
  };

  const { error } = await supabaseAdmin.from("agent_inbound_jobs").insert(row);
  if (!error) return;
  if (error.code !== "23505") throw error;

  const existing = await readAgentInboundJob(supabaseAdmin, input.messageId);
  if (!existing) {
    throw new Error(`Agent inbound job duplicate disappeared for message ${input.messageId}`);
  }
  if (!sameInboundSnapshot(existing, input)) {
    throw new Error(`Agent inbound job snapshot conflict for message ${input.messageId}`);
  }
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

export async function transferAgentInboundJobClaim(
  supabaseAdmin: any,
  messageId: string,
  fromHolder: string,
  toHolder: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("transfer_agent_inbound_job_claim", {
    p_message_id: messageId,
    p_from_holder: fromHolder,
    p_to_holder: toHolder,
  });
  if (!error) return data === true;

  try {
    const current = await readAgentInboundJob(supabaseAdmin, messageId);
    if (current?.status === "processing_safe" && current.claimed_by === toHolder) return true;
    if (current?.status === "processing_safe" && current.claimed_by === fromHolder) return false;
  } catch (verifyError) {
    console.error("[AGENT-INBOUND-JOB] failed to verify claim transfer after RPC error", verifyError);
  }
  throw error;
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
  if (!error) return data === true;

  try {
    const current = await readAgentInboundJob(supabaseAdmin, messageId);
    if (current?.status === "processing" && current.claimed_by === holder) return true;
    if (current?.status === "processing_safe" && current.claimed_by === holder) return false;
  } catch (verifyError) {
    console.error("[AGENT-INBOUND-JOB] failed to verify runtime transition after RPC error", verifyError);
  }
  throw error;
}

export async function releaseAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError?: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
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
    .eq("claimed_by", holder)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/** Quarantines a job before runtime side effects, guarded by its safe holder. */
export async function reviewSafeAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .update({
      status: "needs_review",
      claimed_by: null,
      claimed_at: null,
      last_error: lastError.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("message_id", messageId)
    .eq("status", "processing_safe")
    .eq("claimed_by", holder)
    .select("id")
    .maybeSingle();
  if (!error) return Boolean(data?.id);

  try {
    const current = await readAgentInboundJob(supabaseAdmin, messageId);
    if (current?.status === "needs_review" && current.claimed_by === null) return true;
  } catch (verifyError) {
    console.error("[AGENT-INBOUND-JOB] failed to verify safe review transition", verifyError);
  }
  throw error;
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
  if (!error && data?.id) return;

  if (error) {
    try {
      const current = await readAgentInboundJob(supabaseAdmin, messageId);
      if (current?.status === "processed" && current.claimed_by === null) return;
    } catch (verifyError) {
      console.error("[AGENT-INBOUND-JOB] failed to verify completion after DB error", verifyError);
    }
    throw error;
  }
  throw new Error(`Agent inbound job completion rejected for message ${messageId}`);
}

export async function reviewAgentInboundJob(
  supabaseAdmin: any,
  messageId: string,
  holder: string,
  lastError: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
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
    .eq("claimed_by", holder)
    .select("id")
    .maybeSingle();
  if (!error) return Boolean(data?.id);

  try {
    const current = await readAgentInboundJob(supabaseAdmin, messageId);
    if (current?.status === "needs_review" && current.claimed_by === null) return true;
  } catch (verifyError) {
    console.error("[AGENT-INBOUND-JOB] failed to verify review transition after DB error", verifyError);
  }
  throw error;
}

export async function recoverStaleAgentInboundJobs(
  supabaseAdmin: any,
  staleBefore: string,
  maxAttempts = AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
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