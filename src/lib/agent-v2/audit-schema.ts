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
    { name: 'Pricing: exclusion constraint [)', regex: /EXCLUDE USING gist\s*\(.*tstzrange\(effective_from, COALESCE\(effective_until, 'infinity'::timestamptz\), '\[\)'\) WITH &&\s*\)/is },
    { name: 'Pricing: RLS enabled', regex: /ALTER TABLE public\.agent_v2_model_pricing ENABLE ROW LEVEL SECURITY/i },
    { name: 'Pricing: Revoke Public/Auth/Public', regex: /REVOKE ALL ON public\.agent_v2_model_pricing FROM anon, authenticated, public/i },

    // 2. Turn Analytics
    { name: 'Turn: selected_tutorials', regex: /selected_tutorials text\[\] NOT NULL DEFAULT '{}'/i },
    { name: 'Turn: fallback_used', regex: /fallback_used boolean NOT NULL DEFAULT false/i },
    { name: 'Turn: unique(ws, conv, turn)', regex: /CONSTRAINT turn_analytics_unique_turn UNIQUE \(workspace_id, conversation_id, turn_id\)/i },
    { name: 'Turn: tokens >= 0 check', regex: /turn_positive_tokens CHECK/i },
    { name: 'Turn: tool coherence check', regex: /turn_tool_coherence CHECK \(tool_success_count \+ tool_failure_count <= tool_call_count\)/i },
    { name: 'Turn: RLS Policy SELECT', regex: /CREATE POLICY agent_v2_turn_select/i },
    { name: 'Turn: Grant SELECT Auth', regex: /GRANT SELECT ON public\.agent_v2_turn_analytics TO authenticated/i },

    // 3. Conversation Analytics
    { name: 'Conv: integral fields (wrong_platform, free_test, funnel)', regex: /wrong_platform_count.*wrong_service_count.*wrong_price_count.*free_test_offered.*panel_guidance_started.*reached_order_step/is },
    { name: 'Conv: quality scores (structural, commercial, safety)', regex: /structural_quality_score.*commercial_quality_score.*safety_quality_score/is },
    { name: 'Conv: check turns coherence', regex: /conv_turn_coherence CHECK \(llm_calls \+ deterministic_turns <= total_turns\)/i },
    { name: 'Conv: RLS enabled & Policy', regex: /ALTER TABLE public\.agent_v2_conversation_analytics ENABLE ROW LEVEL SECURITY.*CREATE POLICY agent_v2_conversation_select/is },

    // 4. Retention
    { name: 'Cleanup: SECURITY DEFINER', regex: /SECURITY DEFINER/i },
    { name: 'Cleanup: search_path', regex: /SET search_path = public/i },
    { name: 'Cleanup: Grant execute', regex: /GRANT EXECUTE ON FUNCTION public\.cleanup_agent_v2_analytics\(\) TO service_role/i },

    // 5. Upsert RPC
    { name: 'Upsert: GREATEST(regeneration_count)', regex: /regeneration_count = GREATEST\(agent_v2_turn_analytics\.regeneration_count, EXCLUDED\.regeneration_count\)/i },
    { name: 'Upsert: sent_to_customer OR', regex: /sent_to_customer = agent_v2_turn_analytics\.sent_to_customer OR EXCLUDED\.sent_to_customer/i },
    { name: 'Upsert: updated_at update', regex: /updated_at = now\(\)/i }
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
    console.log("\nCLASSIFICAÇÃO: VERDE (AUDITORIA ESTRUTURAL APROVADA)");
  }
}

auditSchema();
