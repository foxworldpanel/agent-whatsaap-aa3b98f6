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
  // Metadados arquiteturais (Sprint 3.4) — ainda não influenciam
  // nenhuma decisão de runtime, só existem no objeto carregado.
  domain?: string;
  platform?: string;
  knowledgeType?: string;
  status?: string;
  routing: ModuleRoutingV3;
};

const modulesCache = new Map<
  string,
  { value: Record<string, LoadedModuleV3>; expiresAt: number }
>();
const CACHE_TTL_MS = 30_000;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0,
            )
            .map((item) => item.trim().toLowerCase()),
        ),
      )
    : [];

const cloneModule = (module: LoadedModuleV3): LoadedModuleV3 => ({
  ...module,
  routing: {
    ...module.routing,
    intents: [...module.routing.intents],
    stages: [...module.routing.stages],
    platforms: [...module.routing.platforms],
    products: [...module.routing.products],
    triggers: [...module.routing.triggers],
    dependencies: [...module.routing.dependencies],
    conflicts: [...module.routing.conflicts],
  },
});

const cloneModulesMap = (
  modules: Record<string, LoadedModuleV3>,
): Record<string, LoadedModuleV3> =>
  Object.fromEntries(Object.entries(modules).map(([key, module]) => [key, cloneModule(module)]));

/**
 * Carrega exclusivamente os módulos habilitados no CMS.
 * A V3 não mantém conteúdo de persona, regras ou vendas em fallback no código.
 * Se o CMS estiver indisponível, o turno falha de forma explícita em vez de usar
 * conhecimento desatualizado ou divergente.
 */
export async function loadEnabledModulesV3(
  workspaceId: string,
): Promise<Record<string, LoadedModuleV3>> {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedWorkspaceId) {
    throw new Error("[v3-modules] workspaceId é obrigatório para carregar módulos do CMS");
  }

  const now = Date.now();
  const cached = modulesCache.get(normalizedWorkspaceId);
  if (cached && cached.expiresAt > now) return cloneModulesMap(cached.value);

  const { data, error } = await supabaseAdmin
    .from("agent_modules_v3")
    .select("*")
    .eq("workspace_id", normalizedWorkspaceId)
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .order("key", { ascending: true });

  if (error) {
    throw new Error(`[v3-modules] Falha ao carregar módulos do CMS: ${error.message}`);
  }

  const modules: Record<string, LoadedModuleV3> = {};
  for (const rawRow of data || []) {
    const row = rawRow as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim().toLowerCase() : "";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (!key || !content) continue;

    const nextModule: LoadedModuleV3 = {
      content,
      source: "database",
      version: typeof row.version === "number" ? row.version : 1,
      name: typeof row.name === "string" ? row.name.trim() || key : key,
      category: typeof row.category === "string" ? row.category.trim() || "Outros" : "Outros",
      // Metadados arquiteturais (Sprint 3.4) — lidos direto do banco,
      // sem nenhuma decisão baseada neles ainda.
      domain: typeof row.domain === "string" && row.domain.trim() ? row.domain.trim() : undefined,
      platform: typeof row.platform === "string" && row.platform.trim() ? row.platform.trim() : undefined,
      knowledgeType: typeof row.knowledge_type === "string" && row.knowledge_type.trim() ? row.knowledge_type.trim() : undefined,
      status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : undefined,
      routing: {
        alwaysLoad: row.always_load === true,
        intents: asStringArray(row.selector_intents),
        stages: asStringArray(row.selector_stages),
        platforms: asStringArray(row.selector_platforms),
        products: asStringArray(row.selector_products),
        triggers: asStringArray(row.selector_triggers),
        dependencies: asStringArray(row.selector_dependencies),
        conflicts: asStringArray(row.selector_conflicts),
        priority: typeof row.priority === "number" && Number.isFinite(row.priority) ? row.priority : 0,
      },
    };

    if (modules[key]) {
      console.warn(
        `[v3-modules] Chave duplicada após normalização no workspace ${normalizedWorkspaceId}: ${key}. Mantendo o primeiro módulo da ordenação determinística.`,
      );
      continue;
    }

    modules[key] = nextModule;
  }

  // Segurança contra CMS parcialmente migrado/reabilitação acidental do legado:
  // se a família modular existe, o módulo monolítico da mesma plataforma não
  // pode competir no mesmo prompt com conteúdo/preços antigos.
  if (modules.spotify && Object.keys(modules).some((key) => key.startsWith("spotify_"))) {
    console.warn("[v3-modules] Ignorando módulo legado spotify porque submódulos spotify_* estão ativos.");
    delete modules.spotify;
  }
  if (modules.youtube && Object.keys(modules).some((key) => key.startsWith("youtube_"))) {
    console.warn("[v3-modules] Ignorando módulo legado youtube porque submódulos youtube_* estão ativos.");
    delete modules.youtube;
  }

  // Log de validação (Sprint 3.4) — só fora de produção. Confirma que
  // os 4 metadados novos chegam corretamente ao objeto carregado.
  // Não influencia nenhuma decisão — é só diagnóstico.
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    for (const [key, mod] of Object.entries(modules)) {
      if (mod.domain) {
        console.log("[v3-modules] [METADATA]", {
          key,
          domain: mod.domain,
          platform: mod.platform,
          knowledgeType: mod.knowledgeType,
          status: mod.status,
        });
      }
    }
  }

  if (Object.keys(modules).length === 0) {
    throw new Error(
      `[v3-modules] Nenhum módulo habilitado e preenchido no CMS para ${normalizedWorkspaceId}`,
    );
  }

  modulesCache.set(normalizedWorkspaceId, {
    value: cloneModulesMap(modules),
    expiresAt: now + CACHE_TTL_MS,
  });
  return cloneModulesMap(modules);
}

export function invalidateModulesCache(workspaceId: string): void {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (normalizedWorkspaceId) modulesCache.delete(normalizedWorkspaceId);
}

export function clearModulesCache(): void {
  modulesCache.clear();
}

// Movido de orchestrator.server.ts (Sprint CORE PATCH v1.0) — fica aqui
// porque tanto orchestrator quanto o Module Selector precisam, e os
// dois já importam deste arquivo sem risco de dependência circular.
export type CommercePlatform = "spotify" | "youtube" | "instagram" | "tiktok" | "kwai" | "facebook";

export function moduleBelongsToPlatform(key: string, module: LoadedModuleV3, platform: CommercePlatform): boolean {
  return key === platform || key.startsWith(`${platform}_`) || module.routing.platforms.includes(platform);
}
