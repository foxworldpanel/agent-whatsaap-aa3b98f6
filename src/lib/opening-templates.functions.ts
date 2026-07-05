import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_DDI_LANGUAGE_MAP,
  EN_DEFAULT,
  ES_DEFAULT,
  type OpeningTemplates,
  type LangTemplates,
  type Language,
} from "@/lib/blast-variations";

type Row = {
  saudacoes_manha: string[] | null;
  saudacoes_tarde: string[] | null;
  saudacoes_noite: string[] | null;
  linha2: string[] | null;
  perguntas: string[] | null;
  templates_en: LangTemplates | null;
  templates_es: LangTemplates | null;
  ddi_language_map: Record<string, Language> | null;
};

function toTemplates(row: Row | null): OpeningTemplates {
  const nonEmpty = (a: string[] | null | undefined, fb: string[]) =>
    a && a.length ? a : fb;
  const mergeLang = (r: LangTemplates | null | undefined, fb: LangTemplates): LangTemplates => ({
    saudacoes: {
      manha: nonEmpty(r?.saudacoes?.manha, fb.saudacoes.manha),
      tarde: nonEmpty(r?.saudacoes?.tarde, fb.saudacoes.tarde),
      noite: nonEmpty(r?.saudacoes?.noite, fb.saudacoes.noite),
    },
    linha2: nonEmpty(r?.linha2, fb.linha2),
    perguntas: nonEmpty(r?.perguntas, fb.perguntas),
  });
  return {
    saudacoes: {
      manha: nonEmpty(row?.saudacoes_manha, DEFAULT_TEMPLATES.saudacoes.manha),
      tarde: nonEmpty(row?.saudacoes_tarde, DEFAULT_TEMPLATES.saudacoes.tarde),
      noite: nonEmpty(row?.saudacoes_noite, DEFAULT_TEMPLATES.saudacoes.noite),
    },
    linha2: nonEmpty(row?.linha2, DEFAULT_TEMPLATES.linha2),
    perguntas: nonEmpty(row?.perguntas, DEFAULT_TEMPLATES.perguntas),
    en: mergeLang(row?.templates_en ?? null, EN_DEFAULT),
    es: mergeLang(row?.templates_es ?? null, ES_DEFAULT),
    ddiMap:
      row?.ddi_language_map && Object.keys(row.ddi_language_map).length
        ? row.ddi_language_map
        : DEFAULT_DDI_LANGUAGE_MAP,
  };
}

export const getOpeningTemplates = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("opening_templates")
      .select(
        "saudacoes_manha, saudacoes_tarde, saudacoes_noite, linha2, perguntas, templates_en, templates_es, ddi_language_map",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    return toTemplates(data as Row | null);
  });

export const saveOpeningTemplates = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: OpeningTemplates) => d)
  .handler(async ({ data, context }) => {
    const clean = (a: string[]) =>
      (a ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
    const cleanLang = (l: LangTemplates | undefined | null): LangTemplates | null => {
      if (!l) return null;
      return {
        saudacoes: {
          manha: clean(l.saudacoes?.manha ?? []),
          tarde: clean(l.saudacoes?.tarde ?? []),
          noite: clean(l.saudacoes?.noite ?? []),
        },
        linha2: clean(l.linha2 ?? []),
        perguntas: clean(l.perguntas ?? []),
      };
    };
    const payload = {
      user_id: context.userId,
      saudacoes_manha: clean(data.saudacoes?.manha ?? []),
      saudacoes_tarde: clean(data.saudacoes?.tarde ?? []),
      saudacoes_noite: clean(data.saudacoes?.noite ?? []),
      linha2: clean(data.linha2 ?? []),
      perguntas: clean(data.perguntas ?? []),
      templates_en: cleanLang(data.en) as unknown as never,
      templates_es: cleanLang(data.es) as unknown as never,
      ddi_language_map: (data.ddiMap ?? DEFAULT_DDI_LANGUAGE_MAP) as unknown as never,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("opening_templates")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export { toTemplates as _toTemplates };
