import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const { data, error } = await supabaseAdmin.rpc('get_schema_info'); 
  // Se não existir RPC, tentamos query direta
  const { data: tables } = await supabaseAdmin.from("agent_playground_sessions").select("*").limit(1);
  console.log("SESSION_SAMPLE:", tables);
}
run();
