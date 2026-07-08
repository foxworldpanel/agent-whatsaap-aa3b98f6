import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

const SaveSchema = z.object({
  promo_text: z.string().max(2000).default(""),
  active: z.boolean().default(false),
  expires_at: z.string().nullable().optional(),
});

export type DailyPromoRow = {
  promo_text: string;
  active: boolean;
  expires_at: string | null;
  updated_at: string | null;
};

export const getDailyPromo = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_daily_promo")
      .select("promo_text, active, expires_at, updated_at")
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DailyPromoRow | null) ?? {
      promo_text: "",
      active: false,
      expires_at: null,
      updated_at: null,
    };
  });

export const saveDailyPromo = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      promo_text: data.promo_text.trim(),
      active: data.active,
      expires_at:
        data.expires_at && data.expires_at.trim().length > 0
          ? data.expires_at
          : null,
    };
    const { error } = await context.supabase
      .from("agent_daily_promo")
      .upsert(row, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    const { invalidateDailyPromoCache } = await import(
      "@/lib/agent-daily-promo.server"
    );
    invalidateDailyPromoCache(context.userId);
    return { ok: true };
  });
