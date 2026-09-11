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
  | "stop_request";

export type AgentV3RuntimeResult = {
  reason: AgentV3RuntimeTerminalReason;
  /** Runtime completed its intended terminal path, even when no AI reply was sent. */
  terminal: true;
};

export function runtimeTerminal(
  reason: AgentV3RuntimeTerminalReason,
): AgentV3RuntimeResult {
  return { reason, terminal: true };
}
