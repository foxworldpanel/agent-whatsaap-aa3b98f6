import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const temperaturaEnum = z.enum(["quente", "morno", "frio", "cliente", "bloqueado"]);
const statusEnum = z.enum([
  "nao_abordado",
  "abordado_aguardando",
  "em_conversa",
  "proposta_enviada",
  "comprou",
  "perdido",
  "convertido",
  "sem_resposta",
  "bloqueado",
]);

export const listContactGroups = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data: groups, error } = await context.supabase
      .from("contact_groups")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: members, error: mErr } = await context.supabase
      .from("contact_group_members")
      .select("group_id, contact_id");
    if (mErr) throw new Error(mErr.message);
    return { groups: groups ?? [], members: members ?? [] };
  });

export const createContactGroup = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(80), color: z.string().max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contact_groups")
      .insert({ user_id: context.userId, name: data.name, color: data.color ?? null })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteContactGroup = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contact_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignContactsToGroup = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      group_id: z.string().uuid(),
      contact_ids: z.array(z.string().uuid()).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rows = data.contact_ids.map((cid) => ({
      group_id: data.group_id,
      contact_id: cid,
      user_id: context.userId,
    }));
    const { error } = await context.supabase
      .from("contact_group_members")
      .upsert(rows, { onConflict: "group_id,contact_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const removeContactsFromGroup = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      group_id: z.string().uuid(),
      contact_ids: z.array(z.string().uuid()).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contact_group_members")
      .delete()
      .eq("group_id", data.group_id)
      .in("contact_id", data.contact_ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUpdateContacts = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      contact_ids: z.array(z.string().uuid()).min(1).max(2000),
      temperatura: temperaturaEnum.optional(),
      status: statusEnum.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      temperatura?: "quente" | "morno" | "frio" | "cliente" | "bloqueado";
      temperatura_updated_at?: string;
      status?: z.infer<typeof statusEnum>;
    } = {};
    if (data.temperatura) {
      patch.temperatura = data.temperatura;
      patch.temperatura_updated_at = new Date().toISOString();
    }
    if (data.status) patch.status = data.status;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("contacts")
      .update(patch)
      .in("id", data.contact_ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateContactFields = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      instagram: z.string().max(80).nullable().optional(),
      temperatura: temperaturaEnum.optional(),
      status: statusEnum.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      instagram?: string | null;
      temperatura?: "quente" | "morno" | "frio" | "cliente" | "bloqueado";
      temperatura_updated_at?: string;
      status?: z.infer<typeof statusEnum>;
    } = {};
    if (data.instagram !== undefined) patch.instagram = data.instagram;
    if (data.temperatura) {
      patch.temperatura = data.temperatura;
      patch.temperatura_updated_at = new Date().toISOString();
    }
    if (data.status) patch.status = data.status;
    const { error } = await context.supabase.from("contacts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });