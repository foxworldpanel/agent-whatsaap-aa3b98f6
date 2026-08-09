import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`Lote 2 de 5 — preciso do resultado completo, sem resumir nenhuma linha, mesmo que fique longo:

Tabela: agent_playground_sessions
- id (uuid, NO)
- user_id (uuid, NO)
- workspace_id (uuid, NO)
- created_at (timestamp with time zone, NO)
- last_active_at (timestamp with time zone, NO)
- metadata (jsonb, YES)

Tabela: agent_prompt_metrics
- id (uuid, NO)
- run_id (uuid, NO)
- model (text, NO)
- input_tokens (integer, NO)
- output_tokens (integer, NO)
- latency_ms (integer, NO)
- created_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: auto_campaign_runs
- id (uuid, NO)
- campaign_id (uuid, NO)
- contact_id (uuid, NO)
- status (text, NO)
- started_at (timestamp with time zone, NO)
- finished_at (timestamp with time zone, YES)
- error_message (text, YES)
- workspace_id (uuid, NO)

Tabela: auto_campaigns
- id (uuid, NO)
- name (text, NO)
- type (text, NO)
- config (jsonb, NO)
- active (boolean, NO)
- created_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: blast_campaigns
- id (uuid, NO)
- name (text, NO)
- flow_id (uuid, YES)
- status (text, NO)
- created_at (timestamp with time zone, NO)
- updated_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)
- scheduled_at (timestamp with time zone, YES)

Tabela: blast_contacts
- id (uuid, NO)
- campaign_id (uuid, NO)
- contact_id (uuid, NO)
- status (text, NO)
- sent_at (timestamp with time zone, YES)
- error (text, YES)

Tabela: blast_flows
- id (uuid, NO)
- name (text, NO)
- nodes (jsonb, NO)
- edges (jsonb, NO)
- created_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: blast_logs
- id (uuid, NO)
- campaign_id (uuid, NO)
- contact_id (uuid, NO)
- type (text, NO)
- content (text, NO)
- created_at (timestamp with time zone, NO)

Tabela: campaign_logs
- id (uuid, NO)
- campaign_id (uuid, NO)
- type (text, NO)
- message (text, NO)
- created_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: campaigns
- id (uuid, NO)
- name (text, NO)
- status (text, NO)
- config (jsonb, NO)
- created_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: catalog_cache
- id (uuid, NO)
- workspace_id (uuid, NO)
- services (jsonb, NO)
- updated_at (timestamp with time zone, NO)`}
    </div>
  ),
});