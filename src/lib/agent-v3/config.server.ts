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

/**
 * Loads the full configuration for the agent from agent_config table.
 */
export async function loadAgentConfigV3(userId: string): Promise<AgentConfigV3> {
  const now = Date.now();
  const cached = configCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_config")
      .select("modules_enabled, brand_blocks, catalog_in_prompt, catalog_only_relevant")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const config: AgentConfigV3 = {
      modules_enabled: (data?.modules_enabled as Record<string, boolean>) || {},
      brand_blocks: (data?.brand_blocks as Record<string, string>) || {},
      catalog_in_prompt: !!data?.catalog_in_prompt,
      catalog_only_relevant: !!data?.catalog_only_relevant,
    };

    configCache.set(userId, { value: config, expiresAt: now + CACHE_TTL_MS });
    return config;
  } catch (err) {
    console.warn("[v3-config] Error loading config, returning empty:", err);
    return {
      modules_enabled: {},
      brand_blocks: {},
      catalog_in_prompt: true,
      catalog_only_relevant: true,
    };
  }
}
