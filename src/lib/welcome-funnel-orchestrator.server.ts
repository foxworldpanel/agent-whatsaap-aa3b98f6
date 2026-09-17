import { randomUUID } from "node:crypto";
import { acquireAgentConversationLock,refreshAgentConversationLock,releaseAgentConversationLock } from "@/lib/agent-v3/conversation-lock.server";
import { startAgentConversationLockHeartbeat } from "@/lib/agent-v3/conversation-lock-heartbeat.server";
import { classifyWelcomeFunnelExecution,mayStartWelcomeFunnelExecution,blocksAutomaticAgentAfterFunnelClassification,type WelcomeFunnelExecutionClass } from "@/lib/welcome-funnel-execution-gate.server";
import { runWelcomeFunnelSequence,type WelcomeFunnelRuntime } from "@/lib/welcome-funnel-runner.server";

export type WelcomeFunnelOrchestrationResult=
 | {status:"completed";classification:"durable_completed"}
 | {status:"already_completed";classification:"durable_completed"}
 | {status:"historical_compatible";classification:"legacy_compatible"}
 | {status:"blocked";classification:"durable_running"|"durable_needs_review"|"legacy_ambiguous"}
 | {status:"busy";classification:"unclaimed"};

async function createLegacyHistoryClaim(params:{supabaseAdmin:any;funnelId:string;contactId:string;userId:string;workspaceId:string}):Promise<void>{
 const {error}=await params.supabaseAdmin.from("welcome_funnel_runs").insert({
  funnel_id:params.funnelId,contact_id:params.contactId,user_id:params.userId,
  workspace_id:params.workspaceId,fired_at:new Date().toISOString(),
 });
 if(error)throw new Error(`Welcome Funnel legacy history claim failed: ${error.message||String(error)}`);
}

export async function orchestrateWelcomeFunnel(params:{
 supabaseAdmin:any;funnel:WelcomeFunnelRuntime;contactId:string;conversationId:string;
 userId:string;workspaceId:string;phone:string;creds:{uazapi_url:string;uazapi_token:string};
}):Promise<WelcomeFunnelOrchestrationResult>{
 const initial=await classifyWelcomeFunnelExecution(params.supabaseAdmin,params.funnel.id,params.contactId);
 if(initial==="durable_completed") return {status:"already_completed",classification:initial};
 // Baseline rows are compatibility evidence only. They let normal Agent work
 // continue, but must never be reported as proof that Funnel delivery completed.
 if(initial==="legacy_compatible") return {status:"historical_compatible",classification:initial};
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
  // Confirm exact-holder ownership before any Funnel side effect. Acquisition can
  // be followed by an uncertain transport result; refresh is the durable proof.
  const leaseConfirmed=await refreshAgentConversationLock(params.supabaseAdmin,params.conversationId,holder);
  if(!leaseConfirmed) throw new Error(`Welcome Funnel conversation lock ownership was not confirmed for ${params.conversationId}`);

  // Reclassify after taking the conversation lock. Another owner may have
  // completed/quarantined the same funnel between the first read and acquisition.
  const fenced=await classifyWelcomeFunnelExecution(params.supabaseAdmin,params.funnel.id,params.contactId);
  if(fenced==="durable_completed") return {status:"already_completed",classification:fenced};
  if(fenced==="legacy_compatible") return {status:"historical_compatible",classification:fenced};
  if(blocksAutomaticAgentAfterFunnelClassification(fenced)) return {status:"blocked",classification:fenced};
  if(!mayStartWelcomeFunnelExecution(fenced)) throw new Error(`Unhandled fenced Welcome Funnel classification: ${fenced}`);

  // Keep the legacy table only as append-only history/UI compatibility. The row
  // is created after exact-holder ownership and before durable execution state.
  // A crash in this narrow gap becomes legacy_ambiguous on the next delivery and
  // therefore fails closed instead of being mistaken for successful delivery.
  await createLegacyHistoryClaim({
   supabaseAdmin:params.supabaseAdmin,funnelId:params.funnel.id,contactId:params.contactId,
   userId:params.userId,workspaceId:params.workspaceId,
  });

  await runWelcomeFunnelSequence({
   supabase:params.supabaseAdmin,funnel:params.funnel,contactId:params.contactId,
   conversationId:params.conversationId,userId:params.userId,workspaceId:params.workspaceId,
   phone:params.phone,creds:params.creds,initiatedBy:"trigger",
  });
  if(leaseError) throw leaseError;
  // Reconfirm ownership after the long external-side-effect window. If ownership
  // became uncertain, durable completed/needs_review state remains authoritative
  // and prevents an automatic replay by another webhook.
  const leaseStillOwned=await refreshAgentConversationLock(params.supabaseAdmin,params.conversationId,holder);
  if(!leaseStillOwned) throw new Error(`Welcome Funnel conversation lock ownership lost for ${params.conversationId}`);
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
