import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const phone = "5511970116430";
  console.log(`Logs for ${phone}:`);
  const { data: logs } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(10);
    
  if (logs) {
    logs.forEach(l => {
      console.log(`[AUDIT] ${l.created_at} | ${l.type} | ${l.summary}`);
      if (l.metadata && l.metadata.error) console.log("ERROR:", l.metadata.error);
    });
  }
}
run();
