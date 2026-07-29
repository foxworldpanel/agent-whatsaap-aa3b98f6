import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function cleanupDebugLogs() {
  console.log("--- LIMPANDO LOGS DE DEBUG NO WEBHOOK ---");
  // Esta parte o bot faria via code--line_replace, aqui apenas descrevemos o plano
}

async function fixFunnelNumberIds() {
  console.log("--- CORRIGINDO WHATSAPP_NUMBER_ID NOS FUNIS ---");
  
  // 1. Pegar a instância principal da Mind
  const { data: numbers } = await supabase
    .from("whatsapp_numbers")
    .select("id, display_name")
    .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
    .eq("uazapi_instance_id", "d9e8c7b6a5f4e3d2c1b0"); // Id da instância da Mind

  const mindNumId = numbers?.[0]?.id;
  
  if (!mindNumId) {
    console.log("Instância Mind não encontrada pelo uazapi_instance_id. Buscando a primeira disponível...");
    const { data: firstNum } = await supabase
      .from("whatsapp_numbers")
      .select("id")
      .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
      .limit(1)
      .single();
    
    if (firstNum) {
      console.log("Usando a instância:", firstNum.id);
      const { error } = await supabase
        .from("welcome_funnels")
        .update({ whatsapp_number_id: firstNum.id })
        .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
        .is("whatsapp_number_id", null);
      
      if (error) console.error("Erro ao atualizar:", error);
      else console.log("Funis sem whatsapp_number_id atualizados com sucesso.");
    }
  } else {
    const { error } = await supabase
      .from("welcome_funnels")
      .update({ whatsapp_number_id: mindNumId })
      .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
      .is("whatsapp_number_id", null);
      
    if (error) console.error("Erro ao atualizar:", error);
    else console.log("Funis atualizados com a instância Mind.");
  }
}

fixFunnelNumberIds();
