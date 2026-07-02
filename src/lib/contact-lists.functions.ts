import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

async function ensureLists(supabase: never, userId: string) {
  const sb = supabase as never as import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
  const { data: existing } = await sb
    .from("contact_lists")
    .select("id, name, origem")
    .eq("user_id", userId);
  const rows = existing ?? [];
  const toInsert: Array<{ user_id: string; name: string; origem: "meta_ads" | "instagram" }> = [];
  if (!rows.some((l) => l.origem === "meta_ads")) toInsert.push({ user_id: userId, name: "Lista A — Meta Ads", origem: "meta_ads" });
  if (!rows.some((l) => l.origem === "instagram")) toInsert.push({ user_id: userId, name: "Lista B — Instagram", origem: "instagram" });
  if (toInsert.length > 0) {
    await sb.from("contact_lists").insert(toInsert);
  }
  const { data } = await sb
    .from("contact_lists")
    .select("id, name, origem")
    .eq("user_id", userId)
    .order("origem", { ascending: true });
  return data ?? [];
}

export const listContactLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const lists = await ensureLists(context.supabase as never, context.userId);
    const out: Array<{
      id: string; name: string; origem: string; total: number;
      contatados: number; respondeu: number; convertido: number;
    }> = [];
    for (const l of lists) {
      const { data: rows } = await context.supabase
        .from("blast_contacts")
        .select("status")
        .eq("user_id", context.userId)
        .eq("contact_list_id", l.id);
      const list = rows ?? [];
      const sent = ["enviado_abertura","enviado_d3","enviado_d7","respondeu","convertido"];
      out.push({
        id: l.id,
        name: l.name,
        origem: l.origem,
        total: list.length,
        contatados: list.filter((r) => sent.includes(r.status as string)).length,
        respondeu: list.filter((r) => r.status === "respondeu" || r.status === "convertido").length,
        convertido: list.filter((r) => r.status === "convertido").length,
      });
    }
    return out;
  });

export const importContactsToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      listId: z.string().uuid(),
      categoriaId: z.string().uuid(),
      rows: z.array(z.object({
        nome: z.string().trim().min(1).max(120),
        telefone: z.string().trim().min(5).max(40),
        instagram: z.string().trim().max(80).optional().default(""),
      })).min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Load list to know origem
    const { data: list } = await context.supabase
      .from("contact_lists")
      .select("id, origem")
      .eq("id", data.listId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!list) throw new Error("Lista não encontrada");

    const { data: cat } = await context.supabase
      .from("contact_categories")
      .select("id")
      .eq("id", data.categoriaId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!cat) throw new Error("Categoria inválida");

    let invalid = 0;
    const normalized = data.rows.map((r) => ({
      nome: r.nome,
      telefone: normalizePhone(r.telefone),
      instagram: (r.instagram ?? "").replace(/^@/, ""),
    })).filter((r) => {
      const ok = r.telefone.length >= 10 && r.telefone.length <= 15;
      if (!ok) invalid++;
      return ok;
    });

    let dupBatch = 0;
    const seen = new Set<string>();
    const uniq = normalized.filter((r) => {
      if (seen.has(r.telefone)) { dupBatch++; return false; }
      seen.add(r.telefone);
      return true;
    });

    let dupGlobal = 0;
    if (uniq.length > 0) {
      // Anti-duplicata GLOBAL: pula apenas se já existe em qualquer lista de disparo.
      // Nao comparar com `contacts` — a base extraida do WhatsApp/Meta é separada
      // do universo de disparo e bloquearia praticamente todos os imports.
      const phones = uniq.map((r) => r.telefone);
      const { data: ex1 } = await context.supabase
        .from("blast_contacts")
        .select("telefone")
        .eq("user_id", context.userId)
        .in("telefone", phones);
      const exSet = new Set<string>((ex1 ?? []).map((r) => r.telefone as string));
      const filtered = uniq.filter((r) => {
        if (exSet.has(r.telefone)) { dupGlobal++; return false; }
        return true;
      });
      uniq.length = 0;
      uniq.push(...filtered);
    }

    if (uniq.length === 0) {
      return { inserted: 0, ignored_existing: dupGlobal + dupBatch, invalid };
    }

    const payload = uniq.map((r) => ({
      user_id: context.userId,
      contact_list_id: data.listId,
      categoria_id: data.categoriaId,
      origem: list.origem,
      nome: r.nome,
      telefone: r.telefone,
      instagram: r.instagram,
      status: "pendente" as const,
    }));
    const { error, count } = await context.supabase
      .from("blast_contacts")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length, ignored_existing: dupGlobal + dupBatch, invalid };
  });

export const clearContactList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ listId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_contacts")
      .delete()
      .eq("user_id", context.userId)
      .eq("contact_list_id", data.listId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportContactList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ listId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("blast_contacts")
      .select("nome, telefone, instagram, status, last_sent_at, replied_at, origem")
      .eq("user_id", context.userId)
      .eq("contact_list_id", data.listId)
      .order("created_at", { ascending: false });
    const header = "nome,telefone,instagram,status,last_sent_at,replied_at,origem";
    const body = (rows ?? []).map((r) =>
      [r.nome, r.telefone, r.instagram, r.status, r.last_sent_at ?? "", r.replied_at ?? "", r.origem ?? ""]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
    ).join("\n");
    return { csv: header + "\n" + body, count: (rows ?? []).length };
  });