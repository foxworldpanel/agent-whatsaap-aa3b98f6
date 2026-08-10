import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const MAX_EXAMPLES = 50;

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("knowledge_base")
      .select("id, kind, context, content, image_url, created_at")
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function assertUnderLimit(supabase: any, userId: string, workspaceId: string) {
  const { count, error } = await supabase
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_EXAMPLES) {
    throw new Error(`Limite de ${MAX_EXAMPLES} exemplos atingido. Remova alguns antes de adicionar novos.`);
  }
}

export const addTextExample = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      context: z.string().trim().max(500).optional().nullable(),
      content: z.string().trim().min(1).max(8000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUnderLimit(context.supabase, context.userId, context.workspaceId);
    const { data: row, error } = await context.supabase
      .from("knowledge_base")
      .insert({
        user_id: context.userId,
        workspace_id: context.workspaceId,
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
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      context: z.string().trim().max(500).optional().nullable(),
      image_url: z.string().url().max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertUnderLimit(context.supabase, context.userId, context.workspaceId);
    // Extração automática via ai.server removida
    const content = "Conteúdo de imagem (processamento desativado)";
    const { data: row, error } = await context.supabase
      .from("knowledge_base")
      .insert({
        user_id: context.userId,
        workspace_id: context.workspaceId,
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
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("knowledge_base")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });