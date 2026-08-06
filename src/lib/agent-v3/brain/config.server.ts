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
export async function loadAgentConfigV3(
  userId: string,
  workspaceId?: string,
): Promise<AgentConfigV3> {
  const normalizedUserId = userId?.trim();
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedUserId) {
    console.warn("[v3-config] userId vazio; usando configuração segura padrão");
    return emptyConfig();
  }

  const cacheKey = normalizedWorkspaceId
    ? `${normalizedUserId}:${normalizedWorkspaceId}`
    : normalizedUserId;
  const now = Date.now();
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cloneConfig(cached.value);

  try {
    let query = supabaseAdmin
      .from("agent_config")
      .select("modules_enabled, brand_blocks, catalog_in_prompt, catalog_only_relevant")
      .eq("user_id", normalizedUserId);

    if (normalizedWorkspaceId) {
      query = query.eq("workspace_id", normalizedWorkspaceId);
    }

    const { data, error } = await query.maybeSingle();

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

    configCache.set(cacheKey, {
      value: cloneConfig(config),
      expiresAt: now + CACHE_TTL_MS,
    });
    return cloneConfig(config);
  } catch (err) {
    console.warn("[v3-config] Error loading config, returning empty:", err);
    return emptyConfig();
  }
}

export function invalidateAgentConfigCache(userId: string, workspaceId?: string): void {
  const normalizedUserId = userId?.trim();
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedUserId) return;

  if (normalizedWorkspaceId) {
    configCache.delete(`${normalizedUserId}:${normalizedWorkspaceId}`);
    return;
  }

  // Sem workspace explícito, invalida todas as entradas deste usuário.
  for (const key of configCache.keys()) {
    if (key === normalizedUserId || key.startsWith(`${normalizedUserId}:`)) {
      configCache.delete(key);
    }
  }
}

export function clearAgentConfigCache(): void {
  configCache.clear();
}

/**
 * Checks if the agent is enabled for a specific conversation.
 * Bypasses local cache to ensure immediate response to toggle.
 */
export async function isConversationAgentEnabledV3(
  supabaseAdmin: any,
  conversationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("agent_enabled")
      .eq("id", conversationId)
      .maybeSingle();

    if (error) {
      console.error("[v3-config] Error checking agent_enabled status:", error);
      return true; // Fail-open
    }

    // O agente só é considerado habilitado se agent_enabled for EXPLICITAMENTE true.
    // Se for null ou false, ele não deve responder (isso garante que o desligamento
    // manual ou falhas críticas que setam null/false sejam respeitadas).
    return data?.agent_enabled === true;
  } catch (err) {
    console.error("[v3-config] Exception checking agent_enabled:", err);
    return true; // Fail-open
  }
}
