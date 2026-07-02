import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_TEMPLATES, type OpeningTemplates } from "@/lib/blast-variations";

type Row = {
  saudacoes_manha: string[] | null;
  saudacoes_tarde: string[] | null;
  saudacoes_noite: string[] | null;
  linha2: string[] | null;
  perguntas: string[] | null;
};

function toTemplates(row: Row | null): OpeningTemplates {
  const nonEmpty = (a: string[] | null | undefined, fb: string[]) =>
    a && a.length ? a : fb;
  return {
    saudacoes: {
      manha: nonEmpty(row?.saudacoes_manha, DEFAULT_TEMPLATES.saudacoes.manha),
      tarde: nonEmpty(row?.saudacoes_tarde, DEFAULT_TEMPLATES.saudacoes.tarde),
      noite: nonEmpty(row?.saudacoes_noite, DEFAULT_TEMPLATES.saudacoes.noite),
    },
    linha2: nonEmpty(row?.linha2, DEFAULT_TEMPLATES.linha2),
    perguntas: nonEmpty(row?.perguntas, DEFAULT_TEMPLATES.perguntas),
  };
}

export const getOpeningTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("opening_templates")
      .select("saudacoes_manha, saudacoes_tarde, saudacoes_noite, linha2, perguntas")
      .eq("user_id", context.userId)
      .maybeSingle();
    return toTemplates(data as Row | null);
  });

export const saveOpeningTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: OpeningTemplates) => d)
  .handler(async ({ data, context }) => {
    const clean = (a: string[]) =>
      (a ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
    const payload = {
      user_id: context.userId,
      saudacoes_manha: clean(data.saudacoes?.manha ?? []),
      saudacoes_tarde: clean(data.saudacoes?.tarde ?? []),
      saudacoes_noite: clean(data.saudacoes?.noite ?? []),
      linha2: clean(data.linha2 ?? []),
      perguntas: clean(data.perguntas ?? []),
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("opening_templates")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export async function loadTemplatesForUser(userId: string): Promise<OpeningTemplates> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("opening_templates")
    .select("saudacoes_manha, saudacoes_tarde, saudacoes_noite, linha2, perguntas")
    .eq("user_id", userId)
    .maybeSingle();
  return toTemplates(data as Row | null);
}
