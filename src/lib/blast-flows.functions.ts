import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const FlowSchema = z.object({
  campaignId: z.string().uuid(),
  nodes: z.array(z.record(z.string(), z.any())),
  edges: z.array(z.record(z.string(), z.any())),
  name: z.string().optional(),
});

export const getBlastFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) =>
    z.object({ campaignId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> };
          };
        };
      };
    })
      .from("blast_flows")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as { id: string; name: string; nodes: Json[]; edges: Json[] } | null;
  });

export const saveBlastFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FlowSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      campaign_id: data.campaignId,
      name: data.name ?? "Fluxo padrão",
      nodes: data.nodes,
      edges: data.edges,
    };
    const { error } = await (context.supabase as never as {
      from: (t: string) => {
        upsert: (p: unknown, o: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("blast_flows")
      .upsert(payload, { onConflict: "campaign_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });