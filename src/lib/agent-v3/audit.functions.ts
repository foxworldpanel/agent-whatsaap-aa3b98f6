import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { loadEnabledModulesV3 } from "./modules.server";
import { createHash } from "crypto";

export const getValidationAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

    // 1. List Modules from DB
    const { data: dbModules, error } = await supabaseAdmin
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    const modulesList = dbModules.map(m => ({
      id: m.id,
      key: m.key,
      title: m.name,
      category: m.category || "Geral",
      enabled: m.enabled ?? false,
      always_load: (m as any).always_load ?? false, // Temporary cast until types sync
      priority: m.priority ?? 0,
      triggers: (m as any).triggers ?? [], // Temporary cast until types sync
      version: m.version || 1,
      content: m.content,
      content_length: m.content?.length || 0,
      preview: m.content ? m.content.substring(0, 50).trim() + "..." : "EMPTY",
      created_at: m.created_at,
      updated_at: m.updated_at
    }));

    // 2. Identify Fallbacks
    const fallbackKeys = Object.keys(DEFAULT_MODULES_V3);
    const fallbacks = fallbackKeys.map(key => {
      const content = DEFAULT_MODULES_V3[key as keyof typeof DEFAULT_MODULES_V3];
      let cat = "Unknown";
      if (key === 'identidade' || key === 'objetivo') cat = "B) Comportamental";
      else if (key.includes('vendas') || key === 'qualificacao_lead') cat = "C) Comercial";
      else if (['spotify', 'youtube', 'instagram', 'tiktok', 'facebook', 'kwai'].includes(key)) cat = "D) Rede/Preços";
      else if (key.includes('suporte') || key === 'garantia') cat = "E) Suporte";
      else cat = "A) Técnico Mínimo";
      
      return { 
        key, 
        category: cat, 
        length: content.length,
        isMigrated: dbModules.some(m => m.key === key)
      };
    });

    // 3. Comparison and Hashes
    const runtimeModules = await loadEnabledModulesV3(workspaceId);
    const hashResults = modulesList.map(m => {
      const dbHash = createHash("sha256").update(dbModules.find(dm => dm.key === m.key)?.content || "").digest("hex").substring(0, 8);
      const runtimeContent = runtimeModules[m.key]?.content || "";
      const runtimeHash = createHash("sha256").update(runtimeContent).digest("hex").substring(0, 8);
      
      return {
        key: m.key,
        dbHash,
        runtimeHash,
        match: dbHash === runtimeHash,
        source: runtimeModules[m.key]?.source || "unknown"
      };
    });

    return {
      workspaceId,
      modulesList,
      fallbacks,
      hashResults,
      allMigrated: fallbacks.every(f => f.category === "A) Técnico Mínimo" || f.isMigrated)
    };
  });
