import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3 } from "./config.server";
import { buildPromptFromModules, selectModulesV3 } from "./module-selector.server";
import { invalidateModulesCache, loadEnabledModulesV3 } from "./modules.server";

export const getFullAgentV3Config = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;
    const config = await loadAgentConfigV3(context.userId);
    // Load modules from DB
    const { data: dbModules } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    const allModules: Record<string, any> = {};
    for (const m of dbModules || []) {
      allModules[m.key] = {
        id: m.id,
        content: m.content,
        isOverride: true,
        enabled: m.enabled,
        category: m.category || "Outros",
        name: m.name || m.key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        version: m.version,
        priority: m.priority ?? 0,
        updated_at: m.updated_at,
        always_load: (m as any).always_load ?? false,
        selector_intents: (m as any).selector_intents ?? [],
        selector_stages: (m as any).selector_stages ?? [],
        selector_platforms: (m as any).selector_platforms ?? [],
        selector_products: (m as any).selector_products ?? [],
        selector_triggers: (m as any).selector_triggers ?? [],
        selector_dependencies: (m as any).selector_dependencies ?? [],
        selector_conflicts: (m as any).selector_conflicts ?? [],
      };
    }

    return { config, modules: allModules, defaults: {} };
  });

export const updateV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        moduleKey: z.string(),
        content: z.string().max(20000),
        name: z.string().optional(),
        category: z.string().optional(),
        priority: z.number().optional(),
        enabled: z.boolean().optional(),
        alwaysLoad: z.boolean().optional(),
        selectorIntents: z.array(z.string()).optional(),
        selectorStages: z.array(z.string()).optional(),
        selectorPlatforms: z.array(z.string()).optional(),
        selectorProducts: z.array(z.string()).optional(),
        selectorTriggers: z.array(z.string()).optional(),
        selectorDependencies: z.array(z.string()).optional(),
        selectorConflicts: z.array(z.string()).optional(),
        id: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;

    // 1. Get current module to increment version
    const { data: current } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("key", data.moduleKey)
      .maybeSingle();

    const newVersion = (current?.version || 0) + 1;

    // 2. Upsert the module
    const { data: updated, error } = await supabase
      .from("agent_modules_v3")
      .upsert(
        {
          id: current?.id || data.id,
          user_id: userId,
          workspace_id: workspaceId,
          key: data.moduleKey,
          name:
            data.name ||
            current?.name ||
            data.moduleKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          content: data.content,
          category: data.category || current?.category || "Outros",
          priority: data.priority ?? current?.priority ?? 50,
          enabled: data.enabled ?? true,
          always_load: data.alwaysLoad ?? (current as any)?.always_load ?? false,
          selector_intents: data.selectorIntents ?? (current as any)?.selector_intents ?? [],
          selector_stages: data.selectorStages ?? (current as any)?.selector_stages ?? [],
          selector_platforms: data.selectorPlatforms ?? (current as any)?.selector_platforms ?? [],
          selector_products: data.selectorProducts ?? (current as any)?.selector_products ?? [],
          selector_triggers: data.selectorTriggers ?? (current as any)?.selector_triggers ?? [],
          selector_dependencies: data.selectorDependencies ?? (current as any)?.selector_dependencies ?? [],
          selector_conflicts: data.selectorConflicts ?? (current as any)?.selector_conflicts ?? [],
          version: newVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,key" },
      )
      .select()
      .single();

    if (error) throw error;

    // 3. Save history
    if (updated) {
      await supabase.from("agent_modules_v3_history").insert({
        module_id: updated.id,
        content: data.content,
        version: newVersion,
        created_by: userId,
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
    const { workspaceId } = context;
    const activeModulesMap = await loadEnabledModulesV3(workspaceId);
    const message = data.message || "Olá";
    const selection = selectModulesV3(message, [], activeModulesMap);
    const selectedKeys = selection.selectedModules;
    const modulePrompt = buildPromptFromModules(selectedKeys, activeModulesMap);

    // Simplified version of the orchestrator logic to show the prompt
    const prompt = `
LEAD INTELLIGENCE:
[TEMP|CONF|INTENT|STAGE|PROB|SENT|URG|ACTION|REASON|SCORE|FEEDBACK]

ESTADO DA CONVERSA:
${modulePrompt}


REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.
`;

    return {
      prompt: prompt.trim(),
      selectedModules: selectedKeys,
      selectionContext: selection.context,
      selectionReasons: selection.selectionReasons,
    };
  });
