import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function diagnoseAll() {
  console.log("--- BUSCANDO TODOS OS FUNIS (SEM FILTRO) ---");
  const { data: funnels, error } = await supabase
    .from("welcome_funnels")
    .select("id, name, trigger_keywords, enabled, workspace_id");

  if (error) {
    console.error("Erro:", error);
    return;
  }

  console.log(`Total no banco: ${funnels?.length || 0}`);
  funnels?.forEach(f => {
    console.log(`ID: ${f.id} | Name: ${f.name} | Enabled: ${f.enabled} | Workspace: ${f.workspace_id} | Triggers: ${f.trigger_keywords}`);
  });
}

diagnoseAll();
