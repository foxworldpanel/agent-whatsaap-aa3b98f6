import { supabase } from "./src/integrations/supabase/client";
import { DEFAULT_MODULES_V3 } from "./src/lib/agent-v3/default-modules-v3.server";
import { createHash } from "crypto";

const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

async function runAudit() {
  console.log("--- 1. LISTAR TODOS OS MÓDULOS (DB) ---");
  const { data: dbModules, error } = await supabase
    .from("agent_modules_v3")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("Erro ao buscar módulos:", error);
    return;
  }

  const report = dbModules.map(m => ({
    key: m.key,
    title: m.title,
    enabled: m.enabled,
    origin: "database",
    version: m.version || 1,
    content_length: m.content?.length || 0,
    preview: m.content ? m.content.substring(0, 50) + "..." : "EMPTY"
  }));

  console.table(report);

  console.log("\n--- 2. IDENTIFICAR FALLBACKS RESTANTES ---");
  const fallbacks = Object.keys(DEFAULT_MODULES_V3);
  console.log("Keys in fallback:", fallbacks);
  
  // Categorize
  const categorized = fallbacks.map(key => {
    const content = DEFAULT_MODULES_V3[key as keyof typeof DEFAULT_MODULES_V3];
    let cat = "Unknown";
    if (key === 'identidade' || key === 'objetivo') cat = "B) Comportamental";
    else if (key.includes('vendas') || key === 'qualificacao_lead') cat = "C) Comercial";
    else if (['spotify', 'youtube', 'instagram', 'tiktok', 'facebook', 'kwai'].includes(key)) cat = "D) Rede/Preços";
    else if (key.includes('suporte') || key === 'garantia') cat = "E) Suporte";
    else cat = "A) Técnico Mínimo";
    
    return { key, category: cat, length: content.length };
  });
  console.table(categorized);

  console.log("\n--- 5. COMPARAÇÃO DE HASH ---");
  const hashResults = dbModules.map(m => {
    const dbHash = createHash("sha256").update(m.content || "").digest("hex");
    const fbContent = DEFAULT_MODULES_V3[m.key as keyof typeof DEFAULT_MODULES_V3] || "";
    const fbHash = createHash("sha256").update(fbContent).digest("hex");
    
    return {
      key: m.key,
      dbHash: dbHash.substring(0, 8),
      fbHash: fbHash.substring(0, 8),
      match: dbHash === fbHash ? "MATCH" : "MISMATCH"
    };
  });
  console.table(hashResults);
}

runAudit();
