import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
  
  const { data: config } = await supabaseAdmin.from("agent_config").select("*").eq("workspace_id", workspaceId).single();
  
  if (config && config.modules) {
    const modules = { ...config.modules };
    if (modules.__humanization_settings) {
      modules.__humanization_settings = {
        ...modules.__humanization_settings,
        min_part_delay_ms: 1000,
        max_part_delay_ms: 3000,
        min_response_delay_ms: 2000,
        max_response_delay_ms: 5000
      };
      
      const { error } = await supabaseAdmin
        .from("agent_config")
        .update({ modules })
        .eq("workspace_id", workspaceId);
        
      if (!error) {
        console.log("Humanization delays updated successfully in modules JSONB.");
      } else {
        console.error("Error updating modules JSONB:", error);
      }
    }
  }
}
run();
