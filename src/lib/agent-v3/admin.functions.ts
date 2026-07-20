import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3, AgentConfigV3 } from "./config.server";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { buildPromptFromModules, selectRelevantModules } from "./module-selector.server";

export const getFullAgentV3Config = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const config = await loadAgentConfigV3(context.userId);
    const identity = await loadAgentIdentity(context.userId);
    
    // Combine standard modules with DB overrides (brand_blocks)
    const allModules: Record<string, { content: string; isOverride: boolean }> = {};
    
    // First, standard modules
    Object.entries(DEFAULT_MODULES_V3).forEach(([key, content]) => {
      allModules[key] = { content, isOverride: false };
    });
    
    // Then, DB overrides
    if (config.brand_blocks) {
      Object.entries(config.brand_blocks).forEach(([key, content]) => {
        allModules[key] = { content, isOverride: true };
      });
    }

    return {
      config,
      identity,
      modules: allModules,
      defaults: DEFAULT_MODULES_V3
    };
  });

export const updateV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => 
    z.object({
      moduleKey: z.string(),
      content: z.string().max(20000),
      enabled: z.boolean().optional()
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    
    const { data: existing } = await supabase
      .from("agent_config")
      .select("brand_blocks, modules_enabled")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
      
    const brand_blocks = { ...(existing?.brand_blocks as Record<string, string> || {}) };
    const modules_enabled = { ...(existing?.modules_enabled as Record<string, boolean> || {}) };
    
    brand_blocks[data.moduleKey] = data.content;
    if (data.enabled !== undefined) {
      modules_enabled[data.moduleKey] = data.enabled;
    }
    
    const { error } = await supabase
      .from("agent_config")
      .upsert({
        user_id: userId,
        workspace_id: workspaceId,
        brand_blocks,
        modules_enabled
      }, { onConflict: "user_id,workspace_id" });
      
    if (error) throw error;
    return { ok: true };
  });

export const getCompiledPromptV3 = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ message: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const config = await loadAgentConfigV3(context.userId);
    const identity = await loadAgentIdentity(context.userId);
    const activeModules = Object.entries(config.modules_enabled)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name);
      
    const message = data.message || "Olá";
    const selectedKeys = selectRelevantModules(message, activeModules);
    const modulePrompt = buildPromptFromModules(selectedKeys, config.brand_blocks);
    
    // Simplified version of the orchestrator logic to show the prompt
    const prompt = `
Você é a Júlia, vendedora especialista em marketing digital na Mind SMM.

REGRAS DE OURO:
- Responda de forma humana, natural, curta e no idioma do cliente.
- Nunca invente informações, preços, serviços, redes ou provas sociais. Quando faltar um dado necessário, pergunte.
- RECONHECIMENTO DE TERMOS (Rede Spotify): 'plays', 'streams', 'ouvintes' e 'saves' são termos EXCLUSIVOS do Spotify. Se o cliente usá-los, a rede está CONFIRMADA como Spotify. NUNCA pergunte 'qual rede' nestes casos.
- Considere a rede já confirmada quando ela vier informada pelos metadados ou pelo contexto.
- Perguntas indicam interesse, não recusa.
- Após o cliente confirmar uma oferta já apresentada, avance para o fechamento e envie mindsmmpanel.com.

LEAD INTELLIGENCE:
[TEMP|CONF|INTENT|STAGE|PROB|SENT|URG|ACTION|REASON|SCORE|FEEDBACK]

ESTADO DA CONVERSA:
${modulePrompt}

IDENTIDADE E PERSONA:
${identity.persona}

REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.
`;

    return {
      prompt: prompt.trim(),
      selectedModules: selectedKeys
    };
  });
