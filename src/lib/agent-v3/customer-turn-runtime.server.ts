import type { AgentV3RuntimeInput } from "@/lib/agent-v3/inbound-runtime-contract.server";
import { loadAgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import type { AgentInboundJob } from "@/lib/agent-v3/inbound-jobs.server";
import {
  loadCustomerTurnMembers,
  renderCustomerTurnText,
  type AgentCustomerTurnMember,
} from "@/lib/agent-v3/customer-turn.server";

export type AgentCustomerTurnRuntime = {
  input: AgentV3RuntimeInput;
  members: AgentCustomerTurnMember[];
};

export async function buildCustomerTurnRuntimeInput(
  supabaseAdmin: any,
  turnId: string,
): Promise<AgentCustomerTurnRuntime> {
  const members = await loadCustomerTurnMembers(supabaseAdmin, turnId);
  if (!members.length) throw new Error(`Customer Turn ${turnId} has no members`);

  const first = members[0];
  const last = members[members.length - 1];
  const { data: job, error } = await supabaseAdmin
    .from("agent_inbound_jobs")
    .select("*")
    .eq("id", last.job_id)
    .single();
  if (error) throw error;

  const context = await loadAgentInboundResumeContext(supabaseAdmin, job as AgentInboundJob);
  const combinedText = renderCustomerTurnText(members);

  return {
    members,
    input: {
      source: "dispatcher",
      messageId: last.message_id,
      externalMessageId: last.external_id,
      conversationId: context.conversationId,
      contactId: context.contactId,
      contactSource: context.contactSource,
      phone: context.phone,
      userId: context.userId,
      workspaceId: context.workspaceId,
      whatsappNumberId: context.whatsappNumberId,
      sendTarget: context.sendTarget,
      instance: context.instance,
      content: {
        text: combinedText,
        kind: members.length === 1 ? last.input_kind : "texto",
        mime: members.length === 1 ? last.input_mime ?? undefined : undefined,
        mediaUrl: members.length === 1 ? last.audio_url ?? undefined : undefined,
      },
      deferredFunnelMessage: context.deferredFunnelMessage,
    },
  };
}
