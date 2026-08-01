
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const phone = "5511970116430";
  console.log(`Checking messages for ${phone}...`);
  const { data: messages, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("sender_phone", phone)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching messages:", error);
  } else {
    console.log("Recent messages:", JSON.stringify(messages, null, 2));
  }

  // Also check a potential telemetry or logs table if it exists
  const { data: tables } = await supabaseAdmin.rpc("get_tables"); // If this helper exists
  // Instead, let's just try to read from a common table names
  const potentialTables = ["agent_logs", "agent_telemetry", "webhook_logs"];
  for (const table of potentialTables) {
    const { data, error } = await supabaseAdmin.from(table).select("*").order("created_at", { ascending: false }).limit(5);
    if (!error) {
      console.log(`Logs from ${table}:`, JSON.stringify(data, null, 2));
    }
  }
}

checkLogs().catch(console.error);
