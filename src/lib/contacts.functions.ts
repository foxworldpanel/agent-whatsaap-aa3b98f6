import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const profileEnum = z.enum(["ativo", "frio", "inativo"]);
const statusEnum = z.enum(["nao_abordado", "em_conversa", "convertido", "sem_resposta", "bloqueado"]);

export const listContacts = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    // TEMP DEBUG
    console.log("[DEBUG listContacts] context.workspaceId:", context.workspaceId);
    console.log("[DEBUG listContacts] context.userId:", context.userId);
    try {
      const { data: effective, error: rpcErr } = await context.supabase.rpc("current_workspace_id" as never);
      console.log("[DEBUG listContacts] pg current_workspace_id():", effective, "err:", rpcErr?.message);
    } catch (e) {
      console.log("[DEBUG listContacts] rpc threw:", (e as Error).message);
    }
    const { data, error } = await context.supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    console.log("[DEBUG listContacts] rows returned:", data?.length ?? 0, "err:", error?.message);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createContact = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      nome: z.string().min(1).max(120),
      telefone: z.string().min(5).max(40),
      perfil: profileEnum,
      status: statusEnum.default("nao_abordado"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contacts").insert({
      user_id: context.userId,
      nome: data.nome,
      telefone: data.telefone,
      perfil: data.perfil,
      status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importContacts = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(z.object({
        nome: z.string().min(1),
        telefone: z.string().min(5),
        perfil: profileEnum.default("frio"),
      })).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({
      user_id: context.userId,
      nome: r.nome,
      telefone: r.telefone,
      perfil: r.perfil,
      status: "nao_abordado" as const,
    }));
    const { error, count } = await context.supabase
      .from("contacts")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
