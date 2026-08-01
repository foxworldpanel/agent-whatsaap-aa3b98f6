import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkLogs() {
  const { data: sample, error } = await supabaseAdmin.from("messages").select("*").limit(1);
  if (sample) console.log("Schema of messages:", Object.keys(sample[0]).join(", "));
  
  // Now query by whatever column looks like phone
  const phone = "5511970116430";
  // Common names: phone, sender_id, customer_id, sender, remote_jid
  const columns = ["phone", "sender", "sender_id", "remote_jid", "chat_id"];
  for (const col of columns) {
     try {
       const { data } = await supabaseAdmin.from("messages").select("*").ilike(col, `%${phone}%`).limit(1);
       if (data && data.length > 0) {
         console.log(`Found messages using column ${col}`);
         const { data: recent } = await supabaseAdmin.from("messages").select("*").ilike(col, `%${phone}%`).order("created_at", { ascending: false }).limit(10);
         console.log(JSON.stringify(recent, null, 2));
         break;
       }
     } catch(e) {}
  }
}

checkLogs().catch(console.error);
