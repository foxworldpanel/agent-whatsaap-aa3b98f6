import type { AgentV3RuntimeInput } from "@/lib/agent-v3/inbound-runtime-contract.server";
import { loadAgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import type { AgentInboundJob } from "@/lib/agent-v3/inbound-jobs.server";
import { loadCustomerTurnMembers, type AgentCustomerTurnMember } from "@/lib/agent-v3/customer-turn.server";
import { resolveCustomerTurnMemberText } from "@/lib/agent-v3/customer-turn-media.server";

export type AgentCustomerTurnRuntime = { input: AgentV3RuntimeInput; members: AgentCustomerTurnMember[] };

export async function buildCustomerTurnRuntimeInput(supabaseAdmin: any, turnId: string): Promise<AgentCustomerTurnRuntime> {
  const members = await loadCustomerTurnMembers(supabaseAdmin, turnId);
  if (!members.length) throw new Error(`Customer Turn ${turnId} has no members`);
  const last = members[members.length - 1];

  const { data: job, error } = await supabaseAdmin.from("agent_inbound_jobs").select("*").eq("id", last.job_id).single();
  if (error) throw error;
  const context = await loadAgentInboundResumeContext(supabaseAdmin, job as AgentInboundJob);

  const { data: integration, error: integrationError } = await supabaseAdmin.from("integrations")
    .select("openai_api_key").eq("user_id", context.userId).eq("workspace_id", context.workspaceId).maybeSingle();
  if (integrationError) throw integrationError;
  const openaiApiKey = integration?.openai_api_key?.trim() || process.env.OPENAI_API_KEY?.trim() || "";

  const resolved: string[] = [];
  for (const member of members) {
    const text = await resolveCustomerTurnMemberText(supabaseAdmin, member, {
      conversationId: context.conversationId,
      phone: context.phone,
      uazapiUrl: context.instance.uazapiUrl,
      uazapiToken: context.instance.uazapiToken,
      openaiApiKey,
    });
    if (text.trim()) resolved.push(text.trim());
  }
  const combinedText = resolved.join("\n").trim();
  if (!combinedText) throw new Error(`Customer Turn ${turnId} resolved to empty content`);

  return {
    members,
    input: {
      source: "dispatcher", messageId: last.message_id, externalMessageId: last.external_id,
      conversationId: context.conversationId, contactId: context.contactId, contactSource: context.contactSource,
      phone: context.phone, userId: context.userId, workspaceId: context.workspaceId,
      whatsappNumberId: context.whatsappNumberId, sendTarget: context.sendTarget, instance: context.instance,
      content: { text: combinedText, kind: "texto" },
      deferredFunnelMessage: context.deferredFunnelMessage,
    },
  };
}
