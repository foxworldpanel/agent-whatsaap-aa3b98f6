import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const { data: tables, error } = await supabaseAdmin.rpc("list_tables_v1"); // Trying common RPCs
  if (error) {
    // Fallback: try to select from information_schema
    const { data: tables2, error: error2 } = await supabaseAdmin.from("pg_catalog.pg_tables").select("tablename").eq("schemaname", "public");
    if (tables2) console.log("Tables:", tables2.map(t => t.tablename).join(", "));
  } else {
    console.log("Tables:", tables);
  }
}
run();
