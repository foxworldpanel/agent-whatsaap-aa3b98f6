import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ModuleRoutingV3 = {
  alwaysLoad: boolean;
  intents: string[];
  stages: string[];
  platforms: string[];
  products: string[];
  triggers: string[];
  dependencies: string[];
  conflicts: string[];
  priority: number;
};

export type LoadedModuleV3 = {
  content: string;
  source: "database" | "custom";
  version: number | string;
  name?: string;
  category?: string;
  routing: ModuleRoutingV3;
};

const modulesCache = new Map<
  string,
  { value: Record<string, LoadedModuleV3>; expiresAt: number }
>();
const CACHE_TTL_MS = 30_000;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().toLowerCase())
    : [];

/**
 * Carrega exclusivamente os módulos habilitados no CMS.
 * A V3 não mantém conteúdo de persona, regras ou vendas em fallback no código.
 * Se o CMS estiver indisponível, o turno falha de forma explícita em vez de usar
 * conhecimento desatualizado ou divergente.
 */
export async function loadEnabledModulesV3(
  workspaceId: string,
): Promise<Record<string, LoadedModuleV3>> {
  const now = Date.now();
  const cached = modulesCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("agent_modules_v3")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  if (error) {
    throw new Error(`[v3-modules] Falha ao carregar módulos do CMS: ${error.message}`);
  }

  const modules: Record<string, LoadedModuleV3> = {};
  for (const rawRow of data || []) {
    const row = rawRow as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim().toLowerCase() : "";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (!key || !content) continue;

    modules[key] = {
      content,
      source: "database",
      version: typeof row.version === "number" ? row.version : 1,
      name: typeof row.name === "string" ? row.name : key,
      category: typeof row.category === "string" ? row.category : "Outros",
      routing: {
        alwaysLoad: row.always_load === true,
        intents: asStringArray(row.selector_intents),
        stages: asStringArray(row.selector_stages),
        platforms: asStringArray(row.selector_platforms),
        products: asStringArray(row.selector_products),
        triggers: asStringArray(row.selector_triggers),
        dependencies: asStringArray(row.selector_dependencies),
        conflicts: asStringArray(row.selector_conflicts),
        priority: typeof row.priority === "number" ? row.priority : 0,
      },
    };
  }

  if (Object.keys(modules).length === 0) {
    throw new Error(`[v3-modules] Nenhum módulo habilitado e preenchido no CMS para ${workspaceId}`);
  }

  modulesCache.set(workspaceId, { value: modules, expiresAt: now + CACHE_TTL_MS });
  return modules;
}

export function invalidateModulesCache(workspaceId: string): void {
  modulesCache.delete(workspaceId);
}
