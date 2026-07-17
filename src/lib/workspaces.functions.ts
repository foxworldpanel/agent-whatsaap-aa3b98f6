import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MIND_WORKSPACE_ID } from "./tenant-config";

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Em modo single-tenant, retornamos apenas o workspace Mind.
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, nome, icone, cor, is_default, created_at")
      .eq("id", MIND_WORKSPACE_ID);
    
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDefaultWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspaces")
      .select("id, nome, icone, cor, is_default")
      .eq("id", MIND_WORKSPACE_ID)
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
    // Apenas o workspace Mind pode ser renomeado
    if (data.id !== MIND_WORKSPACE_ID) throw new Error("Ação não permitida neste workspace.");

    const { error } = await context.supabase
      .from("workspaces")
      .update({ nome: data.nome, icone: data.icone, cor: data.cor })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("Criação de novos workspaces está desativada neste projeto (Modo Single-Tenant).");
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async () => {
    throw new Error("Deleção de workspaces está desativada neste projeto (Modo Single-Tenant).");
  });
