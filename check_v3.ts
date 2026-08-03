import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const { data: tables } = await supabaseAdmin.from("pg_catalog.pg_tables").select("tablename").eq("schemaname", "public");
  console.log("Tables:", tables?.map(t => t.tablename).join(", "));
  
  const { data: convs } = await supabaseAdmin.from("conversations_v3").select("*").limit(5);
  console.log("Conversations V3:", JSON.stringify(convs, null, 2));
}
run();
