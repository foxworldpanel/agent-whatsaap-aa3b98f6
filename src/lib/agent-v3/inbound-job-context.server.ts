import type { AgentInboundJob } from "@/lib/agent-v3/inbound-jobs.server";

export class AgentInboundResumeIntegrityError extends Error {
  readonly code = "AGENT_INBOUND_RESUME_INTEGRITY";
  constructor(message: string) {
    super(message);
    this.name = "AgentInboundResumeIntegrityError";
  }
}

export function isAgentInboundResumeIntegrityError(error: unknown): error is AgentInboundResumeIntegrityError {
  return error instanceof AgentInboundResumeIntegrityError ||
    (error instanceof Error && (error as Error & { code?: string }).code === "AGENT_INBOUND_RESUME_INTEGRITY");
}

function integrityError(message: string): never {
  throw new AgentInboundResumeIntegrityError(message);
}

export type AgentInboundResumeContext = {
  job: AgentInboundJob;
  message: { id: string; externalId: string; body: string; kind: string; audioUrl: string | null };
  conversationId: string; contactId: string; contactSource: string | null; phone: string; userId: string;
  workspaceId: string; whatsappNumberId: string; sendTarget: string;
  instance: { uazapiUrl: string; uazapiToken: string };
  content: { text: string; kind: AgentInboundJob["input_kind"]; mime?: string; mediaUrl?: string };
  deferredFunnelMessage: string | null;
};

function requireSameIdentity(label: string, expected: string, actual: unknown, jobId: string): void {
  const normalized = String(actual || "");
  if (!normalized || normalized !== expected) integrityError(`Inbound job ${label} mismatch: ${jobId}`);
}

function requireSupportedMessageKind(job: AgentInboundJob, persistedKind: unknown): void {
  const normalized = String(persistedKind || "").toLowerCase();
  if (!normalized) integrityError(`Inbound job persisted message kind missing: ${job.id}`);
  const compatible = job.input_kind === "texto"
    ? normalized === "texto" || normalized === "text"
    : normalized === job.input_kind;
  if (!compatible) integrityError(`Inbound job persisted message kind mismatch: ${job.id}`);
}

export async function loadAgentInboundResumeContext(supabaseAdmin: any, job: AgentInboundJob): Promise<AgentInboundResumeContext> {
  const { data: message, error: messageError } = await supabaseAdmin.from("messages")
    .select("id, external_id, body, kind, audio_url, conversation_id, user_id, workspace_id")
    .eq("id", job.message_id).maybeSingle();
  if (messageError) throw messageError;
  if (!message) integrityError(`Inbound job message not found: ${job.message_id}`);
  requireSameIdentity("message id", job.message_id, message.id, job.id);
  requireSameIdentity("message conversation", job.conversation_id, message.conversation_id, job.id);
  requireSameIdentity("message workspace", job.workspace_id, message.workspace_id, job.id);
  requireSupportedMessageKind(job, message.kind);

  const externalId = String(message.external_id || "").trim();
  if (!externalId) integrityError(`Inbound job external message id missing: ${job.id}`);

  const { data: conversation, error: conversationError } = await supabaseAdmin.from("conversations")
    .select("id, contact_id, whatsapp_number_id, user_id, workspace_id").eq("id", job.conversation_id).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation?.contact_id) integrityError(`Inbound job contact missing: ${job.id}`);
  if (!conversation.whatsapp_number_id) integrityError(`Inbound job WhatsApp number missing: ${job.id}`);
  requireSameIdentity("conversation id", job.conversation_id, conversation.id, job.id);
  requireSameIdentity("conversation workspace", job.workspace_id, conversation.workspace_id, job.id);

  const [{ data: contact, error: contactError }, { data: number, error: numberError }] = await Promise.all([
    supabaseAdmin.from("contacts").select("id, telefone, source, user_id, workspace_id").eq("id", conversation.contact_id).maybeSingle(),
    supabaseAdmin.from("whatsapp_numbers").select("id, uazapi_url, uazapi_token, user_id, workspace_id").eq("id", conversation.whatsapp_number_id).maybeSingle(),
  ]);
  if (contactError) throw contactError;
  if (numberError) throw numberError;
  if (!contact?.telefone) integrityError(`Inbound job phone missing: ${job.id}`);
  if (!number?.uazapi_url || !number?.uazapi_token) integrityError(`Inbound job provider credentials unavailable: ${job.id}`);

  const userId = String(conversation.user_id || "");
  if (!userId) integrityError(`Inbound job user missing: ${job.id}`);
  requireSameIdentity("message user", userId, message.user_id, job.id);
  requireSameIdentity("contact user", userId, contact.user_id, job.id);
  requireSameIdentity("WhatsApp user", userId, number.user_id, job.id);
  requireSameIdentity("contact workspace", job.workspace_id, contact.workspace_id, job.id);
  requireSameIdentity("WhatsApp workspace", job.workspace_id, number.workspace_id, job.id);

  const phone = String(contact.telefone).replace(/\D+/g, "");
  if (!phone) integrityError(`Inbound job normalized phone missing: ${job.id}`);
  const sendTarget = String(job.send_target || "").trim();
  if (!sendTarget) integrityError(`Inbound job send target missing: ${job.id}`);

  return {
    job,
    message: { id: String(message.id), externalId, body: String(message.body || ""), kind: String(message.kind || ""),
      audioUrl: message.audio_url ? String(message.audio_url) : null },
    conversationId: String(conversation.id), contactId: String(contact.id),
    contactSource: contact.source ? String(contact.source) : null, phone, userId, workspaceId: job.workspace_id,
    whatsappNumberId: String(number.id), sendTarget,
    instance: { uazapiUrl: String(number.uazapi_url), uazapiToken: String(number.uazapi_token) },
    content: { text: job.input_text, kind: job.input_kind, mime: job.input_mime || undefined,
      mediaUrl: message.audio_url ? String(message.audio_url) : undefined },
    deferredFunnelMessage: job.deferred_funnel ? job.input_text : null,
  };
}
