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
  
  // Fire and forget trace. Telemetria nunca pode bloquear o turno quando
  // o backend de observabilidade estiver indisponível ou não configurado.
  try {
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
    })
    .catch((error) => {
      // Promise rejections happen after the synchronous try/catch boundary.
      // Telemetry is observational only and must never reject into Agent V3.
      console.warn("[EXECUTION-TRACER] Trace backend unavailable:", error);
    });
  } catch (error) {
    console.warn("[EXECUTION-TRACER] Trace backend unavailable:", error);
  }
    
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
