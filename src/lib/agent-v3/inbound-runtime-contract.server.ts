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
