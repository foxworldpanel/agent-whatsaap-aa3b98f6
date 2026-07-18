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
  // Em Cloudflare/Worker, fire-and-forget pode ser cortado quando a resposta
  // HTTP termina. Por isso aguardamos o insert; os chamadores já envolvem logs
  // em try/catch para nunca quebrar o fluxo principal.
  try {
    if (!input.userId) {
      // agent_logs.user_id é NOT NULL; sem dono, apenas logamos no console.
      console.warn("[agent-logger] skipped insert without user_id", { type: input.type, summary: input.summary });
      return;
    }
    const { error } = await supabaseAdmin
      .from("agent_logs")
      .insert({
        user_id: input.userId,
        workspace_id: "bd59fa41-d68d-4ac8-b995-e09ae48f52aa",
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
      });
    if (error) console.error("[agent-logger] insert failed", error);
  } catch (e) {
    console.error("[agent-logger] build failed", e);
  }
}