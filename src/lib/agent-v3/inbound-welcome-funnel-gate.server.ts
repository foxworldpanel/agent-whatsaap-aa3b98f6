import { beginWebhookAgentInboundRuntime,persistWebhookAgentInboundJob,type WebhookInboundOwnershipInput } from "@/lib/agent-v3/inbound-webhook-ownership.server";
import { getWelcomeFunnelConversationBarrier,welcomeFunnelBlocksAgentRuntime,type WelcomeFunnelConversationBarrier } from "@/lib/welcome-funnel-conversation-barrier.server";
export type FunnelAwareInboundResult=|{status:"queued_turn";jobId:string;turnId:string;duplicate:boolean;barrier:"clear"}|{status:"pending_behind_funnel";jobId:string;duplicate:boolean;barrier:Exclude<WelcomeFunnelConversationBarrier,"clear">};
async function resolveInboundUserId(supabaseAdmin:any,input:WebhookInboundOwnershipInput):Promise<string>{
 if(input.userId)return input.userId;
 const{data,error}=await supabaseAdmin.from("conversations").select("user_id").eq("id",input.conversationId).eq("workspace_id",input.workspaceId).maybeSingle();
 if(error||!data?.user_id)throw new Error(`Inbound conversation routing identity unavailable: ${error?.message||input.conversationId}`);
 return data.user_id;
}
/** Every eligible message is durable before it can wait behind a Funnel barrier. */
export async function enqueueWebhookInboundAroundWelcomeFunnel(supabaseAdmin:any,input:WebhookInboundOwnershipInput):Promise<FunnelAwareInboundResult>{
 const userId=await resolveInboundUserId(supabaseAdmin,input);
 const barrier=await getWelcomeFunnelConversationBarrier(supabaseAdmin,input.conversationId,userId,input.workspaceId);
 if(barrier!=="clear"){if(!welcomeFunnelBlocksAgentRuntime(barrier))throw new Error(`Welcome Funnel barrier invariant violated: ${barrier}`);const ensured=await persistWebhookAgentInboundJob(supabaseAdmin,input);return{status:"pending_behind_funnel",jobId:ensured.job.id,duplicate:ensured.duplicate,barrier};}
 const queued=await beginWebhookAgentInboundRuntime(supabaseAdmin,input);return{...queued,barrier:"clear"};
}
