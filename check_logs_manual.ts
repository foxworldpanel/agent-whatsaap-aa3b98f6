import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const { data: integrations, error } = await supabaseAdmin.from("integrations").select("*");
  console.log("Integrations:", JSON.stringify(integrations, null, 2));
  
  // Check if there are any webhook-related tables
  const { data: tables } = await supabaseAdmin.from("pg_catalog.pg_tables").select("tablename").eq("schemaname", "public");
  if (tables) console.log("All tables:", tables.map(t => t.tablename).join(", "));
}

checkLogs().catch(console.error);
