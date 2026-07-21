
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { DEFAULT_MODULES_V3 } from "../src/lib/agent-v3/default-modules-v3.server";

async function runSeed() {
  const userId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
  const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
  
  console.log("Seeding modules for workspace:", workspaceId);
  
  const modulesToInsert = Object.entries(DEFAULT_MODULES_V3).map(([key, content]) => ({
    user_id: userId,
    workspace_id: workspaceId,
    key,
    name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    content,
    category: "Núcleo",
    enabled: true,
    version: 1,
    priority: 0
  }));

  const { data, error } = await supabaseAdmin
    .from("agent_modules_v3")
    .upsert(modulesToInsert, { onConflict: "workspace_id,key" });

  if (error) {
    console.error("Seed failed:", error);
  } else {
    console.log("Seed successful");
  }
}

runSeed();
