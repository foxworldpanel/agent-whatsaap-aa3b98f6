import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const MAX_SCREENS = 30;

export const listPanelGuide = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("panel_guide")
      .select("id, name, description, image_url, extracted_content, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addPanelScreen = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).optional().nullable(),
      image_url: z.string().url().max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { count, error: cErr } = await context.supabase
      .from("panel_guide")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) >= MAX_SCREENS) {
      throw new Error(`Limite de ${MAX_SCREENS} telas atingido.`);
    }
    const { describePanelScreen } = await import("@/lib/ai.server");
    const extracted_content = await describePanelScreen({
      imageUrl: data.image_url,
      name: data.name,
      description: data.description ?? null,
    });
    const { data: row, error } = await context.supabase
      .from("panel_guide")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        image_url: data.image_url,
        extracted_content,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePanelScreen = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("panel_guide")
      .update({ name: data.name, description: data.description ?? null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePanelScreen = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("panel_guide")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });