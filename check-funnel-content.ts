import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function checkFunnelContent() {
  const { data: funnels } = await supabase
    .from("welcome_funnels")
    .select("id, name, trigger_keywords, enabled, workspace_id, whatsapp_number_id, steps")
    .eq("enabled", true);

  console.log("--- ANÁLISE DE FUNIS ---");
  funnels?.forEach(f => {
    console.log(`\nFunil: ${f.name}`);
    console.log(`Gatilhos: "${f.trigger_keywords}"`);
    console.log(`Workspace: ${f.workspace_id}`);
    console.log(`Number ID: ${f.whatsapp_number_id}`);
    
    const steps = f.steps as any;
    const hasSteps = steps && Object.values(steps).some((s: any) => s.enabled);
    console.log(`Possui steps ativos: ${hasSteps ? "SIM" : "NÃO"}`);
    
    if (hasSteps) {
      Object.keys(steps).forEach(k => {
        if (steps[k].enabled) {
          console.log(`  - ${k}: ${steps[k].text || steps[k].url || "(sem conteúdo)"}`);
        }
      });
    }
  });
  
  const { data: numbers } = await supabase
    .from("whatsapp_numbers")
    .select("id, display_name, workspace_id, uazapi_instance_id")
    .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa");
    
  console.log("\n--- INSTÂNCIAS MIND ---");
  numbers?.forEach(n => {
    console.log(`ID: ${n.id} | Name: ${n.display_name} | Instance: ${n.uazapi_instance_id}`);
  });
}

checkFunnelContent();
