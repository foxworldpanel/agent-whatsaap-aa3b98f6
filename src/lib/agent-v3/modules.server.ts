import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";

export type AgentModuleV3 = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  enabled: boolean;
  priority: number;
  version: number;
  updated_at: string;
};

const modulesCache = new Map<string, { value: Record<string, string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * Loads enabled modules from the database with fallback to DEFAULT_MODULES_V3
 */
export async function loadEnabledModulesV3(workspaceId: string): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = modulesCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_modules_v3")
      .select("key, content, enabled")
      .eq("workspace_id", workspaceId)
      .eq("enabled", true);

    if (error) throw error;

    const modules: Record<string, string> = { ...DEFAULT_MODULES_V3 };

    if (data && data.length > 0) {
      // If we have DB modules, they take precedence
      data.forEach((m) => {
        modules[m.key] = m.content;
      });
    }

    modulesCache.set(workspaceId, { value: modules, expiresAt: now + CACHE_TTL_MS });
    return modules;
  } catch (err) {
    console.warn("[v3-modules] Error loading modules from DB, using fallback:", err);
    return DEFAULT_MODULES_V3;
  }
}

export function invalidateModulesCache(workspaceId: string) {
  modulesCache.delete(workspaceId);
}
