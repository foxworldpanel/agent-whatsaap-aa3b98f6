import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3, AgentConfigV3 } from "./config.server";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { loadAgentIdentity } from "@/lib/agent-identity.server";
import { buildPromptFromModules, selectRelevantModules } from "./module-selector.server";
import { invalidateModulesCache, loadEnabledModulesV3 } from "./modules.server";

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
    
    // 1. Start with all defaults
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
    
    // 2. Override with database values
    if (dbModules && dbModules.length > 0) {
      dbModules.forEach(m => {
        allModules[m.key] = { 
          id: m.id,
          content: m.content, 
          isOverride: true,
          enabled: m.enabled,
          category: m.category || allModules[m.key]?.category || "Outros",
          name: m.name || allModules[m.key]?.name || m.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          version: m.version,
          updated_at: m.updated_at
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
      name: z.string().optional(),
      category: z.string().optional(),
      priority: z.number().optional(),
      enabled: z.boolean().optional(),
      id: z.string().optional()
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    
    // 1. Get current module to increment version
    const { data: current } = await supabase
      .from("agent_modules_v3")
      .select("id, version, content, name, category, priority")
      .eq("workspace_id", workspaceId)
      .eq("key", data.moduleKey)
      .maybeSingle();

    const newVersion = (current?.version || 0) + 1;

    // 2. Upsert the module
    const { data: updated, error } = await supabase
      .from("agent_modules_v3")
      .upsert({
        id: current?.id || data.id,
        user_id: userId,
        workspace_id: workspaceId,
        key: data.moduleKey,
        name: data.name || current?.name || data.moduleKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        content: data.content,
        category: data.category || current?.category || "Outros",
        priority: data.priority ?? current?.priority ?? 50,
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
    
    return { ok: true, id: updated.id };
  });

export const deleteV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ moduleKey: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;
    
    const { error } = await supabase
      .from("agent_modules_v3")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("key", data.moduleKey);
      
    if (error) throw error;
    
    invalidateModulesCache(workspaceId);
    return { ok: true };
  });

export const getCompiledPromptV3 = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ message: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId, userId } = context;
    const identity = await loadAgentIdentity(userId);
    const activeModulesMap = await loadEnabledModulesV3(workspaceId);
    const enabledKeys = Object.keys(activeModulesMap);
      
    const message = data.message || "Olá";
    const selectedKeys = selectRelevantModules(message, enabledKeys);
    const modulePrompt = buildPromptFromModules(selectedKeys, activeModulesMap as any);
    
    // Simplified version of the orchestrator logic to show the prompt
    const prompt = `
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
