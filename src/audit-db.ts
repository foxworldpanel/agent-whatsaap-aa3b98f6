import { supabaseAdmin } from "./integrations/supabase/client.server";

async function main() {
  console.log("--- WORKSPACES ---");
  const { data: ws } = await supabaseAdmin.from("workspaces").select("id, name");
  console.log(ws);

  console.log("\n--- AGENT MODULES (ALL) ---");
  const { data: mods } = await supabaseAdmin.from("agent_modules_v3").select("key, workspace_id");
  console.log(mods);
  
  console.log("\n--- WHATSAPP NUMBERS (ALL) ---");
  const { data: nums } = await supabaseAdmin.from("whatsapp_numbers").select("id, nome, workspace_id, uazapi_token");
  console.log(nums);
}

main();
