import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_EXAMPLES = 50;

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("knowledge_base")
      .select("id, kind, context, content, image_url, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function assertUnderLimit(supabase: any, userId: string) {
  const { count, error } = await supabase
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_EXAMPLES) {
    throw new Error(`Limite de ${MAX_EXAMPLES} exemplos atingido. Remova alguns antes de adicionar novos.`);
  }
}

export const addTextExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      context: z.string().trim().max(500).optional().nullable(),
      content: z.string().trim().min(1).max(8000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUnderLimit(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("knowledge_base")
      .insert({
        user_id: context.userId,
        kind: "text",
        context: data.context ?? null,
        content: data.content,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const addImageExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      context: z.string().trim().max(500).optional().nullable(),
      image_url: z.string().url().max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUnderLimit(context.supabase, context.userId);
    const { extractConversationFromImage } = await import("@/lib/ai.server");
    const content = await extractConversationFromImage(data.image_url);
    const { data: row, error } = await context.supabase
      .from("knowledge_base")
      .insert({
        user_id: context.userId,
        kind: "image",
        context: data.context ?? null,
        image_url: data.image_url,
        content,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("knowledge_base")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });