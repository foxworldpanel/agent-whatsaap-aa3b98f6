import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { loadAgentConfigV3 } from "./config.server";

export const seedModulesToDb = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, userId, workspaceId } = context;
    
    // Check if we already have modules in DB
    const { count } = await supabase
      .from("agent_modules_v3")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
      
    if (count && count > 0) {
      return { message: "Modules already exist in DB", count };
    }
    
    const config = await loadAgentConfigV3(userId);
    const overrides = config.brand_blocks || {};
    
    const categories: Record<string, string> = {
      identidade: "Núcleo",
      regras_gerais: "Núcleo",
      comportamento_humano: "Núcleo",
      texto_ou_audio: "Atendimento",
      fluxo_vendas: "Comercial",
      suporte: "Atendimento",
      tabela_precos: "Dados",
      fechamento_3: "Comercial",
      spotify: "Redes",
      youtube: "Redes",
      instagram: "Redes",
      tiktok: "Redes",
      facebook: "Redes",
      kwai: "Redes",
      faq: "Atendimento",
      objecoes: "Comercial",
      mensagens_prontas: "Comercial",
      pix_pagamentos: "Atendimento",
      suporte_pos_compra: "Atendimento",
      tabelas_servicos: "Dados"
    };

    const modulesToInsert = Object.entries(DEFAULT_MODULES_V3).map(([key, defaultContent]) => {
      const content = overrides[key] || defaultContent;
      return {
        user_id: userId,
        workspace_id: workspaceId,
        key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        content,
        category: categories[key] || "Outros",
        description: `Módulo de ${key.replace(/_/g, ' ')}`,
        enabled: true,
        priority: 0,
        version: 1
      };
    });

    const { data, error } = await supabase
      .from("agent_modules_v3")
      .insert(modulesToInsert)
      .select();

    if (error) {
      console.error("Error seeding modules:", error);
      throw error;
    }

    return { message: "Modules seeded successfully", count: data?.length };
  });
