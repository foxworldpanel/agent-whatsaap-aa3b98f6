import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LogLevel = "info" | "warn" | "error";

export type LogEventInput = {
  userId?: string | null;
  phone?: string | null;
  conversationId?: string | null;
  type: string;
  level?: LogLevel;
  summary: string;
  prompt?: string | null;
  response?: string | null;
  error?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
};

function truncate(v: string | null | undefined, max = 20000): string | null {
  if (!v) return null;
  return v.length > max ? v.slice(0, max) + "\n…[truncado]" : v;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  // Fire-and-forget: NUNCA bloqueia ou quebra o fluxo principal do webhook.
  // Mesmo que o Supabase trave / dê timeout / retorne erro, o agente
  // continua respondendo normalmente.
  try {
    const p = supabaseAdmin
      .from("agent_logs")
      .insert({
        user_id: input.userId ?? null,
        phone: input.phone ?? null,
        conversation_id: input.conversationId ?? null,
        type: input.type,
        level: input.level ?? "info",
        summary: input.summary.slice(0, 500),
        prompt: truncate(input.prompt),
        response: truncate(input.response),
        error: truncate(input.error, 5000),
        duration_ms: input.durationMs ?? null,
        metadata: (input.metadata ?? null) as never,
      })
      .then(({ error }) => {
        if (error) console.error("[agent-logger] insert failed", error);
      }, (e) => {
        console.error("[agent-logger] insert threw", e);
      });
    // Detach: não esperamos o insert resolver.
    void p;
  } catch (e) {
    console.error("[agent-logger] build failed", e);
  }
}