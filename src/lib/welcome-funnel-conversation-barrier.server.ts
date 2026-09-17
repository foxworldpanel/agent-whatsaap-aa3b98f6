export type WelcomeFunnelConversationBarrier="running"|"needs_review"|"identity_mismatch"|"clear";
export async function getWelcomeFunnelConversationBarrier(supabaseAdmin:any,conversationId:string,workspaceId:string):Promise<WelcomeFunnelConversationBarrier>{
 const{data,error}=await supabaseAdmin.rpc("get_welcome_funnel_conversation_barrier",{p_conversation_id:conversationId,p_workspace_id:workspaceId});
 if(error)throw error;
 if(data!=="running"&&data!=="needs_review"&&data!=="identity_mismatch"&&data!=="clear")throw new Error(`Unknown Welcome Funnel conversation barrier: ${String(data)}`);
 return data;
}
export function welcomeFunnelBlocksAgentRuntime(state:WelcomeFunnelConversationBarrier):boolean{return state!=="clear";}
