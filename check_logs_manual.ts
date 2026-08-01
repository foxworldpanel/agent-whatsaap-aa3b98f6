import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const convId = "5cf77afc-a613-4c1b-867d-2277b5aeba8a";
  console.log(`Checking messages for conversation ${convId}...`);
  
  const { data: messages, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching messages:", error);
  } else {
    console.log("Messages in conversation:", JSON.stringify(messages, null, 2));
  }
}

checkLogs().catch(console.error);
