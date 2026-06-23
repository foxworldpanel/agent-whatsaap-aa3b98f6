import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAgentConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_config")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_name: z.string().min(1).max(80),
      tone: z.string().min(1).max(120),
      base_instruction: z.string().min(1).max(4000),
      script_frio: z.string().min(1).max(2000),
      script_inativo: z.string().min(1).max(2000),
      script_ativo: z.string().min(1).max(2000),
      panel_link: z.string().max(500).optional().nullable(),
      main_offer: z.string().min(1).max(200),
      audio_enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_config")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("integrations")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      uazapi_url: z.string().max(500).optional().nullable(),
      uazapi_token: z.string().max(500).optional().nullable(),
      uazapi_admin_token: z.string().max(500).optional().nullable(),
      anthropic_api_key: z.string().max(500).optional().nullable(),
      elevenlabs_api_key: z.string().max(500).optional().nullable(),
      elevenlabs_voice_id: z.string().max(200).optional().nullable(),
      openai_api_key: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("integrations")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
