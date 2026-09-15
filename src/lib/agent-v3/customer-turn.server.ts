import type { AgentInboundKind } from "@/lib/agent-v3/inbound-jobs.server";

export const AGENT_CUSTOMER_TURN_QUIET_MS = 2200;
export const AGENT_CUSTOMER_TURN_STALE_MS = 5 * 60 * 1000;

export type AgentCustomerTurnState = "collecting" | "retry_safe" | "processing_safe" | "processing" | "processed" | "needs_review";
export type AgentCustomerTurn = { id:string; conversation_id:string; workspace_id:string; state:AgentCustomerTurnState; last_received_at:string; sealed_at:string|null; claimed_by:string|null; claimed_at:string|null; safe_attempt_count:number; last_error:string|null; created_at:string; updated_at:string };
export type AgentCustomerTurnMember = { turn_id:string; job_id:string; message_id:string; ordinal:number; external_id:string; input_text:string; input_kind:AgentInboundKind; input_mime:string|null; audio_url:string|null; resolved_text:string|null; created_at:string };

export async function attachAgentInboundJobToCustomerTurn(s:any,jobId:string):Promise<string>{const {data,error}=await s.rpc("attach_agent_inbound_job_to_customer_turn",{p_job_id:jobId});if(error)throw error;if(typeof data!=="string"||!data)throw new Error(`Customer Turn attachment failed for job ${jobId}`);return data;}
export async function attachPendingAgentInboundJobsToCustomerTurns(s:any,limit=50):Promise<number>{const {data,error}=await s.rpc("attach_pending_agent_inbound_jobs_to_customer_turns",{p_limit:limit});if(error)throw error;return Number(data||0);}

async function readCustomerTurnClaimByHolder(s:any,holder:string,turnId?:string):Promise<AgentCustomerTurn|null>{let query=s.from("agent_customer_turns").select("*").in("state",["processing_safe","processing"]).eq("claimed_by",holder);if(turnId)query=query.eq("id",turnId);const {data,error}=await query.limit(1).maybeSingle();if(error)throw error;return data as AgentCustomerTurn|null;}

export async function claimNextReadyCustomerTurn(s:any,holder:string,quietMs=AGENT_CUSTOMER_TURN_QUIET_MS):Promise<AgentCustomerTurn|null>{
 const {data,error}=await s.rpc("claim_next_agent_customer_turn",{p_holder:holder,p_quiet_before:new Date(Date.now()-quietMs).toISOString()});
 if(!error)return Array.isArray(data)&&data.length?data[0] as AgentCustomerTurn:null;
 try{const claimed=await readCustomerTurnClaimByHolder(s,holder);if(claimed)return claimed;}catch(verifyError){console.error("[AGENT-CUSTOMER-TURN] failed to verify next-turn claim after RPC uncertainty",verifyError);}
 throw error;
}
export async function claimReadyCustomerTurnById(s:any,turnId:string,holder:string,quietMs=AGENT_CUSTOMER_TURN_QUIET_MS):Promise<AgentCustomerTurn|null>{
 const {data,error}=await s.rpc("claim_agent_customer_turn",{p_turn_id:turnId,p_holder:holder,p_quiet_before:new Date(Date.now()-quietMs).toISOString()});
 if(!error)return Array.isArray(data)&&data.length?data[0] as AgentCustomerTurn:null;
 try{const claimed=await readCustomerTurnClaimByHolder(s,holder,turnId);if(claimed)return claimed;}catch(verifyError){console.error("[AGENT-CUSTOMER-TURN] failed to verify specific-turn claim after RPC uncertainty",verifyError);}
 throw error;
}
export async function hasReadyCustomerTurn(s:any,quietMs=AGENT_CUSTOMER_TURN_QUIET_MS):Promise<boolean>{const {data,error}=await s.rpc("has_ready_agent_customer_turn",{p_quiet_before:new Date(Date.now()-quietMs).toISOString()});if(error)throw error;return data===true;}
export async function loadCustomerTurnMembers(s:any,turnId:string):Promise<AgentCustomerTurnMember[]>{const {data,error}=await s.rpc("load_agent_customer_turn_members",{p_turn_id:turnId});if(error)throw error;return Array.isArray(data)?data as AgentCustomerTurnMember[]:[];}

