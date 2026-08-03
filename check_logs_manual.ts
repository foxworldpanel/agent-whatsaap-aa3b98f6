import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function check() {
  const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
  
  const { data: config } = await supabaseAdmin.from("agent_config").select("*").eq("workspace_id", workspaceId).single();
  console.log("Agent Config:", JSON.stringify(config, null, 2));
  
  const { data: funnels } = await supabaseAdmin.from("welcome_funnels").select("*").eq("workspace_id", workspaceId);
  console.log("Welcome Funnels:", JSON.stringify(funnels, null, 2));
}

check().catch(console.error);
