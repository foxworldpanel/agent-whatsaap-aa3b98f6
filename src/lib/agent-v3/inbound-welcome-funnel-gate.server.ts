import { beginWebhookAgentInboundRuntime,persistWebhookAgentInboundJob,type WebhookInboundOwnershipInput } from "@/lib/agent-v3/inbound-webhook-ownership.server";
import { getWelcomeFunnelConversationBarrier,welcomeFunnelBlocksAgentRuntime,type WelcomeFunnelConversationBarrier } from "@/lib/welcome-funnel-conversation-barrier.server";

export type FunnelAwareInboundResult=
 | {status:"queued_turn";jobId:string;turnId:string;duplicate:boolean;barrier:"clear"}
 | {status:"pending_behind_funnel";jobId:string;duplicate:boolean;barrier:Exclude<WelcomeFunnelConversationBarrier,"clear">};

/**
 * Every eligible customer message becomes durable Stage B work even while a
 * Welcome Funnel owns/quarantines the conversation. Attachment is deliberately
 * deferred behind the durable Funnel barrier so no message is silently returned
 * by the webhook and no Customer Turn can execute concurrently with the Funnel.
 */
export async function enqueueWebhookInboundAroundWelcomeFunnel(
 supabaseAdmin:any,input:WebhookInboundOwnershipInput,
):Promise<FunnelAwareInboundResult>{
 const barrier=await getWelcomeFunnelConversationBarrier(supabaseAdmin,input.conversationId);
 if(welcomeFunnelBlocksAgentRuntime(barrier)){
  const ensured=await persistWebhookAgentInboundJob(supabaseAdmin,input);
  return {status:"pending_behind_funnel",jobId:ensured.job.id,duplicate:ensured.duplicate,barrier};
 }
 const queued=await beginWebhookAgentInboundRuntime(supabaseAdmin,input);
 return {...queued,barrier:"clear"};
}
