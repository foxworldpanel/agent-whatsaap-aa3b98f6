import type { AgentInboundKind } from "@/lib/agent-v3/inbound-jobs.server";

export const AGENT_CUSTOMER_TURN_QUIET_MS = 2200;

export type AgentCustomerTurnState = "collecting" | "processing" | "processed" | "needs_review";

export type AgentCustomerTurn = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  state: AgentCustomerTurnState;
  last_received_at: string;
  sealed_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentCustomerTurnMember = {
  turn_id: string;
  job_id: string;
  message_id: string;
  ordinal: number;
  external_id: string;
  input_text: string;
  input_kind: AgentInboundKind;
  input_mime: string | null;
  audio_url: string | null;
  created_at: string;
};

export async function attachAgentInboundJobToCustomerTurn(
  supabaseAdmin: any,
  jobId: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("attach_agent_inbound_job_to_customer_turn", {
    p_job_id: jobId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error(`Customer Turn attachment failed for job ${jobId}`);
  return data;
}

export async function claimNextReadyCustomerTurn(
  supabaseAdmin: any,
  holder: string,
  quietMs = AGENT_CUSTOMER_TURN_QUIET_MS,
): Promise<AgentCustomerTurn | null> {
  const quietBefore = new Date(Date.now() - quietMs).toISOString();
  const { data, error } = await supabaseAdmin.rpc("claim_next_agent_customer_turn", {
    p_holder: holder,
    p_quiet_before: quietBefore,
  });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] as AgentCustomerTurn : null;
}

export async function loadCustomerTurnMembers(
  supabaseAdmin: any,
  turnId: string,
): Promise<AgentCustomerTurnMember[]> {
  const { data, error } = await supabaseAdmin.rpc("load_agent_customer_turn_members", { p_turn_id: turnId });
  if (error) throw error;
  return Array.isArray(data) ? data as AgentCustomerTurnMember[] : [];
}

export async function finishCustomerTurn(
  supabaseAdmin: any,
  turnId: string,
  holder: string,
  outcome: { ok: true } | { ok: false; error: unknown },
): Promise<void> {
  const errorText = outcome.ok ? null : (outcome.error instanceof Error ? outcome.error.message : String(outcome.error));
  const { data, error } = await supabaseAdmin.rpc("finish_agent_customer_turn", {
    p_turn_id: turnId,
    p_holder: holder,
    p_ok: outcome.ok,
    p_error: errorText,
  });
  if (error) throw error;
  if (data !== true) throw new Error(`Customer Turn terminal transition rejected for ${turnId}`);
}

export function renderCustomerTurnText(members: AgentCustomerTurnMember[]): string {
  return members
    .map((member) => {
      const text = member.input_text.trim();
      if (member.input_kind === "audio") return text || "[áudio recebido]";
      if (member.input_kind === "image") return text || "[imagem recebida]";
      if (member.input_kind === "sticker") return text || "[figurinha recebida]";
      return text;
    })
    .filter(Boolean)
    .join("\n");
}
