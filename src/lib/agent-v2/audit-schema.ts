import { readFileSync } from 'fs';
import { join } from 'path';

const SCHEMA_PATH = join(process.cwd(), 'src/lib/agent-v2/analytics.schema.sql');

function auditSchema() {
  console.log(`=== INICIANDO AUDITORIA AUTOMÁTICA: ${SCHEMA_PATH} ===\n`);
  const sql = readFileSync(SCHEMA_PATH, 'utf8');

  const requirements = [
    // Gerais
    { name: 'CREATE EXTENSION IF NOT EXISTS btree_gist', regex: /CREATE EXTENSION IF NOT EXISTS btree_gist/i },
    { name: 'Proibição de Placeholders', regex: /segue o padrão|omitido|\.\.\.|restante|conforme acima/i, invert: true },

    // Pricing
    { name: 'Pricing: check input >= 0', regex: /pricing_positive_input CHECK \(input_price_per_million >= 0\)/i },
    { name: 'Pricing: check output >= 0', regex: /pricing_positive_output CHECK \(output_price_per_million >= 0\)/i },
    { name: 'Pricing: check cache creation >= 0', regex: /pricing_positive_cache_creation CHECK \(cache_creation_price_per_million >= 0\)/i },
    { name: 'Pricing: check cache read >= 0', regex: /pricing_positive_cache_read CHECK \(cache_read_price_per_million >= 0\)/i },
    { name: 'Pricing: check valid period', regex: /pricing_valid_period CHECK \(effective_until IS NULL OR effective_until > effective_from\)/i },
    { name: 'Pricing: check empty fields', regex: /pricing_provider_not_empty|pricing_model_not_empty|pricing_source_not_empty|pricing_currency_not_empty/i },
    { name: 'Pricing: exclusion constraint [)', regex: /EXCLUDE USING gist \(.*tstzrange\(effective_from, COALESCE\(effective_until, 'infinity'::timestamptz\), '\[\)'\) WITH &&\)/is },
    { name: 'Pricing: RLS enabled', regex: /ALTER TABLE public\.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY/i },
    { name: 'Pricing: revoke public access', regex: /REVOKE ALL ON public\.agent_v2_model_pricing FROM anon, authenticated, public/i },

    // Turn Analytics
    { name: 'Turn: selected_tutorials', regex: /selected_tutorials text\[\] NOT NULL DEFAULT '{}'/i },
    { name: 'Turn: fallback_used', regex: /fallback_used boolean NOT NULL DEFAULT false/i },
    { name: 'Turn: unique constraint', regex: /CONSTRAINT turn_analytics_unique_turn UNIQUE \(workspace_id, conversation_id, turn_id\)/i },
    { name: 'Turn: prompt_metric_id FK', regex: /prompt_metric_id uuid REFERENCES public\.agent_prompt_metrics\(id\) ON DELETE SET NULL/i },
    { name: 'Turn: check tokens >= 0', regex: /turn_positive_tokens CHECK/i },
    { name: 'Turn: check scores 0-100', regex: /turn_valid_scores_overall|turn_valid_scores_structural|turn_valid_scores_commercial|turn_valid_scores_safety/i },
    { name: 'Turn: check tool coherence', regex: /turn_tool_coherence CHECK \(tool_success_count \+ tool_failure_count <= tool_call_count\)/i },
    { name: 'Turn: execution_mode validation', regex: /turn_valid_execution_mode CHECK \(execution_mode IN \('isolated_test', 'shadow', 'pilot', 'production'\)\)/i },
    { name: 'Turn: RLS and Policy', regex: /CREATE POLICY agent_v2_turn_select/i },
    { name: 'Turn: Grant SELECT', regex: /GRANT SELECT ON public\.agent_v2_turn_analytics TO authenticated/i },

    // Conversation Analytics
    { name: 'Conv: wrong_platform_count', regex: /wrong_platform_count integer NOT NULL DEFAULT 0/i },
    { name: 'Conv: free_test fields', regex: /free_test_offered|free_test_started|free_test_completed/i },
    { name: 'Conv: funnel fields', regex: /panel_guidance_started|reached_registration|reached_recharge|reached_order_step|panel_journey_completed/i },
    { name: 'Conv: quality scores', regex: /structural_quality_score|commercial_quality_score|safety_quality_score|overall_quality_score/i },
    { name: 'Conv: cache tokens', regex: /total_cache_creation_tokens|total_cache_read_tokens/i },
    { name: 'Conv: average duration', regex: /average_duration_ms numeric NOT NULL DEFAULT 0/i },
    { name: 'Conv: check turns coherence', regex: /conv_turn_coherence CHECK \(llm_calls \+ deterministic_turns <= total_turns\)/i },
    { name: 'Conv: primary key', regex: /PRIMARY KEY \(workspace_id, conversation_id\)/i },
    { name: 'Conv: Grant SELECT', regex: /GRANT SELECT ON public\.agent_v2_conversation_analytics TO authenticated/i },

    // Retention
    { name: 'Cleanup: SECURITY DEFINER', regex: /SECURITY DEFINER/i },
    { name: 'Cleanup: search_path', regex: /SET search_path = public/i },
    { name: 'Cleanup: Turn retention 30 days', regex: /DELETE FROM public\.agent_v2_turn_analytics WHERE created_at < now\(\) - interval '30 days'/i },
    { name: 'Cleanup: Conv retention 12 months', regex: /DELETE FROM public\.agent_v2_conversation_analytics WHERE ended_at IS NOT NULL AND COALESCE\(ended_at, updated_at\) < now\(\) - interval '12 months'/i },
    { name: 'Cleanup: Grant execute', regex: /GRANT EXECUTE ON FUNCTION public\.cleanup_agent_v2_analytics\(\) TO service_role/i }
  ];

  const found = [];
  const missing = [];

  for (const req of requirements) {
    const match = req.regex.test(sql);
    const passed = req.invert ? !match : match;
    if (passed) {
      found.push(req.name);
    } else {
      missing.push(req.name);
    }
  }

  console.log("--- REQUISITOS ENCONTRADOS ---");
  found.forEach(f => console.log(`[OK] ${f}`));

  if (missing.length > 0) {
    console.log("\n--- REQUISITOS AUSENTES ---");
    missing.forEach(m => console.log(`[ERRO] ${m}`));
    process.exit(1);
  } else {
    console.log("\n=== AUDITORIA CONCLUÍDA COM SUCESSO: 100% VERDE ===\n");
  }
}

auditSchema();
