import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const phone = "5511970116430";
  console.log(`Checking logs for ${phone} in the last hour...`);
  
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  
  const { data: logs, error } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .gt("created_at", oneHourAgo)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching agent_logs:", error);
  } else {
    logs.forEach(log => {
       console.log(`[LOG] ${log.created_at} | ${log.type} | ${log.summary}`);
       if (log.metadata) console.log("Metadata:", JSON.stringify(log.metadata));
    });
  }
}

checkLogs().catch(console.error);
