import { readFileSync } from 'fs';
import { join } from 'path';

const SCHEMA_PATH = join(process.cwd(), 'src/lib/agent-v2/analytics.schema.sql');

function auditSchema() {
  console.log(`=== INICIANDO AUDITORIA ESTRUTURAL DO SQL: ${SCHEMA_PATH} ===\n`);
  const sql = readFileSync(SCHEMA_PATH, 'utf8');

  const requirements = [
    // 0. Proibição de Placeholders
    { name: 'Sem Placeholders ("segue o padrão")', regex: /segue o padrão/i, invert: true },
    { name: 'Sem Placeholders ("omitido")', regex: /omitido/i, invert: true },
    { name: 'Sem Placeholders ("...")', regex: /\.\.\./, invert: true },
    { name: 'Sem Placeholders ("restante")', regex: /restante/i, invert: true },
    { name: 'Sem Placeholders ("conforme acima")', regex: /conforme acima/i, invert: true },

    // 1. Pricing
    { name: 'Pricing: 4 checks de preço >= 0', regex: /pricing_positive_input.*pricing_positive_output.*pricing_positive_cache_creation.*pricing_positive_cache_read/is },
    { name: 'Pricing: provider/model/source/currency não vazios', regex: /pricing_provider_not_empty|pricing_model_not_empty|pricing_source_not_empty|pricing_currency_not_empty/i },
    { name: 'Pricing: valid period [from < until]', regex: /pricing_valid_period CHECK \(effective_until IS NULL OR effective_until > effective_from\)/i },
    { name: 'Pricing: exclusion constraint [)', regex: /EXCLUDE USING gist\s*\(.*tstzrange\(effective_from, COALESCE\(effective_until, 'infinity'::timestamptz\), '\[\)'\) WITH &&\s*\)/is },
    { name: 'Pricing: RLS enabled', regex: /ALTER TABLE public\.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY/i },
    { name: 'Pricing: Revoke Public/Auth', regex: /REVOKE ALL ON public\.agent_v2_model_pricing FROM anon, authenticated, public/i },

    // 2. Turn Analytics
    { name: 'Turn: selected_tutorials', regex: /selected_tutorials text\[\] NOT NULL DEFAULT '{}'/i },
    { name: 'Turn: fallback_used', regex: /fallback_used boolean NOT NULL DEFAULT false/i },
    { name: 'Turn: unique(ws, conv, turn)', regex: /CONSTRAINT turn_analytics_unique_turn UNIQUE \(workspace_id, conversation_id, turn_id\)/i },
    { name: 'Turn: prompt_metric_id FK', regex: /prompt_metric_id uuid REFERENCES public\.agent_prompt_metrics\(id\) ON DELETE SET NULL/i },
    { name: 'Turn: tokens >= 0 check', regex: /turn_positive_tokens CHECK \(input_tokens >= 0 AND output_tokens >= 0/i },
    { name: 'Turn: duration >= 0 check', regex: /turn_positive_duration CHECK \(duration_ms >= 0\)/i },
    { name: 'Turn: scores 0-100 (overall, structural, commercial, safety)', regex: /turn_valid_scores_overall|turn_valid_scores_structural|turn_valid_scores_commercial|turn_valid_scores_safety/i },
    { name: 'Turn: tool success + failure <= total', regex: /turn_tool_coherence CHECK \(tool_success_count \+ tool_failure_count <= tool_call_count\)/i },
    { name: 'Turn: RLS Policy SELECT', regex: /CREATE POLICY agent_v2_turn_select/i },
    { name: 'Turn: Revoke Public/Anon', regex: /REVOKE ALL ON public\.agent_v2_turn_analytics FROM anon, authenticated, public/i },
    { name: 'Turn: Grant SELECT Auth', regex: /GRANT SELECT ON public\.agent_v2_turn_analytics TO authenticated/i },
    { name: 'Turn: 5+ Índices', regex: /CREATE INDEX.*idx_turn_v2_.*CREATE INDEX.*idx_turn_v2_.*CREATE INDEX.*idx_turn_v2_.*CREATE INDEX.*idx_turn_v2_.*CREATE INDEX.*idx_turn_v2_/is },

    // 3. Conversation Analytics
    { name: 'Conv: integral fields (wrong_platform, free_test, funnel)', regex: /wrong_platform_count.*wrong_service_count.*wrong_price_count.*free_test_offered.*panel_guidance_started.*reached_order_step/is },
    { name: 'Conv: integral fields (cache tokens, duration, quality)', regex: /total_cache_creation_tokens.*total_cache_read_tokens.*average_duration_ms.*structural_quality_score/is },
    { name: 'Conv: check counters >= 0', regex: /conv_positive_turns CHECK \(total_turns >= 0/i },
    { name: 'Conv: check llm + det <= total', regex: /conv_turn_coherence CHECK \(llm_calls \+ deterministic_turns <= total_turns\)/i },
    { name: 'Conv: check end >= start', regex: /conv_valid_period CHECK \(ended_at IS NULL OR ended_at >= started_at\)/i },
    { name: 'Conv: RLS Policy SELECT', regex: /CREATE POLICY agent_v2_conversation_select/i },
    { name: 'Conv: Revoke Public/Anon', regex: /REVOKE ALL ON public\.agent_v2_conversation_analytics FROM anon, authenticated, public/i },
    { name: 'Conv: Grant SELECT Auth', regex: /GRANT SELECT ON public\.agent_v2_conversation_analytics TO authenticated/i },

    // 4. Retention
    { name: 'Cleanup: integral logic', regex: /CREATE OR REPLACE FUNCTION public\.cleanup_agent_v2_analytics\(\).*SECURITY DEFINER.*SET search_path = public/is },
    { name: 'Cleanup: turn 30 days', regex: /DELETE FROM public\.agent_v2_turn_analytics\s+WHERE created_at < now\(\) - interval '30 days'/is },
    { name: 'Cleanup: conv 12 months (inativa)', regex: /DELETE FROM public\.agent_v2_conversation_analytics\s+WHERE ended_at IS NOT NULL\s+AND COALESCE\(ended_at, updated_at\) < now\(\) - interval '12 months'/is },
    { name: 'Cleanup: Revoke Public/Auth', regex: /REVOKE ALL ON FUNCTION public\.cleanup_agent_v2_analytics\(\) FROM public, anon, authenticated/i }
  ];

  const found = [];
  const missing = [];

  for (const req of requirements) {
    const passed = req.invert ? !req.regex.test(sql) : req.regex.test(sql);
    if (passed) found.push(req.name); else missing.push(req.name);
  }

  console.log("--- RESULTADOS DA AUDITORIA ---");
  found.forEach(f => console.log(`[OK] ${f}`));
  missing.forEach(m => console.log(`[AUSENTE] ${m}`));

  if (missing.length > 0) {
    console.log("\nCLASSIFICAÇÃO: BLOQUEADA");
    process.exit(1);
  } else {
    console.log("\nCLASSIFICAÇÃO: VERDE (ESTRUTURA INTEGRAL)");
  }
}

auditSchema();
