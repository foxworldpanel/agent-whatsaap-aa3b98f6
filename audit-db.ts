import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function auditDatabase() {
  const workspaceId = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7"; // Mind SMM Workspace
  
  console.log("--- AUDITORIA DO BANCO agent_modules_v3 ---");
  const { data: modules, error } = await supabaseAdmin
    .from('agent_modules_v3')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error("Erro ao buscar módulos:", error);
    return;
  }

  console.log(`Encontrados ${modules?.length || 0} módulos no banco.`);

  const inventory = modules?.map(m => ({
    id: m.id,
    key: m.key,
    title: m.title,
    category: m.category,
    enabled: m.enabled,
    content_length: m.content?.length || 0,
    is_empty: !m.content || m.content.trim().length === 0,
    version: m.version,
    updated_at: m.updated_at
  }));

  console.table(inventory);

  const emptyModules = inventory?.filter(m => m.is_empty && m.enabled);
  if (emptyModules?.length) {
    console.log("\nAVISO: Módulos ATIVOS que estão vazios no banco:");
    console.table(emptyModules);
  }
}

auditDatabase();
