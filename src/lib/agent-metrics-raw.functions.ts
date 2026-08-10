// src/lib/agent-metrics-raw.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AgentPromptMetricRow {
  created_at: string;
  model: string;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  input_tokens: number;
  total_chars: number;
  est_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export const getLatestPromptMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { limit?: number };
    return { limit: Math.max(1, Math.min(100, v.limit ?? 10)) };
  })
  .handler(async ({ data, context }): Promise<AgentPromptMetricRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("agent_prompt_metrics")
      .select("created_at, model, cache_creation_input_tokens, cache_read_input_tokens, input_tokens, total_chars, est_tokens, output_tokens, duration_ms")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    
    if (error) throw new Error(error.message);
    return (rows ?? []) as AgentPromptMetricRow[];
  });
