import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { DEFAULT_MODULES_V3 } from "./src/lib/agent-v3/default-modules-v3.server";

const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
const userId = "d6199a0d-275d-4952-9721-12543970b8a1"; // Example admin ID from context or known good ID

async function migrate() {
  console.log("Migrando módulos para o banco...");
  
  for (const [key, content] of Object.entries(DEFAULT_MODULES_V3)) {
    const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
    const { data, error } = await supabaseAdmin
      .from("agent_modules_v3")
      .upsert({
        workspace_id: workspaceId,
        user_id: userId,
        key,
        name,
        content,
        category: key === 'spotify' || key === 'instagram' || key === 'youtube' ? 'Redes Sociais' : 'Núcleo',
        enabled: true,
        version: 1
      }, { onConflict: "workspace_id,key" });
      
    if (error) {
      console.error(`Erro ao migrar ${key}:`, error);
    } else {
      console.log(`Migrado: ${key}`);
    }
  }
}

migrate();
