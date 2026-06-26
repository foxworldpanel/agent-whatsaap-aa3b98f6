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
      base_instruction: z.string().min(1).max(20000),
      script_frio: z.string().min(1).max(2000),
      script_inativo: z.string().min(1).max(2000),
      script_ativo: z.string().min(1).max(2000),
      panel_link: z.string().max(500).optional().nullable(),
      main_offer: z.string().min(1).max(200),
      audio_enabled: z.boolean(),
      agent_enabled: z.boolean().optional(),
      response_delay_min_sec: z.number().int().min(0).max(600).optional(),
      response_delay_max_sec: z.number().int().min(0).max(600).optional(),
      typing_indicator_enabled: z.boolean().optional(),
      company_info: z.object({
        name: z.string().max(200),
        type: z.string().max(500),
        services: z.string().max(1000),
        platforms: z.string().max(500),
        catalog_link: z.string().max(500),
        panel_link: z.string().max(500),
        payments: z.string().max(500),
      }).optional(),
      how_it_works: z.string().max(20000).optional(),
      never_offer_first: z.boolean().optional(),
      send_panel_on_price: z.boolean().optional(),
      faqs: z.array(z.object({
        q: z.string().min(1).max(500),
        a: z.string().min(1).max(2000),
      })).max(100).optional(),
      services_realtime: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_config")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Toggle global agent on/off (sidebar switch)
export const setAgentGlobalEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_config")
      .update({ agent_enabled: data.enabled })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Toggle agent on/off for a single conversation
export const setConversationAgentEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversations")
      .update({ agent_enabled: data.enabled })
      .eq("id", data.conversationId)
      .eq("user_id", context.userId);
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
      smm_api_key: z.string().max(500).optional().nullable(),
      smm_service_id: z.string().max(50).optional().nullable(),
      smm_panel_url: z.string().max(500).optional().nullable(),
      free_trial_enabled: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("integrations")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: integ, error } = await context.supabase
      .from("integrations")
      .select("elevenlabs_api_key, elevenlabs_voice_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!integ?.elevenlabs_api_key || !integ.elevenlabs_voice_id) {
      throw new Error("Configure a API Key e o Voice ID do ElevenLabs antes.");
    }
    const { ttsElevenLabsBase64 } = await import("@/lib/ai.server");
    const audio = await ttsElevenLabsBase64({
      apiKey: integ.elevenlabs_api_key,
      voiceId: integ.elevenlabs_voice_id,
      text: data.text ?? "Oi! Aqui é a sua agente vendedora. Tudo certo com a voz?",
    });
    return { audio };
  });