export async function enterCustomerTurnRuntime(s:any,turnId:string,holder:string):Promise<boolean>{
 const {data,error}=await s.rpc("enter_agent_customer_turn_runtime",{p_turn_id:turnId,p_holder:holder});
 if(!error&&data===true)return true;
 try{const current=await readCustomerTurnClaimByHolder(s,holder,turnId);if(current?.state==="processing")return true;if(current?.state==="processing_safe")return false;}catch(verifyError){if(error)throw error;throw verifyError;}
 if(error)throw error;
 return false;
}

async function readCustomerTurnState(s:any,turnId:string):Promise<Pick<AgentCustomerTurn,"state"|"claimed_by">|null>{const {data,error}=await s.from("agent_customer_turns").select("state,claimed_by").eq("id",turnId).maybeSingle();if(error)throw error;return data?{state:data.state as AgentCustomerTurnState,claimed_by:data.claimed_by??null}:null;}

export async function releaseCustomerTurnSafe(s:any,turnId:string,holder:string,errorValue:unknown):Promise<"retry_safe"|"needs_review">{
 const errorText=errorValue instanceof Error?errorValue.message:String(errorValue);
 const {data,error}=await s.rpc("release_agent_customer_turn_safe",{p_turn_id:turnId,p_holder:holder,p_error:errorText});
 if(!error&&(data==="retry_safe"||data==="needs_review"))return data;
 try{const current=await readCustomerTurnState(s,turnId);if(current?.claimed_by===null&&(current.state==="retry_safe"||current.state==="needs_review"))return current.state;}catch(verifyError){console.error("[AGENT-CUSTOMER-TURN] failed to verify safe release after RPC uncertainty",verifyError);}
 if(error)throw error;
 throw new Error(`Customer Turn safe release rejected for ${turnId}`);
}

export async function finishCustomerTurn(s:any,turnId:string,holder:string,outcome:{ok:true}|{ok:false;error:unknown}):Promise<void>{
 const errorText=outcome.ok?null:(outcome.error instanceof Error?outcome.error.message:String(outcome.error));
 const terminalState:AgentCustomerTurnState=outcome.ok?"processed":"needs_review";
 const {data,error}=await s.rpc("finish_agent_customer_turn",{p_turn_id:turnId,p_holder:holder,p_ok:outcome.ok,p_error:errorText});
 if(!error&&data===true)return;
 try{const current=await readCustomerTurnState(s,turnId);if(current?.state===terminalState&&current.claimed_by===null)return;}catch(verifyError){console.error("[AGENT-CUSTOMER-TURN] failed to verify terminal state after RPC uncertainty",verifyError);}
 if(error)throw error;
 throw new Error(`Customer Turn terminal transition rejected for ${turnId}`);
}
export async function quarantineExhaustedCustomerTurns(s:any):Promise<number>{const {data,error}=await s.rpc("quarantine_exhausted_agent_customer_turns");if(error)throw error;return Number(data||0);}
export async function quarantineCustomerTurnsWithUnattachedReview(s:any,limit=100):Promise<number>{const {data,error}=await s.rpc("quarantine_customer_turns_with_unattached_review",{p_limit:limit});if(error)throw error;return Number(data||0);}
export async function recoverStaleCustomerTurns(s:any,staleMs=AGENT_CUSTOMER_TURN_STALE_MS):Promise<number>{const {data,error}=await s.rpc("recover_stale_agent_customer_turns",{p_stale_before:new Date(Date.now()-staleMs).toISOString()});if(error)throw error;return Number(data||0);}
export function renderCustomerTurnText(members:AgentCustomerTurnMember[]):string{return members.map(m=>{const text=(m.resolved_text||m.input_text).trim();if(m.input_kind==="audio")return text||"[áudio recebido]";if(m.input_kind==="image")return text||"[imagem recebida]";if(m.input_kind==="sticker")return text||"[figurinha recebida]";return text;}).filter(Boolean).join("\n");}
