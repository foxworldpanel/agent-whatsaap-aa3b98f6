import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { fetchAllSupabaseRows } from "@/lib/supabase-pagination";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

const profileEnum = z.enum(["ativo", "frio", "inativo"]);
const statusEnum = z.enum(["nao_abordado", "em_conversa", "convertido", "sem_resposta", "bloqueado"]);

export const listContacts = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const baseRows = await fetchAllSupabaseRows<{ telefone: string | null; created_at: string | null }>((from, to) =>
      context.supabase
        .from("blast_contacts")
        .select("telefone, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    const phones = Array.from(new Set(baseRows.map((r) => r.telefone).filter(Boolean) as string[]));
    if (phones.length === 0) return [];

    const rows: ContactRow[] = [];
    for (let i = 0; i < phones.length; i += 500) {
      const chunk = phones.slice(i, i + 500);
      const { data, error } = await context.supabase
        .from("contacts")
        .select("*")
        .eq("user_id", context.userId)
        .in("telefone", chunk);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as ContactRow[]));
    }

    const byPhone = new Map<string, ContactRow>();
    for (const row of rows) {
      if (row.telefone) byPhone.set(row.telefone, row);
    }
    return phones.map((phone) => byPhone.get(phone)).filter((row): row is ContactRow => Boolean(row));
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
