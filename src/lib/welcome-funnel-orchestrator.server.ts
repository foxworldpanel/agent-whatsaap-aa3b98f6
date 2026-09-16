import { randomUUID } from "node:crypto";
import { acquireAgentConversationLock,releaseAgentConversationLock } from "@/lib/agent-v3/conversation-lock.server";
import { startAgentConversationLockHeartbeat } from "@/lib/agent-v3/conversation-lock-heartbeat.server";
import { classifyWelcomeFunnelExecution,mayStartWelcomeFunnelExecution,blocksAutomaticAgentAfterFunnelClassification,type WelcomeFunnelExecutionClass } from "@/lib/welcome-funnel-execution-gate.server";
import { runWelcomeFunnelSequence,type WelcomeFunnelRuntime } from "@/lib/welcome-funnel-runner.server";

export type WelcomeFunnelOrchestrationResult=
 | {status:"completed";classification:"durable_completed"}
 | {status:"already_completed";classification:"durable_completed"|"legacy_compatible"}
 | {status:"blocked";classification:"durable_running"|"durable_needs_review"|"legacy_ambiguous"}
 | {status:"busy";classification:"unclaimed"};

export async function orchestrateWelcomeFunnel(params:{
 supabaseAdmin:any;funnel:WelcomeFunnelRuntime;contactId:string;conversationId:string;
 userId:string;workspaceId:string;phone:string;creds:{uazapi_url:string;uazapi_token:string};
}):Promise<WelcomeFunnelOrchestrationResult>{
 const initial=await classifyWelcomeFunnelExecution(params.supabaseAdmin,params.funnel.id,params.contactId);
 if(initial==="durable_completed"||initial==="legacy_compatible") return {status:"already_completed",classification:initial};
 if(blocksAutomaticAgentAfterFunnelClassification(initial)) return {status:"blocked",classification:initial};
 if(!mayStartWelcomeFunnelExecution(initial)) throw new Error(`Unhandled Welcome Funnel classification: ${initial}`);

 const holder=`welcome-funnel:${params.funnel.id}:${randomUUID()}`;
 const acquired=await acquireAgentConversationLock(params.supabaseAdmin,params.conversationId,holder);
 if(!acquired) return {status:"busy",classification:"unclaimed"};

 let leaseError:Error|null=null;
 const stopHeartbeat=startAgentConversationLockHeartbeat({
  supabaseAdmin:params.supabaseAdmin,conversationId:params.conversationId,holder,
  onOwnershipLost:error=>{leaseError=error;},
 });
 try{
  // Reclassify after taking the conversation lock. Another owner may have
  // completed/quarantined the same funnel between the first read and acquisition.
  const fenced=await classifyWelcomeFunnelExecution(params.supabaseAdmin,params.funnel.id,params.contactId);
  if(fenced==="durable_completed"||fenced==="legacy_compatible") return {status:"already_completed",classification:fenced};
  if(blocksAutomaticAgentAfterFunnelClassification(fenced)) return {status:"blocked",classification:fenced};
  if(!mayStartWelcomeFunnelExecution(fenced)) throw new Error(`Unhandled fenced Welcome Funnel classification: ${fenced}`);

  await runWelcomeFunnelSequence({
   supabase:params.supabaseAdmin,funnel:params.funnel,contactId:params.contactId,
   conversationId:params.conversationId,userId:params.userId,workspaceId:params.workspaceId,
   phone:params.phone,creds:params.creds,initiatedBy:"trigger",
  });
  if(leaseError) throw leaseError;
  const terminal=await classifyWelcomeFunnelExecution(params.supabaseAdmin,params.funnel.id,params.contactId);
  if(terminal!=="durable_completed") throw new Error(`Welcome Funnel returned without durable completion: ${terminal}`);
  return {status:"completed",classification:"durable_completed"};
 }finally{
  stopHeartbeat();
  const released=await releaseAgentConversationLock(params.supabaseAdmin,params.conversationId,holder);
  if(!released) console.error("[WELCOME-FUNNEL] exact-holder generation lock release was not confirmed",{conversationId:params.conversationId,holder});
 }
}

export function shouldBlockAgentForWelcomeFunnel(result:WelcomeFunnelOrchestrationResult):boolean{
 return result.status==="blocked"||result.status==="busy"||result.status==="completed";
}

export function describeWelcomeFunnelClassification(value:WelcomeFunnelExecutionClass):string{return value;}
