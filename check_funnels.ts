import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const phone = "5511970116430";
  const { data: runs } = await supabaseAdmin.from("welcome_funnel_runs").select("*").eq("phone", phone);
  console.log("Funnel Runs for phone:", JSON.stringify(runs, null, 2));
}
run();
