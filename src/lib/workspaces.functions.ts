import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, nome, icone, cor, is_default, created_at")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDefaultWorkspace = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, nome, icone, cor, is_default")
      .eq("is_default", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const renameWorkspace = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      nome: z.string().min(1).max(60),
      icone: z.string().max(4).optional(),
      cor: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspaces")
      .update({ nome: data.nome, icone: data.icone, cor: data.cor })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });