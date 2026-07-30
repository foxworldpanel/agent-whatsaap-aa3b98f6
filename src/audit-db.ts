import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function main() {
  const wsId = "bd59fa41-a5d6-4e56-b847-a8417c80084f";
  
  console.log("--- 3) MÓDULOS NO BANCO ---");
  const { data: modules, error: modErr } = await supabaseAdmin
    .from("agent_modules_v3")
    .select("key")
    .eq("workspace_id", wsId);
  console.log("Count:", modules?.length || 0);
  console.log("Keys:", modules?.map(m => m.key) || []);
  if (modErr) console.error("Error modules:", modErr);

  console.log("\n--- 4) TOKEN DA INSTÂNCIA ---");
  const { data: numbers, error: numErr } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, nome, uazapi_token")
    .eq("workspace_id", wsId);
  console.log(numbers?.map(n => ({ 
    id: n.id, 
    nome: n.nome, 
    token: n.uazapi_token ? n.uazapi_token.slice(0, 8) + "..." : "null" 
  })));
  if (numErr) console.error("Error numbers:", numErr);
}

main();
