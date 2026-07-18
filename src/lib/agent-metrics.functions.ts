// Estatística agregada das últimas 24h (por padrão) das chamadas do
// agente ao Claude — usa a tabela agent_prompt_metrics alimentada em
// generateAgentReplyWithMeta. Consumida por um card do painel ou por
// um cron (endpoint /api/public/hooks/agent-metrics-daily).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AgentPromptStats {
  windowHours: number;
  totalCalls: number;
  prompt: { avgTokens: number; maxTokens: number; minTokens: number };
  tokens: { avgInput: number; avgOutput: number; totalInput: number; totalOutput: number };
  duration: { avgMs: number; p95Ms: number };
  modelMix: Record<string, { count: number; pct: number }>;
  averages: {
    modules: number;
    kbExamples: number;
    faqs: number;
    panelScreens: number;
  };
  topModules: Array<{ name: string; count: number }>;
  topRoutingReasons: Array<{ reason: string; count: number }>;
}

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export const getAgentPromptStats24h = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = (input ?? {}) as { windowHours?: number };
    const h = Math.max(1, Math.min(24 * 30, Math.round(v.windowHours ?? 24)));
    return { windowHours: h };
  })
  .handler(async ({ data, context }): Promise<AgentPromptStats> => {
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("agent_prompt_metrics")
      .select(
        "model, routing_reason, est_tokens, input_tokens, output_tokens, duration_ms, active_modules_count, active_module_names, kb_examples_count, faqs_selected_count, panel_screens_count",
      )
      .gte("created_at", since);
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const total = list.length;
    const est = list.map((r) => r.est_tokens ?? 0);
    const dur = list.map((r) => r.duration_ms ?? 0);

    const modelCount: Record<string, number> = {};
    const reasonCount: Record<string, number> = {};
    const moduleCount: Record<string, number> = {};
    for (const r of list) {
      modelCount[r.model] = (modelCount[r.model] ?? 0) + 1;
      if (r.routing_reason) reasonCount[r.routing_reason] = (reasonCount[r.routing_reason] ?? 0) + 1;
      for (const m of r.active_module_names ?? []) moduleCount[m] = (moduleCount[m] ?? 0) + 1;
    }

    const modelMix: Record<string, { count: number; pct: number }> = {};
    for (const [k, v] of Object.entries(modelCount)) modelMix[k] = { count: v, pct: pct(v, total) };

    const topModules = Object.entries(moduleCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    const topRoutingReasons = Object.entries(reasonCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    return {
      windowHours: data.windowHours,
      totalCalls: total,
      prompt: {
        avgTokens: avg(est),
        maxTokens: est.length ? Math.max(...est) : 0,
        minTokens: est.length ? Math.min(...est) : 0,
      },
      tokens: {
        avgInput: avg(list.map((r) => r.input_tokens ?? 0)),
        avgOutput: avg(list.map((r) => r.output_tokens ?? 0)),
        totalInput: list.reduce((n, r) => n + (r.input_tokens ?? 0), 0),
        totalOutput: list.reduce((n, r) => n + (r.output_tokens ?? 0), 0),
      },
      duration: { avgMs: avg(dur), p95Ms: percentile(dur, 95) },
      modelMix,
      averages: {
        modules: avg(list.map((r) => r.active_modules_count ?? 0)),
        kbExamples: avg(list.map((r) => r.kb_examples_count ?? 0)),
        faqs: avg(list.map((r) => r.faqs_selected_count ?? 0)),
        panelScreens: avg(list.map((r) => r.panel_screens_count ?? 0)),
      },
      topModules,
      topRoutingReasons,
    };
  });