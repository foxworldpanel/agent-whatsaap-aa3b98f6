import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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

// Cria um workspace novo (nunca is_default) e o retorna. Não passa por
// withWorkspaceScope de propósito — na criação ainda não existe workspace
// ativo pra scopear, e o header x-workspace-id não faz sentido aqui.
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      nome: z.string().min(1).max(60),
      icone: z.string().max(4).optional(),
      cor: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspaces")
      .insert({
        user_id: context.userId,
        nome: data.nome,
        icone: data.icone ?? "📱",
        cor: data.cor ?? "blue",
        is_default: false,
      })
      .select("id, nome, icone, cor, is_default")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Bloqueia deleção do workspace default (o dono ficaria sem contexto ativo).
    const { data: row, error: readErr } = await context.supabase
      .from("workspaces")
      .select("is_default")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Workspace não encontrado");
    if (row.is_default) throw new Error("Não é possível deletar o workspace padrão");
    const { error } = await context.supabase
      .from("workspaces")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });