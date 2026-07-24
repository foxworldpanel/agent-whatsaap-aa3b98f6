import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import {
  DEFAULT_AGENT_HUMANIZATION,
  normalizeHumanizationSettings,
} from "../humanization.server";

const schema = z.object({
  enabled: z.boolean(),
  min_response_delay_ms: z.number().int().min(0).max(120000),
  max_response_delay_ms: z.number().int().min(0).max(120000),
  typing_enabled: z.boolean(),
  proportional_to_length: z.boolean(),
  min_part_delay_ms: z.number().int().min(0).max(30000),
  max_part_delay_ms: z.number().int().min(0).max(30000),
  audio_recording_enabled: z.boolean(),
  playground_delay_enabled: z.boolean(),
}).refine((v) => v.max_response_delay_ms >= v.min_response_delay_ms, {
  message: "O atraso máximo deve ser maior ou igual ao mínimo.",
}).refine((v) => v.max_part_delay_ms >= v.min_part_delay_ms, {
  message: "O intervalo máximo entre partes deve ser maior ou igual ao mínimo.",
});

const HUMANIZATION_CONFIG_KEY = "__humanization_settings";

function extractHumanizationFromAgentConfig(row: any) {
  const modules = row?.modules && typeof row.modules === "object" ? row.modules : {};
  const stored = modules[HUMANIZATION_CONFIG_KEY];
  if (stored && typeof stored === "object") {
    return normalizeHumanizationSettings(stored);
  }

  // Compatibilidade com os campos históricos já existentes em agent_config.
  return normalizeHumanizationSettings({
    enabled: true,
    min_response_delay_ms:
      Number.isFinite(Number(row?.response_delay_min_sec))
        ? Number(row.response_delay_min_sec) * 1000
        : DEFAULT_AGENT_HUMANIZATION.min_response_delay_ms,
    max_response_delay_ms:
      Number.isFinite(Number(row?.response_delay_max_sec))
        ? Number(row.response_delay_max_sec) * 1000
        : DEFAULT_AGENT_HUMANIZATION.max_response_delay_ms,
    typing_enabled:
      typeof row?.typing_indicator_enabled === "boolean"
        ? row.typing_indicator_enabled
        : DEFAULT_AGENT_HUMANIZATION.typing_enabled,
  });
}

export const getAgentHumanizationSettings = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, userId, workspaceId } = context;

    const { data, error } = await (supabase as any)
      .from("agent_config")
      .select("modules, response_delay_min_sec, response_delay_max_sec, typing_indicator_enabled")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) throw error;
    return extractHumanizationFromAgentConfig(data);
  });

export const updateAgentHumanizationSettings = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    const normalized = normalizeHumanizationSettings(data);

    // Lê o JSON atual para não sobrescrever nenhum dado legado de modules.
    const { data: current, error: readError } = await (supabase as any)
      .from("agent_config")
      .select("modules")
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (readError) throw readError;

    const currentModules =
      current?.modules && typeof current.modules === "object"
        ? current.modules
        : {};

    const mergedModules = {
      ...currentModules,
      [HUMANIZATION_CONFIG_KEY]: normalized,
    };

    const { error } = await (supabase as any)
      .from("agent_config")
      .upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          modules: mergedModules,
          // Mantém os campos antigos sincronizados para compatibilidade.
          response_delay_min_sec: Math.round(normalized.min_response_delay_ms / 1000),
          response_delay_max_sec: Math.round(normalized.max_response_delay_ms / 1000),
          typing_indicator_enabled: normalized.typing_enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,workspace_id" },
      );

    if (error) throw error;
    return { ok: true, settings: normalized };
  });
