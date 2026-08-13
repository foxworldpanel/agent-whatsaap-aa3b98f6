import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface TraceLogParams {
  traceId: string;
  step: string;
  status?: string;
  details?: Record<string, any>;
  durationMs?: number;
  messageId?: string;
  conversationId?: string;
  phone?: string;
}

export async function logExecutionTrace(params: TraceLogParams) {
  const { traceId, step, status, details, durationMs, messageId, conversationId, phone } = params;
  
  // Fire and forget trace
  supabaseAdmin
    .from("agent_execution_traces")
    .insert({
      trace_id: traceId,
      step,
      status,
      details: details || {},
      duration_ms: durationMs,
      message_id: messageId,
      conversation_id: conversationId,
      phone,
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[EXECUTION-TRACER] Failed to log trace:", error);
      }
    });
    
  // Also log to console for immediate visibility in dev
  console.log(`[TRACE][${traceId}][${step}]`, {
    status,
    durationMs,
    messageId,
    ...details
  });
}

export function generateTraceId(): string {
  return `trc_${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
}
