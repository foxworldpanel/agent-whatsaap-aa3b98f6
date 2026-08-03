import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  console.log("Fixing schema...");
  
  // welcome_funnel_runs status
  await supabaseAdmin.rpc("exec_sql", { sql: "ALTER TABLE welcome_funnel_runs ADD COLUMN IF NOT EXISTS status text DEFAULT 'running';" });
  
  // customer_commercial_memory conversation_facts
  await supabaseAdmin.rpc("exec_sql", { sql: "ALTER TABLE customer_commercial_memory ADD COLUMN IF NOT EXISTS conversation_facts jsonb DEFAULT '{}'::jsonb;" });
  
  // conversation_business_state_v3 confidence_score, objective
  await supabaseAdmin.rpc("exec_sql", { sql: "ALTER TABLE conversation_business_state_v3 ADD COLUMN IF NOT EXISTS confidence_score float DEFAULT 0.0;" });
  await supabaseAdmin.rpc("exec_sql", { sql: "ALTER TABLE conversation_business_state_v3 ADD COLUMN IF NOT EXISTS objective text;" });
  
  // Also check if agent_humanization_settings needs columns
  // The error showed delays of 50s.
  // I'll check if response_delay_min_sec exists in agent_config or agent_humanization_settings
  
  console.log("Schema fix attempted.");
}
run();
