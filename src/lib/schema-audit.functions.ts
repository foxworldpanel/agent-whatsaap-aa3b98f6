import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

// Lista de todas as tabelas que o código do sistema referencia hoje.
// Atualizar essa lista sempre que uma tabela nova for usada em algum
// arquivo — é a base da verificação de schema (item de prevenção da
// auditoria completa feita em 09/08/2026).
const TABELAS_USADAS_PELO_CODIGO = [
  "agent_config", "agent_daily_promo", "agent_generation_locks",
  "agent_identity", "agent_logs", "agent_medias", "agent_modules_v2",
  "agent_modules_v2_history", "agent_modules_v3", "agent_modules_v3_history",
  "agent_parity_runs", "agent_playground_messages", "agent_playground_runs",
  "agent_playground_sessions", "agent_prompt_metrics", "auto_campaign_runs",
  "auto_campaigns", "blast_campaigns", "blast_contacts", "blast_flows",
  "blast_logs", "campaign_logs", "campaigns", "catalog_cache",
  "contact_categories", "contact_group_members", "contact_groups",
  "contact_lists", "contacts", "conversation_business_state_v3",
  "conversations", "conversations_v3", "customer_commercial_memory",
  "extraction_logs", "flow_action_decisions", "forbidden_rules",
  "free_test_services", "free_trials", "funnel_debug_trace",
  "integrations", "knowledge_base", "messages", "opening_templates",
  "panel_guide", "playlist_sales", "price_table", "test_numbers",
  "welcome_funnel_run_events", "welcome_funnel_runs", "welcome_funnels",
  "whatsapp_numbers", "workspaces",
];

export const getSchemaAudit = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;

    const [{ data: columns, error: colErr }, { data: missing, error: missErr }] =
      await Promise.all([
        supabase.rpc("get_schema_audit", { tabelas: TABELAS_USADAS_PELO_CODIGO }),
        supabase.rpc("get_missing_tables", { tabelas: TABELAS_USADAS_PELO_CODIGO }),
      ]);

    if (colErr) throw new Error(colErr.message);
    if (missErr) throw new Error(missErr.message);

    const byTable = new Map<string, Array<{ column_name: string; data_type: string; is_nullable: string }>>();
    for (const row of columns || []) {
      const list = byTable.get(row.table_name) || [];
      list.push({ column_name: row.column_name, data_type: row.data_type, is_nullable: row.is_nullable });
      byTable.set(row.table_name, list);
    }

    return {
      generated_at: new Date().toISOString(),
      total_tabelas_esperadas: TABELAS_USADAS_PELO_CODIGO.length,
      tabelas_ausentes: (missing || []).filter((m: any) => !m.existe).map((m: any) => m.table_name),
      tabelas: Array.from(byTable.entries()).map(([table_name, cols]) => ({
        table_name,
        columns: cols,
      })),
    };
  });
