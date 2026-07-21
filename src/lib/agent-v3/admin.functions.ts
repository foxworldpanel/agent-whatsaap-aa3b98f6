import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3, AgentConfigV3 } from "./config.server";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { buildPromptFromModules, selectRelevantModules } from "./module-selector.server";
import { invalidateModulesCache } from "./modules.server";

export const getFullAgentV3Config = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;
    const config = await loadAgentConfigV3(context.userId);
    const identity = await loadAgentIdentity(context.userId);
    
    // Load modules from DB
    const { data: dbModules } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    const allModules: Record<string, any> = {};
    
    // Use DB modules if they exist, otherwise fallback to defaults
    if (dbModules && dbModules.length > 0) {
      dbModules.forEach(m => {
        allModules[m.key] = { 
          id: m.id,
          content: m.content, 
          isOverride: true,
          enabled: m.enabled,
          category: m.category,
          name: m.name,
          version: m.version,
          updated_at: m.updated_at
        };
      });
    } else {
      Object.entries(DEFAULT_MODULES_V3).forEach(([key, content]) => {
        allModules[key] = { 
          content, 
          isOverride: false, 
          enabled: true,
          category: "Outros",
          name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          version: 1
        };
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
      enabled: z.boolean().optional(),
      id: z.string().optional()
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    
    // 1. Get current module to increment version
    const { data: current } = await supabase
      .from("agent_modules_v3")
      .select("id, version, content")
      .eq("workspace_id", workspaceId)
      .eq("key", data.moduleKey)
      .maybeSingle();

    const newVersion = (current?.version || 0) + 1;

    // 2. Upsert the module
    const { data: updated, error } = await supabase
      .from("agent_modules_v3")
      .upsert({
        id: current?.id,
        user_id: userId,
        workspace_id: workspaceId,
        key: data.moduleKey,
        content: data.content,
        enabled: data.enabled ?? true,
        version: newVersion,
        updated_at: new Date().toISOString()
      }, { onConflict: "workspace_id,key" })
      .select()
      .single();
      
    if (error) throw error;

    // 3. Save history
    if (updated) {
      await supabase
        .from("agent_modules_v3_history")
        .insert({
          module_id: updated.id,
          content: data.content,
          version: newVersion,
          created_by: userId
        });
    }

    // 4. Invalidate cache
    invalidateModulesCache(workspaceId);
    
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
