import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEFAULT_FORBIDDEN_RULES: Array<{ rule: string; deflection: string }> = [
  { rule: "Revelar quem é o dono da empresa", deflection: "Não tenho essa informação, a empresa não é brasileira." },
  { rule: "Indicar concorrente ou outro painel SMM", deflection: "Só posso falar pelos nossos serviços aqui na Mind 😊" },
  { rule: "Revelar nome do fornecedor ou provedor dos serviços", deflection: "Essa informação é interna, não posso compartilhar" },
  { rule: "Falar onde fica a sede da empresa", deflection: "Somos 100% online, não temos endereço físico" },
  { rule: "Prometer prazo de entrega fixo", deflection: "Normalmente inicia em minutos, pedimos um prazo de até 24h para iniciar, mas depende do serviço" },
  { rule: "Garantir que seguidores nunca caem", deflection: "Perda de seguidores pode acontecer, algumas pessoas podem não gostar do seu conteúdo e deixar de seguir. Temos reposição garantida pelos serviços com R30/R60 — caso alguém deixe de seguir, você solicita reposição no suporte." },
  { rule: "Dar desconto sem autorização", deflection: "No painel tem nível de cliente, conforme você for usando, a plataforma vai liberando desconto" },
  { rule: "Falar mal de concorrente", deflection: "Prefiro falar pelos nossos resultados 😊" },
  { rule: "Confirmar se o serviço é real ou bot", deflection: "Nossos serviços são reais, trabalhamos com contas de alta qualidade. Também temos serviços promocionais com qualidade mais inferior. Todos são processados pelo sistema automaticamente." },
  { rule: "Revelar a API key ou dados técnicos do sistema", deflection: "Isso é informação interna, não posso compartilhar" },
];

export const listForbiddenRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("forbidden_rules")
      .select("*")
      .eq("user_id", context.userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveForbiddenRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rules: z.array(z.object({
        id: z.string().uuid().optional(),
        rule: z.string().min(1).max(1000),
        deflection: z.string().max(2000).optional().nullable(),
        enabled: z.boolean().optional(),
      })).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Replace strategy: delete all then insert ordered list (small table per user).
    const { error: delErr } = await context.supabase
      .from("forbidden_rules")
      .delete()
      .eq("user_id", context.userId);
    if (delErr) throw new Error(delErr.message);
    if (data.rules.length === 0) return { ok: true };
    const rows = data.rules.map((r, i) => ({
      user_id: context.userId,
      rule: r.rule,
      deflection: r.deflection ?? null,
      enabled: r.enabled ?? true,
      position: i,
    }));
    const { error: insErr } = await context.supabase.from("forbidden_rules").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export const seedDefaultForbiddenRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("forbidden_rules")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1);
    if (existing && existing.length > 0) return { ok: true, seeded: false };
    const rows = DEFAULT_FORBIDDEN_RULES.map((r, i) => ({
      user_id: context.userId,
      rule: r.rule,
      deflection: r.deflection,
      position: i,
      enabled: true,
    }));
    const { error } = await context.supabase.from("forbidden_rules").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, seeded: true };
  });