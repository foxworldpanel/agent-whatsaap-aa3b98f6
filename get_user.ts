import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const { data: users } = await supabaseAdmin.from("users").select("id").limit(1);
  console.log("USER_ID:", users?.[0]?.id);
}
run();
