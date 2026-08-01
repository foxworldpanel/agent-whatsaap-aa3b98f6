import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const phone = "5511970116430";
  console.log(`Checking conversations for ${phone}...`);
  
  const { data: convs, error } = await supabaseAdmin
    .from("conversations_v3")
    .select("*")
    .eq("phone", phone)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error fetching conversations_v3:", error);
  } else if (convs && convs.length > 0) {
    console.log("Conversation found:", JSON.stringify(convs[0], null, 2));
    
    // Check if there are messages for this conversation
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", convs[0].id)
      .order("created_at", { ascending: false })
      .limit(10);
    
    console.log("Recent messages in this conversation:", JSON.stringify(messages, null, 2));
  }
}

checkLogs().catch(console.error);
