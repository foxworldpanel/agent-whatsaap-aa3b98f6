import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdentitySchema = z.object({
  persona: z.string().optional().nullable(),
  regra_emoji: z.string().optional().nullable(),
  regra_split: z.string().optional().nullable(),
  terminologia_redes: z.string().optional().nullable(),
  regra_teste_gratis: z.string().optional().nullable(),
  regra_anti_invencao: z.string().optional().nullable(),
  exemplo_disparo: z.string().optional().nullable(),
  reconhecimento_interesse: z.string().optional().nullable(),
  regra_encerramento: z.string().optional().nullable(),
});

export const getAgentIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { DEFAULT_IDENTITY, mergeIdentity } = await import("@/lib/agent-identity.server");
    const { data, error } = await context.supabase
      .from("agent_identity")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const effective = mergeIdentity(data as never);
    return {
      defaults: DEFAULT_IDENTITY,
      stored: (data ?? null) as Record<string, string | null> | null,
      effective,
    };
  });

export const updateAgentIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdentitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { invalidateAgentIdentityCache } = await import("@/lib/agent-identity.server");
    const payload: Record<string, string | null> = { user_id: context.userId };
    for (const [k, v] of Object.entries(data)) {
      // string vazia = restaurar padrão (grava NULL)
      payload[k] = typeof v === "string" && v.trim().length > 0 ? v : null;
    }
    const { error } = await context.supabase
      .from("agent_identity")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    invalidateAgentIdentityCache(context.userId);
    return { ok: true };
  });