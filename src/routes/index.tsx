import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`Tabela: agent_config
- user_id (uuid, NO)
- agent_name (text, NO)
- tone (text, NO)
- base_instruction (text, NO)
- script_frio (text, NO)
- script_inativo (text, NO)
- script_ativo (text, NO)
- panel_link (text, YES)
- main_offer (text, NO)
- audio_enabled (boolean, NO)
- updated_at (timestamp with time zone, NO)
- agent_enabled (boolean, NO)
- response_delay_min_sec (integer, NO)
- response_delay_max_sec (integer, NO)
- typing_indicator_enabled (boolean, NO)
- company_info (jsonb, NO)
- how_it_works (text, NO)
- never_offer_first (boolean, NO)
- send_panel_on_price (boolean, NO)
- faqs (jsonb, NO)
- services_realtime (boolean, NO)
- price_query_instruction (text, NO)
- modules (jsonb, NO)
- modules_enabled (jsonb, NO)
- catalog_in_prompt (boolean, NO)
- catalog_only_relevant (boolean, NO)
- panel_screenshot_mobile_url (text, YES)
- panel_screenshot_desktop_url (text, YES)
- panel_screenshots_mobile (jsonb, NO)
- panel_screenshots_desktop (jsonb, NO)
- workspace_id (uuid, NO)
- brand_blocks (jsonb, NO)
- playlist_pix_key (text, YES)
- playlist_pix_holder (text, YES)
- playlist_price (numeric, YES)
- playlist_ecletica_service_id (text, YES)
- playlist_eletronica_service_id (text, YES)
- playlist_ecletica_links (ARRAY, YES)
- playlist_eletronica_links (ARRAY, YES)
- agent_brain_version (USER-DEFINED, NO)
- pilot_phone_numbers (ARRAY, NO)

Tabela: agent_daily_promo
- user_id (uuid, NO)
- workspace_id (uuid, NO)
- promo_text (text, NO)
- active (boolean, NO)
- expires_at (timestamp with time zone, YES)
- updated_at (timestamp with time zone, NO)

Tabela: agent_generation_locks
- conversation_id (uuid, NO)
- acquired_at (timestamp with time zone, NO)
- holder (text, YES)

Tabela: agent_identity
- user_id (uuid, NO)
- persona (text, YES)
- regra_emoji (text, YES)
- regra_split (text, YES)
- workspace_id (uuid, NO)
- updated_at (timestamp with time zone, NO)

Tabela: agent_logs
- id (uuid, NO)
- created_at (timestamp with time zone, NO)
- type (text, NO)
- content (jsonb, NO)
- workspace_id (uuid, NO)

Tabela: agent_medias
- id (uuid, NO)
- workspace_id (uuid, NO)
- name (text, NO)
- url (text, NO)
- type (text, NO)
- created_at (timestamp with time zone, NO)
- trigger_keywords (ARRAY, NO)
- description (text, YES)

Tabela: agent_modules_v2
- id (uuid, NO)
- user_id (uuid, NO)
- module_type (text, NO)
- module_data (jsonb, NO)
- updated_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: agent_modules_v2_history
- id (uuid, NO)
- module_id (uuid, NO)
- module_type (text, NO)
- module_data (jsonb, NO)
- updated_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)

Tabela: agent_modules_v3
- id (uuid, NO)
- key (text, NO)
- value (text, YES)
- description (text, YES)
- created_at (timestamp with time zone, NO)
- updated_at (timestamp with time zone, NO)
- workspace_id (uuid, NO)
- is_system (boolean, NO)
- last_editor_id (uuid, YES)
- module_type (text, YES)
- usage_instructions (text, YES)
- tags (ARRAY, YES)
- metadata (jsonb, YES)
- version (integer, NO)

Tabela: agent_modules_v3_history
- id (uuid, NO)
- module_id (uuid, NO)
- key (text, NO)
- value (text, YES)
- description (text, YES)
- workspace_id (uuid, NO)
- last_editor_id (uuid, YES)
- changed_at (timestamp with time zone, NO)
- version (integer, NO)

Tabela: agent_playground_messages
- id (uuid, NO)
- run_id (uuid, NO)
- role (text, NO)
- content (text, NO)
- created_at (timestamp with time zone, NO)

Tabela: agent_playground_runs
- id (uuid, NO)
- user_id (uuid, NO)
- workspace_id (uuid, NO)
- created_at (timestamp with time zone, NO)
- metadata (jsonb, YES)`}
    </div>
  ),
});