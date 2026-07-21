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
  source?: "database" | "fallback";
  fallback_reason?: string;
};

const modulesCache = new Map<string, { value: Record<string, string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

/**
 * Loads enabled modules from the database with fallback to DEFAULT_MODULES_V3
 */
export async function loadEnabledModulesV3(workspaceId: string): Promise<Record<string, { content: string; source: "database" | "fallback"; fallback_reason?: string }>> {
  const now = Date.now();
  const cached = modulesCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value as any;

  try {
    const { data, error } = await supabaseAdmin
      .from("agent_modules_v3")
      .select("key, content, enabled, category, priority")
      .eq("workspace_id", workspaceId)
      .eq("enabled", true)
      .not("content", "is", null);

    if (error) throw error;

    const modules: Record<string, { content: string; source: "database" | "fallback"; fallback_reason?: string }> = {};

    // Initialize with fallback markers
    Object.keys(DEFAULT_MODULES_V3).forEach(key => {
      modules[key] = {
        content: DEFAULT_MODULES_V3[key],
        source: "fallback",
        fallback_reason: "Initial state (before DB merge)"
      };
    });

    if (data && data.length > 0) {
      data.forEach((m) => {
        if (m.key && m.content !== null) {
          modules[m.key] = {
            content: String(m.content),
            source: "database"
          };
        }
      });
    } else {
      // If no data, all stay as fallback with specific reason
      Object.keys(modules).forEach(key => {
        modules[key].fallback_reason = "No modules found in database for workspace";
      });
    }

    modulesCache.set(workspaceId, { value: modules as any, expiresAt: now + CACHE_TTL_MS });
    return modules;
  } catch (err) {
    console.warn("[v3-modules] Error loading modules from DB, using fallback:", err);
    const fallbackModules: Record<string, { content: string; source: "database" | "fallback"; fallback_reason?: string }> = {};
    Object.keys(DEFAULT_MODULES_V3).forEach(key => {
      fallbackModules[key] = {
        content: DEFAULT_MODULES_V3[key],
        source: "fallback",
        fallback_reason: `DB Error: ${err instanceof Error ? err.message : String(err)}`
      };
    });
    return fallbackModules;
  }
}

export function invalidateModulesCache(workspaceId: string) {
  modulesCache.delete(workspaceId);
}
