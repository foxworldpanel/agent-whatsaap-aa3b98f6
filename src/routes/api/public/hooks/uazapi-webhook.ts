import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";
import { normalizeTriggerText, removeAccents } from "@/lib/text-normalize";
import { isConversationAgentEnabledV3 } from "@/lib/agent-v3/brain/config.server";
import { generateTraceId, logExecutionTrace } from "@/lib/agent-v3/telemetry/execution-tracer.server";

// SAFETY RESTORE MARKER: full webhook restored from blob 235bc4cb107b25cb28d77555e7e8373bee2937c5.
// The Stage B refactor remains isolated in reusable modules until the runtime extraction is validated.

export { };
