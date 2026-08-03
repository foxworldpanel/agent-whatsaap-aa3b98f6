import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const phone = "5511970116430";
  const { data: convs } = await supabaseAdmin.from("conversations_v3").select("*").eq("phone", phone);
  console.log("Conversations V3 for phone:", JSON.stringify(convs, null, 2));
  
  if (convs && convs.length > 0) {
    const convId = convs[0].id;
    const { data: messages } = await supabaseAdmin.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: true });
    console.log("Messages for Conversation ID:", JSON.stringify(messages, null, 2));
  }
}
run();
