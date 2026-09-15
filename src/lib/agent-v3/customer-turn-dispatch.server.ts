import { randomUUID } from "node:crypto";
import { executeAgentV3Runtime } from "@/lib/agent-v3/runtime.server";
import {
  attachPendingAgentInboundJobsToCustomerTurns,
  claimNextReadyCustomerTurn,
  claimReadyCustomerTurnById,
  enterCustomerTurnRuntime,
  finishCustomerTurn,
  hasReadyCustomerTurn,
  quarantineExhaustedCustomerTurns,
  recoverStaleCustomerTurns,
  releaseCustomerTurnSafe,
  type AgentCustomerTurn,
} from "@/lib/agent-v3/customer-turn.server";
import { buildCustomerTurnRuntimeInput } from "@/lib/agent-v3/customer-turn-runtime.server";
import type { AgentV3RuntimeTerminalReason } from "@/lib/agent-v3/inbound-runtime-result.server";

export type AgentCustomerTurnDispatchResult =
  | { status: "idle" }
  | { status: "retry_safe"; turnId: string }
  | { status: "processed"; turnId: string; memberCount: number; reason: AgentV3RuntimeTerminalReason }
  | { status: "needs_review"; turnId: string };

async function quarantineClaimedCustomerTurn(s:any,turn:AgentCustomerTurn,holder:string,error:unknown):Promise<AgentCustomerTurnDispatchResult>{await finishCustomerTurn(s,turn.id,holder,{ok:false,error});return{status:"needs_review",turnId:turn.id};}
async function releaseClaimedCustomerTurnSafe(s:any,turn:AgentCustomerTurn,holder:string,error:unknown):Promise<AgentCustomerTurnDispatchResult>{const released=await releaseCustomerTurnSafe(s,turn.id,holder,error);return{status:released,turnId:turn.id};}

async function executeClaimedCustomerTurn(s:any,turn:AgentCustomerTurn,holder:string):Promise<AgentCustomerTurnDispatchResult>{
 let runtime;
 try{runtime=await buildCustomerTurnRuntimeInput(s,turn.id);}catch(error){return releaseClaimedCustomerTurnSafe(s,turn,holder,error);}
 const enteredRuntime=await enterCustomerTurnRuntime(s,turn.id,holder);
 if(!enteredRuntime)return releaseClaimedCustomerTurnSafe(s,turn,holder,new Error(`Customer Turn runtime transition rejected for ${turn.id}`));
 let result;
 try{result=await executeAgentV3Runtime(s,runtime.input);}catch(error){return quarantineClaimedCustomerTurn(s,turn,holder,error);}
 if(result.class==="operational_attention")return quarantineClaimedCustomerTurn(s,turn,holder,new Error(`Agent V3 operational attention: ${result.reason}`));
 await finishCustomerTurn(s,turn.id,holder,{ok:true});
 return{status:"processed",turnId:turn.id,memberCount:runtime.members.length,reason:result.reason};
}

export async function dispatchReadyCustomerTurnById(s:any,turnId:string,workerId:string):Promise<AgentCustomerTurnDispatchResult>{const holder=`customer-turn-fast:${workerId}:${randomUUID()}`;const turn=await claimReadyCustomerTurnById(s,turnId,holder);if(!turn)return{status:"idle"};return executeClaimedCustomerTurn(s,turn,holder);}
export async function dispatchOneCustomerTurn(s:any,workerId:string):Promise<AgentCustomerTurnDispatchResult>{const holder=`customer-turn:${workerId}:${randomUUID()}`;const turn=await claimNextReadyCustomerTurn(s,holder);if(!turn)return{status:"idle"};return executeClaimedCustomerTurn(s,turn,holder);}

export async function dispatchCustomerTurnBatch(s:any,workerId:string,maxPerRun=20):Promise<{attached:number;recovered:number;quarantinedExhausted:number;claimed:number;processed:number;needsReview:number;idle:boolean}>{
 const recovered=await recoverStaleCustomerTurns(s);
 const quarantinedExhausted=await quarantineExhaustedCustomerTurns(s);
 const attached=await attachPendingAgentInboundJobsToCustomerTurns(s,Math.max(20,maxPerRun*4));
 const bounded=Math.max(1,Math.min(maxPerRun,20));
 let claimed=0,processed=0,needsReview=0,consecutiveIdleClaims=0;
 const maxClaimAttempts=bounded+3;
 for(let attempt=0;attempt<maxClaimAttempts&&claimed<bounded;attempt+=1){
  const result=await dispatchOneCustomerTurn(s,workerId);
  if(result.status==="idle"){
   consecutiveIdleClaims+=1;
   if(consecutiveIdleClaims>=3)break;
   continue;
  }
  consecutiveIdleClaims=0;claimed+=1;
  if(result.status==="processed")processed+=1;
  if(result.status==="needs_review")needsReview+=1;
 }
 // Do not infer queue emptiness from claim collisions. A durable readiness
 // probe distinguishes true idle from ready work temporarily fenced elsewhere.
 const readyRemains=await hasReadyCustomerTurn(s);
 return{attached,recovered,quarantinedExhausted,claimed,processed,needsReview,idle:!readyRemains};
}
