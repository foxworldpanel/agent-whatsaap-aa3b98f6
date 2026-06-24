import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const stepSchema = z
  .object({
    enabled: z.boolean().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
    delay_seconds: z.number().int().min(0).max(180).optional(),
  })
  .partial();

const stepsSchema = z
  .object({
    welcome_text: stepSchema.optional(),
    audio: stepSchema.optional(),
    panel_text: stepSchema.optional(),
    video: stepSchema.optional(),
    services_text: stepSchema.optional(),
  })
  .partial();

export const listWelcomeFunnels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ whatsapp_number_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("welcome_funnels")
      .select("id, name, enabled, delay_seconds, trigger_keywords, steps, sort_order")
      .eq("user_id", context.userId)
      .eq("whatsapp_number_id", data.whatsapp_number_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createWelcomeFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ whatsapp_number_id: z.string().uuid(), name: z.string().min(1).max(80).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("welcome_funnels")
      .insert({
        user_id: context.userId,
        whatsapp_number_id: data.whatsapp_number_id,
        name: data.name ?? "Novo funil",
        enabled: true,
        delay_seconds: 3,
        trigger_keywords: "",
        steps: {
          welcome_text: { enabled: true, text: "Oi! Tudo bem? 😊" },
          audio: { enabled: false, url: "" },
          panel_text: { enabled: false, text: "" },
          video: { enabled: false, url: "" },
          services_text: { enabled: false, text: "" },
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateWelcomeFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        enabled: z.boolean().optional(),
        delay_seconds: z.number().int().min(0).max(180).optional(),
        trigger_keywords: z.string().max(500).optional(),
        steps: stepsSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.delay_seconds !== undefined) patch.delay_seconds = data.delay_seconds;
    if (data.trigger_keywords !== undefined) patch.trigger_keywords = data.trigger_keywords;
    if (data.steps !== undefined) patch.steps = data.steps;
    const { error } = await context.supabase
      .from("welcome_funnels")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWelcomeFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("welcome_funnels")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });