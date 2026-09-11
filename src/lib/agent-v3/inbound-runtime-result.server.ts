export type AgentV3RuntimeTerminalReason =
  | "completed"
  | "ai_integrations_unavailable"
  | "audio_unavailable"
  | "audio_transcription_failed"
  | "image_unavailable"
  | "empty_content"
  | "critical_human_escalation"
  | "critical_escalation_failed"
  | "human_handoff"
  | "human_handoff_failed"
  | "stop_request"
  | "natural_conversational_silence"
  | "smart_router_completed"
  | "smart_router_send_failed"
  | "ai_processed"
  | "ai_error_needs_review";

export type AgentV3RuntimeTerminalClass =
  | "completed"
  | "completed_without_reply"
  | "human_handoff"
  | "operational_attention";

export type AgentV3RuntimeResult = {
  reason: AgentV3RuntimeTerminalReason;
  class: AgentV3RuntimeTerminalClass;
  /** Runtime completed its intended terminal path, even when no AI reply was sent. */
  terminal: true;
};

const TERMINAL_CLASS: Record<AgentV3RuntimeTerminalReason, AgentV3RuntimeTerminalClass> = {
  completed: "completed",
  ai_integrations_unavailable: "operational_attention",
  audio_unavailable: "operational_attention",
  audio_transcription_failed: "operational_attention",
  image_unavailable: "operational_attention",
  empty_content: "completed_without_reply",
  critical_human_escalation: "human_handoff",
  critical_escalation_failed: "operational_attention",
  human_handoff: "human_handoff",
  human_handoff_failed: "operational_attention",
  stop_request: "completed_without_reply",
  natural_conversational_silence: "completed_without_reply",
  smart_router_completed: "completed",
  smart_router_send_failed: "operational_attention",
  ai_processed: "completed",
  ai_error_needs_review: "operational_attention",
};

export function runtimeTerminal(
  reason: AgentV3RuntimeTerminalReason,
): AgentV3RuntimeResult {
  return { reason, class: TERMINAL_CLASS[reason], terminal: true };
}
