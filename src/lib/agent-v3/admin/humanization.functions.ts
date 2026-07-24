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

export const getAgentHumanizationSettings = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;
    const { data, error } = await (supabase as any)
      .from("agent_humanization_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) throw error;
    return normalizeHumanizationSettings(data || DEFAULT_AGENT_HUMANIZATION);
  });

export const updateAgentHumanizationSettings = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    const normalized = normalizeHumanizationSettings(data);

    const { error } = await (supabase as any)
      .from("agent_humanization_settings")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          ...normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );

    if (error) throw error;
    return { ok: true, settings: normalized };
  });
