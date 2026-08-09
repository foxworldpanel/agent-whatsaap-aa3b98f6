import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`Lote 2 de 5 — preciso do resultado completo, sem resumir nenhuma linha, mesmo que fique longo:

Tabela: agent_playground_sessions
- id (uuid, NO)
- user_id (uuid, NO)
- name (text, NO)
- description (text, YES)
- created_at (timestamp with time zone, NO)
- updated_at (timestamp with time zone, NO)
- enabled_modules (ARRAY, YES)
- input_kind (text, YES)
- model (text, YES)
- temperature (double precision, YES)
- metadata (jsonb, YES)

Tabela: agent_prompt_metrics
- id (uuid, NO)
- user_id (uuid, YES)
- created_at (timestamp with time zone, NO)
- model (text, NO)
- routing_reason (text, YES)
- total_chars (integer, NO)
- est_tokens (integer, NO)
- input_tokens (integer, NO)
- output_tokens (integer, NO)
- cache_read_input_tokens (integer, NO)
- cache_creation_input_tokens (integer, NO)
- duration_ms (integer, NO)
- active_modules_count (integer, NO)
- active_module_names (ARRAY, NO)
- kb_examples_count (integer, NO)
- panel_screens_count (integer, NO)
- faqs_selected_count (integer, NO)
- forbidden_rules_count (integer, NO)
- free_test_services_count (integer, NO)
- history_count (integer, NO)
- contexto_detectado (text, YES)
- brain_version (USER-DEFINED, NO)
- execution_mode (USER-DEFINED, NO)
- sent_to_customer (boolean, NO)
- builder_version (text, YES)
- network (text, YES)
- service (text, YES)
- intent (text, YES)
- selected_modules (ARRAY, YES)
- selected_tools (ARRAY, YES)
- prompt_block_tokens (jsonb, YES)
- estimated_cost (numeric, YES)

Tabela: auto_campaign_runs
- id (uuid, NO)
- user_id (uuid, NO)
- auto_campaign_id (uuid, NO)
- contact_id (uuid, NO)
- campaign_key (text, NO)
- sent_at (timestamp with time zone, NO)
- status (text, NO)
- error (text, YES)

Tabela: auto_campaigns
- id (uuid, NO)
- user_id (uuid, NO)
- name (text, NO)
- type (text, NO)
- config (jsonb, NO)
- active (boolean, NO)
- last_run_at (timestamp with time zone, YES)
- created_at (timestamp with time zone, NO)

Tabela: blast_campaigns
- id (uuid, NO)
- user_id (uuid, NO)
- name (text, NO)
- flow_id (uuid, NO)
- status (text, NO)
- scheduled_at (timestamp with time zone, YES)
- sent_count (integer, NO)
- error_count (integer, NO)
- total_contacts (integer, NO)
- created_at (timestamp with time zone, NO)

Tabela: blast_contacts
- id (uuid, NO)
- user_id (uuid, NO)
- campaign_id (uuid, NO)
- contact_id (uuid, NO)
- status (text, NO)
- sent_at (timestamp with time zone, YES)
- error (text, YES)

Tabela: blast_flows
- id (uuid, NO)
- user_id (uuid, NO)
- name (text, NO)
- nodes (jsonb, NO)
- edges (jsonb, NO)
- created_at (timestamp with time zone, NO)

Tabela: blast_logs
- id (uuid, NO)
- user_id (uuid, NO)
- campaign_id (uuid, NO)
- contact_id (uuid, NO)
- type (text, NO)
- content (text, NO)
- created_at (timestamp with time zone, NO)

Tabela: campaign_logs
- id (uuid, NO)
- user_id (uuid, NO)
- campaign_id (uuid, NO)
- type (text, NO)
- message (text, NO)
- created_at (timestamp with time zone, NO)

Tabela: campaigns
- id (uuid, NO)
- user_id (uuid, NO)
- name (text, NO)
- type (text, NO)
- status (text, NO)
- config (jsonb, NO)
- created_at (timestamp with time zone, NO)

Tabela: catalog_cache
- id (uuid, NO)
- user_id (uuid, NO)
- services (jsonb, NO)
- updated_at (timestamp with time zone, NO)`}
    </div>
  ),
});