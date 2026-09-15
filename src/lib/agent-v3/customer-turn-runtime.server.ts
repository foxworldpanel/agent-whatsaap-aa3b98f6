import type { AgentV3RuntimeInput } from "@/lib/agent-v3/inbound-runtime-contract.server";
import { loadAgentInboundResumeContext, type AgentInboundResumeContext } from "@/lib/agent-v3/inbound-job-context.server";
import type { AgentInboundJob } from "@/lib/agent-v3/inbound-jobs.server";
import { loadCustomerTurnMembers, type AgentCustomerTurnMember } from "@/lib/agent-v3/customer-turn.server";
import { resolveCustomerTurnMemberText } from "@/lib/agent-v3/customer-turn-media.server";

export type AgentCustomerTurnRuntime = { input: AgentV3RuntimeInput; members: AgentCustomerTurnMember[] };

export async function buildCustomerTurnRuntimeInput(supabaseAdmin: any, turnId: string): Promise<AgentCustomerTurnRuntime> {
  const members = await loadCustomerTurnMembers(supabaseAdmin, turnId);
  if (!members.length) throw new Error(`Customer Turn ${turnId} has no members`);
  const last = members[members.length - 1];
  const { data: jobs, error } = await supabaseAdmin.from("agent_inbound_jobs").select("*").in("id", members.map((member) => member.job_id));
  if (error) throw error;
  const jobById = new Map<string, AgentInboundJob>((jobs || []).map((job: AgentInboundJob) => [job.id, job]));
  if (jobById.size !== members.length) throw new Error(`Customer Turn ${turnId} has missing inbound jobs`);
  const lastJob = jobById.get(last.job_id);
  if (!lastJob) throw new Error(`Customer Turn ${turnId} last inbound job is missing`);
  for (const member of members) {
    const job = jobById.get(member.job_id);
    if (!job) throw new Error(`Customer Turn ${turnId} member ${member.message_id} has no inbound job`);
    if (job.message_id !== member.message_id) throw new Error(`Customer Turn ${turnId} member/job message identity mismatch`);
    if (job.conversation_id !== lastJob.conversation_id) throw new Error(`Customer Turn ${turnId} contains multiple conversations`);
    if (job.workspace_id !== lastJob.workspace_id) throw new Error(`Customer Turn ${turnId} contains multiple workspaces`);
    if (job.status !== "pending") throw new Error(`Customer Turn ${turnId} member ${member.message_id} is not pending`);
    if (job.send_target !== member.send_target) throw new Error(`Customer Turn ${turnId} member send target drifted after attachment`);
  }

  const contextByJobId = new Map<string, AgentInboundResumeContext>();
  for (const member of members) {
    const job = jobById.get(member.job_id)!;
    const memberContext = await loadAgentInboundResumeContext(supabaseAdmin, job);
    if (memberContext.conversationId !== lastJob.conversation_id || memberContext.workspaceId !== lastJob.workspace_id) throw new Error(`Customer Turn ${turnId} durable member identity mismatch`);
    if (memberContext.message.externalId !== member.external_id) throw new Error(`Customer Turn ${turnId} member external identity drifted after attachment`);
    if (memberContext.userId !== member.user_id || memberContext.contactId !== member.contact_id || memberContext.whatsappNumberId !== member.whatsapp_number_id) throw new Error(`Customer Turn ${turnId} routing identity drifted after attachment`);
    if (memberContext.phone !== member.contact_phone) throw new Error(`Customer Turn ${turnId} contact phone drifted after attachment`);
    contextByJobId.set(member.job_id, memberContext);
  }
  const context = contextByJobId.get(last.job_id)!;
  const deferredFunnelMessage = members.filter((member) => member.deferred_funnel).map((member) => member.input_text.trim()).filter(Boolean).join("\n") || null;
  const { data: integration, error: integrationError } = await supabaseAdmin.from("integrations").select("openai_api_key, anthropic_api_key").eq("user_id", context.userId).eq("workspace_id", context.workspaceId).maybeSingle();
  if (integrationError) throw integrationError;
  const openaiApiKey = integration?.openai_api_key?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  const anthropicApiKey = integration?.anthropic_api_key?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || "";
  const resolved: string[] = [];
  for (const member of members) {
    const memberContext = contextByJobId.get(member.job_id)!;
    const text = await resolveCustomerTurnMemberText(supabaseAdmin, member, {conversationId:memberContext.conversationId,phone:memberContext.phone,uazapiUrl:memberContext.instance.uazapiUrl,uazapiToken:memberContext.instance.uazapiToken,openaiApiKey,anthropicApiKey});
    if (text.trim()) resolved.push(text.trim());
  }
  const combinedText = resolved.join("\n").trim();
  if (!combinedText) throw new Error(`Customer Turn ${turnId} resolved to empty content`);
  return {members,input:{source:"dispatcher",messageId:last.message_id,externalMessageId:last.external_id,conversationId:context.conversationId,contactId:last.contact_id,contactSource:last.contact_source,phone:last.contact_phone,userId:last.user_id,workspaceId:context.workspaceId,whatsappNumberId:last.whatsapp_number_id,sendTarget:last.send_target,instance:context.instance,content:{text:combinedText,kind:"texto"},deferredFunnelMessage}};
}
