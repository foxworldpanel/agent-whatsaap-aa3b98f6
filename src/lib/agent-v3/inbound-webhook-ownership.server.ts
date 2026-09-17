import { ensureAgentInboundJob,type AgentInboundKind,type EnsureAgentInboundJobResult } from "@/lib/agent-v3/inbound-jobs.server";
import { enqueueAgentInboundIntoCustomerTurn } from "@/lib/agent-v3/customer-turn-ingress.server";

export type WebhookInboundOwnershipInput = {
  messageId: string;
  conversationId: string;
  /** Optional at legacy call sites; the pre-attachment gate resolves and validates it durably when absent. */
  userId?: string;
  workspaceId: string;
  sendTarget: string;
  inputText: string;
  inputKind: AgentInboundKind;
  inputMime?: string | null;
  deferredFunnel: boolean;
  holder: string;
};

export type WebhookInboundOwnershipResult = {status:"queued_turn";jobId:string;turnId:string;duplicate:boolean};
function durableInput(input:WebhookInboundOwnershipInput){return{messageId:input.messageId,conversationId:input.conversationId,workspaceId:input.workspaceId,sendTarget:input.sendTarget,inputText:input.inputText,inputKind:input.inputKind,inputMime:input.inputMime??undefined,deferredFunnel:input.deferredFunnel};}
export async function persistWebhookAgentInboundJob(supabaseAdmin:any,input:WebhookInboundOwnershipInput):Promise<EnsureAgentInboundJobResult>{return ensureAgentInboundJob(supabaseAdmin,durableInput(input));}
export async function beginWebhookAgentInboundRuntime(supabaseAdmin:any,input:WebhookInboundOwnershipInput):Promise<WebhookInboundOwnershipResult>{const queued=await enqueueAgentInboundIntoCustomerTurn(supabaseAdmin,durableInput(input));return{status:"queued_turn",...queued};}
