import { beginWebhookAgentInboundRuntime,persistWebhookAgentInboundJob,type WebhookInboundOwnershipInput } from "@/lib/agent-v3/inbound-webhook-ownership.server";
import { getWelcomeFunnelConversationBarrier,welcomeFunnelBlocksAgentRuntime,type WelcomeFunnelConversationBarrier } from "@/lib/welcome-funnel-conversation-barrier.server";
export type FunnelAwareInboundResult=|{status:"queued_turn";jobId:string;turnId:string;duplicate:boolean;barrier:"clear"}|{status:"pending_behind_funnel";jobId:string;duplicate:boolean;barrier:Exclude<WelcomeFunnelConversationBarrier,"clear">};
/** Every eligible message is durable before it can wait behind a Funnel barrier. */
export async function enqueueWebhookInboundAroundWelcomeFunnel(supabaseAdmin:any,input:WebhookInboundOwnershipInput):Promise<FunnelAwareInboundResult>{
 const barrier=await getWelcomeFunnelConversationBarrier(supabaseAdmin,input.conversationId,input.workspaceId);
 if(barrier!=="clear"){if(!welcomeFunnelBlocksAgentRuntime(barrier))throw new Error(`Welcome Funnel barrier invariant violated: ${barrier}`);const ensured=await persistWebhookAgentInboundJob(supabaseAdmin,input);return{status:"pending_behind_funnel",jobId:ensured.job.id,duplicate:ensured.duplicate,barrier};}
 const queued=await beginWebhookAgentInboundRuntime(supabaseAdmin,input);return{...queued,barrier:"clear"};
}
