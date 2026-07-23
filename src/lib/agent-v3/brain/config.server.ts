// src/lib/agent-v3/config.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AgentConfigV3 = {
  modules_enabled: Record<string, boolean>;
  brand_blocks: Record<string, string>;
  catalog_in_prompt: boolean;
  catalog_only_relevant: boolean;
};

const configCache = new Map<string, { value: AgentConfigV3; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

const cloneConfig = (config: AgentConfigV3): AgentConfigV3 => ({
  ...config,
  modules_enabled: { ...config.modules_enabled },
  brand_blocks: { ...config.brand_blocks },
});

const emptyConfig = (): AgentConfigV3 => ({
  modules_enabled: {},
  brand_blocks: {},
  catalog_in_prompt: true,
  catalog_only_relevant: true,
});

/** Loads the full configuration for the agent from agent_config table. */
export async function loadAgentConfigV3(userId: string): Promise<AgentConfigV3> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    console.warn("[v3-config] userId vazio; usando configuração segura padrão");
    return emptyConfig();
  }

  const now = Date.now();
  const cached = configCache.get(normalizedUserId);
  if (cached && cached.expiresAt > now) return cloneConfig(cached.value);

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_config")
      .select("modules_enabled, brand_blocks, catalog_in_prompt, catalog_only_relevant")
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (error) throw error;

    const config: AgentConfigV3 = {
      modules_enabled:
        data?.modules_enabled && typeof data.modules_enabled === "object"
          ? { ...(data.modules_enabled as Record<string, boolean>) }
          : {},
      brand_blocks:
        data?.brand_blocks && typeof data.brand_blocks === "object"
          ? { ...(data.brand_blocks as Record<string, string>) }
          : {},
      catalog_in_prompt:
        typeof data?.catalog_in_prompt === "boolean" ? data.catalog_in_prompt : true,
      catalog_only_relevant:
        typeof data?.catalog_only_relevant === "boolean" ? data.catalog_only_relevant : true,
    };

    configCache.set(normalizedUserId, {
      value: cloneConfig(config),
      expiresAt: now + CACHE_TTL_MS,
    });
    return cloneConfig(config);
  } catch (err) {
    console.warn("[v3-config] Error loading config, returning empty:", err);
    return emptyConfig();
  }
}

export function invalidateAgentConfigCache(userId: string): void {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) configCache.delete(normalizedUserId);
}

export function clearAgentConfigCache(): void {
  configCache.clear();
}
