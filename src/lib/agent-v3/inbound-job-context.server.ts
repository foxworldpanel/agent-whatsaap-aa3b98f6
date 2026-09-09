import type { AgentInboundJob } from "@/lib/agent-v3/inbound-jobs.server";

export type AgentInboundResumeContext = {
  job: AgentInboundJob;
  message: {
    id: string;
    externalId: string;
    body: string;
    kind: string;
    audioUrl: string | null;
  };
  conversationId: string;
  contactId: string;
  contactSource: string | null;
  phone: string;
  userId: string;
  workspaceId: string;
  whatsappNumberId: string;
  sendTarget: string;
  instance: {
    uazapiUrl: string;
    uazapiToken: string;
  };
  content: {
    text: string;
    kind: AgentInboundJob["input_kind"];
    mime?: string;
    mediaUrl?: string;
  };
  deferredFunnelMessage: string | null;
};

function requireSameIdentity(
  label: string,
  expected: string,
  actual: unknown,
  jobId: string,
): void {
  const normalized = String(actual || "");
  if (!normalized || normalized !== expected) {
    throw new Error(`Inbound job ${label} mismatch: ${jobId}`);
  }
}

/**
 * Rebuild only the state required at the Agent V3 post-gates boundary.
 * It deliberately does not replay webhook dedup, CRM, funnel or agent gates.
 * Provider credentials are resolved at execution time and are never persisted
 * in agent_inbound_jobs.
 */
export async function loadAgentInboundResumeContext(
  supabaseAdmin: any,
  job: AgentInboundJob,
): Promise<AgentInboundResumeContext> {
  const { data: message, error: messageError } = await supabaseAdmin
    .from("messages")
    .select("id, external_id, body, kind, audio_url, conversation_id, user_id, workspace_id")
    .eq("id", job.message_id)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) throw new Error(`Inbound job message not found: ${job.message_id}`);
  requireSameIdentity("message conversation", job.conversation_id, message.conversation_id, job.id);
  requireSameIdentity("message workspace", job.workspace_id, message.workspace_id, job.id);

  const externalId = String(message.external_id || "").trim();
  if (!externalId) {
    // Recovery of media depends on the original provider message id. More
    // importantly, an empty id makes a reconstructed execution ambiguous, so
    // fail before runtime side effects instead of attempting a best-effort replay.
    throw new Error(`Inbound job external message id missing: ${job.id}`);
  }

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("conversations")
    .select("id, contact_id, whatsapp_number_id, user_id, workspace_id")
    .eq("id", job.conversation_id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation?.contact_id) throw new Error(`Inbound job contact missing: ${job.id}`);
  if (!conversation.whatsapp_number_id) {
    throw new Error(`Inbound job WhatsApp number missing: ${job.id}`);
  }
  requireSameIdentity("conversation workspace", job.workspace_id, conversation.workspace_id, job.id);

  const [{ data: contact, error: contactError }, { data: number, error: numberError }] =
    await Promise.all([
      supabaseAdmin
        .from("contacts")
        .select("id, telefone, source, user_id, workspace_id")
        .eq("id", conversation.contact_id)
        .maybeSingle(),
      supabaseAdmin
        .from("whatsapp_numbers")
        .select("id, uazapi_url, uazapi_token, user_id, workspace_id")
        .eq("id", conversation.whatsapp_number_id)
        .maybeSingle(),
    ]);

  if (contactError) throw contactError;
  if (numberError) throw numberError;
  if (!contact?.telefone) throw new Error(`Inbound job phone missing: ${job.id}`);
  if (!number?.uazapi_url || !number?.uazapi_token) {
    throw new Error(`Inbound job provider credentials unavailable: ${job.id}`);
  }

  const userId = String(conversation.user_id || "");
  if (!userId) throw new Error(`Inbound job user missing: ${job.id}`);

  // A durable resume must never cross tenants. The webhook originally resolved
  // all these rows under one user/workspace; recovery verifies the same invariant
  // again before acquiring runtime ownership.
  requireSameIdentity("message user", userId, message.user_id, job.id);
  requireSameIdentity("contact user", userId, contact.user_id, job.id);
  requireSameIdentity("WhatsApp user", userId, number.user_id, job.id);
  requireSameIdentity("contact workspace", job.workspace_id, contact.workspace_id, job.id);
  requireSameIdentity("WhatsApp workspace", job.workspace_id, number.workspace_id, job.id);

  const phone = String(contact.telefone).replace(/\D+/g, "");
  if (!phone) throw new Error(`Inbound job normalized phone missing: ${job.id}`);

  const sendTarget = String(job.send_target || "").trim();
  if (!sendTarget) throw new Error(`Inbound job send target missing: ${job.id}`);

  return {
    job,
    message: {
      id: String(message.id),
      externalId,
      body: String(message.body || ""),
      kind: String(message.kind || ""),
      audioUrl: message.audio_url ? String(message.audio_url) : null,
    },
    conversationId: String(conversation.id),
    contactId: String(contact.id),
    contactSource: contact.source ? String(contact.source) : null,
    phone,
    userId,
    workspaceId: job.workspace_id,
    whatsappNumberId: String(number.id),
    sendTarget,
    instance: {
      uazapiUrl: String(number.uazapi_url),
      uazapiToken: String(number.uazapi_token),
    },
    content: {
      text: job.input_text,
      kind: job.input_kind,
      mime: job.input_mime || undefined,
      // Audio/image recovery may reuse the media reference persisted by the
      // original webhook; runtime still prefers provider resolution by external id.
      mediaUrl: message.audio_url ? String(message.audio_url) : undefined,
    },
    deferredFunnelMessage: job.deferred_funnel ? job.input_text : null,
  };
}
