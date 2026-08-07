import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3 } from "../brain/config.server";
import { selectModulesV3 } from "../selector/module-selector.server";
import { buildPromptFromModulesDetailed } from "../prompt/prompt-builder.server";
import { invalidateModulesCache, loadEnabledModulesV3 } from "../brain/modules.server";

export const getFullAgentV3Config = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;

    const config = await loadAgentConfigV3(context.userId, workspaceId);
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
        moduleKey: z.string().trim().min(1).max(120),
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
    const moduleKey = data.moduleKey.trim().toLowerCase();

    // 1. Get current module to increment version
    const { data: current, error: currentError } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("key", moduleKey)
      .maybeSingle();

    if (currentError) throw currentError;

    const newVersion = (current?.version || 0) + 1;

    // 2. Upsert the module
    const { data: updated, error } = await supabase
      .from("agent_modules_v3")
      .upsert(
        {
          id: current?.id || data.id,
          user_id: userId,
          workspace_id: workspaceId,
          key: moduleKey,
          name:
            data.name ||
            current?.name ||
            moduleKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          content: data.content,
          category: data.category || current?.category || "Outros",
          priority: data.priority ?? current?.priority ?? 50,
          enabled: data.enabled ?? current?.enabled ?? true,
          always_load: data.alwaysLoad ?? (current as any)?.always_load ?? false,
          selector_intents: (data.selectorIntents ?? (current as any)?.selector_intents ?? []) as any,
          selector_stages: (data.selectorStages ?? (current as any)?.selector_stages ?? []) as any,
          selector_platforms: (data.selectorPlatforms ?? (current as any)?.selector_platforms ?? []) as any,
          selector_products: (data.selectorProducts ?? (current as any)?.selector_products ?? []) as any,
          selector_triggers: (data.selectorTriggers ?? (current as any)?.selector_triggers ?? []) as any,
          selector_dependencies: (data.selectorDependencies ?? (current as any)?.selector_dependencies ?? []) as any,
          selector_conflicts: (data.selectorConflicts ?? (current as any)?.selector_conflicts ?? []) as any,
          version: newVersion,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "workspace_id,key" },
      )
      .select()
      .single();

    if (error) throw error;
    
    // Histórico é capturado automaticamente por um gatilho no banco
    // (trg_agent_modules_v3_history, dispara BEFORE UPDATE em
    // agent_modules_v3, salva o estado ANTERIOR em
    // agent_modules_v3_history). Não precisa de nada aqui — inserir
    // manualmente aqui seria redundante e, pior, inseriria o estado
    // NOVO (updated.*) em vez do estado antigo, invertendo o propósito
    // do histórico.

    // 4. Invalidate cache
    invalidateModulesCache(workspaceId);

    return { ok: true, id: updated.id };
  });

export const deleteV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ moduleKey: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;
    const moduleKey = data.moduleKey.trim().toLowerCase();

    const { error } = await supabase
      .from("agent_modules_v3")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("key", moduleKey);

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
    const promptBuild = buildPromptFromModulesDetailed(selectedKeys, activeModulesMap);
    const modulePrompt = promptBuild.prompt;

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
      selectedModules: promptBuild.includedKeys,
      promptWarnings: promptBuild.warnings,
      selectionContext: selection.context,
      selectionReasons: selection.selectionReasons,
    };
  });

// Lista o histórico de versões de um módulo do CMS. Usa a tabela
// agent_modules_v3_history, alimentada automaticamente pelo gatilho
// trg_agent_modules_v3_history a cada edição — nenhuma lógica extra
// de captura necessária aqui, só leitura.
export const listV3ModuleHistory = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        moduleKey: z.string().trim().min(1).max(120),
        limit: z.number().min(1).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;

    const { data: history, error } = await supabase
      .from("agent_modules_v3_history")
      .select("id, version, content, enabled, archived_at, name")
      .eq("workspace_id", workspaceId)
      .eq("key", data.moduleKey.trim().toLowerCase())
      .order("archived_at", { ascending: false })
      .limit(data.limit ?? 20);

    if (error) throw error;

    return { history: history || [] };
  });

// Restaura um módulo pro estado de uma versão anterior do histórico.
// Não apaga nada: aplica o conteúdo antigo por cima do módulo atual via
// UPDATE normal — o que significa que o próprio gatilho
// trg_agent_modules_v3_history vai automaticamente arquivar o estado
// ATUAL (antes da restauração) como uma nova entrada de histórico. Ou
// seja, o rollback em si também é reversível, de graça.
export const rollbackV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        historyId: z.string().trim().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;

    // 1. Busca a versão antiga que queremos restaurar — escopada ao
    // workspace, pra ninguém restaurar histórico de outro workspace.
    const { data: historyRow, error: historyErr } = await supabase
      .from("agent_modules_v3_history")
      .select("*")
      .eq("id", data.historyId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (historyErr) throw historyErr;
    if (!historyRow) throw new Error("Versão do histórico não encontrada.");

    // 2. Busca o módulo atual pra saber o próximo número de versão.
    const { data: current, error: currentErr } = await supabase
      .from("agent_modules_v3")
      .select("id, version")
      .eq("id", historyRow.module_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (currentErr) throw currentErr;
    if (!current) throw new Error("Módulo atual não encontrado — pode ter sido excluído.");

    const newVersion = (current.version || 0) + 1;

    // 3. Aplica o conteúdo antigo de volta. O gatilho no banco cuida
    // de arquivar o estado atual automaticamente antes desse UPDATE
    // acontecer — não precisa de nenhuma chamada extra aqui.
    const { data: restored, error: restoreErr } = await supabase
      .from("agent_modules_v3")
      .update({
        name: historyRow.name,
        description: historyRow.description,
        category: historyRow.category,
        content: historyRow.content,
        enabled: historyRow.enabled,
        priority: historyRow.priority,
        always_load: historyRow.always_load,
        selector_intents: historyRow.selector_intents,
        selector_stages: historyRow.selector_stages,
        selector_platforms: historyRow.selector_platforms,
        selector_products: historyRow.selector_products,
        selector_triggers: historyRow.selector_triggers,
        selector_dependencies: historyRow.selector_dependencies,
        selector_conflicts: historyRow.selector_conflicts,
        domain: historyRow.domain,
        platform: historyRow.platform,
        knowledge_type: historyRow.knowledge_type,
        status: historyRow.status,
        version: newVersion,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", historyRow.module_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (restoreErr) throw restoreErr;

    invalidateModulesCache(workspaceId);

    return { restored };
  });
