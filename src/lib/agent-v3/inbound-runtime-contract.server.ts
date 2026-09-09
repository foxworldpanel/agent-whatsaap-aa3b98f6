import type { AgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";

/**
 * Stable input boundary for Agent V3 after webhook eligibility gates.
 *
 * Both the immediate webhook path and the durable dispatcher must eventually
 * call the same runtime with this shape. Keeping the contract independent from
 * the raw Uazapi payload prevents recovery from replaying dedup/CRM/funnel gates.
 */
export type AgentV3RuntimeInput = {
  source: "webhook" | "dispatcher";
  messageId: string;
  externalMessageId: string;
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
    kind: "texto" | "audio" | "image" | "sticker";
    mime?: string;
    mediaUrl?: string;
  };
  deferredFunnelMessage: string | null;
};

export type AgentV3RuntimeResult = {
  responseText: string;
};

export type AgentV3RuntimeExecutor = (
  supabaseAdmin: any,
  input: AgentV3RuntimeInput,
) => Promise<AgentV3RuntimeResult>;

export type WebhookAgentV3RuntimeBoundary = {
  messageId: string;
  externalMessageId: string;
  conversationId: string;
  contactId: string;
  contactSource: string | null;
  phone: string;
  userId: string;
  workspaceId: string;
  whatsappNumberId: string;
  sendTarget: string;
  uazapiUrl: string;
  uazapiToken: string;
  content: AgentV3RuntimeInput["content"];
  deferredFunnelMessage: string | null;
};

/**
 * Converts the already-eligible immediate webhook state into the same runtime
 * input used by durable recovery. This adapter must only be called after all
 * webhook-only gates have passed and the durable job has been created.
 */
export function runtimeInputFromWebhookBoundary(
  boundary: WebhookAgentV3RuntimeBoundary,
): AgentV3RuntimeInput {
  const externalMessageId = boundary.externalMessageId.trim();
  const sendTarget = boundary.sendTarget.trim();
  const phone = boundary.phone.replace(/\D+/g, "");

  if (!boundary.messageId || !externalMessageId) {
    throw new Error("Agent V3 webhook runtime identity is incomplete");
  }
  if (!boundary.conversationId || !boundary.contactId) {
    throw new Error("Agent V3 webhook conversation identity is incomplete");
  }
  if (!boundary.userId || !boundary.workspaceId || !boundary.whatsappNumberId) {
    throw new Error("Agent V3 webhook tenant identity is incomplete");
  }
  if (!sendTarget || !phone) {
    throw new Error("Agent V3 webhook delivery identity is incomplete");
  }
  if (!boundary.uazapiUrl || !boundary.uazapiToken) {
    throw new Error("Agent V3 webhook provider credentials are unavailable");
  }

  return {
    source: "webhook",
    messageId: boundary.messageId,
    externalMessageId,
    conversationId: boundary.conversationId,
    contactId: boundary.contactId,
    contactSource: boundary.contactSource,
    phone,
    userId: boundary.userId,
    workspaceId: boundary.workspaceId,
    whatsappNumberId: boundary.whatsappNumberId,
    sendTarget,
    instance: {
      uazapiUrl: boundary.uazapiUrl,
      uazapiToken: boundary.uazapiToken,
    },
    content: boundary.content,
    deferredFunnelMessage: boundary.deferredFunnelMessage,
  };
}

/** Converts a durable recovery context into exactly the shared runtime shape. */
export function runtimeInputFromResumeContext(
  context: AgentInboundResumeContext,
): AgentV3RuntimeInput {
  return {
    source: "dispatcher",
    messageId: context.message.id,
    externalMessageId: context.message.externalId,
    conversationId: context.conversationId,
    contactId: context.contactId,
    contactSource: context.contactSource,
    phone: context.phone,
    userId: context.userId,
    workspaceId: context.workspaceId,
    whatsappNumberId: context.whatsappNumberId,
    sendTarget: context.sendTarget,
    instance: context.instance,
    content: context.content,
    deferredFunnelMessage: context.deferredFunnelMessage,
  };
}
