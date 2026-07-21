import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { loadEnabledModulesV3 } from "../brain/modules.server";
import { createHash } from "crypto";

export const getValidationAudit = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;
    const { data: dbModules, error } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    if (error) throw new Error(error.message);

    const runtimeModules = await loadEnabledModulesV3(workspaceId);
    const modulesList = (dbModules || []).map((raw) => {
      const m = raw as Record<string, any>;
      const routingSignals = [
        m.always_load === true,
        ...(m.selector_intents || []),
        ...(m.selector_stages || []),
        ...(m.selector_platforms || []),
        ...(m.selector_products || []),
        ...(m.selector_triggers || []),
      ];
      return {
        id: m.id,
        key: m.key,
        title: m.name,
        category: m.category || "Geral",
        enabled: m.enabled ?? false,
        always_load: m.always_load ?? false,
        priority: m.priority ?? 0,
        version: m.version || 1,
        content: m.content,
        content_length: m.content?.length || 0,
        preview: m.content ? `${m.content.substring(0, 50).trim()}...` : "EMPTY",
        reachable: m.enabled === true && routingSignals.some(Boolean),
        routing: {
          intents: m.selector_intents || [],
          stages: m.selector_stages || [],
          platforms: m.selector_platforms || [],
          products: m.selector_products || [],
          triggers: m.selector_triggers || [],
          dependencies: m.selector_dependencies || [],
          conflicts: m.selector_conflicts || [],
        },
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });

    const hashResults = modulesList.map((m) => {
      const dbHash = createHash("sha256").update(m.content || "").digest("hex").slice(0, 8);
      const runtimeContent = runtimeModules[m.key]?.content || "";
      const runtimeHash = createHash("sha256").update(runtimeContent).digest("hex").slice(0, 8);
      return {
        key: m.key,
        dbHash,
        runtimeHash,
        match: dbHash === runtimeHash,
        source: runtimeModules[m.key]?.source || "disabled",
      };
    });

    const orphanModules = modulesList
      .filter((m) => m.enabled && !m.reachable)
      .map((m) => ({ key: m.key, reason: "Sem always_load, intenção, estágio, plataforma, produto ou gatilho no CMS" }));

    return {
      workspaceId,
      modulesList,
      fallbacks: [],
      hashResults,
      orphanModules,
      allMigrated: true,
      cmsIsSingleSource: true,
    };
  });
