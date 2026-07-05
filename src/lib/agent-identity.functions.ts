import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";


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
  regra_estilo_escrita: z.string().optional().nullable(),
});

export const getAgentIdentity = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { DEFAULT_IDENTITY, mergeIdentity } = await import("@/lib/agent-identity.server");
    const { data, error } = await context.supabase
      .from("agent_identity")
      .select("*")
      .eq("user_id", context.userId)
      .eq("workspace_id", workspaceId)
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
  .middleware([withWorkspaceScope])
  .inputValidator((input: unknown) => IdentitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { invalidateAgentIdentityCache } = await import("@/lib/agent-identity.server");
    const clean = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : null);
    const row = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      persona: clean(data.persona),
      regra_emoji: clean(data.regra_emoji),
      regra_split: clean(data.regra_split),
      terminologia_redes: clean(data.terminologia_redes),
      regra_teste_gratis: clean(data.regra_teste_gratis),
      regra_anti_invencao: clean(data.regra_anti_invencao),
      exemplo_disparo: clean(data.exemplo_disparo),
      reconhecimento_interesse: clean(data.reconhecimento_interesse),
      regra_encerramento: clean(data.regra_encerramento),
      regra_estilo_escrita: clean(data.regra_estilo_escrita),
    };
    const { error } = await context.supabase
      .from("agent_identity")
      .upsert(row, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    invalidateAgentIdentityCache(context.userId);
    return { ok: true };
  });